const express = require("express");
const controller = require("./ingredient.controller");
const { authenticate } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);
router.get("/", controller.list);
router.post("/", controller.create);
router.get("/:id", controller.getById);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;
