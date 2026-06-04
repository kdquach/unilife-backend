const mongoose = require("mongoose");
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

const buildFilter = (query = {}) => {
  const filter = {};
  const keyword = query.keyword || query.q || query.search;
  const isActive = toBoolean(query.isActive);
  const isMenuItem = toBoolean(query.isMenuItem);

  if (isActive !== undefined) filter.isActive = isActive;
  if (isMenuItem !== undefined) filter.isMenuItem = isMenuItem;
  if (mongoose.Types.ObjectId.isValid(query.categoryId)) {
    filter.categoryId = query.categoryId;
  }
  if (keyword) {
    const regex = new RegExp(escapeRegExp(keyword.trim()), "i");
    filter.$or = [{ name: regex }, { description: regex }];
  }

  const minPrice = Number(query.minPrice);
  const maxPrice = Number(query.maxPrice);
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

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = buildFilter(query);
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

const search = (query = {}) => list(query);

const getById = (id) =>
  Food.findById(id).populate("categoryId", "name isActive");
const updateById = (id, data) =>
  Food.findByIdAndUpdate(id, data, { new: true, runValidators: true });
const deleteById = (id) => Food.findByIdAndDelete(id);

module.exports = {
  create,
  list,
  search,
  getById,
  updateById,
  deleteById,
  buildFilter,
};
