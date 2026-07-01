const express = require("express");
const controller = require("./ingredientTransaction.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

router.use(authenticate);
router.get(
  "/",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN_STAFF),
  controller.list,
);
router.post(
  "/",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN_STAFF),
  controller.create,
);
router.get(
  "/:id",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN_STAFF),
  controller.getById,
);
router.patch(
  "/:id",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  controller.updateById,
);
router.delete(
  "/:id",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  controller.deleteById,
);

module.exports = router;
