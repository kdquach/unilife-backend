const Rating = require("./rating.model");
const { getPagination } = require("../../utils/pagination.util");
const mongoose = require("mongoose");

/**
 * Create a new rating
 * @param {Object} data The rating data to create
 * @returns {Promise<Object>} The newly created rating document
 */
const create = (data) => Rating.create(data);

/**
 * Utility function: Escape special characters in regex
 * Prevents ReDoS (Regular Expression Denial of Service) when users input special characters
 * @param {String} string String to escape
 * @returns {String} Safe string to use inside new RegExp()
 */
const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Retrieve a list of ratings with pagination, search, and filtering.
 * Optimized pipeline: Applies basic filters (initialMatch) at the top of the pipeline ($match)
 * to minimize the number of documents passed to subsequent $lookup stages, significantly boosting performance.
 * @param {Object} query Query parameters (page, limit, keyword, type, stars)
 * @returns {Promise<Object>} List of items and pagination metadata
 */
const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);

  // 1. Initialize base filter (Pre-lookup match)
  const initialMatch = {};
  if (query.type) initialMatch.ratingType = query.type;
  if (query.stars) {
    const parsedStars = parseInt(query.stars, 10);
    // Ignore filter if parsedStars is NaN (e.g., query.stars = 'abc') to avoid MongoDB logic errors
    if (!isNaN(parsedStars)) initialMatch.stars = parsedStars;
  }

  const pipeline = [];

  if (Object.keys(initialMatch).length > 0) {
    pipeline.push({ $match: initialMatch });
  }

  // 2. Perform Lookups (Join data with users, foods, and orders collections)
  // Use preserveNullAndEmptyArrays to ensure the Rating persists even if the User/Food has been deleted
  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "userId",
      },
    },
    { $unwind: { path: "$userId", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "foods",
        localField: "foodId",
        foreignField: "_id",
        as: "foodId",
      },
    },
    { $unwind: { path: "$foodId", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "orders",
        localField: "orderId",
        foreignField: "_id",
        as: "orderId",
      },
    },
    { $unwind: { path: "$orderId", preserveNullAndEmptyArrays: true } },
  );

  // 3. Handle Keyword search
  // Must be executed after Lookups to enable text search across joined User, Food, and Order details
  if (query.keyword) {
    const safeKeyword = escapeRegExp(query.keyword);
    const keywordRegex = new RegExp(safeKeyword, "i");
    pipeline.push({
      $match: {
        $or: [
          { comment: keywordRegex },
          { staffReply: keywordRegex },
          { "userId.fullName": keywordRegex },
          { "userId.email": keywordRegex },
          { "foodId.name": keywordRegex },
          { "orderId.orderCode": keywordRegex },
        ],
      },
    });
  }

  // 4. Create pipeline to count total records (For pagination metadata)
  const totalPipeline = [...pipeline, { $count: "total" }];

  // 5. Append Sort, Pagination, and Sensitive Data Masking stages to the main pipeline
  pipeline.push(
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        "userId.passwordHash": 0, // Mask the hashed password
        "userId.isActive": 0,
        "userId.createdAt": 0,
        "userId.updatedAt": 0,
        "userId.__v": 0,
        "foodId.createdAt": 0,
        "foodId.updatedAt": 0,
        "foodId.__v": 0,
        "orderId.createdAt": 0,
        "orderId.updatedAt": 0,
        "orderId.__v": 0,
      },
    },
  );

  // 6. Execute both pipelines in parallel to optimize I/O blocking time
  const [items, totalResult] = await Promise.all([
    Rating.aggregate(pipeline),
    Rating.aggregate(totalPipeline),
  ]);

  const total = totalResult.length > 0 ? totalResult[0].total : 0;

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * Get detailed rating by ID
 * Populates relationships and excludes sensitive fields
 * @param {String} id Rating ObjectId
 * @returns {Promise<Object|null>} Rating document or null
 */
const getById = async (id) => {
  return Rating.findById(id).populate([
    { path: "userId", select: "-passwordHash -isActive -createdAt -updatedAt -__v" },
    { path: "foodId", select: "-createdAt -updatedAt -__v" },
    { path: "orderId", select: "-createdAt -updatedAt -__v" },
    { path: "repliedBy", select: "-passwordHash -isActive -createdAt -updatedAt -__v" },
  ]);
};

const updateById = (id, data) =>
  Rating.findByIdAndUpdate(id, data, { new: true, runValidators: true });
const deleteById = (id) => Rating.findByIdAndDelete(id);

module.exports = { create, list, getById, updateById, deleteById };
