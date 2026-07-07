const VIETNAM_UTC_OFFSET_MINUTES = 7 * 60;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const getDayRangeByUtcOffset = (
  date = new Date(),
  offsetMinutes = VIETNAM_UTC_OFFSET_MINUTES,
) => {
  const offsetMs = offsetMinutes * 60 * 1000;
  const localTime = new Date(new Date(date).getTime() + offsetMs);
  const year = localTime.getUTCFullYear();
  const month = localTime.getUTCMonth();
  const day = localTime.getUTCDate();
  const start = new Date(Date.UTC(year, month, day) - offsetMs);
  const end = new Date(start.getTime() + DAY_IN_MS - 1);

  return { start, end };
};

const getVietnamDayRange = (date = new Date()) =>
  getDayRangeByUtcOffset(date, VIETNAM_UTC_OFFSET_MINUTES);

const isSameVietnamDay = (date, referenceDate = new Date()) => {
  if (!date) return false;
  const { start, end } = getVietnamDayRange(referenceDate);
  const value = new Date(date);
  return value >= start && value <= end;
};

module.exports = {
  VIETNAM_UTC_OFFSET_MINUTES,
  getDayRangeByUtcOffset,
  getVietnamDayRange,
  isSameVietnamDay,
};
