const express = require("express");
const controller = require("./order.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { writeActivityLog } = require("../../middlewares/activityLog.middleware");
const ROLES = require("../../constants/roles.constant");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many checkout requests, please try again after a minute" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "test",
});

const walkInLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: "Too many walk-in orders, please try again after a minute" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "test",
});

router.use(authenticate);

// Checkout - create order from cart with SePay payment
router.post("/checkout", checkoutLimiter, writeActivityLog("CHECKOUT_ORDER", "Order"), controller.checkout);

// Counter Staff scans customer pickup QR to start kitchen processing.
router.post(
  "/scan-pickup-qr",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.COUNTER_STAFF),
  writeActivityLog("SCAN_PICKUP_QR", "Order"),
  controller.scanPickupQr,
);

router.post(
  "/walk-in",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.COUNTER_STAFF),
  walkInLimiter,
  writeActivityLog("CREATE_WALK_IN_ORDER", "Order"),
  controller.createWalkIn,
);

// Payment status
router.get("/:id/payment-status", controller.getPaymentStatus);

// Check and expire orders (can be called by customers when their payment timer expires)
router.post("/check-expired", controller.checkExpiredOrders);

// Existing CRUD routes
router.get("/", controller.list);
router.post("/", controller.create);
router.get("/:id", controller.getById);
router.patch("/:id", writeActivityLog("UPDATE_ORDER", "Order"), controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;
