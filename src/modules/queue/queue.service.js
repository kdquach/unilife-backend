const Queue = require("./queue.model");
const Order = require("../order/order.model");
const userNotificationService = require("../userNotification/userNotification.service");
const { getPagination } = require("../../utils/pagination.util");
const { getVietnamDayRange } = require("../../utils/date.util");

const ACTIVE_QUEUE_STATUSES = ["WAITING", "SERVING"];
const INVALID_SCAN_ORDER_STATUSES = ["CANCELLED", "EXPIRED", "COMPLETED"];

const create = (data) => Queue.create(data);

const toArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const getDayRange = (date = new Date()) => getVietnamDayRange(date);

const buildDateFilter = (query = {}) => {
  if (query.fromDate || query.toDate) {
    const createdAt = {};
    if (query.fromDate) createdAt.$gte = new Date(query.fromDate);
    if (query.toDate) createdAt.$lte = new Date(query.toDate);
    return createdAt;
  }

  const { start, end } = getDayRange();
  return { $gte: start, $lte: end };
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

const getPopulatedById = (id) => populateQueueOrder(Queue.findById(id));

const getNextQueueNumber = async (scannedAt = new Date()) => {
  const { start, end } = getDayRange(scannedAt);
  const latest = await Queue.findOne({
    scannedAt: { $gte: start, $lte: end },
  }).sort({ queueNumber: -1 });

  return (latest?.queueNumber || 0) + 1;
};

const parseQrPayload = (value) => {
  if (!value || typeof value !== "string") return {};

  const raw = value.trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        orderId: parsed.orderId || parsed._id || parsed.id,
        orderCode: parsed.orderCode || parsed.code,
        transferContent: parsed.transferContent,
      };
    }
  } catch (error) {
    // Continue with URL/raw parsing.
  }

  try {
    const url = new URL(raw);
    return {
      orderId:
        url.searchParams.get("orderId") ||
        url.searchParams.get("_id") ||
        url.searchParams.get("id"),
      orderCode:
        url.searchParams.get("orderCode") ||
        url.searchParams.get("code") ||
        url.searchParams.get("order_code"),
      transferContent: url.searchParams.get("transferContent"),
    };
  } catch (error) {
    // Continue with raw parsing.
  }

  return { orderCode: raw, transferContent: raw };
};

const findOrderForScan = async ({ orderId, orderCode, qrPayload, qrCode }) => {
  const parsedPayload = parseQrPayload(qrPayload || qrCode);
  const resolvedOrderId = orderId || parsedPayload.orderId;
  const resolvedOrderCode = orderCode || parsedPayload.orderCode;
  const transferContent = parsedPayload.transferContent;

  if (resolvedOrderId) return Order.findById(resolvedOrderId);

  const code = resolvedOrderCode || transferContent;
  if (!code) {
    const error = new Error("Order ID, order code or QR payload is required");
    error.statusCode = 400;
    throw error;
  }

  return Order.findOne({
    $or: [
      { orderCode: code },
      { transferContent: code },
      ...(transferContent ? [{ transferContent }] : []),
    ],
  });
};

const validateOrderCanEnterQueue = (order) => {
  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  if (INVALID_SCAN_ORDER_STATUSES.includes(order.status)) {
    const error = new Error(`Cannot scan order with status ${order.status}`);
    error.statusCode = 400;
    throw error;
  }

  const isPaid = order.paymentStatus === "PAID";
  const isAcceptedOrderStatus = ["PAID", "CONFIRMED"].includes(order.status);
  if (!isPaid || !isAcceptedOrderStatus) {
    const error = new Error("Only paid or confirmed orders can enter kitchen queue");
    error.statusCode = 400;
    throw error;
  }
};

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};

  if (query.status) filter.status = query.status;
  if (query.orderId) filter.orderId = query.orderId;
  filter.scannedAt = buildDateFilter(query);

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
      .sort({ scannedAt: -1, createdAt: -1 }),
    Queue.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const promoteNextWaitingQueue = async (query = {}) => {
  const now = new Date();
  const nextQueue = await Queue.findOneAndUpdate(
    {
      status: "WAITING",
      scannedAt: buildDateFilter(query),
    },
    {
      $set: {
        status: "SERVING",
        servedAt: now,
      },
    },
    {
      new: true,
      sort: { queueNumber: 1, scannedAt: 1, createdAt: 1 },
      runValidators: true,
    },
  );

  if (!nextQueue) return null;

  await Order.findByIdAndUpdate(
    nextQueue.orderId,
    { $set: { status: "CONFIRMED" } },
    { runValidators: true },
  );

  return getPopulatedById(nextQueue._id);
};

const ensureCurrentServingQueue = async (query = {}) => {
  const dateFilter = buildDateFilter(query);
  const currentServing = await populateQueueOrder(
    Queue.findOne({
      status: "SERVING",
      scannedAt: dateFilter,
    }).sort({ servedAt: 1, queueNumber: 1 }),
  );

  if (currentServing) return currentServing;

  return promoteNextWaitingQueue(query);
};

const getCurrentServingQueue = (query = {}) =>
  populateQueueOrder(
    Queue.findOne({
      status: "SERVING",
      scannedAt: buildDateFilter(query),
    }).sort({ servedAt: 1, queueNumber: 1 }),
  );

const scanOrderQr = async (payload = {}) => {
  const order = await findOrderForScan(payload);
  validateOrderCanEnterQueue(order);

  const existingQueueDoc = await Queue.findOne({ orderId: order._id }).select(
    "_id",
  );
  const existingQueue = existingQueueDoc
    ? await getPopulatedById(existingQueueDoc._id)
    : null;
  if (existingQueue) {
    return { queue: existingQueue, created: false };
  }

  const scannedAt = new Date();
  const queue = await Queue.create({
    orderId: order._id,
    queueNumber: await getNextQueueNumber(scannedAt),
    status: "WAITING",
    scannedAt,
  });

  if (order.status === "PAID") {
    order.status = "CONFIRMED";
    await order.save();
  }

  return { queue: await getPopulatedById(queue._id), created: true };
};

const getMonitorQueue = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const dateFilter = buildDateFilter(query);
  const orderFilter = {};
  const queueFilter = { scannedAt: dateFilter };

  const statuses = toArray(query.status || query.statuses);
  queueFilter.status = {
    $in: statuses.length > 0 ? statuses : ACTIVE_QUEUE_STATUSES,
  };

  if (query.orderId) orderFilter._id = query.orderId;
  if (query.paymentStatus && query.paymentStatus !== "ALL") {
    orderFilter.paymentStatus = query.paymentStatus;
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

  if (Object.keys(orderFilter).length > 0) {
    const matchingOrders = await Order.find(orderFilter).select("_id");
    queueFilter.orderId = { $in: matchingOrders.map((order) => order._id) };
  }

  const shouldAutoPromote = !query.status && !query.statuses;
  const currentServing = shouldAutoPromote
    ? await ensureCurrentServingQueue(query)
    : await populateQueueOrder(
        Queue.findOne({
          ...queueFilter,
          status: "SERVING",
        }).sort({ servedAt: 1, queueNumber: 1 }),
      );

  const waitingFilter = { ...queueFilter, status: "WAITING" };
  const [waiting, waitingTotal, statusCounts] = await Promise.all([
    populateQueueOrder(Queue.find(waitingFilter))
      .skip(skip)
      .limit(limit)
      .sort({ queueNumber: 1, scannedAt: 1, createdAt: 1 }),
    Queue.countDocuments(waitingFilter),
    Queue.aggregate([
      { $match: { scannedAt: dateFilter } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const summary = {
    total: 0,
    waiting: 0,
    serving: 0,
    done: 0,
    skipped: 0,
    byStatus: {},
  };

  for (const item of statusCounts) {
    const status = String(item._id || "").toUpperCase();
    summary.byStatus[status] = item.count;
    const key = status.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(summary, key)) {
      summary[key] = item.count;
      summary.total += item.count;
    }
  }

  return {
    currentServing,
    waiting,
    items: [currentServing, ...waiting].filter(Boolean),
    summary,
    pagination: {
      page,
      limit,
      total: waitingTotal,
      totalPages: Math.ceil(waitingTotal / limit),
    },
  };
};

const callNextNumber = async () => {
  const currentServing = await getCurrentServingQueue();

  if (!currentServing) {
    const error = new Error("No serving queue item available");
    error.statusCode = 404;
    throw error;
  }

  const now = new Date();
  const completedQueue = await Queue.findByIdAndUpdate(
    currentServing._id,
    {
      $set: {
        status: "DONE",
        doneAt: now,
      },
    },
    { new: true, runValidators: true },
  );

  const completedOrder = await Order.findByIdAndUpdate(
    completedQueue.orderId,
    { $set: { status: "COMPLETED" } },
    { new: true, runValidators: true },
  );

  if (completedOrder?.userId) {
    await userNotificationService
      .notifyUser(completedOrder.userId, {
        title: "Food is ready",
        body: `Order #${completedOrder.orderCode} has been prepared. Please pick up your food.`,
        type: "ORDER_READY",
        createdBy: completedOrder.userId,
      })
      .catch(() => null);
  }

  const nextServing = await promoteNextWaitingQueue();
  const monitor = await getMonitorQueue();

  return {
    completedQueue: await getPopulatedById(completedQueue._id),
    currentServing: nextServing,
    waiting: monitor.waiting,
    summary: monitor.summary,
  };
};

const getById = (id) => getPopulatedById(id);
const updateById = (id, data) =>
  Queue.findByIdAndUpdate(id, data, { new: true, runValidators: true });
const deleteById = (id) => Queue.findByIdAndDelete(id);

module.exports = {
  create,
  list,
  scanOrderQr,
  getMonitorQueue,
  callNextNumber,
  getById,
  updateById,
  deleteById,
};
