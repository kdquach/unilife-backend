const Cart = require("./cart.model");
const CartItem = require("../cartItem/cartItem.model");
const MenuScheduleItem = require("../menuScheduleItem/menuScheduleItem.model");
const Food = require("../food/food.model");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => Cart.create(data);

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.isActive !== undefined) filter.isActive = query.isActive === "true";
  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;
  if (query.keyword)
    filter.$or = [
      { name: new RegExp(query.keyword, "i") },
      { title: new RegExp(query.keyword, "i") },
      { email: new RegExp(query.keyword, "i") },
      { fullName: new RegExp(query.keyword, "i") },
    ];

  const [items, total] = await Promise.all([
    Cart.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
    Cart.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) => Cart.findById(id);
const updateById = (id, data) =>
  Cart.findByIdAndUpdate(id, data, { new: true, runValidators: true });
const deleteById = (id) => Cart.findByIdAndDelete(id);

const getMyCart = async (userId) => {
  // Find or create cart for the user using lean query for memory optimization
  let cart = await Cart.findOne({ userId }).lean();
  if (!cart) {
    cart = await Cart.create({ userId });
  }

  // Find all cart items for this cart and deeply populate nested items with targeted fields
  const cartItems = await CartItem.find({ cartId: cart._id })
    .populate({
      path: "menuScheduleItemId",
      select: "isActive remainingCount maxServing foodId menuScheduleId",
      populate: [
        { path: "foodId", select: "isActive name price imageUrl description" },
        { path: "menuScheduleId", select: "date status" },
      ],
    })
    .populate({
      path: "foodId",
      select: "isActive name price imageUrl description stockQuantity isMenuItem",
    })
    .lean();

  let totalPrice = 0;
  let totalItems = 0;

  const formattedItems = cartItems.map((item) => {
    const msi = item.menuScheduleItemId;
    const regularFood = item.foodId;

    // Extract populated food and menu schedule details
    const food = msi ? msi.foodId : regularFood;
    const menuSchedule = msi ? msi.menuScheduleId : null;

    let isValid = true;
    let reason = null;

    if (msi) {
      if (!msi.isActive) {
        isValid = false;
        reason = "The dish is not available today or has been discontinued";
      } else if (!food) {
        isValid = false;
        reason = "The dish does not exist";
      } else if (!food.isActive) {
        isValid = false;
        reason = "The dish is no longer available for purchase";
      } else if (!menuSchedule) {
        isValid = false;
        reason = "The dish is not on the menu for today";
      } else if (menuSchedule.status !== "PUBLISHED") {
        isValid = false;
        reason = "The menu schedule is not published";
      } else if (msi.remainingCount <= 0) {
        isValid = false;
        reason = "The dish is out of stock";
      } else if (item.quantity <= 0) {
        isValid = false;
        reason = "The quantity must be greater than 0";
      } else if (msi.remainingCount < item.quantity) {
        isValid = false;
        reason = `The remaining quantity is insufficient (only ${msi.remainingCount} items left)`;
      }
    } else if (regularFood) {
      if (!regularFood.isActive) {
        isValid = false;
        reason = "The dish is no longer available for purchase";
      } else if (regularFood.stockQuantity <= 0) {
        isValid = false;
        reason = "The dish is out of stock";
      } else if (item.quantity <= 0) {
        isValid = false;
        reason = "The quantity must be greater than 0";
      } else if (regularFood.stockQuantity < item.quantity) {
        isValid = false;
        reason = `The remaining quantity is insufficient (only ${regularFood.stockQuantity} items left)`;
      }
    } else {
      isValid = false;
      reason = "Invalid cart item";
    }

    const price = food ? food.price : 0;
    const subtotal = item.quantity * price;

    if (isValid) {
      totalPrice += subtotal;
      totalItems += item.quantity;
    }

    return {
      cartItemId: item._id.toString(),
      menuScheduleItemId: msi ? msi._id.toString() : null,
      foodId: regularFood ? regularFood._id.toString() : null,
      quantity: item.quantity,
      food: food
        ? {
            foodId: food._id.toString(),
            name: food.name,
            price: food.price,
            imageUrl: food.imageUrl,
            description: food.description,
          }
        : null,
      menuSchedule: menuSchedule
        ? {
            menuScheduleId: menuSchedule._id.toString(),
            date: menuSchedule.date,
            status: menuSchedule.status,
          }
        : null,
      maxServing: msi ? msi.maxServing : 0,
      remainingCount: msi ? msi.remainingCount : (regularFood ? regularFood.stockQuantity : 0),
      isValid,
      reason,
      subtotal,
    };
  });

  return {
    cartId: cart._id.toString(),
    userId: cart.userId ? cart.userId.toString() : null,
    items: formattedItems,
    totalPrice,
    totalItems,
  };
};

const addItem = async (userId, data) => {
  const { menuScheduleItemId, foodId, quantity } = data;
  if ((!menuScheduleItemId && !foodId) || quantity == null || !Number.isInteger(quantity) || quantity <= 0) {
    const error = new Error("Quantity must be a positive integer, and a dish ID is required.");
    error.statusCode = 400;
    throw error;
  }

  let cart = await Cart.findOne({ userId }).select("_id").lean();
  if (!cart) {
    cart = await Cart.create({ userId });
  }

  if (menuScheduleItemId) {
    const msi = await MenuScheduleItem.findById(menuScheduleItemId)
      .select("isActive remainingCount foodId menuScheduleId")
      .populate({ path: "foodId", select: "isActive" })
      .populate({ path: "menuScheduleId", select: "status" })
      .lean();

    if (!msi) {
      const err = new Error("The dish does not exist in the menu schedule");
      err.statusCode = 404;
      throw err;
    }
    if (!msi.isActive) {
      const err = new Error(
        "The dish is not available today or has been discontinued",
      );
      err.statusCode = 400;
      throw err;
    }
    if (!msi.foodId || !msi.foodId.isActive) {
      const err = new Error("The dish is no longer available for purchase");
      err.statusCode = 400;
      throw err;
    }
    if (!msi.menuScheduleId || msi.menuScheduleId.status !== "PUBLISHED") {
      const err = new Error("The menu schedule is not published");
      err.statusCode = 400;
      throw err;
    }

    const existingCartItem = await CartItem.findOne({
      cartId: cart._id,
      menuScheduleItemId,
    })
      .select("quantity")
      .lean();
    const currentQuantity = existingCartItem ? existingCartItem.quantity : 0;

    if (currentQuantity + quantity > msi.remainingCount) {
      const err = new Error(
        `The remaining quantity is insufficient (only ${msi.remainingCount} items left)`,
      );
      err.statusCode = 400;
      throw err;
    }

    await CartItem.findOneAndUpdate(
      { cartId: cart._id, menuScheduleItemId },
      { $inc: { quantity: quantity } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } else if (foodId) {
    const food = await Food.findById(foodId).select("isActive stockQuantity isMenuItem").lean();
    if (!food) {
      const err = new Error("The dish does not exist");
      err.statusCode = 404;
      throw err;
    }
    if (food.isMenuItem) {
      const err = new Error("This dish must be ordered from the menu schedule");
      err.statusCode = 400;
      throw err;
    }
    if (!food.isActive) {
      const err = new Error("The dish is no longer available for purchase");
      err.statusCode = 400;
      throw err;
    }

    const existingCartItem = await CartItem.findOne({
      cartId: cart._id,
      foodId,
    })
      .select("quantity")
      .lean();
    const currentQuantity = existingCartItem ? existingCartItem.quantity : 0;

    if (currentQuantity + quantity > food.stockQuantity) {
      const err = new Error(
        `The remaining quantity is insufficient (only ${food.stockQuantity} items left)`,
      );
      err.statusCode = 400;
      throw err;
    }

    await CartItem.findOneAndUpdate(
      { cartId: cart._id, foodId },
      { $inc: { quantity: quantity } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  return getMyCart(userId);
};

const updateItem = async (userId, cartItemId, data) => {
  const { quantity } = data;
  if (quantity == null || !Number.isInteger(quantity) || quantity < 0) {
    const error = new Error("Quantity must be a non-negative integer.");
    error.statusCode = 400;
    throw error;
  }

  let cart = await Cart.findOne({ userId }).select("_id").lean();
  if (!cart) {
    const err = new Error("Cart not found.");
    err.statusCode = 404;
    throw err;
  }

  if (quantity === 0) {
    await CartItem.findOneAndDelete({ _id: cartItemId, cartId: cart._id });
    return getMyCart(userId);
  }

  const existingCartItem = await CartItem.findOne({
    _id: cartItemId,
    cartId: cart._id,
  })
    .select("menuScheduleItemId foodId")
    .lean();
  if (!existingCartItem) {
    const err = new Error("Cart item not found.");
    err.statusCode = 404;
    throw err;
  }

  if (existingCartItem.menuScheduleItemId) {
    const msi = await MenuScheduleItem.findById(
      existingCartItem.menuScheduleItemId,
    )
      .select("remainingCount")
      .lean();
    if (!msi) {
      const err = new Error("The dish does not exist in the menu schedule.");
      err.statusCode = 404;
      throw err;
    }

    if (quantity > msi.remainingCount) {
      const err = new Error(
        `The remaining quantity is insufficient (only ${msi.remainingCount} items left)`,
      );
      err.statusCode = 400;
      throw err;
    }
  } else if (existingCartItem.foodId) {
    const food = await Food.findById(existingCartItem.foodId).select("stockQuantity").lean();
    if (!food) {
      const err = new Error("The dish does not exist.");
      err.statusCode = 404;
      throw err;
    }

    if (quantity > food.stockQuantity) {
      const err = new Error(
        `The remaining quantity is insufficient (only ${food.stockQuantity} items left)`,
      );
      err.statusCode = 400;
      throw err;
    }
  }

  // Atomic update using $set
  await CartItem.findOneAndUpdate(
    { _id: cartItemId, cartId: cart._id },
    { $set: { quantity: quantity } },
    { new: true },
  );

  return getMyCart(userId);
};

const removeItem = async (userId, cartItemId) => {
  const cart = await Cart.findOne({ userId }).select("_id").lean();
  if (!cart) {
    const err = new Error("Cart not found.");
    err.statusCode = 404;
    throw err;
  }

  const deletedItem = await CartItem.findOneAndDelete({
    _id: cartItemId,
    cartId: cart._id,
  });
  if (!deletedItem) {
    const err = new Error("Cart item not found.");
    err.statusCode = 404;
    throw err;
  }

  return getMyCart(userId);
};

module.exports = {
  create,
  list,
  getById,
  updateById,
  deleteById,
  getMyCart,
  addItem,
  updateItem,
  removeItem,
};
