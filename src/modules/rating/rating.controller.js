const asyncHandler = require("../../utils/asyncHandler");
const { success, fail } = require("../../utils/apiResponse");
const service = require("./rating.service");
const mongoose = require("mongoose");
/**
 * @desc    Create a new rating
 * @route   POST /api/v1/ratings
 * @access  Private
 */
const create = asyncHandler(async (req, res) => {
  // Prevent mass assignment
  const { staffReply, repliedBy, repliedAt, userId, ...ratingData } = req.body;
  
  const newRating = await service.create(req.user._id, ratingData);
  return success(res, newRating, "Created successfully", 201);
});

/**
 * @desc    Get a list of ratings (supports pagination, search, filter)
 * @route   GET /api/v1/ratings
 * @access  Private (COUNTER_STAFF, MANAGER, ADMIN)
 */
const list = asyncHandler(async (req, res) => {
  const result = await service.list(req.query);
  return success(res, result, "Get list successfully");
});

/**
 * @desc    Get detailed information of a rating by ID
 * @route   GET /api/v1/ratings/:id
 * @access  Private (COUNTER_STAFF, MANAGER, ADMIN)
 */
const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // 1. Validate ID format against MongoDB ObjectId standard
  // Prevents Mongoose CastError (HTTP 500) by returning a clear HTTP 400 Bad Request
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return fail(res, "Invalid Rating ID", 400);
  }
  
  // 2. Query detailed rating information from Database
  const rating = await service.getById(id);
  
  // 3. Handle missing data case (returns HTTP 404)
  if (!rating) {
    return fail(res, "Rating not found", 404);
  }
  
  // 4. Return success result (HTTP 200)
  return success(res, rating, "Get detail successfully");
});
const updateById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return fail(res, "Invalid Rating ID", 400);
  }
  
  const rating = await service.getById(id);
  if (!rating) {
    return fail(res, "Rating not found", 404);
  }

  // Ownership Check for CUSTOMER
  if (req.user.role === "CUSTOMER" && rating.userId._id.toString() !== req.user._id.toString()) {
    return fail(res, "Forbidden", 403);
  }

  // Prevent mass assignment during update
  const { staffReply, repliedBy, repliedAt, userId, ...updateData } = req.body;

  if (updateData.stars && (updateData.stars < 1 || updateData.stars > 5)) {
    return fail(res, "Stars must be between 1 and 5", 400);
  }

  const updatedRating = await service.updateById(id, updateData);
  return success(res, updatedRating, "Updated successfully");
});

const deleteById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return fail(res, "Invalid Rating ID", 400);
  }
  
  const rating = await service.getById(id);
  if (!rating) {
    return fail(res, "Rating not found", 404);
  }

  // Ownership Check for CUSTOMER
  if (req.user.role === "CUSTOMER" && rating.userId._id.toString() !== req.user._id.toString()) {
    return fail(res, "Forbidden", 403);
  }

  const deletedRating = await service.deleteById(id);
  return success(res, deletedRating, "Deleted successfully");
});

/**
 * @desc    Reply to a rating
 * @route   PATCH /api/v1/ratings/:id/reply
 * @access  Private (COUNTER_STAFF, MANAGER, ADMIN)
 */
const reply = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { staffReply } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return fail(res, "Invalid Rating ID", 400);
  }

  if (!staffReply || staffReply.trim() === "") {
    return fail(res, "staffReply is required", 400);
  }

  const repliedBy = req.user._id;
  
  const updatedRating = await service.replyRating(id, staffReply.trim(), repliedBy);
  
  if (!updatedRating) {
    return fail(res, "Rating not found", 404);
  }

  return success(res, updatedRating, "Replied successfully");
});

const listMine = asyncHandler(async (req, res) =>
  success(
    res,
    await service.listMine(req.user._id, req.query),
    "Get my ratings successfully",
  ),
);

const getMineById = asyncHandler(async (req, res) => {
  const item = await service.getMineById(req.user._id, req.params.id);
  if (!item) return fail(res, "Rating not found", 404);

  return success(res, item, "Get my rating detail successfully");
});

module.exports = { create, list, listMine, getById, getMineById, updateById, deleteById, reply };
