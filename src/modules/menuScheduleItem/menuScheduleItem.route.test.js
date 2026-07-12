const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const routes = require("../../routes");
const User = require("../user/user.model");
const MenuSchedule = require("../menuSchedule/menuSchedule.model");
const MenuScheduleItem = require("./menuScheduleItem.model");
const Food = require("../food/food.model");
const FoodCategory = require("../foodCategory/foodCategory.model");
const Cart = require("../cart/cart.model");
const CartItem = require("../cartItem/cartItem.model");
const ROLES = require("../../constants/roles.constant");
const jwt = require("jsonwebtoken");

process.env.JWT_ACCESS_SECRET = "test-secret-for-jwt";

const app = express();
app.use(express.json());
app.use("/api/v1", routes);



beforeEach(async () => {
  await User.deleteMany({});
  await MenuSchedule.deleteMany({});
  await MenuScheduleItem.deleteMany({});
  await Food.deleteMany({});
  await FoodCategory.deleteMany({});
  await Cart.deleteMany({});
  await CartItem.deleteMany({});
  
  await MenuSchedule.ensureIndexes();
  await MenuScheduleItem.ensureIndexes();
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

describe("MenuScheduleItem Routes (POST, PATCH, DELETE)", () => {
  let adminToken, managerToken, staffToken, customerToken;
  let schedule, food, category;

  beforeEach(async () => {
    managerToken = (await createTestUser(ROLES.MANAGER)).token;
    staffToken = (await createTestUser(ROLES.KITCHEN_STAFF)).token;
    customerToken = (await createTestUser(ROLES.CUSTOMER)).token;
    
    category = await FoodCategory.create({ name: "Main", description: "Desc" });
    food = await Food.create({ name: "Pizza", categoryId: category._id, price: 1000, status: "AVAILABLE" });
    schedule = await MenuSchedule.create({ date: new Date(Date.now() + 86400000), status: "PUBLISHED" });
  });

  describe("POST /api/v1/menu-schedule-items", () => {
    it("should return 401 if no token", async () => {
      const res = await request(app).post("/api/v1/menu-schedule-items").send({ menuScheduleId: schedule._id, foodId: food._id, maxServing: 10 });
      expect(res.status).toBe(401);
    });
    it("should return 403 if Customer", async () => {
      const res = await request(app).post("/api/v1/menu-schedule-items").set("Authorization", `Bearer ${customerToken}`).send({ menuScheduleId: schedule._id, foodId: food._id, maxServing: 10 });
      expect(res.status).toBe(403);
    });
    it("should return 404/400 if foodId is invalid", async () => {
      const res = await request(app).post("/api/v1/menu-schedule-items").set("Authorization", `Bearer ${managerToken}`).send({ menuScheduleId: schedule._id, foodId: new mongoose.Types.ObjectId(), maxServing: 10 });
      expect(res.status).toBeGreaterThanOrEqual(400); // Expect validation error
    });
    it("should return 400 on Time-Travel Attack (adding to past schedule)", async () => {
      const past = await MenuSchedule.create({ date: new Date(Date.now() - 86400000), status: "PUBLISHED" });
      const res = await request(app).post("/api/v1/menu-schedule-items").set("Authorization", `Bearer ${managerToken}`).send({ menuScheduleId: past._id, foodId: food._id, maxServing: 10 });
      expect(res.status).toBe(400);
    });
    it("should reject duplicate food in same schedule", async () => {
      await request(app).post("/api/v1/menu-schedule-items").set("Authorization", `Bearer ${managerToken}`).send({ menuScheduleId: schedule._id, foodId: food._id, maxServing: 10 });
      const res = await request(app).post("/api/v1/menu-schedule-items").set("Authorization", `Bearer ${managerToken}`).send({ menuScheduleId: schedule._id, foodId: food._id, maxServing: 10 });
      expect(res.status).toBe(400); // 400 or 409
    });
    it("should ignore Mass Assignment and set initial inventory properly", async () => {
      const res = await request(app).post("/api/v1/menu-schedule-items").set("Authorization", `Bearer ${managerToken}`).send({ menuScheduleId: schedule._id, foodId: food._id, maxServing: 10, remainingCount: 999, reservedCount: 50 });
      expect(res.status).toBe(201);
      expect(res.body.data.maxServing).toBe(10);
      expect(res.body.data.remainingCount).toBe(10);
      expect(res.body.data.reservedCount).toBe(0);
    });
  });

  describe("PATCH /api/v1/menu-schedule-items/:id", () => {
    let item;
    beforeEach(async () => {
      item = await MenuScheduleItem.create({ menuScheduleId: schedule._id, foodId: food._id, maxServing: 10, remainingCount: 10, reservedCount: 0 });
    });

    it("should Atomic Update remainingCount on maxServing increase", async () => {
      const res = await request(app).patch(`/api/v1/menu-schedule-items/${item._id}`).set("Authorization", `Bearer ${managerToken}`).send({ maxServing: 15 });
      expect(res.status).toBe(200);
      expect(res.body.data.maxServing).toBe(15);
      expect(res.body.data.remainingCount).toBe(15);
    });

    it("should Atomic Update remainingCount on maxServing decrease", async () => {
      item.reservedCount = 2;
      item.remainingCount = 8;
      await item.save();
      const res = await request(app).patch(`/api/v1/menu-schedule-items/${item._id}`).set("Authorization", `Bearer ${managerToken}`).send({ maxServing: 8 });
      expect(res.status).toBe(200);
      expect(res.body.data.maxServing).toBe(8);
      expect(res.body.data.remainingCount).toBe(6); 
    });

    it("should block Negative Inventory Attack via $expr constraint", async () => {
      item.reservedCount = 5;
      item.remainingCount = 5;
      await item.save();
      const res = await request(app).patch(`/api/v1/menu-schedule-items/${item._id}`).set("Authorization", `Bearer ${managerToken}`).send({ maxServing: 3 });
      expect(res.status).toBe(400); 
    });
  });

  describe("DELETE /api/v1/menu-schedule-items/:id", () => {
    let item;
    beforeEach(async () => {
      item = await MenuScheduleItem.create({ menuScheduleId: schedule._id, foodId: food._id, maxServing: 10, remainingCount: 10, reservedCount: 0 });
    });
    
    it("should block deletion if reservedCount > 0", async () => {
      item.reservedCount = 1;
      await item.save();
      const res = await request(app).delete(`/api/v1/menu-schedule-items/${item._id}`).set("Authorization", `Bearer ${managerToken}`);
      expect(res.status).toBe(400);
    });

    it("should return 400 for safe deletion because hard delete is forbidden", async () => {
      const res = await request(app).delete(`/api/v1/menu-schedule-items/${item._id}`).set("Authorization", `Bearer ${managerToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe.skip("Cart Integration (Cross-module Edge Case)", () => {
    it("should block checkout if Manager sets isActive=false while in Cart", async () => {
      const msi = await MenuScheduleItem.create({ menuScheduleId: schedule._id, foodId: food._id, maxServing: 10, remainingCount: 10, reservedCount: 0, isActive: true });
      
      await request(app).post("/api/v1/carts/add").set("Authorization", `Bearer ${customerToken}`).send({ menuScheduleItemId: msi._id.toString(), quantity: 1 });
      
      // Hides item
      await request(app).patch(`/api/v1/menu-schedule-items/${msi._id}`).set("Authorization", `Bearer ${managerToken}`).send({ isActive: false });

      // check cart
      const cartRes = await request(app).get("/api/v1/carts").set("Authorization", `Bearer ${customerToken}`);
      expect(cartRes.status).toBe(200);
      expect(cartRes.body.data.items[0].isValid).toBe(false);
    });
  });
});
