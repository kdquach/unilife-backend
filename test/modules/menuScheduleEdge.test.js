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
const { signAccessToken } = require("../../src/utils/jwt.util");

let adminToken;
let foodId;
let menuScheduleId;

process.env.JWT_ACCESS_SECRET = "test_secret";
process.env.JWT_REFRESH_SECRET = "test_secret";

beforeAll(async () => {
  const admin = await User.create({
    email: "admin_test_edge@example.com",
    passwordHash: "password123",
    fullName: "Admin Edge",
    role: "ADMIN",
    isActive: true,
  });
  adminToken = signAccessToken({ userId: admin._id, role: admin.role });

  const ic = await IngredientCategory.create({ name: "Edge IC" });
  const ing = await Ingredient.create({ name: "Edge Ing", categoryId: ic._id, unit: "kg", currentStock: 100 });
  await IngredientBatch.create({ ingredientId: ing._id, quantity: 100, remainingQuantity: 100 });

  const fc = await FoodCategory.create({ name: "Edge FC" });
  const food = await Food.create({ name: "Edge Food", categoryId: fc._id, price: 10, isMenuItem: true });
  foodId = food._id;

  await FoodIngredient.create({ foodId: food._id, ingredientId: ing._id, quantityPerServing: 1 });

  // Create a schedule for future, but cancel it immediately
  const scheduleDate = new Date();
  scheduleDate.setDate(scheduleDate.getDate() + 5);

  const ms = await MenuSchedule.create({ date: scheduleDate, status: "CANCELLED", createdBy: admin._id });
  menuScheduleId = ms._id;
});

describe("Menu Schedule Edge Cases", () => {
  it("should prevent adding a new item to a CANCELLED or COMPLETED schedule", async () => {
    const res = await request(app)
      .post("/api/v1/menu-schedule-items")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        menuScheduleId,
        foodId,
        maxServing: 10,
      });

    // If it allows, it's a bug!
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Cannot add items to a CANCELLED menu schedule/i);
  });

  it("should prevent creating a menu schedule for a past date", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);

    const res = await request(app)
      .post("/api/v1/menu-schedules")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: pastDate, status: "DRAFT" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Cannot create menu schedule for past dates/i);
  });

  it("should prevent changing a menu schedule's date to a past date", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const ms = await MenuSchedule.create({ date: futureDate, status: "DRAFT", createdBy: null });

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);

    const res = await request(app)
      .patch(`/api/v1/menu-schedules/${ms._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: pastDate });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Cannot change date to a past date/i);
  });

  it("should prevent modifying an existing item inside a CANCELLED schedule", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const ms = await MenuSchedule.create({ date: futureDate, status: "CANCELLED", createdBy: null });
    
    // Bypass service to create item directly
    const constItem = await mongoose.model("MenuScheduleItem").create({
      menuScheduleId: ms._id,
      foodId,
      maxServing: 50,
      remainingCount: 50,
      isActive: false
    });

    const res = await request(app)
      .patch(`/api/v1/menu-schedule-items/${constItem._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Cannot modify items in a CANCELLED menu schedule/i);
  });
});
