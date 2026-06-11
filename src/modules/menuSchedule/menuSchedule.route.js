const express = require("express");
const controller = require("./menuSchedule.controller");
const { authenticate } = require("../../middlewares/auth.middleware");

const router = express.Router();

// Public routes (customers can browse menus)
router.get("/today", controller.getToday);
router.get("/", controller.list);
router.get("/:id", controller.getById);

// Protected routes (require login for manage/edit)
router.use(authenticate);
router.post("/", controller.create);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;

