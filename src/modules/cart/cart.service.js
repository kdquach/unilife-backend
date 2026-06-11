const Cart = require("./cart.model");
const CartItem = require("../cartItem/cartItem.model");
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
  // Find or create cart for the user
  let cart = await Cart.findOne({ userId });
  if (!cart) {
    cart = await Cart.create({ userId });
  }

  // Find all cart items for this cart and populate nested items
  const cartItems = await CartItem.find({ cartId: cart._id }).populate({
    path: "menuScheduleItemId",
    populate: [{ path: "foodId" }, { path: "menuScheduleId" }],
  });

  let totalPrice = 0;
  let totalItems = 0;

  const formattedItems = cartItems.map((item) => {
    const msi = item.menuScheduleItemId;

    // Extract populated food and menu schedule details
    const food = msi ? msi.foodId : null;
    const menuSchedule = msi ? msi.menuScheduleId : null;

    let isValid = true;
    let reason = null;

    if (!msi) {
      isValid = false;
      reason = "The dish is not on the menu for today";
    } else if (!msi.isActive) {
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

    const price = food ? food.price : 0;
    const subtotal = item.quantity * price;

    if (isValid) {
      totalPrice += subtotal;
      totalItems += item.quantity;
    }

    return {
      cartItemId: item._id.toString(),
      menuScheduleItemId: msi ? msi._id.toString() : null,
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
      remainingCount: msi ? msi.remainingCount : 0,
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

module.exports = { create, list, getById, updateById, deleteById, getMyCart };
