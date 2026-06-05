const mongoose = require("mongoose");
require("../foodCategory/foodCategory.model");
const Food = require("./food.model");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => Food.create(data);

const escapeRegExp = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toBoolean = (value) => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const getObjectIds = (value) => {
  if (!value) return [];
  const values = Array.isArray(value) ? value : String(value).split(",");

  return values
    .map((item) => item.trim())
    .filter((item) => mongoose.Types.ObjectId.isValid(item));
};

const buildFilter = (query = {}, options = {}) => {
  const filter = {};
  const keyword = (query.keyword || query.q || query.search || "").trim();
  const isActive = toBoolean(query.isActive);
  const categoryIds = getObjectIds(query.categoryIds || query.categoryId);

  if (isActive !== undefined) filter.isActive = isActive;
  else if (options.defaultIsActive !== undefined) {
    filter.isActive = options.defaultIsActive;
  }

  if (query.kind === "alwaysAvailable") {
    filter.isMenuItem = false;
  } else if (query.kind === "menuItem") {
    filter.isMenuItem = true;
  } else {
    const isMenuItem = toBoolean(query.isMenuItem);
    if (isMenuItem !== undefined) filter.isMenuItem = isMenuItem;
  }

  if (categoryIds.length === 1) {
    filter.categoryId = categoryIds[0];
  } else if (categoryIds.length > 1) {
    filter.categoryId = { $in: categoryIds };
  }

  if (keyword) {
    const regex = new RegExp(escapeRegExp(keyword), "i");
    filter.$or = [{ name: regex }, { description: regex }];
  }

  const minPrice = Number(query.minPrice || query.priceFrom);
  const maxPrice = Number(query.maxPrice || query.priceTo);
  if (!Number.isNaN(minPrice) || !Number.isNaN(maxPrice)) {
    filter.price = {};
    if (!Number.isNaN(minPrice)) filter.price.$gte = minPrice;
    if (!Number.isNaN(maxPrice)) filter.price.$lte = maxPrice;
  }

  return filter;
};

const buildSort = (query = {}) => {
  const allowedSortFields = ["createdAt", "name", "price"];
  const sortBy = allowedSortFields.includes(query.sortBy)
    ? query.sortBy
    : "createdAt";
  const sortOrder = query.sortOrder === "asc" ? 1 : -1;

  return { [sortBy]: sortOrder };
};

const list = async (query = {}, options = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = buildFilter(query, options);
  const sort = buildSort(query);

  const [items, total] = await Promise.all([
    Food.find(filter)
      .populate("categoryId", "name isActive")
      .skip(skip)
      .limit(limit)
      .sort(sort),
    Food.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const search = (query = {}) => list(query, { defaultIsActive: true });
const filter = (query = {}) => list(query, { defaultIsActive: true });

const getFilterOptions = async (query = {}) => {
  const baseFilter = buildFilter(
    {
      isActive: query.isActive,
      isMenuItem: query.isMenuItem,
      kind: query.kind,
    },
    { defaultIsActive: true },
  );

  const [categories, priceRange] = await Promise.all([
    Food.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$categoryId", totalFoods: { $sum: 1 } } },
      {
        $lookup: {
          from: "foodcategories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          categoryId: "$_id",
          name: "$category.name",
          isActive: "$category.isActive",
          totalFoods: 1,
        },
      },
      { $sort: { name: 1 } },
    ]),
    Food.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: null,
          minPrice: { $min: "$price" },
          maxPrice: { $max: "$price" },
        },
      },
      { $project: { _id: 0, minPrice: 1, maxPrice: 1 } },
    ]),
  ]);

  return {
    categories,
    priceRange: priceRange[0] || { minPrice: 0, maxPrice: 0 },
    kindOptions: ["alwaysAvailable", "menuItem"],
    isMenuItemOptions: [true, false],
  };
};

const getById = (id) =>
  Food.findById(id).populate("categoryId", "name isActive");

const updateById = (id, data) =>
  Food.findByIdAndUpdate(id, data, { new: true, runValidators: true });

const deleteById = (id) => Food.findByIdAndDelete(id);

module.exports = {
  create,
  list,
  search,
  filter,
  getFilterOptions,
  getById,
  updateById,
  deleteById,
  buildFilter,
};
