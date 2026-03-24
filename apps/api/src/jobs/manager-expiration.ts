import { supabase } from '../lib/supabase.js';
import { dispatchNotification } from '../services/notification-service.js';
import type { BookingStatus } from '@margo/shared';

/**
 * Check for bookings where manager has not responded within the deadline.
 * Runs every 5 minutes.
 *
 * 1. Send reminder at reminder_delay (default 60min)
 * 2. Expire at auto_fail_delay (default 90min)
 */
export async function checkManagerExpiration() {
  const now = new Date().toISOString();

  // Find bookings in REQUESTED or MODIFICATION_REQUESTED status
  // where the manager token has expired
  const { data: expiredBookings, error } = await supabase
    .from('bookings')
    .select('id, property_id, client_email, client_phone, client_locale, status')
    .in('status', ['REQUESTED', 'MODIFICATION_REQUESTED'] satisfies BookingStatus[])
    .lt('manager_token_expires_at', now)
    .not('manager_token', 'is', null);

  if (error) {
    console.error('[cron:manager-expiration] Error fetching expired bookings:', error.message);
    return;
  }

  if (!expiredBookings || expiredBookings.length === 0) return;

  console.log(`[cron:manager-expiration] Found ${expiredBookings.length} expired bookings`);

  for (const booking of expiredBookings) {
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        status: 'EXPIRED_MANAGER' as BookingStatus,
        manager_token: null,
        manager_token_expires_at: null,
        updated_at: now,
      })
      .eq('id', booking.id)
      .in('status', ['REQUESTED', 'MODIFICATION_REQUESTED']); // optimistic lock

    if (updateErr) {
      console.error(`[cron:manager-expiration] Failed to expire booking ${booking.id}:`, updateErr.message);
      continue;
    }

    console.log(`[cron:manager-expiration] Expired booking ${booking.id}`);

    // Notify client that manager didn't respond
    dispatchNotification({
      eventType: 'expired_manager',
      bookingId: booking.id,
    }).catch((err) => console.error('[cron:manager-expiration] Notify error:', err));
  }
}

/**
 * Check for bookings that need a manager reminder.
 * Sends reminder if manager hasn't responded after reminder_delay.
 */
export async function checkManagerReminder() {
  const now = new Date();

  // Find REQUESTED bookings where manager was notified but hasn't responded
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, property_id, manager_notified_at')
    .in('status', ['REQUESTED', 'MODIFICATION_REQUESTED'] satisfies BookingStatus[])
    .not('manager_notified_at', 'is', null)
    .not('manager_token', 'is', null);

  if (error) {
    console.error('[cron:manager-reminder] Error:', error.message);
    return;
  }

  if (!bookings || bookings.length === 0) return;

  for (const booking of bookings) {
    // Get property config for reminder delay
    const { data: property } = await supabase
      .from('properties')
      .select('manager_response_delay_minutes')
      .eq('id', booking.property_id)
      .single();

    if (!property) continue;

    const notifiedAt = new Date(booking.manager_notified_at!);
    const reminderThreshold = new Date(
      notifiedAt.getTime() + property.manager_response_delay_minutes * 60 * 1000,
    );

    if (now >= reminderThreshold) {
      // Check if reminder already sent (via notifications_log)
      const { data: existingReminder } = await supabase
        .from('notifications_log')
        .select('id')
        .eq('booking_id', booking.id)
        .eq('event_type', 'manager_reminder')
        .limit(1);

      if (existingReminder && existingReminder.length > 0) continue;

      console.log(`[cron:manager-reminder] Sending reminder for booking ${booking.id}`);

      // Send WhatsApp reminder to manager(s)
      const remaining = property.manager_response_delay_minutes
        ? Math.max(0, Math.round(
            (new Date(booking.manager_notified_at!).getTime()
              + property.manager_response_delay_minutes * 2 * 60 * 1000
              - now.getTime()) / 60000,
          ))
        : 30;

      dispatchNotification({
        eventType: 'manager_reminder',
        bookingId: booking.id,
        extraVars: { remaining_minutes: String(remaining) },
      }).catch((err) => console.error('[cron:manager-reminder] Notify error:', err));
    }
  }
}
