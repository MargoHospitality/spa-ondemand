/**
 * Calculate client confirmation deadline based on time until the slot.
 *
 * Rules (configurable per property):
 * - Slot > 48h away → 24h to confirm
 * - Slot 24–48h away → end of current day (23:59)
 * - Slot < 24h away → 2h to confirm
 */
export declare function calculateClientDeadline(slotTime: Date, now?: Date, config?: {
    delayLongHours: number;
    delay24hHours: number;
}): Date;
/**
 * Check if a given time is within opening hours.
 */
export declare function isWithinOpeningHours(time: Date, openingTime: string, // "HH:MM"
closingTime: string): boolean;
/**
 * Calculate effective manager deadline, accounting for opening hours.
 * If received outside opening hours, deadline starts at next opening + buffer.
 */
export declare function calculateManagerDeadline(notifiedAt: Date, delayMinutes: number, openingTime: string, closingTime: string): Date;
//# sourceMappingURL=utils.d.ts.map