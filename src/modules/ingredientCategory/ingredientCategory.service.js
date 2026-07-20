const IngredientCategory = require("./ingredientCategory.model");
const { getPagination } = require("../../utils/pagination.util");

const create = async (data) => {
  const existed = await IngredientCategory.findOne({
    name: new RegExp(`^${data.name.trim()}$`, "i"),
  });

  if (existed) {
    const err = new Error("Ingredient category name already exists.");
    err.statusCode = 400;
    throw err;
  }

  return IngredientCategory.create({
    ...data,
    name: data.name.trim(),
  });
};

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);

  const filter = {};

  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === "true";
  }

  if (query.keyword) {
    filter.name = new RegExp(query.keyword, "i");
  }

  const [items, total] = await Promise.all([
    IngredientCategory.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    IngredientCategory.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getById = (id) => IngredientCategory.findById(id);
const updateById = async (id, data) => {
  if (data.name) {
    const existed = await IngredientCategory.findOne({
      _id: { $ne: id },
      name: new RegExp(`^${data.name.trim()}$`, "i"),
    });

    if (existed) {
      const err = new Error("Ingredient category name already exists.");
      err.statusCode = 400;
      throw err;
    }

    data.name = data.name.trim();
  }

  return IngredientCategory.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
};
const deleteById = (id) => IngredientCategory.findByIdAndDelete(id);

module.exports = { create, list, getById, updateById, deleteById };
