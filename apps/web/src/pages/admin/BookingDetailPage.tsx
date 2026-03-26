import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Alert } from '../../components/ui/Alert';
import { api, ApiError } from '../../lib/api';
import { formatDateTime, formatPrice, formatDuration } from '../../lib/format';
import { ArrowLeft, CheckCircle, XCircle, Calendar, Send, Ban, RotateCcw } from 'lucide-react';
import type { BookingStatus, Booking, Service } from '@margo/shared';

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking & { services: Service; properties: { name: string; slug: string } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // Reschedule modal state
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  // Decline modal state
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  useEffect(() => {
    if (!id) return;
    api.admin.getBooking(id)
      .then(setBooking)
      .catch(() => setError('Impossible de charger la réservation'))
      .finally(() => setLoading(false));
  }, [id]);

  async function doAction(action: () => Promise<any>, successMsg: string) {
    if (!id) return;
    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      const updated = await action();
      setBooking((prev) => prev ? { ...prev, ...updated } : prev);
      setSuccess(successMsg);
      setShowReschedule(false);
      setShowDecline(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <p className="text-tertiary">Chargement...</p>;
  if (!booking) return <Alert type="error">{error || 'Réservation introuvable'}</Alert>;

  const service = booking.services;
  const total = (service.price || 0) * (booking.guest_count || 1);

  // Timeline entries
  const timeline: { label: string; date: string | null }[] = [
    { label: 'Demande reçue', date: booking.requested_at },
    { label: 'Manager notifié', date: booking.manager_notified_at },
    { label: 'Réponse manager', date: booking.manager_responded_at },
    { label: 'Client notifié', date: booking.client_notified_at },
    { label: 'Confirmation client', date: booking.client_confirmed_at },
    { label: 'Rappel 48h', date: booking.reminder_48h_sent_at },
    { label: 'Rappel 4h', date: booking.reminder_4h_sent_at },
    { label: 'Annulé', date: booking.cancelled_at },
    { label: 'Terminé', date: booking.completed_at },
  ].filter((e) => e.date);

  return (
    <div>
      <button onClick={() => navigate('/admin/bookings')} className="flex items-center gap-2 text-tertiary hover:text-gray-900 mb-4 text-sm">
        <ArrowLeft className="h-4 w-4" /> Retour aux demandes
      </button>

      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-3xl font-display font-semibold">{booking.client_name}</h1>
        <StatusBadge status={booking.status} />
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {success && <Alert type="success" className="mb-4">{success}</Alert>}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Booking info */}
        <Card>
          <h3 className="text-sm font-medium text-tertiary uppercase tracking-wide mb-4">Détails de la réservation</h3>
          <div className="space-y-3 text-sm">
            <Row label="Prestation" value={service.name_fr} />
            <Row label="Créneau demandé" value={formatDateTime(booking.requested_slot, 'fr')} />
            {booking.confirmed_slot && (
              <Row label="Créneau confirmé" value={formatDateTime(booking.confirmed_slot, 'fr')} />
            )}
            {service.duration_minutes && (
              <Row label="Durée" value={formatDuration(service.duration_minutes)} />
            )}
            <Row label="Nombre de personnes" value={String(booking.guest_count || 1)} />
            <Row label="Prix unitaire" value={formatPrice(service.price)} />
            <Row label="Total" value={formatPrice(total)} />
            {booking.stripe_charge_status && (
              <Row label="Paiement Stripe" value={booking.stripe_charge_status} />
            )}
          </div>
        </Card>

        {/* Client info */}
        <Card>
          <h3 className="text-sm font-medium text-tertiary uppercase tracking-wide mb-4">Informations client</h3>
          <div className="space-y-3 text-sm">
            <Row label="Nom" value={booking.client_name} />
            <Row label="Email" value={booking.client_email} />
            <Row label="Téléphone" value={booking.client_phone} />
            <Row label="Langue" value={booking.client_locale.toUpperCase()} />
            {booking.client_origin_property && (
              <Row label="Séjourne à" value={booking.client_origin_property} />
            )}
            {booking.client_source && (
              <Row label="Source" value={booking.client_source} />
            )}
            {booking.client_message && (
              <Row label="Message" value={booking.client_message} />
            )}
          </div>
        </Card>

        {/* Timeline */}
        <Card>
          <h3 className="text-sm font-medium text-tertiary uppercase tracking-wide mb-4">Historique</h3>
          <div className="space-y-3">
            {timeline.map(({ label, date }) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 bg-primary rounded-full shrink-0" />
                <span className="text-tertiary">{label}</span>
                <span className="font-medium ml-auto">{formatDateTime(date!, 'fr')}</span>
              </div>
            ))}
          </div>
          {booking.cancellation_reason && (
            <div className="mt-4 pt-4 border-t border-gray-100 text-sm">
              <span className="text-tertiary">Motif d'annulation:</span>
              <p className="mt-1">{booking.cancellation_reason}</p>
            </div>
          )}
        </Card>

        {/* Actions */}
        <Card>
          <h3 className="text-sm font-medium text-tertiary uppercase tracking-wide mb-4">Actions</h3>
          <div className="space-y-3">
            {/* REQUESTED: Confirm, Reschedule, Decline */}
            {(booking.status === 'REQUESTED' || booking.status === 'MODIFICATION_REQUESTED') && (
              <>
                <Button variant="primary" className="w-full" loading={actionLoading} onClick={() => doAction(() => api.admin.confirmBooking(id!), 'Réservation confirmée')}>
                  <CheckCircle className="h-4 w-4 mr-2" /> Confirmer
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => setShowReschedule(true)}>
                  <Calendar className="h-4 w-4 mr-2" /> Proposer un autre créneau
                </Button>
                <Button variant="danger" className="w-full" onClick={() => setShowDecline(true)}>
                  <XCircle className="h-4 w-4 mr-2" /> Refuser
                </Button>
              </>
            )}

            {/* CLIENT_CONFIRMED: Complete, No-show, Cancel */}
            {booking.status === 'CLIENT_CONFIRMED' && (
              <>
                <Button variant="primary" className="w-full" loading={actionLoading} onClick={() => doAction(() => api.admin.completeBooking(id!), 'Soin marqué comme terminé')}>
                  <CheckCircle className="h-4 w-4 mr-2" /> Marquer terminé
                </Button>
                <Button variant="secondary" className="w-full" loading={actionLoading} onClick={() => doAction(() => api.admin.noshowBooking(id!), 'Marqué no-show')}>
                  <XCircle className="h-4 w-4 mr-2" /> Marquer no-show
                </Button>
                <Button variant="danger" className="w-full" loading={actionLoading} onClick={() => doAction(() => api.admin.cancelBooking(id!), 'Réservation annulée')}>
                  <Ban className="h-4 w-4 mr-2" /> Annuler
                </Button>
              </>
            )}

            {/* EXPIRED_CLIENT: Resend */}
            {booking.status === 'EXPIRED_CLIENT' && (
              <Button variant="primary" className="w-full" loading={actionLoading} onClick={() => doAction(() => api.admin.resendBooking(id!), 'Relance envoyée au client')}>
                <RotateCcw className="h-4 w-4 mr-2" /> Relancer le client
              </Button>
            )}

            {/* MANAGER_CONFIRMED / MANAGER_RESCHEDULED: Cancel */}
            {(booking.status === 'MANAGER_CONFIRMED' || booking.status === 'MANAGER_RESCHEDULED') && (
              <Button variant="danger" className="w-full" loading={actionLoading} onClick={() => doAction(() => api.admin.cancelBooking(id!), 'Réservation annulée')}>
                <Ban className="h-4 w-4 mr-2" /> Annuler
              </Button>
            )}

            {/* No actions for terminal statuses */}
            {['COMPLETED', 'NO_SHOW', 'CANCELLED_CLIENT', 'CANCELLED_MANAGER', 'MANAGER_DECLINED', 'CLIENT_DECLINED_RESCHEDULE', 'EXPIRED_MANAGER'].includes(booking.status) && (
              <p className="text-tertiary text-sm text-center py-2">Aucune action disponible</p>
            )}
          </div>

          {/* Reschedule modal */}
          {showReschedule && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
              <h4 className="text-sm font-medium">Proposer un nouveau créneau</h4>
              <div className="flex gap-2">
                <input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <input type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  loading={actionLoading}
                  disabled={!rescheduleDate || !rescheduleTime}
                  onClick={() => {
                    const slot = `${rescheduleDate}T${rescheduleTime}:00.000Z`;
                    doAction(() => api.admin.rescheduleBooking(id!, slot), 'Contre-proposition envoyée');
                  }}
                >
                  Envoyer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowReschedule(false)}>Annuler</Button>
              </div>
            </div>
          )}

          {/* Decline modal */}
          {showDecline && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
              <h4 className="text-sm font-medium">Motif de refus</h4>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Motif (optionnel)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                rows={2}
              />
              <div className="flex gap-2">
                <Button variant="danger" size="sm" loading={actionLoading} onClick={() => doAction(() => api.admin.declineBooking(id!, declineReason), 'Demande refusée')}>
                  Confirmer le refus
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowDecline(false)}>Annuler</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-tertiary">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
