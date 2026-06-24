const UserNotification = require("./userNotification.model");
const Notification = require("../notification/notification.model");
require("../user/user.model");
const { emitToUser } = require("../../socket");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => UserNotification.create(data);

const escapeRegExp = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const populateNotification = (query) =>
  query.populate({
    path: "notificationId",
    select: "title body type createdBy createdAt",
    populate: { path: "createdBy", select: "fullName email role" },
  });

const getMatchedNotificationIds = async (query = {}) => {
  const filter = {};
  const keyword = (query.keyword || query.q || query.search || "").trim();

  if (query.type) filter.type = query.type;
  if (keyword) {
    const regex = new RegExp(escapeRegExp(keyword), "i");
    filter.$or = [{ title: regex }, { body: regex }];
  }

  if (!Object.keys(filter).length) return null;

  return Notification.find(filter).distinct("_id");
};

const getLoginWelcome = (user) => ({
  title: "Dang nhap thanh cong",
  message: `Chao mung ban, ten: ${user.fullName}`,
  user: {
    userId: user._id,
    fullName: user.fullName,
    email: user.email,
  },
});

const notifyUser = async (userId, { title, body, type, createdBy = null }) => {
  if (!userId) return null;

  const notification = await Notification.create({
    title,
    body,
    type,
    createdBy: createdBy || userId,
  });

  const userNotification = await UserNotification.create({
    userId,
    notificationId: notification._id,
    isRead: false,
    readAt: null,
  });

  const populated = await populateNotification(
    UserNotification.findById(userNotification._id),
  );

  emitToUser(userId, "notification:new", populated);

  return populated;
};

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
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
    UserNotification.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    UserNotification.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const listMine = async (userId, query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = { userId };

  if (query.isRead !== undefined) filter.isRead = query.isRead === "true";

  const notificationIds = await getMatchedNotificationIds(query);
  if (notificationIds) {
    if (notificationIds.length === 0) {
      return {
        items: [],
        hasNotifications: false,
        emptyMessage: "Khong co thong bao",
        unreadCount: await UserNotification.countDocuments({
          userId,
          isRead: false,
        }),
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }

    filter.notificationId = { $in: notificationIds };
  }

  const [items, total, unreadCount] = await Promise.all([
    populateNotification(
      UserNotification.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
    ),
    UserNotification.countDocuments(filter),
    UserNotification.countDocuments({ userId, isRead: false }),
  ]);

  return {
    items,
    hasNotifications: items.length > 0,
    emptyMessage: items.length > 0 ? null : "Khong co thong bao",
    unreadCount,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) => UserNotification.findById(id);

const getMineById = async (userId, id, query = {}) => {
  const item = await populateNotification(
    UserNotification.findOne({ _id: id, userId }),
  );

  if (!item) return null;

  if (query.markAsRead !== "false" && !item.isRead) {
    item.isRead = true;
    item.readAt = new Date();
    await item.save();
  }

  return item;
};

const updateById = (id, data) =>
  UserNotification.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
const deleteById = (id) => UserNotification.findByIdAndDelete(id);

module.exports = {
  create,
  list,
  listMine,
  getLoginWelcome,
  notifyUser,
  getById,
  getMineById,
  updateById,
  deleteById,
};
