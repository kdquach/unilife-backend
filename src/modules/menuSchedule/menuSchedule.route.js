const express = require("express");
const controller = require("./menuSchedule.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { writeActivityLog } = require("../../middlewares/activityLog.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

// Public routes (customers can browse menus)
router.get("/today", controller.getToday);
router.get("/", controller.list);

// Protected routes (Staff View)
router.get("/staff", authenticate, authorize(ROLES.KITCHEN_STAFF, ROLES.MANAGER, ROLES.ADMIN), controller.listMenuScheduleForStaff);
router.get("/staff/:id", authenticate, authorize(ROLES.KITCHEN_STAFF, ROLES.MANAGER, ROLES.ADMIN), controller.getMenuScheduleByIdForStaff);

router.get("/:id", controller.getById);

// Protected routes (require login for manage/edit)
router.use(authenticate);
router.post("/", writeActivityLog("CREATE_MENU_SCHEDULE", "MenuSchedule"), controller.create);
router.patch("/:id", writeActivityLog("UPDATE_MENU_SCHEDULE", "MenuSchedule"), controller.updateById);
router.delete("/:id", writeActivityLog("DELETE_MENU_SCHEDULE", "MenuSchedule"), controller.deleteById);

module.exports = router;

