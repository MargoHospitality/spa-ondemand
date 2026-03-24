import { Router } from 'express';
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { config } from '../config.js';
import { supabase } from '../lib/supabase.js';

const stripe = new Stripe(config.stripeSecretKey);

export const webhooksRouter: ReturnType<typeof Router> = Router();

/**
 * Stripe webhook handler.
 * Listens for: payment_intent.succeeded, payment_method.attached, charge.refunded
 *
 * IMPORTANT: This route must receive the raw body for signature verification.
 * The raw body middleware is set up in server.ts before JSON parsing.
 */
webhooksRouter.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];

  if (!sig || !config.stripeWebhookSecret) {
    res.status(400).json({ error: 'Missing signature or webhook secret' });
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      (req as Request & { rawBody: Buffer }).rawBody,
      sig,
      config.stripeWebhookSecret,
    );
  } catch (err) {
    console.error('[webhook:stripe] Signature verification failed:', (err as Error).message);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  console.log(`[webhook:stripe] Received event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      default:
        console.log(`[webhook:stripe] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error(`[webhook:stripe] Error handling ${event.type}:`, (err as Error).message);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// ─── Event handlers ───

/**
 * payment_intent.succeeded — Update booking charge status.
 * This confirms the microtransaction was successfully charged.
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('stripe_charge_id', paymentIntent.id);

  if (!bookings || bookings.length === 0) {
    console.log(`[webhook:stripe] No booking found for payment_intent ${paymentIntent.id}`);
    return;
  }

  for (const booking of bookings) {
    await supabase
      .from('bookings')
      .update({
        stripe_charge_status: 'succeeded',
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id);

    console.log(`[webhook:stripe] payment_intent.succeeded → booking ${booking.id} charge confirmed`);
  }
}

/**
 * payment_method.attached — Log that a payment method was attached to a customer.
 * Useful for tracking that the client's card is on file.
 */
async function handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
  if (!paymentMethod.customer) return;

  const customerId = typeof paymentMethod.customer === 'string'
    ? paymentMethod.customer
    : paymentMethod.customer.id;

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .is('stripe_payment_method_id', null);

  if (!bookings || bookings.length === 0) {
    console.log(`[webhook:stripe] No matching booking for customer ${customerId}`);
    return;
  }

  for (const booking of bookings) {
    await supabase
      .from('bookings')
      .update({
        stripe_payment_method_id: paymentMethod.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id);

    console.log(`[webhook:stripe] payment_method.attached → booking ${booking.id} PM saved`);
  }
}

/**
 * charge.refunded — Update booking charge status to 'refunded'.
 * Triggered when a microtransaction refund is processed.
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  // Stripe charges reference the payment_intent
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id;

  if (!paymentIntentId) return;

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('stripe_charge_id', paymentIntentId);

  if (!bookings || bookings.length === 0) {
    console.log(`[webhook:stripe] No booking found for refunded charge (PI: ${paymentIntentId})`);
    return;
  }

  for (const booking of bookings) {
    await supabase
      .from('bookings')
      .update({
        stripe_charge_status: 'refunded',
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id);

    console.log(`[webhook:stripe] charge.refunded → booking ${booking.id} marked refunded`);
  }
}
