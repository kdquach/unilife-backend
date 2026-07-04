const express = require("express");
const controller = require("./rating.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

router.get("/", controller.list);

router.use(authenticate);
router.get("/me", authorize(ROLES.CUSTOMER), controller.listMine);
router.get("/me/:id", authorize(ROLES.CUSTOMER), controller.getMineById);
router.post("/", authorize(ROLES.CUSTOMER), controller.create);
router.patch("/:id", authorize(ROLES.CUSTOMER), controller.updateById);
router.delete("/:id", authorize(ROLES.CUSTOMER), controller.deleteById);
router.get("/:id", authorize(ROLES.ADMIN, ROLES.MANAGER), controller.getById);

module.exports = router;
