const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/apiResponse");
const service = require("./report.service");

const getRevenueReport = asyncHandler(async (req, res) => {
  const data = await service.getRevenueReport(req.query);

  return success(
    res,
    data,
    "Revenue report retrieved successfully",
  );
});

module.exports = {
  getRevenueReport,
};