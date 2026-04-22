const MINUTES_PER_HOUR = 60;
const MILLIS_PER_MINUTE = 60_000;

export const BOOKING_TIMEZONE = 'MST';
export const BOOKING_TIMEZONE_GOOGLE = 'America/Phoenix';
export const MST_UTC_OFFSET_MINUTES = -7 * MINUTES_PER_HOUR; // fixed MST, no DST shift
export const DEFAULT_BUSINESS_START_MINUTES = 9 * MINUTES_PER_HOUR; // 9:00 AM MST
export const DEFAULT_BUSINESS_END_MINUTES = 17 * MINUTES_PER_HOUR; // 5:00 PM MST
export const DEFAULT_MIN_ADVANCE_HOURS = 24;
export const DEFAULT_SLOT_INTERVAL_MINUTES = 15;

interface MstDateParts {
  year: number;
  month: number;
  day: number;
}

export const toMstShiftedDate = (date: Date): Date => {
  return new Date(date.getTime() + MST_UTC_OFFSET_MINUTES * MILLIS_PER_MINUTE);
};

export const getMstWeekday = (date: Date): number => {
  return toMstShiftedDate(date).getUTCDay();
};

export const getMstMinutesOfDay = (date: Date): number => {
  const shifted = toMstShiftedDate(date);
  return shifted.getUTCHours() * MINUTES_PER_HOUR + shifted.getUTCMinutes();
};

export const isMstWeekday = (date: Date): boolean => {
  const weekday = getMstWeekday(date);
  return weekday >= 1 && weekday <= 5;
};

export const isWithinMstBusinessHours = (
  date: Date,
  startMinutes: number = DEFAULT_BUSINESS_START_MINUTES,
  endMinutes: number = DEFAULT_BUSINESS_END_MINUTES
): boolean => {
  if (!isMstWeekday(date)) {
    return false;
  }
  const minutes = getMstMinutesOfDay(date);
  return minutes >= startMinutes && minutes < endMinutes;
};

export const isAtLeastHoursInAdvance = (
  appointmentDate: Date,
  minHours: number = DEFAULT_MIN_ADVANCE_HOURS,
  now: Date = new Date()
): boolean => {
  const minTime = now.getTime() + minHours * MINUTES_PER_HOUR * MILLIS_PER_MINUTE;
  return appointmentDate.getTime() >= minTime;
};

export const parseMstDateString = (dateString: string): MstDateParts | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
};

export const mstDateMinutesToUtcDate = (
  year: number,
  month: number,
  day: number,
  minutesOfDay: number
): Date => {
  const hours = Math.floor(minutesOfDay / MINUTES_PER_HOUR);
  const minutes = minutesOfDay % MINUTES_PER_HOUR;
  return new Date(Date.UTC(year, month - 1, day, hours + 7, minutes, 0, 0));
};

export const getMstDateString = (date: Date): string => {
  const shifted = toMstShiftedDate(date);
  const year = shifted.getUTCFullYear();
  const month = `${shifted.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${shifted.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getMstDayBoundsUtc = (dateString: string): { startUtc: Date; endUtc: Date } | null => {
  const parsed = parseMstDateString(dateString);
  if (!parsed) {
    return null;
  }
  const startUtc = mstDateMinutesToUtcDate(parsed.year, parsed.month, parsed.day, 0);
  const endUtc = mstDateMinutesToUtcDate(parsed.year, parsed.month, parsed.day + 1, 0);
  return { startUtc, endUtc };
};

export const getEffectiveEndDate = (
  startDate: Date,
  storedEndDate: Date | null | undefined,
  durationMinutes: number,
  bufferMinutes: number
): Date => {
  if (storedEndDate) {
    return new Date(storedEndDate);
  }
  const durationWithBuffer = (durationMinutes + bufferMinutes) * MILLIS_PER_MINUTE;
  return new Date(startDate.getTime() + durationWithBuffer);
};

export const rangesOverlap = (startA: Date, endA: Date, startB: Date, endB: Date): boolean => {
  return startA < endB && endA > startB;
};

export const getReminderSendAt = (appointmentDate: Date): Date => {
  return new Date(appointmentDate.getTime() - DEFAULT_MIN_ADVANCE_HOURS * MINUTES_PER_HOUR * MILLIS_PER_MINUTE);
};

export const generateMstDaySlotStarts = (
  dateString: string,
  rangeStartMinutes: number,
  rangeEndMinutes: number,
  appointmentDurationMinutes: number,
  slotIntervalMinutes: number = DEFAULT_SLOT_INTERVAL_MINUTES
): Date[] => {
  const parsed = parseMstDateString(dateString);
  if (!parsed) {
    return [];
  }

  const slots: Date[] = [];
  for (
    let startMinutes = rangeStartMinutes;
    startMinutes + appointmentDurationMinutes <= rangeEndMinutes;
    startMinutes += slotIntervalMinutes
  ) {
    slots.push(mstDateMinutesToUtcDate(parsed.year, parsed.month, parsed.day, startMinutes));
  }
  return slots;
};
