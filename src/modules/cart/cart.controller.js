const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/apiResponse");
const service = require("./cart.service");

const create = asyncHandler(async (req, res) =>
  success(res, await service.create(req.body), "Created successfully", 201),
);
const list = asyncHandler(async (req, res) =>
  success(res, await service.list(req.query), "Get list successfully"),
);
const getById = asyncHandler(async (req, res) =>
  success(res, await service.getById(req.params.id), "Get detail successfully"),
);
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
const getMyCart = asyncHandler(async (req, res) =>
  success(res, await service.getMyCart(req.user._id), "Get cart details successfully"),
);
const addItem = asyncHandler(async (req, res) =>
  success(res, await service.addItem(req.user._id, req.body), "Item added to cart successfully", 201)
);

const updateItem = asyncHandler(async (req, res) =>
  success(res, await service.updateItem(req.user._id, req.params.cartItemId, req.body), "Cart item updated successfully")
);

const removeItem = asyncHandler(async (req, res) =>
  success(res, await service.removeItem(req.user._id, req.params.cartItemId), "Cart item removed successfully")
);

module.exports = { create, list, getById, updateById, deleteById, getMyCart, addItem, updateItem, removeItem };
