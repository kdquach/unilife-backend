const IngredientBatch = require("./ingredientBatch.model");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => IngredientBatch.create(data);

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
    IngredientBatch.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    IngredientBatch.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) => IngredientBatch.findById(id);
const updateById = (id, data) =>
  IngredientBatch.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
const deleteById = (id) => IngredientBatch.findByIdAndDelete(id);

module.exports = { create, list, getById, updateById, deleteById };
