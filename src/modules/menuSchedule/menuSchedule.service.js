const MenuSchedule = require("./menuSchedule.model");
const { getPagination } = require("../../utils/pagination.util");
const { getVietnamDayRange } = require("../../utils/date.util");

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
const create = (data) => MenuSchedule.create(data);

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

/**
 * Get a paginated list of menu schedules for staff.
 * Handles date range filters and conditionally excludes inactive items.
 */
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

/**
 * Get a specific menu schedule detail for staff.
 * Resolves CastError to 404 Not Found and conditionally excludes inactive items.
 */
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

const updateById = (id, data) =>
  MenuSchedule.findByIdAndUpdate(id, data, { new: true, runValidators: true });
const deleteById = (id) => MenuSchedule.findByIdAndDelete(id);

module.exports = { create, list, listMenuScheduleForStaff, getMenuScheduleByIdForStaff, getToday, getById, updateById, deleteById };

