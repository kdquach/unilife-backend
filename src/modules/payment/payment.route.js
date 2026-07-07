const express = require("express");
const controller = require("./payment.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

// SePay webhook - NO user auth (SePay calls this, verified by API key in controller)
router.post("/sepay/webhook", controller.handleSepayWebhook);
router.post("/webhook", controller.handleSepayWebhook);
router.post("/", controller.handleSepayWebhook);

// Expire pending orders - admin/manager only
router.post(
  "/expire-pending",
  authenticate,
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  controller.expirePendingOrders,
);

module.exports = router;
