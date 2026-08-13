const request = require("supertest");
const express = require("express");
const routes = require("../../routes");
const User = require("../user/user.model");
const Ingredient = require("./ingredient.model");
const IngredientBatch = require("../ingredientBatch/ingredientBatch.model");
const IngredientTransaction = require("../ingredientTransaction/ingredientTransaction.model");
const Food = require("../food/food.model");
const FoodIngredient = require("../foodIngredient/foodIngredient.model");
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
  await Ingredient.deleteMany({});
  await IngredientBatch.deleteMany({});
  await IngredientTransaction.deleteMany({});
  await FoodIngredient.deleteMany({});
  await Food.deleteMany({});
});

const createTestUser = async (role) => {
  const user = await User.create({
    email: `${role.toLowerCase()}@test.com`,
    passwordHash: "hashedpassword",
    fullName: "Test User",
    role,
    isActive: true,
  });
  const token = jwt.sign(
    { userId: user._id, role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "1h" },
  );
  return { user, token };
};

describe("Ingredient Routes - Soft Delete", () => {
  let managerToken;
  let customerToken;

  beforeEach(async () => {
    managerToken = (await createTestUser(ROLES.MANAGER)).token;
    customerToken = (await createTestUser(ROLES.CUSTOMER)).token;
  });

  it("requires unit price when importing stock", async () => {
    const ingredient = await Ingredient.create({
      name: "Potato",
      unit: "kg",
      storageType: "DRY",
      currentStock: 0,
      isActive: true,
    });
    const expiryDate = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);

    const res = await request(app)
      .post(`/api/v1/ingredients/${ingredient._id}/stock-import`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        quantity: 12,
        expiryDate,
        reason: "Supplier delivery",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("unitPrice must be a number");
  });

  it("stores unit price on the imported ingredient batch", async () => {
    const ingredient = await Ingredient.create({
      name: "Carrot",
      unit: "kg",
      storageType: "COLD",
      currentStock: 0,
      isActive: true,
    });
    const expiryDate = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);

    const res = await request(app)
      .post(`/api/v1/ingredients/${ingredient._id}/stock-import`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        quantity: 8,
        expiryDate,
        unitPrice: 25000,
        reason: "Supplier delivery",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.batch.unitPrice).toBe(25000);
    expect(res.body.data.transaction.metadata.unitPrice).toBe(25000);

    const storedBatch = await IngredientBatch.findOne({
      ingredientId: ingredient._id,
    });
    expect(storedBatch.unitPrice).toBe(25000);
  });

  it("soft-deletes an ingredient by marking it deleted without removing records", async () => {
    const ingredient = await Ingredient.create({
      name: "Tomato",
      unit: "kg",
      storageType: "COLD",
      currentStock: 10,
      isActive: true,
    });
    const batch = await IngredientBatch.create({
      ingredientId: ingredient._id,
      quantity: 10,
      remainingQuantity: 10,
      expiryDate: new Date(Date.now() + 7 * 86400000),
    });
    const transaction = await IngredientTransaction.create({
      ingredientId: ingredient._id,
      batchId: batch._id,
      transactionType: "STOCK_IMPORT",
      quantity: 10,
      stockBefore: 0,
      stockAfter: 10,
      unit: "kg",
      reason: "Initial import",
    });

    const res = await request(app)
      .delete(`/api/v1/ingredients/${ingredient._id}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isDeleted).toBe(true);
    expect(res.body.data.isActive).toBe(true);

    const storedIngredient = await Ingredient.findById(ingredient._id);
    const storedBatch = await IngredientBatch.findById(batch._id);
    const storedTransaction = await IngredientTransaction.findById(transaction._id);
    const deleteTransaction = await IngredientTransaction.findOne({
      ingredientId: ingredient._id,
      transactionType: "INGREDIENT_DELETE",
    });

    expect(storedIngredient).toBeTruthy();
    expect(storedIngredient.isDeleted).toBe(true);
    expect(storedIngredient.isActive).toBe(true);
    expect(storedBatch).toBeTruthy();
    expect(storedTransaction).toBeTruthy();
    expect(deleteTransaction).toBeTruthy();
    expect(deleteTransaction.quantity).toBe(0);
    expect(deleteTransaction.stockBefore).toBe(10);
    expect(deleteTransaction.stockAfter).toBe(10);
    expect(deleteTransaction.adjustedBy.toString()).toBeTruthy();
    expect(deleteTransaction.referenceType).toBe("INGREDIENT_DELETE");
    expect(deleteTransaction.referenceId.toString()).toBe(
      ingredient._id.toString(),
    );
    expect(deleteTransaction.metadata.source).toBe("INGREDIENT_SOFT_DELETE");
  });

  it("excludes soft-deleted ingredients from the default list but can filter inactive ones", async () => {
    await Ingredient.create([
      { name: "Active Rice", unit: "kg", isActive: true },
      { name: "Inactive Rice", unit: "kg", isActive: false },
      { name: "Deleted Rice", unit: "kg", isActive: true, isDeleted: true },
    ]);

    const defaultList = await request(app)
      .get("/api/v1/ingredients")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(defaultList.status).toBe(200);
    expect(defaultList.body.data.items.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Active Rice", "Inactive Rice"]),
    );
    expect(defaultList.body.data.items.map((item) => item.name)).not.toContain(
      "Deleted Rice",
    );

    const inactiveList = await request(app)
      .get("/api/v1/ingredients?isActive=false")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(inactiveList.status).toBe(200);
    expect(inactiveList.body.data.items.map((item) => item.name)).toEqual([
      "Inactive Rice",
    ]);
  });

  it("returns affected foods before and after deleting an ingredient used in recipes", async () => {
    const ingredient = await Ingredient.create({
      name: "Lettuce",
      unit: "kg",
      isActive: true,
    });
    const burger = await Food.create({ name: "Burger", price: 30000 });
    const salad = await Food.create({ name: "Salad", price: 25000 });

    await FoodIngredient.create([
      {
        foodId: burger._id,
        ingredientId: ingredient._id,
        quantityPerServing: 0.1,
        unit: "kg",
      },
      {
        foodId: burger._id,
        ingredientId: ingredient._id,
        quantityPerServing: 0.05,
        unit: "kg",
      },
      {
        foodId: salad._id,
        ingredientId: ingredient._id,
        quantityPerServing: 0.2,
        unit: "kg",
      },
    ]);

    const impactRes = await request(app)
      .get(`/api/v1/ingredients/${ingredient._id}/delete-impact`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(impactRes.status).toBe(200);
    expect(impactRes.body.data.affectedFoodCount).toBe(2);
    expect(impactRes.body.data.affectedFoods.map((food) => food.name)).toEqual([
      "Burger",
      "Salad",
    ]);
    expect(
      impactRes.body.data.affectedFoods.find((food) => food.name === "Burger")
        .recipeUsageCount,
    ).toBe(2);

    const deleteRes = await request(app)
      .delete(`/api/v1/ingredients/${ingredient._id}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.isDeleted).toBe(true);
    expect(deleteRes.body.data.affectedFoodCount).toBe(2);
    expect(deleteRes.body.data.affectedFoods.map((food) => food.name)).toEqual([
      "Burger",
      "Salad",
    ]);
  });

  it("does not allow duplicate names for inactive non-deleted ingredients", async () => {
    await Ingredient.create({
      name: "Pumpkin",
      unit: "kg",
      isActive: false,
      isDeleted: false,
    });

    const res = await request(app)
      .post("/api/v1/ingredients")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        name: "Pumpkin",
        unit: "kg",
        storageType: "DRY",
        minStockThreshold: 0,
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      "Ingredient already exists. Please adjust stock or create a new batch instead",
    );
  });

  it("allows creating a new ingredient with the same name after soft delete", async () => {
    const ingredient = await Ingredient.create({
      name: "Orange",
      unit: "kg",
      price: 10,
      storageType: "COLD",
      currentStock: 1,
      isActive: true,
    });

    const deleteRes = await request(app)
      .delete(`/api/v1/ingredients/${ingredient._id}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(deleteRes.status).toBe(200);

    const createRes = await request(app)
      .post("/api/v1/ingredients")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        name: "Orange",
        unit: "kg",
        price: 10,
        storageType: "COLD",
        minStockThreshold: 0,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.name).toBe("Orange");
    expect(createRes.body.data._id).not.toBe(ingredient._id.toString());

    const ingredients = await Ingredient.find({ name: "Orange" }).sort({
      createdAt: 1,
    });
    expect(ingredients).toHaveLength(2);
    expect(ingredients[0].isDeleted).toBe(true);
    expect(ingredients[0].isActive).toBe(true);
    expect(ingredients[1].isDeleted).toBe(false);
    expect(ingredients[1].isActive).toBe(true);
  });

  it("does not allow customers to soft-delete ingredients", async () => {
    const ingredient = await Ingredient.create({
      name: "Milk",
      unit: "liter",
      isActive: true,
    });

    const res = await request(app)
      .delete(`/api/v1/ingredients/${ingredient._id}`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(403);

    const storedIngredient = await Ingredient.findById(ingredient._id);
    expect(storedIngredient.isActive).toBe(true);
    expect(storedIngredient.isDeleted).toBe(false);
  });
});
