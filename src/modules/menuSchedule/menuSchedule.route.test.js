const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");

const routes = require("../../routes");
const User = require("../user/user.model");
const MenuSchedule = require("./menuSchedule.model");
const MenuScheduleItem = require("../menuScheduleItem/menuScheduleItem.model");
const Food = require("../food/food.model");
const FoodCategory = require("../foodCategory/foodCategory.model");
const ROLES = require("../../constants/roles.constant");
const jwt = require("jsonwebtoken");

process.env.JWT_ACCESS_SECRET = "test-secret-for-jwt";


const app = express();
app.use(express.json());
app.use("/api/v1", routes);





beforeEach(async () => {
  // Quality Standard: Test isolation verified (no shared state) & Test data cleaned up
  await User.deleteMany({});
  await MenuSchedule.deleteMany({});
  await MenuScheduleItem.deleteMany({});
  await Food.deleteMany({});
  await FoodCategory.deleteMany({});
});

const createTestUser = async (role) => {
  const user = await User.create({
    email: `${role.toLowerCase()}@test.com`,
    passwordHash: "hashedpassword",
    fullName: "Test User",
    role,
    isActive: true,
  });
  const token = jwt.sign({ userId: user._id, role }, process.env.JWT_ACCESS_SECRET, { expiresIn: "1h" });
  return { user, token };
};

describe("GET /api/v1/menu-schedules/staff", () => {
  
  describe("Authentication & Authorization Edge Cases", () => {
    it("should return 401 if no authorization header is provided", async () => {
      const res = await request(app).get("/api/v1/menu-schedules/staff");
      if (res.status === 500) console.log(res.text);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/token/i);
    });

    it("should return 401 if token is invalid or expired", async () => {
      const res = await request(app)
        .get("/api/v1/menu-schedules/staff")
        .set("Authorization", "Bearer invalid-token");
      expect(res.status).toBe(401);
    });

    it("should return 403 if user is a CUSTOMER (unauthorized role)", async () => {
      const { token } = await createTestUser(ROLES.CUSTOMER);
      const res = await request(app)
        .get("/api/v1/menu-schedules/staff")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
    
    it("should return 200 for allowed roles: KITCHEN_STAFF, MANAGER, ADMIN", async () => {
      const roles = [ROLES.KITCHEN_STAFF, ROLES.MANAGER, ROLES.ADMIN];
      for (const role of roles) {
        const { token } = await createTestUser(role);
        const res = await request(app)
          .get("/api/v1/menu-schedules/staff")
          .set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(200);
      }
    });
  });

  describe("Functionality & Filter Branches", () => {
    let token;
    beforeEach(async () => {
      // Use KITCHEN_STAFF as the default authorized user for functionality tests
      const auth = await createTestUser(ROLES.KITCHEN_STAFF);
      token = auth.token;
      
      // Seed Data: Categories & Foods
      const category = await FoodCategory.create({ name: "Main Course", description: "Desc" });
      const food = await Food.create({
        name: "Fried Rice",
        categoryId: category._id,
        price: 30000,
        status: "AVAILABLE"
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 2);

      // Seed Data: Menu Schedules
      const schedule1 = await MenuSchedule.create({
        status: "DRAFT",
        date: new Date("2028-06-25T00:00:00.000Z"),
      });
      const schedule2 = await MenuSchedule.create({
        status: "PUBLISHED",
        date: new Date("2028-06-26T00:00:00.000Z"),
      });
      const schedule3 = await MenuSchedule.create({
        status: "PUBLISHED",
        date: new Date("2028-06-27T00:00:00.000Z"),
      });

      // Seed Data: Items (Linking food to schedule)
      await MenuScheduleItem.create({
        menuScheduleId: schedule1._id,
        foodId: food._id,
        maxServing: 100,
        remainingCount: 100,
        isActive: true,
      });
    });

    it("should fetch all menu schedules when no filters are applied", async () => {
      const res = await request(app)
        .get("/api/v1/menu-schedules/staff")
        .set("Authorization", `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(3); // 3 seeded schedules
      expect(res.body.data.pagination.total).toBe(3);
    });

    it("should filter menu schedules by exact status branch", async () => {
      const res = await request(app)
        .get("/api/v1/menu-schedules/staff?status=DRAFT")
        .set("Authorization", `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].status).toBe("DRAFT");
    });

    it("should filter menu schedules by multiple statuses (e.g., DRAFT,PUBLISHED)", async () => {
      const res = await request(app)
        .get("/api/v1/menu-schedules/staff?status=DRAFT,PUBLISHED")
        .set("Authorization", `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(3); // Since we seeded 1 DRAFT and 2 PUBLISHED
    });

    it("should filter menu schedules by exact date branch", async () => {
      const res = await request(app)
        .get("/api/v1/menu-schedules/staff?date=2028-06-26")
        .set("Authorization", `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
    });

    it("should filter menu schedules by dateFrom and dateTo range branch", async () => {
      const res = await request(app)
        .get("/api/v1/menu-schedules/staff?dateFrom=2028-06-25&dateTo=2028-06-26")
        .set("Authorization", `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
    });

    it("should handle pagination limit and page branch correctly", async () => {
      const res = await request(app)
        .get("/api/v1/menu-schedules/staff?limit=2&page=1")
        .set("Authorization", `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.pagination.limit).toBe(2);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.totalPages).toBe(2); // total 3, limit 2
    });

    it("should correctly populate menu schedule items and nested food details", async () => {
      const res = await request(app)
        .get("/api/v1/menu-schedules/staff?status=DRAFT")
        .set("Authorization", `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      const schedule = res.body.data.items[0];
      expect(schedule.items).toHaveLength(1);
      expect(schedule.items[0].maxServing).toBe(100);
      expect(schedule.items[0].foodId).toBeDefined();
      expect(schedule.items[0].foodId.name).toBe("Fried Rice");
      expect(schedule.items[0].foodId.categoryId.name).toBe("Main Course");
    });
  });

  describe("GET /api/v1/menu-schedules/staff/:id", () => {
    let token, scheduleId;

    beforeEach(async () => {
      const auth = await createTestUser(ROLES.KITCHEN_STAFF);
      token = auth.token;

      const category = await FoodCategory.create({ name: "Dessert", description: "Desc" });
      const food1 = await Food.create({ name: "Cake", categoryId: category._id, price: 10000, status: "AVAILABLE" });
      const food2 = await Food.create({ name: "Ice Cream", categoryId: category._id, price: 15000, status: "AVAILABLE" });

      const schedule = await MenuSchedule.create({
        status: "PUBLISHED",
        date: new Date(),
      });
      scheduleId = schedule._id.toString();

      // Active Item
      await MenuScheduleItem.create({
        menuScheduleId: schedule._id,
        foodId: food1._id,
        maxServing: 50,
        remainingCount: 50,
        isActive: true,
      });

      // Inactive Item
      await MenuScheduleItem.create({
        menuScheduleId: schedule._id,
        foodId: food2._id,
        maxServing: 20,
        remainingCount: 20,
        isActive: false,
      });
    });

    it("should return 401 if no authorization header is provided", async () => {
      const res = await request(app).get(`/api/v1/menu-schedules/staff/${scheduleId}`);
      expect(res.status).toBe(401);
    });

    it("should return 403 if user is a CUSTOMER", async () => {
      const { token: customerToken } = await createTestUser(ROLES.CUSTOMER);
      const res = await request(app)
        .get(`/api/v1/menu-schedules/staff/${scheduleId}`)
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });

    it("should return 404 if schedule ID does not exist", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/v1/menu-schedules/staff/${fakeId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it("should return 200 and only active items by default", async () => {
      const res = await request(app)
        .get(`/api/v1/menu-schedules/staff/${scheduleId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].foodId.name).toBe("Cake");
    });

    it("should return 200 and include inactive items if includeInactive=true", async () => {
      const res = await request(app)
        .get(`/api/v1/menu-schedules/staff/${scheduleId}?includeInactive=true`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
    });
  });

  describe("POST /api/v1/menu-schedules", () => {
    let token;
    beforeEach(async () => {
      const auth = await createTestUser(ROLES.MANAGER);
      token = auth.token;
    });

    it("should return 401 if unauthorized", async () => {
      const res = await request(app).post("/api/v1/menu-schedules").send({ date: "2026-08-01" });
      expect(res.status).toBe(401);
    });

    it("should return 400 for missing date", async () => {
      const res = await request(app)
        .post("/api/v1/menu-schedules")
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(422);
    });

    it("should return 400 for past date", async () => {
      const res = await request(app)
        .post("/api/v1/menu-schedules")
        .set("Authorization", `Bearer ${token}`)
        .send({ date: "2020-01-01" });
      expect(res.status).toBe(400);
    });

    it("should block mass assignment and only save date", async () => {
      const res = await request(app)
        .post("/api/v1/menu-schedules")
        .set("Authorization", `Bearer ${token}`)
        .send({ date: "2026-10-10", status: "PUBLISHED" });
      expect(res.status).toBe(422); // 422 Unprocessable Entity because of Joi Validation .unknown(false)
    });
    
    it("should create successfully with only date", async () => {
      const res = await request(app)
        .post("/api/v1/menu-schedules")
        .set("Authorization", `Bearer ${token}`)
        .send({ date: "2026-10-10" });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("DRAFT");
    });
  });

  describe("PATCH /api/v1/menu-schedules/:id", () => {
    let token, scheduleId;
    beforeEach(async () => {
      const auth = await createTestUser(ROLES.MANAGER);
      token = auth.token;
      
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      const schedule = await MenuSchedule.create({
        status: "DRAFT",
        date: futureDate,
      });
      scheduleId = schedule._id.toString();
    });

    it("should return 401 if unauthorized", async () => {
      const res = await request(app).patch(`/api/v1/menu-schedules/${scheduleId}`).send({ status: "PUBLISHED" });
      expect(res.status).toBe(401);
    });

    it("should return 400 if publishing empty schedule", async () => {
      const res = await request(app)
        .patch(`/api/v1/menu-schedules/${scheduleId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "PUBLISHED" });
      expect(res.status).toBe(400); // Because no active items
    });

    it("should update date successfully", async () => {
      const res = await request(app)
        .patch(`/api/v1/menu-schedules/${scheduleId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ date: "2026-11-11" });
      expect(res.status).toBe(200);
      expect(new Date(res.body.data.date).toISOString()).toContain("17:00:00");
    });

    it("should return 400 on duplicate date update (E11000)", async () => {
      const { getVietnamDayRange } = require("../../utils/date.util");
      const existingDate = new Date();
      existingDate.setDate(existingDate.getDate() + 10);
      const normalizedDate = getVietnamDayRange(existingDate).start;
      
      await MenuSchedule.create({
        status: "PUBLISHED",
        date: normalizedDate,
      });

      const res = await request(app)
        .patch(`/api/v1/menu-schedules/${scheduleId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ date: existingDate.toISOString() });
      expect(res.status).toBe(400);
    });
  });

  describe("Lazy Auto-Completion of Past Published Menu Schedules", () => {
    it("should automatically convert past PUBLISHED menu schedules to COMPLETED on list query", async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2); // 2 days ago

      // Create a past schedule directly in database with PUBLISHED status
      const pastSchedule = await MenuSchedule.create({
        status: "PUBLISHED",
        date: pastDate,
      });

      const { token } = await createTestUser(ROLES.MANAGER);

      // Perform a list query
      const res = await request(app)
        .get("/api/v1/menu-schedules/staff")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);

      // Retrieve from database and verify status is now COMPLETED
      const updatedSchedule = await MenuSchedule.findById(pastSchedule._id);
      expect(updatedSchedule.status).toBe("COMPLETED");
    });
  });

  describe("Lazy Auto-Cancellation of Past DRAFT Menu Schedules with Inventory Refund", () => {
    it("should automatically convert past DRAFT menu schedules to CANCELLED and refund ingredients on list query", async () => {
      const Ingredient = require("../ingredient/ingredient.model");
      const IngredientBatch = require("../ingredientBatch/ingredientBatch.model");
      const FoodIngredient = require("../foodIngredient/foodIngredient.model");

      const managerUser = await createTestUser(ROLES.MANAGER);

      // 1. Create ingredient with a batch of stock
      const ing = await Ingredient.create({ name: "Bò Mỹ", unit: "kg", currentStock: 100, isActive: true });
      await IngredientBatch.create({
        ingredientId: ing._id,
        supplierId: new mongoose.Types.ObjectId(),
        importPrice: 10000,
        initialQuantity: 100,
        remainingQuantity: 100,
        isActive: true,
      });

      // 2. Link ingredient to food
      const category = await FoodCategory.create({ name: "Beef Category", description: "Desc" });
      const beefFood = await Food.create({
        name: "Beef Steak",
        categoryId: category._id,
        price: 150000,
        status: "AVAILABLE",
      });
      await FoodIngredient.create({ foodId: beefFood._id, ingredientId: ing._id, quantityPerServing: 2 });

      // 3. Create a future DRAFT menu schedule
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const schedule = await MenuSchedule.create({
        status: "DRAFT",
        date: futureDate,
      });

      // 4. Add food item to draft schedule (deducts 2 * 10 = 20 kg beef)
      const resAdd = await request(app)
        .post("/api/v1/menu-schedule-items")
        .set("Authorization", `Bearer ${managerUser.token}`)
        .send({
          menuScheduleId: schedule._id,
          foodId: beefFood._id,
          maxServing: 10,
        });
      expect(resAdd.status).toBe(201);

      // Verify stock is deducted
      let currentIng = await Ingredient.findById(ing._id);
      expect(currentIng.currentStock).toBe(80);

      // 5. Change schedule date to be in the past
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);
      schedule.date = pastDate;
      await schedule.save();

      // 6. Perform a list query to trigger auto-cancellation
      const resList = await request(app)
        .get("/api/v1/menu-schedules/staff")
        .set("Authorization", `Bearer ${managerUser.token}`);
      expect(resList.status).toBe(200);

      // 7. Verify schedule status is now CANCELLED and stock is refunded
      const updatedSchedule = await MenuSchedule.findById(schedule._id);
      expect(updatedSchedule.status).toBe("CANCELLED");

      const refundedIng = await Ingredient.findById(ing._id);
      expect(refundedIng.currentStock).toBe(100);

      const refundedBatch = await IngredientBatch.findOne({ ingredientId: ing._id });
      expect(refundedBatch.remainingQuantity).toBe(100);
    });
  });
});

