const mongoose = require("mongoose");
require("../ingredientCategory/ingredientCategory.model");
require("../ingredientBatch/ingredientBatch.model");
require("../supplier/supplier.model");
require("../user/user.model");
const Ingredient = require("./ingredient.model");
const IngredientCategory = require("../ingredientCategory/ingredientCategory.model");
const IngredientBatch = require("../ingredientBatch/ingredientBatch.model");
const IngredientTransaction = require("../ingredientTransaction/ingredientTransaction.model");
const Supplier = require("../supplier/supplier.model");
const { getPagination } = require("../../utils/pagination.util");

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const escapeRegExp = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const TEXT_HAS_LETTER = /\p{L}/u;
const TEXT_ONLY_LETTERS_AND_SPACES = /^[\p{L}\s]+$/u;

const assertHasLetter = (value, fieldName) => {
  if (!TEXT_HAS_LETTER.test(value)) {
    throw createError(`${fieldName} must contain at least one letter`);
  }
};

const assertOnlyLettersAndSpaces = (value, fieldName) => {
  if (!TEXT_ONLY_LETTERS_AND_SPACES.test(value)) {
    throw createError(`${fieldName} can only contain letters and spaces`);
  }
};

const toBoolean = (value) => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const getObjectIds = (value, fieldName) => {
  if (!value) return [];

  const values = Array.isArray(value) ? value : String(value).split(",");
  const ids = [];

  values.forEach((item) => {
    const trimmed = item.trim();
    if (!trimmed) return;

    if (!mongoose.Types.ObjectId.isValid(trimmed)) {
      throw createError(`Invalid ${fieldName}`);
    }

    ids.push(trimmed);
  });

  return ids;
};

const getOptionalObjectId = (value, fieldName) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!mongoose.Types.ObjectId.isValid(trimmed)) {
    throw createError(`Invalid ${fieldName}`);
  }

  return trimmed;
};

const getNumber = (value, fieldName, options = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw createError(`${fieldName} must be a number`);
  }

  if (options.positive && number <= 0) {
    throw createError(`${fieldName} must be greater than 0`);
  }

  if (options.nonNegative && number < 0) {
    throw createError(`${fieldName} must be greater than or equal to 0`);
  }

  if (
    options.maxDecimals !== undefined &&
    !Number.isInteger(number * 10 ** options.maxDecimals)
  ) {
    throw createError(`${fieldName} must have at most ${options.maxDecimals} decimal places`);
  }

  return number;
};

const getOptionalNumber = (value, fieldName, options = {}) => {
  if (value === undefined || value === null || value === "") return undefined;
  return getNumber(value, fieldName, options);
};

const getOptionalDate = (value, fieldName) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createError(`Invalid ${fieldName}`);
  }

  return date;
};

const getRequiredDate = (value, fieldName) => {
  const date = getOptionalDate(value, fieldName);
  if (!date) throw createError(`${fieldName} is required`);

  return date;
};

const getDateOnlyRange = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
};

const getReason = (value) => {
  const reason = String(value || "").trim();
  if (!reason) throw createError("Reason is required");
  if (reason.length > 500) {
    throw createError("Reason must be less than or equal to 500 characters");
  }

  return reason;
};

const getSupplierId = async (value) => {
  const supplierId = getOptionalObjectId(value, "supplierId");
  if (!supplierId) return null;

  const supplier = await Supplier.findOne({
    _id: supplierId,
    isActive: true,
    deletedAt: null,
  });
  if (!supplier) throw createError("Supplier not found or inactive", 404);

  return supplierId;
};

const getIngredientCategoryId = async (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw createError("Invalid categoryId");
  }

  const category = await IngredientCategory.findById(value);
  if (!category) throw createError("Ingredient category not found", 404);

  return value;
};

const assertUniqueIngredientName = async (name, excludeId = null) => {
  const filter = { name: new RegExp(`^${escapeRegExp(name)}$`, "i") };
  if (excludeId) filter._id = { $ne: excludeId };

  const existing = await Ingredient.findOne(filter);
  if (existing) {
    throw createError(
      "Ingredient already exists. Please adjust stock or create a new batch instead",
      409,
    );
  }
};

const assertAllowedIngredientFields = (data = {}, options = {}) => {
  const allowedFields = new Set([
    "categoryId",
    "name",
    "unit",
    "storageType",
    "minStockThreshold",
    "isActive",
  ]);
  const ignoredFields = options.partial ? [] : ["currentStock"];
  const receivedFields = Object.keys(data || {});
  const unknownFields = receivedFields.filter(
    (field) => !allowedFields.has(field) && !ignoredFields.includes(field),
  );

  if (unknownFields.length > 0) {
    throw createError(`Unsupported field(s): ${unknownFields.join(", ")}`);
  }
};

const assertAllowedStockImportFields = (data = {}) => {
  const allowedFields = new Set([
    "quantity",
    "expiryDate",
    "supplierId",
    "unitPrice",
    "reason",
    "referenceType",
    "referenceId",
    "importCode",
  ]);
  const unknownFields = Object.keys(data || {}).filter(
    (field) => !allowedFields.has(field),
  );

  if (unknownFields.length > 0) {
    throw createError(`Unsupported field(s): ${unknownFields.join(", ")}`);
  }
};

const assertAllowedStockAdjustmentFields = (data = {}) => {
  const allowedFields = new Set([
    "adjustmentType",
    "type",
    "action",
    "transactionType",
    "quantity",
    "newStock",
    "stockAfter",
    "stockBefore",
    "batchId",
    "expiryDate",
    "supplierId",
    "unitPrice",
    "reason",
    "referenceType",
    "referenceId",
  ]);
  const unknownFields = Object.keys(data || {}).filter(
    (field) => !allowedFields.has(field),
  );

  if (unknownFields.length > 0) {
    throw createError(`Unsupported field(s): ${unknownFields.join(", ")}`);
  }
};

const assertFutureDate = (date, fieldName) => {
  if (date <= new Date()) {
    throw createError(`${fieldName} must be in the future`);
  }
};

const assertNoBatchWithExpiryDate = async (
  ingredientId,
  expiryDate,
  session,
  excludeBatchId = null,
) => {
  if (!expiryDate) return;

  const { start, end } = getDateOnlyRange(expiryDate);
  const filter = {
    ingredientId,
    expiryDate: { $gte: start, $lt: end },
  };

  if (excludeBatchId) {
    filter._id = { $ne: excludeBatchId };
  }

  const existingBatch = await IngredientBatch.findOne(filter).session(session);
  if (existingBatch) {
    throw createError(
      "A batch with this expiry date already exists for this ingredient. Please import into the existing batch or choose another expiry date",
      409,
    );
  }
};

const buildIngredientData = async (data = {}, options = {}) => {
  const payload = {};

  assertAllowedIngredientFields(data, options);

  if (data.currentStock !== undefined) {
    throw createError("currentStock must be changed by adjust-stock");
  }

  if (!options.partial || data.name !== undefined) {
    const name = String(data.name || "").trim();
    if (!name) throw createError("Ingredient name is required");
    if (name.length > 120) {
      throw createError("Ingredient name must be less than or equal to 120 characters");
    }
    assertHasLetter(name, "Ingredient name");
    assertOnlyLettersAndSpaces(name, "Ingredient name");
    payload.name = name;
  }

  if (!options.partial || data.unit !== undefined) {
    const unit = String(data.unit || "").trim();
    if (!unit) throw createError("Unit is required");
    if (unit.length > 30) {
      throw createError("Unit must be less than or equal to 30 characters");
    }
    assertHasLetter(unit, "Unit");
    assertOnlyLettersAndSpaces(unit, "Unit");
    payload.unit = unit;
  }

  if (data.storageType !== undefined) {
    const storageType = String(data.storageType || "").trim();
    if (storageType.length > 50) {
      throw createError("Storage type must be less than or equal to 50 characters");
    }
    if (storageType) {
      assertHasLetter(storageType, "Storage type");
      assertOnlyLettersAndSpaces(storageType, "Storage type");
    }
    payload.storageType = storageType || undefined;
  }

  if (data.minStockThreshold !== undefined) {
    payload.minStockThreshold = getNumber(data.minStockThreshold, "minStockThreshold", {
      nonNegative: true,
    });
  } else if (!options.partial) {
    payload.minStockThreshold = 0;
  }

  const categoryId = await getIngredientCategoryId(data.categoryId);
  if (categoryId !== undefined) payload.categoryId = categoryId;

  const isActive = toBoolean(data.isActive);
  if (isActive !== undefined) payload.isActive = isActive;
  else if (data.isActive !== undefined) {
    throw createError("isActive must be true or false");
  } else if (!options.partial) {
    payload.isActive = true;
  }

  return payload;
};

const create = async (data) => {
  const payload = await buildIngredientData(data);
  await assertUniqueIngredientName(payload.name);

  return Ingredient.create(payload);
};

const buildIngredientFilter = (query = {}) => {
  const filter = {};
  const keyword = (query.keyword || query.q || query.search || "").trim();
  const isActive = toBoolean(query.isActive);
  const categoryIds = getObjectIds(
    query.categoryIds || query.categoryId,
    "categoryId",
  );

  if (isActive !== undefined) {
    filter.isActive = isActive;
  }

  if (categoryIds.length === 1) {
    filter.categoryId = categoryIds[0];
  } else if (categoryIds.length > 1) {
    filter.categoryId = { $in: categoryIds };
  }

  if (query.storageType) {
    filter.storageType = query.storageType;
  }

  if (keyword) {
    const regex = new RegExp(escapeRegExp(keyword), "i");
    filter.$or = [{ name: regex }, { unit: regex }, { storageType: regex }];
  }

  const minStock = Number(query.minStock || query.stockFrom);
  const maxStock = Number(query.maxStock || query.stockTo);
  if (!Number.isNaN(minStock) || !Number.isNaN(maxStock)) {
    filter.currentStock = {};
    if (!Number.isNaN(minStock)) filter.currentStock.$gte = minStock;
    if (!Number.isNaN(maxStock)) filter.currentStock.$lte = maxStock;
  }

  const minThreshold = Number(query.minThreshold || query.thresholdFrom);
  const maxThreshold = Number(query.maxThreshold || query.thresholdTo);
  if (!Number.isNaN(minThreshold) || !Number.isNaN(maxThreshold)) {
    filter.minStockThreshold = {};
    if (!Number.isNaN(minThreshold)) filter.minStockThreshold.$gte = minThreshold;
    if (!Number.isNaN(maxThreshold)) filter.minStockThreshold.$lte = maxThreshold;
  }

  return filter;
};

const buildSort = (query = {}) => {
  const allowedSortFields = [
    "createdAt",
    "name",
    "currentStock",
    "minStockThreshold",
    "storageType",
  ];
  const sortBy = allowedSortFields.includes(query.sortBy)
    ? query.sortBy
    : "createdAt";
  const sortOrder = query.sortOrder === "asc" ? 1 : -1;

  return { [sortBy]: sortOrder };
};

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = buildIngredientFilter(query);
  const sort = buildSort(query);

  const [items, total] = await Promise.all([
    Ingredient.find(filter)
      .populate("categoryId", "name description")
      .skip(skip)
      .limit(limit)
      .sort(sort),
    Ingredient.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const search = (query = {}) => list(query);
const filter = (query = {}) => list(query);

const getAdjustmentType = (value, data) => {
  const type = String(value || "").trim().toUpperCase();
  if (type) return type;
  if (data.newStock !== undefined || data.stockAfter !== undefined) return "SET";
  return "INCREASE";
};

const buildStockAdjustment = (ingredient, data = {}) => {
  const stockBefore = Number(ingredient.currentStock || 0);
  const reason = getReason(data.reason);
  const adjustmentType = getAdjustmentType(
    data.adjustmentType || data.type || data.action,
    data,
  );

  if (["INCREASE", "ADD", "STOCK_IN", "IMPORT", "RECEIVE"].includes(adjustmentType)) {
    const quantity = getNumber(data.quantity, "quantity", {
      positive: true,
      maxDecimals: 2,
    });
    return {
      adjustmentType: "INCREASE",
      transactionType: data.transactionType || "STOCK_IN",
      quantity,
      stockBefore,
      stockAfter: stockBefore + quantity,
      reason,
    };
  }

  if (["DECREASE", "REMOVE", "STOCK_OUT", "USE", "WASTE", "DAMAGE", "LOSS"].includes(adjustmentType)) {
    const quantity = getNumber(data.quantity, "quantity", {
      positive: true,
      maxDecimals: 2,
    });
    const stockAfter = stockBefore - quantity;
    if (stockAfter < 0) {
      throw createError("Insufficient stock. Current stock cannot be negative");
    }

    return {
      adjustmentType: "DECREASE",
      transactionType: data.transactionType || "STOCK_OUT",
      quantity: -quantity,
      stockBefore,
      stockAfter,
      reason,
    };
  }

  if (["SET", "COUNT", "CORRECTION", "ADJUST"].includes(adjustmentType)) {
    const nextStock = data.newStock !== undefined ? data.newStock : data.stockAfter;
    const stockAfter = getNumber(nextStock, "newStock", {
      nonNegative: true,
      maxDecimals: 2,
    });

    if (stockAfter > stockBefore) {
      throw createError("Use Add stock when increasing stock so an expiry batch is recorded");
    }

    return {
      adjustmentType: "SET",
      transactionType: data.transactionType || "STOCK_ADJUSTMENT",
      quantity: stockAfter - stockBefore,
      stockBefore,
      stockAfter,
      reason,
    };
  }

  throw createError(
    "adjustmentType must be INCREASE, DECREASE, or SET",
  );
};

const increaseBatchStock = async (ingredient, adjustment, data, session) => {
  const batchId = getOptionalObjectId(data.batchId, "batchId");
  const supplierId = getOptionalObjectId(data.supplierId, "supplierId");
  const unitPrice = getOptionalNumber(data.unitPrice, "unitPrice", {
    nonNegative: true,
    maxDecimals: 2,
  });
  const expiryDate = getOptionalDate(data.expiryDate, "expiryDate");

  if (batchId) {
    const batch = await IngredientBatch.findOne({
      _id: batchId,
      ingredientId: ingredient._id,
    }).session(session);
    if (!batch) throw createError("Ingredient batch not found", 404);

    batch.quantity += adjustment.quantity;
    batch.remainingQuantity += adjustment.quantity;
    if (supplierId) batch.supplierId = supplierId;
    if (unitPrice !== undefined) batch.unitPrice = unitPrice;
    if (expiryDate) {
      assertFutureDate(expiryDate, "expiryDate");
      await assertNoBatchWithExpiryDate(
        ingredient._id,
        expiryDate,
        session,
        batch._id,
      );
      batch.expiryDate = expiryDate;
    }
    await batch.save({ session });

    return {
      batchId: batch._id,
      affectedBatches: [
        {
          batchId: batch._id,
          quantity: adjustment.quantity,
          remainingQuantity: batch.remainingQuantity,
          expiryDate: batch.expiryDate,
        },
      ],
    };
  }

  if (!expiryDate) {
    throw createError("expiryDate is required for a new stock batch");
  }
  assertFutureDate(expiryDate, "expiryDate");
  await assertNoBatchWithExpiryDate(ingredient._id, expiryDate, session);

  const [batch] = await IngredientBatch.create(
    [
      {
        ingredientId: ingredient._id,
        supplierId,
        quantity: adjustment.quantity,
        remainingQuantity: adjustment.quantity,
        unitPrice: unitPrice || 0,
        expiryDate,
      },
    ],
    { session },
  );

  return {
    batchId: batch._id,
    affectedBatches: [
      {
        batchId: batch._id,
        quantity: adjustment.quantity,
        remainingQuantity: batch.remainingQuantity,
        expiryDate: batch.expiryDate,
      },
    ],
  };
};

const decreaseBatchStock = async (ingredient, quantity, data, session) => {
  const batchId = getOptionalObjectId(data.batchId, "batchId");

  if (batchId) {
    const batch = await IngredientBatch.findOne({
      _id: batchId,
      ingredientId: ingredient._id,
    }).session(session);
    if (!batch) throw createError("Ingredient batch not found", 404);
    if (batch.remainingQuantity < quantity) {
      throw createError("Insufficient stock in selected batch");
    }

    batch.remainingQuantity -= quantity;
    await batch.save({ session });

    return {
      batchId: batch._id,
      affectedBatches: [
        {
          batchId: batch._id,
          quantity: -quantity,
          remainingQuantity: batch.remainingQuantity,
          expiryDate: batch.expiryDate,
        },
      ],
    };
  }

  const batches = await IngredientBatch.find({
    ingredientId: ingredient._id,
    remainingQuantity: { $gt: 0 },
  })
    .sort({ expiryDate: 1, createdAt: 1 })
    .session(session);

  const getExpirySortValue = (batch) => {
    if (!batch.expiryDate) return Number.MAX_SAFE_INTEGER;

    const expiryTime = new Date(batch.expiryDate).getTime();
    return Number.isFinite(expiryTime) ? expiryTime : Number.MAX_SAFE_INTEGER;
  };

  const getCreatedSortValue = (batch) => {
    const createdTime = new Date(batch.createdAt).getTime();
    return Number.isFinite(createdTime) ? createdTime : Number.MAX_SAFE_INTEGER;
  };

  batches.sort((a, b) => {
    const aExpiry = getExpirySortValue(a);
    const bExpiry = getExpirySortValue(b);
    if (aExpiry !== bExpiry) return aExpiry - bExpiry;

    const aCreated = getCreatedSortValue(a);
    const bCreated = getCreatedSortValue(b);
    if (aCreated !== bCreated) return aCreated - bCreated;

    return String(a._id).localeCompare(String(b._id));
  });

  const totalBatchStock = batches.reduce(
    (sum, batch) => sum + Number(batch.remainingQuantity || 0),
    0,
  );

  if (batches.length > 0 && totalBatchStock < quantity) {
    throw createError("Insufficient batch stock for this ingredient");
  }

  let remainingToDeduct = quantity;
  const affectedBatches = [];

  for (const batch of batches) {
    if (remainingToDeduct <= 0) break;

    const deducted = Math.min(batch.remainingQuantity, remainingToDeduct);
    batch.remainingQuantity -= deducted;
    remainingToDeduct -= deducted;
    await batch.save({ session });

    affectedBatches.push({
      batchId: batch._id,
      quantity: -deducted,
      remainingQuantity: batch.remainingQuantity,
      expiryDate: batch.expiryDate,
    });
  }

  return {
    batchId: affectedBatches[0]?.batchId || null,
    affectedBatches,
  };
};

const syncBatchStock = async (ingredient, adjustment, data, session) => {
  if (adjustment.adjustmentType === "INCREASE") {
    return increaseBatchStock(ingredient, adjustment, data, session);
  }

  if (adjustment.adjustmentType === "DECREASE") {
    return decreaseBatchStock(
      ingredient,
      Math.abs(adjustment.quantity),
      data,
      session,
    );
  }

  if (adjustment.adjustmentType === "SET" && adjustment.quantity < 0) {
    return decreaseBatchStock(
      ingredient,
      Math.abs(adjustment.quantity),
      data,
      session,
    );
  }

  return { batchId: null, affectedBatches: [] };
};

const adjustStock = async (id, data = {}, user = null) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Invalid ingredient id");
  }

  assertAllowedStockAdjustmentFields(data);

  const referenceId = getOptionalObjectId(data.referenceId, "referenceId");
  const session = await mongoose.startSession();
  let transactionId = null;

  try {
    await session.withTransaction(async () => {
      const ingredient = await Ingredient.findById(id).session(session);
      if (!ingredient) throw createError("Ingredient not found", 404);
      if (!ingredient.isActive) {
        throw createError("Cannot adjust stock for inactive ingredient");
      }

      const adjustment = buildStockAdjustment(ingredient, data);
      const batchResult = await syncBatchStock(
        ingredient,
        adjustment,
        data,
        session,
      );

      ingredient.currentStock = adjustment.stockAfter;
      await ingredient.save({ session });

      const [transaction] = await IngredientTransaction.create(
        [
          {
            ingredientId: ingredient._id,
            batchId: batchResult.batchId,
            transactionType: adjustment.transactionType,
            quantity: adjustment.quantity,
            stockBefore: adjustment.stockBefore,
            stockAfter: adjustment.stockAfter,
            unit: ingredient.unit || null,
            reason: adjustment.reason,
            adjustedBy: user?._id || null,
            referenceType: data.referenceType || "STOCK_ADJUSTMENT",
            referenceId,
            metadata: {
              adjustmentType: adjustment.adjustmentType,
              source: "MANUAL_STOCK_ADJUSTMENT",
              affectedBatches: batchResult.affectedBatches,
            },
          },
        ],
        { session },
      );

      transactionId = transaction._id;
    });
  } finally {
    await session.endSession();
  }

  const [ingredient, transaction] = await Promise.all([
    Ingredient.findById(id).populate("categoryId", "name description"),
    IngredientTransaction.findById(transactionId)
      .populate("ingredientId", "name unit currentStock")
      .populate("batchId", "quantity remainingQuantity expiryDate")
      .populate("adjustedBy", "fullName email role"),
  ]);

  return { ingredient, transaction };
};

const recordStockImport = async (id, data = {}, user = null) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Invalid ingredient id");
  }

  assertAllowedStockImportFields(data);

  const quantity = getNumber(data.quantity, "quantity", { positive: true });
  const expiryDate = getRequiredDate(data.expiryDate, "expiryDate");
  if (expiryDate <= new Date()) {
    throw createError("expiryDate must be in the future");
  }

  const unitPrice = getOptionalNumber(data.unitPrice, "unitPrice", {
    nonNegative: true,
  });
  const supplierId = await getSupplierId(data.supplierId);
  const referenceId = getOptionalObjectId(data.referenceId, "referenceId");
  const reason = String(data.reason || "Stock import").trim();
  if (reason.length > 500) {
    throw createError("Reason must be less than or equal to 500 characters");
  }

  const session = await mongoose.startSession();
  let batchId = null;
  let transactionId = null;

  try {
    await session.withTransaction(async () => {
      const ingredient = await Ingredient.findById(id).session(session);
      if (!ingredient) throw createError("Ingredient not found", 404);
      if (!ingredient.isActive) {
        throw createError("Cannot import stock for inactive ingredient");
      }

      await assertNoBatchWithExpiryDate(ingredient._id, expiryDate, session);

      const stockBefore = Number(ingredient.currentStock || 0);
      const stockAfter = stockBefore + quantity;

      const [batch] = await IngredientBatch.create(
        [
          {
            ingredientId: ingredient._id,
            supplierId,
            quantity,
            remainingQuantity: quantity,
            unitPrice: unitPrice || 0,
            expiryDate,
          },
        ],
        { session },
      );

      ingredient.currentStock = stockAfter;
      await ingredient.save({ session });

      const [transaction] = await IngredientTransaction.create(
        [
          {
            ingredientId: ingredient._id,
            batchId: batch._id,
            transactionType: "STOCK_IMPORT",
            quantity,
            stockBefore,
            stockAfter,
            unit: ingredient.unit || null,
            reason,
            adjustedBy: user?._id || null,
            referenceType: data.referenceType || "STOCK_IMPORT",
            referenceId,
            metadata: {
              source: "MANAGER_STOCK_IMPORT",
              importCode: data.importCode || null,
              supplierId,
              unitPrice: unitPrice || 0,
              expiryDate,
            },
          },
        ],
        { session },
      );

      batchId = batch._id;
      transactionId = transaction._id;
    });
  } finally {
    await session.endSession();
  }

  const [ingredient, batch, transaction] = await Promise.all([
    Ingredient.findById(id).populate("categoryId", "name description"),
    IngredientBatch.findById(batchId).populate("supplierId", "name phone"),
    IngredientTransaction.findById(transactionId)
      .populate("ingredientId", "name unit currentStock")
      .populate("batchId", "quantity remainingQuantity expiryDate")
      .populate("adjustedBy", "fullName email role"),
  ]);

  return { ingredient, batch, transaction };
};

const getById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Invalid ingredient id");
  }

  const ingredient = await Ingredient.findById(id).populate(
    "categoryId",
    "name description",
  );
  if (!ingredient) return null;

  const batches = await IngredientBatch.find({ ingredientId: id })
    .populate("supplierId", "name phone")
    .sort({ expiryDate: 1, createdAt: 1 });

  return {
    ...ingredient.toObject(),
    batches,
  };
};

const updateById = async (id, data = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Invalid ingredient id");
  }

  const existing = await Ingredient.findById(id);
  if (!existing) throw createError("Ingredient not found", 404);

  const payload = await buildIngredientData(data, { partial: true });
  if (!Object.keys(payload).length) {
    throw createError("No valid fields to update");
  }

  if (
    payload.name &&
    payload.name.toLowerCase() !== String(existing.name || "").toLowerCase()
  ) {
    await assertUniqueIngredientName(payload.name, id);
  }

  Object.assign(existing, payload);
  await existing.save();

  return Ingredient.findById(id).populate("categoryId", "name description");
};
const deleteById = (id) => Ingredient.findByIdAndDelete(id);

module.exports = {
  create,
  list,
  search,
  filter,
  adjustStock,
  recordStockImport,
  getById,
  updateById,
  deleteById,
};
