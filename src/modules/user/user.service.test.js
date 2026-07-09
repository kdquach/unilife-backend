const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const userService = require("./user.service");
const User = require("./user.model");
const ROLES = require("../../constants/roles.constant");

let mongoServer;

const createUser = (data) =>
  User.create({
    fullName: data.fullName || "Test User",
    email: data.email,
    phone: data.phone || "0900000000",
    passwordHash: "hashed-password",
    role: data.role || ROLES.CUSTOMER,
    isActive: data.isActive !== undefined ? data.isActive : true,
  });

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

describe("User Service - Manage Staff", () => {
  it("lists only staff accounts with pagination and filters", async () => {
    await createUser({
      fullName: "Kitchen Staff",
      email: "kitchen@unilife.local",
      role: ROLES.KITCHEN_STAFF,
    });
    await createUser({
      fullName: "Counter Staff",
      email: "counter@unilife.local",
      role: ROLES.COUNTER_STAFF,
      isActive: false,
    });
    await createUser({
      fullName: "Customer",
      email: "customer@unilife.local",
      role: ROLES.CUSTOMER,
    });

    const result = await userService.listStaffs({
      keyword: "staff",
      isActive: "true",
      page: 1,
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].email).toBe("kitchen@unilife.local");
    expect(result.items[0].passwordHash).toBeUndefined();
    expect(result.pagination.total).toBe(1);
  });

  it("gets staff detail by id", async () => {
    const staff = await createUser({
      fullName: "Manager",
      email: "manager@unilife.local",
      role: ROLES.MANAGER,
    });

    const result = await userService.getStaffById(staff._id.toString());

    expect(result.fullName).toBe("Manager");
    expect(result.role).toBe(ROLES.MANAGER);
    expect(result.passwordHash).toBeUndefined();
  });

  it("does not return customer from staff detail endpoint", async () => {
    const customer = await createUser({
      fullName: "Customer",
      email: "customer@unilife.local",
      role: ROLES.CUSTOMER,
    });

    await expect(
      userService.getStaffById(customer._id.toString()),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Staff not found",
    });
  });

  it("allows admin to change a staff role", async () => {
    const admin = await createUser({
      fullName: "Admin",
      email: "admin@unilife.local",
      role: ROLES.ADMIN,
    });
    const staff = await createUser({
      fullName: "Kitchen Staff",
      email: "kitchen@unilife.local",
      role: ROLES.KITCHEN_STAFF,
    });

    const result = await userService.changeStaffRole(
      admin,
      staff._id.toString(),
      ROLES.COUNTER_STAFF,
    );

    expect(result.role).toBe(ROLES.COUNTER_STAFF);
    expect(result.passwordHash).toBeUndefined();
  });

  it("prevents manager from assigning manager or admin roles", async () => {
    const manager = await createUser({
      fullName: "Manager",
      email: "manager@unilife.local",
      role: ROLES.MANAGER,
    });
    const staff = await createUser({
      fullName: "Counter Staff",
      email: "counter@unilife.local",
      role: ROLES.COUNTER_STAFF,
    });

    await expect(
      userService.changeStaffRole(
        manager,
        staff._id.toString(),
        ROLES.MANAGER,
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Managers can only manage counter or kitchen staff",
    });
  });

  it("prevents changing role for customers through staff endpoint", async () => {
    const admin = await createUser({
      fullName: "Admin",
      email: "admin@unilife.local",
      role: ROLES.ADMIN,
    });
    const customer = await createUser({
      fullName: "Customer",
      email: "customer@unilife.local",
      role: ROLES.CUSTOMER,
    });

    await expect(
      userService.changeStaffRole(
        admin,
        customer._id.toString(),
        ROLES.KITCHEN_STAFF,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Staff not found",
    });
  });

  it("prevents users from changing their own staff role", async () => {
    const admin = await createUser({
      fullName: "Admin",
      email: "admin@unilife.local",
      role: ROLES.ADMIN,
    });

    await expect(
      userService.changeStaffRole(admin, admin._id.toString(), ROLES.MANAGER),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Cannot change your own role",
    });
  });
});
