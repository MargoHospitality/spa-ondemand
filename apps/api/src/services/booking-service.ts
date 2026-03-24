import { supabase } from '../lib/supabase.js';
import { generateToken } from '../lib/tokens.js';
import { stripeProvider } from '../providers/stripe-provider.js';
import { dispatchNotification } from './notification-service.js';
import {
  isValidTransition,
  calculateClientDeadline,
  calculateManagerDeadline,
  CURRENCY,
  DEFAULT_MICROTRANSACTION_AMOUNT,
  MANAGE_TOKEN_BUFFER_MS,
  type BookingStatus,
  type Booking,
  type Property,
  type CreateBookingRequest,
  type ManagerActionRequest,
} from '@margo/shared';

// ─── Helpers ───

async function getProperty(propertyId: string): Promise<Property> {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .single();
  if (error || !data) throw new Error(`Property not found: ${propertyId}`);
  return data as Property;
}

function transitionOrThrow(current: BookingStatus, next: BookingStatus) {
  if (!isValidTransition(current, next)) {
    throw new Error(`Invalid transition: ${current} → ${next}`);
  }
}

// ─── Create booking ───

export async function createBooking(input: CreateBookingRequest) {
  const property = await getProperty(input.property_id);

  // Verify service belongs to property and is active
  const { data: service, error: serviceErr } = await supabase
    .from('services')
    .select('*')
    .eq('id', input.service_id)
    .eq('property_id', input.property_id)
    .eq('active', true)
    .single();
  if (serviceErr || !service) throw new Error('Service not found or inactive');

  // Check for closure on requested date
  const requestedSlot = new Date(input.requested_slot);
  const { data: closures } = await supabase
    .from('closures')
    .select('id')
    .eq('property_id', input.property_id)
    .lte('start_at', requestedSlot.toISOString())
    .gte('end_at', requestedSlot.toISOString())
    .limit(1);
  if (closures && closures.length > 0) {
    throw new Error('Property is closed on the requested date');
  }

  const now = new Date();

  // Calculate manager token expiry
  const managerTokenExpiry = calculateManagerDeadline(
    now,
    property.manager_auto_fail_delay_minutes,
    property.opening_time,
    property.closing_time,
  );

  // Generate manager token
  const managerToken = generateToken(
    'placeholder', // will be replaced after insert
    'manager_action',
    managerTokenExpiry,
  );

  // Insert booking
  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      property_id: input.property_id,
      service_id: input.service_id,
      client_name: input.client_name,
      client_email: input.client_email,
      client_phone: input.client_phone,
      client_locale: input.client_locale,
      client_origin_property: input.client_origin_property || null,
      client_source: input.client_source || null,
      requested_slot: input.requested_slot,
      client_message: input.client_message || null,
      status: 'REQUESTED' as BookingStatus,
      microtransaction_amount: property.microtransaction_amount || DEFAULT_MICROTRANSACTION_AMOUNT,
      requested_at: now.toISOString(),
      manager_notified_at: now.toISOString(),
    })
    .select()
    .single();

  if (error || !booking) throw new Error(`Failed to create booking: ${error?.message}`);

  // Now generate real manager token with the booking ID
  const realManagerToken = generateToken(booking.id, 'manager_action', managerTokenExpiry);

  await supabase
    .from('bookings')
    .update({
      manager_token: realManagerToken,
      manager_token_expires_at: managerTokenExpiry.toISOString(),
    })
    .eq('id', booking.id);

  // Notify managers (async, non-blocking)
  dispatchNotification({
    eventType: 'booking_requested',
    bookingId: booking.id,
  }).catch((err) => console.error('[booking] Failed to notify:', err));

  return { ...booking, manager_token: realManagerToken };
}

// ─── Manager action ───

export async function handleManagerAction(
  booking: Booking,
  action: ManagerActionRequest,
) {
  const property = await getProperty(booking.property_id);
  const now = new Date();

  let newStatus: BookingStatus;
  const updates: Record<string, unknown> = {
    manager_responded_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  switch (action.action) {
    case 'accept': {
      newStatus = 'MANAGER_CONFIRMED';
      updates.confirmed_slot = booking.requested_slot;
      break;
    }
    case 'reschedule': {
      if (!action.proposed_slot) throw new Error('proposed_slot is required for reschedule');
      newStatus = 'MANAGER_RESCHEDULED';
      updates.confirmed_slot = action.proposed_slot;
      break;
    }
    case 'decline': {
      newStatus = 'MANAGER_DECLINED';
      updates.cancellation_reason = action.reason || null;
      break;
    }
    default:
      throw new Error(`Unknown action: ${action.action}`);
  }

  transitionOrThrow(booking.status as BookingStatus, newStatus);
  updates.status = newStatus;

  // Invalidate manager token
  updates.manager_token = null;
  updates.manager_token_expires_at = null;

  // If accepted or rescheduled, generate client confirmation token
  if (newStatus === 'MANAGER_CONFIRMED' || newStatus === 'MANAGER_RESCHEDULED') {
    const slotTime = new Date((updates.confirmed_slot as string) || booking.requested_slot);
    const clientDeadline = calculateClientDeadline(slotTime, now, {
      delayLongHours: property.client_confirmation_delay_long,
      delay24hHours: property.client_confirmation_delay_24h,
    });

    const clientToken = generateToken(booking.id, 'client_confirmation', clientDeadline);
    updates.client_token = clientToken;
    updates.client_token_expires_at = clientDeadline.toISOString();
    updates.client_notified_at = now.toISOString();
  }

  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', booking.id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update booking: ${error.message}`);

  // Notify client of manager's decision (async, non-blocking)
  const eventMap: Record<string, string> = {
    MANAGER_CONFIRMED: 'manager_confirmed',
    MANAGER_RESCHEDULED: 'manager_rescheduled',
    MANAGER_DECLINED: 'manager_declined',
  };
  const eventType = eventMap[newStatus];
  if (eventType) {
    dispatchNotification({
      eventType: eventType as 'manager_confirmed' | 'manager_rescheduled' | 'manager_declined',
      bookingId: booking.id,
    }).catch((err) => console.error('[booking] Failed to notify:', err));
  }

  return data;
}

// ─── Client confirmation (with payment) ───

export async function handleClientConfirmation(
  booking: Booking,
  paymentMethodId: string,
) {
  transitionOrThrow(booking.status as BookingStatus, 'CLIENT_CONFIRMED');

  const now = new Date();

  // Create Stripe customer and charge microtransaction
  const { customerId } = await stripeProvider.createCustomer({
    email: booking.client_email,
    name: booking.client_name,
    phone: booking.client_phone,
  });

  const { chargeId } = await stripeProvider.chargeMicrotransaction(
    customerId,
    paymentMethodId,
    booking.microtransaction_amount,
    CURRENCY,
  );

  // Generate manage token (valid until slot + 2h)
  const slotTime = new Date(booking.confirmed_slot || booking.requested_slot);
  const manageExpiry = new Date(slotTime.getTime() + MANAGE_TOKEN_BUFFER_MS);
  const manageToken = generateToken(booking.id, 'client_manage', manageExpiry);

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'CLIENT_CONFIRMED' as BookingStatus,
      stripe_customer_id: customerId,
      stripe_payment_method_id: paymentMethodId,
      stripe_charge_id: chargeId,
      stripe_charge_status: 'succeeded',
      client_confirmed_at: now.toISOString(),
      // Replace confirmation token with manage token
      client_token: manageToken,
      client_token_expires_at: manageExpiry.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', booking.id)
    .select()
    .single();

  if (error) throw new Error(`Failed to confirm booking: ${error.message}`);

  // Send confirmation email with "Gérer mon soin" link
  dispatchNotification({
    eventType: 'client_confirmed',
    bookingId: booking.id,
  }).catch((err) => console.error('[booking] Failed to notify:', err));

  return data;
}

// ─── Client reschedule response ───

export async function handleClientRescheduleResponse(
  booking: Booking,
  accept: boolean,
) {
  if (booking.status !== 'MANAGER_RESCHEDULED') {
    throw new Error('Booking is not in MANAGER_RESCHEDULED status');
  }

  const now = new Date();

  if (accept) {
    // Accept the counter-proposal → same as MANAGER_CONFIRMED flow
    const property = await getProperty(booking.property_id);
    const slotTime = new Date(booking.confirmed_slot || booking.requested_slot);
    const clientDeadline = calculateClientDeadline(slotTime, now, {
      delayLongHours: property.client_confirmation_delay_long,
      delay24hHours: property.client_confirmation_delay_24h,
    });

    const clientToken = generateToken(booking.id, 'client_confirmation', clientDeadline);

    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'MANAGER_CONFIRMED' as BookingStatus,
        client_token: clientToken,
        client_token_expires_at: clientDeadline.toISOString(),
        client_notified_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', booking.id)
      .select()
      .single();

    if (error) throw new Error(`Failed to accept reschedule: ${error.message}`);

    // Notify client: reschedule accepted, now confirm with payment
    dispatchNotification({
      eventType: 'reschedule_accepted',
      bookingId: booking.id,
    }).catch((err) => console.error('[booking] Failed to notify:', err));

    return data;
  } else {
    // Decline the counter-proposal
    transitionOrThrow('MANAGER_RESCHEDULED', 'CLIENT_DECLINED_RESCHEDULE');

    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'CLIENT_DECLINED_RESCHEDULE' as BookingStatus,
        client_token: null,
        client_token_expires_at: null,
        updated_at: now.toISOString(),
      })
      .eq('id', booking.id)
      .select()
      .single();

    if (error) throw new Error(`Failed to decline reschedule: ${error.message}`);
    return data;
  }
}

// ─── Client cancellation ───

export async function handleClientCancellation(booking: Booking, reason?: string) {
  transitionOrThrow(booking.status as BookingStatus, 'CANCELLED_CLIENT');

  const now = new Date();
  const slotTime = new Date(booking.confirmed_slot || booking.requested_slot);
  const hoursUntilSlot = (slotTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  const updates: Record<string, unknown> = {
    status: 'CANCELLED_CLIENT' as BookingStatus,
    cancelled_at: now.toISOString(),
    cancellation_reason: reason || null,
    cancellation_by: 'client',
    client_token: null,
    client_token_expires_at: null,
    updated_at: now.toISOString(),
  };

  // Auto-refund if > 24h before slot
  if (hoursUntilSlot > 24 && booking.stripe_charge_id) {
    await stripeProvider.refundCharge(booking.stripe_charge_id);
    updates.stripe_charge_status = 'refunded';
  }

  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', booking.id)
    .select()
    .single();

  if (error) throw new Error(`Failed to cancel booking: ${error.message}`);

  // Notify client of cancellation
  dispatchNotification({
    eventType: 'cancellation_confirmed',
    bookingId: booking.id,
    extraVars: {
      refunded: hoursUntilSlot > 24,
      not_refunded: hoursUntilSlot <= 24,
    },
  }).catch((err) => console.error('[booking] Failed to notify:', err));

  return data;
}

// ─── Modification request ───

export async function handleModificationRequest(
  booking: Booking,
  newRequestedSlot: string,
) {
  transitionOrThrow(booking.status as BookingStatus, 'MODIFICATION_REQUESTED');

  // Check > 24h policy
  const currentSlot = new Date(booking.confirmed_slot || booking.requested_slot);
  const now = new Date();
  const hoursUntilSlot = (currentSlot.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilSlot <= 24 && !booking.policy_override_by_manager) {
    throw new Error('Modification not allowed within 24h of the slot');
  }

  const property = await getProperty(booking.property_id);

  // Generate new manager token
  const managerTokenExpiry = calculateManagerDeadline(
    now,
    property.manager_auto_fail_delay_minutes,
    property.opening_time,
    property.closing_time,
  );
  const managerToken = generateToken(booking.id, 'manager_action', managerTokenExpiry);

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'MODIFICATION_REQUESTED' as BookingStatus,
      requested_slot: newRequestedSlot,
      manager_token: managerToken,
      manager_token_expires_at: managerTokenExpiry.toISOString(),
      manager_notified_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', booking.id)
    .select()
    .single();

  if (error) throw new Error(`Failed to request modification: ${error.message}`);

  // Notify managers of modification request
  dispatchNotification({
    eventType: 'modification_requested',
    bookingId: booking.id,
  }).catch((err) => console.error('[booking] Failed to notify:', err));

  return data;
}
