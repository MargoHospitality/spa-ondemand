import { supabase } from '../lib/supabase.js';
import { dispatchNotification } from '../services/notification-service.js';
import type { BookingStatus } from '@margo/shared';

/**
 * Send reminders to clients before their appointment.
 * - 48h reminder
 * - 4h reminder
 * Auto-skip if the time window has already passed at confirmation.
 * Runs every 15 minutes.
 */
export async function sendReminders() {
  const now = new Date();

  // Find confirmed bookings that haven't been completed/cancelled
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, confirmed_slot, requested_slot, client_email, client_phone, client_locale, reminder_48h_sent_at, reminder_4h_sent_at, client_confirmed_at')
    .eq('status', 'CLIENT_CONFIRMED' satisfies BookingStatus);

  if (error) {
    console.error('[cron:reminders] Error:', error.message);
    return;
  }

  if (!bookings || bookings.length === 0) return;

  for (const booking of bookings) {
    const slotTime = new Date(booking.confirmed_slot || booking.requested_slot);
    const hoursUntilSlot = (slotTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Skip past slots
    if (hoursUntilSlot < 0) continue;

    const confirmedAt = booking.client_confirmed_at ? new Date(booking.client_confirmed_at) : null;

    // 48h reminder
    if (
      !booking.reminder_48h_sent_at &&
      hoursUntilSlot <= 48 &&
      hoursUntilSlot > 4
    ) {
      // Auto-skip: if confirmed less than 48h before slot, skip 48h reminder
      if (confirmedAt) {
        const hoursFromConfirmToSlot = (slotTime.getTime() - confirmedAt.getTime()) / (1000 * 60 * 60);
        if (hoursFromConfirmToSlot < 48) {
          // Mark as skipped
          await supabase
            .from('bookings')
            .update({ reminder_48h_sent_at: now.toISOString() })
            .eq('id', booking.id);
          continue;
        }
      }

      await supabase
        .from('bookings')
        .update({ reminder_48h_sent_at: now.toISOString() })
        .eq('id', booking.id);

      console.log(`[cron:reminders] 48h reminder sent for booking ${booking.id}`);

      // Send WhatsApp + Email reminder
      dispatchNotification({
        eventType: 'reminder_48h',
        bookingId: booking.id,
      }).catch((err) => console.error('[cron:reminders] 48h notify error:', err));
    }

    // 4h reminder
    if (
      !booking.reminder_4h_sent_at &&
      hoursUntilSlot <= 4 &&
      hoursUntilSlot > 0
    ) {
      // Auto-skip: if confirmed less than 4h before slot, skip 4h reminder
      if (confirmedAt) {
        const hoursFromConfirmToSlot = (slotTime.getTime() - confirmedAt.getTime()) / (1000 * 60 * 60);
        if (hoursFromConfirmToSlot < 4) {
          await supabase
            .from('bookings')
            .update({ reminder_4h_sent_at: now.toISOString() })
            .eq('id', booking.id);
          continue;
        }
      }

      await supabase
        .from('bookings')
        .update({ reminder_4h_sent_at: now.toISOString() })
        .eq('id', booking.id);

      console.log(`[cron:reminders] 4h reminder sent for booking ${booking.id}`);

      // Send WhatsApp + Email reminder
      dispatchNotification({
        eventType: 'reminder_4h',
        bookingId: booking.id,
      }).catch((err) => console.error('[cron:reminders] 4h notify error:', err));
    }
  }
}
