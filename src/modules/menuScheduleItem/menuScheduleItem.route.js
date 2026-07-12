const express = require("express");
const controller = require("./menuScheduleItem.controller");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

// Public routes (customers can browse items)
router.get("/", controller.list);
router.get("/:id", controller.getById);

const rateLimit = require("express-rate-limit");

const createItemLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Limit each IP to 20 create requests per `window` (per minute)
  message: { success: false, message: "Too many menu schedule items created from this IP, please try again after a minute" },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => process.env.NODE_ENV === "test" && req.headers["x-test-rate-limit"] !== "true",
});

// Protected routes (require login for manage/edit)
router.use(authenticate);
router.use(authorize(ROLES.MANAGER, ROLES.ADMIN));
router.post("/", createItemLimiter, controller.create);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;

