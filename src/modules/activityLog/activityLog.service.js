const mongoose = require("mongoose");
const ActivityLog = require("./activityLog.model");
const User = require("../user/user.model");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => ActivityLog.create(data);

const getStats = async (query = {}) => {
  const filter = {};
  if (query.userId) {
    filter.userId = new mongoose.Types.ObjectId(query.userId);
  }
  if (query.targetType) {
    filter.targetType = query.targetType;
  }
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  // 1. Total count
  const totalLogs = await ActivityLog.countDocuments(filter);

  // Selected user info (if query.userId provided)
  let selectedUser = null;
  if (query.userId) {
    const userDoc = await User.findById(query.userId).select("fullName email role avatarUrl");
    if (userDoc) {
      selectedUser = {
        _id: userDoc._id,
        fullName: userDoc.fullName,
        email: userDoc.email,
        role: userDoc.role,
        avatarUrl: userDoc.avatarUrl,
      };
    }
  }

  // 2. Action Category Breakdown (CREATE, UPDATE, DELETE, OPERATIONS)
  const allLogsForCategory = await ActivityLog.find(filter, "action").lean();
  const categoryCounts = {
    CREATE: 0,
    UPDATE: 0,
    DELETE: 0,
    OPERATIONS: 0,
  };

  allLogsForCategory.forEach((log) => {
    const act = (log.action || "").toUpperCase();
    if (act.startsWith("CREATE") || act.startsWith("ADD")) {
      categoryCounts.CREATE++;
    } else if (act.startsWith("UPDATE") || act.startsWith("CHANGE")) {
      categoryCounts.UPDATE++;
    } else if (act.startsWith("DELETE") || act.startsWith("REMOVE")) {
      categoryCounts.DELETE++;
    } else {
      categoryCounts.OPERATIONS++;
    }
  });

  const actionBreakdown = [
    { category: "CREATE", label: "Create", count: categoryCounts.CREATE },
    { category: "UPDATE", label: "Update", count: categoryCounts.UPDATE },
    { category: "DELETE", label: "Delete", count: categoryCounts.DELETE },
    { category: "OPERATIONS", label: "Operations", count: categoryCounts.OPERATIONS },
  ];

  // 3. User & Module Breakdown
  let userOrModuleStats = [];
  if (!query.userId) {
    const topUsersAggregation = await ActivityLog.aggregate([
      { $match: filter },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: "$_id",
          fullName: { $ifNull: ["$userInfo.fullName", "System / Other"] },
          email: { $ifNull: ["$userInfo.email", ""] },
          role: { $ifNull: ["$userInfo.role", ""] },
          count: 1,
        },
      },
    ]);
    userOrModuleStats = topUsersAggregation;
  } else {
    const targetTypeAggregation = await ActivityLog.aggregate([
      { $match: filter },
      { $group: { _id: "$targetType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      {
        $project: {
          targetType: { $ifNull: ["$_id", "Other"] },
          count: 1,
        },
      },
    ]);
    userOrModuleStats = targetTypeAggregation;
  }

  return {
    summary: {
      totalLogs,
      selectedUser,
    },
    actionBreakdown,
    userOrModuleStats,
  };
};

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};

  if (query.userId) filter.userId = query.userId;
  if (query.action) filter.action = new RegExp(query.action, "i");
  if (query.targetType) filter.targetType = query.targetType;

  if (query.keyword)
    filter.$or = [
      { action: new RegExp(query.keyword, "i") },
      { description: new RegExp(query.keyword, "i") },
    ];

  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  const [items, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate("userId", "fullName email")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    ActivityLog.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) =>
  ActivityLog.findById(id).populate("userId", "fullName email");

const updateById = (id, data) =>
  ActivityLog.findByIdAndUpdate(id, data, { new: true, runValidators: true });

const deleteById = (id) => ActivityLog.findByIdAndDelete(id);

module.exports = { create, getStats, list, getById, updateById, deleteById };
