const mongoose = require("mongoose");
require("../foodCategory/foodCategory.model");
const Food = require("./food.model");
const FoodCategory = require("../foodCategory/foodCategory.model");
const { getPagination } = require("../../utils/pagination.util");

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

const pickFoodFields = (data = {}) => {
  const payload = {};
  [
    "categoryId",
    "name",
    "description",
    "imageUrl",
    "price",
    "isMenuItem",
    "stockQuantity",
    "isActive",
  ].forEach((field) => {
    if (data[field] !== undefined) payload[field] = data[field];
  });

  return payload;
};

const toNumber = (value) => {
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const normalizePayload = (data = {}, { partial = false } = {}) => {
  const payload = pickFoodFields(data);

  if (!partial || payload.name !== undefined) {
    if (typeof payload.name !== "string" || payload.name.trim() === "") {
      const err = new Error("Food name is required");
      err.statusCode = 400;
      throw err;
    }
    payload.name = payload.name.trim();
  }

  ["description", "imageUrl"].forEach((field) => {
    if (payload[field] === null) payload[field] = "";
    if (payload[field] !== undefined) {
      if (typeof payload[field] !== "string") {
        const err = new Error(`Food ${field} must be a string`);
        err.statusCode = 400;
        throw err;
      }
      payload[field] = payload[field].trim();
    }
  });

  if (payload.categoryId === "" || payload.categoryId === null) {
    payload.categoryId = null;
  }
  if (
    payload.categoryId !== undefined &&
    payload.categoryId !== null &&
    !mongoose.Types.ObjectId.isValid(payload.categoryId)
  ) {
    const err = new Error("Invalid food category id");
    err.statusCode = 400;
    throw err;
  }

  if (payload.price !== undefined) {
    const price = toNumber(payload.price);
    if (price === undefined || price < 0) {
      const err = new Error("Food price must be a non-negative number");
      err.statusCode = 400;
      throw err;
    }
    payload.price = price;
  }

  if (payload.stockQuantity !== undefined) {
    const stockQuantity = toNumber(payload.stockQuantity);
    if (
      stockQuantity !== null &&
      (stockQuantity === undefined || stockQuantity < 0)
    ) {
      const err = new Error(
        "Food stock quantity must be a non-negative number",
      );
      err.statusCode = 400;
      throw err;
    }
    payload.stockQuantity = stockQuantity;
  }

  ["isMenuItem", "isActive"].forEach((field) => {
    if (payload[field] !== undefined) {
      const parsed = toBoolean(payload[field]);
      if (parsed === undefined) {
        const err = new Error(`Food ${field} must be a boolean`);
        err.statusCode = 400;
        throw err;
      }
      payload[field] = parsed;
    }
  });

  return payload;
};

const ensureUniqueName = async (name, exceptId = null) => {
  if (!name) return;
  const existed = await Food.findOne({
    name: new RegExp(`^${escapeRegExp(name)}$`, "i"),
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });

  if (existed) {
    const err = new Error("Food name already exists");
    err.statusCode = 409;
    throw err;
  }
};

const ensureCategoryExists = async (categoryId) => {
  if (categoryId === undefined || categoryId === null) return;
  const category = await FoodCategory.findById(categoryId);
  if (!category) {
    const err = new Error("Food category not found");
    err.statusCode = 404;
    throw err;
  }
};

const getExistingById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("Invalid food id");
    err.statusCode = 400;
    throw err;
  }

  const food = await Food.findById(id);
  if (!food) {
    const err = new Error("Food not found");
    err.statusCode = 404;
    throw err;
  }

  return food;
};

const create = async (data) => {
  const payload = normalizePayload(data);
  await Promise.all([
    ensureUniqueName(payload.name),
    ensureCategoryExists(payload.categoryId),
  ]);

  const food = await Food.create(payload);
  return Food.findById(food._id).populate("categoryId", "name isActive");
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

const listForKitchen = (query = {}) => list(query, { defaultIsActive: true });
const searchForKitchen = (query = {}) => list(query, { defaultIsActive: true });
const filterForKitchen = (query = {}) => list(query, { defaultIsActive: true });
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

const getKitchenFilterOptions = (query = {}) => getFilterOptions(query);

const getById = (id) =>
  Food.findById(id).populate("categoryId", "name isActive");

const getByIdForKitchen = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("Invalid food id");
    err.statusCode = 400;
    throw err;
  }

  const food = await Food.findOne({ _id: id, isActive: true }).populate(
    "categoryId",
    "name isActive",
  );

  if (!food) {
    const err = new Error("Food not found");
    err.statusCode = 404;
    throw err;
  }

  return food;
};

const updateById = async (id, data) => {
  await getExistingById(id);
  const payload = normalizePayload(data, { partial: true });
  await Promise.all([
    ensureUniqueName(payload.name, id),
    ensureCategoryExists(payload.categoryId),
  ]);

  return Food.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  }).populate("categoryId", "name isActive");
};

const deleteById = (id) => Food.findByIdAndDelete(id);

module.exports = {
  create,
  list,
  listForKitchen,
  searchForKitchen,
  filterForKitchen,
  search,
  filter,
  getFilterOptions,
  getKitchenFilterOptions,
  getById,
  getByIdForKitchen,
  updateById,
  deleteById,
  buildFilter,
};
