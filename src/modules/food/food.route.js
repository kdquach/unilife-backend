const express = require("express");
const controller = require("./food.controller");
const { authenticate } = require("../../middlewares/auth.middleware");

const router = express.Router();
// feature filter food
router.get("/filter-options", controller.filterOptions);
router.get("/filter", controller.filter);
// feature search food
router.get("/search", controller.search);
router.get("/", controller.list);
// get food detail 
router.get("/:id", controller.getById);

router.use(authenticate);
router.post("/", controller.create);
router.patch("/:id", controller.updateById);
router.delete("/:id", controller.deleteById);

module.exports = router;
