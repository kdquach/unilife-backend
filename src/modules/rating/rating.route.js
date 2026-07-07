const express = require("express");
const controller = require("./rating.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

router.use(authenticate);
router.get(
  "/",
  authorize(ROLES.COUNTER_STAFF, ROLES.MANAGER, ROLES.ADMIN),
  controller.list,
);

// Customer creates a new rating
router.post("/", authorize(ROLES.CUSTOMER), controller.create);

// Staff (COUNTER_STAFF, MANAGER, ADMIN) views a specific rating detail
router.get(
  "/:id",
  authorize(ROLES.COUNTER_STAFF, ROLES.MANAGER, ROLES.ADMIN),
  controller.getById,
);

// Staff (COUNTER_STAFF, MANAGER, ADMIN) replies to a customer's rating
router.patch(
  "/:id/reply",
  authorize(ROLES.COUNTER_STAFF, ROLES.MANAGER, ROLES.ADMIN),
  controller.reply,
);

// Customer edits their own rating, or Admin moderates
router.patch(
  "/:id",
  authorize(ROLES.CUSTOMER, ROLES.ADMIN),
  controller.updateById,
);

// Customer deletes their own rating, or Admin moderates
router.delete(
  "/:id",
  authorize(ROLES.CUSTOMER, ROLES.ADMIN),
  controller.deleteById,
);

module.exports = router;
