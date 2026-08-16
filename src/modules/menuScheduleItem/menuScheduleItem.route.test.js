const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const routes = require("../../routes");
const User = require("../user/user.model");
const MenuSchedule = require("../menuSchedule/menuSchedule.model");
const MenuScheduleItem = require("./menuScheduleItem.model");
const Food = require("../food/food.model");
const FoodCategory = require("../foodCategory/foodCategory.model");
const FoodIngredient = require("../foodIngredient/foodIngredient.model");
const Ingredient = require("../ingredient/ingredient.model");
const IngredientBatch = require("../ingredientBatch/ingredientBatch.model");
const IngredientTransaction = require("../ingredientTransaction/ingredientTransaction.model");
const Cart = require("../cart/cart.model");
const CartItem = require("../cartItem/cartItem.model");
const ROLES = require("../../constants/roles.constant");
const jwt = require("jsonwebtoken");

process.env.JWT_ACCESS_SECRET = "test-secret-for-jwt";

const { errorHandler } = require("../../middlewares/error.middleware");
const app = express();
app.use(express.json());
app.use("/api/v1", routes);
app.use(errorHandler);



beforeEach(async () => {
  await User.deleteMany({});
  await MenuSchedule.deleteMany({});
  await MenuScheduleItem.deleteMany({});
  await Food.deleteMany({});
  await FoodCategory.deleteMany({});
  await FoodIngredient.deleteMany({});
  await Ingredient.deleteMany({});
  await IngredientBatch.deleteMany({});
  await IngredientTransaction.deleteMany({});
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
  let adminToken, managerToken, staffToken, customerToken, managerUser;
  let schedule, food, category;

  beforeEach(async () => {
    const manager = await createTestUser(ROLES.MANAGER);
    managerToken = manager.token;
    managerUser = manager.user;
    staffToken = (await createTestUser(ROLES.KITCHEN_STAFF)).token;
    customerToken = (await createTestUser(ROLES.CUSTOMER)).token;
    
    category = await FoodCategory.create({ name: "Main", description: "Desc" });
    food = await Food.create({ name: "Pizza", categoryId: category._id, price: 1000, status: "AVAILABLE" });
    schedule = await MenuSchedule.create({ date: new Date(Date.now() + 86400000), status: "PUBLISHED" });
  });

  describe("POST /api/v1/menu-schedule-items/bulk", () => {
    it("should successfully add multiple items in bulk", async () => {
      const food2 = await Food.create({ name: "Burger", categoryId: category._id, price: 1200, status: "AVAILABLE" });
      const ingredient = await Ingredient.create({
        name: "Flour",
        unit: "g",
        currentStock: 100,
        isActive: true,
      });
      await IngredientBatch.create({
        ingredientId: ingredient._id,
        quantity: 100,
        remainingQuantity: 100,
        expiryDate: new Date(Date.now() + 10 * 86400000),
      });
      await FoodIngredient.insertMany([
        {
          foodId: food._id,
          ingredientId: ingredient._id,
          quantityPerServing: 1,
          unit: "g",
        },
        {
          foodId: food2._id,
          ingredientId: ingredient._id,
          quantityPerServing: 1,
          unit: "g",
        },
      ]);
      const res = await request(app)
        .post("/api/v1/menu-schedule-items/bulk")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          menuScheduleId: schedule._id,
          items: [
            { foodId: food._id, maxServing: 20 },
            { foodId: food2._id, maxServing: 30 }
          ]
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    it("should deduct ingredient batches and record menu usage history when adding food to an existing schedule in bulk", async () => {
      const ingredient = await Ingredient.create({
        name: "Tomato",
        unit: "g",
        currentStock: 300,
        isActive: true,
      });
      const earliestBatch = await IngredientBatch.create({
        ingredientId: ingredient._id,
        quantity: 200,
        remainingQuantity: 200,
        expiryDate: new Date(Date.now() + 3 * 86400000),
      });
      const laterBatch = await IngredientBatch.create({
        ingredientId: ingredient._id,
        quantity: 100,
        remainingQuantity: 100,
        expiryDate: new Date(Date.now() + 10 * 86400000),
      });
      await FoodIngredient.create({
        foodId: food._id,
        ingredientId: ingredient._id,
        quantityPerServing: 10,
        unit: "g",
      });

      const res = await request(app)
        .post("/api/v1/menu-schedule-items/bulk")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          menuScheduleId: schedule._id,
          items: [{ foodId: food._id, maxServing: 15 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveLength(1);

      const updatedIngredient = await Ingredient.findById(ingredient._id);
      expect(updatedIngredient.currentStock).toBe(150);

      const updatedEarliestBatch = await IngredientBatch.findById(earliestBatch._id);
      const updatedLaterBatch = await IngredientBatch.findById(laterBatch._id);
      expect(updatedEarliestBatch.remainingQuantity).toBe(50);
      expect(updatedLaterBatch.remainingQuantity).toBe(100);

      const transaction = await IngredientTransaction.findOne({
        ingredientId: ingredient._id,
        transactionType: "MENU_USAGE",
      });
      expect(transaction).toBeTruthy();
      expect(transaction.quantity).toBe(-150);
      expect(transaction.stockBefore).toBe(300);
      expect(transaction.stockAfter).toBe(150);
      expect(transaction.referenceType).toBe("MENU_SCHEDULE_ITEM");
      expect(String(transaction.referenceId)).toBe(String(res.body.data[0]._id));
      expect(transaction.metadata.source).toBe("MENU_SCHEDULE_ITEM");
      expect(transaction.metadata.action).toBe("CREATE_MENU_ITEM_BULK");
      expect(transaction.metadata.foodName).toBe("Pizza");
      expect(transaction.metadata.affectedBatches[0].batchId).toEqual(earliestBatch._id);
    });

    it("should reject duplicate food items in bulk payload", async () => {
      const res = await request(app)
        .post("/api/v1/menu-schedule-items/bulk")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          menuScheduleId: schedule._id,
          items: [
            { foodId: food._id, maxServing: 20 },
            { foodId: food._id, maxServing: 30 }
          ]
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Duplicate food items found/i);
    });

    it("should return detailed insufficient ingredient error message including food name and ingredient name", async () => {
      const Ingredient = require("../ingredient/ingredient.model");
      const FoodIngredient = require("../foodIngredient/foodIngredient.model");

      const ing = await Ingredient.create({ name: "Phô Mai", unit: "g", currentStock: 50 });
      await FoodIngredient.create({ foodId: food._id, ingredientId: ing._id, quantityPerServing: 10 });

      const res = await request(app)
        .post("/api/v1/menu-schedule-items")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ menuScheduleId: schedule._id, foodId: food._id, maxServing: 10 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Insufficient ingredients for food "Pizza"');
      expect(res.body.message).toContain('Required: 100 g');
      expect(res.body.message).toContain('Available: 50 g');
      expect(res.body.message).toContain('Shortage: 50 g');
    });
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
    it("should reject Mass Assignment with 422 Unprocessable Entity", async () => {
      const res = await request(app).post("/api/v1/menu-schedule-items").set("Authorization", `Bearer ${managerToken}`).send({ menuScheduleId: schedule._id, foodId: food._id, maxServing: 10, remainingCount: 999, reservedCount: 50 });
      expect(res.status).toBe(422);
      expect(res.body.message).toContain("Validation failed");
    });

    it("should deduct ingredient stock and record menu usage transaction history", async () => {
      const ingredient = await Ingredient.create({
        name: "Cheese",
        unit: "g",
        currentStock: 100,
        isActive: true,
      });
      const batch = await IngredientBatch.create({
        ingredientId: ingredient._id,
        quantity: 100,
        remainingQuantity: 100,
        expiryDate: new Date(Date.now() + 7 * 86400000),
      });
      await FoodIngredient.create({
        foodId: food._id,
        ingredientId: ingredient._id,
        quantityPerServing: 2,
        unit: "g",
      });

      const res = await request(app)
        .post("/api/v1/menu-schedule-items")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ menuScheduleId: schedule._id, foodId: food._id, maxServing: 10 });

      expect(res.status).toBe(201);

      const updatedIngredient = await Ingredient.findById(ingredient._id);
      expect(updatedIngredient.currentStock).toBe(80);

      const updatedBatch = await IngredientBatch.findById(batch._id);
      expect(updatedBatch.remainingQuantity).toBe(80);

      const transaction = await IngredientTransaction.findOne({
        ingredientId: ingredient._id,
        transactionType: "MENU_USAGE",
      });
      expect(transaction).toBeTruthy();
      expect(transaction.quantity).toBe(-20);
      expect(transaction.stockBefore).toBe(100);
      expect(transaction.stockAfter).toBe(80);
      expect(String(transaction.adjustedBy)).toBe(String(managerUser._id));
      expect(transaction.referenceType).toBe("MENU_SCHEDULE_ITEM");
      expect(String(transaction.referenceId)).toBe(String(res.body.data._id));
      expect(transaction.metadata.source).toBe("MENU_SCHEDULE_ITEM");
      expect(transaction.metadata.foodName).toBe("Pizza");
      expect(transaction.metadata.servingCount).toBe(10);
      expect(transaction.metadata.affectedBatches[0].batchId).toEqual(batch._id);
    });

    it("should preserve three-decimal recipe quantities in inventory calculations", async () => {
      const ingredient = await Ingredient.create({
        name: "Cooking Oil",
        unit: "liter",
        currentStock: 0.01,
        isActive: true,
      });
      const batch = await IngredientBatch.create({
        ingredientId: ingredient._id,
        quantity: 0.01,
        remainingQuantity: 0.01,
        expiryDate: new Date(Date.now() + 7 * 86400000),
      });
      await FoodIngredient.create({
        foodId: food._id,
        ingredientId: ingredient._id,
        quantityPerServing: 0.003,
        unit: "liter",
      });

      const res = await request(app)
        .post("/api/v1/menu-schedule-items")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ menuScheduleId: schedule._id, foodId: food._id, maxServing: 2 });

      expect(res.status).toBe(201);

      const updatedIngredient = await Ingredient.findById(ingredient._id);
      const updatedBatch = await IngredientBatch.findById(batch._id);
      const transaction = await IngredientTransaction.findOne({
        ingredientId: ingredient._id,
        transactionType: "MENU_USAGE",
      });

      expect(updatedIngredient.currentStock).toBeCloseTo(0.004, 10);
      expect(updatedBatch.remainingQuantity).toBeCloseTo(0.004, 10);
      expect(transaction.quantity).toBeCloseTo(-0.006, 10);
      expect(transaction.metadata.quantityPerServing).toBe(0.003);
    });

    it("should reject food whose recipe contains a deleted ingredient", async () => {
      const ingredient = await Ingredient.create({
        name: "Lettuce",
        unit: "g",
        currentStock: 100,
        isActive: true,
        isDeleted: true,
      });
      await FoodIngredient.create({
        foodId: food._id,
        ingredientId: ingredient._id,
        quantityPerServing: 2,
        unit: "g",
      });

      const res = await request(app)
        .post("/api/v1/menu-schedule-items")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          menuScheduleId: schedule._id,
          foodId: food._id,
          maxServing: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(
        'Cannot add "Pizza" to the menu because its recipe contains deleted ingredient(s)',
      );
      expect(res.body.message).toContain('"Lettuce"');
      expect(res.body.message).toContain("Please update the recipe");
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
