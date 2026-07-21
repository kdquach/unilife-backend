const ActivityLog = require("../modules/activityLog/activityLog.model");

const generateDescription = (action, req) => {
  const body = req.body || {};
  
  switch (action) {
    case "CREATE_USER":
      return `Created new user account: ${body.fullName || ""} (${body.email || ""}) with role ${body.role || ""}`;
    case "UPDATE_USER":
      return `Updated user account information: ${body.fullName || ""} (${body.email || ""})`;
    case "UPDATE_USER_STATUS":
      return `Changed user account status to ${body.isActive ? "Active" : "Locked"}`;
    case "UPDATE_USER_ROLE":
      return `Updated user role to ${body.role || ""}`;
    case "CREATE_INGREDIENT_CATEGORY":
      return `Created new ingredient category: ${body.name || ""}`;
    case "UPDATE_INGREDIENT_CATEGORY":
      return `Updated ingredient category: ${body.name || ""}`;
    case "DELETE_INGREDIENT_CATEGORY":
      return `Deleted ingredient category ID: ${req.params.id || ""}`;
    case "CREATE_INGREDIENT":
      return `Created new ingredient: ${body.name || ""}`;
    case "UPDATE_INGREDIENT":
      return `Updated ingredient information: ${body.name || ""}`;
    case "DELETE_INGREDIENT":
      return `Deleted ingredient ID: ${req.params.id || ""}`;
    case "ADJUST_INGREDIENT_STOCK":
      return `Adjusted ingredient stock: amount ${body.adjustment || 0} units, reason: ${body.reason || "No reason provided"}`;
    case "IMPORT_INGREDIENT_STOCK":
      return `Imported ingredient stock: amount ${body.quantity || 0} units from supplier ID ${body.supplierId || ""}`;
    case "CREATE_FOOD_CATEGORY":
      return `Created new food category: ${body.name || ""}`;
    case "UPDATE_FOOD_CATEGORY":
      return `Updated food category: ${body.name || ""}`;
    case "DELETE_FOOD_CATEGORY":
      return `Deleted food category ID: ${req.params.id || ""}`;
    case "CREATE_SUPPLIER":
      return `Added new supplier: ${body.name || ""}`;
    case "UPDATE_SUPPLIER":
      return `Updated supplier information: ${body.name || ""}`;
    case "DELETE_SUPPLIER":
      return `Deleted supplier ID: ${req.params.id || ""}`;
    case "CREATE_MENU_SCHEDULE":
      return `Created new menu schedule for date: ${body.date || ""}`;
    case "UPDATE_MENU_SCHEDULE":
      return `Updated menu schedule ID: ${req.params.id || ""}`;
    case "DELETE_MENU_SCHEDULE":
      return `Deleted menu schedule ID: ${req.params.id || ""}`;
    case "CHECKOUT_ORDER":
      return `Customer placed new order, total amount: ${body.totalAmount || 0} VND`;
    case "CREATE_WALK_IN_ORDER":
      return `Created walk-in order, total amount: ${body.totalAmount || 0} VND`;
    case "UPDATE_ORDER":
      return `Updated order status to ${body.status || ""}`;
    default:
      return `${req.method} ${req.originalUrl}`;
  }
};

const writeActivityLog =
  (action, targetType = null) =>
  async (req, res, next) => {
    res.on("finish", async () => {
      try {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          const description = generateDescription(action, req);
          await ActivityLog.create({
            userId: req.user?._id,
            action,
            targetType,
            targetId: req.params.id || null,
            description,
            ipAddress: req.ip,
          });
        }
      } catch (err) {
        console.error("Activity log failed:", err.message);
      }
    });
    next();
  };

module.exports = { writeActivityLog, generateDescription };
