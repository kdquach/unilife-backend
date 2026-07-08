const mongoose = require("mongoose");
const MenuSchedule = require("./menuSchedule.model");
const MenuScheduleItem = require("../menuScheduleItem/menuScheduleItem.model");
const { getPagination } = require("../../utils/pagination.util");
const { getVietnamDayRange } = require("../../utils/date.util");
const { internalPerformRefund } = require("../menuScheduleItem/menuScheduleItem.service");

const ALLOWED_TRANSITIONS = {
  DRAFT: ["PUBLISHED", "CANCELLED"],
  PUBLISHED: ["DRAFT", "CANCELLED", "COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

const dateOnly = (value) => {
  if (Array.isArray(value)) value = value[0];
  return String(value || "").slice(0, 10);
};

const getPopulateItemsOption = (includeInactive = false) => ({
  path: "items",
  match: includeInactive ? undefined : { isActive: true },
  populate: {
    path: "foodId",
    populate: {
      path: "categoryId",
      select: "name",
    },
  },
});

const create = async (data, user) => {
  if (!data.date) {
    const error = new Error("Date is required");
    error.statusCode = 400;
    throw error;
  }
  try {
    const normalizedDate = getVietnamDayRange(dateOnly(data.date)).start;
    return await MenuSchedule.create({
      ...data,
      date: normalizedDate,
      createdBy: user ? user.userId : null,
    });
  } catch (err) {
    if (err.name === "ValidationError" || err.code === 11000) {
      const error = new Error(err.message || "Invalid data or duplicate date");
      error.statusCode = 400;
      throw error;
    }
    throw err;
  }
};

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.status) {
    const statuses = String(query.status).split(",");
    filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }

  if (query.date) {
    const { start, end } = getVietnamDayRange(dateOnly(query.date));
    filter.date = { $gte: start, $lte: end };
  } else if (query.dateFrom || query.dateTo) {
    filter.date = {};
    if (query.dateFrom) filter.date.$gte = getVietnamDayRange(dateOnly(query.dateFrom)).start;
    if (query.dateTo) filter.date.$lte = getVietnamDayRange(dateOnly(query.dateTo)).end;
  }

  const [items, total] = await Promise.all([
    MenuSchedule.find(filter)
      .populate(getPopulateItemsOption())
      .skip(skip)
      .limit(limit)
      .sort({ date: 1 }),
    MenuSchedule.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const listMenuScheduleForStaff = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.status) {
    const statuses = String(query.status).split(",");
    filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }

  if (query.date) {
    const { start, end } = getVietnamDayRange(dateOnly(query.date));
    filter.date = { $gte: start, $lte: end };
  } else if (query.dateFrom || query.dateTo) {
    filter.date = {};
    if (query.dateFrom) filter.date.$gte = getVietnamDayRange(dateOnly(query.dateFrom)).start;
    if (query.dateTo) filter.date.$lte = getVietnamDayRange(dateOnly(query.dateTo)).end;
  }

  const [items, total] = await Promise.all([
    MenuSchedule.find(filter)
      .populate(getPopulateItemsOption(query.includeInactive === "true"))
      .skip(skip)
      .limit(limit)
      .sort({ date: 1 }),
    MenuSchedule.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getMenuScheduleByIdForStaff = async (id, query = {}) => {
  let schedule;
  try {
    schedule = await MenuSchedule.findById(id).populate(
      getPopulateItemsOption(query.includeInactive === "true")
    );
  } catch (e) {
    if (e.name === "CastError") {
      const error = new Error("Invalid menu schedule ID");
      error.statusCode = 404;
      throw error;
    }
    throw e;
  }

  if (!schedule) {
    const error = new Error("Menu schedule not found");
    error.statusCode = 404;
    throw error;
  }
  return schedule;
};

const getToday = async () => {
  const { start, end } = getVietnamDayRange();

  return MenuSchedule.findOne({
    date: { $gte: start, $lte: end },
    status: "PUBLISHED",
  }).populate(getPopulateItemsOption());
};

const getById = (id) => MenuSchedule.findById(id).populate(getPopulateItemsOption());

const updateById = async (id, data, user) => {
  // 1. Mass Assignment Prevention (Whitelist)
  const allowedUpdates = {};
  if (data.date) allowedUpdates.date = data.date;
  if (data.status) allowedUpdates.status = data.status;

  if (Object.keys(allowedUpdates).length === 0) {
    return getById(id);
  }

  const session = await mongoose.startSession();
  let updatedSchedule = null;

  // Manual Optimistic Concurrency check to prevent silent retries on new states
  const baseSchedule = await MenuSchedule.findById(id);
  if (!baseSchedule) {
    const error = new Error("Menu schedule not found");
    error.statusCode = 404;
    throw error;
  }
  const expectedStatus = baseSchedule.status;
  const expectedVersion = baseSchedule.__v;

  try {
    await session.withTransaction(async () => {
      const schedule = await MenuSchedule.findById(id).populate("items").session(session);
      if (!schedule) {
        const error = new Error("Menu schedule not found");
        error.statusCode = 404;
        throw error;
      }

      // Optimistic Concurrency Check
      if (schedule.__v !== expectedVersion) {
        const error = new Error("Data was modified by another user. Please retry.");
        error.statusCode = 409;
        throw error;
      }

      const { start: todayStart } = getVietnamDayRange(dateOnly(new Date()));
      const scheduleStart = getVietnamDayRange(dateOnly(schedule.date)).start;
      if (scheduleStart < todayStart) {
        const error = new Error("Cannot modify a frozen/past menu schedule");
        error.statusCode = 400;
        throw error;
      }

      const hasReservedItems = schedule.items && schedule.items.some(i => i.reservedCount > 0);

      if (allowedUpdates.status && allowedUpdates.status !== schedule.status) {
        const allowed = ALLOWED_TRANSITIONS[schedule.status] || [];
        if (!allowed.includes(allowedUpdates.status)) {
          const error = new Error(`Cannot transition status from ${schedule.status} to ${allowedUpdates.status}`);
          error.statusCode = 400;
          throw error;
        }

        if (allowedUpdates.status === "DRAFT" && hasReservedItems) {
          const error = new Error("Cannot downgrade to DRAFT because some items are already reserved");
          error.statusCode = 400;
          throw error;
        }
      }

      if (allowedUpdates.date) {
        const newStart = getVietnamDayRange(dateOnly(allowedUpdates.date)).start;
        if (newStart.getTime() !== scheduleStart.getTime() && hasReservedItems) {
          const error = new Error("Cannot change date because some items are already reserved");
          error.statusCode = 400;
          throw error;
        }
        schedule.date = newStart;
      }

      if (allowedUpdates.status === "PUBLISHED" && schedule.status !== "PUBLISHED") {
        schedule.publishedAt = new Date();
      }

      if (allowedUpdates.status === "CANCELLED" && schedule.status !== "CANCELLED") {
        // Handle Cancel all items and refund
        if (schedule.items) {
          for (const item of schedule.items) {
            if (item.isActive) {
              const minRequired = item.reservedCount + item.servedCount;
              const diff = minRequired - item.maxServing;
              if (diff < 0) {
                // Must use user parameter correctly for ActivityLog
                await internalPerformRefund(item, Math.abs(diff), user, session);
              }
              item.maxServing = minRequired;
              item.remainingCount = 0;
              item.isActive = false;
              await item.save({ session });
            }
          }
        }
        schedule.isActive = false;
      }

      if (allowedUpdates.status) {
        schedule.status = allowedUpdates.status;
      }

      try {
        await schedule.save({ session });
        updatedSchedule = schedule;
      } catch (err) {
        if (err.name === "VersionError") {
          const error = new Error("Data was modified by another user. Please retry.");
          error.statusCode = 409;
          throw error;
        }
        throw err;
      }
    });
  } catch (err) {
    if (err.message === "Data was modified by another user. Please retry.") {
      err.statusCode = 409;
    }
    throw err;
  } finally {
    await session.endSession();
  }

  return updatedSchedule;
};

const deleteById = async (id) => {
  const error = new Error("Hard delete is forbidden. Use Cancel (status: CANCELLED) to trigger inventory refund and soft-delete.");
  error.statusCode = 400;
  throw error;
};

module.exports = { create, list, listMenuScheduleForStaff, getMenuScheduleByIdForStaff, getToday, getById, updateById, deleteById };

