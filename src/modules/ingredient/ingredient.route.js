const express = require("express");
const controller = require("./ingredient.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { writeActivityLog } = require("../../middlewares/activityLog.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

router.use(authenticate);
router.get(
  "/search",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN_STAFF),
  controller.search,
);
router.get(
  "/filter",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN_STAFF),
  controller.filter,
);
router.get(
  "/",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN_STAFF),
  controller.list,
);
router.post("/", authorize(ROLES.ADMIN, ROLES.MANAGER), writeActivityLog("CREATE_INGREDIENT", "Ingredient"), controller.create);
router.post(
  "/:id/adjust-stock",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN_STAFF),
  writeActivityLog("ADJUST_INGREDIENT_STOCK", "Ingredient"),
  controller.adjustStock,
);
router.post(
  "/:id/stock-import",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  writeActivityLog("IMPORT_INGREDIENT_STOCK", "IngredientBatch"),
  controller.recordStockImport,
);
router.get(
  "/:id",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN_STAFF),
  controller.getById,
);
router.patch(
  "/:id",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  writeActivityLog("UPDATE_INGREDIENT", "Ingredient"),
  controller.updateById,
);
router.delete(
  "/:id",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  writeActivityLog("DELETE_INGREDIENT", "Ingredient"),
  controller.deleteById,
);

module.exports = router;
