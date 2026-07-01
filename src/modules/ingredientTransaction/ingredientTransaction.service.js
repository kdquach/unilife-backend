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

const populateTransaction = (query) =>
  query
    .populate("ingredientId", "name unit currentStock")
    .populate("batchId", "quantity remainingQuantity expiryDate")
    .populate("adjustedBy", "fullName email role");

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};

  setObjectIdFilter(filter, query, "ingredientId");
  setObjectIdFilter(filter, query, "batchId");
  setObjectIdFilter(filter, query, "adjustedBy");
  if (query.transactionType) filter.transactionType = query.transactionType;
  if (query.referenceType) filter.referenceType = query.referenceType;

  const createdAt = {};
  const dateFrom = getDate(query.dateFrom, "dateFrom");
  const dateTo = getDate(query.dateTo, "dateTo");
  if (dateFrom) createdAt.$gte = dateFrom;
  if (dateTo) createdAt.$lte = dateTo;
  if (Object.keys(createdAt).length) filter.createdAt = createdAt;

  const [items, total] = await Promise.all([
    populateTransaction(
      IngredientTransaction.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
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
