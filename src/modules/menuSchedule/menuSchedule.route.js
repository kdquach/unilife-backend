const express = require("express");
const controller = require("./menuSchedule.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

// Public routes (customers can browse menus)
router.get("/today", controller.getToday);
router.get("/", controller.list);

// Protected routes (Staff View)
router.get("/staff", authenticate, authorize(ROLES.KITCHEN_STAFF, ROLES.MANAGER, ROLES.ADMIN), controller.getStaffList);

router.get("/:id", controller.getById);

// Protected routes (require login for manage/edit)
router.use(authenticate);
router.post("/", controller.create);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;

