const express = require("express");
const controller = require("./user.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { avatarUpload } = require("../../middlewares/upload.middleware");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

router.use(authenticate);
router.get("/profile", controller.getProfile);
router.patch("/profile", controller.updateProfile);
router.post(
  "/profile/avatar",
  avatarUpload.single("avatar"),
  controller.uploadAvatar,
);
router.get("/", authorize(ROLES.ADMIN, ROLES.MANAGER), controller.listUsers);
router.get(
  "/:id",
  authorize(ROLES.ADMIN),
  controller.getUserById,
);
router.patch(
  "/:id/status",
  authorize(ROLES.ADMIN),
  controller.updateUserStatus,
);
router.patch(
  "/:id/role",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  controller.updateUserRole,
);

module.exports = router;
