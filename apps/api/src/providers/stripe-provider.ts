import Stripe from 'stripe';
import { config } from '../config.js';
import type { PaymentProvider } from './payment-provider.js';
import type {
  PaymentCustomerResult,
  PaymentChargeResult,
  PaymentCaptureResult,
  SetupIntentResult,
} from '@margo/shared';

const stripe = new Stripe(config.stripeSecretKey);

export class StripeProvider implements PaymentProvider {
  async createCustomer(params: {
    email: string;
    name: string;
    phone?: string;
  }): Promise<PaymentCustomerResult> {
    const customer = await stripe.customers.create({
      email: params.email,
      name: params.name,
      phone: params.phone,
    });
    return { customerId: customer.id };
  }

  async createSetupIntent(
    customerId: string,
    paymentMethodId: string,
  ): Promise<SetupIntentResult> {
    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });

    // Create and confirm a SetupIntent (tokenisation only, 0 MAD)
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    });

    return {
      setupIntentId: setupIntent.id,
      paymentMethodId,
    };
  }

  async chargeMicrotransaction(
    customerId: string,
    paymentMethodId: string,
    amount: number,
    currency: string,
  ): Promise<PaymentChargeResult> {
    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });

    // Create and confirm a payment intent for the microtransaction
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    });

    return {
      chargeId: paymentIntent.id,
      paymentMethodId,
    };
  }

  async refundCharge(chargeId: string): Promise<void> {
    await stripe.refunds.create({
      payment_intent: chargeId,
    });
  }

  async capturePayment(
    customerId: string,
    paymentMethodId: string,
    amount: number,
    currency: string,
  ): Promise<PaymentCaptureResult> {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    });

    return { chargeId: paymentIntent.id };
  }

  async releasePaymentMethod(paymentMethodId: string): Promise<void> {
    await stripe.paymentMethods.detach(paymentMethodId);
  }
}

/** Singleton Stripe provider instance */
export const stripeProvider = new StripeProvider();
