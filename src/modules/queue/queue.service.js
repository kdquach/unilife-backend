const Queue = require("./queue.model");
const Order = require("../order/order.model");
const { getPagination } = require("../../utils/pagination.util");

const ACTIVE_QUEUE_STATUSES = ["WAITING", "CALLED", "PREPARING", "READY"];

const create = (data) => Queue.create(data);

const toArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const buildDateFilter = (query) => {
  if (!query.fromDate && !query.toDate) return null;

  const createdAt = {};
  if (query.fromDate) createdAt.$gte = new Date(query.fromDate);
  if (query.toDate) createdAt.$lte = new Date(query.toDate);
  return createdAt;
};

const populateQueueOrder = (query) =>
  query.populate({
    path: "orderId",
    select:
      "orderCode status totalPrice paymentMethod paymentStatus isWalkIn note paidAt createdAt userId createdBy",
    populate: [
      { path: "userId", select: "fullName email phone avatarUrl" },
      { path: "createdBy", select: "fullName email phone role" },
      {
        path: "items",
        populate: [
          {
            path: "menuScheduleItemId",
            populate: { path: "foodId", select: "name imageUrl price" },
          },
          { path: "foodId", select: "name imageUrl price" },
        ],
      },
    ],
  });

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.orderId) filter.orderId = query.orderId;
  if (query.fromDate || query.toDate) filter.createdAt = buildDateFilter(query);
  if (query.keyword) {
    const orders = await Order.find({
      orderCode: new RegExp(query.keyword, "i"),
    }).select("_id");
    filter.orderId = { $in: orders.map((order) => order._id) };
  }

  const [items, total] = await Promise.all([
    populateQueueOrder(Queue.find(filter))
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Queue.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getMonitorQueue = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const queueFilter = {};
  const orderFilter = {};

  const statuses = toArray(query.status || query.statuses);
  queueFilter.status = {
    $in: statuses.length > 0 ? statuses : ACTIVE_QUEUE_STATUSES,
  };

  if (query.orderId) orderFilter._id = query.orderId;
  if (query.fromDate || query.toDate) {
    queueFilter.createdAt = buildDateFilter(query);
  }

  if (query.paymentStatus === "ALL") {
    // Intentionally include every payment status.
  } else {
    orderFilter.paymentStatus = query.paymentStatus || "PAID";
  }

  if (query.orderStatus) {
    orderFilter.status = { $in: toArray(query.orderStatus) };
  }
  if (query.isWalkIn !== undefined) {
    orderFilter.isWalkIn = query.isWalkIn === "true" || query.isWalkIn === true;
  }
  if (query.keyword) {
    orderFilter.orderCode = new RegExp(query.keyword, "i");
  }

  const matchingOrders = await Order.find(orderFilter).select("_id");
  const matchingOrderIds = matchingOrders.map((order) => order._id);
  queueFilter.orderId = { $in: matchingOrderIds };

  const [items, total, statusCounts] = await Promise.all([
    populateQueueOrder(Queue.find(queueFilter))
      .skip(skip)
      .limit(limit)
      .sort({ queueNumber: 1, createdAt: 1 }),
    Queue.countDocuments(queueFilter),
    Queue.aggregate([
      { $match: queueFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const summary = {
    total,
    waiting: 0,
    called: 0,
    preparing: 0,
    ready: 0,
    completed: 0,
    cancelled: 0,
    byStatus: {},
  };

  for (const item of statusCounts) {
    const status = String(item._id || "").toUpperCase();
    summary.byStatus[status] = item.count;
    const key = status.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(summary, key)) {
      summary[key] = item.count;
    }
  }

  return {
    items,
    summary,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) => populateQueueOrder(Queue.findById(id));
const updateById = (id, data) =>
  Queue.findByIdAndUpdate(id, data, { new: true, runValidators: true });
const deleteById = (id) => Queue.findByIdAndDelete(id);

module.exports = {
  create,
  list,
  getMonitorQueue,
  getById,
  updateById,
  deleteById,
};
