const mongoose = require("mongoose");
const MenuScheduleItem = require("./menuScheduleItem.model");
const MenuSchedule = require("../menuSchedule/menuSchedule.model");
const Food = require("../food/food.model");
const FoodIngredient = require("../foodIngredient/foodIngredient.model");
const Ingredient = require("../ingredient/ingredient.model");
const ingredientService = require("../ingredient/ingredient.service");
const { getPagination } = require("../../utils/pagination.util");
const { getVietnamDayRange } = require("../../utils/date.util");

const dateOnly = (value) => {
  if (Array.isArray(value)) value = value[0];
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || "").slice(0, 10);
};

const getDocumentId = (value) => value?._id || value || null;

const buildMenuInventoryMetadata = ({
  action,
  source,
  schedule,
  itemId,
  food,
  ingredient,
  servingCount,
  quantityPerServing,
}) => ({
  source,
  action,
  menuScheduleId: getDocumentId(schedule),
  menuScheduleItemId: itemId || null,
  foodId: getDocumentId(food),
  foodName: food?.name || null,
  menuDate: schedule?.date ? dateOnly(schedule.date) : null,
  servingCount,
  quantityPerServing,
  ingredientName: ingredient?.name || null,
  ingredientUnit: ingredient?.unit || null,
});

const create = async (data, user) => {
  const { menuScheduleId, foodId, maxServing } = data;
  
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
      const schedule = await MenuSchedule.findById(menuScheduleId).session(session);
      if (!schedule) {
        const error = new Error("Menu schedule not found");
        error.statusCode = 400;
        throw error;
      }
      
      const { start: todayStart } = getVietnamDayRange();
      const scheduleStart = getVietnamDayRange(schedule.date).start;
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

      // Lock the schedule document to prevent write skew / race conditions with schedule cancellation
      schedule.increment();
      await schedule.save({ session });

      const recipe = await FoodIngredient.find({ foodId }).populate("ingredientId").session(session);
      const recipeSnapshot = recipe.map((r) => ({
        ingredientId: r.ingredientId._id || r.ingredientId,
        quantityPerServing: r.quantityPerServing,
      }));

      const finalMaxServing = Math.max(0, parseInt(maxServing) || 0);
      const itemId = new mongoose.Types.ObjectId();
      const deductedBatches = [];

      // Sort A-Z to prevent deadlock
      recipe.sort((a, b) => {
        const idA = a.ingredientId._id ? String(a.ingredientId._id) : String(a.ingredientId);
        const idB = b.ingredientId._id ? String(b.ingredientId._id) : String(b.ingredientId);
        return idA.localeCompare(idB);
      });

      for (const r of recipe) {
        const totalQty = r.quantityPerServing * finalMaxServing;
        if (totalQty > 0) {
          const ingId = r.ingredientId._id || r.ingredientId;
          const ingDoc = r.ingredientId._id ? r.ingredientId : await Ingredient.findById(ingId).session(session);
          const ingName = ingDoc?.name || "Nguyên liệu";
          const ingUnit = ingDoc?.unit || "";
          const currentStock = ingDoc?.currentStock !== undefined ? ingDoc.currentStock : 0;

          if (currentStock < totalQty) {
            const shortage = totalQty - currentStock;
            const error = new Error(
              `Insufficient ingredient "${ingName}" for food "${food.name}". Required: ${totalQty} ${ingUnit}, Available in stock: ${currentStock} ${ingUnit} (Shortage: ${shortage} ${ingUnit})`
            );
            error.statusCode = 400;
            throw error;
          }

          const adjData = {
            adjustmentType: "DECREASE",
            quantity: totalQty,
            transactionType: "MENU_USAGE",
            reason: `Used for menu item "${food.name}" on ${dateOnly(schedule.date)}`,
            referenceType: "MENU_SCHEDULE_ITEM",
            referenceId: itemId,
            metadata: buildMenuInventoryMetadata({
              action: "CREATE_MENU_ITEM",
              source: "MENU_SCHEDULE_ITEM",
              schedule,
              itemId,
              food,
              ingredient: ingDoc,
              servingCount: finalMaxServing,
              quantityPerServing: r.quantityPerServing,
            }),
          };
          try {
            const res = await ingredientService.adjustStock(ingId, adjData, user, session);
            const affected = res.transaction.metadata.affectedBatches;
            for (const batch of affected) {
              deductedBatches.push({
                ingredientId: ingId,
                batchId: batch.batchId,
                quantity: Math.abs(batch.quantity),
              });
            }
          } catch (err) {
            const shortage = Math.max(0, totalQty - currentStock);
            const error = new Error(
              `Insufficient ingredient "${ingName}" for food "${food.name}". Required: ${totalQty} ${ingUnit}, Available in stock: ${currentStock} ${ingUnit}${shortage > 0 ? ` (Shortage: ${shortage} ${ingUnit})` : ''}`
            );
            error.statusCode = 400;
            throw error;
          }
        }
      }

      const cleanData = {
        _id: itemId,
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

const createBulk = async (data, user) => {
  const { menuScheduleId, items } = data;
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error("Items array is required and must not be empty");
    error.statusCode = 400;
    throw error;
  }

  // Check duplicate foodIds in payload
  const foodIdSet = new Set();
  for (const item of items) {
    if (foodIdSet.has(String(item.foodId))) {
      const error = new Error("Duplicate food items found in request");
      error.statusCode = 400;
      throw error;
    }
    foodIdSet.add(String(item.foodId));
  }

  // Verify all foods exist
  const foodIds = items.map((i) => i.foodId);
  const foundFoods = await Food.find({ _id: { $in: foodIds } });
  if (foundFoods.length !== foodIds.length) {
    const error = new Error("One or more food items were not found");
    error.statusCode = 400;
    throw error;
  }

  const session = await mongoose.startSession();
  let createdItems = [];

  try {
    await session.withTransaction(async () => {
      const schedule = await MenuSchedule.findById(menuScheduleId).session(session);
      if (!schedule) {
        const error = new Error("Menu schedule not found");
        error.statusCode = 400;
        throw error;
      }

      const { start: todayStart } = getVietnamDayRange();
      const scheduleStart = getVietnamDayRange(schedule.date).start;
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

      // Lock the schedule document to prevent write skew / race conditions
      schedule.increment();
      await schedule.save({ session });

      const docsToCreate = [];

      for (const itemData of items) {
        const foodId = itemData.foodId;
        const maxServing = itemData.maxServing;
        const food = foundFoods.find(f => String(f._id) === String(foodId));
        const foodName = food ? food.name : "Món ăn";

        const recipe = await FoodIngredient.find({ foodId }).populate("ingredientId").session(session);
        const recipeSnapshot = recipe.map((r) => ({
          ingredientId: r.ingredientId._id || r.ingredientId,
          quantityPerServing: r.quantityPerServing,
        }));

        const finalMaxServing = Math.max(0, parseInt(maxServing) || 0);
        const itemId = new mongoose.Types.ObjectId();
        const deductedBatches = [];

        recipe.sort((a, b) => {
          const idA = a.ingredientId._id ? String(a.ingredientId._id) : String(a.ingredientId);
          const idB = b.ingredientId._id ? String(b.ingredientId._id) : String(b.ingredientId);
          return idA.localeCompare(idB);
        });

        for (const r of recipe) {
          const totalQty = r.quantityPerServing * finalMaxServing;
          if (totalQty > 0) {
            const ingId = r.ingredientId._id || r.ingredientId;
            const ingDoc = r.ingredientId._id ? r.ingredientId : await Ingredient.findById(ingId).session(session);
            const ingName = ingDoc?.name || "Nguyên liệu";
            const ingUnit = ingDoc?.unit || "";
            const currentStock = ingDoc?.currentStock !== undefined ? ingDoc.currentStock : 0;

            if (currentStock < totalQty) {
              const shortage = totalQty - currentStock;
              const error = new Error(
                `Insufficient ingredient "${ingName}" for food "${foodName}". Required: ${totalQty} ${ingUnit}, Available in stock: ${currentStock} ${ingUnit} (Shortage: ${shortage} ${ingUnit})`
              );
              error.statusCode = 400;
              throw error;
            }

            const adjData = {
              adjustmentType: "DECREASE",
              quantity: totalQty,
              transactionType: "MENU_USAGE",
              reason: `Used for menu item "${foodName}" on ${dateOnly(schedule.date)}`,
              referenceType: "MENU_SCHEDULE_ITEM",
              referenceId: itemId,
              metadata: buildMenuInventoryMetadata({
                action: "CREATE_MENU_ITEM_BULK",
                source: "MENU_SCHEDULE_ITEM",
                schedule,
                itemId,
                food,
                ingredient: ingDoc,
                servingCount: finalMaxServing,
                quantityPerServing: r.quantityPerServing,
              }),
            };
            try {
              const res = await ingredientService.adjustStock(ingId, adjData, user, session);
              const affected = res.transaction.metadata.affectedBatches;
              for (const batch of affected) {
                deductedBatches.push({
                  ingredientId: ingId,
                  batchId: batch.batchId,
                  quantity: Math.abs(batch.quantity),
                });
              }
            } catch (err) {
              const shortage = Math.max(0, totalQty - currentStock);
              const error = new Error(
                `Insufficient ingredient "${ingName}" for food "${foodName}". Required: ${totalQty} ${ingUnit}, Available in stock: ${currentStock} ${ingUnit}${shortage > 0 ? ` (Shortage: ${shortage} ${ingUnit})` : ''}`
              );
              error.statusCode = 400;
              throw error;
            }
          }
        }

        docsToCreate.push({
          _id: itemId,
          menuScheduleId,
          foodId,
          maxServing: finalMaxServing,
          isActive: itemData.isActive !== undefined ? itemData.isActive : true,
          remainingCount: finalMaxServing,
          reservedCount: 0,
          servedCount: 0,
          recipeSnapshot,
          deductedBatches,
        });
      }

      try {
        createdItems = await MenuScheduleItem.insertMany(docsToCreate, { session });
      } catch (err) {
        if (err.code === 11000) {
          const error = new Error("One or more food items are already added to this menu schedule");
          error.statusCode = 400;
          throw error;
        }
        throw err;
      }
    });
  } finally {
    await session.endSession();
  }

  return createdItems;
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
  
  const schedule = item.menuScheduleId;
  const food = await Food.findById(item.foodId).session(session);
  const foodName = food?.name || "Menu item";
  const recipe = item.recipeSnapshot || [];
  recipe.sort((a, b) => String(a.ingredientId).localeCompare(String(b.ingredientId)));

  for (const r of recipe) {
    let qtyToRefund = r.quantityPerServing * refundQuantity;
    if (qtyToRefund <= 0) continue;

    const ingredient = await Ingredient.findById(r.ingredientId).session(session);
    // Find batches deducted for this ingredient, process in reverse to refund newest deductions first
    const ingredientBatches = (item.deductedBatches || [])
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
          transactionType: "STOCK_IN",
          reason: `Returned from menu item "${foodName}" after reduced or cancelled servings`,
          referenceType: "MENU_SCHEDULE_ITEM",
          referenceId: item._id,
          metadata: buildMenuInventoryMetadata({
            action: "REFUND_MENU_ITEM_STOCK",
            source: "MENU_SCHEDULE_ITEM",
            schedule,
            itemId: item._id,
            food,
            ingredient,
            servingCount: refundQuantity,
            quantityPerServing: r.quantityPerServing,
          }),
        };
        await ingredientService.adjustStock(r.ingredientId, adjData, user, session);
        b.quantity -= refundFromThisBatch;
        qtyToRefund -= refundFromThisBatch;
      }
    }
  }

  // Clean up batches with 0 quantity
  item.deductedBatches = (item.deductedBatches || []).filter((b) => b.quantity > 0);
};

const performIncrease = async (item, increaseQuantity, user, session) => {
  if (increaseQuantity <= 0) return;

  const schedule = item.menuScheduleId;
  const food = await Food.findById(item.foodId).session(session);
  const foodName = food ? food.name : "Món ăn";

  const recipe = item.recipeSnapshot || [];
  recipe.sort((a, b) => String(a.ingredientId).localeCompare(String(b.ingredientId)));

  for (const r of recipe) {
    const totalQty = r.quantityPerServing * increaseQuantity;
    if (totalQty > 0) {
      const ingredient = await Ingredient.findById(r.ingredientId).session(session);
      const ingName = ingredient ? ingredient.name : "Nguyên liệu";
      const ingUnit = ingredient ? ingredient.unit || "" : "";
      const currentStock = ingredient ? ingredient.currentStock || 0 : 0;

      if (currentStock < totalQty) {
        const shortage = totalQty - currentStock;
        const error = new Error(
          `Insufficient ingredient "${ingName}" for food "${foodName}". Required increase: ${totalQty} ${ingUnit}, Available in stock: ${currentStock} ${ingUnit} (Shortage: ${shortage} ${ingUnit})`
        );
        error.statusCode = 400;
        throw error;
      }

      const adjData = {
        adjustmentType: "DECREASE",
        quantity: totalQty,
        transactionType: "MENU_USAGE",
        reason: `Used for menu item "${foodName}" after serving increase`,
        referenceType: "MENU_SCHEDULE_ITEM",
        referenceId: item._id,
        metadata: buildMenuInventoryMetadata({
          action: "INCREASE_MENU_ITEM_SERVINGS",
          source: "MENU_SCHEDULE_ITEM",
          schedule,
          itemId: item._id,
          food,
          ingredient,
          servingCount: increaseQuantity,
          quantityPerServing: r.quantityPerServing,
        }),
      };
      try {
        const res = await ingredientService.adjustStock(r.ingredientId, adjData, user, session);
        const affected = res.transaction.metadata.affectedBatches;
        if (!Array.isArray(item.deductedBatches)) item.deductedBatches = [];
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
      } catch (err) {
        const shortage = Math.max(0, totalQty - currentStock);
        const error = new Error(
          `Insufficient ingredient "${ingName}" for food "${foodName}". Required increase: ${totalQty} ${ingUnit}, Available in stock: ${currentStock} ${ingUnit}${shortage > 0 ? ` (Shortage: ${shortage} ${ingUnit})` : ''}`
        );
        error.statusCode = 400;
        throw error;
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

      if (data.__v !== undefined && item.__v !== data.__v) {
        const error = new Error("Data was modified by another user. Please retry.");
        error.statusCode = 409;
        throw error;
      }

      let isFutureSchedule = false;

      if (item.menuScheduleId) {
        if (item.menuScheduleId.status === "CANCELLED" || item.menuScheduleId.status === "COMPLETED") {
          const error = new Error(`Cannot modify items in a ${item.menuScheduleId.status} menu schedule`);
          error.statusCode = 400;
          throw error;
        }

        const { start: todayStart } = getVietnamDayRange();
        const scheduleStart = getVietnamDayRange(item.menuScheduleId.date).start;
        if (scheduleStart < todayStart) {
          const error = new Error("Cannot modify a frozen/past menu schedule item");
          error.statusCode = 400;
          throw error;
        }
        
        isFutureSchedule = scheduleStart > todayStart;

        // Lock the schedule document to prevent write skew / race conditions with schedule cancellation
        item.menuScheduleId.increment();
        await item.menuScheduleId.save({ session });
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
      } else if (diff < 0 && isFutureSchedule) {
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
module.exports = { create, createBulk, list, getById, updateById, deleteById, internalPerformRefund: performRefund };

