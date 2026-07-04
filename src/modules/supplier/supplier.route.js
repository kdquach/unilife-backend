const express = require("express");
const controller = require("./supplier.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { writeActivityLog } = require("../../middlewares/activityLog.middleware");

const router = express.Router();

router.use(authenticate);
router.get("/", controller.list);
router.post("/", writeActivityLog("CREATE_SUPPLIER", "Supplier"), controller.create);
router.get("/:id", controller.getById);
router.get("/:id/batches", controller.getBatches);
router.patch("/:id", writeActivityLog("UPDATE_SUPPLIER", "Supplier"), controller.updateById);
router.delete("/:id", writeActivityLog("DELETE_SUPPLIER", "Supplier"), controller.deleteById);

module.exports = router;
