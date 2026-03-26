import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PublicLayout } from '../components/layout/PublicLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { api, ApiError } from '../lib/api';
import { useT } from '../lib/i18n';
import { formatDateTime, formatPrice, formatDuration } from '../lib/format';
import type { Booking, Service } from '@margo/shared';

interface PropertyData {
  name: string;
  slug: string;
  logo_url: string | null;
}

export default function ManagerBookingPage() {
  const { token } = useParams<{ token: string }>();
  const t = useT();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'accept' | 'reschedule' | 'decline' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);

  // Reschedule form
  const [proposeDate, setProposeDate] = useState('');
  const [proposeTime, setProposeTime] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!token) return;
    api.getManagerBooking(token)
      .then((data: any) => {
        setBooking(data.booking);
        setService(data.service);
        setProperty(data.property || null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setExpired(true);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAction(selectedAction: 'accept' | 'reschedule' | 'decline') {
    if (!token) return;
    setSubmitting(true);
    setError('');

    try {
      const body: any = { action: selectedAction };
      if (selectedAction === 'reschedule' && proposeDate && proposeTime) {
        body.proposed_slot = new Date(`${proposeDate}T${proposeTime}:00`).toISOString();
      }
      if (reason) body.reason = reason;

      await api.managerAction(token, body);

      const doneMessages = {
        accept: t('manager.done.accepted'),
        reschedule: t('manager.done.rescheduled'),
        decline: t('manager.done.declined'),
      };
      setDone(doneMessages[selectedAction]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  const logoUrl = property?.logo_url || undefined;
  const propertyName = property?.name || undefined;

  if (loading) {
    return (
      <PublicLayout>
        <div className="text-center py-12 text-tertiary">{t('common.loading')}</div>
      </PublicLayout>
    );
  }

  if (expired || !booking || !service) {
    return (
      <PublicLayout>
        <Card className="text-center py-8">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-display font-semibold mb-2">{t('manager.expired.title')}</h2>
          <p className="text-tertiary">{t('manager.expired.text')}</p>
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
          <p className="text-tertiary text-lg">{done}</p>
        </Card>
      </PublicLayout>
    );
  }

  const guestCount = booking.guest_count || 1;
  const totalPrice = service.price * guestCount;

  const sourceLabels: Record<string, string> = {
    social_media: 'Réseaux sociaux',
    recommendation: 'Recommandation',
    website: 'Site web',
    other: 'Autre',
  };

  return (
    <PublicLayout logoUrl={logoUrl} propertyName={propertyName}>
      <Card>
        <h2 className="text-2xl font-display font-semibold text-center mb-6">{t('manager.title')}</h2>

        {/* Booking details */}
        <div className="bg-secondary rounded-lg p-4 mb-6 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-tertiary">{t('manager.client')}</span>
            <span className="font-medium">{booking.client_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-tertiary">{t('manager.service')}</span>
            <span className="font-medium">{service.name_fr}</span>
          </div>
          {service.duration_minutes && (
            <div className="flex justify-between">
              <span className="text-tertiary">{t('confirm.duration')}</span>
              <span className="font-medium">{formatDuration(service.duration_minutes)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-tertiary">{t('manager.guests')}</span>
            <span className="font-medium">{guestCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-tertiary">{t('confirm.price')}</span>
            <span className="font-medium">{formatPrice(service.price)}</span>
          </div>
          {guestCount > 1 && (
            <div className="flex justify-between border-t border-gray-200 pt-2">
              <span className="text-tertiary font-medium">{t('manager.total')}</span>
              <span className="font-semibold text-primary">{formatPrice(totalPrice)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-tertiary">{t('manager.slot')}</span>
            <span className="font-medium">{formatDateTime(booking.requested_slot, 'fr')}</span>
          </div>
          {booking.client_origin_property && (
            <div className="flex justify-between">
              <span className="text-tertiary">{t('manager.origin')}</span>
              <span className="font-medium">{booking.client_origin_property}</span>
            </div>
          )}
          {booking.client_source && (
            <div className="flex justify-between">
              <span className="text-tertiary">{t('manager.source')}</span>
              <span className="font-medium">{sourceLabels[booking.client_source] || booking.client_source}</span>
            </div>
          )}
          {booking.client_message && (
            <div className="pt-2 border-t border-gray-200">
              <span className="text-tertiary block mb-1">{t('manager.message')}</span>
              <p className="italic">{booking.client_message}</p>
            </div>
          )}
        </div>

        {error && <Alert type="error" className="mb-4">{error}</Alert>}

        {!action && (
          <div className="space-y-3">
            <Button className="w-full" size="lg" onClick={() => handleAction('accept')} loading={submitting}>
              {t('manager.accept')}
            </Button>
            <Button variant="secondary" className="w-full" size="lg" onClick={() => setAction('reschedule')}>
              {t('manager.reschedule')}
            </Button>
            <Button variant="danger" className="w-full" size="lg" onClick={() => setAction('decline')}>
              {t('manager.decline')}
            </Button>
          </div>
        )}

        {action === 'reschedule' && (
          <div className="space-y-4">
            <Input
              label={t('manager.proposeSlot')}
              type="date"
              value={proposeDate}
              onChange={(e) => setProposeDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              required
            />
            <Input
              label={t('form.time')}
              type="time"
              value={proposeTime}
              onChange={(e) => setProposeTime(e.target.value)}
              required
            />
            <div className="flex gap-3">
              <Button onClick={() => handleAction('reschedule')} loading={submitting} className="flex-1">
                {t('manager.confirm')}
              </Button>
              <Button variant="ghost" onClick={() => setAction(null)} className="flex-1">
                {t('common.back')}
              </Button>
            </div>
          </div>
        )}

        {action === 'decline' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('manager.reason')}</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="danger" onClick={() => handleAction('decline')} loading={submitting} className="flex-1">
                {t('manager.decline')}
              </Button>
              <Button variant="ghost" onClick={() => setAction(null)} className="flex-1">
                {t('common.back')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </PublicLayout>
  );
}
