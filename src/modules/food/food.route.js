const express = require("express");
const controller = require("./food.controller");
const { authenticate } = require("../../middlewares/auth.middleware");

const router = express.Router();

// Public - khách hàng xem danh sách & chi tiết món ăn (không cần đăng nhập)
router.get("/", controller.list);
router.get("/:id", controller.getById);

// Yêu cầu xác thực - thêm, sửa, xóa món ăn
router.use(authenticate);
router.post("/", controller.create);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;

