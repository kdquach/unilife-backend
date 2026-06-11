const FoodCategory = require("./foodCategory.model");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => FoodCategory.create(data);

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.isActive !== undefined) filter.isActive = query.isActive === "true";
  if (query.keyword) {
    filter.name = new RegExp(query.keyword, "i");
  }

  const [items, total] = await Promise.all([
    FoodCategory.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
    FoodCategory.countDocuments(filter),
  ]);


  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) => FoodCategory.findById(id);
const updateById = (id, data) =>
  FoodCategory.findByIdAndUpdate(id, data, { new: true, runValidators: true });
const deleteById = (id) => FoodCategory.findByIdAndDelete(id);

module.exports = { create, list, getById, updateById, deleteById };
