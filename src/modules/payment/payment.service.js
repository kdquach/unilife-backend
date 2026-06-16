const Order = require("../order/order.model");
const OrderItem = require("../orderItem/orderItem.model");
const MenuScheduleItem = require("../menuScheduleItem/menuScheduleItem.model");
const Food = require("../food/food.model");
const Queue = require("../queue/queue.model");
const logger = require("../../utils/logger");

/**
 * SePay configuration from environment variables
 */
const getSepayConfig = () => ({
  apiKey: process.env.SEPAY_API_KEY,
  webhookSecret: process.env.SEPAY_WEBHOOK_SECRET,
  bankAccountNumber: process.env.SEPAY_BANK_ACCOUNT_NUMBER,
  bankName: process.env.SEPAY_BANK_NAME,
  accountName: process.env.SEPAY_ACCOUNT_NAME,
});

/**
 * Generate SePay QR code URL
 * @param {number} amount - Payment amount
 * @param {string} transferContent - Unique transfer content
 * @returns {string} QR code image URL
 */
const generateQrCodeUrl = (amount, transferContent) => {
  const config = getSepayConfig();
  const params = new URLSearchParams({
    bank: config.bankName,
    acc: config.bankAccountNumber,
    template: "compact",
    amount: amount.toString(),
    des: transferContent,
    accountName: config.accountName,
  });
  return `https://qr.sepay.vn/img?${params.toString()}`;
};

/**
 * Generate unique transfer content for an order
 * @param {string} orderCode - Order code (e.g., 234199)
 * @returns {string} Transfer content (e.g., UN234199)
 */
const generateTransferContent = (orderCode) => {
  return `UN${orderCode}`;
};

/**
 * Verify SePay webhook authorization
 * @param {string} authHeader - Authorization header value
 * @returns {boolean} Whether the auth is valid
 */
const verifyWebhookAuth = (authHeader) => {
  if (!authHeader) return false;
  const config = getSepayConfig();
  // SePay sends API key in Authorization header
  // Support both "Bearer <key>" and "Apikey <key>" formats
  const token = authHeader.replace(/^(Bearer|Apikey)\s+/i, "");
  return token === config.apiKey;
};

/**
 * Process SePay webhook notification
 * @param {Object} webhookData - Webhook payload from SePay
 * @returns {Object} Processing result
 */
const processWebhook = async (webhookData) => {
  const {
    content,
    transferAmount,
    transferType,
    referenceCode,
    id: transactionId,
  } = webhookData;

  // Only process incoming transfers
  if (transferType && transferType !== "in") {
    return { success: true, message: "Ignored outgoing transfer" };
  }

  if (!content) {
    return { success: true, message: "No transfer content provided" };
  }

  let order = null;

  // 1. Try finding by extracted code from SePay payload if available
  if (webhookData.code) {
    order = await Order.findOne({ 
      $or: [
        { transferContent: webhookData.code.toUpperCase() },
        { orderCode: webhookData.code }
      ]
    });
  }

  // 2. Try regex match on content for UN pattern
  if (!order && content) {
    const match = content.match(/UN([a-zA-Z0-9-]+)/i);
    if (match) {
      const extractedCode = `UN${match[1]}`.toUpperCase();
      order = await Order.findOne({ transferContent: extractedCode });
    }
  }

  if (!order) {
    return { success: true, message: "Order not found for this transfer" };
  }

  // Idempotent: if already paid, skip
  if (order.paymentStatus === "PAID") {
    return { success: true, message: "Order already paid" };
  }

  // If order is expired or cancelled, it's a late payment! (Lỗi đứng tiền)
  if (order.status === "CANCELLED" || order.paymentStatus === "EXPIRED") {
    const lateMsg = `CRITICAL ERROR: Payment received for cancelled order (Received: ${transferAmount}, Ref: ${referenceCode || String(transactionId || "")})`;
    await Order.updateOne(
      { _id: order._id },
      { 
        $set: { 
          paymentStatus: "LATE_PAYMENT",
          note: order.note ? `${order.note} | ${lateMsg}` : lateMsg
        } 
      }
    );
    return { success: true, message: "Late payment recorded for cancelled order." };
  }

  // Verify transfer amount EXACTLY matches order total (Strict rule from user)
  if (transferAmount !== order.totalPrice) {
    const noteMsg = `Error: Invalid payment amount (Received: ${transferAmount}, Expected: ${order.totalPrice}). Order not confirmed.`;
    await Order.updateOne(
      { _id: order._id },
      { $set: { note: order.note ? `${order.note} | ${noteMsg}` : noteMsg } }
    );
    return { success: true, message: "Payment amount mismatch. Order not confirmed." };
  }

  // ATOMIC UPDATE to avoid race condition with expirePendingOrders
  const updatedOrder = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: "PENDING", status: { $nin: ["CANCELLED"] } },
    { 
      $set: { 
        paymentStatus: "PAID", 
        status: "CONFIRMED", 
        paidAt: new Date(), 
        transactionRef: referenceCode || String(transactionId || "") 
      } 
    },
    { new: true }
  );

  if (!updatedOrder) {
    // It means the order was updated concurrently (likely CANCELLED by cron)
    const lateMsg = `CRITICAL ERROR: Payment received but order was just cancelled due to expiration (Received: ${transferAmount}, Ref: ${referenceCode || String(transactionId || "")})`;
    await Order.updateOne(
      { _id: order._id },
      { 
        $set: { 
          paymentStatus: "LATE_PAYMENT",
          note: order.note ? `${order.note} | ${lateMsg}` : lateMsg
        } 
      }
    );
    return { success: true, message: "Late payment recorded due to concurrent expiration." };
  }

  return { success: true, message: "Payment confirmed successfully" };
};

/**
 * Expire pending orders that have passed their expiration time
 * Restores stock atomically for each expired order
 * @returns {Object} Result with count of expired orders
 */
const expirePendingOrders = async () => {
  const now = new Date();

  // Find all pending orders that have expired
  const expiredOrders = await Order.find({
    paymentStatus: "PENDING",
    expiresAt: { $lte: now },
    status: { $nin: ["CANCELLED"] },
  });

  let expiredCount = 0;

  for (const order of expiredOrders) {
    // Lock and mark EXPIRED atomically to avoid race condition with incoming webhook
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, paymentStatus: "PENDING", status: { $nin: ["CANCELLED"] } },
      { $set: { paymentStatus: "EXPIRED", status: "CANCELLED" } },
      { new: true }
    );

    // Only restore stock if we successfully updated it (meaning it wasn't paid concurrently)
    if (updated) {
      // Get order items to restore stock
      const orderItems = await OrderItem.find({ orderId: order._id });

      // Restore stock atomically for each item
      for (const item of orderItems) {
        if (item.itemType === "MENU_ITEM" && item.menuScheduleItemId) {
          await MenuScheduleItem.findByIdAndUpdate(item.menuScheduleItemId, {
            $inc: { remainingCount: item.quantity, reservedCount: -item.quantity },
          });
        } else if (item.itemType === "REGULAR_FOOD" && item.foodId) {
          await Food.findByIdAndUpdate(item.foodId, {
            $inc: { stockQuantity: item.quantity },
          });
        }
      }

      // Cancel queue entry
      await Queue.findOneAndUpdate(
        { orderId: order._id },
        { $set: { status: "CANCELLED" } },
      );

      expiredCount++;
    }
  }

  return { success: true, expiredCount };
};

module.exports = {
  getSepayConfig,
  generateQrCodeUrl,
  generateTransferContent,
  verifyWebhookAuth,
  processWebhook,
  expirePendingOrders,
};
