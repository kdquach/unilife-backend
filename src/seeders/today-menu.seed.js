require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db.config");

const Food = require("../modules/food/food.model");
const FoodCategory = require("../modules/foodCategory/foodCategory.model");
const MenuSchedule = require("../modules/menuSchedule/menuSchedule.model");
const MenuScheduleItem = require("../modules/menuScheduleItem/menuScheduleItem.model");
const CartItem = require("../modules/cartItem/cartItem.model");
const User = require("../modules/user/user.model");
const { getVietnamDayRange } = require("../utils/date.util");

const categories = [
  "Rice Meals",
  "Noodles",
  "Snacks",
  "Vegetarian",
  "Western",
];

const menuFoods = [
  {
    name: "Chicken Rice",
    category: "Rice Meals",
    description: "Steamed rice served with grilled chicken and vegetables.",
    imageUrl: "/uploads/foods/chicken-rice.jpg",
    price: 30000,
    maxServing: 80,
    reservedCount: 8,
    servedCount: 3,
  },
  {
    name: "Pork Rice",
    category: "Rice Meals",
    description: "Steamed rice served with braised pork.",
    imageUrl: "/uploads/foods/pork-rice.jpg",
    price: 32000,
    maxServing: 70,
    reservedCount: 6,
    servedCount: 2,
  },
  {
    name: "Beef Noodle Soup",
    category: "Noodles",
    description: "Hot noodle soup with sliced beef and fresh herbs.",
    imageUrl: "/uploads/foods/beef-noodle.jpg",
    price: 35000,
    maxServing: 60,
    reservedCount: 5,
    servedCount: 2,
  },
  {
    name: "Fried Rice",
    category: "Rice Meals",
    description: "Campus-style fried rice with egg, sausage, and vegetables.",
    imageUrl: "/uploads/foods/fried-rice.jpg",
    price: 28000,
    maxServing: 65,
    reservedCount: 4,
    servedCount: 1,
  },
  {
    name: "Chicken Banh Mi",
    category: "Snacks",
    description: "Crispy baguette with chicken, cucumber, and house sauce.",
    imageUrl: "/uploads/foods/chicken-banh-mi.jpg",
    price: 22000,
    maxServing: 50,
    reservedCount: 3,
    servedCount: 1,
  },
  {
    name: "Veggie Rice Bowl",
    category: "Vegetarian",
    description: "Rice bowl with tofu, greens, mushrooms, and sesame sauce.",
    imageUrl: "/uploads/foods/veggie-rice-bowl.jpg",
    price: 27000,
    maxServing: 45,
    reservedCount: 2,
    servedCount: 0,
  },
  {
    name: "Spaghetti Bolognese",
    category: "Western",
    description: "Pasta with beef tomato sauce and parmesan.",
    imageUrl: "/uploads/foods/spaghetti-bolognese.jpg",
    price: 38000,
    maxServing: 40,
    reservedCount: 2,
    servedCount: 0,
  },
  {
    name: "Crispy Fish Rice",
    category: "Rice Meals",
    description: "Rice with crispy fish fillet and sweet chili sauce.",
    imageUrl: "/uploads/foods/crispy-fish-rice.jpg",
    price: 34000,
    maxServing: 55,
    reservedCount: 4,
    servedCount: 1,
  },
];

const alwaysAvailableFoods = [
  {
    name: "Iced Tea",
    category: "Snacks",
    description: "Cold tea drink for quick purchase.",
    imageUrl: "/uploads/foods/iced-tea.jpg",
    price: 8000,
    stockQuantity: 100,
  },
  {
    name: "Egg Sandwich",
    category: "Snacks",
    description: "Bread sandwich with egg and lettuce.",
    imageUrl: "/uploads/foods/egg-sandwich.jpg",
    price: 20000,
    stockQuantity: 45,
  },
];

const upsertCategory = async (name) => {
  const category = await FoodCategory.findOneAndUpdate(
    { name },
    { $set: { name, isActive: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return category;
};

const seedTodayMenu = async () => {
  await connectDB();

  const categoryByName = new Map();
  for (const categoryName of categories) {
    categoryByName.set(categoryName, await upsertCategory(categoryName));
  }

  const createdBy = await User.findOne({
    role: { $in: ["MANAGER", "ADMIN"] },
    isActive: true,
  }).sort({ role: -1, createdAt: 1 });

  const { start, end } = getVietnamDayRange();

  await MenuSchedule.updateMany(
    {
      status: "PUBLISHED",
      $or: [{ date: { $lt: start } }, { date: { $gt: end } }],
    },
    { $set: { status: "DRAFT", publishedAt: null } },
  );

  const schedule = await MenuSchedule.findOneAndUpdate(
    { date: { $gte: start, $lte: end } },
    {
      $set: {
        date: start,
        status: "PUBLISHED",
        createdBy: createdBy?._id,
        publishedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const todayMenuFoodIds = [];

  for (const item of menuFoods) {
    const category = categoryByName.get(item.category);
    const food = await Food.findOneAndUpdate(
      { name: item.name },
      {
        $set: {
          categoryId: category._id,
          name: item.name,
          description: item.description,
          imageUrl: item.imageUrl,
          price: item.price,
          isMenuItem: true,
          stockQuantity: null,
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    todayMenuFoodIds.push(food._id);

    const remainingCount = Math.max(
      item.maxServing - item.reservedCount - item.servedCount,
      0,
    );

    await MenuScheduleItem.findOneAndUpdate(
      { menuScheduleId: schedule._id, foodId: food._id },
      {
        $set: {
          menuScheduleId: schedule._id,
          foodId: food._id,
          maxServing: item.maxServing,
          reservedCount: item.reservedCount,
          servedCount: item.servedCount,
          remainingCount,
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  await MenuScheduleItem.updateMany(
    {
      menuScheduleId: schedule._id,
      foodId: { $nin: todayMenuFoodIds },
    },
    { $set: { isActive: false } },
  );

  const staleMenuItemIds = await MenuScheduleItem.distinct("_id", {
    $or: [
      { menuScheduleId: { $ne: schedule._id } },
      { menuScheduleId: schedule._id, foodId: { $nin: todayMenuFoodIds } },
    ],
  });
  await CartItem.deleteMany({ menuScheduleItemId: { $in: staleMenuItemIds } });

  for (const item of alwaysAvailableFoods) {
    const category = categoryByName.get(item.category);
    await Food.findOneAndUpdate(
      { name: item.name },
      {
        $set: {
          categoryId: category._id,
          name: item.name,
          description: item.description,
          imageUrl: item.imageUrl,
          price: item.price,
          isMenuItem: false,
          stockQuantity: item.stockQuantity,
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  const activeItems = await MenuScheduleItem.countDocuments({
    menuScheduleId: schedule._id,
    isActive: true,
  });

  console.log("Today menu seed completed.");
  console.log(`Schedule: ${schedule._id}`);
  console.log(`Published date: ${start.toISOString().slice(0, 10)}`);
  console.log(`Active menu items: ${activeItems}`);
};

seedTodayMenu()
  .then(async () => {
    await mongoose.connection.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Today menu seed failed:", error);
    await mongoose.connection.close();
    process.exit(1);
  });
