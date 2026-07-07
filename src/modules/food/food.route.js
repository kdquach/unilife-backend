const express = require("express");
const controller = require("./food.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

const kitchenStaffAccess = [
  authenticate,
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN_STAFF),
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
router.get("/:id", controller.getById);

router.use(authenticate);
router.post("/", controller.create);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;
