/**
 * Notification Orchestrator
 *
 * Central service that renders templates and dispatches WhatsApp + Email
 * for each booking event. Enriches template variables from booking + service + property data.
 */

import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';
import { sendWhatsApp } from './whatsapp-service.js';
import { sendEmail } from './email-service.js';
import {
  getTemplates,
  renderTemplate,
  type EventType,
  type Locale,
} from '../templates/index.js';
import type { Booking, Property, Service } from '@margo/shared';

// ─── Notification dispatch config per event ───

interface EventConfig {
  recipient: 'client' | 'manager';
  channels: ('whatsapp' | 'email')[];
}

const EVENT_CONFIG: Record<EventType, EventConfig> = {
  booking_requested:      { recipient: 'manager', channels: ['whatsapp', 'email'] },
  manager_reminder:       { recipient: 'manager', channels: ['whatsapp'] },
  manager_confirmed:      { recipient: 'client',  channels: ['whatsapp', 'email'] },
  manager_rescheduled:    { recipient: 'client',  channels: ['whatsapp', 'email'] },
  manager_declined:       { recipient: 'client',  channels: ['whatsapp', 'email'] },
  client_confirmed:       { recipient: 'client',  channels: ['whatsapp', 'email'] },
  reschedule_accepted:    { recipient: 'client',  channels: ['whatsapp', 'email'] },
  expired_manager:        { recipient: 'client',  channels: ['whatsapp', 'email'] },
  expired_client:         { recipient: 'client',  channels: ['whatsapp', 'email'] },
  reminder_48h:           { recipient: 'client',  channels: ['whatsapp', 'email'] },
  reminder_4h:            { recipient: 'client',  channels: ['whatsapp', 'email'] },
  cancellation_confirmed: { recipient: 'client',  channels: ['whatsapp', 'email'] },
  modification_requested: { recipient: 'manager', channels: ['whatsapp', 'email'] },
};

// ─── Main dispatch function ───

export interface NotifyParams {
  eventType: EventType;
  bookingId: string;
  extraVars?: Record<string, string | boolean>;
}

/**
 * Send notifications for a booking event.
 * Fetches booking + service + property, renders templates, sends WhatsApp + Email.
 * Errors are caught and logged — never throws.
 */
export async function notify(params: NotifyParams): Promise<void> {
  const { eventType, bookingId, extraVars } = params;

  try {
    // Fetch booking with service + property
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) {
      console.error(`[notify] Booking not found: ${bookingId}`);
      return;
    }

    const { data: service } = await supabase
      .from('services')
      .select('*')
      .eq('id', booking.service_id)
      .single();

    const { data: property } = await supabase
      .from('properties')
      .select('*')
      .eq('id', booking.property_id)
      .single();

    if (!service || !property) {
      console.error(`[notify] Service or property not found for booking ${bookingId}`);
      return;
    }

    const eventConfig = EVENT_CONFIG[eventType];
    if (!eventConfig) {
      console.error(`[notify] Unknown event type: ${eventType}`);
      return;
    }

    // Determine locale and recipient contact info
    const locale = (eventConfig.recipient === 'client'
      ? booking.client_locale
      : property.locale_default || 'fr') as Locale;

    const { phone, email } = getRecipientContact(
      eventConfig.recipient,
      booking as Booking,
      property as Property,
    );

    // Build template variables
    const variables = buildVariables(
      booking as Booking,
      service as Service,
      property as Property,
      extraVars,
    );

    // Get templates (with optional property overrides)
    const templates = await getTemplates(eventType, locale, booking.property_id);

    // Send in parallel
    const promises: Promise<void>[] = [];

    if (eventConfig.channels.includes('whatsapp') && phone) {
      const body = renderTemplate(templates.whatsapp, variables);
      promises.push(
        sendWhatsApp({
          to: phone,
          body,
          from: property.twilio_whatsapp_number || undefined,
          bookingId,
          eventType,
          recipient: eventConfig.recipient,
          locale,
        }).then(() => {}),
      );
    }

    if (eventConfig.channels.includes('email') && email) {
      const subject = renderTemplate(templates.email_subject, variables);
      const html = wrapEmailHtml(
        renderTemplate(templates.email_body, variables),
        property as Property,
      );
      promises.push(
        sendEmail({
          to: email,
          subject,
          html,
          bookingId,
          eventType,
          recipient: eventConfig.recipient,
          locale,
        }).then(() => {}),
      );
    }

    await Promise.allSettled(promises);
  } catch (err) {
    console.error(`[notify] Unexpected error for ${eventType} on booking ${bookingId}:`, (err as Error).message);
  }
}

// ─── Helpers ───

function getRecipientContact(
  recipient: 'client' | 'manager',
  booking: Booking,
  property: Property,
): { phone: string | null; email: string | null } {
  if (recipient === 'client') {
    return {
      phone: booking.client_phone,
      email: booking.client_email,
    };
  }

  // For manager notifications, we need to find active managers for the property
  // For now, we use the assigned manager or fall back to looking one up
  // The actual manager lookup happens asynchronously in getManagerContacts
  return {
    phone: null, // will be resolved below
    email: null,
  };
}

/**
 * For manager-targeted events, resolve all active manager contacts and send to each.
 * This is called separately from the main notify flow for manager events.
 */
async function getManagerContacts(propertyId: string): Promise<Array<{ phone: string | null; email: string }>> {
  const { data: managers } = await supabase
    .from('users')
    .select('email, phone_whatsapp')
    .eq('property_id', propertyId)
    .in('role', ['manager', 'admin'])
    .eq('active', true);

  return (managers || []).map((m) => ({
    phone: m.phone_whatsapp,
    email: m.email,
  }));
}

/**
 * Override notify for manager events: sends to all active managers.
 */
export async function notifyManagers(params: NotifyParams): Promise<void> {
  const { eventType, bookingId, extraVars } = params;

  try {
    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (!booking) return;

    const { data: service } = await supabase
      .from('services')
      .select('*')
      .eq('id', booking.service_id)
      .single();

    const { data: property } = await supabase
      .from('properties')
      .select('*')
      .eq('id', booking.property_id)
      .single();

    if (!service || !property) return;

    const managers = await getManagerContacts(booking.property_id);
    if (managers.length === 0) {
      console.warn(`[notify] No active managers for property ${booking.property_id}`);
      return;
    }

    const locale = (property.locale_default || 'fr') as Locale;
    const variables = buildVariables(
      booking as Booking,
      service as Service,
      property as Property,
      extraVars,
    );
    const templates = await getTemplates(eventType, locale, booking.property_id);
    const eventConfig = EVENT_CONFIG[eventType];

    for (const manager of managers) {
      const promises: Promise<void>[] = [];

      if (eventConfig.channels.includes('whatsapp') && manager.phone) {
        const body = renderTemplate(templates.whatsapp, variables);
        promises.push(
          sendWhatsApp({
            to: manager.phone,
            body,
            from: property.twilio_whatsapp_number || undefined,
            bookingId,
            eventType,
            recipient: 'manager',
            locale,
          }).then(() => {}),
        );
      }

      if (eventConfig.channels.includes('email') && manager.email) {
        const subject = renderTemplate(templates.email_subject, variables);
        const html = wrapEmailHtml(
          renderTemplate(templates.email_body, variables),
          property as Property,
        );
        promises.push(
          sendEmail({
            to: manager.email,
            subject,
            html,
            bookingId,
            eventType,
            recipient: 'manager',
            locale,
          }).then(() => {}),
        );
      }

      await Promise.allSettled(promises);
    }
  } catch (err) {
    console.error(`[notify:managers] Error for ${eventType} on booking ${bookingId}:`, (err as Error).message);
  }
}

/**
 * Smart dispatch: routes to notifyManagers for manager events, notify for client events.
 */
export async function dispatchNotification(params: NotifyParams): Promise<void> {
  const eventConfig = EVENT_CONFIG[params.eventType];
  if (!eventConfig) return;

  if (eventConfig.recipient === 'manager') {
    await notifyManagers(params);
  } else {
    await notify(params);
  }
}

// ─── Template variable builder ───

function formatSlot(isoDate: string | null, locale: Locale): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return d.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrice(amount: number, locale: Locale): string {
  const value = amount / 100;
  return locale === 'fr'
    ? `${value.toFixed(2).replace('.', ',')} MAD`
    : `${value.toFixed(2)} MAD`;
}

function buildVariables(
  booking: Booking,
  service: Service,
  property: Property,
  extra?: Record<string, string | boolean>,
): Record<string, string | boolean> {
  const locale = (booking.client_locale || 'fr') as Locale;
  const serviceName = locale === 'fr' ? service.name_fr : service.name_en;

  return {
    // Property
    property_name: property.name,

    // Client
    client_name: booking.client_name,
    client_origin: booking.client_origin_property || '—',
    client_source: booking.client_source || '—',
    client_message: booking.client_message || '—',

    // Service
    service_name: serviceName,
    duration: String(service.duration_minutes),
    price: formatPrice(service.price, locale),
    guest_count: String(booking.guest_count || 1),
    total_price: formatPrice(service.price * (booking.guest_count || 1), locale),

    // Slots
    requested_slot: formatSlot(booking.requested_slot, locale),
    confirmed_slot: formatSlot(booking.confirmed_slot, locale),

    // Microtransaction
    microtransaction_display: formatPrice(booking.microtransaction_amount, locale),

    // Links
    manager_link: `${config.appUrl}/manager/booking/${booking.manager_token || ''}`,
    confirm_link: `${config.appUrl}/confirm/${booking.client_token || ''}`,
    manage_link: `${config.appUrl}/manage/${booking.client_token || ''}`,
    request_link: `${config.appUrl}/${property.slug}/request`,

    // Deadlines
    deadline: formatSlot(booking.client_token_expires_at, locale),
    response_delay: String(property.manager_response_delay_minutes),

    // Spread extra variables
    ...extra,
  };
}

// ─── Email wrapper ───

function wrapEmailHtml(body: string, property: Property): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px;">
  <div style="background:${property.primary_color || '#000'};color:${property.secondary_color || '#fff'};padding:24px;text-align:center;">
    ${property.logo_url ? `<img src="${property.logo_url}" alt="${property.name}" style="max-height:48px;margin-bottom:8px;">` : ''}
    <h1 style="margin:0;font-size:20px;">${property.name}</h1>
  </div>
  <div style="padding:24px;">
    ${body}
  </div>
  <div style="padding:16px 24px;background:#f9f9f9;text-align:center;color:#888;font-size:12px;">
    ${property.name} — Powered by Margo Hospitality
  </div>
</div>
</body>
</html>`;
}
