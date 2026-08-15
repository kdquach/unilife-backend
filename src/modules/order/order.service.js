const Order = require("./order.model");
const OrderItem = require("../orderItem/orderItem.model");
const Queue = require("../queue/queue.model");
const Food = require("../food/food.model");
const MenuScheduleItem = require("../menuScheduleItem/menuScheduleItem.model");
const Cart = require("../cart/cart.model");
const CartItem = require("../cartItem/cartItem.model");
const queueService = require("../queue/queue.service");
const userNotificationService = require("../userNotification/userNotification.service");
const mongoose = require("mongoose");
const { getPagination } = require("../../utils/pagination.util");
const {
  generateTransferContent,
  generateQrCodeUrl,
  getSepayConfig,
} = require("../payment/payment.service");
const User = require("../user/user.model");
const { isSameVietnamDay, getCurrentVietnamTimestamp, getCurrentVietnamTime } = require("../../utils/date.util");

const PAYMENT_EXPIRY_MINUTES = 15;

/**
 * Check and expire orders with pending payment that have passed their expiry time
 * This should be called periodically (e.g., every minute) to clean up expired orders
 */
const checkExpiredOrders = async () => {
  const now = new Date(getCurrentVietnamTimestamp());
  
  // Find all PENDING_PAYMENT orders that have expired
  const expiredOrders = await Order.find({
    status: "PENDING_PAYMENT",
    expiresAt: { $lt: now },
  });

  if (expiredOrders.length === 0) {
    return { processed: 0, details: [] };
  }

  const processedDetails = [];

  // Process each expired order
  for (const order of expiredOrders) {
    try {
      // Restore stock for menu items
      const orderItems = await OrderItem.find({ orderId: order._id });
      
      for (const item of orderItems) {
        if (item.menuScheduleItemId) {
          await MenuScheduleItem.findByIdAndUpdate(
            item.menuScheduleItemId,
            {
              $inc: {
                remainingCount: item.quantity,
                reservedCount: -item.quantity,
              },
            }
          );
        } else if (item.foodId) {
          // Restore stock for regular food items
          const food = await Food.findById(item.foodId);
          if (food && food.stockQuantity !== null) {
            await Food.findByIdAndUpdate(
              item.foodId,
              {
                $inc: {
                  stockQuantity: item.quantity,
                },
              }
            );
          }
        }
      }

      // Update order status to CANCELLED
      await Order.findByIdAndUpdate(order._id, {
        status: "CANCELLED",
        paymentStatus: "EXPIRED",
        note: (order.note || "") + " [EXPIRED] Payment timeout - order automatically cancelled",
      });

      processedDetails.push({
        orderId: order._id,
        orderCode: order.orderCode,
        status: "CANCELLED",
        reason: "Payment timeout",
      });
    } catch (error) {
      console.error(`Error processing expired order ${order._id}:`, error);
      processedDetails.push({
        orderId: order._id,
        orderCode: order.orderCode,
        status: "ERROR",
        error: error.message,
      });
    }
  }

  return {
    processed: expiredOrders.length,
    details: processedDetails,
  };
};

// Order code format: UL{TYPE}{DATE}{SEQUENCE}{CHECKSUM}
// Example: ULON1508260012
// UL = Unilife
// TYPE = ON (Online) or WI (Walk-in)
// DATE = DDMMYY
// SEQUENCE = 3-digit sequential number for the day
// CHECKSUM = single digit for validation
const generateOrderCode = async (orderType = "ON") => {
  const now = getCurrentVietnamTime();
  const dateStr = now
    .toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    })
    .replace(/\//g, '');

  // Get today's sequence number
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const count = await Order.countDocuments({
    createdAt: { $gte: todayStart, $lte: todayEnd },
    isWalkIn: orderType === "WI"
  });

  const sequence = (count + 1).toString().padStart(3, '0');

  // Calculate checksum (simple sum of digits mod 10)
  const calculateChecksum = (str) => {
    const digits = str.replace(/\D/g, '').split('').map(Number);
    const sum = digits.reduce((acc, digit) => acc + digit, 0);
    return sum % 10;
  };

  const prefix = `UNI${orderType}${dateStr}${sequence}`;
  const checksum = calculateChecksum(prefix);
  const orderCode = `${prefix}${checksum}`;

  return orderCode;
};

const create = async (data) => {
  const { items, paymentMethod, ...orderData } = data;
  const session = await mongoose.startSession();
  let createdOrder = null;

  try {
    await session.withTransaction(async () => {
      // Validate và trừ stock
      if (items && Array.isArray(items)) {
        for (const item of items) {
          if (item.itemType === "MENU_ITEM" || !item.itemType) {
            if (!item.menuScheduleItemId) {
              const error = new Error(
                "Menu schedule item ID is required for menu items."
              );
              error.statusCode = 400;
              throw error;
            }

            const menuScheduleItem = await MenuScheduleItem.findOneAndUpdate(
              {
                _id: item.menuScheduleItemId,
                remainingCount: { $gte: item.quantity },
              },
              {
                $inc: {
                  remainingCount: -item.quantity,
                  reservedCount: item.quantity,
                },
              },
              { new: true, session }
            );

            if (!menuScheduleItem) {
              const error = new Error(
                "Insufficient servings remaining for menu item."
              );
              error.statusCode = 400;
              throw error;
            }
          } else if (item.itemType === "REGULAR_FOOD") {
            if (!item.foodId) {
              const error = new Error(
                "Food ID is required for regular food items."
              );
              error.statusCode = 400;
              throw error;
            }

            const food = await Food.findById(item.foodId).session(session);

            if (!food) {
              const error = new Error("Food item not found.");
              error.statusCode = 404;
              throw error;
            }

            if (food.stockQuantity !== null) {
              const result = await Food.findOneAndUpdate(
                {
                  _id: food._id,
                  stockQuantity: { $gte: item.quantity },
                },
                {
                  $inc: {
                    stockQuantity: -item.quantity,
                  },
                },
                { new: true, session }
              );

              if (!result) {
                const error = new Error(
                  `Insufficient stock for food item ${food.name}.`
                );
                error.statusCode = 400;
                throw error;
              }
            }
          }
        }
      }

      const orderCode = await generateOrderCode("WI");

      const isCash = paymentMethod === "CASH";

      const [order] = await Order.create(
        [
          {
            ...orderData,
            orderCode,
            status: isCash ? "CONFIRMED" : "PENDING_PAYMENT",
            paymentMethod: paymentMethod || "SEPAY",
            paymentStatus: isCash ? "PAID" : "PENDING",
            paidAt: isCash ? new Date() : null,
            transferContent: isCash
              ? undefined
              : orderData.transferContent,
            totalPrice: 0,
          },
        ],
        { session }
      );

      let totalPrice = 0;

      if (items && Array.isArray(items)) {
        for (const item of items) {
          let unitPrice = 0;

          if (item.itemType === "REGULAR_FOOD") {
            const food = await Food.findById(item.foodId).session(session);
            unitPrice = food.price;
          } else {
            const menuScheduleItem = await MenuScheduleItem.findById(
              item.menuScheduleItemId
            )
              .populate("foodId")
              .session(session);

            unitPrice = menuScheduleItem.foodId.price;
          }

          const subtotal = unitPrice * item.quantity;
          totalPrice += subtotal;

          await OrderItem.create(
            [
              {
                orderId: order._id,
                itemType: item.itemType || "MENU_ITEM",
                menuScheduleItemId: item.menuScheduleItemId || undefined,
                foodId: item.foodId || undefined,
                quantity: item.quantity,
                unitPrice,
                subtotal,
              },
            ],
            { session }
          );
        }
      }

      order.totalPrice = totalPrice;

      if (!isCash) {
        const sepayConfig = getSepayConfig();
        const transferContent = generateTransferContent(order.orderCode);

        order.transferContent = transferContent;
        order.expiresAt = new Date(
          getCurrentVietnamTimestamp() + PAYMENT_EXPIRY_MINUTES * 60 * 1000
        );
        order.paymentInfo = {
          bankName: sepayConfig.bankName,
          accountNumber: sepayConfig.bankAccountNumber,
          accountName: sepayConfig.accountName,
          qrCodeUrl: generateQrCodeUrl(totalPrice, transferContent),
        };
      }

      await order.save({ session });

      createdOrder = order;
    });
  } finally {
    await session.endSession();
  }

  return getById(createdOrder._id);
};

/**
 * Checkout: Create order from user's cart with SePay payment
 * Uses atomic MongoDB operations for stock deduction
 */
const checkout = async (userId, data = {}) => {
  // Get user's cart
  const cart = await Cart.findOne({ userId }).lean();
  if (!cart) {
    const error = new Error("Cart not found");
    error.statusCode = 404;
    throw error;
  }

  // Get cart items with populated data
  const cartItems = await CartItem.find({ cartId: cart._id })
    .populate({
      path: "menuScheduleItemId",
      populate: [
        { path: "foodId" },
        { path: "menuScheduleId", select: "date status" },
      ],
    })
    .populate("foodId");

  if (cartItems.length === 0) {
    const error = new Error("Cart is empty");
    error.statusCode = 400;
    throw error;
  }

  // Prepare order items and atomically deduct stock
  const orderItemsData = [];
  const stockRollbacks = []; // Track successful deductions for rollback on failure
  let totalPrice = 0;

  try {
    for (const cartItem of cartItems) {
      if (cartItem.menuScheduleItemId) {
        // Menu schedule item - atomic stock deduction
        const menuItem = cartItem.menuScheduleItemId;
        const food = menuItem.foodId;

        if (!menuItem.isActive || !food) {
          throw Object.assign(new Error(`Menu item is not available`), {
            statusCode: 400,
          });
        }
        if (
          !menuItem.menuScheduleId ||
          menuItem.menuScheduleId.status !== "PUBLISHED" ||
          !isSameVietnamDay(menuItem.menuScheduleId.date, getCurrentVietnamTime())
        ) {
          throw Object.assign(
            new Error(`Only today's menu items can be checked out`),
            { statusCode: 400 },
          );
        }

        const result = await MenuScheduleItem.findOneAndUpdate(
          {
            _id: menuItem._id,
            remainingCount: { $gte: cartItem.quantity },
          },
          {
            $inc: {
              remainingCount: -cartItem.quantity,
              reservedCount: cartItem.quantity,
            },
          },
          { new: true },
        );

        if (!result) {
          throw Object.assign(
            new Error(
              `Insufficient stock for "${food.name}". Please update your cart.`,
            ),
            { statusCode: 400 },
          );
        }

        // Track for rollback
        stockRollbacks.push({
          type: "MENU_ITEM",
          id: menuItem._id,
          quantity: cartItem.quantity,
        });

        const unitPrice = food.price;
        const subtotal = unitPrice * cartItem.quantity;
        totalPrice += subtotal;

        orderItemsData.push({
          itemType: "MENU_ITEM",
          menuScheduleItemId: menuItem._id,
          foodId: food._id,
          quantity: cartItem.quantity,
          unitPrice,
          subtotal,
        });
      } else if (cartItem.foodId) {
        // Regular food item - atomic stock deduction
        const food = cartItem.foodId;

        if (!food.isActive) {
          throw Object.assign(
            new Error(`Food "${food.name}" is not available`),
            { statusCode: 400 },
          );
        }

        if (food.stockQuantity !== null) {
          const result = await Food.findOneAndUpdate(
            {
              _id: food._id,
              stockQuantity: { $gte: cartItem.quantity },
            },
            { $inc: { stockQuantity: -cartItem.quantity } },
            { new: true },
          );

          if (!result) {
            throw Object.assign(
              new Error(
                `Insufficient stock for "${food.name}". Please update your cart.`,
              ),
              { statusCode: 400 },
            );
          }
        }

        // Track for rollback
        stockRollbacks.push({
          type: "REGULAR_FOOD",
          id: food._id,
          quantity: cartItem.quantity,
          hasStock: food.stockQuantity !== null,
        });

        const unitPrice = food.price;
        const subtotal = unitPrice * cartItem.quantity;
        totalPrice += subtotal;

        orderItemsData.push({
          itemType: "REGULAR_FOOD",
          foodId: food._id,
          quantity: cartItem.quantity,
          unitPrice,
          subtotal,
        });
      }
    }
  } catch (err) {
    // Rollback all successful stock deductions
    for (const rollback of stockRollbacks) {
      if (rollback.type === "MENU_ITEM") {
        await MenuScheduleItem.findByIdAndUpdate(rollback.id, {
          $inc: {
            remainingCount: rollback.quantity,
            reservedCount: -rollback.quantity,
          },
        });
      } else if (rollback.type === "REGULAR_FOOD" && rollback.hasStock) {
        await Food.findByIdAndUpdate(rollback.id, {
          $inc: { stockQuantity: rollback.quantity },
        });
      }
    }
    throw err;
  }

  // Generate order code and transfer content
  const orderCode = await generateOrderCode("ON");
  const transferContent = generateTransferContent(orderCode);

  // Generate payment info
  const sepayConfig = getSepayConfig();
  const qrCodeUrl = generateQrCodeUrl(totalPrice, transferContent);
  const expiresAt = new Date(getCurrentVietnamTimestamp() + PAYMENT_EXPIRY_MINUTES * 60 * 1000);

  // Create order
  const order = await Order.create({
    userId,
    createdBy: userId,
    orderCode,
    status: "PENDING_PAYMENT",
    totalPrice,
    note: data.note || null,
    paymentMethod: "SEPAY",
    paymentStatus: "PENDING",
    isWalkIn: false,
    transferContent,
    paymentInfo: {
      bankName: sepayConfig.bankName,
      accountNumber: sepayConfig.bankAccountNumber,
      accountName: sepayConfig.accountName,
      qrCodeUrl,
    },
    expiresAt,
  });

  // Create order items
  for (const itemData of orderItemsData) {
    await OrderItem.create({
      orderId: order._id,
      ...itemData,
    });
  }

  // Clear user's cart
  await CartItem.deleteMany({ cartId: cart._id });

  await userNotificationService
    .notifyUser(userId, {
      title: "Order created",
      body: `Order #${order.orderCode} has been created. Please complete your payment.`,
      type: "ORDER_CREATED",
      createdBy: userId,
    })
    .catch(() => null);

  // Return populated order
  return getById(order._id);
};

/**
 * Get payment status for an order
 */
const getPaymentStatus = async (orderId, userId) => {
  const order = await Order.findById(orderId);
  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  // Check if the order belongs to the user (unless admin/staff)
  if (userId && order.userId && order.userId.toString() !== userId.toString()) {
    const error = new Error("Permission denied");
    error.statusCode = 403;
    throw error;
  }

  return {
    orderId: order._id,
    orderCode: order.orderCode,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    totalPrice: order.totalPrice,
    transferContent: order.transferContent,
    paymentInfo: order.paymentInfo,
    note: order.note,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    transactionRef: order.transactionRef,
    pickupQrPayload: order.pickupQrPayload,
  };
};

const scanPickupQr = async (data = {}) => {
  let orderCode = data.orderCode;
  if (!orderCode && data.qrPayload) {
    try {
      const parsed =
        typeof data.qrPayload === "string"
          ? JSON.parse(data.qrPayload)
          : data.qrPayload;
      orderCode = parsed.orderCode;
    } catch (err) {
      // ignore
    }
  }

  if (!orderCode) {
    const error = new Error("Order code is required.");
    error.statusCode = 400;
    throw error;
  }

  const result = await queueService.scanOrderQr({ orderCode });

  return {
    created: result.created,
    order: result.queue.orderId,
    queue: result.queue,
  };
};

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.userId) filter.userId = query.userId;
  if (query.status) filter.status = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;

  if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;

  if (query.isWalkIn !== undefined) filter.isWalkIn = query.isWalkIn === "true";

  if (query.fromDate || query.toDate) {
  filter.createdAt = {};

  if (query.fromDate)
    filter.createdAt.$gte = new Date(query.fromDate);

  if (query.toDate)
    filter.createdAt.$lte = new Date(query.toDate);
}

  if (query.keyword) {
  const users = await User.find({
    $or: [
      { fullName: new RegExp(query.keyword, "i") },
      { email: new RegExp(query.keyword, "i") },
      { phone: new RegExp(query.keyword, "i") },
    ],
  }).select("_id");

  filter.$or = [
    { orderCode: new RegExp(query.keyword, "i") },
    { userId: { $in: users.map((u) => u._id) } },
  ];
}

  const [items, total] = await Promise.all([
    Order.find(filter)
      .populate("userId", "fullName email phone avatarUrl")
      .populate("queue")
      .populate({
        path: "items",
        populate: [
          {
            path: "menuScheduleItemId",
            populate: {
              path: "foodId",
            },
          },
          {
            path: "foodId",
          },
        ],
      })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Order.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) =>
  Order.findById(id)
    .populate("queue")
    .populate({
      path: "items",
      populate: [
        {
          path: "menuScheduleItemId",
          populate: {
            path: "foodId",
          },
        },
        {
          path: "foodId",
        },
      ],
    });
const updateById = async (id, data) => {
  if (data.status === "CANCELLED") {
    const order = await Order.findById(id).populate("items");
    if (!order) {
      const error = new Error("Order not found.");
      error.statusCode = 404;
      throw error;
    }

    const currentStatus = order.status.toUpperCase();
    if (
      ["COMPLETED", "CANCELLED", "EXPIRED"].includes(currentStatus)
    ) {
      const error = new Error(
        `Cannot cancel order. Current status is ${order.status}.`,
      );
      error.statusCode = 400;
      throw error;
    }

    // Atomic CAS: prevent double-cancel race condition
    const cancelUpdate = { status: "CANCELLED" };
    if (order.paymentStatus === "PAID") {
      cancelUpdate.paymentStatus = "REFUND_PENDING";
    }

    const cancelledOrder = await Order.findOneAndUpdate(
      {
        _id: id,
        status: { $nin: ["COMPLETED", "CANCELLED", "EXPIRED"] },
      },
      { $set: cancelUpdate },
      { new: true, runValidators: true }
    ).populate("items");

    if (!cancelledOrder) {
      const error = new Error(
        "Order was already cancelled or completed by another request.",
      );
      error.statusCode = 409;
      throw error;
    }

    if (cancelledOrder.userId) {
      await userNotificationService
        .notifyUser(cancelledOrder.userId, {
          title: "Order cancelled",
          body: `Order #${cancelledOrder.orderCode} has been cancelled.`,
          type: "ORDER_CANCELLED",
          createdBy: cancelledOrder.userId,
        })
        .catch(() => null);
    }

    // Move any kitchen queue entry out of the active flow.
    await Queue.updateOne({ orderId: id }, { $set: { status: "SKIPPED" } });

    // Restore stock/servings atomically
    if (cancelledOrder.items && Array.isArray(cancelledOrder.items)) {
      for (const item of cancelledOrder.items) {
        if (item.itemType === "MENU_ITEM" && item.menuScheduleItemId) {
          await MenuScheduleItem.findByIdAndUpdate(item.menuScheduleItemId, {
            $inc: {
              remainingCount: item.quantity,
              reservedCount: -item.quantity,
            },
          });
        } else if (item.itemType === "REGULAR_FOOD" && item.foodId) {
          await Food.findOneAndUpdate(
            { _id: item.foodId, stockQuantity: { $ne: null } },
            { $inc: { stockQuantity: item.quantity } }
          );
        }
      }
    }

    return getById(id);
  }

  return Order.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};
const deleteById = (id) => Order.findByIdAndDelete(id);

const createWalkIn = async (data) => {
  data.isWalkIn = true;
  data.userId = null;

  return create(data);
};

module.exports = {
  create,
  createWalkIn,
  checkout,
  list,
  getById,
  updateById,
  deleteById,
  getPaymentStatus,
  scanPickupQr,
  checkExpiredOrders,
};
