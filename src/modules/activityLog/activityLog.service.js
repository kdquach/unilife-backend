const ActivityLog = require("./activityLog.model");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => ActivityLog.create(data);

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

module.exports = { create, list, getById, updateById, deleteById };
