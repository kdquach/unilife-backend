require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db.config");
const ROLES = require("../constants/roles.constant");
const { hashPassword } = require("../utils/password.util");

const ActivityLog = require("../modules/activityLog/activityLog.model");
const Cart = require("../modules/cart/cart.model");
const CartItem = require("../modules/cartItem/cartItem.model");
const Food = require("../modules/food/food.model");
const FoodCategory = require("../modules/foodCategory/foodCategory.model");
const FoodIngredient = require("../modules/foodIngredient/foodIngredient.model");
const IdempotencyKey = require("../modules/idempotency/idempotencyKey.model");
const Ingredient = require("../modules/ingredient/ingredient.model");
const IngredientBatch = require("../modules/ingredientBatch/ingredientBatch.model");
const IngredientCategory = require("../modules/ingredientCategory/ingredientCategory.model");
const IngredientTransaction = require("../modules/ingredientTransaction/ingredientTransaction.model");
const MenuSchedule = require("../modules/menuSchedule/menuSchedule.model");
const MenuScheduleItem = require("../modules/menuScheduleItem/menuScheduleItem.model");
const Notification = require("../modules/notification/notification.model");
const Order = require("../modules/order/order.model");
const OrderItem = require("../modules/orderItem/orderItem.model");
const OTP = require("../modules/otp/otp.model");
const Queue = require("../modules/queue/queue.model");
const Rating = require("../modules/rating/rating.model");
const Session = require("../modules/session/session.model");
const Supplier = require("../modules/supplier/supplier.model");
const User = require("../modules/user/user.model");
const UserNotification = require("../modules/userNotification/userNotification.model");
const {
  FOOD_CATEGORIES,
  FOODS,
  INGREDIENT_CATEGORIES,
  INGREDIENTS,
  INVENTORY_TRANSACTIONS,
  RECIPES,
  SUPPLIERS,
} = require("./data/unilifedb.data");

const oid = (hex) => new mongoose.Types.ObjectId(hex);
const sid = (sequence) =>
  oid(`665000000000000000${String(sequence).padStart(6, "0")}`);
const idsFrom = (items, startingSequence) =>
  Object.fromEntries(
    items.map((item, index) => [item.key, sid(startingSequence + index)]),
  );

const now = new Date();
const today = new Date(now);
today.setHours(0, 0, 0, 0);
const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
const expectedDatabaseName =
  process.env.SEED_DATABASE_NAME ||
  process.env.MONGODB_DB_NAME ||
  "UnilifeDB";

const IDS = {
  users: {
    admin: sid(1),
    manager: sid(2),
    counter: sid(3),
    kitchen: sid(4),
    customerA: sid(5),
    customerB: sid(6),
  },
  foodCategories: idsFrom(FOOD_CATEGORIES, 101),
  foods: idsFrom(FOODS, 201),
  ingredientCategories: idsFrom(INGREDIENT_CATEGORIES, 301),
  ingredients: idsFrom(INGREDIENTS, 401),
  suppliers: idsFrom(SUPPLIERS, 501),
  batches: idsFrom(INGREDIENTS, 601),
  menuSchedules: {
    today: sid(701),
    tomorrow: sid(702),
  },
  menuItems: {
    todayChicken: sid(801),
    todayPorkRib: sid(802),
    todayPho: sid(803),
    tomorrowBraisedPork: sid(804),
    tomorrowFriedChicken: sid(805),
  },
  carts: {
    customerA: sid(901),
    customerB: sid(902),
  },
  orders: {
    preorder: sid(1001),
    walkin: sid(1002),
    completed: sid(1003),
  },
  notifications: {
    welcome: sid(1101),
    menu: sid(1102),
  },
};

const getDuplicateKeys = (items) => {
  const seen = new Set();
  return items
    .map((item) => item.key)
    .filter((key) => {
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
};

const validateSourceData = () => {
  const keyedGroups = [
    ["food category", FOOD_CATEGORIES],
    ["food", FOODS],
    ["ingredient category", INGREDIENT_CATEGORIES],
    ["ingredient", INGREDIENTS],
    ["supplier", SUPPLIERS],
  ];

  keyedGroups.forEach(([label, items]) => {
    const duplicates = getDuplicateKeys(items);
    if (duplicates.length) {
      throw new Error(`Duplicate ${label} key(s): ${duplicates.join(", ")}`);
    }
  });

  const foodKeys = new Set(FOODS.map((item) => item.key));
  const foodCategoryKeys = new Set(FOOD_CATEGORIES.map((item) => item.key));
  const ingredientKeys = new Set(INGREDIENTS.map((item) => item.key));
  const ingredientCategoryKeys = new Set(
    INGREDIENT_CATEGORIES.map((item) => item.key),
  );
  const supplierKeys = new Set(SUPPLIERS.map((item) => item.key));
  const ingredientByKey = new Map(
    INGREDIENTS.map((ingredient) => [ingredient.key, ingredient]),
  );

  FOODS.forEach((food) => {
    if (!foodCategoryKeys.has(food.categoryKey)) {
      throw new Error(`Food ${food.key} has an unknown category`);
    }
  });

  INGREDIENTS.forEach((ingredient) => {
    if (!ingredientCategoryKeys.has(ingredient.categoryKey)) {
      throw new Error(`Ingredient ${ingredient.key} has an unknown category`);
    }
    if (!supplierKeys.has(ingredient.supplierKey)) {
      throw new Error(`Ingredient ${ingredient.key} has an unknown supplier`);
    }
  });

  RECIPES.forEach(([foodKey, ingredientKey, quantity, unit]) => {
    if (!foodKeys.has(foodKey)) {
      throw new Error(`Recipe has an unknown food: ${foodKey}`);
    }
    const ingredient = ingredientByKey.get(ingredientKey);
    if (!ingredient) {
      throw new Error(`Recipe has an unknown ingredient: ${ingredientKey}`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Recipe quantity must be positive: ${foodKey}`);
    }
    if (ingredient.unit !== unit) {
      throw new Error(
        `Recipe unit mismatch for ${ingredientKey}: ${unit} != ${ingredient.unit}`,
      );
    }
  });

  INVENTORY_TRANSACTIONS.forEach((transaction) => {
    if (!ingredientKeys.has(transaction.ingredientKey)) {
      throw new Error(
        `Inventory transaction has an unknown ingredient: ${transaction.ingredientKey}`,
      );
    }
    if (!Number.isFinite(transaction.quantity) || transaction.quantity === 0) {
      throw new Error("Inventory transaction quantity cannot be zero");
    }
  });
};

const buildInventoryState = () => {
  const balances = new Map(
    INGREDIENTS.map((ingredient) => [
      ingredient.key,
      Number(ingredient.openingStock || 0),
    ]),
  );
  const batchQuantities = new Map(balances);

  const transactions = INVENTORY_TRANSACTIONS.map((transaction) => {
    const stockBefore = balances.get(transaction.ingredientKey);
    const stockAfter = stockBefore + transaction.quantity;
    if (stockAfter < 0) {
      throw new Error(
        `Negative stock for ${transaction.ingredientKey}: ${stockAfter}`,
      );
    }

    balances.set(transaction.ingredientKey, stockAfter);
    if (transaction.quantity > 0) {
      batchQuantities.set(
        transaction.ingredientKey,
        batchQuantities.get(transaction.ingredientKey) + transaction.quantity,
      );
    }

    return { ...transaction, stockBefore, stockAfter };
  });

  return { balances, batchQuantities, transactions };
};

validateSourceData();
const inventoryState = buildInventoryState();

const upsertById = async (Model, _id, data) => {
  await Model.updateOne(
    { _id },
    { $set: data, $setOnInsert: { _id } },
    { upsert: true, setDefaultsOnInsert: true, runValidators: true },
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
}) => {
  const passwordHash = await hashPassword(
    process.env.SEED_DEFAULT_PASSWORD || "Password@123",
  );
  const existing = await User.findOne({ email });
  const userId = existing?._id || _id;

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        fullName,
        email,
        phone,
        passwordHash,
        role,
        avatarUrl,
        isActive: true,
        isEmailVerified: true,
      },
      $setOnInsert: { _id: userId },
    },
    { upsert: true, setDefaultsOnInsert: true, runValidators: true },
  );

  return User.findById(userId);
};

const clearDatabase = async () => {
  await Promise.all([
    ActivityLog.deleteMany({}),
    CartItem.deleteMany({}),
    Cart.deleteMany({}),
    FoodIngredient.deleteMany({}),
    IdempotencyKey.deleteMany({}),
    IngredientTransaction.deleteMany({}),
    IngredientBatch.deleteMany({}),
    MenuScheduleItem.deleteMany({}),
    Notification.deleteMany({}),
    OrderItem.deleteMany({}),
    Queue.deleteMany({}),
    Rating.deleteMany({}),
    UserNotification.deleteMany({}),
    Food.deleteMany({}),
    FoodCategory.deleteMany({}),
    Ingredient.deleteMany({}),
    IngredientCategory.deleteMany({}),
    MenuSchedule.deleteMany({}),
    Order.deleteMany({}),
    OTP.deleteMany({}),
    Session.deleteMany({}),
    Supplier.deleteMany({}),
    User.deleteMany({}),
  ]);
};

const seedUsers = async () => {
  console.log("Seeding users...");
  const users = {};
  users.admin = await upsertUserByEmail({
    _id: IDS.users.admin,
    fullName: "System Administrator",
    email: "admin@unilife.local",
    phone: "0900000001",
    role: ROLES.ADMIN,
  });
  users.manager = await upsertUserByEmail({
    _id: IDS.users.manager,
    fullName: "Canteen Manager",
    email: "manager@unilife.local",
    phone: "0900000002",
    role: ROLES.MANAGER,
  });
  users.counter = await upsertUserByEmail({
    _id: IDS.users.counter,
    fullName: "Counter Staff",
    email: "counter@unilife.local",
    phone: "0900000003",
    role: ROLES.COUNTER_STAFF,
  });
  users.kitchen = await upsertUserByEmail({
    _id: IDS.users.kitchen,
    fullName: "Kitchen Staff",
    email: "kitchen@unilife.local",
    phone: "0900000004",
    role: ROLES.KITCHEN_STAFF,
  });
  users.customerA = await upsertUserByEmail({
    _id: IDS.users.customerA,
    fullName: "Nguyễn Văn An",
    email: "customer1@unilife.local",
    phone: "0900000005",
    role: ROLES.CUSTOMER,
  });
  users.customerB = await upsertUserByEmail({
    _id: IDS.users.customerB,
    fullName: "Trần Thị Bình",
    email: "customer2@unilife.local",
    phone: "0900000006",
    role: ROLES.CUSTOMER,
  });
  return users;
};

const seedInventoryAndFoods = async (users) => {
  console.log("Seeding categories, suppliers, ingredients and foods...");

  for (const category of FOOD_CATEGORIES) {
    await upsertById(FoodCategory, IDS.foodCategories[category.key], {
      name: category.name,
      description: category.description,
      isActive: true,
    });
  }

  for (const category of INGREDIENT_CATEGORIES) {
    await upsertById(
      IngredientCategory,
      IDS.ingredientCategories[category.key],
      { name: category.name, isActive: true },
    );
  }

  for (const supplier of SUPPLIERS) {
    await upsertById(Supplier, IDS.suppliers[supplier.key], {
      name: supplier.name,
      contactName: supplier.contactName,
      phone: supplier.phone,
      address: null,
      note: "Sample data from Supplier.txt",
      isActive: true,
      deletedAt: null,
    });
  }

  for (const ingredient of INGREDIENTS) {
    await upsertById(Ingredient, IDS.ingredients[ingredient.key], {
      categoryId: IDS.ingredientCategories[ingredient.categoryKey],
      name: ingredient.name,
      unit: ingredient.unit,
      storageType: ingredient.storageType,
      minStockThreshold: ingredient.minStockThreshold,
      currentStock: inventoryState.balances.get(ingredient.key),
      isActive: true,
      isDeleted: false,
    });

    await upsertById(IngredientBatch, IDS.batches[ingredient.key], {
      ingredientId: IDS.ingredients[ingredient.key],
      supplierId: IDS.suppliers[ingredient.supplierKey],
      quantity: inventoryState.batchQuantities.get(ingredient.key),
      unitPrice: ingredient.unitPrice,
      expiryDate: new Date(
        today.getTime() + ingredient.shelfLifeDays * 24 * 60 * 60 * 1000,
      ),
      remainingQuantity: inventoryState.balances.get(ingredient.key),
    });
  }

  for (const food of FOODS) {
    await upsertById(Food, IDS.foods[food.key], {
      categoryId: IDS.foodCategories[food.categoryKey],
      name: food.name,
      description: food.description,
      imageUrl: null,
      price: food.price,
      isMenuItem: true,
      stockQuantity: null,
      isActive: true,
    });
  }

  console.log("Seeding 55 recipe rows from Món ăn.txt...");
  for (const [index, recipe] of RECIPES.entries()) {
    const [foodKey, ingredientKey, quantityPerServing, unit] = recipe;
    await upsertById(FoodIngredient, sid(1501 + index), {
      foodId: IDS.foods[foodKey],
      ingredientId: IDS.ingredients[ingredientKey],
      quantityPerServing,
      unit,
    });
  }

  console.log("Seeding 10 inventory transactions from source data...");
  for (const [index, transaction] of inventoryState.transactions.entries()) {
    const ingredient = INGREDIENTS.find(
      (item) => item.key === transaction.ingredientKey,
    );
    const isMenuUsage = transaction.referenceType === "MENU_PREPARATION";
    const isSupplierOperation = [
      "SUPPLIER_IMPORT",
      "SUPPLIER_RETURN",
    ].includes(transaction.referenceType);
    const adjustedBy = ["MENU_USAGE", "WASTE"].includes(
      transaction.transactionType,
    )
      ? users.kitchen._id
      : users.manager._id;

    await upsertById(IngredientTransaction, sid(1401 + index), {
      ingredientId: IDS.ingredients[transaction.ingredientKey],
      batchId: IDS.batches[transaction.ingredientKey],
      transactionType: transaction.transactionType,
      quantity: transaction.quantity,
      stockBefore: transaction.stockBefore,
      stockAfter: transaction.stockAfter,
      unit: ingredient.unit,
      reason: transaction.reason,
      adjustedBy,
      referenceType: transaction.referenceType,
      referenceId: isMenuUsage
        ? IDS.menuSchedules.today
        : isSupplierOperation
          ? IDS.suppliers[ingredient.supplierKey]
          : null,
      metadata: {
        source: "dulieu/Inventory Transaction History.txt",
        sourceTransactionType: transaction.transactionType,
      },
      createdAt: new Date(
        now.getTime() -
          (inventoryState.transactions.length - index) * 60 * 60 * 1000,
      ),
    });
  }
};

const recipeSnapshotFor = (foodKey) =>
  RECIPES.filter(([recipeFoodKey]) => recipeFoodKey === foodKey).map(
    ([, ingredientKey, quantityPerServing]) => ({
      ingredientId: IDS.ingredients[ingredientKey],
      quantityPerServing,
    }),
  );

const seedMenusAndCommerce = async (users) => {
  console.log("Seeding menu schedules, carts, orders and ratings...");
  await upsertById(MenuSchedule, IDS.menuSchedules.today, {
    date: today,
    status: "PUBLISHED",
    createdBy: users.manager._id,
    publishedAt: now,
    isActive: true,
  });
  await upsertById(MenuSchedule, IDS.menuSchedules.tomorrow, {
    date: tomorrow,
    status: "DRAFT",
    createdBy: users.manager._id,
    publishedAt: null,
    isActive: true,
  });

  const menuItems = [
    ["todayChicken", "today", "grilledChickenRice", 80, 12, 5],
    ["todayPorkRib", "today", "grilledPorkRibRice", 60, 10, 3],
    ["todayPho", "today", "beefPho", 50, 8, 2],
    ["tomorrowBraisedPork", "tomorrow", "braisedPorkEggRice", 70, 0, 0],
    ["tomorrowFriedChicken", "tomorrow", "friedChicken", 50, 0, 0],
  ];

  for (const [key, scheduleKey, foodKey, maxServing, reserved, served] of menuItems) {
    await upsertById(MenuScheduleItem, IDS.menuItems[key], {
      menuScheduleId: IDS.menuSchedules[scheduleKey],
      foodId: IDS.foods[foodKey],
      maxServing,
      reservedCount: reserved,
      servedCount: served,
      remainingCount: maxServing - reserved - served,
      isActive: true,
      deductedBatches: [],
      recipeSnapshot: recipeSnapshotFor(foodKey),
    });
  }

  await upsertById(Cart, IDS.carts.customerA, {
    userId: users.customerA._id,
  });
  await upsertById(Cart, IDS.carts.customerB, {
    userId: users.customerB._id,
  });
  await upsertById(CartItem, sid(1601), {
    cartId: IDS.carts.customerA,
    menuScheduleItemId: IDS.menuItems.todayChicken,
    quantity: 1,
  });
  await upsertById(CartItem, sid(1602), {
    cartId: IDS.carts.customerA,
    menuScheduleItemId: IDS.menuItems.todayPorkRib,
    quantity: 1,
  });
  await upsertById(CartItem, sid(1603), {
    cartId: IDS.carts.customerB,
    menuScheduleItemId: IDS.menuItems.todayPho,
    quantity: 2,
  });

  await upsertById(Order, IDS.orders.preorder, {
    userId: users.customerA._id,
    createdBy: users.customerA._id,
    orderCode: "UL-PO-0001",
    status: "PAID",
    totalPrice: 75000,
    paymentMethod: "SEPAY",
    paymentStatus: "PAID",
    isWalkIn: false,
    paidAt: now,
  });
  await upsertById(Order, IDS.orders.walkin, {
    userId: null,
    createdBy: users.counter._id,
    orderCode: "UL-WI-0001",
    status: "PREPARING",
    totalPrice: 40000,
    paymentMethod: "CASH",
    paymentStatus: "PAID",
    isWalkIn: true,
    paidAt: now,
  });
  await upsertById(Order, IDS.orders.completed, {
    userId: users.customerB._id,
    createdBy: users.customerB._id,
    orderCode: "UL-PO-0002",
    status: "COMPLETED",
    totalPrice: 35000,
    paymentMethod: "SEPAY",
    paymentStatus: "PAID",
    isWalkIn: false,
    paidAt: yesterday,
  });

  const orderItems = [
    [1701, "preorder", "todayChicken", "grilledChickenRice", 1, 35000],
    [1702, "preorder", "todayPorkRib", "grilledPorkRibRice", 1, 40000],
    [1703, "walkin", "todayPho", "beefPho", 1, 40000],
    [1704, "completed", "todayChicken", "grilledChickenRice", 1, 35000],
  ];
  for (const [sequence, orderKey, menuItemKey, foodKey, quantity, unitPrice] of orderItems) {
    await upsertById(OrderItem, sid(sequence), {
      orderId: IDS.orders[orderKey],
      menuScheduleItemId: IDS.menuItems[menuItemKey],
      itemType: "MENU_ITEM",
      foodId: IDS.foods[foodKey],
      quantity,
      unitPrice,
      subtotal: quantity * unitPrice,
    });
  }

  const queues = [
    [1801, "preorder", 1, "WAITING", now, null, null],
    [1802, "walkin", 2, "SERVING", now, now, null],
    [1803, "completed", 3, "DONE", yesterday, yesterday, yesterday],
  ];
  for (const [sequence, orderKey, queueNumber, status, scannedAt, servedAt, doneAt] of queues) {
    await upsertById(Queue, sid(sequence), {
      orderId: IDS.orders[orderKey],
      queueNumber,
      status,
      scannedAt,
      servedAt,
      doneAt,
    });
  }

  await upsertById(Rating, sid(1901), {
    userId: users.customerB._id,
    orderId: IDS.orders.completed,
    orderItemId: sid(1704),
    foodId: IDS.foods.grilledChickenRice,
    ratingType: "FOOD",
    stars: 5,
    comment: "The food was delicious and pickup was quick.",
    staffReply: "Thank you for your feedback.",
    repliedBy: users.counter._id,
    repliedAt: now,
  });
  await upsertById(Rating, sid(1902), {
    userId: users.customerA._id,
    orderId: IDS.orders.preorder,
    orderItemId: null,
    foodId: null,
    ratingType: "CANTEEN_SERVICE",
    stars: 4,
    comment: "The queue display is easy to follow.",
    staffReply: null,
    repliedBy: null,
    repliedAt: null,
  });
};

const seedSupportingData = async (users) => {
  console.log("Seeding sessions, notifications and activity data...");
  await upsertById(Session, sid(1201), {
    userId: users.customerA._id,
    token: "sample-refresh-token-customer-1",
    expiresAt: nextWeek,
    isRevoked: false,
  });
  await upsertById(Session, sid(1202), {
    userId: users.manager._id,
    token: "sample-revoked-refresh-token-manager",
    expiresAt: nextWeek,
    isRevoked: true,
  });
  await upsertById(OTP, sid(1301), {
    userId: users.customerA._id,
    code: "123456",
    purpose: "FORGOT_PASSWORD",
    isUsed: false,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
  });
  await upsertById(OTP, sid(1302), {
    userId: users.customerB._id,
    code: "654321",
    purpose: "FORGOT_PASSWORD",
    isUsed: true,
    expiresAt: yesterday,
  });

  await upsertById(Notification, IDS.notifications.welcome, {
    title: "Welcome to UniLife",
    body: "You can pre-order meals and track your pickup queue number.",
    type: "SYSTEM",
    createdBy: users.admin._id,
  });
  await upsertById(Notification, IDS.notifications.menu, {
    title: "Today's Menu Is Available",
    body: "Grilled Chicken Rice, Grilled Pork Rib Rice, and Beef Pho are now available.",
    type: "MENU",
    createdBy: users.manager._id,
  });
  await upsertById(UserNotification, sid(2001), {
    userId: users.customerA._id,
    notificationId: IDS.notifications.welcome,
    isRead: true,
    readAt: now,
  });
  await upsertById(UserNotification, sid(2002), {
    userId: users.customerA._id,
    notificationId: IDS.notifications.menu,
    isRead: false,
    readAt: null,
  });
  await upsertById(UserNotification, sid(2003), {
    userId: users.customerB._id,
    notificationId: IDS.notifications.welcome,
    isRead: false,
    readAt: null,
  });

  await upsertById(ActivityLog, sid(2101), {
    userId: users.admin._id,
    action: "SEED_DATABASE",
    targetType: "DATABASE",
    targetId: null,
    description: "Seeded source-aligned sample data into unilifedb.",
    ipAddress: "127.0.0.1",
  });
  await upsertById(ActivityLog, sid(2102), {
    userId: users.manager._id,
    action: "CREATE_MENU_SCHEDULE",
    targetType: "MenuSchedule",
    targetId: IDS.menuSchedules.today,
    description: "Manager published today's menu schedule.",
    ipAddress: "127.0.0.1",
  });
  await upsertById(ActivityLog, sid(2103), {
    userId: users.counter._id,
    action: "CREATE_WALK_IN_ORDER",
    targetType: "Order",
    targetId: IDS.orders.walkin,
    description: "Counter staff created a walk-in order.",
    ipAddress: "127.0.0.1",
  });

  await upsertById(IdempotencyKey, sid(2201), {
    key: "seed-unilifedb-sample-request",
    responseStatus: 201,
    responseBody: { success: true, source: "database.seed.js" },
    createdAt: now,
  });
};

const verifySeedIntegrity = async () => {
  console.log("Verifying seeded documents and references...");
  const expectedGroups = [
    [FoodCategory, Object.values(IDS.foodCategories), FOOD_CATEGORIES.length],
    [Food, Object.values(IDS.foods), FOODS.length],
    [FoodIngredient, RECIPES.map((_, index) => sid(1501 + index)), RECIPES.length],
    [IngredientCategory, Object.values(IDS.ingredientCategories), INGREDIENT_CATEGORIES.length],
    [Ingredient, Object.values(IDS.ingredients), INGREDIENTS.length],
    [IngredientBatch, Object.values(IDS.batches), INGREDIENTS.length],
    [IngredientTransaction, INVENTORY_TRANSACTIONS.map((_, index) => sid(1401 + index)), INVENTORY_TRANSACTIONS.length],
    [Supplier, Object.values(IDS.suppliers), SUPPLIERS.length],
  ];

  for (const [Model, ids, expectedCount] of expectedGroups) {
    const documents = await Model.find({ _id: { $in: ids } });
    if (documents.length !== expectedCount) {
      throw new Error(
        `${Model.modelName} verification failed: ${documents.length}/${expectedCount}`,
      );
    }
    for (const document of documents) await document.validate();
  }

  for (const ingredient of INGREDIENTS) {
    const document = await Ingredient.findById(IDS.ingredients[ingredient.key]);
    const expectedStock = inventoryState.balances.get(ingredient.key);
    if (document.currentStock !== expectedStock) {
      throw new Error(
        `Stock mismatch for ${ingredient.name}: ${document.currentStock}/${expectedStock}`,
      );
    }
  }

  const recipeRows = await FoodIngredient.find({
    _id: { $in: RECIPES.map((_, index) => sid(1501 + index)) },
  });
  const existingFoodIds = new Set(
    (await Food.find({ _id: { $in: recipeRows.map((row) => row.foodId) } }))
      .map((food) => String(food._id)),
  );
  const existingIngredientIds = new Set(
    (
      await Ingredient.find({
        _id: { $in: recipeRows.map((row) => row.ingredientId) },
      })
    ).map((ingredient) => String(ingredient._id)),
  );
  const orphan = recipeRows.find(
    (row) =>
      !existingFoodIds.has(String(row.foodId)) ||
      !existingIngredientIds.has(String(row.ingredientId)),
  );
  if (orphan) throw new Error(`Orphan FoodIngredient detected: ${orphan._id}`);

  console.log(
    `Verified ${FOODS.length} foods, ${INGREDIENTS.length} ingredients, ` +
      `${RECIPES.length} recipe rows, ${SUPPLIERS.length} suppliers and ` +
      `${INVENTORY_TRANSACTIONS.length} inventory transactions.`,
  );
};

const seedDatabase = async () => {
  await connectDB();
  if (mongoose.connection.name !== expectedDatabaseName) {
    throw new Error(
      `Refusing to seed database "${mongoose.connection.name}". Expected "${expectedDatabaseName}".`,
    );
  }

  const shouldReset =
    process.env.SEED_RESET === "true" || process.argv.includes("--reset");
  if (shouldReset) {
    console.log(`Reset requested, clearing ${expectedDatabaseName} collections...`);
    await clearDatabase();
  }

  console.log(`Seeding MongoDB database: ${mongoose.connection.name}`);
  const users = await seedUsers();
  await seedInventoryAndFoods(users);
  await seedMenusAndCommerce(users);
  await seedSupportingData(users);
  await verifySeedIntegrity();

  console.log("\nSeed completed successfully.");
  console.log(
    "Default password for seeded users:",
    process.env.SEED_DEFAULT_PASSWORD || "Password@123",
  );
  console.log("Accounts:");
  console.log("- admin@unilife.local");
  console.log("- manager@unilife.local");
  console.log("- counter@unilife.local");
  console.log("- kitchen@unilife.local");
  console.log("- customer1@unilife.local");
  console.log("- customer2@unilife.local");
};

if (require.main === module) {
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
}

module.exports = {
  clearDatabase,
  seedDatabase,
  verifySeedIntegrity,
};
