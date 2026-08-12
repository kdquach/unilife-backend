const express = require("express");
const controller = require("./food.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { writeActivityLog } = require("../../middlewares/activityLog.middleware");
const { foodUpload } = require("../../middlewares/upload.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const { createFoodSchema } = require("./food.validation");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

const kitchenStaffAccess = [
  authenticate,
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN_STAFF),
];
const managerAccess = [
  authenticate,
  authorize(ROLES.ADMIN, ROLES.MANAGER),
];

router.get("/kitchen", kitchenStaffAccess, controller.listForKitchen);
router.get("/kitchen/search", kitchenStaffAccess, controller.searchForKitchen);
router.get("/kitchen/filter", kitchenStaffAccess, controller.filterForKitchen);
router.get(
  "/kitchen/filter-options",
  kitchenStaffAccess,
  controller.kitchenFilterOptions,
);
router.get("/kitchen/:id", kitchenStaffAccess, controller.getByIdForKitchen);

// feature filter food
router.get("/filter-options", controller.filterOptions);
router.get("/filter", controller.filter);
// feature search food
router.get("/search", controller.search);
router.get("/", controller.list);
// get food detail 
router.get("/daily", controller.getDailyFoods);
router.get("/:id", controller.getById);

router.post(
  "/",
  managerAccess,
  foodUpload.single("image"),
  validate(createFoodSchema),
  writeActivityLog("CREATE_FOOD", "Food"),
  controller.create,
);
router.patch(
  "/:id",
  managerAccess,
  foodUpload.single("image"),
  writeActivityLog("UPDATE_FOOD", "Food"),
  controller.updateById,
);
router.delete(
  "/:id",
  managerAccess,
  writeActivityLog("DELETE_FOOD", "Food"),
  controller.deleteById,
);

module.exports = router;
