const express = require("express");
const controller = require("./report.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

router.use(authenticate);

// Admin & Manager được xem báo cáo
router.get(
  "/revenue",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  controller.getRevenueReport,
);
router.get(
  "/peak-hour",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  controller.getPeakHourReport,
);
router.get(
  "/order-statistics",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  controller.getOrderStatistics,
);
router.get(
  "/popular-food",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  controller.getPopularFoodReport,
);

module.exports = router;
