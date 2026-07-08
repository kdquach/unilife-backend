const mongoose = require("mongoose");
const MenuScheduleItem = require("./menuScheduleItem.model");
const MenuSchedule = require("../menuSchedule/menuSchedule.model");
const Food = require("../food/food.model");
const FoodIngredient = require("../foodIngredient/foodIngredient.model");
const ingredientService = require("../ingredient/ingredient.service");
const { getPagination } = require("../../utils/pagination.util");
const { getVietnamDayRange } = require("../../utils/date.util");

const dateOnly = (value) => {
  if (Array.isArray(value)) value = value[0];
  return String(value || "").slice(0, 10);
};

const create = async (data, user) => {
  const { menuScheduleId, foodId, maxServing } = data;

  const schedule = await MenuSchedule.findById(menuScheduleId);
  if (!schedule) {
    const error = new Error("Menu schedule not found");
    error.statusCode = 400;
    throw error;
  }
  
  const { start: todayStart } = getVietnamDayRange(dateOnly(new Date()));
  const scheduleStart = getVietnamDayRange(dateOnly(schedule.date)).start;
  if (scheduleStart < todayStart) {
    const error = new Error("Cannot add items to a frozen/past menu schedule");
    error.statusCode = 400;
    throw error;
  }

  if (schedule.status === "CANCELLED" || schedule.status === "COMPLETED") {
    const error = new Error(`Cannot add items to a ${schedule.status} menu schedule`);
    error.statusCode = 400;
    throw error;
  }

  const food = await Food.findById(foodId);
  if (!food) {
    const error = new Error("Food not found");
    error.statusCode = 400;
    throw error;
  }

  const session = await mongoose.startSession();
  let createdItem = null;

  try {
    await session.withTransaction(async () => {
      const recipe = await FoodIngredient.find({ foodId }).session(session);
      const recipeSnapshot = recipe.map((r) => ({
        ingredientId: r.ingredientId,
        quantityPerServing: r.quantityPerServing,
      }));

      const finalMaxServing = Math.max(0, parseInt(maxServing) || 0);
      const deductedBatches = [];

      // Sort A-Z to prevent deadlock
      recipe.sort((a, b) => String(a.ingredientId).localeCompare(String(b.ingredientId)));

      for (const r of recipe) {
        const totalQty = r.quantityPerServing * finalMaxServing;
        if (totalQty > 0) {
          const adjData = {
            adjustmentType: "DECREASE",
            quantity: totalQty,
            reason: `Deducted for Menu Schedule: ${schedule.date.toISOString().split('T')[0]}`,
            referenceType: "MENU_SCHEDULE",
          };
          const res = await ingredientService.adjustStock(r.ingredientId, adjData, user, session);
          const affected = res.transaction.metadata.affectedBatches;
          for (const batch of affected) {
            deductedBatches.push({
              ingredientId: r.ingredientId,
              batchId: batch.batchId,
              quantity: Math.abs(batch.quantity),
            });
          }
        }
      }

      const cleanData = {
        menuScheduleId,
        foodId,
        maxServing: finalMaxServing,
        isActive: data.isActive !== undefined ? data.isActive : true,
        remainingCount: finalMaxServing,
        reservedCount: 0,
        servedCount: 0,
        recipeSnapshot,
        deductedBatches,
      };

      try {
        const [item] = await MenuScheduleItem.create([cleanData], { session });
        createdItem = item;
      } catch (err) {
        if (err.code === 11000) {
          const error = new Error("This food is already added to the menu schedule");
          error.statusCode = 400;
          throw error;
        }
        throw err;
      }
    });
  } finally {
    await session.endSession();
  }

  return createdItem;
};

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.isActive !== undefined) filter.isActive = query.isActive === "true";
  if (query.menuScheduleId) filter.menuScheduleId = query.menuScheduleId;
  if (query.foodId) filter.foodId = query.foodId;

  const [items, total] = await Promise.all([
    MenuScheduleItem.find(filter)
      .populate({
        path: "foodId",
        populate: {
          path: "categoryId",
          select: "name",
        },
      })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    MenuScheduleItem.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) =>
  MenuScheduleItem.findById(id).populate({
    path: "foodId",
    populate: {
      path: "categoryId",
      select: "name",
    },
  });

const performRefund = async (item, refundQuantity, user, session) => {
  if (refundQuantity <= 0) return;
  
  const recipe = item.recipeSnapshot || [];
  recipe.sort((a, b) => String(a.ingredientId).localeCompare(String(b.ingredientId)));

  for (const r of recipe) {
    let qtyToRefund = r.quantityPerServing * refundQuantity;
    if (qtyToRefund <= 0) continue;

    // Find batches deducted for this ingredient, process in reverse to refund newest deductions first
    const ingredientBatches = item.deductedBatches
      .filter((b) => String(b.ingredientId) === String(r.ingredientId))
      .reverse();

    for (const b of ingredientBatches) {
      if (qtyToRefund <= 0) break;
      const refundFromThisBatch = Math.min(qtyToRefund, b.quantity);
      if (refundFromThisBatch > 0) {
        const adjData = {
          adjustmentType: "INCREASE",
          quantity: refundFromThisBatch,
          batchId: b.batchId,
          reason: `Refunded from Menu Schedule (Reduced/Cancelled)`,
          referenceType: "MENU_SCHEDULE_REFUND",
        };
        await ingredientService.adjustStock(r.ingredientId, adjData, user, session);
        b.quantity -= refundFromThisBatch;
        qtyToRefund -= refundFromThisBatch;
      }
    }
  }

  // Clean up batches with 0 quantity
  item.deductedBatches = item.deductedBatches.filter((b) => b.quantity > 0);
};

const performIncrease = async (item, increaseQuantity, user, session) => {
  if (increaseQuantity <= 0) return;

  const recipe = item.recipeSnapshot || [];
  recipe.sort((a, b) => String(a.ingredientId).localeCompare(String(b.ingredientId)));

  for (const r of recipe) {
    const totalQty = r.quantityPerServing * increaseQuantity;
    if (totalQty > 0) {
      const adjData = {
        adjustmentType: "DECREASE",
        quantity: totalQty,
        reason: `Deducted for Menu Schedule Increase`,
        referenceType: "MENU_SCHEDULE",
      };
      const res = await ingredientService.adjustStock(r.ingredientId, adjData, user, session);
      const affected = res.transaction.metadata.affectedBatches;
      for (const batch of affected) {
        // Find existing batch entry or add new
        const existingBatch = item.deductedBatches.find(
          (b) => String(b.ingredientId) === String(r.ingredientId) && String(b.batchId) === String(batch.batchId)
        );
        if (existingBatch) {
          existingBatch.quantity += Math.abs(batch.quantity);
        } else {
          item.deductedBatches.push({
            ingredientId: r.ingredientId,
            batchId: batch.batchId,
            quantity: Math.abs(batch.quantity),
          });
        }
      }
    }
  }
};

const updateById = async (id, data, user) => {
  const session = await mongoose.startSession();
  let updatedItem = null;

  try {
    await session.withTransaction(async () => {
      const item = await MenuScheduleItem.findById(id).populate("menuScheduleId").session(session);
      if (!item) {
        const error = new Error("Menu schedule item not found");
        error.statusCode = 404;
        throw error;
      }

      if (item.menuScheduleId) {
        const { start: todayStart } = getVietnamDayRange(dateOnly(new Date()));
        const scheduleStart = getVietnamDayRange(dateOnly(item.menuScheduleId.date)).start;
        if (scheduleStart < todayStart) {
          const error = new Error("Cannot modify a frozen/past menu schedule item");
          error.statusCode = 400;
          throw error;
        }
      }

      let newMaxServing = item.maxServing;
      if (data.maxServing !== undefined) {
        newMaxServing = Math.max(0, parseInt(data.maxServing));
      }

      let newIsActive = item.isActive;
      if (data.isActive !== undefined) {
        newIsActive = Boolean(data.isActive);
      }

      // Handle Disable / Cancel
      if (!newIsActive && item.isActive) {
        const minRequired = item.reservedCount + item.servedCount;
        newMaxServing = minRequired; // Force maxServing to what has been consumed
      } else {
        const minRequired = item.reservedCount + item.servedCount;
        if (newMaxServing < minRequired) {
          const error = new Error("Cannot decrease maxServing below the amount already reserved or served");
          error.statusCode = 400;
          throw error;
        }
      }

      const diff = newMaxServing - item.maxServing;

      if (diff > 0) {
        await performIncrease(item, diff, user, session);
      } else if (diff < 0) {
        await performRefund(item, Math.abs(diff), user, session);
      }

      item.maxServing = newMaxServing;
      item.isActive = newIsActive;
      item.remainingCount = newMaxServing - item.reservedCount - item.servedCount;

      try {
        await item.save({ session });
        updatedItem = item;
      } catch (err) {
        if (err.name === "VersionError") {
          const error = new Error("Data was modified by another user. Please retry.");
          error.statusCode = 409;
          throw error;
        }
        throw err;
      }
    });
  } finally {
    await session.endSession();
  }
  
  return updatedItem;
};

const deleteById = async (id) => {
  const error = new Error("Hard delete is forbidden. Use Cancel/Update (isActive: false) instead to trigger inventory refund.");
  error.statusCode = 400;
  throw error;
};

// Export internal functions for menuSchedule.service to use in bulk operations
module.exports = { create, list, getById, updateById, deleteById, internalPerformRefund: performRefund };

