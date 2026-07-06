const express = require("express");
const controller = require("./rating.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize(ROLES.COUNTER_STAFF, ROLES.MANAGER, ROLES.ADMIN), controller.list);
router.post("/", controller.create);
router.get("/:id", authorize(ROLES.COUNTER_STAFF, ROLES.MANAGER, ROLES.ADMIN), controller.getById);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;
