const express = require("express");
const router = express.Router();
router.get("/health", (req, res) => res.json({ success: true, message: "OK" }));
router.use("/auth", require("../modules/auth/auth.route"));
router.use("/users", require("../modules/user/user.route"));
router.use("/sessions", require("../modules/session/session.route"));
router.use("/otps", require("../modules/otp/otp.route"));
router.use(
  "/activity-logs",
  require("../modules/activityLog/activityLog.route"),
);
router.use(
  "/notifications",
  require("../modules/notification/notification.route"),
);
router.use(
  "/user-notifications",
  require("../modules/userNotification/userNotification.route"),
);
router.use(
  "/food-categories",
  require("../modules/foodCategory/foodCategory.route"),
);
router.use("/foods", require("../modules/food/food.route"));
router.use(
  "/food-ingredients",
  require("../modules/foodIngredient/foodIngredient.route"),
);
router.use(
  "/menu-schedules",
  require("../modules/menuSchedule/menuSchedule.route"),
);
router.use(
  "/menu-schedule-items",
  require("../modules/menuScheduleItem/menuScheduleItem.route"),
);
router.use("/carts", require("../modules/cart/cart.route"));
router.use("/cart-items", require("../modules/cartItem/cartItem.route"));
router.use("/orders", require("../modules/order/order.route"));
router.use("/order-items", require("../modules/orderItem/orderItem.route"));
router.use("/payments", require("../modules/payment/payment.route"));
// Đăng ký trực tiếp (direct mapping) để tránh lỗi trailing-slash (404) của Express Router
router.get("/sepay-payment", (req, res) => res.json({ success: true, message: "SePay Webhook endpoint is active. Please use POST method." }));
router.post("/sepay-payment", require("../modules/payment/payment.controller").handleSepayWebhook);
router.use("/queues", require("../modules/queue/queue.route"));
router.use("/ratings", require("../modules/rating/rating.route"));
router.use(
  "/ingredient-categories",
  require("../modules/ingredientCategory/ingredientCategory.route"),
);
router.use("/ingredients", require("../modules/ingredient/ingredient.route"));
router.use(
  "/ingredient-batches",
  require("../modules/ingredientBatch/ingredientBatch.route"),
);
router.use(
  "/ingredient-transactions",
  require("../modules/ingredientTransaction/ingredientTransaction.route"),
);
router.use("/suppliers", require("../modules/supplier/supplier.route"));

module.exports = router;
