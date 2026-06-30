const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/apiResponse");
const service = require("./queue.service");

const create = asyncHandler(async (req, res) =>
  success(res, await service.create(req.body), "Created successfully", 201),
);
const list = asyncHandler(async (req, res) =>
  success(res, await service.list(req.query), "Get list successfully"),
);
const scanOrderQr = asyncHandler(async (req, res) => {
  const result = await service.scanOrderQr(req.body);
  return success(
    res,
    result,
    result.created
      ? "Order scanned and added to kitchen queue"
      : "Order already exists in kitchen queue",
    result.created ? 201 : 200,
  );
});
const getMonitorQueue = asyncHandler(async (req, res) =>
  success(
    res,
    await service.getMonitorQueue(req.query),
    "Get monitor queue successfully",
  ),
);
const callNextNumber = asyncHandler(async (req, res) =>
  success(res, await service.callNextNumber(), "Next queue number called"),
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
  scanOrderQr,
  getMonitorQueue,
  callNextNumber,
  getById,
  updateById,
  deleteById,
};
