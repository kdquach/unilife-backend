const express = require("express");
const controller = require("./activityLog.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

router.use(authenticate);
router.use(authorize(ROLES.ADMIN, ROLES.MANAGER));

router.get("/", controller.list);
router.get("/stats", controller.getStats);
router.post("/", controller.create);
router.get("/:id", controller.getById);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;
