const mongoose = require("mongoose");
require("../user/user.model");
require("../food/food.model");
require("../order/order.model");
require("../menuScheduleItem/menuScheduleItem.model");
const Rating = require("./rating.model");
const Order = require("../order/order.model");
const OrderItem = require("../orderItem/orderItem.model");
const MenuScheduleItem = require("../menuScheduleItem/menuScheduleItem.model");
const { getPagination } = require("../../utils/pagination.util");
const { getVietnamDayRange } = require("../../utils/date.util");
const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const escapeRegExp = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getObjectId = (value, fieldName) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw createError(`Invalid ${fieldName}`);
  }

  return value;
};

const getOptionalObjectId = (value, fieldName) => {
  if (!value) return null;
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw createError(`Invalid ${fieldName}`);
  }

  return value;
};

const getStars = (value) => {
  const stars = Number(value);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw createError("stars must be an integer from 1 to 5");
  }

  return stars;
};

const getComment = (value) => {
  if (value === undefined || value === null) return null;
  const comment = String(value).trim();
  if (comment.length > 1000) {
    throw createError("comment must be less than or equal to 1000 characters");
  }

  return comment || null;
};

const getRatingType = (value, foodId) => {
  const ratingType = String(value || (foodId ? "FOOD" : "ORDER"))
    .trim()
    .toUpperCase();
  if (!["ORDER", "FOOD"].includes(ratingType)) {
    throw createError("ratingType must be ORDER or FOOD");
  }

  if (ratingType === "FOOD" && !foodId) {
    throw createError("foodId is required for FOOD rating");
  }

  if (ratingType === "ORDER" && foodId) {
    throw createError("foodId is only allowed for FOOD rating");
  }

  return ratingType;
};

const addAndClause = (filter, clause) => {
  if (!filter.$and) filter.$and = [];
  filter.$and.push(clause);
};

const populateRating = (query) =>
  query
    .populate("userId", "fullName email avatarUrl")
    .populate("orderId", "orderCode status paymentStatus createdAt")
    .populate("foodId", "name imageUrl price")
    .populate("repliedBy", "fullName email role");

const assertAllowedCreateFields = (data = {}) => {
  const allowedFields = new Set([
    "orderId",
    "foodId",
    "ratingType",
    "stars",
    "comment",
  ]);
  const unknownFields = Object.keys(data || {}).filter(
    (field) => !allowedFields.has(field),
  );

  if (unknownFields.length > 0) {
    throw createError(`Unsupported field(s): ${unknownFields.join(", ")}`);
  }
};

const assertAllowedUpdateFields = (data = {}) => {
  const allowedFields = new Set(["stars", "comment"]);
  const unknownFields = Object.keys(data || {}).filter(
    (field) => !allowedFields.has(field),
  );

  if (unknownFields.length > 0) {
    throw createError(`Unsupported field(s): ${unknownFields.join(", ")}`);
  }
};

const ensureCompletedOrderForReview = async (userId, orderId) => {
  const order = await Order.findOne({ _id: orderId, userId });
  if (!order) throw createError("Order not found", 404);

  if (order.paymentStatus !== "PAID") {
    throw createError("Only paid orders can be reviewed");
  }

  if (order.status !== "COMPLETED") {
    throw createError("You can review only after receiving your food");
  }

  return order;
};

const ensureFoodBelongsToOrder = async (orderId, foodId) => {
  if (!foodId) return null;

  const orderItems = await OrderItem.find({ orderId })
    .populate("foodId", "_id")
    .populate({
      path: "menuScheduleItemId",
      populate: { path: "foodId", select: "_id" },
    });

  const hasFood = orderItems.some((item) => {
    const directFoodId = item.foodId?._id || item.foodId;
    const menuFoodId = item.menuScheduleItemId?.foodId?._id;
    return [directFoodId, menuFoodId]
      .filter(Boolean)
      .some((id) => id.toString() === foodId.toString());
  });

  if (!hasFood) {
    throw createError("Food does not belong to this order");
  }

  return foodId;
};

const buildFilter = async (query = {}, options = {}) => {
  const filter = {};
  if (options.userId) filter.userId = options.userId;

  const orderId = getOptionalObjectId(query.orderId, "orderId");
  if (orderId) filter.orderId = orderId;

  const foodId = getOptionalObjectId(query.foodId, "foodId");
  if (foodId) {
    const menuScheduleItemIds = await MenuScheduleItem.find({ foodId })
      .distinct("_id");
    const orderIds = await OrderItem.find({
      $or: [
        { foodId },
        ...(menuScheduleItemIds.length
          ? [{ menuScheduleItemId: { $in: menuScheduleItemIds } }]
          : []),
      ],
    }).distinct("orderId");
    const relatedOrderIds = orderIds.filter(Boolean);
    addAndClause(filter, {
      $or: [
        { foodId },
        ...(relatedOrderIds.length
          ? [{ orderId: { $in: relatedOrderIds } }]
          : []),
      ],
    });
  }

  if (query.ratingType) filter.ratingType = query.ratingType;
  if (query.stars !== undefined) filter.stars = getStars(query.stars);

  const keyword = (query.keyword || query.q || query.search || "").trim();
  if (keyword) {
    const regex = new RegExp(escapeRegExp(keyword), "i");
    addAndClause(filter, { $or: [{ comment: regex }, { staffReply: regex }] });
  }

  return filter;
};

const create = async (userId, data = {}) => {
  assertAllowedCreateFields(data);

  const orderId = getObjectId(data.orderId, "orderId");
  const foodId = getOptionalObjectId(data.foodId, "foodId");
  await ensureCompletedOrderForReview(userId, orderId);
  await ensureFoodBelongsToOrder(orderId, foodId);

  const ratingType = getRatingType(data.ratingType, foodId);
  const stars = getStars(data.stars);
  const comment = getComment(data.comment);

  const duplicate = await Rating.findOne({
    userId,
    orderId,
    foodId: foodId || null,
    ratingType,
  });
  if (duplicate) {
    throw createError("You already reviewed this order or food", 409);
  }

  const rating = await Rating.create({
    userId,
    orderId,
    foodId: foodId || null,
    ratingType,
    stars,
    comment,
  });

  return populateRating(Rating.findById(rating._id));
};



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
    if (!isNaN(parsedStars)) initialMatch.stars = parsedStars;
  }

  // Filter by hasReply
  if (query.hasReply === "true") {
    initialMatch.staffReply = { $ne: null };
  } else if (query.hasReply === "false") {
    initialMatch.staffReply = null;
  }

  // Filter by date range (using Vietnam Timezone)
  if (query.startDate || query.endDate) {
    const dateMatch = {};
    if (query.startDate) {
      const parsedStart = new Date(query.startDate);
      if (!isNaN(parsedStart.getTime())) {
        const { start } = getVietnamDayRange(parsedStart);
        dateMatch.$gte = start;
      }
    }
    if (query.endDate) {
      const parsedEnd = new Date(query.endDate);
      if (!isNaN(parsedEnd.getTime())) {
        const { end } = getVietnamDayRange(parsedEnd);
        dateMatch.$lte = end;
      }
    }
    if (Object.keys(dateMatch).length > 0) {
      initialMatch.createdAt = dateMatch;
    }
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

const listMine = async (userId, query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = await buildFilter(query, { userId });

  const [items, total] = await Promise.all([
    populateRating(
      Rating.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
    ),
    Rating.countDocuments(filter),
  ]);

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
    {
      path: "userId",
      select: "-passwordHash -isActive -createdAt -updatedAt -__v",
    },
    { path: "foodId", select: "-createdAt -updatedAt -__v" },
    { path: "orderId", select: "-createdAt -updatedAt -__v" },
    {
      path: "repliedBy",
      select: "-passwordHash -isActive -createdAt -updatedAt -__v",
    },
  ]);
};

const getMineById = (userId, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Invalid rating id");
  }

  return populateRating(Rating.findOne({ _id: id, userId }));
};

const updateMineById = async (userId, id, data = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Invalid rating id");
  }

  assertAllowedUpdateFields(data);
  const update = {};
  if (data.stars !== undefined) update.stars = getStars(data.stars);
  if (data.comment !== undefined) update.comment = getComment(data.comment);
  if (!Object.keys(update).length) throw createError("No valid fields to update");

  const rating = await Rating.findOneAndUpdate({ _id: id, userId }, update, {
    new: true,
    runValidators: true,
  });
  if (!rating) throw createError("Rating not found", 404);

  return populateRating(Rating.findById(rating._id));
};

const deleteMineById = async (userId, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Invalid rating id");
  }

  const rating = await Rating.findOneAndDelete({ _id: id, userId });
  if (!rating) throw createError("Rating not found", 404);

  return rating;
};

const updateById = (id, data) =>
  Rating.findByIdAndUpdate(id, data, { new: true, runValidators: true });

const deleteById = (id) => Rating.findByIdAndDelete(id);

/**
 * Reply to a rating
 * @param {String} id Rating ObjectId
 * @param {String} staffReply Content of the reply
 * @param {String} repliedBy User ObjectId of the staff member
 * @returns {Promise<Object|null>} Updated rating document
 */
const replyRating = (id, staffReply, repliedBy) =>
  Rating.findByIdAndUpdate(
    id,
    { staffReply, repliedBy, repliedAt: new Date() },
    { new: true, runValidators: true },
  );

module.exports = {
  create,
  list,
  listMine,
  getById,
  getMineById,
  updateMineById,
  deleteMineById,
  updateById,
  deleteById,
  replyRating,
};
