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
let customerToken;
let adminId;
let customerId;
let foodId;

process.env.JWT_ACCESS_SECRET = "test_secret";
process.env.JWT_REFRESH_SECRET = "test_secret";

beforeAll(async () => {
  const admin = await User.create({
    email: "admin_adv@example.com",
    passwordHash: "password123",
    fullName: "Admin Adv",
    role: "ADMIN",
    isActive: true,
  });
  adminId = admin._id;
  adminToken = signAccessToken({ userId: admin._id, role: admin.role });

  const customer = await User.create({
    email: "customer_adv@example.com",
    passwordHash: "password123",
    fullName: "Customer Adv",
    role: "CUSTOMER",
    isActive: true,
  });
  customerId = customer._id;
  customerToken = signAccessToken({ userId: customer._id, role: customer.role });

  const ic = await IngredientCategory.create({ name: "Adv IC" });
  const ing = await Ingredient.create({ name: "Adv Ing", categoryId: ic._id, unit: "kg", currentStock: 100 });
  await IngredientBatch.create({ ingredientId: ing._id, quantity: 100, remainingQuantity: 100, expiryDate: new Date(Date.now() + 86400000*30) });

  const fc = await FoodCategory.create({ name: "Adv FC" });
  const food = await Food.create({ name: "Adv Food", categoryId: fc._id, price: 10, isMenuItem: true });
  foodId = food._id;

  await FoodIngredient.create({ foodId: food._id, ingredientId: ing._id, quantityPerServing: 1 });
});

describe("Advanced Testing Plan - Menu Schedule API", () => {
  it("Test 1: Timezone Boundary Parsing Edge Case", async () => {
    const ms = await MenuSchedule.create({ date: new Date(Date.now() + 86400000), status: "DRAFT", createdBy: adminId });
    
    // Exact leap second / End of year boundary UTC
    const leapDateStr = "2026-12-31T23:59:59.999Z";
    
    const res = await request(app)
      .patch(`/api/v1/menu-schedules/${ms._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: leapDateStr });
      
    expect(res.status).toBe(200);
    
    const updatedMs = await MenuSchedule.findById(ms._id);
    // the date slice is "2026-12-31", the normalized VN start of day is: 2026-12-31T00:00:00+07:00
    const expectedTime = new Date("2026-12-31T00:00:00+07:00").getTime();
    expect(updatedMs.date.getTime()).toBe(expectedTime);
  });

  it("Test 2: NoSQL Injection / Query Bypass", async () => {
    // Attempt NoSQL injection via status field
    const res = await request(app)
      .get("/api/v1/menu-schedules?status[$ne]=DRAFT");
      
    // The application should gracefully handle or ignore the malicious payload, 
    // or stringify it `"[object Object]"` which matches nothing and returns [].
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    // If it didn't bypass, the query `status: { $in: ["[object Object]"] }` finds nothing.
    // Or it might just return 0 results. It must not crash.
  });

  it("Test 3: Pagination Memory Exhaustion DoS", async () => {
    const res = await request(app)
      .get("/api/v1/menu-schedules?limit=1000000");
      
    expect(res.status).toBe(200);
    // Should cap at 50 or 100, not 1000000
    expect(res.body.data.pagination.limit).toBeLessThanOrEqual(100);
  });

  it("Test 4: Rate Limiting Asymmetry / Heavy DB Query (Optional simulation)", async () => {
    // We didn't implement rate limiting for PATCH yet, but this test documents the vulnerability.
    // We will just verify the endpoint responds correctly under consecutive requests.
    const ms = await MenuSchedule.create({ date: new Date(Date.now() + 86400000 * 3), status: "DRAFT", createdBy: adminId });
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        request(app)
          .patch(`/api/v1/menu-schedules/${ms._id}`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ status: "DRAFT" })
      );
    }
    const results = await Promise.all(promises);
    // All should be 200 (since status isn't changing, it's idempotent, or 409 if changing).
    expect(results[0].status).toBe(200);
  });

  it("Test 5: Race Condition - Order vs Cancel (WriteConflict Simulation)", async () => {
    // 1. Setup a schedule for tomorrow
    const scheduleDate = new Date();
    scheduleDate.setDate(scheduleDate.getDate() + 5);
    const ms = await MenuSchedule.create({ date: scheduleDate, status: "PUBLISHED", createdBy: adminId });
    
    // 2. Add an item
    const msi = await MenuScheduleItem.create({
      menuScheduleId: ms._id,
      foodId: foodId,
      maxServing: 50,
      remainingCount: 50,
      reservedCount: 0,
      servedCount: 0,
      isActive: true,
      price: 10
    });

    // 3. Fire concurrent requests:
    // Request A: Customer creates an order for 5 servings
    const orderReq = request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ menuScheduleItemId: msi._id, quantity: 5 }]
      });

    // Request B: Admin Cancels the schedule
    const cancelReq = request(app)
      .patch(`/api/v1/menu-schedules/${ms._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "CANCELLED" });

    const [orderRes, cancelRes] = await Promise.all([orderReq, cancelReq]);

    // Expected behavior:
    // Mongoose transaction handles WriteConflict automatically.
    // If Order wins: Schedule Cancel transaction retries, reads updated reservedCount=5, refunds them.
    // If Cancel wins: Order transaction fails (cannot order cancelled items).
    // In BOTH cases, data integrity must be maintained.
    
    const finalMs = await MenuSchedule.findById(ms._id);
    const finalMsi = await MenuScheduleItem.findById(msi._id);

    if (cancelRes.status === 200 && finalMs.status === "CANCELLED") {
      expect(finalMsi.isActive).toBe(false);
      // Wait, what happened to the order?
      if (orderRes.status === 201) {
        // Order succeeded, meaning Cancel ran AFTER Order
        expect(finalMsi.reservedCount).toBe(5); // Refunded but record stays at 5
      } else {
        // Order failed
        expect(orderRes.status).toBeGreaterThanOrEqual(400);
      }
    }
  });
});
