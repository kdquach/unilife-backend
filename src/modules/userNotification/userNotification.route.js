const express = require("express");
const controller = require("./userNotification.controller");
const { authenticate } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);
router.get("/login-welcome", controller.loginWelcome);
router.get("/me", controller.listMine);
router.get("/me/:id", controller.getMineById);
router.get("/", controller.list);
router.post("/", controller.create);
router.get("/:id", controller.getById);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;
