const express = require("express");
const controller = require("./foodCategory.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

// Public routes (customers can view categories)
router.get("/", controller.list);
router.get("/:id", controller.getById);

// Protected routes (require login for write actions)
router.use(authenticate);
router.use(authorize(ROLES.ADMIN, ROLES.MANAGER));
router.post("/", controller.create);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;

