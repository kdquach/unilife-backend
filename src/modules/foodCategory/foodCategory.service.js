const mongoose = require("mongoose");
const FoodCategory = require("./foodCategory.model");
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

const pickCategoryFields = (data = {}) => {
  const payload = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.description !== undefined) payload.description = data.description;
  if (data.isActive !== undefined) payload.isActive = data.isActive;
  return payload;
};

const normalizePayload = (data = {}, { partial = false } = {}) => {
  const payload = pickCategoryFields(data);

  if (!partial || payload.name !== undefined) {
    if (typeof payload.name !== "string" || payload.name.trim() === "") {
      const err = new Error("Food category name is required");
      err.statusCode = 400;
      throw err;
    }
    payload.name = payload.name.trim();
  }

  if (payload.description !== undefined) {
    if (payload.description === null) payload.description = "";
    if (typeof payload.description !== "string") {
      const err = new Error("Food category description must be a string");
      err.statusCode = 400;
      throw err;
    }
    payload.description = payload.description.trim();
  }

  if (payload.isActive !== undefined && typeof payload.isActive !== "boolean") {
    const parsed = toBoolean(payload.isActive);
    if (parsed === undefined) {
      const err = new Error("Food category status must be a boolean");
      err.statusCode = 400;
      throw err;
    }
    payload.isActive = parsed;
  }

  return payload;
};

const ensureUniqueName = async (name, exceptId = null) => {
  if (!name) return;
  const existed = await FoodCategory.findOne({
    name: new RegExp(`^${escapeRegExp(name)}$`, "i"),
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });

  if (existed) {
    const err = new Error("Food category name already exists");
    err.statusCode = 409;
    throw err;
  }
};

const getExistingById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("Invalid food category id");
    err.statusCode = 400;
    throw err;
  }

  const category = await FoodCategory.findById(id);
  if (!category) {
    const err = new Error("Food category not found");
    err.statusCode = 404;
    throw err;
  }
  return category;
};

const create = async (data) => {
  const payload = normalizePayload(data);
  await ensureUniqueName(payload.name);
  return FoodCategory.create(payload);
};

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  const isActive = toBoolean(query.isActive);
  if (isActive !== undefined) filter.isActive = isActive;
  if (query.keyword) {
    const regex = new RegExp(escapeRegExp(query.keyword.trim()), "i");
    filter.$or = [{ name: regex }, { description: regex }];
  }

  const [items, total] = await Promise.all([
    FoodCategory.find(filter).skip(skip).limit(limit).sort({ name: 1 }),
    FoodCategory.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) => getExistingById(id);
const updateById = async (id, data) => {
  await getExistingById(id);
  const payload = normalizePayload(data, { partial: true });
  await ensureUniqueName(payload.name, id);

  return FoodCategory.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
};
const deleteById = (id) => FoodCategory.findByIdAndDelete(id);

module.exports = { create, list, getById, updateById, deleteById };
