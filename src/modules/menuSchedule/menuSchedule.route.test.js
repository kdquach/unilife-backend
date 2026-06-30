const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const routes = require("../../routes");
const User = require("../user/user.model");
const MenuSchedule = require("./menuSchedule.model");
const MenuScheduleItem = require("../menuScheduleItem/menuScheduleItem.model");
const Food = require("../food/food.model");
const FoodCategory = require("../foodCategory/foodCategory.model");
const ROLES = require("../../constants/roles.constant");
const jwt = require("jsonwebtoken");

process.env.JWT_ACCESS_SECRET = "test-secret-for-jwt";

let mongoServer;
const app = express();
app.use(express.json());
app.use("/api/v1", routes);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

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

      // Seed Data: Menu Schedules
      const schedule1 = await MenuSchedule.create({
        status: "DRAFT",
        date: new Date("2026-06-25T00:00:00.000Z"),
      });
      const schedule2 = await MenuSchedule.create({
        status: "PUBLISHED",
        date: new Date("2026-06-26T00:00:00.000Z"),
      });
      const schedule3 = await MenuSchedule.create({
        status: "PUBLISHED",
        date: new Date("2026-06-27T00:00:00.000Z"),
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

    it("should filter menu schedules by exact date branch", async () => {
      const res = await request(app)
        .get("/api/v1/menu-schedules/staff?date=2026-06-26")
        .set("Authorization", `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
    });

    it("should filter menu schedules by dateFrom and dateTo range branch", async () => {
      const res = await request(app)
        .get("/api/v1/menu-schedules/staff?dateFrom=2026-06-25&dateTo=2026-06-26")
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
});
