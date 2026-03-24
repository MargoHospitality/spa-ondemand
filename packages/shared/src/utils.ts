/**
 * Calculate client confirmation deadline based on time until the slot.
 *
 * Rules (configurable per property):
 * - Slot > 48h away → 24h to confirm
 * - Slot 24–48h away → end of current day (23:59)
 * - Slot < 24h away → 2h to confirm
 */
export function calculateClientDeadline(
  slotTime: Date,
  now: Date = new Date(),
  config: {
    delayLongHours: number; // > 48h case
    delay24hHours: number; // < 24h case
  } = { delayLongHours: 24, delay24hHours: 2 },
): Date {
  const hoursUntilSlot = (slotTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilSlot > 48) {
    // > 48h: client has delayLongHours to confirm
    return new Date(now.getTime() + config.delayLongHours * 60 * 60 * 1000);
  } else if (hoursUntilSlot >= 24) {
    // 24–48h: end of today
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay;
  } else {
    // < 24h: delay24hHours to confirm
    return new Date(now.getTime() + config.delay24hHours * 60 * 60 * 1000);
  }
}

/**
 * Check if a given time is within opening hours.
 */
export function isWithinOpeningHours(
  time: Date,
  openingTime: string, // "HH:MM"
  closingTime: string, // "HH:MM"
): boolean {
  const [openH, openM] = openingTime.split(':').map(Number);
  const [closeH, closeM] = closingTime.split(':').map(Number);

  const hours = time.getHours();
  const minutes = time.getMinutes();
  const timeMinutes = hours * 60 + minutes;
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return timeMinutes >= openMinutes && timeMinutes <= closeMinutes;
}

/**
 * Calculate effective manager deadline, accounting for opening hours.
 * If received outside opening hours, deadline starts at next opening + buffer.
 */
export function calculateManagerDeadline(
  notifiedAt: Date,
  delayMinutes: number,
  openingTime: string,
  closingTime: string,
): Date {
  if (isWithinOpeningHours(notifiedAt, openingTime, closingTime)) {
    return new Date(notifiedAt.getTime() + delayMinutes * 60 * 1000);
  }

  // Outside hours: next opening + 1h
  const [openH, openM] = openingTime.split(':').map(Number);
  const nextOpening = new Date(notifiedAt);

  // If past closing, move to next day
  const [closeH, closeM] = closingTime.split(':').map(Number);
  const currentMinutes = notifiedAt.getHours() * 60 + notifiedAt.getMinutes();
  const closeMinutes = closeH * 60 + closeM;

  if (currentMinutes >= closeMinutes) {
    nextOpening.setDate(nextOpening.getDate() + 1);
  }

  nextOpening.setHours(openH, openM, 0, 0);
  // Add 1h buffer after opening, then the delay
  return new Date(nextOpening.getTime() + 60 * 60 * 1000 + delayMinutes * 60 * 1000);
}
