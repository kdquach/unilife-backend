const MenuScheduleItem = require("./menuScheduleItem.model");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => MenuScheduleItem.create(data);

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.isActive !== undefined) filter.isActive = query.isActive === "true";
  if (query.menuScheduleId) filter.menuScheduleId = query.menuScheduleId;
  if (query.foodId) filter.foodId = query.foodId;

  const [items, total] = await Promise.all([
    MenuScheduleItem.find(filter)
      .populate({
        path: "foodId",
        populate: {
          path: "categoryId",
          select: "name",
        },
      })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    MenuScheduleItem.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) =>
  MenuScheduleItem.findById(id).populate({
    path: "foodId",
    populate: {
      path: "categoryId",
      select: "name",
    },
  });

const updateById = (id, data) =>
  MenuScheduleItem.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
const deleteById = (id) => MenuScheduleItem.findByIdAndDelete(id);

module.exports = { create, list, getById, updateById, deleteById };

