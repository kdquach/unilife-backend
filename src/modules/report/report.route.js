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

module.exports = router;