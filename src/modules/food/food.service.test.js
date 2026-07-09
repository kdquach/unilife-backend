const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const foodService = require("./food.service");
const Food = require("./food.model");
const FoodCategory = require("../foodCategory/foodCategory.model");
const FoodIngredient = require("../foodIngredient/foodIngredient.model");
const Ingredient = require("../ingredient/ingredient.model");

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
  await FoodIngredient.deleteMany({});
  await Ingredient.deleteMany({});
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

describe("Food Service - Manager Foods", () => {
  it("creates food with normalized data and populated category", async () => {
    const category = await FoodCategory.create({ name: "Rice" });

    const result = await foodService.create({
      categoryId: category._id.toString(),
      name: "  Grilled Chicken Rice  ",
      description: "  Lunch set  ",
      imageUrl: "  /uploads/foods/chicken-rice.jpg  ",
      price: "45000",
      stockQuantity: "20",
      isMenuItem: "false",
      isActive: "true",
    });

    expect(result.name).toBe("Grilled Chicken Rice");
    expect(result.description).toBe("Lunch set");
    expect(result.imageUrl).toBe("/uploads/foods/chicken-rice.jpg");
    expect(result.price).toBe(45000);
    expect(result.stockQuantity).toBe(20);
    expect(result.isMenuItem).toBe(false);
    expect(result.isActive).toBe(true);
    expect(result.categoryId.name).toBe("Rice");
  });

  it("rejects duplicate food names when creating food", async () => {
    await Food.create({ name: "Milk Tea", price: 22000 });

    await expect(
      foodService.create({ name: " milk tea ", price: 25000 }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Food name already exists",
    });
  });

  it("rejects creating food with missing category", async () => {
    const categoryId = new mongoose.Types.ObjectId().toString();

    await expect(
      foodService.create({ categoryId, name: "Beef Noodle", price: 35000 }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Food category not found",
    });
  });

  it("creates menu schedule food without food stock and with ingredient recipe", async () => {
    const ingredient = await Ingredient.create({
      name: "Chicken Breast",
      unit: "g",
      currentStock: 5000,
      isActive: true,
    });

    const result = await foodService.create({
      name: "Chicken Set",
      price: 45000,
      isMenuItem: true,
      stockQuantity: 25,
      ingredients: [
        {
          ingredientId: ingredient._id.toString(),
          quantityPerServing: "150",
        },
      ],
    });

    expect(result.stockQuantity).toBeNull();
    expect(result.ingredients).toHaveLength(1);
    expect(result.ingredients[0].ingredientId.name).toBe("Chicken Breast");
    expect(result.ingredients[0].quantityPerServing).toBe(150);
    expect(result.ingredients[0].unit).toBe("g");

    const savedIngredients = await FoodIngredient.find({ foodId: result._id });
    expect(savedIngredients).toHaveLength(1);
  });

  it("creates food recipe from multipart JSON string payload", async () => {
    const ingredient = await Ingredient.create({
      name: "Rice",
      unit: "g",
      isActive: true,
    });

    const result = await foodService.create({
      name: "Rice Bowl",
      price: 30000,
      isMenuItem: "false",
      stockQuantity: "10",
      imageUrl: "/uploads/foods/rice-bowl.jpg",
      ingredients: JSON.stringify([
        {
          ingredientId: ingredient._id.toString(),
          quantityPerServing: 200,
        },
      ]),
    });

    expect(result.imageUrl).toBe("/uploads/foods/rice-bowl.jpg");
    expect(result.ingredients).toHaveLength(1);
    expect(result.ingredients[0].ingredientId.name).toBe("Rice");
    expect(result.ingredients[0].quantityPerServing).toBe(200);
  });

  it("updates food with normalized data and populated category", async () => {
    const category = await FoodCategory.create({ name: "Noodles" });
    const food = await Food.create({
      name: "Chicken Rice",
      price: 30000,
      isActive: true,
    });

    const result = await foodService.updateById(food._id.toString(), {
      categoryId: category._id.toString(),
      name: "  Beef Noodle  ",
      description: "  Updated dish  ",
      price: "38000",
      stockQuantity: "",
      isMenuItem: "true",
      isActive: "false",
    });

    expect(result.name).toBe("Beef Noodle");
    expect(result.description).toBe("Updated dish");
    expect(result.price).toBe(38000);
    expect(result.stockQuantity).toBeNull();
    expect(result.isMenuItem).toBe(true);
    expect(result.isActive).toBe(false);
    expect(result.categoryId.name).toBe("Noodles");
  });

  it("replaces food ingredient recipe when updating food", async () => {
    const chicken = await Ingredient.create({ name: "Chicken", unit: "g" });
    const rice = await Ingredient.create({ name: "Rice", unit: "g" });
    const food = await Food.create({
      name: "Chicken Rice",
      price: 30000,
      isMenuItem: false,
      stockQuantity: 10,
    });
    await FoodIngredient.create({
      foodId: food._id,
      ingredientId: chicken._id,
      quantityPerServing: 120,
      unit: "g",
    });

    const result = await foodService.updateById(food._id.toString(), {
      ingredients: [
        {
          ingredientId: rice._id.toString(),
          quantityPerServing: 180,
          unit: "g",
        },
      ],
    });

    expect(result.ingredients).toHaveLength(1);
    expect(result.ingredients[0].ingredientId.name).toBe("Rice");
    expect(result.ingredients[0].quantityPerServing).toBe(180);

    const savedIngredients = await FoodIngredient.find({ foodId: food._id });
    expect(savedIngredients).toHaveLength(1);
    expect(savedIngredients[0].ingredientId.toString()).toBe(
      rice._id.toString(),
    );
  });

  it("rejects updating a missing food", async () => {
    const foodId = new mongoose.Types.ObjectId().toString();

    await expect(
      foodService.updateById(foodId, { name: "Missing Food" }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Food not found",
    });
  });

  it("rejects duplicate food names when updating food", async () => {
    await Food.create({ name: "Milk Tea", price: 22000 });
    const food = await Food.create({ name: "Orange Juice", price: 18000 });

    await expect(
      foodService.updateById(food._id.toString(), { name: " milk tea " }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Food name already exists",
    });
  });
});
