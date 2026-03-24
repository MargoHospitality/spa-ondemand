import twilio from 'twilio';
import { config } from '../config.js';
import { supabase } from '../lib/supabase.js';
import type { NotificationStatus } from '@margo/shared';

const client = twilio(config.twilioAccountSid, config.twilioAuthToken);

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000; // 1s, then 2s (exponential)

interface SendWhatsAppParams {
  to: string;           // recipient WhatsApp number (e.g. +212600000000)
  body: string;         // message body
  from?: string;        // sender WhatsApp number (defaults to config)
  bookingId: string;
  eventType: string;
  recipient: 'client' | 'manager';
  locale: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a WhatsApp message via Twilio with retry x2 (exponential backoff).
 * Logs result to notifications_log.
 */
export async function sendWhatsApp(params: SendWhatsAppParams): Promise<{
  success: boolean;
  twilioSid?: string;
}> {
  const fromNumber = params.from || config.twilioWhatsAppNumber;
  let lastError: Error | null = null;
  let twilioSid: string | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[whatsapp] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await sleep(delay);
      }

      const message = await client.messages.create({
        body: params.body,
        from: `whatsapp:${fromNumber}`,
        to: `whatsapp:${params.to}`,
      });

      twilioSid = message.sid;

      // Log success
      await logNotification({
        bookingId: params.bookingId,
        eventType: params.eventType,
        recipient: params.recipient,
        locale: params.locale,
        status: 'sent',
        twilioSid,
      });

      console.log(`[whatsapp] Sent to ${params.to} (sid: ${twilioSid})`);
      return { success: true, twilioSid };
    } catch (err) {
      lastError = err as Error;
      console.error(`[whatsapp] Attempt ${attempt + 1} failed:`, lastError.message);
    }
  }

  // All retries exhausted — log failure
  await logNotification({
    bookingId: params.bookingId,
    eventType: params.eventType,
    recipient: params.recipient,
    locale: params.locale,
    status: 'failed',
    twilioSid: undefined,
  });

  console.error(`[whatsapp] Failed after ${MAX_RETRIES + 1} attempts to ${params.to}:`, lastError?.message);
  return { success: false };
}

// ─── Logging helper ───

async function logNotification(params: {
  bookingId: string;
  eventType: string;
  recipient: 'client' | 'manager';
  locale: string;
  status: NotificationStatus;
  twilioSid?: string;
}) {
  try {
    await supabase.from('notifications_log').insert({
      booking_id: params.bookingId,
      channel: 'whatsapp' as const,
      recipient: params.recipient,
      event_type: params.eventType,
      locale: params.locale,
      status: params.status,
      twilio_sid: params.twilioSid || null,
      sent_at: params.status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.error('[whatsapp] Failed to log notification:', (err as Error).message);
  }
}
