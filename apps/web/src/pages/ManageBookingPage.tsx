import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PublicLayout } from '../components/layout/PublicLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { api, ApiError } from '../lib/api';
import { useT, useLocale } from '../lib/i18n';
import { formatDateTime, formatPrice, formatDuration, getServiceName } from '../lib/format';
import type { Booking, Service } from '@margo/shared';

interface PropertyData {
  name: string;
  slug: string;
  logo_url: string | null;
}

interface ManageData {
  booking: Booking;
  service: Service;
  property: PropertyData | null;
  can_modify: boolean;
  can_cancel: boolean;
  free_cancellation: boolean;
}

export default function ManageBookingPage() {
  const { token } = useParams<{ token: string }>();
  const t = useT();
  const { locale } = useLocale();

  const [data, setData] = useState<ManageData | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'main' | 'cancel'>('main');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);

  // Cancel form
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    if (!token) return;
    api.getManageBooking(token)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setExpired(true);
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Handle reschedule response (accept/decline)
  async function handleRescheduleResponse(accept: boolean) {
    if (!token) return;
    setSubmitting(true);
    try {
      await api.rescheduleResponse(token, accept);
      setDone(accept ? t('confirm.success.text') : t('manage.cancelled'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!token) return;
    setSubmitting(true);
    setError('');
    try {
      await api.cancelBooking(token, cancelReason || undefined);
      setDone(t('manage.cancelled'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  const logoUrl = data?.property?.logo_url || undefined;
  const propertyName = data?.property?.name || undefined;

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
          <h2 className="text-2xl font-display font-semibold mb-2">{t('manage.expired.title')}</h2>
          <p className="text-tertiary">{t('manage.expired.text')}</p>
        </Card>
      </PublicLayout>
    );
  }

  if (done) {
    return (
      <PublicLayout logoUrl={logoUrl} propertyName={propertyName}>
        <Card className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-tertiary">{done}</p>
        </Card>
      </PublicLayout>
    );
  }

  const { booking, service, free_cancellation } = data;
  const slot = booking.confirmed_slot || booking.requested_slot;
  const guestCount = booking.guest_count || 1;
  const totalPrice = service.price * guestCount;

  // If status is MANAGER_RESCHEDULED, show reschedule response UI
  if (booking.status === 'MANAGER_RESCHEDULED' && booking.confirmed_slot) {
    return (
      <PublicLayout logoUrl={logoUrl} propertyName={propertyName}>
        <Card>
          <h2 className="text-2xl font-display font-semibold text-center mb-6">{t('manage.reschedule.title')}</h2>
          <div className="bg-secondary rounded-lg p-4 mb-6 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-tertiary">{t('confirm.service')}</span>
              <span className="font-medium">{getServiceName(service, locale)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-tertiary">{t('confirm.slot')}</span>
              <span className="font-medium">{formatDateTime(booking.confirmed_slot, locale)}</span>
            </div>
          </div>
          {error && <Alert type="error" className="mb-4">{error}</Alert>}
          <div className="flex gap-3">
            <Button onClick={() => handleRescheduleResponse(true)} loading={submitting} className="flex-1">
              {t('manage.reschedule.accept')}
            </Button>
            <Button variant="secondary" onClick={() => handleRescheduleResponse(false)} loading={submitting} className="flex-1">
              {t('manage.reschedule.decline')}
            </Button>
          </div>
        </Card>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout logoUrl={logoUrl} propertyName={propertyName}>
      <Card>
        <h2 className="text-2xl font-display font-semibold text-center mb-6">{t('manage.title')}</h2>

        {/* Booking summary */}
        <div className="bg-secondary rounded-lg p-4 mb-6 space-y-2 text-sm">
          <h3 className="font-medium text-xs text-gray-900 uppercase tracking-wide mb-2">{t('manage.booking')}</h3>
          <div className="flex justify-between">
            <span className="text-tertiary">{t('confirm.service')}</span>
            <span className="font-medium">{getServiceName(service, locale)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-tertiary">{t('confirm.slot')}</span>
            <span className="font-medium">{formatDateTime(slot, locale)}</span>
          </div>
          {service.duration_minutes && (
            <div className="flex justify-between">
              <span className="text-tertiary">{t('confirm.duration')}</span>
              <span className="font-medium">{formatDuration(service.duration_minutes)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-tertiary">{t('manage.guests')}</span>
            <span className="font-medium">{guestCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-tertiary">{t('confirm.price')}</span>
            <span className="font-medium">{formatPrice(service.price)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
            <span className="text-tertiary font-medium">{t('manage.total')}</span>
            <span className="font-semibold text-primary">{formatPrice(totalPrice)}</span>
          </div>
        </div>

        {error && <Alert type="error" className="mb-4">{error}</Alert>}

        {view === 'main' && (
          <div className="space-y-3">
            {/* Modify hint — no modify button in V1 */}
            <p className="text-xs text-tertiary text-center">{t('manage.modifyHint')}</p>

            {/* Cancel button */}
            <Button
              variant="danger"
              className="w-full"
              onClick={() => setView('cancel')}
            >
              {t('manage.cancel')}
            </Button>
            <p className="text-xs text-tertiary text-center">
              {free_cancellation
                ? t('manage.cancelFree')
                : t('manage.cancelPolicy')}
            </p>
          </div>
        )}

        {view === 'cancel' && (
          <div className="space-y-4">
            <Alert type={free_cancellation ? 'info' : 'warning'}>
              {t('manage.cancelConfirm')}
              {!free_cancellation && (
                <p className="mt-1 font-medium">{t('manage.cancelPolicy')}</p>
              )}
            </Alert>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('manage.cancelReason')}</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="danger" onClick={handleCancel} loading={submitting} className="flex-1">
                {t('manage.cancel')}
              </Button>
              <Button variant="ghost" onClick={() => setView('main')} className="flex-1">
                {t('common.back')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </PublicLayout>
  );
}
