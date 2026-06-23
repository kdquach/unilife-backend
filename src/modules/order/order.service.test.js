const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const orderService = require("./order.service");
const Order = require("./order.model");
const OrderItem = require("../orderItem/orderItem.model");
const Queue = require("../queue/queue.model");
const Food = require("../food/food.model");
const MenuScheduleItem = require("../menuScheduleItem/menuScheduleItem.model");
const Cart = require("../cart/cart.model");
const CartItem = require("../cartItem/cartItem.model");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  // Setup environment variables for SePay configs used in checkout
  process.env.SEPAY_BANK_ACCOUNT_NUMBER = "0000000001";
  process.env.SEPAY_BANK_NAME = "Vietcombank";
  process.env.SEPAY_ACCOUNT_NAME = "SBSEPAYJDSCCIHAPKZK";
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Order.deleteMany({});
  await OrderItem.deleteMany({});
  await Queue.deleteMany({});
  await Food.deleteMany({});
  await MenuScheduleItem.deleteMany({});
  await Cart.deleteMany({});
  await CartItem.deleteMany({});
});

describe("Order Service - Checkout Logic", () => {
  it("should successfully checkout and deduct stock atomically", async () => {
    const userId = new mongoose.Types.ObjectId();

    const food = await Food.create({
      name: "Test Food",
      description: "Test",
      price: 10000,
      stockQuantity: 10,
      isActive: true,
      categoryId: new mongoose.Types.ObjectId(),
      image: "test.jpg",
    });
    const cart = await Cart.create({ userId });
    await CartItem.create({ cartId: cart._id, foodId: food._id, quantity: 2 });

    const order = await orderService.checkout(userId, { note: "test order" });

    expect(order).toBeDefined();
    expect(order.totalPrice).toBe(20000);
    expect(order.paymentStatus).toBe("PENDING");
    expect(order.paymentInfo.bankName).toBe("Vietcombank");

    const updatedFood = await Food.findById(food._id);
    expect(updatedFood.stockQuantity).toBe(8);

    const remainingCartItems = await CartItem.find({ cartId: cart._id });
    expect(remainingCartItems.length).toBe(0);
  });

  it("should prevent concurrent checkouts from exceeding stock (Race Condition)", async () => {
    const userId1 = new mongoose.Types.ObjectId();
    const userId2 = new mongoose.Types.ObjectId();

    const food = await Food.create({
      name: "Limited Food",
      description: "Test",
      price: 10000,
      stockQuantity: 2,
      isActive: true,
      categoryId: new mongoose.Types.ObjectId(),
      image: "test.jpg",
    });

    const cart1 = await Cart.create({ userId: userId1 });
    await CartItem.create({ cartId: cart1._id, foodId: food._id, quantity: 2 });

    const cart2 = await Cart.create({ userId: userId2 });
    await CartItem.create({ cartId: cart2._id, foodId: food._id, quantity: 2 });

    const results = await Promise.allSettled([
      orderService.checkout(userId1, {}),
      orderService.checkout(userId2, {}),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason.statusCode).toBe(400);
    expect(rejected[0].reason.message).toContain("Insufficient stock");

    const updatedFood = await Food.findById(food._id);
    expect(updatedFood.stockQuantity).toBe(0);
  });

  it("should throw error if cart is empty", async () => {
    const userId = new mongoose.Types.ObjectId();
    await Cart.create({ userId });

    await expect(orderService.checkout(userId, {})).rejects.toThrow(
      "Cart is empty",
    );
  });

  it("should throw error and rollback stock if one item fails during checkout", async () => {
    const userId = new mongoose.Types.ObjectId();

    // Food 1 has plenty of stock
    const food1 = await Food.create({
      name: "Food 1",
      description: "Test",
      price: 10000,
      stockQuantity: 10,
      isActive: true,
      categoryId: new mongoose.Types.ObjectId(),
      image: "test.jpg",
    });
    // Food 2 has insufficient stock for the cart
    const food2 = await Food.create({
      name: "Food 2",
      description: "Test",
      price: 15000,
      stockQuantity: 1,
      isActive: true,
      categoryId: new mongoose.Types.ObjectId(),
      image: "test.jpg",
    });

    const cart = await Cart.create({ userId });
    await CartItem.create({ cartId: cart._id, foodId: food1._id, quantity: 5 }); // Will succeed
    await CartItem.create({ cartId: cart._id, foodId: food2._id, quantity: 2 }); // Will fail

    await expect(orderService.checkout(userId, {})).rejects.toThrow(
      'Insufficient stock for "Food 2"',
    );

    // Verify rollback: Food 1 stock should remain 10, not 5
    const updatedFood1 = await Food.findById(food1._id);
    expect(updatedFood1.stockQuantity).toBe(10);
  });

  it("should throw error if an item is inactive", async () => {
    const userId = new mongoose.Types.ObjectId();
    const food = await Food.create({
      name: "Inactive Food",
      description: "Test",
      price: 10000,
      stockQuantity: 10,
      isActive: false,
      categoryId: new mongoose.Types.ObjectId(),
      image: "test.jpg",
    });

    const cart = await Cart.create({ userId });
    await CartItem.create({ cartId: cart._id, foodId: food._id, quantity: 1 });

    await expect(orderService.checkout(userId, {})).rejects.toThrow(
      'Food "Inactive Food" is not available',
    );
  });
});

describe("Order Service - Scan Pickup QR", () => {
  it("should create a waiting kitchen queue entry for a valid paid order", async () => {
    const order = await Order.create({
      userId: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
      orderCode: "UL-PO-SCAN-001",
      status: "PAID",
      totalPrice: 30000,
      paymentMethod: "SEPAY",
      paymentStatus: "PAID",
      isWalkIn: false,
      transferContent: "UNSCAN001",
    });

    const result = await orderService.scanPickupQr({
      qrPayload: JSON.stringify({ orderCode: order.orderCode }),
    });

    expect(result.created).toBe(true);
    expect(result.queue.queueNumber).toBe(1);
    expect(result.queue.status).toBe("WAITING");
    expect(result.order.orderCode).toBe(order.orderCode);

    const queue = await Queue.findOne({ orderId: order._id });
    expect(queue).toBeDefined();
    expect(queue.status).toBe("WAITING");
  });

  it("should return existing queue when pickup QR is scanned again", async () => {
    const order = await Order.create({
      userId: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
      orderCode: "UL-PO-SCAN-002",
      status: "PAID",
      totalPrice: 30000,
      paymentMethod: "SEPAY",
      paymentStatus: "PAID",
      isWalkIn: false,
    });

    const firstScan = await orderService.scanPickupQr({
      orderCode: order.orderCode,
    });
    const secondScan = await orderService.scanPickupQr({
      orderCode: order.orderCode,
    });

    expect(firstScan.created).toBe(true);
    expect(secondScan.created).toBe(false);
    expect(secondScan.queue.queueNumber).toBe(firstScan.queue.queueNumber);
    expect(await Queue.countDocuments({ orderId: order._id })).toBe(1);
  });

  it("should reject unpaid pickup QR scans", async () => {
    const order = await Order.create({
      userId: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
      orderCode: "UL-PO-SCAN-003",
      status: "PENDING_PAYMENT",
      totalPrice: 30000,
      paymentMethod: "SEPAY",
      paymentStatus: "PENDING",
      isWalkIn: false,
    });

    await expect(
      orderService.scanPickupQr({ orderCode: order.orderCode }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Only paid or confirmed orders can enter kitchen queue",
    });
  });
});
