import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { PublicLayout } from '../components/layout/PublicLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { api, ApiError } from '../lib/api';
import { useT, useLocale } from '../lib/i18n';
import { formatDateTime, formatPrice, formatDuration, getServiceName } from '../lib/format';
import type { Service } from '@margo/shared';

const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;

interface BookingData {
  id: string;
  client_name: string;
  confirmed_slot: string | null;
  requested_slot: string;
  microtransaction_amount: number;
  status: string;
}

function ConfirmForm({ booking, service }: { booking: BookingData; service: Service }) {
  const t = useT();
  const { locale } = useLocale();
  const stripe = useStripe();
  const elements = useElements();
  const { token } = useParams<{ token: string }>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const slot = booking.confirmed_slot || booking.requested_slot;
  const amount = formatPrice(booking.microtransaction_amount);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !token) return;

    setSubmitting(true);
    setError('');

    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error('Card element not found');

      const { paymentMethod, error: stripeError } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: { name: booking.client_name },
      });

      if (stripeError) {
        setError(stripeError.message || 'Payment error');
        return;
      }

      await api.confirmBooking(token, {
        stripe_payment_method_id: paymentMethod!.id,
      });

      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('common.error'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Card className="text-center">
        <div className="py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-display font-semibold mb-2">{t('confirm.success.title')}</h2>
          <p className="text-tertiary">{t('confirm.success.text')}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-2xl font-display font-semibold text-center mb-6">{t('confirm.title')}</h2>

      {/* Booking summary */}
      <div className="bg-secondary rounded-lg p-4 mb-6 space-y-3">
        <h3 className="font-medium text-sm text-gray-900 uppercase tracking-wide">{t('confirm.summary')}</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-tertiary">{t('confirm.service')}</span>
          <span className="font-medium">{getServiceName(service, locale)}</span>

          <span className="text-tertiary">{t('confirm.slot')}</span>
          <span className="font-medium">{formatDateTime(slot, locale)}</span>

          {service.duration_minutes && (
            <>
              <span className="text-tertiary">{t('confirm.duration')}</span>
              <span className="font-medium">{formatDuration(service.duration_minutes)}</span>
            </>
          )}

          <span className="text-tertiary">{t('confirm.price')}</span>
          <span className="font-medium">{formatPrice(service.price)}</span>
        </div>
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('confirm.cardInfo')}</label>
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#333',
                  '::placeholder': { color: '#9ca3af' },
                },
              },
            }}
          />
        </div>

        <Alert type="info">
          {t('confirm.legal', { amount })}
        </Alert>

        <Button type="submit" loading={submitting} disabled={!stripe} className="w-full" size="lg">
          {submitting ? t('confirm.processing') : t('confirm.cta')}
        </Button>
      </form>
    </Card>
  );
}

export default function ConfirmationPage() {
  const { token } = useParams<{ token: string }>();
  const t = useT();
  const [data, setData] = useState<{ booking: BookingData; service: Service } | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.getConfirmation(token)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setExpired(true);
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <PublicLayout>
        <div className="text-center py-12 text-tertiary">{t('common.loading')}</div>
      </PublicLayout>
    );
  }

  if (expired || !data) {
    return (
      <PublicLayout>
        <Card className="text-center py-8">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-display font-semibold mb-2">{t('confirm.expired.title')}</h2>
          <p className="text-tertiary">{t('confirm.expired.text')}</p>
        </Card>
      </PublicLayout>
    );
  }

  if (!stripePromise) {
    return (
      <PublicLayout>
        <Alert type="error">Stripe configuration missing</Alert>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <Elements stripe={stripePromise}>
        <ConfirmForm booking={data.booking} service={data.service} />
      </Elements>
    </PublicLayout>
  );
}
