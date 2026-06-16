const Order = require("./order.model");
const OrderItem = require("../orderItem/orderItem.model");
const Queue = require("../queue/queue.model");
const Food = require("../food/food.model");
const MenuScheduleItem = require("../menuScheduleItem/menuScheduleItem.model");
const Cart = require("../cart/cart.model");
const CartItem = require("../cartItem/cartItem.model");
const { getPagination } = require("../../utils/pagination.util");
const {
  generateTransferContent,
  generateQrCodeUrl,
  getSepayConfig,
} = require("../payment/payment.service");

const PAYMENT_EXPIRY_MINUTES = 15;

/**
 * Generate order code: 6-digit numeric string (e.g., 234199)
 */
const generateOrderCode = async () => {
  let code;
  let exists = true;
  while (exists) {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    exists = await Order.findOne({ orderCode: code });
  }
  return code;
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
      populate: { path: "foodId" },
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
  const orderCode = await generateOrderCode();
  const transferContent = generateTransferContent(orderCode);

  // Generate payment info
  const sepayConfig = getSepayConfig();
  const qrCodeUrl = generateQrCodeUrl(totalPrice, transferContent);
  const expiresAt = new Date(Date.now() + PAYMENT_EXPIRY_MINUTES * 60 * 1000);

  // Create order
  const order = await Order.create({
    userId,
    createdBy: userId,
    orderCode,
    status: "PENDING",
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

  // Create queue entry
  const queueCount = await Queue.countDocuments();
  await Queue.create({
    orderId: order._id,
    queueNumber: queueCount + 1,
    status: "WAITING",
  });

  // Clear user's cart
  await CartItem.deleteMany({ cartId: cart._id });

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
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    transactionRef: order.transactionRef,
  };
};

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.userId) filter.userId = query.userId;
  if (query.isActive !== undefined) filter.isActive = query.isActive === "true";
  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;
  if (query.keyword)
    filter.$or = [
      { name: new RegExp(query.keyword, "i") },
      { title: new RegExp(query.keyword, "i") },
      { email: new RegExp(query.keyword, "i") },
      { fullName: new RegExp(query.keyword, "i") },
    ];

  const [items, total] = await Promise.all([
    Order.find(filter)
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
    if (["PREPARING", "READY", "COMPLETED", "CANCELLED"].includes(currentStatus)) {
      const error = new Error(`Cannot cancel order. Current status is ${order.status}.`);
      error.statusCode = 400;
      throw error;
    }


    // Initiate refund if already paid
    if (order.paymentStatus === "PAID") {
      order.paymentStatus = "REFUND_PENDING";
    }

    order.status = "CANCELLED";
    await order.save();

    // Update associated Queue status to CANCELLED
    await Queue.updateOne({ orderId: id }, { $set: { status: "CANCELLED" } });

    // Restore stock/servings
    if (order.items && Array.isArray(order.items)) {
      for (const item of order.items) {
        if (item.itemType === "MENU_ITEM" && item.menuScheduleItemId) {
          const menuScheduleItem = await MenuScheduleItem.findById(item.menuScheduleItemId);
          if (menuScheduleItem) {
            menuScheduleItem.remainingCount += item.quantity;
            menuScheduleItem.reservedCount = Math.max(0, menuScheduleItem.reservedCount - item.quantity);
            await menuScheduleItem.save();
          }
        } else if (item.itemType === "REGULAR_FOOD" && item.foodId) {
          const food = await Food.findById(item.foodId);
          if (food && food.stockQuantity !== null) {
            food.stockQuantity += item.quantity;
            await food.save();
          }
        }
      }
    }

    return getById(id);
  }

  return Order.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};
const deleteById = (id) => Order.findByIdAndDelete(id);

module.exports = { checkout, list, getById, updateById, deleteById, getPaymentStatus };
