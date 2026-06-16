const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const paymentService = require("./payment.service");
const Order = require("../order/order.model");
const OrderItem = require("../orderItem/orderItem.model");
const Queue = require("../queue/queue.model");
const Food = require("../food/food.model");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  process.env.SEPAY_API_KEY = "TEST_API_KEY";
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
});

describe("Payment Service - Webhook & Cron Jobs", () => {
  it("should verify webhook auth correctly", () => {
    expect(paymentService.verifyWebhookAuth("Bearer TEST_API_KEY")).toBe(true);
    expect(paymentService.verifyWebhookAuth("Apikey TEST_API_KEY")).toBe(true);
    expect(paymentService.verifyWebhookAuth("InvalidKey")).toBe(false);
  });

  it("should process valid incoming webhook and update order to PAID", async () => {
    const order = await Order.create({
      orderCode: "202601",
      status: "PENDING",
      totalPrice: 50000,
      paymentMethod: "SEPAY",
      paymentStatus: "PENDING",
      transferContent: "UN202601"
    });

    const webhookData = {
      content: "Chuyen tien don UN202601",
      transferAmount: 50000,
      transferType: "in",
      referenceCode: "MBVCB.12345",
      id: 999
    };

    const result = await paymentService.processWebhook(webhookData);
    expect(result.success).toBe(true);

    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.paymentStatus).toBe("PAID");
  });

  it("should process SePay dashboard dummy payload (UN pattern)", async () => {
    const order = await Order.create({
      orderCode: "234199",
      status: "PENDING",
      totalPrice: 100000,
      paymentMethod: "SEPAY",
      paymentStatus: "PENDING",
      transferContent: "UN234199"
    });

    const webhookData = {
      gateway: "Vietcombank",
      transactionDate: "2026-06-16 12:48:18",
      accountNumber: "0000000001",
      subAccount: "SBSEPAYJDSCCIHAPKZK",
      code: "UN234199",
      content: "Thanh toan don hang UN234199",
      transferType: "in",
      description: "Thanh toan don hang UN234199",
      transferAmount: 100000,
      referenceCode: "SB9A495AE358D8",
      accumulated: 0,
      id: 9248
    };

    const result = await paymentService.processWebhook(webhookData);
    expect(result.success).toBe(true);
    expect(result.message).toBe("Payment confirmed successfully");

    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.paymentStatus).toBe("PAID");
    expect(updatedOrder.transactionRef).toBe("SB9A495AE358D8");
  });

  it("should reject webhook if transfer amount is less than order total", async () => {
    const order = await Order.create({
      orderCode: "202602",
      status: "PENDING",
      totalPrice: 50000,
      paymentMethod: "SEPAY",
      paymentStatus: "PENDING",
      transferContent: "UN202602"
    });

    const webhookData = {
      content: "UN202602",
      transferAmount: 40000, // Short amount
      transferType: "in"
    };

    const result = await paymentService.processWebhook(webhookData);
    expect(result.message).toContain("Payment amount mismatch");
    
    // Status should remain unchanged, but note is added
    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.paymentStatus).toBe("PENDING");
    expect(updatedOrder.status).toBe("PENDING");
    expect(updatedOrder.note).toContain("Error: Invalid payment amount");
  });

  it("should reject webhook if transfer amount is greater than order total", async () => {
    const order = await Order.create({
      orderCode: "202603",
      status: "PENDING",
      totalPrice: 50000,
      paymentMethod: "SEPAY",
      paymentStatus: "PENDING",
      transferContent: "UN202603"
    });

    const webhookData = {
      content: "UN202603",
      transferAmount: 60000, // Over amount
      transferType: "in"
    };

    const result = await paymentService.processWebhook(webhookData);
    expect(result.message).toContain("Payment amount mismatch");
    
    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.paymentStatus).toBe("PENDING");
    expect(updatedOrder.status).toBe("PENDING");
    expect(updatedOrder.note).toContain("Error: Invalid payment amount");
  });

  it("should record LATE_PAYMENT if webhook arrives for CANCELLED order", async () => {
    const order = await Order.create({
      orderCode: "202604",
      status: "CANCELLED",
      totalPrice: 50000,
      paymentMethod: "SEPAY",
      paymentStatus: "EXPIRED",
      transferContent: "UN202604"
    });

    const webhookData = {
      content: "UN202604",
      transferAmount: 50000, // Correct amount
      transferType: "in"
    };

    const result = await paymentService.processWebhook(webhookData);
    expect(result.message).toContain("Late payment recorded");
    
    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.paymentStatus).toBe("LATE_PAYMENT");
    expect(updatedOrder.status).toBe("CANCELLED");
    expect(updatedOrder.note).toContain("CRITICAL ERROR: Payment received for cancelled order");
  });

  it("should expire pending orders and restore stock securely", async () => {
    // Create food with 0 stock
    const food = await Food.create({
      name: "Expired Food", description: "Test", price: 10000, stockQuantity: 0, isActive: true, categoryId: new mongoose.Types.ObjectId(), image: "test.jpg"
    });

    // Create an expired order
    const expiredDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    const order = await Order.create({
      orderCode: "UL-PO-OLD",
      status: "PENDING",
      totalPrice: 10000,
      paymentMethod: "SEPAY",
      paymentStatus: "PENDING",
      transferContent: "UNILIFE UL-PO-OLD",
      expiresAt: expiredDate
    });

    await OrderItem.create({
      orderId: order._id,
      itemType: "REGULAR_FOOD",
      foodId: food._id,
      quantity: 5,
      unitPrice: 10000,
      subtotal: 50000
    });

    await Queue.create({ orderId: order._id, queueNumber: 1, status: "WAITING" });

    // Run expiration job
    const result = await paymentService.expirePendingOrders();
    expect(result.expiredCount).toBe(1);

    // Verify order cancelled
    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.status).toBe("CANCELLED");
    expect(updatedOrder.paymentStatus).toBe("EXPIRED");

    // Verify stock restored
    const updatedFood = await Food.findById(food._id);
    expect(updatedFood.stockQuantity).toBe(5);

    // Verify queue cancelled
    const updatedQueue = await Queue.findOne({ orderId: order._id });
    expect(updatedQueue.status).toBe("CANCELLED");
  });
});
