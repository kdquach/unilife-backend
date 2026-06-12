const MenuSchedule = require("./menuSchedule.model");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => MenuSchedule.create(data);

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;

  if (query.date) {
    const start = new Date(query.date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(query.date);
    end.setHours(23, 59, 59, 999);
    filter.date = { $gte: start, $lte: end };
  } else if (query.dateFrom && query.dateTo) {
    filter.date = {
      $gte: new Date(query.dateFrom),
      $lte: new Date(query.dateTo),
    };
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

const getToday = async () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

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

module.exports = { create, list, getToday, getById, updateById, deleteById };

