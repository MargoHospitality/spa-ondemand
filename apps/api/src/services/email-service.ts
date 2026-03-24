import { Resend } from 'resend';
import { config } from '../config.js';
import { supabase } from '../lib/supabase.js';
import type { NotificationStatus } from '@margo/shared';

const resend = new Resend(config.resendApiKey);

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;       // defaults to config.emailFrom
  bookingId: string;
  eventType: string;
  recipient: 'client' | 'manager';
  locale: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a transactional email via Resend with retry x2 (exponential backoff).
 * Logs result to notifications_log.
 */
export async function sendEmail(params: SendEmailParams): Promise<{
  success: boolean;
  emailId?: string;
}> {
  const fromAddress = params.from || config.emailFrom;
  let lastError: Error | null = null;
  let emailId: string | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[email] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await sleep(delay);
      }

      const { data, error } = await resend.emails.send({
        from: fromAddress,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });

      if (error) throw new Error(error.message);

      emailId = data?.id;

      // Log success
      await logNotification({
        bookingId: params.bookingId,
        eventType: params.eventType,
        recipient: params.recipient,
        locale: params.locale,
        status: 'sent',
      });

      console.log(`[email] Sent to ${params.to} (id: ${emailId})`);
      return { success: true, emailId };
    } catch (err) {
      lastError = err as Error;
      console.error(`[email] Attempt ${attempt + 1} failed:`, lastError.message);
    }
  }

  // All retries exhausted — log failure
  await logNotification({
    bookingId: params.bookingId,
    eventType: params.eventType,
    recipient: params.recipient,
    locale: params.locale,
    status: 'failed',
  });

  console.error(`[email] Failed after ${MAX_RETRIES + 1} attempts to ${params.to}:`, lastError?.message);
  return { success: false };
}

// ─── Logging helper ───

async function logNotification(params: {
  bookingId: string;
  eventType: string;
  recipient: 'client' | 'manager';
  locale: string;
  status: NotificationStatus;
}) {
  try {
    await supabase.from('notifications_log').insert({
      booking_id: params.bookingId,
      channel: 'email' as const,
      recipient: params.recipient,
      event_type: params.eventType,
      locale: params.locale,
      status: params.status,
      sent_at: params.status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.error('[email] Failed to log notification:', (err as Error).message);
  }
}
