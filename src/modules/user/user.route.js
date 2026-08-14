const express = require("express");
const controller = require("./user.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { avatarUpload } = require("../../middlewares/upload.middleware");
const { writeActivityLog } = require("../../middlewares/activityLog.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const { updateProfileSchema } = require("../auth/auth.validation");
const ROLES = require("../../constants/roles.constant");

const router = express.Router();

router.use(authenticate);
router.get("/profile", controller.getProfile);
router.patch("/profile", validate(updateProfileSchema), writeActivityLog("UPDATE_PROFILE", "User"), controller.updateProfile);
router.post(
  "/profile/avatar",
  avatarUpload.single("avatar"),
  controller.uploadAvatar,
);
router.get("/", authorize(ROLES.ADMIN, ROLES.MANAGER), controller.listUsers);
router.get(
  "/staffs",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  controller.listStaffs,
);
router.post(
  "/staffs",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  writeActivityLog("CREATE_STAFF", "User"),
  controller.createStaff,
);
router.get(
  "/staffs/:id",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  controller.getStaffById,
);
router.patch(
  "/staffs/:id/role",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  writeActivityLog("CHANGE_STAFF_ROLE", "User"),
  controller.changeStaffRole,
);
router.patch(
  "/staffs/:id",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  writeActivityLog("UPDATE_STAFF", "User"),
  controller.updateStaff,
);
router.get(
  "/:id",
  authorize(ROLES.ADMIN),
  controller.getUserById,
);

router.post(
  "/",
  authorize(ROLES.ADMIN),
  writeActivityLog("CREATE_USER", "User"),
  controller.createUser,
);
router.patch(
  "/:id",
  authorize(ROLES.ADMIN),
  writeActivityLog("UPDATE_USER", "User"),
  controller.updateUser,
);
router.patch(
  "/:id/status",
  authorize(ROLES.ADMIN),
  writeActivityLog("UPDATE_USER_STATUS", "User"),
  controller.updateUserStatus,
);
router.patch(
  "/:id/role",
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  writeActivityLog("UPDATE_USER_ROLE", "User"),
  controller.updateUserRole,
);

module.exports = router;
