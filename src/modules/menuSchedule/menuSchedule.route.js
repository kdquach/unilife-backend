const express = require("express");
const controller = require("./menuSchedule.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { writeActivityLog } = require("../../middlewares/activityLog.middleware");
const ROLES = require("../../constants/roles.constant");
const { validate } = require("../../middlewares/validate.middleware");
const { updateMenuScheduleSchema, createMenuScheduleSchema } = require("./menuSchedule.validation");

const router = express.Router();

// Public routes (customers can browse menus)
router.get("/today", controller.getToday);
router.get("/", controller.list);

// Staff routes
router.get(
  "/staff",
  authenticate,
  authorize(ROLES.KITCHEN_STAFF, ROLES.MANAGER, ROLES.ADMIN),
  controller.listMenuScheduleForStaff
);

router.get(
  "/staff/:id",
  authenticate,
  authorize(ROLES.KITCHEN_STAFF, ROLES.MANAGER, ROLES.ADMIN),
  controller.getMenuScheduleByIdForStaff
);

router.get("/:id", controller.getById);

const rateLimit = require("express-rate-limit");

const createScheduleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: "Too many menu schedules created from this IP, please try again after a minute" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "test" && req.headers["x-test-rate-limit"] !== "true",
});

// Protected routes (require login for manage/edit)
router.use(authenticate);
router.use(authorize(ROLES.MANAGER, ROLES.ADMIN));
router.post("/", createScheduleLimiter, writeActivityLog("CREATE_MENU_SCHEDULE", "MenuSchedule"), validate(createMenuScheduleSchema), controller.create);
router.patch("/:id", writeActivityLog("UPDATE_MENU_SCHEDULE", "MenuSchedule"), validate(updateMenuScheduleSchema), controller.updateById);
router.delete("/:id", writeActivityLog("DELETE_MENU_SCHEDULE", "MenuSchedule"), controller.deleteById);

module.exports = router;
