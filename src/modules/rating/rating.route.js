const express = require("express");
const controller = require("./rating.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { writeActivityLog } = require("../../middlewares/activityLog.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

router.use(authenticate);
router.get(
  "/",
  authorize(ROLES.CUSTOMER, ROLES.COUNTER_STAFF, ROLES.MANAGER, ROLES.ADMIN),
  controller.list,
);

// Customer creates a new rating
router.post("/", authorize(ROLES.CUSTOMER), controller.create);
router.post("/bulk", authorize(ROLES.CUSTOMER), controller.createMany);

// Customer views their own ratings
router.get("/me", authorize(ROLES.CUSTOMER), controller.listMine);
router.get("/me/:id", authorize(ROLES.CUSTOMER), controller.getMineById);
router.get(
  "/order/:orderId/items",
  authorize(ROLES.CUSTOMER),
  controller.listReviewableItems,
);

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
  writeActivityLog("REPLY_RATING", "Rating"),
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
