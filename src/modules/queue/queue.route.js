const express = require("express");
const controller = require("./queue.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

router.use(authenticate);
router.get(
  "/monitor",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN_STAFF),
  controller.getMonitorQueue,
);
router.post(
  "/call-next",
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN_STAFF),
  controller.callNextNumber,
);
router.get("/", controller.list);
router.post("/", controller.create);
router.get("/:id", controller.getById);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;
