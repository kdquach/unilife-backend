const activityLogService = require("../../src/modules/activityLog/activityLog.service");

describe("ActivityLog Stats Service", () => {
  it("should return correct structure for getStats when empty", async () => {
    const stats = await activityLogService.getStats({});
    expect(stats).toHaveProperty("summary");
    expect(stats).toHaveProperty("actionBreakdown");
    expect(stats).toHaveProperty("userOrModuleStats");
    expect(stats.summary).toHaveProperty("totalLogs");
    expect(Array.isArray(stats.actionBreakdown)).toBe(true);
    expect(Array.isArray(stats.userOrModuleStats)).toBe(true);
  });
});
