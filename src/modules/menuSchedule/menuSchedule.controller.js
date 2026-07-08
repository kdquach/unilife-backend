const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/apiResponse");
const service = require("./menuSchedule.service");

const IdempotencyKey = require("../idempotency/idempotencyKey.model");

const create = asyncHandler(async (req, res) => {
  const key = req.headers["idempotency-key"];
  
  if (key) {
     try {
       await IdempotencyKey.create({ key });
     } catch (err) {
       if (err.code === 11000) {
         const existing = await IdempotencyKey.findOne({ key });
         if (existing && existing.responseStatus) {
           return res.status(existing.responseStatus).json(existing.responseBody);
         }
         return res.status(409).json({ message: "Concurrent request in progress or failed. Please retry later.", success: false });
       }
       throw err;
     }
  }

  try {
     const result = await service.create(req.body, req.user);
     const responseBody = { success: true, message: "Created successfully", data: result };
     if (key) {
        await IdempotencyKey.updateOne({ key }, { responseStatus: 201, responseBody });
     }
     return res.status(201).json(responseBody);
  } catch (err) {
     if (key) {
        await IdempotencyKey.deleteOne({ key });
     }
     throw err;
  }
});
const list = asyncHandler(async (req, res) =>
  success(res, await service.list(req.query), "Get list successfully"),
);
// Get menu schedule list specifically for staff (supports inactive filtering)
const listMenuScheduleForStaff = asyncHandler(async (req, res) =>
  success(res, await service.listMenuScheduleForStaff(req.query), "Get menu schedule list for staff successfully"),
);

// Get specific menu schedule detail for staff by ID
const getMenuScheduleByIdForStaff = asyncHandler(async (req, res) =>
  success(res, await service.getMenuScheduleByIdForStaff(req.params.id, req.query), "Get menu schedule detail for staff successfully"),
);
const getToday = asyncHandler(async (req, res) =>
  success(res, await service.getToday(), "Get today menu successfully"),
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

module.exports = { create, list, getToday, getById, updateById, deleteById, listMenuScheduleForStaff, getMenuScheduleByIdForStaff };

