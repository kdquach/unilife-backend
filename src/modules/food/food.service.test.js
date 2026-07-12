const mongoose = require("mongoose");

const foodService = require("./food.service");
const Food = require("./food.model");
const FoodCategory = require("../foodCategory/foodCategory.model");







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

  it("gets active food detail for kitchen staff", async () => {
    const category = await FoodCategory.create({ name: "Noodles" });
    const food = await Food.create({
      categoryId: category._id,
      name: "Beef Noodle",
      description: "Hot dish",
      price: 35000,
      isActive: true,
    });

    const result = await foodService.getByIdForKitchen(food._id.toString());

    expect(result.name).toBe("Beef Noodle");
    expect(result.categoryId.name).toBe("Noodles");
  });

  it("does not return inactive food detail for kitchen staff", async () => {
    const food = await Food.create({
      name: "Inactive Food",
      price: 10000,
      isActive: false,
    });

    await expect(
      foodService.getByIdForKitchen(food._id.toString()),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Food not found",
    });
  });

  it("searches active foods for kitchen staff by name or description", async () => {
    await Food.create([
      {
        name: "Chicken Rice",
        description: "Steamed chicken",
        price: 30000,
        isActive: true,
      },
      {
        name: "Vegetable Soup",
        description: "Chicken broth",
        price: 25000,
        isActive: true,
      },
      {
        name: "Archived Chicken",
        description: "Inactive item",
        price: 20000,
        isActive: false,
      },
    ]);

    const result = await foodService.searchForKitchen({
      keyword: "chicken",
      page: 1,
      limit: 10,
    });

    expect(result.items.map((item) => item.name).sort()).toEqual([
      "Chicken Rice",
      "Vegetable Soup",
    ]);
    expect(result.pagination.total).toBe(2);
  });

  it("filters active foods for kitchen staff by category, type and price range", async () => {
    const riceCategory = await FoodCategory.create({ name: "Rice" });
    const drinksCategory = await FoodCategory.create({ name: "Drinks" });
    await Food.create([
      {
        categoryId: riceCategory._id,
        name: "Chicken Rice",
        price: 30000,
        isMenuItem: false,
        isActive: true,
      },
      {
        categoryId: riceCategory._id,
        name: "Premium Rice",
        price: 60000,
        isMenuItem: false,
        isActive: true,
      },
      {
        categoryId: drinksCategory._id,
        name: "Milk Tea",
        price: 25000,
        isMenuItem: false,
        isActive: true,
      },
      {
        categoryId: riceCategory._id,
        name: "Set Lunch",
        price: 35000,
        isMenuItem: true,
        isActive: true,
      },
    ]);

    const result = await foodService.filterForKitchen({
      categoryId: riceCategory._id.toString(),
      kind: "alwaysAvailable",
      minPrice: 25000,
      maxPrice: 40000,
      page: 1,
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Chicken Rice");
    expect(result.pagination.total).toBe(1);
  });

  it("returns filter options for kitchen staff foods", async () => {
    const category = await FoodCategory.create({ name: "Drinks" });
    await Food.create({
      categoryId: category._id,
      name: "Orange Juice",
      price: 18000,
      isMenuItem: false,
      isActive: true,
    });

    const result = await foodService.getKitchenFilterOptions();

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].name).toBe("Drinks");
    expect(result.priceRange).toMatchObject({ minPrice: 18000, maxPrice: 18000 });
    expect(result.kindOptions).toEqual(["alwaysAvailable", "menuItem"]);
  });
});
