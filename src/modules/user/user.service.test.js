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

  it("returns a clear error when non-admin assigns admin role", async () => {
    const manager = await createUser({
      fullName: "Manager",
      email: "manager@unilife.local",
      role: ROLES.MANAGER,
    });
    const staff = await createUser({
      fullName: "Kitchen Staff",
      email: "kitchen@unilife.local",
      role: ROLES.KITCHEN_STAFF,
    });

    await expect(
      userService.changeStaffRole(manager, staff._id.toString(), ROLES.ADMIN),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Only admins can assign admin role",
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

  it("updates staff basic information, status and role", async () => {
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

    const result = await userService.updateStaff(admin, staff._id.toString(), {
      fullName: "Counter Staff",
      email: "counter.staff@unilife.local",
      phone: "0912345678",
      role: ROLES.COUNTER_STAFF,
      isActive: false,
    });

    expect(result.fullName).toBe("Counter Staff");
    expect(result.email).toBe("counter.staff@unilife.local");
    expect(result.phone).toBe("0912345678");
    expect(result.role).toBe(ROLES.COUNTER_STAFF);
    expect(result.isActive).toBe(false);
    expect(result.passwordHash).toBeUndefined();
  });

  it("prevents manager from updating manager staff information", async () => {
    const manager = await createUser({
      fullName: "Manager",
      email: "manager@unilife.local",
      role: ROLES.MANAGER,
    });
    const anotherManager = await createUser({
      fullName: "Other Manager",
      email: "other.manager@unilife.local",
      role: ROLES.MANAGER,
    });

    await expect(
      userService.updateStaff(manager, anotherManager._id.toString(), {
        fullName: "Updated Manager",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Managers can only manage counter or kitchen staff",
    });
  });

  it("prevents changing own staff status through update staff", async () => {
    const admin = await createUser({
      fullName: "Admin",
      email: "admin@unilife.local",
      role: ROLES.ADMIN,
    });

    await expect(
      userService.updateStaff(admin, admin._id.toString(), {
        isActive: false,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Cannot change your own status",
    });
  });

  it("prevents duplicate email when updating staff information", async () => {
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
    await createUser({
      fullName: "Counter Staff",
      email: "counter@unilife.local",
      role: ROLES.COUNTER_STAFF,
    });

    await expect(
      userService.updateStaff(admin, staff._id.toString(), {
        email: "counter@unilife.local",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Email already exists",
    });
  });

  it("allows admin to create manager staff", async () => {
    const admin = await createUser({
      fullName: "Admin",
      email: "admin@unilife.local",
      role: ROLES.ADMIN,
    });

    const result = await userService.createStaff(admin, {
      fullName: "New Manager",
      email: "new.manager@unilife.local",
      phone: "0912345678",
      password: "secret123",
      role: ROLES.MANAGER,
    });

    expect(result.fullName).toBe("New Manager");
    expect(result.email).toBe("new.manager@unilife.local");
    expect(result.role).toBe(ROLES.MANAGER);
    expect(result.isActive).toBe(true);
    expect(result.passwordHash).toBeUndefined();
  });

  it("allows manager to create counter or kitchen staff only", async () => {
    const manager = await createUser({
      fullName: "Manager",
      email: "manager@unilife.local",
      role: ROLES.MANAGER,
    });

    const result = await userService.createStaff(manager, {
      fullName: "Counter Staff",
      email: "created.counter@unilife.local",
      phone: "0912345678",
      password: "secret123",
      role: ROLES.COUNTER_STAFF,
      isActive: "false",
    });

    expect(result.role).toBe(ROLES.COUNTER_STAFF);
    expect(result.isActive).toBe(false);

    await expect(
      userService.createStaff(manager, {
        fullName: "Manager Staff",
        email: "created.manager@unilife.local",
        phone: "0912345679",
        password: "secret123",
        role: ROLES.MANAGER,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Managers can only create counter or kitchen staff",
    });
  });

  it("prevents creating admin staff from staff management", async () => {
    const admin = await createUser({
      fullName: "Admin",
      email: "admin@unilife.local",
      role: ROLES.ADMIN,
    });

    await expect(
      userService.createStaff(admin, {
        fullName: "Another Admin",
        email: "another.admin@unilife.local",
        phone: "0912345678",
        password: "secret123",
        role: ROLES.ADMIN,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Admin staff cannot be created from staff management",
    });
  });

  it("prevents creating staff with duplicate email", async () => {
    const admin = await createUser({
      fullName: "Admin",
      email: "admin@unilife.local",
      role: ROLES.ADMIN,
    });
    await createUser({
      fullName: "Existing Staff",
      email: "existing.staff@unilife.local",
      role: ROLES.KITCHEN_STAFF,
    });

    await expect(
      userService.createStaff(admin, {
        fullName: "Duplicated Staff",
        email: "existing.staff@unilife.local",
        phone: "0912345678",
        password: "secret123",
        role: ROLES.KITCHEN_STAFF,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Email already exists",
    });
  });
});
