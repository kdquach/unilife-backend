const express = require("express");
const controller = require("./order.controller");
const { authenticate } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

// Checkout - create order from cart with SePay payment
router.post("/checkout", controller.checkout);

// Payment status
router.get("/:id/payment-status", controller.getPaymentStatus);

// Existing CRUD routes
router.get("/", controller.list);
router.post("/", controller.create);
router.get("/:id", controller.getById);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;
