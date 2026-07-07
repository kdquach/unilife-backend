const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const service = require("./foodCategory.service");
const FoodCategory = require("./foodCategory.model");

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
  await FoodCategory.deleteMany({});
});

describe("Food Category Service", () => {
  it("lists categories with keyword and active filters", async () => {
    await FoodCategory.create([
      { name: "Rice Meals", description: "Lunch dishes", isActive: true },
      { name: "Drinks", description: "Cold beverages", isActive: true },
      { name: "Archived Drinks", description: "Hidden", isActive: false },
    ]);

    const result = await service.list({
      keyword: "drink",
      isActive: "true",
      page: 1,
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Drinks");
    expect(result.pagination.total).toBe(1);
  });

  it("throws not found when category detail does not exist", async () => {
    await expect(
      service.getById(new mongoose.Types.ObjectId().toString()),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Food category not found",
    });
  });

  it("creates category and prevents duplicate names case-insensitively", async () => {
    const created = await service.create({
      name: " Noodles ",
      description: "Hot meals",
    });

    expect(created.name).toBe("Noodles");
    expect(created.description).toBe("Hot meals");

    await expect(service.create({ name: "noodles" })).rejects.toMatchObject({
      statusCode: 409,
      message: "Food category name already exists",
    });
  });

  it("updates category fields and validates duplicate names", async () => {
    const category = await FoodCategory.create({ name: "Snacks" });
    await FoodCategory.create({ name: "Desserts" });

    const updated = await service.updateById(category._id.toString(), {
      name: "Quick Snacks",
      isActive: "false",
    });

    expect(updated.name).toBe("Quick Snacks");
    expect(updated.isActive).toBe(false);

    await expect(
      service.updateById(category._id.toString(), { name: "desserts" }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Food category name already exists",
    });
  });
});
