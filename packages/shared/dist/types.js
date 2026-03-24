// ─── Booking Statuses ───
export const BOOKING_STATUSES = [
    'REQUESTED',
    'MANAGER_CONFIRMED',
    'MANAGER_RESCHEDULED',
    'MANAGER_DECLINED',
    'CLIENT_DECLINED_RESCHEDULE',
    'CLIENT_CONFIRMED',
    'EXPIRED_MANAGER',
    'EXPIRED_CLIENT',
    'MODIFICATION_REQUESTED',
    'CANCELLED_CLIENT',
    'CANCELLED_MANAGER',
    'COMPLETED',
    'NO_SHOW',
];
// ─── Active statuses (booking in progress) ───
export const ACTIVE_STATUSES = [
    'REQUESTED',
    'MANAGER_CONFIRMED',
    'MANAGER_RESCHEDULED',
    'CLIENT_CONFIRMED',
    'MODIFICATION_REQUESTED',
];
// ─── User roles ───
export const USER_ROLES = ['manager', 'admin', 'superadmin'];
// ─── Client source ───
export const CLIENT_SOURCES = ['social_media', 'recommendation', 'website', 'other'];
//# sourceMappingURL=types.js.map