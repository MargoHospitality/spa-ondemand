/** Default manager reminder delay in minutes */
export declare const DEFAULT_MANAGER_REMINDER_DELAY = 60;
/** Default manager auto-fail delay in minutes */
export declare const DEFAULT_MANAGER_AUTO_FAIL_DELAY = 90;
/** Default client confirmation delay when slot > 48h (in hours) */
export declare const DEFAULT_CLIENT_CONFIRMATION_DELAY_LONG = 24;
/** Default client confirmation delay when slot < 24h (in hours) */
export declare const DEFAULT_CLIENT_CONFIRMATION_DELAY_24H = 2;
/** Default microtransaction amount in centimes (100 = 10 MAD) */
export declare const DEFAULT_MICROTRANSACTION_AMOUNT = 1000;
/** Currency */
export declare const CURRENCY = "mad";
/** Token manage TTL: slot time + 2 hours (ms) */
export declare const MANAGE_TOKEN_BUFFER_MS: number;
import type { BookingStatus } from './types.js';
/** Valid status transitions: from → allowed next statuses */
export declare const STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]>;
/**
 * Checks if a status transition is valid.
 */
export declare function isValidTransition(from: BookingStatus, to: BookingStatus): boolean;
export declare const CRON_MANAGER_CHECK_INTERVAL: number;
export declare const CRON_CLIENT_CHECK_INTERVAL: number;
export declare const CRON_REMINDER_INTERVAL: number;
//# sourceMappingURL=constants.d.ts.map