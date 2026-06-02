const express = require("express");
const controller = require("./auth.controller");
const { authenticate } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.post("/register", controller.register);
router.post("/login", controller.login);
router.post("/refresh-token", controller.refresh);
router.post("/forgot-password", controller.forgotPassword);
router.post("/reset-password", controller.resetPassword);
router.post("/logout", authenticate, controller.logout);
router.patch("/change-password", authenticate, controller.changePassword);
router.get("/me", authenticate, controller.me);

module.exports = router;
