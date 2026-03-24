import type {
  PaymentCustomerResult,
  PaymentChargeResult,
  PaymentCaptureResult,
} from '@margo/shared';

/**
 * Abstract payment provider interface.
 * V1: Stripe implementation
 * V2: NAPS implementation
 */
export interface PaymentProvider {
  /** Create a customer record in the payment system */
  createCustomer(params: {
    email: string;
    name: string;
    phone?: string;
  }): Promise<PaymentCustomerResult>;

  /** Charge a microtransaction to validate the payment method */
  chargeMicrotransaction(
    customerId: string,
    paymentMethodId: string,
    amount: number,
    currency: string,
  ): Promise<PaymentChargeResult>;

  /** Refund a charge (e.g. microtransaction refund on free cancellation) */
  refundCharge(chargeId: string): Promise<void>;

  /** Capture a full payment using a stored payment method */
  capturePayment(
    customerId: string,
    paymentMethodId: string,
    amount: number,
    currency: string,
  ): Promise<PaymentCaptureResult>;

  /** Release/detach a stored payment method */
  releasePaymentMethod(paymentMethodId: string): Promise<void>;
}
