import { supabase } from '../lib/supabase.js';
import { dispatchNotification } from '../services/notification-service.js';
import type { BookingStatus } from '@margo/shared';

/**
 * Check for bookings where client has not confirmed within the deadline.
 * Runs every 5 minutes.
 */
export async function checkClientExpiration() {
  const now = new Date().toISOString();

  // Find bookings awaiting client confirmation where deadline has passed
  const { data: expiredBookings, error } = await supabase
    .from('bookings')
    .select('id, client_email, client_phone, client_locale')
    .in('status', ['MANAGER_CONFIRMED', 'MANAGER_RESCHEDULED'] satisfies BookingStatus[])
    .lt('client_token_expires_at', now)
    .not('client_token', 'is', null);

  if (error) {
    console.error('[cron:client-expiration] Error:', error.message);
    return;
  }

  if (!expiredBookings || expiredBookings.length === 0) return;

  console.log(`[cron:client-expiration] Found ${expiredBookings.length} expired bookings`);

  for (const booking of expiredBookings) {
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        status: 'EXPIRED_CLIENT' as BookingStatus,
        client_token: null,
        client_token_expires_at: null,
        updated_at: now,
      })
      .eq('id', booking.id)
      .in('status', ['MANAGER_CONFIRMED', 'MANAGER_RESCHEDULED']); // optimistic lock

    if (updateErr) {
      console.error(`[cron:client-expiration] Failed to expire booking ${booking.id}:`, updateErr.message);
      continue;
    }

    console.log(`[cron:client-expiration] Expired booking ${booking.id}`);

    // Notify client that confirmation deadline has passed
    dispatchNotification({
      eventType: 'expired_client',
      bookingId: booking.id,
    }).catch((err) => console.error('[cron:client-expiration] Notify error:', err));
  }
}
