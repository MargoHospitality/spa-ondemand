// ─── Default configuration values ───

/** Default manager reminder delay in minutes */
export const DEFAULT_MANAGER_REMINDER_DELAY = 60;

/** Default manager auto-fail delay in minutes */
export const DEFAULT_MANAGER_AUTO_FAIL_DELAY = 90;

/** Default client confirmation delay when slot > 48h (in hours) */
export const DEFAULT_CLIENT_CONFIRMATION_DELAY_LONG = 24;

/** Default client confirmation delay when slot < 24h (in hours) */
export const DEFAULT_CLIENT_CONFIRMATION_DELAY_24H = 2;

/** Default microtransaction amount in centimes (100 = 10 MAD) */
export const DEFAULT_MICROTRANSACTION_AMOUNT = 1000; // 10.00 MAD

/** Currency */
export const CURRENCY = 'mad';

/** Token manage TTL: slot time + 2 hours (ms) */
export const MANAGE_TOKEN_BUFFER_MS = 2 * 60 * 60 * 1000;

// ─── State machine transitions ───

import type { BookingStatus } from './types.js';

/** Valid status transitions: from → allowed next statuses */
export const STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  REQUESTED: [
    'MANAGER_CONFIRMED',
    'MANAGER_RESCHEDULED',
    'MANAGER_DECLINED',
    'EXPIRED_MANAGER',
  ],
  MANAGER_CONFIRMED: ['CLIENT_CONFIRMED', 'EXPIRED_CLIENT', 'CANCELLED_MANAGER'],
  MANAGER_RESCHEDULED: [
    'CLIENT_CONFIRMED',
    'CLIENT_DECLINED_RESCHEDULE',
    'EXPIRED_CLIENT',
    'CANCELLED_MANAGER',
  ],
  MANAGER_DECLINED: [],
  CLIENT_DECLINED_RESCHEDULE: [],
  CLIENT_CONFIRMED: [
    'MODIFICATION_REQUESTED',
    'CANCELLED_CLIENT',
    'CANCELLED_MANAGER',
    'COMPLETED',
    'NO_SHOW',
  ],
  EXPIRED_MANAGER: [],
  EXPIRED_CLIENT: [],
  MODIFICATION_REQUESTED: [
    'MANAGER_CONFIRMED',
    'MANAGER_RESCHEDULED',
    'MANAGER_DECLINED',
    'EXPIRED_MANAGER',
    'CLIENT_CONFIRMED', // restore original if manager declines modification
  ],
  CANCELLED_CLIENT: [],
  CANCELLED_MANAGER: [],
  COMPLETED: [],
  NO_SHOW: [],
};

/**
 * Checks if a status transition is valid.
 */
export function isValidTransition(from: BookingStatus, to: BookingStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Cron intervals (ms) ───

export const CRON_MANAGER_CHECK_INTERVAL = 5 * 60 * 1000; // 5 min
export const CRON_CLIENT_CHECK_INTERVAL = 5 * 60 * 1000; // 5 min
export const CRON_REMINDER_INTERVAL = 15 * 60 * 1000; // 15 min
