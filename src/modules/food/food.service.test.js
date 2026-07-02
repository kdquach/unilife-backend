const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const foodService = require("./food.service");
const Food = require("./food.model");
const FoodCategory = require("../foodCategory/foodCategory.model");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Food.deleteMany({});
  await FoodCategory.deleteMany({});
});

describe("Food Service - Kitchen Staff Foods", () => {
  it("lists active foods for kitchen staff with category and pagination", async () => {
    const category = await FoodCategory.create({ name: "Main Dishes" });
    await Food.create([
      {
        categoryId: category._id,
        name: "Chicken Rice",
        description: "Daily meal",
        price: 30000,
        stockQuantity: 12,
        isActive: true,
      },
      {
        categoryId: category._id,
        name: "Archived Soup",
        description: "Inactive item",
        price: 20000,
        stockQuantity: 0,
        isActive: false,
      },
    ]);

    const result = await foodService.listForKitchen({ page: 1, limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Chicken Rice");
    expect(result.items[0].categoryId.name).toBe("Main Dishes");
    expect(result.pagination.total).toBe(1);
  });
});
