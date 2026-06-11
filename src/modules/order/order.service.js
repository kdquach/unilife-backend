const Order = require("./order.model");
const OrderItem = require("../orderItem/orderItem.model");
const Queue = require("../queue/queue.model");
const Food = require("../food/food.model");
const MenuScheduleItem = require("../menuScheduleItem/menuScheduleItem.model");
const { getPagination } = require("../../utils/pagination.util");

const create = async (data) => {
  const { items, paymentMethod, ...orderData } = data;

  // Validate and deduct stock for each item first
  if (items && Array.isArray(items)) {
    for (const item of items) {
      if (item.itemType === "MENU_ITEM" || !item.itemType) {
        if (!item.menuScheduleItemId) {
          const error = new Error("Menu schedule item ID is required for menu items.");
          error.statusCode = 400;
          throw error;
        }
        const menuScheduleItem = await MenuScheduleItem.findById(item.menuScheduleItemId);
        if (!menuScheduleItem) {
          const error = new Error("Menu schedule item not found.");
          error.statusCode = 404;
          throw error;
        }
        if (menuScheduleItem.remainingCount < item.quantity) {
          const error = new Error(`Insufficient servings remaining for menu item.`);
          error.statusCode = 400;
          throw error;
        }
        // Deduct remainingCount and add to reservedCount
        menuScheduleItem.remainingCount -= item.quantity;
        menuScheduleItem.reservedCount += item.quantity;
        await menuScheduleItem.save();
      } else if (item.itemType === "REGULAR_FOOD") {
        if (!item.foodId) {
          const error = new Error("Food ID is required for regular food items.");
          error.statusCode = 400;
          throw error;
        }
        const food = await Food.findById(item.foodId);
        if (!food) {
          const error = new Error("Food item not found.");
          error.statusCode = 404;
          throw error;
        }
        if (food.stockQuantity !== null && food.stockQuantity < item.quantity) {
          const error = new Error(`Insufficient stock for food item ${food.name}.`);
          error.statusCode = 400;
          throw error;
        }
        // Deduct from stockQuantity
        if (food.stockQuantity !== null) {
          food.stockQuantity -= item.quantity;
          await food.save();
        }
      }
    }
  }

  // Generate order code
  const count = await Order.countDocuments();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const orderCode = `UL-PO-${dateStr}-${String(count + 1).padStart(4, "0")}`;

  // Create the order document
  const order = new Order({
    ...orderData,
    orderCode,
    status: "PENDING",
    paymentMethod: paymentMethod || "SEPAY",
    paymentStatus: "PENDING",
    totalPrice: 0, // Will calculate below
  });

  await order.save();

  let totalPrice = 0;
  const createdItems = [];

  if (items && Array.isArray(items)) {
    for (const item of items) {
      const subtotal = (item.unitPrice || 0) * (item.quantity || 0);
      totalPrice += subtotal;

      const orderItem = new OrderItem({
        orderId: order._id,
        itemType: item.itemType || "MENU_ITEM",
        menuScheduleItemId: item.menuScheduleItemId || undefined,
        foodId: item.foodId || undefined,
        quantity: item.quantity || 0,
        unitPrice: item.unitPrice || 0,
        subtotal,
      });

      await orderItem.save();
      createdItems.push(orderItem);
    }
  }

  // Update order's total price
  order.totalPrice = totalPrice;
  await order.save();

  // Create a queue entry for the order
  const queueCount = await Queue.countDocuments();
  const queue = new Queue({
    orderId: order._id,
    queueNumber: queueCount + 1,
    status: "WAITING",
  });
  await queue.save();

  // Retrieve populated order
  return getById(order._id);
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

    // PAID order timeframe check (5 minutes = 300,000 ms)
    if (currentStatus === "PAID") {
      const timeDiff = Date.now() - new Date(order.createdAt).getTime();
      if (timeDiff > 5 * 60 * 1000) {
        const error = new Error("Cannot cancel order after preparation has started (5 minutes limit exceeded).");
        error.statusCode = 400;
        throw error;
      }
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

module.exports = { create, list, getById, updateById, deleteById };
