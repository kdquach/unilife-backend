const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const queueService = require("./queue.service");
const Queue = require("./queue.model");
const Order = require("../order/order.model");
const OrderItem = require("../orderItem/orderItem.model");
const Food = require("../food/food.model");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Queue.deleteMany({});
  await Order.deleteMany({});
  await OrderItem.deleteMany({});
  await Food.deleteMany({});
});

describe("Queue Service - Monitor Queue", () => {
  it("returns paid active queue entries with populated order items", async () => {
    const food = await Food.create({
      name: "Chicken Rice",
      description: "Test food",
      price: 30000,
      stockQuantity: 10,
      isActive: true,
    });

    const paidOrder = await Order.create({
      orderCode: "UL-PO-20260623-0001",
      status: "CONFIRMED",
      totalPrice: 30000,
      paymentMethod: "SEPAY",
      paymentStatus: "PAID",
      isWalkIn: false,
    });
    await OrderItem.create({
      orderId: paidOrder._id,
      itemType: "REGULAR_FOOD",
      foodId: food._id,
      quantity: 1,
      unitPrice: 30000,
      subtotal: 30000,
    });
    await Queue.create({
      orderId: paidOrder._id,
      queueNumber: 2,
      status: "WAITING",
    });

    const unpaidOrder = await Order.create({
      orderCode: "UL-PO-20260623-0002",
      status: "PENDING",
      totalPrice: 30000,
      paymentMethod: "SEPAY",
      paymentStatus: "PENDING",
      isWalkIn: false,
    });
    await Queue.create({
      orderId: unpaidOrder._id,
      queueNumber: 1,
      status: "WAITING",
    });

    const result = await queueService.getMonitorQueue();

    expect(result.items).toHaveLength(1);
    expect(result.summary.total).toBe(1);
    expect(result.summary.waiting).toBe(1);
    expect(result.items[0].queueNumber).toBe(2);
    expect(result.items[0].orderId.orderCode).toBe("UL-PO-20260623-0001");
    expect(result.items[0].orderId.items).toHaveLength(1);
    expect(result.items[0].orderId.items[0].foodId.name).toBe("Chicken Rice");
  });

  it("supports status filtering for kitchen monitor", async () => {
    const preparingOrder = await Order.create({
      orderCode: "UL-WI-20260623-0001",
      status: "PREPARING",
      totalPrice: 35000,
      paymentMethod: "CASH",
      paymentStatus: "PAID",
      isWalkIn: true,
    });
    await Queue.create({
      orderId: preparingOrder._id,
      queueNumber: 1,
      status: "PREPARING",
    });

    const waitingOrder = await Order.create({
      orderCode: "UL-WI-20260623-0002",
      status: "CONFIRMED",
      totalPrice: 30000,
      paymentMethod: "CASH",
      paymentStatus: "PAID",
      isWalkIn: true,
    });
    await Queue.create({
      orderId: waitingOrder._id,
      queueNumber: 2,
      status: "WAITING",
    });

    const result = await queueService.getMonitorQueue({
      status: "PREPARING",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe("PREPARING");
    expect(result.summary.preparing).toBe(1);
    expect(result.summary.waiting).toBe(0);
  });
});
