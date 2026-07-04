const express = require("express");
const controller = require("./foodCategory.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { writeActivityLog } = require("../../middlewares/activityLog.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

// Public routes (customers can view categories)
router.get("/", controller.list);
router.get("/:id", controller.getById);

// Protected routes (require login for write actions)
router.use(authenticate);
router.use(authorize(ROLES.ADMIN, ROLES.MANAGER));
router.post("/", writeActivityLog("CREATE_FOOD_CATEGORY", "FoodCategory"), controller.create);
router.patch("/:id", writeActivityLog("UPDATE_FOOD_CATEGORY", "FoodCategory"), controller.updateById);
router.delete("/:id", writeActivityLog("DELETE_FOOD_CATEGORY", "FoodCategory"), controller.deleteById);

module.exports = router;

