const express = require("express");
const controller = require("./order.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

router.use(authenticate);

// Checkout - create order from cart with SePay payment
router.post("/checkout", controller.checkout);

// Payment status
router.get("/:id/payment-status", controller.getPaymentStatus);

// Existing CRUD routes
router.get("/", controller.list);
router.post("/", controller.create);
router.post(
  "/walk-in",
  authorize(
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.COUNTER_STAFF
  ),
  controller.createWalkIn
);
router.get("/:id", controller.getById);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;
