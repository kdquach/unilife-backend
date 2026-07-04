const ActivityLog = require("../modules/activityLog/activityLog.model");

const generateDescription = (action, req) => {
  const body = req.body || {};
  
  switch (action) {
    case "LOGIN":
      return `Đăng nhập vào hệ thống`;
    case "LOGOUT":
      return `Đăng xuất khỏi hệ thống`;
    case "CREATE_USER":
      return `Tạo tài khoản người dùng mới: ${body.fullName || ""} (${body.email || ""}) với vai trò ${body.role || ""}`;
    case "UPDATE_USER":
      return `Cập nhật thông tin tài khoản người dùng: ${body.fullName || ""} (${body.email || ""})`;
    case "UPDATE_USER_STATUS":
      return `Thay đổi trạng thái tài khoản của người dùng thành ${body.isActive ? "Hoạt động" : "Bị khóa"}`;
    case "UPDATE_USER_ROLE":
      return `Cập nhật vai trò người dùng thành ${body.role || ""}`;
    case "CREATE_INGREDIENT_CATEGORY":
      return `Tạo danh mục nguyên liệu mới: ${body.name || ""}`;
    case "UPDATE_INGREDIENT_CATEGORY":
      return `Cập nhật danh mục nguyên liệu: ${body.name || ""}`;
    case "DELETE_INGREDIENT_CATEGORY":
      return `Xóa danh mục nguyên liệu ID: ${req.params.id || ""}`;
    case "CREATE_INGREDIENT":
      return `Tạo nguyên liệu mới: ${body.name || ""}`;
    case "UPDATE_INGREDIENT":
      return `Cập nhật thông tin nguyên liệu: ${body.name || ""}`;
    case "DELETE_INGREDIENT":
      return `Xóa nguyên liệu ID: ${req.params.id || ""}`;
    case "ADJUST_INGREDIENT_STOCK":
      return `Điều chỉnh kho nguyên liệu: số lượng ${body.adjustment || 0} đơn vị, lý do: ${body.reason || "Không có lý do"}`;
    case "IMPORT_INGREDIENT_STOCK":
      return `Nhập kho nguyên liệu: số lượng ${body.quantity || 0} đơn vị từ nhà cung cấp ID ${body.supplierId || ""}`;
    case "CREATE_FOOD_CATEGORY":
      return `Tạo danh mục món ăn mới: ${body.name || ""}`;
    case "UPDATE_FOOD_CATEGORY":
      return `Cập nhật danh mục món ăn: ${body.name || ""}`;
    case "DELETE_FOOD_CATEGORY":
      return `Xóa danh mục món ăn ID: ${req.params.id || ""}`;
    case "CREATE_SUPPLIER":
      return `Thêm nhà cung cấp mới: ${body.name || ""}`;
    case "UPDATE_SUPPLIER":
      return `Cập nhật thông tin nhà cung cấp: ${body.name || ""}`;
    case "DELETE_SUPPLIER":
      return `Xóa nhà cung cấp ID: ${req.params.id || ""}`;
    case "CREATE_MENU_SCHEDULE":
      return `Tạo lịch trình menu mới cho ngày: ${body.date || ""}`;
    case "UPDATE_MENU_SCHEDULE":
      return `Cập nhật lịch trình menu ID: ${req.params.id || ""}`;
    case "DELETE_MENU_SCHEDULE":
      return `Xóa lịch trình menu ID: ${req.params.id || ""}`;
    case "CHECKOUT_ORDER":
      return `Khách hàng đặt đơn hàng mới, tổng tiền: ${body.totalAmount || 0}đ`;
    case "CREATE_WALK_IN_ORDER":
      return `Tạo đơn hàng trực tiếp tại quầy, tổng tiền: ${body.totalAmount || 0}đ`;
    case "UPDATE_ORDER":
      return `Cập nhật trạng thái đơn hàng thành ${body.status || ""}`;
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

module.exports = { writeActivityLog };
