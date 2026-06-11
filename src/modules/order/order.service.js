const Order = require("./order.model");
const OrderItem = require("../orderItem/orderItem.model");
const Queue = require("../queue/queue.model");
const { getPagination } = require("../../utils/pagination.util");

const create = async (data) => {
  const { items, paymentMethod, ...orderData } = data;

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
const updateById = (id, data) =>
  Order.findByIdAndUpdate(id, data, { new: true, runValidators: true });
const deleteById = (id) => Order.findByIdAndDelete(id);

module.exports = { create, list, getById, updateById, deleteById };
