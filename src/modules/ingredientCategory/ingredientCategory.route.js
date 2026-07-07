const express = require("express");
const controller = require("./ingredientCategory.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

// Public
router.get("/", controller.list);
router.get("/:id", controller.getById);

// Protected
router.use(authenticate);
router.use(authorize(ROLES.ADMIN, ROLES.MANAGER));

router.post("/", controller.create);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;