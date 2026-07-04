const mongoose = require("mongoose");
require("../ingredient/ingredient.model");
require("../ingredientBatch/ingredientBatch.model");
require("../user/user.model");
const IngredientTransaction = require("./ingredientTransaction.model");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => IngredientTransaction.create(data);

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const setObjectIdFilter = (filter, query, fieldName) => {
  if (!query[fieldName]) return;
  if (!mongoose.Types.ObjectId.isValid(query[fieldName])) {
    throw createError(`Invalid ${fieldName}`);
  }

  filter[fieldName] = query[fieldName];
};

const getDate = (value, fieldName) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createError(`Invalid ${fieldName}`);
  }

  return date;
};

const getObjectIds = (value, fieldName) => {
  if (!value) return [];
  const values = Array.isArray(value) ? value : String(value).split(",");

  return values
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (!mongoose.Types.ObjectId.isValid(item)) {
        throw createError(`Invalid ${fieldName}`);
      }

      return item;
    });
};

const getValues = (value) => {
  if (!value) return [];
  const values = Array.isArray(value) ? value : String(value).split(",");

  return values.map((item) => item.trim()).filter(Boolean);
};

const escapeRegExp = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildSort = (query = {}) => {
  const allowedSortFields = ["createdAt", "quantity", "transactionType"];
  const sortBy = allowedSortFields.includes(query.sortBy)
    ? query.sortBy
    : "createdAt";
  const sortOrder = query.sortOrder === "asc" ? 1 : -1;

  return { [sortBy]: sortOrder };
};

const populateTransaction = (query) =>
  query
    .populate("ingredientId", "name unit currentStock")
    .populate("batchId", "quantity remainingQuantity expiryDate")
    .populate("adjustedBy", "fullName email role");

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  const sort = buildSort(query);

  setObjectIdFilter(filter, query, "ingredientId");
  setObjectIdFilter(filter, query, "batchId");
  setObjectIdFilter(filter, query, "adjustedBy");
  const transactionTypes = getValues(
    query.transactionTypes || query.transactionType,
  );
  if (transactionTypes.length === 1) {
    filter.transactionType = transactionTypes[0];
  } else if (transactionTypes.length > 1) {
    filter.transactionType = { $in: transactionTypes };
  }
  if (query.referenceType) filter.referenceType = query.referenceType;
  const referenceIds = getObjectIds(
    query.referenceIds || query.referenceId,
    "referenceId",
  );
  if (referenceIds.length === 1) {
    filter.referenceId = referenceIds[0];
  } else if (referenceIds.length > 1) {
    filter.referenceId = { $in: referenceIds };
  }

  const keyword = (query.keyword || query.q || query.search || "").trim();
  if (keyword) {
    const regex = new RegExp(escapeRegExp(keyword), "i");
    filter.$or = [
      { transactionType: regex },
      { referenceType: regex },
      { reason: regex },
    ];
  }

  const createdAt = {};
  const dateFrom = getDate(query.dateFrom, "dateFrom");
  const dateTo = getDate(query.dateTo, "dateTo");
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw createError("dateFrom must be before or equal to dateTo");
  }
  if (dateFrom) createdAt.$gte = dateFrom;
  if (dateTo) createdAt.$lte = dateTo;
  if (Object.keys(createdAt).length) filter.createdAt = createdAt;

  const [items, total] = await Promise.all([
    populateTransaction(
      IngredientTransaction.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sort),
    ),
    IngredientTransaction.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Invalid ingredient transaction id");
  }

  return populateTransaction(IngredientTransaction.findById(id));
};
const updateById = (id, data) =>
  IngredientTransaction.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
const deleteById = (id) => IngredientTransaction.findByIdAndDelete(id);

module.exports = { create, list, getById, updateById, deleteById };
