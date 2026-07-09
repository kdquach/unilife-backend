const express = require("express");
const controller = require("./ingredientCategory.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { writeActivityLog } = require("../../middlewares/activityLog.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

// Public
router.get("/", controller.list);
router.get("/:id", controller.getById);

// Protected
router.use(authenticate);
router.use(authorize(ROLES.ADMIN, ROLES.MANAGER));

router.post("/", writeActivityLog("CREATE_INGREDIENT_CATEGORY", "IngredientCategory"), controller.create);
router.patch("/:id", writeActivityLog("UPDATE_INGREDIENT_CATEGORY", "IngredientCategory"), controller.updateById);
router.delete("/:id", writeActivityLog("DELETE_INGREDIENT_CATEGORY", "IngredientCategory"), controller.deleteById);

module.exports = router;