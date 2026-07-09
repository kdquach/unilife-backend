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

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = await buildFilter(query);

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

const getById = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Invalid rating id");
  }

  return populateRating(Rating.findById(id));
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
};
