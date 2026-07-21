const mongoose = require("mongoose");
require("../foodCategory/foodCategory.model");
const Food = require("./food.model");
const FoodCategory = require("../foodCategory/foodCategory.model");
const FoodIngredient = require("../foodIngredient/foodIngredient.model");
const Ingredient = require("../ingredient/ingredient.model");
const { getPagination } = require("../../utils/pagination.util");

const createError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

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

const applyStockQuantityRule = (
  payload,
  { partial = false, existingFood = null } = {},
) => {
  const effectiveIsMenuItem =
    payload.isMenuItem !== undefined
      ? payload.isMenuItem
      : existingFood
        ? existingFood.isMenuItem
        : false;

  if (effectiveIsMenuItem === true) {
    payload.stockQuantity = null;
    return payload;
  }

  if (!partial && payload.stockQuantity == null) {
    payload.stockQuantity = 0;
  }

  if (partial && payload.stockQuantity === null) {
    payload.stockQuantity = 0;
  }

  if (
    partial &&
    existingFood?.isMenuItem &&
    payload.isMenuItem === false &&
    payload.stockQuantity === undefined
  ) {
    payload.stockQuantity = 0;
  }

  return payload;
};

const normalizePayload = (
  data = {},
  { partial = false, existingFood = null } = {},
) => {
  const payload = pickFoodFields(data);

  if (!partial || payload.name !== undefined) {
    if (typeof payload.name !== "string" || payload.name.trim() === "") {
        throw createError("Food name is required");
    }
    payload.name = payload.name.trim();
  }

  ["description", "imageUrl"].forEach((field) => {
    if (payload[field] === null) payload[field] = "";
    if (payload[field] !== undefined) {
      if (typeof payload[field] !== "string") {
        throw createError(`Food ${field} must be a string`);
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
    throw createError("Invalid food category id");
  }

  if (payload.price !== undefined) {
    const price = toNumber(payload.price);
    if (price === undefined || price < 0) {
      throw createError("Food price must be a non-negative number");
    }
    payload.price = price;
  }

  if (payload.stockQuantity !== undefined) {
    const stockQuantity = toNumber(payload.stockQuantity);
    if (
      stockQuantity !== null &&
      (stockQuantity === undefined || stockQuantity < 0)
    ) {
      throw createError("Food stock quantity must be a non-negative number");
    }
    payload.stockQuantity = stockQuantity;
  }

  ["isMenuItem", "isActive"].forEach((field) => {
    if (payload[field] !== undefined) {
      const parsed = toBoolean(payload[field]);
      if (parsed === undefined) {
        throw createError(`Food ${field} must be a boolean`);
      }
      payload[field] = parsed;
    }
  });

  return applyStockQuantityRule(payload, { partial, existingFood });
};

const normalizeIngredientItems = async (items) => {
  if (items === undefined) return undefined;
  if (typeof items === "string") {
    try {
      items = items.trim() ? JSON.parse(items) : [];
    } catch {
      throw createError("Food ingredients must be valid JSON");
    }
  }

  if (!Array.isArray(items)) {
    throw createError("Food ingredients must be an array");
  }

  const normalizedItems = [];
  const ingredientIds = [];
  const seenIngredientIds = new Set();

  items.forEach((item, index) => {
    const rawIngredientId =
      typeof item?.ingredientId === "object"
        ? item.ingredientId?._id
        : item?.ingredientId;
    const ingredientId = String(rawIngredientId || "").trim();

    if (!mongoose.Types.ObjectId.isValid(ingredientId)) {
      throw createError(`Invalid ingredientId at row ${index + 1}`);
    }

    if (seenIngredientIds.has(ingredientId)) {
      throw createError("Food ingredient list contains duplicate ingredients");
    }
    seenIngredientIds.add(ingredientId);
    ingredientIds.push(ingredientId);

    const rawQuantity = item?.quantityPerServing ?? item?.quantity;
    const quantityPerServing = toNumber(rawQuantity);
    if (
      quantityPerServing === undefined ||
      quantityPerServing === null ||
      quantityPerServing <= 0
    ) {
      throw createError(
        `Quantity per serving must be greater than 0 at row ${index + 1}`,
      );
    }

    let unit = item?.unit;
    if (unit === null || unit === undefined) unit = "";
    if (typeof unit !== "string") {
      throw createError(`Unit must be a string at row ${index + 1}`);
    }

    normalizedItems.push({
      ingredientId,
      quantityPerServing,
      unit: unit.trim(),
    });
  });

  if (ingredientIds.length === 0) return [];

  const ingredients = await Ingredient.find({
    _id: { $in: ingredientIds },
    isActive: true,
  }).select("_id unit");

  if (ingredients.length !== ingredientIds.length) {
    throw createError("Ingredient not found or inactive", 404);
  }

  const unitByIngredientId = new Map(
    ingredients.map((ingredient) => [
      ingredient._id.toString(),
      ingredient.unit || "",
    ]),
  );

  return normalizedItems.map((item) => ({
    ...item,
    unit: item.unit || unitByIngredientId.get(item.ingredientId) || "",
  }));
};

const ensureUniqueName = async (name, exceptId = null) => {
  if (!name) return;
  const existed = await Food.findOne({
    name: new RegExp(`^${escapeRegExp(name)}$`, "i"),
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });

  if (existed) {
    throw createError("Food name already exists", 409);
  }
};

const ensureCategoryExists = async (categoryId) => {
  if (categoryId === undefined || categoryId === null) return;
  const category = await FoodCategory.findById(categoryId);
  if (!category) {
    throw createError("Food category not found", 404);
  }
};

const getExistingById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Invalid food id");
  }

  const food = await Food.findById(id);
  if (!food) {
    throw createError("Food not found", 404);
  }

  return food;
};

const getFoodIngredients = (foodIds = []) => {
  const ids = foodIds.map((id) => id?.toString()).filter(Boolean);
  if (ids.length === 0) return Promise.resolve([]);

  return FoodIngredient.find({ foodId: { $in: ids } })
    .populate("ingredientId", "name unit currentStock isActive")
    .sort({ createdAt: 1 });
};

const attachIngredientsToFoods = async (foods = []) => {
  const foodObjects = foods.map((food) =>
    typeof food.toObject === "function" ? food.toObject() : food,
  );
  const ingredients = await getFoodIngredients(
    foodObjects.map((food) => food._id),
  );
  const ingredientsByFoodId = ingredients.reduce((acc, item) => {
    const foodId = item.foodId?.toString();
    if (!acc[foodId]) acc[foodId] = [];
    acc[foodId].push(
      typeof item.toObject === "function" ? item.toObject() : item,
    );
    return acc;
  }, {});

  return foodObjects.map((food) => ({
    ...food,
    ingredients: ingredientsByFoodId[food._id.toString()] || [],
  }));
};

const attachIngredientsToFood = async (food) => {
  if (!food) return food;
  const [foodWithIngredients] = await attachIngredientsToFoods([food]);
  return foodWithIngredients;
};

const syncFoodIngredients = async (foodId, ingredients) => {
  if (ingredients === undefined) return;

  await FoodIngredient.deleteMany({ foodId });
  if (ingredients.length === 0) return;

  await FoodIngredient.insertMany(
    ingredients.map((item) => ({
      foodId,
      ingredientId: item.ingredientId,
      quantityPerServing: item.quantityPerServing,
      unit: item.unit,
    })),
  );
};

const create = async (data) => {
  const payload = normalizePayload(data);
  const ingredients = await normalizeIngredientItems(data.ingredients);
  await Promise.all([
    ensureUniqueName(payload.name),
    ensureCategoryExists(payload.categoryId),
  ]);

  const food = await Food.create(payload);
  await syncFoodIngredients(food._id, ingredients);

  return attachIngredientsToFood(
    await Food.findById(food._id).populate("categoryId", "name isActive"),
  );
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
    items: await attachIngredientsToFoods(items),
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

const getById = async (id) =>
  attachIngredientsToFood(
    await Food.findById(id).populate("categoryId", "name isActive"),
  );

const getByIdForKitchen = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Invalid food id");
  }

  const food = await Food.findOne({ _id: id, isActive: true }).populate(
    "categoryId",
    "name isActive",
  );

  if (!food) {
    throw createError("Food not found", 404);
  }

  return attachIngredientsToFood(food);
};

const updateById = async (id, data) => {
  const existingFood = await getExistingById(id);
  const payload = normalizePayload(data, { partial: true, existingFood });
  const ingredients = await normalizeIngredientItems(data.ingredients);
  await Promise.all([
    ensureUniqueName(payload.name, id),
    ensureCategoryExists(payload.categoryId),
  ]);

  const food = await Food.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  }).populate("categoryId", "name isActive");
  await syncFoodIngredients(food._id, ingredients);

  return attachIngredientsToFood(food);
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
