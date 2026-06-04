const express = require("express");
const controller = require("./food.controller");
const { authenticate } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.get("/filter-options", controller.getFilterOptions);
router.get("/filter", controller.filter);
router.get("/search", controller.search);
router.use(authenticate);
router.get("/", controller.list);
router.post("/", controller.create);
router.get("/:id", controller.getById);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;
