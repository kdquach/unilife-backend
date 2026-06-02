require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db.config");
const ROLES = require("../constants/roles.constant");
const { hashPassword } = require("../utils/password.util");

const User = require("../modules/user/user.model");
const Session = require("../modules/session/session.model");
const OTP = require("../modules/otp/otp.model");
const ActivityLog = require("../modules/activityLog/activityLog.model");
const Notification = require("../modules/notification/notification.model");
const UserNotification = require("../modules/userNotification/userNotification.model");
const FoodCategory = require("../modules/foodCategory/foodCategory.model");
const Food = require("../modules/food/food.model");
const FoodIngredient = require("../modules/foodIngredient/foodIngredient.model");
const MenuSchedule = require("../modules/menuSchedule/menuSchedule.model");
const MenuScheduleItem = require("../modules/menuScheduleItem/menuScheduleItem.model");
const Cart = require("../modules/cart/cart.model");
const CartItem = require("../modules/cartItem/cartItem.model");
const Order = require("../modules/order/order.model");
const OrderItem = require("../modules/orderItem/orderItem.model");
const Queue = require("../modules/queue/queue.model");
const Rating = require("../modules/rating/rating.model");
const IngredientCategory = require("../modules/ingredientCategory/ingredientCategory.model");
const Ingredient = require("../modules/ingredient/ingredient.model");
const IngredientBatch = require("../modules/ingredientBatch/ingredientBatch.model");
const IngredientTransaction = require("../modules/ingredientTransaction/ingredientTransaction.model");
const Supplier = require("../modules/supplier/supplier.model");

const oid = (hex) => new mongoose.Types.ObjectId(hex);
const now = new Date();
const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

const IDS = {
  users: {
    admin: oid("665000000000000000000001"),
    manager: oid("665000000000000000000002"),
    counter: oid("665000000000000000000003"),
    kitchen: oid("665000000000000000000004"),
    customerA: oid("665000000000000000000005"),
    customerB: oid("665000000000000000000006"),
  },
  foodCategories: {
    rice: oid("665000000000000000000101"),
    noodles: oid("665000000000000000000102"),
    drinks: oid("665000000000000000000103"),
    snacks: oid("665000000000000000000104"),
  },
  foods: {
    riceChicken: oid("665000000000000000000201"),
    ricePork: oid("665000000000000000000202"),
    beefNoodle: oid("665000000000000000000203"),
    icedTea: oid("665000000000000000000204"),
    sandwich: oid("665000000000000000000205"),
  },
  ingredientCategories: {
    meat: oid("665000000000000000000301"),
    vegetable: oid("665000000000000000000302"),
    dry: oid("665000000000000000000303"),
    drink: oid("665000000000000000000304"),
  },
  ingredients: {
    rice: oid("665000000000000000000401"),
    chicken: oid("665000000000000000000402"),
    pork: oid("665000000000000000000403"),
    beef: oid("665000000000000000000404"),
    noodles: oid("665000000000000000000405"),
    lettuce: oid("665000000000000000000406"),
    tea: oid("665000000000000000000407"),
    bread: oid("665000000000000000000408"),
  },
  suppliers: {
    freshFood: oid("665000000000000000000501"),
    grocery: oid("665000000000000000000502"),
  },
  batches: {
    rice: oid("665000000000000000000601"),
    chicken: oid("665000000000000000000602"),
    pork: oid("665000000000000000000603"),
    tea: oid("665000000000000000000604"),
  },
  menuSchedules: {
    today: oid("665000000000000000000701"),
    tomorrow: oid("665000000000000000000702"),
  },
  menuItems: {
    todayChicken: oid("665000000000000000000801"),
    todayPork: oid("665000000000000000000802"),
    todayNoodle: oid("665000000000000000000803"),
    tomorrowChicken: oid("665000000000000000000804"),
    tomorrowSandwich: oid("665000000000000000000805"),
  },
  carts: {
    customerA: oid("665000000000000000000901"),
    customerB: oid("665000000000000000000902"),
  },
  orders: {
    preorder: oid("665000000000000000001001"),
    walkin: oid("665000000000000000001002"),
    completed: oid("665000000000000000001003"),
  },
  notifications: {
    welcome: oid("665000000000000000001101"),
    menu: oid("665000000000000000001102"),
  },
};

const upsertById = async (Model, _id, data) => {
  await Model.updateOne(
    { _id },
    { $set: { _id, ...data } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  return Model.findById(_id);
};

const upsertUserByEmail = async ({
  _id,
  fullName,
  email,
  phone,
  role,
  avatarUrl = null,
  isActive = true,
}) => {
  const passwordHash = await hashPassword(
    process.env.SEED_DEFAULT_PASSWORD || "Password@123",
  );
  const existing = await User.findOne({ email });

  if (existing) {
    await User.updateOne(
      { _id: existing._id },
      { $set: { fullName, phone, passwordHash, role, avatarUrl, isActive } },
    );
    return User.findById(existing._id);
  }

  await User.create({
    _id,
    fullName,
    email,
    phone,
    passwordHash,
    role,
    avatarUrl,
    isActive,
  });
  return User.findById(_id);
};

const clearDatabase = async () => {
  await Promise.all([
    ActivityLog.deleteMany({}),
    UserNotification.deleteMany({}),
    Notification.deleteMany({}),
    OTP.deleteMany({}),
    Session.deleteMany({}),
    Rating.deleteMany({}),
    Queue.deleteMany({}),
    OrderItem.deleteMany({}),
    Order.deleteMany({}),
    CartItem.deleteMany({}),
    Cart.deleteMany({}),
    MenuScheduleItem.deleteMany({}),
    MenuSchedule.deleteMany({}),
    FoodIngredient.deleteMany({}),
    Food.deleteMany({}),
    FoodCategory.deleteMany({}),
    IngredientTransaction.deleteMany({}),
    IngredientBatch.deleteMany({}),
    Ingredient.deleteMany({}),
    IngredientCategory.deleteMany({}),
    Supplier.deleteMany({}),
    User.deleteMany({}),
  ]);
};

const seedDatabase = async () => {
  await connectDB();

  const shouldReset = process.env.SEED_RESET === "true";
  if (shouldReset) {
    console.log("SEED_RESET=true, clearing all collections...");
    await clearDatabase();
  }

  console.log("Seeding users...");
  const admin = await upsertUserByEmail({
    _id: IDS.users.admin,
    fullName: "System Admin",
    email: "admin@unilife.local",
    phone: "0900000001",
    role: ROLES.ADMIN,
  });
  const manager = await upsertUserByEmail({
    _id: IDS.users.manager,
    fullName: "Canteen Manager",
    email: "manager@unilife.local",
    phone: "0900000002",
    role: ROLES.MANAGER,
  });
  const counter = await upsertUserByEmail({
    _id: IDS.users.counter,
    fullName: "Counter Staff",
    email: "counter@unilife.local",
    phone: "0900000003",
    role: ROLES.COUNTER_STAFF,
  });
  const kitchen = await upsertUserByEmail({
    _id: IDS.users.kitchen,
    fullName: "Kitchen Staff",
    email: "kitchen@unilife.local",
    phone: "0900000004",
    role: ROLES.KITCHEN_STAFF,
  });
  const customerA = await upsertUserByEmail({
    _id: IDS.users.customerA,
    fullName: "Nguyen Van An",
    email: "customer1@unilife.local",
    phone: "0900000005",
    role: ROLES.CUSTOMER,
    avatarUrl: "/uploads/avatars/default-customer-1.png",
  });
  const customerB = await upsertUserByEmail({
    _id: IDS.users.customerB,
    fullName: "Tran Thi Binh",
    email: "customer2@unilife.local",
    phone: "0900000006",
    role: ROLES.CUSTOMER,
    avatarUrl: "/uploads/avatars/default-customer-2.png",
  });

  console.log("Seeding sessions and OTPs...");
  await upsertById(Session, oid("665000000000000000001201"), {
    userId: customerA._id,
    token: "sample-refresh-token-customer-1",
    expiresAt: nextWeek,
    isRevoked: false,
  });
  await upsertById(Session, oid("665000000000000000001202"), {
    userId: manager._id,
    token: "sample-revoked-refresh-token-manager",
    expiresAt: nextWeek,
    isRevoked: true,
  });
  await upsertById(OTP, oid("665000000000000000001301"), {
    userId: customerA._id,
    code: "123456",
    purpose: "FORGOT_PASSWORD",
    isUsed: false,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
  });
  await upsertById(OTP, oid("665000000000000000001302"), {
    userId: customerB._id,
    code: "654321",
    purpose: "FORGOT_PASSWORD",
    isUsed: true,
    expiresAt: yesterday,
  });

  console.log("Seeding categories, foods, ingredients, suppliers...");
  await upsertById(FoodCategory, IDS.foodCategories.rice, {
    name: "Rice Meals",
    isActive: true,
  });
  await upsertById(FoodCategory, IDS.foodCategories.noodles, {
    name: "Noodles",
    isActive: true,
  });
  await upsertById(FoodCategory, IDS.foodCategories.drinks, {
    name: "Drinks",
    isActive: true,
  });
  await upsertById(FoodCategory, IDS.foodCategories.snacks, {
    name: "Snacks",
    isActive: true,
  });

  await upsertById(Food, IDS.foods.riceChicken, {
    categoryId: IDS.foodCategories.rice,
    name: "Chicken Rice",
    description: "Steamed rice served with grilled chicken and vegetables.",
    imageUrl: "/uploads/foods/chicken-rice.jpg",
    price: 30000,
    isMenuItem: true,
    isActive: true,
  });
  await upsertById(Food, IDS.foods.ricePork, {
    categoryId: IDS.foodCategories.rice,
    name: "Pork Rice",
    description: "Steamed rice served with braised pork.",
    imageUrl: "/uploads/foods/pork-rice.jpg",
    price: 32000,
    isMenuItem: true,
    isActive: true,
  });
  await upsertById(Food, IDS.foods.beefNoodle, {
    categoryId: IDS.foodCategories.noodles,
    name: "Beef Noodle Soup",
    description: "Hot noodle soup with sliced beef.",
    imageUrl: "/uploads/foods/beef-noodle.jpg",
    price: 35000,
    isMenuItem: true,
    isActive: true,
  });
  await upsertById(Food, IDS.foods.icedTea, {
    categoryId: IDS.foodCategories.drinks,
    name: "Iced Tea",
    description: "Cold tea drink for quick purchase.",
    imageUrl: "/uploads/foods/iced-tea.jpg",
    price: 8000,
    isMenuItem: false,
    isActive: true,
  });
  await upsertById(Food, IDS.foods.sandwich, {
    categoryId: IDS.foodCategories.snacks,
    name: "Egg Sandwich",
    description: "Bread sandwich with egg and lettuce.",
    imageUrl: "/uploads/foods/egg-sandwich.jpg",
    price: 20000,
    isMenuItem: true,
    isActive: true,
  });

  await upsertById(IngredientCategory, IDS.ingredientCategories.meat, {
    name: "Meat",
    isActive: true,
  });
  await upsertById(IngredientCategory, IDS.ingredientCategories.vegetable, {
    name: "Vegetable",
    isActive: true,
  });
  await upsertById(IngredientCategory, IDS.ingredientCategories.dry, {
    name: "Dry Goods",
    isActive: true,
  });
  await upsertById(IngredientCategory, IDS.ingredientCategories.drink, {
    name: "Drink Ingredients",
    isActive: true,
  });

  await upsertById(Ingredient, IDS.ingredients.rice, {
    categoryId: IDS.ingredientCategories.dry,
    name: "Rice",
    unit: "kg",
    storageType: "DRY",
    minStockThreshold: 20,
    currentStock: 120,
    isActive: true,
  });
  await upsertById(Ingredient, IDS.ingredients.chicken, {
    categoryId: IDS.ingredientCategories.meat,
    name: "Chicken",
    unit: "kg",
    storageType: "COLD",
    minStockThreshold: 10,
    currentStock: 35,
    isActive: true,
  });
  await upsertById(Ingredient, IDS.ingredients.pork, {
    categoryId: IDS.ingredientCategories.meat,
    name: "Pork",
    unit: "kg",
    storageType: "COLD",
    minStockThreshold: 10,
    currentStock: 28,
    isActive: true,
  });
  await upsertById(Ingredient, IDS.ingredients.beef, {
    categoryId: IDS.ingredientCategories.meat,
    name: "Beef",
    unit: "kg",
    storageType: "COLD",
    minStockThreshold: 8,
    currentStock: 18,
    isActive: true,
  });
  await upsertById(Ingredient, IDS.ingredients.noodles, {
    categoryId: IDS.ingredientCategories.dry,
    name: "Noodles",
    unit: "kg",
    storageType: "DRY",
    minStockThreshold: 15,
    currentStock: 50,
    isActive: true,
  });
  await upsertById(Ingredient, IDS.ingredients.lettuce, {
    categoryId: IDS.ingredientCategories.vegetable,
    name: "Lettuce",
    unit: "kg",
    storageType: "COLD",
    minStockThreshold: 5,
    currentStock: 12,
    isActive: true,
  });
  await upsertById(Ingredient, IDS.ingredients.tea, {
    categoryId: IDS.ingredientCategories.drink,
    name: "Tea Leaves",
    unit: "kg",
    storageType: "DRY",
    minStockThreshold: 3,
    currentStock: 9,
    isActive: true,
  });
  await upsertById(Ingredient, IDS.ingredients.bread, {
    categoryId: IDS.ingredientCategories.dry,
    name: "Bread",
    unit: "piece",
    storageType: "DRY",
    minStockThreshold: 30,
    currentStock: 100,
    isActive: true,
  });

  await upsertById(Supplier, IDS.suppliers.freshFood, {
    name: "Fresh Food Supplier",
    contactName: "Mr. Minh",
    phone: "0911111111",
    address: "Can Tho Fresh Market",
    isActive: true,
  });
  await upsertById(Supplier, IDS.suppliers.grocery, {
    name: "Campus Grocery Supplier",
    contactName: "Ms. Hoa",
    phone: "0922222222",
    address: "Ninh Kieu, Can Tho",
    isActive: true,
  });

  console.log("Seeding ingredient batches and transactions...");
  await upsertById(IngredientBatch, IDS.batches.rice, {
    ingredientId: IDS.ingredients.rice,
    supplierId: IDS.suppliers.grocery,
    quantity: 100,
    unitPrice: 16000,
    expiryDate: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
    remainingQuantity: 85,
  });
  await upsertById(IngredientBatch, IDS.batches.chicken, {
    ingredientId: IDS.ingredients.chicken,
    supplierId: IDS.suppliers.freshFood,
    quantity: 40,
    unitPrice: 75000,
    expiryDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
    remainingQuantity: 30,
  });
  await upsertById(IngredientBatch, IDS.batches.pork, {
    ingredientId: IDS.ingredients.pork,
    supplierId: IDS.suppliers.freshFood,
    quantity: 35,
    unitPrice: 90000,
    expiryDate: new Date(now.getTime() + 12 * 24 * 60 * 60 * 1000),
    remainingQuantity: 25,
  });
  await upsertById(IngredientBatch, IDS.batches.tea, {
    ingredientId: IDS.ingredients.tea,
    supplierId: IDS.suppliers.grocery,
    quantity: 10,
    unitPrice: 120000,
    expiryDate: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
    remainingQuantity: 9,
  });

  await upsertById(IngredientTransaction, oid("665000000000000000001401"), {
    ingredientId: IDS.ingredients.rice,
    batchId: IDS.batches.rice,
    transactionType: "INBOUND",
    quantity: 100,
    reason: "Initial stock import",
    referenceType: "SUPPLIER_IMPORT",
    referenceId: IDS.suppliers.grocery,
  });
  await upsertById(IngredientTransaction, oid("665000000000000000001402"), {
    ingredientId: IDS.ingredients.chicken,
    batchId: IDS.batches.chicken,
    transactionType: "INBOUND",
    quantity: 40,
    reason: "Initial chicken import",
    referenceType: "SUPPLIER_IMPORT",
    referenceId: IDS.suppliers.freshFood,
  });
  await upsertById(IngredientTransaction, oid("665000000000000000001403"), {
    ingredientId: IDS.ingredients.chicken,
    batchId: IDS.batches.chicken,
    transactionType: "OUTBOUND",
    quantity: 10,
    reason: "Used for menu preparation",
    referenceType: "MENU_PREPARATION",
    referenceId: IDS.menuSchedules.today,
  });

  console.log("Seeding food ingredient formulas...");
  await upsertById(FoodIngredient, oid("665000000000000000001501"), {
    foodId: IDS.foods.riceChicken,
    ingredientId: IDS.ingredients.rice,
    quantityPerServing: 0.2,
    unit: "kg",
  });
  await upsertById(FoodIngredient, oid("665000000000000000001502"), {
    foodId: IDS.foods.riceChicken,
    ingredientId: IDS.ingredients.chicken,
    quantityPerServing: 0.15,
    unit: "kg",
  });
  await upsertById(FoodIngredient, oid("665000000000000000001503"), {
    foodId: IDS.foods.ricePork,
    ingredientId: IDS.ingredients.rice,
    quantityPerServing: 0.2,
    unit: "kg",
  });
  await upsertById(FoodIngredient, oid("665000000000000000001504"), {
    foodId: IDS.foods.ricePork,
    ingredientId: IDS.ingredients.pork,
    quantityPerServing: 0.12,
    unit: "kg",
  });
  await upsertById(FoodIngredient, oid("665000000000000000001505"), {
    foodId: IDS.foods.beefNoodle,
    ingredientId: IDS.ingredients.noodles,
    quantityPerServing: 0.18,
    unit: "kg",
  });
  await upsertById(FoodIngredient, oid("665000000000000000001506"), {
    foodId: IDS.foods.beefNoodle,
    ingredientId: IDS.ingredients.beef,
    quantityPerServing: 0.1,
    unit: "kg",
  });
  await upsertById(FoodIngredient, oid("665000000000000000001507"), {
    foodId: IDS.foods.icedTea,
    ingredientId: IDS.ingredients.tea,
    quantityPerServing: 0.01,
    unit: "kg",
  });
  await upsertById(FoodIngredient, oid("665000000000000000001508"), {
    foodId: IDS.foods.sandwich,
    ingredientId: IDS.ingredients.bread,
    quantityPerServing: 2,
    unit: "piece",
  });
  await upsertById(FoodIngredient, oid("665000000000000000001509"), {
    foodId: IDS.foods.sandwich,
    ingredientId: IDS.ingredients.lettuce,
    quantityPerServing: 0.03,
    unit: "kg",
  });

  console.log("Seeding menu schedules and capacities...");
  await upsertById(MenuSchedule, IDS.menuSchedules.today, {
    date: now,
    status: "PUBLISHED",
    createdBy: manager._id,
    publishedAt: now,
  });
  await upsertById(MenuSchedule, IDS.menuSchedules.tomorrow, {
    date: tomorrow,
    status: "DRAFT",
    createdBy: manager._id,
    publishedAt: null,
  });

  await upsertById(MenuScheduleItem, IDS.menuItems.todayChicken, {
    menuScheduleId: IDS.menuSchedules.today,
    foodId: IDS.foods.riceChicken,
    maxServing: 80,
    reservedCount: 12,
    servedCount: 5,
    remainingCount: 63,
    isActive: true,
  });
  await upsertById(MenuScheduleItem, IDS.menuItems.todayPork, {
    menuScheduleId: IDS.menuSchedules.today,
    foodId: IDS.foods.ricePork,
    maxServing: 60,
    reservedCount: 10,
    servedCount: 3,
    remainingCount: 47,
    isActive: true,
  });
  await upsertById(MenuScheduleItem, IDS.menuItems.todayNoodle, {
    menuScheduleId: IDS.menuSchedules.today,
    foodId: IDS.foods.beefNoodle,
    maxServing: 50,
    reservedCount: 8,
    servedCount: 2,
    remainingCount: 40,
    isActive: true,
  });
  await upsertById(MenuScheduleItem, IDS.menuItems.tomorrowChicken, {
    menuScheduleId: IDS.menuSchedules.tomorrow,
    foodId: IDS.foods.riceChicken,
    maxServing: 100,
    reservedCount: 0,
    servedCount: 0,
    remainingCount: 100,
    isActive: true,
  });
  await upsertById(MenuScheduleItem, IDS.menuItems.tomorrowSandwich, {
    menuScheduleId: IDS.menuSchedules.tomorrow,
    foodId: IDS.foods.sandwich,
    maxServing: 40,
    reservedCount: 0,
    servedCount: 0,
    remainingCount: 40,
    isActive: true,
  });

  console.log("Seeding carts...");
  await upsertById(Cart, IDS.carts.customerA, { userId: customerA._id });
  await upsertById(Cart, IDS.carts.customerB, { userId: customerB._id });
  await upsertById(CartItem, oid("665000000000000000001601"), {
    cartId: IDS.carts.customerA,
    menuScheduleItemId: IDS.menuItems.todayChicken,
    quantity: 1,
  });
  await upsertById(CartItem, oid("665000000000000000001602"), {
    cartId: IDS.carts.customerA,
    menuScheduleItemId: IDS.menuItems.todayPork,
    quantity: 1,
  });
  await upsertById(CartItem, oid("665000000000000000001603"), {
    cartId: IDS.carts.customerB,
    menuScheduleItemId: IDS.menuItems.todayNoodle,
    quantity: 2,
  });

  console.log("Seeding orders, order items, queues...");
  await upsertById(Order, IDS.orders.preorder, {
    userId: customerA._id,
    createdBy: customerA._id,
    orderCode: "UL-PO-0001",
    status: "PAID",
    totalPrice: 62000,
    paymentMethod: "SEPAY",
    paymentStatus: "PAID",
    isWalkIn: false,
  });
  await upsertById(Order, IDS.orders.walkin, {
    userId: null,
    createdBy: counter._id,
    orderCode: "UL-WI-0001",
    status: "PREPARING",
    totalPrice: 35000,
    paymentMethod: "CASH",
    paymentStatus: "PAID",
    isWalkIn: true,
  });
  await upsertById(Order, IDS.orders.completed, {
    userId: customerB._id,
    createdBy: customerB._id,
    orderCode: "UL-PO-0002",
    status: "COMPLETED",
    totalPrice: 30000,
    paymentMethod: "SEPAY",
    paymentStatus: "PAID",
    isWalkIn: false,
  });

  await upsertById(OrderItem, oid("665000000000000000001701"), {
    orderId: IDS.orders.preorder,
    menuScheduleItemId: IDS.menuItems.todayChicken,
    quantity: 1,
    unitPrice: 30000,
    subtotal: 30000,
  });
  await upsertById(OrderItem, oid("665000000000000000001702"), {
    orderId: IDS.orders.preorder,
    menuScheduleItemId: IDS.menuItems.todayPork,
    quantity: 1,
    unitPrice: 32000,
    subtotal: 32000,
  });
  await upsertById(OrderItem, oid("665000000000000000001703"), {
    orderId: IDS.orders.walkin,
    menuScheduleItemId: IDS.menuItems.todayNoodle,
    quantity: 1,
    unitPrice: 35000,
    subtotal: 35000,
  });
  await upsertById(OrderItem, oid("665000000000000000001704"), {
    orderId: IDS.orders.completed,
    menuScheduleItemId: IDS.menuItems.todayChicken,
    quantity: 1,
    unitPrice: 30000,
    subtotal: 30000,
  });

  await upsertById(Queue, oid("665000000000000000001801"), {
    orderId: IDS.orders.preorder,
    queueNumber: 1,
    status: "WAITING",
    calledAt: null,
    completedAt: null,
  });
  await upsertById(Queue, oid("665000000000000000001802"), {
    orderId: IDS.orders.walkin,
    queueNumber: 2,
    status: "CALLED",
    calledAt: now,
    completedAt: null,
  });
  await upsertById(Queue, oid("665000000000000000001803"), {
    orderId: IDS.orders.completed,
    queueNumber: 3,
    status: "COMPLETED",
    calledAt: yesterday,
    completedAt: now,
  });

  console.log("Seeding ratings, notifications, logs...");
  await upsertById(Rating, oid("665000000000000000001901"), {
    userId: customerB._id,
    orderId: IDS.orders.completed,
    foodId: IDS.foods.riceChicken,
    ratingType: "FOOD",
    stars: 5,
    comment: "Food was good and pickup was fast.",
    staffReply: "Thank you for your feedback.",
    repliedBy: counter._id,
    repliedAt: now,
  });
  await upsertById(Rating, oid("665000000000000000001902"), {
    userId: customerA._id,
    orderId: IDS.orders.preorder,
    foodId: null,
    ratingType: "CANTEEN_SERVICE",
    stars: 4,
    comment: "Queue display is easy to follow.",
    staffReply: null,
    repliedBy: null,
    repliedAt: null,
  });

  await upsertById(Notification, IDS.notifications.welcome, {
    title: "Welcome to UniLife",
    body: "You can pre-order meals and track your queue number in real time.",
    type: "SYSTEM",
    createdBy: admin._id,
  });
  await upsertById(Notification, IDS.notifications.menu, {
    title: "Today menu is available",
    body: "Chicken Rice, Pork Rice, and Beef Noodle Soup are available today.",
    type: "MENU",
    createdBy: manager._id,
  });
  await upsertById(UserNotification, oid("665000000000000000002001"), {
    userId: customerA._id,
    notificationId: IDS.notifications.welcome,
    isRead: true,
    readAt: now,
  });
  await upsertById(UserNotification, oid("665000000000000000002002"), {
    userId: customerA._id,
    notificationId: IDS.notifications.menu,
    isRead: false,
    readAt: null,
  });
  await upsertById(UserNotification, oid("665000000000000000002003"), {
    userId: customerB._id,
    notificationId: IDS.notifications.welcome,
    isRead: false,
    readAt: null,
  });

  await upsertById(ActivityLog, oid("665000000000000000002101"), {
    userId: admin._id,
    action: "SEED_DATABASE",
    targetType: "DATABASE",
    targetId: null,
    description: "Seeded sample data for UniLife development environment.",
    ipAddress: "127.0.0.1",
  });
  await upsertById(ActivityLog, oid("665000000000000000002102"), {
    userId: manager._id,
    action: "CREATE_MENU_SCHEDULE",
    targetType: "MenuSchedule",
    targetId: IDS.menuSchedules.today,
    description: "Manager published today menu schedule.",
    ipAddress: "127.0.0.1",
  });
  await upsertById(ActivityLog, oid("665000000000000000002103"), {
    userId: counter._id,
    action: "CREATE_WALK_IN_ORDER",
    targetType: "Order",
    targetId: IDS.orders.walkin,
    description: "Counter staff created a walk-in order.",
    ipAddress: "127.0.0.1",
  });

  console.log("\nSeed completed successfully.");
  console.log(
    "Default password for seeded users:",
    process.env.SEED_DEFAULT_PASSWORD || "Password@123",
  );
  console.log("Accounts:");
  console.log("- admin@unilife.local / Password@123");
  console.log("- manager@unilife.local / Password@123");
  console.log("- counter@unilife.local / Password@123");
  console.log("- kitchen@unilife.local / Password@123");
  console.log("- customer1@unilife.local / Password@123");
  console.log("- customer2@unilife.local / Password@123");
};

seedDatabase()
  .then(async () => {
    await mongoose.connection.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await mongoose.connection.close();
    process.exit(1);
  });
