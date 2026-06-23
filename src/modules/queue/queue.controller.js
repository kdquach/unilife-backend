const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/apiResponse");
const service = require("./queue.service");

const create = asyncHandler(async (req, res) =>
  success(res, await service.create(req.body), "Created successfully", 201),
);
const list = asyncHandler(async (req, res) =>
  success(res, await service.list(req.query), "Get list successfully"),
);
const getMonitorQueue = asyncHandler(async (req, res) =>
  success(
    res,
    await service.getMonitorQueue(req.query),
    "Get monitor queue successfully",
  ),
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

module.exports = {
  create,
  list,
  getMonitorQueue,
  getById,
  updateById,
  deleteById,
};
