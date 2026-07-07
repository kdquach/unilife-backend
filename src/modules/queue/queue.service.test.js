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
  await mongoose.connect(mongoServer.getUri());
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

const createPaidOrder = async (overrides = {}) =>
  Order.create({
    orderCode: overrides.orderCode || `UL-PO-${Date.now()}`,
    status: overrides.status || "PAID",
    totalPrice: overrides.totalPrice || 30000,
    paymentMethod: overrides.paymentMethod || "SEPAY",
    paymentStatus: overrides.paymentStatus || "PAID",
    isWalkIn: overrides.isWalkIn || false,
    note: overrides.note || null,
  });

describe("Queue Service - Kitchen Queue Lifecycle", () => {
  it("does not show paid orders before counter scan", async () => {
    await createPaidOrder({ orderCode: "UL-PO-20260623-0001" });

    const result = await queueService.getMonitorQueue();

    expect(result.currentServing).toBeNull();
    expect(result.waiting).toHaveLength(0);
    expect(result.summary.total).toBe(0);
  });

  it("creates a waiting queue entry when counter scans a valid paid order", async () => {
    const order = await createPaidOrder({ orderCode: "UL-PO-20260623-0001" });

    const result = await queueService.scanOrderQr({
      orderCode: order.orderCode,
    });

    expect(result.created).toBe(true);
    expect(result.queue.queueNumber).toBe(1);
    expect(result.queue.status).toBe("WAITING");
    expect(result.queue.scannedAt).toBeDefined();
    expect(result.queue.orderId.orderCode).toBe(order.orderCode);
  });

  it("does not create a duplicate queue when scanning the same QR again", async () => {
    const order = await createPaidOrder({ orderCode: "UL-PO-20260623-0001" });

    const firstScan = await queueService.scanOrderQr({
      orderCode: order.orderCode,
    });
    const secondScan = await queueService.scanOrderQr({
      orderCode: order.orderCode,
    });

    expect(firstScan.created).toBe(true);
    expect(secondScan.created).toBe(false);
    expect(secondScan.queue.queueNumber).toBe(firstScan.queue.queueNumber);
    expect(await Queue.countDocuments({ orderId: order._id })).toBe(1);
  });

  it("auto-promotes the earliest waiting queue to serving on monitor", async () => {
    const firstOrder = await createPaidOrder({
      orderCode: "UL-PO-20260623-0001",
    });
    const secondOrder = await createPaidOrder({
      orderCode: "UL-PO-20260623-0002",
    });

    await queueService.scanOrderQr({ orderCode: firstOrder.orderCode });
    await queueService.scanOrderQr({ orderCode: secondOrder.orderCode });

    const result = await queueService.getMonitorQueue();

    expect(result.currentServing.queueNumber).toBe(1);
    expect(result.currentServing.status).toBe("SERVING");
    expect(result.waiting).toHaveLength(1);
    expect(result.waiting[0].queueNumber).toBe(2);
  });

  it("marks current serving done, completes its order, and promotes next waiting queue", async () => {
    const firstOrder = await createPaidOrder({
      orderCode: "UL-PO-20260623-0001",
    });
    const secondOrder = await createPaidOrder({
      orderCode: "UL-PO-20260623-0002",
    });

    await queueService.scanOrderQr({ orderCode: firstOrder.orderCode });
    await queueService.scanOrderQr({ orderCode: secondOrder.orderCode });
    await queueService.getMonitorQueue();

    const result = await queueService.callNextNumber();

    expect(result.completedQueue.status).toBe("DONE");
    expect(result.completedQueue.doneAt).toBeDefined();
    expect(result.currentServing.queueNumber).toBe(2);
    expect(result.currentServing.status).toBe("SERVING");

    const completedOrder = await Order.findById(firstOrder._id);
    expect(completedOrder.status).toBe("COMPLETED");
  });

  it("rejects cancelled, expired, or completed orders during scan", async () => {
    const order = await createPaidOrder({
      orderCode: "UL-PO-20260623-0001",
      status: "CANCELLED",
    });

    await expect(
      queueService.scanOrderQr({ orderCode: order.orderCode }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Cannot scan order with status CANCELLED",
    });
  });
});
