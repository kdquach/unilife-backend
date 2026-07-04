const express = require("express");
const controller = require("./order.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { writeActivityLog } = require("../../middlewares/activityLog.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

router.use(authenticate);

// Checkout - create order from cart with SePay payment
router.post("/checkout", writeActivityLog("CHECKOUT_ORDER", "Order"), controller.checkout);

// Counter Staff scans customer pickup QR to start kitchen processing.
router.post(
  "/scan-pickup-qr",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.COUNTER_STAFF),
  controller.scanPickupQr,
);

router.post(
  "/walk-in",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.COUNTER_STAFF),
  writeActivityLog("CREATE_WALK_IN_ORDER", "Order"),
  controller.createWalkIn,
);

// Payment status
router.get("/:id/payment-status", controller.getPaymentStatus);

// Existing CRUD routes
router.get("/", controller.list);
router.post("/", controller.create);
router.get("/:id", controller.getById);
router.patch("/:id", writeActivityLog("UPDATE_ORDER", "Order"), controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;
