import {
  isAtLeastHoursInAdvance,
  mstDateMinutesToUtcDate,
  toMstShiftedDate,
} from '../../services/scheduling.service';

export const getValidMstBookingDate = (hourInMst: number = 10, minDaysAhead: number = 1): Date => {
  const now = new Date();
  for (let daysAhead = minDaysAhead; daysAhead <= 21; daysAhead += 1) {
    const probe = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const probeMst = toMstShiftedDate(probe);
    const weekday = probeMst.getUTCDay();
    if (weekday < 1 || weekday > 5) {
      continue;
    }
    const candidate = mstDateMinutesToUtcDate(
      probeMst.getUTCFullYear(),
      probeMst.getUTCMonth() + 1,
      probeMst.getUTCDate(),
      hourInMst * 60
    );
    if (isAtLeastHoursInAdvance(candidate, 24, now)) {
      return candidate;
    }
  }
  return new Date(now.getTime() + 72 * 60 * 60 * 1000);
};
