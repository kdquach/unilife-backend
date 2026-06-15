const asyncHandler = require("../../utils/asyncHandler");
const { success, fail } = require("../../utils/apiResponse");
const service = require("./order.service");
const ROLES = require("../../constants/roles.constant");

const create = asyncHandler(async (req, res) => {
  const data = { ...req.body };
  if (req.user && req.user.role === ROLES.CUSTOMER) {
    data.userId = req.user._id.toString();
    data.createdBy = req.user._id.toString();
  }
  return success(res, await service.create(data), "Created successfully", 201);
});
const checkout = asyncHandler(async (req, res) =>
  success(
    res,
    await service.checkout(req.user._id, req.body),
    "Order created successfully. Please complete payment.",
    201,
  ),
);
const getPaymentStatus = asyncHandler(async (req, res) => {
  const userId =
    req.user.role === ROLES.CUSTOMER ? req.user._id.toString() : null;
  return success(
    res,
    await service.getPaymentStatus(req.params.id, userId),
    "Payment status retrieved successfully",
  );
});
const list = asyncHandler(async (req, res) => {
  const query = { ...req.query };

  if (req.user.role === ROLES.KITCHEN_STAFF) {
    const err = new Error("You are not allowed to view orders");
    err.statusCode = 403;
    throw err;
  }
  
  if (req.user && req.user.role === ROLES.CUSTOMER) {
    query.userId = req.user._id.toString();
  }
  return success(res, await service.list(query), "Get list successfully");
});
const getById = asyncHandler(async (req, res) => {
  const order = await service.getById(req.params.id);
  if (!order) {
    return fail(res, "Order not found", 404);
  }
  if (
    req.user &&
    req.user.role === ROLES.CUSTOMER &&
    order.userId?.toString() !== req.user._id.toString()
  ) {
    return fail(res, "Permission denied", 403);
  }
  return success(res, order, "Get detail successfully");
});
const updateById = asyncHandler(async (req, res) =>
  success(
    res,
    await service.updateById(req.params.id, req.body),
    "Updated successfully",
  ),
);
const deleteById = asyncHandler(async (req, res) =>
  success(res, await service.deleteById(req.params.id), "Deleted successfully"),
);

module.exports = { create, checkout, list, getById, updateById, deleteById, getPaymentStatus };
