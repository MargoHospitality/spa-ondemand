/**
 * i18n Notification Templates System
 *
 * Templates are stored as JSON per event_type and locale (FR/EN).
 * Variables use {{variable_name}} syntax and are interpolated at render time.
 * Templates are editable per property (stored in DB) with fallback to defaults.
 */

import { supabase } from '../lib/supabase.js';

// ─── Event types ───

export const EVENT_TYPES = [
  'booking_requested',        // → manager: new booking request
  'manager_reminder',         // → manager: reminder to respond
  'manager_confirmed',        // → client: booking accepted
  'manager_rescheduled',      // → client: counter-proposal
  'manager_declined',         // → client: booking refused
  'client_confirmed',         // → client: confirmation email with "Gérer mon soin"
  'reschedule_accepted',      // → client: confirmation link after accepting counter-proposal
  'expired_manager',          // → client: manager didn't respond
  'expired_client',           // → client: client didn't confirm in time
  'reminder_48h',             // → client: 48h before appointment
  'reminder_4h',              // → client: 4h before appointment
  'cancellation_confirmed',   // → client: cancellation confirmed
  'modification_requested',   // → manager: client requests modification
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type Locale = 'fr' | 'en';

export interface TemplateSet {
  whatsapp: string;
  email_subject: string;
  email_body: string;
}

export type TemplateMap = Record<EventType, Record<Locale, TemplateSet>>;

// ─── Default templates ───

const defaults: TemplateMap = {
  booking_requested: {
    fr: {
      whatsapp: `🧖 Nouvelle demande spa — {{property_name}}

Client : {{client_name}}
Soin : {{service_name}} ({{duration}} min — {{price}})
Créneau souhaité : {{requested_slot}}
Séjourne à : {{client_origin}}
Source : {{client_source}}

👉 Traiter la demande : {{manager_link}}
⏱ Vous avez {{response_delay}} min pour répondre.`,
      email_subject: `Nouvelle demande spa — {{client_name}}`,
      email_body: `<h2>Nouvelle demande de soin</h2>
<p><strong>Client :</strong> {{client_name}}</p>
<p><strong>Soin :</strong> {{service_name}} ({{duration}} min — {{price}})</p>
<p><strong>Créneau souhaité :</strong> {{requested_slot}}</p>
<p><strong>Séjourne à :</strong> {{client_origin}}</p>
<p><strong>Source :</strong> {{client_source}}</p>
<p><strong>Message :</strong> {{client_message}}</p>
<br>
<a href="{{manager_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Traiter la demande</a>
<p style="color:#888;margin-top:12px;">⏱ Vous avez {{response_delay}} min pour répondre.</p>`,
    },
    en: {
      whatsapp: `🧖 New spa request — {{property_name}}

Client: {{client_name}}
Treatment: {{service_name}} ({{duration}} min — {{price}})
Requested slot: {{requested_slot}}
Staying at: {{client_origin}}
Source: {{client_source}}

👉 Handle request: {{manager_link}}
⏱ You have {{response_delay}} min to respond.`,
      email_subject: `New spa request — {{client_name}}`,
      email_body: `<h2>New treatment request</h2>
<p><strong>Client:</strong> {{client_name}}</p>
<p><strong>Treatment:</strong> {{service_name}} ({{duration}} min — {{price}})</p>
<p><strong>Requested slot:</strong> {{requested_slot}}</p>
<p><strong>Staying at:</strong> {{client_origin}}</p>
<p><strong>Source:</strong> {{client_source}}</p>
<p><strong>Message:</strong> {{client_message}}</p>
<br>
<a href="{{manager_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Handle request</a>
<p style="color:#888;margin-top:12px;">⏱ You have {{response_delay}} min to respond.</p>`,
    },
  },

  manager_reminder: {
    fr: {
      whatsapp: `⏰ Rappel — Demande spa en attente

Client : {{client_name}}
Soin : {{service_name}} ({{duration}} min)
Créneau : {{requested_slot}}

👉 Traiter maintenant : {{manager_link}}
⚠️ La demande expirera dans {{remaining_minutes}} min.`,
      email_subject: `Rappel : demande spa en attente — {{client_name}}`,
      email_body: `<h2>Rappel : demande en attente</h2>
<p><strong>Client :</strong> {{client_name}}</p>
<p><strong>Soin :</strong> {{service_name}} ({{duration}} min)</p>
<p><strong>Créneau :</strong> {{requested_slot}}</p>
<br>
<a href="{{manager_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Traiter maintenant</a>
<p style="color:#c00;margin-top:12px;">⚠️ La demande expirera dans {{remaining_minutes}} min.</p>`,
    },
    en: {
      whatsapp: `⏰ Reminder — Pending spa request

Client: {{client_name}}
Treatment: {{service_name}} ({{duration}} min)
Slot: {{requested_slot}}

👉 Handle now: {{manager_link}}
⚠️ Request expires in {{remaining_minutes}} min.`,
      email_subject: `Reminder: pending spa request — {{client_name}}`,
      email_body: `<h2>Reminder: pending request</h2>
<p><strong>Client:</strong> {{client_name}}</p>
<p><strong>Treatment:</strong> {{service_name}} ({{duration}} min)</p>
<p><strong>Slot:</strong> {{requested_slot}}</p>
<br>
<a href="{{manager_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Handle now</a>
<p style="color:#c00;margin-top:12px;">⚠️ Request expires in {{remaining_minutes}} min.</p>`,
    },
  },

  manager_confirmed: {
    fr: {
      whatsapp: `✅ Votre demande de soin a été acceptée !

Soin : {{service_name}}
Date : {{confirmed_slot}}
Durée : {{duration}} min
Prix : {{price}}

👉 Confirmer et valider ma carte : {{confirm_link}}
⏱ Vous avez jusqu'au {{deadline}} pour confirmer.`,
      email_subject: `Votre soin est disponible — Confirmez votre réservation`,
      email_body: `<h2>Votre demande a été acceptée !</h2>
<p><strong>Soin :</strong> {{service_name}}</p>
<p><strong>Date :</strong> {{confirmed_slot}}</p>
<p><strong>Durée :</strong> {{duration}} min</p>
<p><strong>Prix :</strong> {{price}}</p>
<br>
<a href="{{confirm_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Confirmer mon soin</a>
<p style="color:#888;margin-top:12px;">⏱ Vous avez jusqu'au {{deadline}} pour confirmer.</p>
<p style="color:#888;">Une microtransaction de {{microtransaction_display}} sera débitée pour valider votre carte. Le paiement du soin se fait sur place.</p>`,
    },
    en: {
      whatsapp: `✅ Your treatment request has been accepted!

Treatment: {{service_name}}
Date: {{confirmed_slot}}
Duration: {{duration}} min
Price: {{price}}

👉 Confirm and validate my card: {{confirm_link}}
⏱ You have until {{deadline}} to confirm.`,
      email_subject: `Your treatment is available — Confirm your booking`,
      email_body: `<h2>Your request has been accepted!</h2>
<p><strong>Treatment:</strong> {{service_name}}</p>
<p><strong>Date:</strong> {{confirmed_slot}}</p>
<p><strong>Duration:</strong> {{duration}} min</p>
<p><strong>Price:</strong> {{price}}</p>
<br>
<a href="{{confirm_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Confirm my treatment</a>
<p style="color:#888;margin-top:12px;">⏱ You have until {{deadline}} to confirm.</p>
<p style="color:#888;">A {{microtransaction_display}} micro-transaction will be charged to validate your card. Payment for the treatment is made on-site.</p>`,
    },
  },

  manager_rescheduled: {
    fr: {
      whatsapp: `🔄 Le spa vous propose un autre créneau

Soin : {{service_name}}
Nouveau créneau proposé : {{confirmed_slot}}
{{#manager_message}}Message : {{manager_message}}{{/manager_message}}

👉 Accepter ou décliner : {{confirm_link}}
⏱ Vous avez jusqu'au {{deadline}} pour répondre.`,
      email_subject: `Proposition de nouveau créneau pour votre soin`,
      email_body: `<h2>Le spa vous propose un autre créneau</h2>
<p><strong>Soin :</strong> {{service_name}}</p>
<p><strong>Créneau proposé :</strong> {{confirmed_slot}}</p>
{{#manager_message}}<p><strong>Message :</strong> {{manager_message}}</p>{{/manager_message}}
<br>
<a href="{{confirm_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Voir la proposition</a>
<p style="color:#888;margin-top:12px;">⏱ Vous avez jusqu'au {{deadline}} pour répondre.</p>`,
    },
    en: {
      whatsapp: `🔄 The spa suggests a different time slot

Treatment: {{service_name}}
Proposed slot: {{confirmed_slot}}
{{#manager_message}}Message: {{manager_message}}{{/manager_message}}

👉 Accept or decline: {{confirm_link}}
⏱ You have until {{deadline}} to respond.`,
      email_subject: `New time slot proposed for your treatment`,
      email_body: `<h2>The spa suggests a different time slot</h2>
<p><strong>Treatment:</strong> {{service_name}}</p>
<p><strong>Proposed slot:</strong> {{confirmed_slot}}</p>
{{#manager_message}}<p><strong>Message:</strong> {{manager_message}}</p>{{/manager_message}}
<br>
<a href="{{confirm_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">View proposal</a>
<p style="color:#888;margin-top:12px;">⏱ You have until {{deadline}} to respond.</p>`,
    },
  },

  manager_declined: {
    fr: {
      whatsapp: `😔 Votre demande de soin n'a pas pu être honorée

Soin : {{service_name}}
Date demandée : {{requested_slot}}

Le spa n'est malheureusement pas disponible pour ce créneau. N'hésitez pas à soumettre une nouvelle demande pour une autre date.

👉 Nouvelle demande : {{request_link}}`,
      email_subject: `Votre demande de soin — Créneau non disponible`,
      email_body: `<h2>Créneau non disponible</h2>
<p>Nous sommes désolés, votre demande de soin <strong>{{service_name}}</strong> pour le <strong>{{requested_slot}}</strong> n'a pas pu être honorée.</p>
<p>N'hésitez pas à soumettre une nouvelle demande pour une autre date.</p>
<br>
<a href="{{request_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Nouvelle demande</a>`,
    },
    en: {
      whatsapp: `😔 Your treatment request could not be fulfilled

Treatment: {{service_name}}
Requested date: {{requested_slot}}

Unfortunately, the spa is not available for this time slot. Feel free to submit a new request for a different date.

👉 New request: {{request_link}}`,
      email_subject: `Your treatment request — Slot unavailable`,
      email_body: `<h2>Slot unavailable</h2>
<p>We're sorry, your request for <strong>{{service_name}}</strong> on <strong>{{requested_slot}}</strong> could not be fulfilled.</p>
<p>Feel free to submit a new request for a different date.</p>
<br>
<a href="{{request_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">New request</a>`,
    },
  },

  client_confirmed: {
    fr: {
      whatsapp: `🎉 Votre soin est confirmé !

Soin : {{service_name}}
Date : {{confirmed_slot}}
Durée : {{duration}} min

À bientôt ! Si besoin, gérez votre réservation ici :
👉 {{manage_link}}`,
      email_subject: `Confirmation de votre soin — {{service_name}}`,
      email_body: `<h2>Votre soin est confirmé ! 🎉</h2>
<p><strong>Soin :</strong> {{service_name}}</p>
<p><strong>Date :</strong> {{confirmed_slot}}</p>
<p><strong>Durée :</strong> {{duration}} min</p>
<p><strong>Prix :</strong> {{price}} (paiement sur place)</p>
<br>
<p>Une microtransaction de {{microtransaction_display}} a été débitée pour valider votre carte.</p>
<br>
<a href="{{manage_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Gérer mon soin</a>
<p style="color:#888;margin-top:12px;">Vous pouvez modifier ou annuler votre soin depuis ce lien.</p>`,
    },
    en: {
      whatsapp: `🎉 Your treatment is confirmed!

Treatment: {{service_name}}
Date: {{confirmed_slot}}
Duration: {{duration}} min

See you soon! If needed, manage your booking here:
👉 {{manage_link}}`,
      email_subject: `Booking confirmed — {{service_name}}`,
      email_body: `<h2>Your treatment is confirmed! 🎉</h2>
<p><strong>Treatment:</strong> {{service_name}}</p>
<p><strong>Date:</strong> {{confirmed_slot}}</p>
<p><strong>Duration:</strong> {{duration}} min</p>
<p><strong>Price:</strong> {{price}} (payment on-site)</p>
<br>
<p>A {{microtransaction_display}} micro-transaction has been charged to validate your card.</p>
<br>
<a href="{{manage_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Manage my booking</a>
<p style="color:#888;margin-top:12px;">You can modify or cancel your treatment from this link.</p>`,
    },
  },

  reschedule_accepted: {
    fr: {
      whatsapp: `✅ Créneau accepté !

Soin : {{service_name}}
Date confirmée : {{confirmed_slot}}

👉 Confirmer et valider ma carte : {{confirm_link}}
⏱ Vous avez jusqu'au {{deadline}} pour confirmer.`,
      email_subject: `Créneau accepté — Confirmez votre réservation`,
      email_body: `<h2>Créneau accepté !</h2>
<p><strong>Soin :</strong> {{service_name}}</p>
<p><strong>Date confirmée :</strong> {{confirmed_slot}}</p>
<br>
<a href="{{confirm_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Confirmer mon soin</a>
<p style="color:#888;margin-top:12px;">⏱ Vous avez jusqu'au {{deadline}} pour confirmer.</p>`,
    },
    en: {
      whatsapp: `✅ Slot accepted!

Treatment: {{service_name}}
Confirmed date: {{confirmed_slot}}

👉 Confirm and validate my card: {{confirm_link}}
⏱ You have until {{deadline}} to confirm.`,
      email_subject: `Slot accepted — Confirm your booking`,
      email_body: `<h2>Slot accepted!</h2>
<p><strong>Treatment:</strong> {{service_name}}</p>
<p><strong>Confirmed date:</strong> {{confirmed_slot}}</p>
<br>
<a href="{{confirm_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Confirm my treatment</a>
<p style="color:#888;margin-top:12px;">⏱ You have until {{deadline}} to confirm.</p>`,
    },
  },

  expired_manager: {
    fr: {
      whatsapp: `😔 Votre demande de soin n'a pas reçu de réponse

Soin : {{service_name}}
Date demandée : {{requested_slot}}

Le spa n'a pas pu répondre dans les délais. N'hésitez pas à soumettre une nouvelle demande.

👉 Nouvelle demande : {{request_link}}`,
      email_subject: `Votre demande de soin — Pas de réponse`,
      email_body: `<h2>Pas de réponse dans les délais</h2>
<p>Votre demande de soin <strong>{{service_name}}</strong> pour le <strong>{{requested_slot}}</strong> n'a pas reçu de réponse dans les délais impartis.</p>
<p>N'hésitez pas à soumettre une nouvelle demande.</p>
<br>
<a href="{{request_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Nouvelle demande</a>`,
    },
    en: {
      whatsapp: `😔 Your treatment request did not receive a response

Treatment: {{service_name}}
Requested date: {{requested_slot}}

The spa was unable to respond in time. Feel free to submit a new request.

👉 New request: {{request_link}}`,
      email_subject: `Your treatment request — No response`,
      email_body: `<h2>No response in time</h2>
<p>Your request for <strong>{{service_name}}</strong> on <strong>{{requested_slot}}</strong> did not receive a response in time.</p>
<p>Feel free to submit a new request.</p>
<br>
<a href="{{request_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">New request</a>`,
    },
  },

  expired_client: {
    fr: {
      whatsapp: `⏰ Votre réservation a expiré

Soin : {{service_name}}
Date : {{confirmed_slot}}

Le délai de confirmation est dépassé. Votre réservation a été annulée.

👉 Nouvelle demande : {{request_link}}`,
      email_subject: `Réservation expirée — {{service_name}}`,
      email_body: `<h2>Réservation expirée</h2>
<p>Le délai de confirmation pour votre soin <strong>{{service_name}}</strong> le <strong>{{confirmed_slot}}</strong> est dépassé.</p>
<p>Votre réservation a été annulée. N'hésitez pas à soumettre une nouvelle demande.</p>
<br>
<a href="{{request_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Nouvelle demande</a>`,
    },
    en: {
      whatsapp: `⏰ Your booking has expired

Treatment: {{service_name}}
Date: {{confirmed_slot}}

The confirmation deadline has passed. Your booking has been cancelled.

👉 New request: {{request_link}}`,
      email_subject: `Booking expired — {{service_name}}`,
      email_body: `<h2>Booking expired</h2>
<p>The confirmation deadline for your <strong>{{service_name}}</strong> treatment on <strong>{{confirmed_slot}}</strong> has passed.</p>
<p>Your booking has been cancelled. Feel free to submit a new request.</p>
<br>
<a href="{{request_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">New request</a>`,
    },
  },

  reminder_48h: {
    fr: {
      whatsapp: `📅 Rappel — Votre soin dans 2 jours

Soin : {{service_name}}
Date : {{confirmed_slot}}
Durée : {{duration}} min

À bientôt !
👉 Gérer ma réservation : {{manage_link}}`,
      email_subject: `Rappel : votre soin dans 2 jours`,
      email_body: `<h2>Votre soin approche ! 📅</h2>
<p><strong>Soin :</strong> {{service_name}}</p>
<p><strong>Date :</strong> {{confirmed_slot}}</p>
<p><strong>Durée :</strong> {{duration}} min</p>
<br>
<a href="{{manage_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Gérer ma réservation</a>`,
    },
    en: {
      whatsapp: `📅 Reminder — Your treatment in 2 days

Treatment: {{service_name}}
Date: {{confirmed_slot}}
Duration: {{duration}} min

See you soon!
👉 Manage my booking: {{manage_link}}`,
      email_subject: `Reminder: your treatment in 2 days`,
      email_body: `<h2>Your treatment is coming up! 📅</h2>
<p><strong>Treatment:</strong> {{service_name}}</p>
<p><strong>Date:</strong> {{confirmed_slot}}</p>
<p><strong>Duration:</strong> {{duration}} min</p>
<br>
<a href="{{manage_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Manage my booking</a>`,
    },
  },

  reminder_4h: {
    fr: {
      whatsapp: `⏰ Rappel — Votre soin dans quelques heures

Soin : {{service_name}}
Date : {{confirmed_slot}}

Nous vous attendons ! À très bientôt.`,
      email_subject: `Rappel : votre soin aujourd'hui`,
      email_body: `<h2>C'est aujourd'hui ! ⏰</h2>
<p><strong>Soin :</strong> {{service_name}}</p>
<p><strong>Date :</strong> {{confirmed_slot}}</p>
<p>Nous vous attendons ! À très bientôt.</p>`,
    },
    en: {
      whatsapp: `⏰ Reminder — Your treatment in a few hours

Treatment: {{service_name}}
Date: {{confirmed_slot}}

We look forward to seeing you! See you soon.`,
      email_subject: `Reminder: your treatment today`,
      email_body: `<h2>It's today! ⏰</h2>
<p><strong>Treatment:</strong> {{service_name}}</p>
<p><strong>Date:</strong> {{confirmed_slot}}</p>
<p>We look forward to seeing you! See you soon.</p>`,
    },
  },

  cancellation_confirmed: {
    fr: {
      whatsapp: `✅ Annulation confirmée

Soin : {{service_name}}
Date : {{confirmed_slot}}

{{#refunded}}Votre microtransaction de {{microtransaction_display}} sera remboursée.{{/refunded}}
{{#not_refunded}}Conformément à notre politique, la microtransaction ne sera pas remboursée pour une annulation à moins de 24h.{{/not_refunded}}

👉 Nouvelle demande : {{request_link}}`,
      email_subject: `Annulation confirmée — {{service_name}}`,
      email_body: `<h2>Annulation confirmée</h2>
<p>Votre soin <strong>{{service_name}}</strong> prévu le <strong>{{confirmed_slot}}</strong> a bien été annulé.</p>
{{#refunded}}<p>Votre microtransaction de {{microtransaction_display}} sera remboursée.</p>{{/refunded}}
{{#not_refunded}}<p>Conformément à notre politique, la microtransaction ne sera pas remboursée pour une annulation à moins de 24h.</p>{{/not_refunded}}
<br>
<a href="{{request_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Nouvelle demande</a>`,
    },
    en: {
      whatsapp: `✅ Cancellation confirmed

Treatment: {{service_name}}
Date: {{confirmed_slot}}

{{#refunded}}Your {{microtransaction_display}} micro-transaction will be refunded.{{/refunded}}
{{#not_refunded}}Per our policy, the micro-transaction will not be refunded for cancellations within 24 hours.{{/not_refunded}}

👉 New request: {{request_link}}`,
      email_subject: `Cancellation confirmed — {{service_name}}`,
      email_body: `<h2>Cancellation confirmed</h2>
<p>Your <strong>{{service_name}}</strong> treatment scheduled for <strong>{{confirmed_slot}}</strong> has been cancelled.</p>
{{#refunded}}<p>Your {{microtransaction_display}} micro-transaction will be refunded.</p>{{/refunded}}
{{#not_refunded}}<p>Per our policy, the micro-transaction will not be refunded for cancellations within 24 hours.</p>{{/not_refunded}}
<br>
<a href="{{request_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">New request</a>`,
    },
  },

  modification_requested: {
    fr: {
      whatsapp: `🔄 Demande de modification — {{property_name}}

Client : {{client_name}}
Soin : {{service_name}} ({{duration}} min)
Nouveau créneau souhaité : {{requested_slot}}

👉 Traiter la demande : {{manager_link}}
⏱ Vous avez {{response_delay}} min pour répondre.`,
      email_subject: `Demande de modification — {{client_name}}`,
      email_body: `<h2>Demande de modification</h2>
<p><strong>Client :</strong> {{client_name}}</p>
<p><strong>Soin :</strong> {{service_name}} ({{duration}} min)</p>
<p><strong>Nouveau créneau souhaité :</strong> {{requested_slot}}</p>
<br>
<a href="{{manager_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Traiter la demande</a>
<p style="color:#888;margin-top:12px;">⏱ Vous avez {{response_delay}} min pour répondre.</p>`,
    },
    en: {
      whatsapp: `🔄 Modification request — {{property_name}}

Client: {{client_name}}
Treatment: {{service_name}} ({{duration}} min)
New requested slot: {{requested_slot}}

👉 Handle request: {{manager_link}}
⏱ You have {{response_delay}} min to respond.`,
      email_subject: `Modification request — {{client_name}}`,
      email_body: `<h2>Modification request</h2>
<p><strong>Client:</strong> {{client_name}}</p>
<p><strong>Treatment:</strong> {{service_name}} ({{duration}} min)</p>
<p><strong>New requested slot:</strong> {{requested_slot}}</p>
<br>
<a href="{{manager_link}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Handle request</a>
<p style="color:#888;margin-top:12px;">⏱ You have {{response_delay}} min to respond.</p>`,
    },
  },
};

// ─── Template rendering ───

/**
 * Interpolate {{variable}} placeholders and handle {{#section}}...{{/section}} conditionals.
 */
export function renderTemplate(template: string, variables: Record<string, string | boolean | undefined>): string {
  let result = template;

  // Handle conditional sections: {{#key}}content{{/key}}
  result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
    return variables[key] ? content : '';
  });

  // Replace {{variable}} placeholders
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined || value === true || value === false) return '';
    return value;
  });

  // Clean up empty lines from removed conditionals
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return result;
}

/**
 * Get template set for a given event, locale, and optional property overrides.
 * Property-level overrides are stored in a JSON column on the properties table.
 */
export async function getTemplates(
  eventType: EventType,
  locale: Locale,
  propertyId?: string,
): Promise<TemplateSet> {
  const defaultTemplate = defaults[eventType]?.[locale];
  if (!defaultTemplate) {
    throw new Error(`No template found for event=${eventType} locale=${locale}`);
  }

  if (!propertyId) return defaultTemplate;

  // Try to load property-level overrides
  try {
    const { data } = await supabase
      .from('properties')
      .select('notification_templates')
      .eq('id', propertyId)
      .single();

    const overrides = data?.notification_templates as Record<string, Record<string, TemplateSet>> | null;
    if (overrides?.[eventType]?.[locale]) {
      return {
        ...defaultTemplate,
        ...overrides[eventType][locale],
      };
    }
  } catch {
    // Fallback to defaults if column doesn't exist yet
  }

  return defaultTemplate;
}

/**
 * Get the full default template map (for back-office editing).
 */
export function getDefaultTemplates(): TemplateMap {
  return defaults;
}
