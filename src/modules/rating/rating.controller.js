const asyncHandler = require("../../utils/asyncHandler");
const { success, fail } = require("../../utils/apiResponse");
const service = require("./rating.service");
const mongoose = require("mongoose");

/**
 * @desc    Create a new rating
 * @route   POST /api/v1/ratings
 * @access  Private
 */
const create = asyncHandler(async (req, res) =>
  success(res, await service.create(req.body), "Created successfully", 201),
);

/**
 * @desc    Get a list of ratings (supports pagination, search, filter)
 * @route   GET /api/v1/ratings
 * @access  Private (COUNTER_STAFF, MANAGER, ADMIN)
 */
const list = asyncHandler(async (req, res) =>
  success(res, await service.list(req.query), "Get list successfully"),
);

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
  const updatedRating = await service.updateById(id, req.body);
  if (!updatedRating) {
    return fail(res, "Rating not found", 404);
  }
  return success(res, updatedRating, "Updated successfully");
});

const deleteById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return fail(res, "Invalid Rating ID", 400);
  }
  const deletedRating = await service.deleteById(id);
  if (!deletedRating) {
    return fail(res, "Rating not found", 404);
  }
  return success(res, deletedRating, "Deleted successfully");
});

module.exports = { create, list, getById, updateById, deleteById };
