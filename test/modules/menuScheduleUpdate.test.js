const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/modules/user/user.model");
const IngredientCategory = require("../../src/modules/ingredientCategory/ingredientCategory.model");
const Ingredient = require("../../src/modules/ingredient/ingredient.model");
const IngredientBatch = require("../../src/modules/ingredientBatch/ingredientBatch.model");
const FoodCategory = require("../../src/modules/foodCategory/foodCategory.model");
const Food = require("../../src/modules/food/food.model");
const FoodIngredient = require("../../src/modules/foodIngredient/foodIngredient.model");
const MenuSchedule = require("../../src/modules/menuSchedule/menuSchedule.model");
const MenuScheduleItem = require("../../src/modules/menuScheduleItem/menuScheduleItem.model");
const { signAccessToken } = require("../../src/utils/jwt.util");

let adminToken;
let staffToken;
let customerToken;
let foodId;
let adminId;

beforeAll(async () => {
  // Setup JWT Secrets
  process.env.JWT_ACCESS_SECRET = "test_secret";
  process.env.JWT_REFRESH_SECRET = "test_secret";

  const admin = await User.create({
    email: "admin_update@example.com",
    passwordHash: "password123",
    fullName: "Admin Update",
    role: "ADMIN",
    isActive: true,
  });
  adminId = admin._id;
  adminToken = signAccessToken({ userId: admin._id, role: admin.role });

  const staff = await User.create({
    email: "staff_update@example.com",
    passwordHash: "password123",
    fullName: "Staff Update",
    role: "KITCHEN_STAFF",
    isActive: true,
  });
  staffToken = signAccessToken({ userId: staff._id, role: staff.role });

  const customer = await User.create({
    email: "customer_update@example.com",
    passwordHash: "password123",
    fullName: "Customer Update",
    role: "CUSTOMER",
    isActive: true,
  });
  customerToken = signAccessToken({ userId: customer._id, role: customer.role });

  const ic = await IngredientCategory.create({ name: "Update IC" });
  const ing = await Ingredient.create({ name: "Update Ing", categoryId: ic._id, unit: "kg", currentStock: 100 });
  await IngredientBatch.create({ ingredientId: ing._id, quantity: 100, remainingQuantity: 100 });

  const fc = await FoodCategory.create({ name: "Update FC" });
  const food = await Food.create({ name: "Update Food", categoryId: fc._id, price: 10, isMenuItem: true });
  foodId = food._id;

  await FoodIngredient.create({ foodId: food._id, ingredientId: ing._id, quantityPerServing: 1 });
});

afterEach(async () => {
  await MenuSchedule.deleteMany({});
  await MenuScheduleItem.deleteMany({});
});

describe("Menu Schedule Update API", () => {
  // A. Bảo mật & Ủy quyền (Security & RBAC)
  describe("A. Security & RBAC", () => {
    it("Test Case 1: should return 401 if no token provided", async () => {
      const ms = await MenuSchedule.create({ date: new Date(Date.now() + 86400000), createdBy: adminId });
      const res = await request(app).patch(`/api/v1/menu-schedules/${ms._id}`).send({ status: "PUBLISHED" });
      expect(res.status).toBe(401);
    });

    it("Test Case 2: should return 403 if role is KITCHEN_STAFF or CUSTOMER", async () => {
      const ms = await MenuSchedule.create({ date: new Date(Date.now() + 86400000), createdBy: adminId });
      
      const resStaff = await request(app)
        .patch(`/api/v1/menu-schedules/${ms._id}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "PUBLISHED" });
      expect(resStaff.status).toBe(403);

      const resCustomer = await request(app)
        .patch(`/api/v1/menu-schedules/${ms._id}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ status: "PUBLISHED" });
      expect(resCustomer.status).toBe(403);
    });

    it("Test Case 3: Mass Assignment Prevention", async () => {
      const ms = await MenuSchedule.create({ date: new Date(Date.now() + 86400000), createdBy: adminId });
      
      const res = await request(app)
        .patch(`/api/v1/menu-schedules/${ms._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          status: "PUBLISHED",
          isActive: false, // Malicious
          createdBy: new mongoose.Types.ObjectId() // Malicious
        });
      
      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/Mass Assignment Blocked/i);
    });
  });

  // B. Logic Nghiệp vụ Lịch Menu (Business Logic Validation)
  describe("B. Business Logic Validation", () => {
    it("Test Case 4: Date Normalization", async () => {
      const ms = await MenuSchedule.create({ date: new Date(Date.now() + 86400000), createdBy: adminId });
      
      // Send a date with arbitrary time: 14:30:00Z
      const futureDateStr = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10) + "T14:30:00Z";
      
      const res = await request(app)
        .patch(`/api/v1/menu-schedules/${ms._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ date: futureDateStr });
      
      expect(res.status).toBe(200);
      
      const updatedMs = await MenuSchedule.findById(ms._id);
      // Ensure time is stripped / start-of-day in Vietnam time
      // Mongoose saves Date as UTC, but it should represent 00:00:00 of Vietnam time (which is 17:00:00 UTC previous day)
      const dateOnly = futureDateStr.slice(0, 10);
      const expectedDate = new Date(dateOnly + "T00:00:00+07:00");
      expect(updatedMs.date.getTime()).toBe(expectedDate.getTime());
    });

    it("Test Case 5: Reject update for frozen/past menu schedule", async () => {
      // Create a schedule for yesterday
      const ms = await MenuSchedule.create({ date: new Date(Date.now() - 86400000), createdBy: adminId });
      
      const res = await request(app)
        .patch(`/api/v1/menu-schedules/${ms._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "PUBLISHED" });
      
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/frozen\/past/i);
    });

    it("Test Case 6: Reject date update if schedule has reserved items", async () => {
      const ms = await MenuSchedule.create({ date: new Date(Date.now() + 86400000), createdBy: adminId, status: "PUBLISHED" });
      await MenuScheduleItem.create({
        menuScheduleId: ms._id,
        foodId,
        maxServing: 10,
        remainingCount: 5,
        reservedCount: 5,
        servedCount: 0
      });

      const newDateStr = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
      
      const res = await request(app)
        .patch(`/api/v1/menu-schedules/${ms._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ date: newDateStr });
      
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Cannot change date because some items are already reserved/i);
    });
  });

  // C. Chuyển Đổi Trạng Thái (State Transition Matrix)
  describe("C. State Transition Matrix", () => {
    it("Test Case 7: Reject invalid status transitions", async () => {
      const ms = await MenuSchedule.create({ date: new Date(Date.now() + 86400000), createdBy: adminId, status: "DRAFT" });
      
      // DRAFT -> COMPLETED is invalid
      let res = await request(app)
        .patch(`/api/v1/menu-schedules/${ms._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "COMPLETED" });
      expect(res.status).toBe(400);

      // CANCELLED -> PUBLISHED is invalid
      ms.status = "CANCELLED";
      await ms.save();
      
      res = await request(app)
        .patch(`/api/v1/menu-schedules/${ms._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "PUBLISHED" });
      expect(res.status).toBe(400);
    });

    it("Test Case 8: Accept valid status transitions", async () => {
      const ms = await MenuSchedule.create({ date: new Date(Date.now() + 86400000), createdBy: adminId, status: "DRAFT" });
      await MenuScheduleItem.create({
        menuScheduleId: ms._id,
        foodId,
        maxServing: 10,
        remainingCount: 10,
        reservedCount: 0,
        servedCount: 0,
        isActive: true
      });
      
      // DRAFT -> PUBLISHED
      const res = await request(app)
        .patch(`/api/v1/menu-schedules/${ms._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "PUBLISHED" });
      
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("PUBLISHED");
    });

    it("Test Case 9: Downgrade Block", async () => {
      const ms = await MenuSchedule.create({ date: new Date(Date.now() + 86400000), createdBy: adminId, status: "PUBLISHED" });
      await MenuScheduleItem.create({
        menuScheduleId: ms._id,
        foodId,
        maxServing: 10,
        remainingCount: 5,
        reservedCount: 5,
        servedCount: 0
      });
      
      const res = await request(app)
        .patch(`/api/v1/menu-schedules/${ms._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "DRAFT" });
      
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Cannot downgrade to DRAFT because some items are already reserved/i);
    });
  });

  // D. Hủy Lịch & Xử lý Tồn Kho (Cancellation & Inventory)
  describe("D. Cancellation & Inventory", () => {
    it("Test Case 10: Cancel Refund & Sync", async () => {
      const ms = await MenuSchedule.create({ date: new Date(Date.now() + 86400000), createdBy: adminId, status: "PUBLISHED" });
      
      // Need to use supertest to create an item to trigger the real inventory deduction first
      const itemRes = await request(app)
        .post("/api/v1/menu-schedule-items")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ menuScheduleId: ms._id, foodId, maxServing: 10 });
      
      expect(itemRes.status).toBe(201);
      const itemId = itemRes.body.data._id;
      
      // Check initial stock (deducted by 10)
      const ingBefore = await Ingredient.findOne({ name: "Update Ing" });
      const initialStock = ingBefore.currentStock; // Should be 90 (100 - 10)

      const res = await request(app)
        .patch(`/api/v1/menu-schedules/${ms._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "CANCELLED" });
      
      expect(res.status).toBe(200);
      
      // Verify Menu Schedule
      const updatedMs = await MenuSchedule.findById(ms._id);
      expect(updatedMs.status).toBe("CANCELLED");
      expect(updatedMs.isActive).toBe(false); // MUST be false
      
      // Verify Menu Schedule Item
      const updatedItem = await MenuScheduleItem.findById(itemId);
      expect(updatedItem.isActive).toBe(false); // MUST be false
      expect(updatedItem.maxServing).toBe(0); // Refunded
      
      // Verify Ingredient Refund
      const ingAfter = await Ingredient.findOne({ name: "Update Ing" });
      expect(ingAfter.currentStock).toBe(initialStock + 10); // Refunded 10
    });
  });

  // E. Đồng Thời (Concurrency)
  describe("E. Concurrency", () => {
    it("Test Case 11: Concurrent Updates (Optimistic Concurrency Control)", async () => {
      const ms = await MenuSchedule.create({ date: new Date(Date.now() + 86400000), createdBy: adminId, status: "DRAFT" });
      await MenuScheduleItem.create({
        menuScheduleId: ms._id,
        foodId,
        maxServing: 10,
        remainingCount: 10,
        reservedCount: 0,
        servedCount: 0,
        isActive: true
      });
      
      // Fire 2 update requests in parallel without awaiting
      const resPromise1 = request(app)
        .patch(`/api/v1/menu-schedules/${ms._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "PUBLISHED" });
        
      const resPromise2 = request(app)
        .patch(`/api/v1/menu-schedules/${ms._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "CANCELLED" });

      const [res1, res2] = await Promise.all([resPromise1, resPromise2]);
      
      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(409); // VersionError
      
      const successRes = res1.status === 200 ? res1 : res2;
      const errorRes = res1.status === 409 ? res1 : res2;
      
      expect(errorRes.body.message).toMatch(/Data was modified by another user/i);
    });
  });
});
