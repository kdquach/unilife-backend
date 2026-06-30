const MenuSchedule = require("./menuSchedule.model");
const { getPagination } = require("../../utils/pagination.util");
const { getVietnamDayRange } = require("../../utils/date.util");

const dateOnly = (value) => {
  if (Array.isArray(value)) value = value[0];
  return String(value || "").slice(0, 10);
};
const create = (data) => MenuSchedule.create(data);

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.status) filter.status = String(query.status);

  if (query.date) {
    const { start, end } = getVietnamDayRange(dateOnly(query.date));
    filter.date = { $gte: start, $lte: end };
  } else if (query.dateFrom || query.dateTo) {
    filter.date = {};
    if (query.dateFrom) filter.date.$gte = getVietnamDayRange(dateOnly(query.dateFrom)).start;
    if (query.dateTo) filter.date.$lte = getVietnamDayRange(dateOnly(query.dateTo)).end;
  }

  const populateItemsOption = {
    path: "items",
    match: { isActive: true },
    populate: {
      path: "foodId",
      populate: {
        path: "categoryId",
        select: "name",
      },
    },
  };

  const [items, total] = await Promise.all([
    MenuSchedule.find(filter)
      .populate(populateItemsOption)
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

const getStaffList = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.status) filter.status = String(query.status);

  if (query.date) {
    const { start, end } = getVietnamDayRange(dateOnly(query.date));
    filter.date = { $gte: start, $lte: end };
  } else if (query.dateFrom || query.dateTo) {
    filter.date = {};
    if (query.dateFrom) filter.date.$gte = getVietnamDayRange(dateOnly(query.dateFrom)).start;
    if (query.dateTo) filter.date.$lte = getVietnamDayRange(dateOnly(query.dateTo)).end;
  }

  const populateItemsOption = {
    path: "items",
    match: query.includeInactive === "true" ? undefined : { isActive: true },
    populate: {
      path: "foodId",
      populate: {
        path: "categoryId",
        select: "name",
      },
    },
  };

  const [items, total] = await Promise.all([
    MenuSchedule.find(filter)
      .populate(populateItemsOption)
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

const getToday = async () => {
  const { start, end } = getVietnamDayRange();

  const populateItemsOption = {
    path: "items",
    match: { isActive: true },
    populate: {
      path: "foodId",
      populate: {
        path: "categoryId",
        select: "name",
      },
    },
  };

  return MenuSchedule.findOne({
    date: { $gte: start, $lte: end },
    status: "PUBLISHED",
  }).populate(populateItemsOption);
};

const getById = (id) =>
  MenuSchedule.findById(id).populate({
    path: "items",
    match: { isActive: true },
    populate: {
      path: "foodId",
      populate: {
        path: "categoryId",
        select: "name",
      },
    },
  });

const updateById = (id, data) =>
  MenuSchedule.findByIdAndUpdate(id, data, { new: true, runValidators: true });
const deleteById = (id) => MenuSchedule.findByIdAndDelete(id);

module.exports = { create, list, getStaffList, getToday, getById, updateById, deleteById };

