const express = require("express");
const controller = require("./menuScheduleItem.controller");
const { authenticate } = require("../../middlewares/auth.middleware");

const router = express.Router();

// Public routes (customers can browse items)
router.get("/", controller.list);
router.get("/:id", controller.getById);

// Protected routes (require login for manage/edit)
router.use(authenticate);
router.post("/", controller.create);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;

