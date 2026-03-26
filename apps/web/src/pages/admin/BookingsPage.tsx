import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Alert } from '../../components/ui/Alert';
import { api, ApiError } from '../../lib/api';
import { formatDateTime, formatPrice } from '../../lib/format';
import { ChevronLeft, ChevronRight, Eye, Search } from 'lucide-react';
import { BOOKING_STATUSES, type BookingStatus } from '@margo/shared';

const PROPERTY_ID = import.meta.env.VITE_PROPERTY_ID || '';
const PAGE_SIZE = 20;

type PillFilter = 'toProcess' | 'today' | 'confirmed' | 'history' | 'all';

const HISTORY_STATUSES: BookingStatus[] = ['COMPLETED', 'NO_SHOW', 'CANCELLED_CLIENT', 'CANCELLED_MANAGER', 'EXPIRED_MANAGER', 'EXPIRED_CLIENT', 'MANAGER_DECLINED', 'CLIENT_DECLINED_RESCHEDULE'];

interface BookingRow {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  status: BookingStatus;
  requested_slot: string;
  confirmed_slot: string | null;
  guest_count: number;
  created_at: string;
  updated_at: string;
  services: { name_fr: string; name_en: string; price: number; duration_minutes: number };
}

export default function BookingsPage() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activePill, setActivePill] = useState<PillFilter>('toProcess');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [historyPeriod, setHistoryPeriod] = useState<'week' | 'month' | '3months'>('month');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Load pill counts
  useEffect(() => {
    api.admin.getBookingCounts(PROPERTY_ID)
      .then((data: any) => setCounts(data))
      .catch(() => {});
  }, [success]);

  // Load bookings when filter changes
  useEffect(() => {
    loadBookings();
  }, [offset, activePill, historyPeriod]);

  async function loadBookings() {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        property_id: PROPERTY_ID,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      };

      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

      switch (activePill) {
        case 'toProcess':
          // REQUESTED + recent EXPIRED_CLIENT — we'll filter client-side for EXPIRED_CLIENT
          params.status = 'REQUESTED';
          break;
        case 'today':
          params.status = 'CLIENT_CONFIRMED';
          params.from = todayStart.toISOString();
          params.to = todayEnd.toISOString();
          break;
        case 'confirmed':
          params.status = 'CLIENT_CONFIRMED';
          break;
        case 'history': {
          const periodStart = new Date(now);
          if (historyPeriod === 'week') periodStart.setDate(periodStart.getDate() - 7);
          else if (historyPeriod === 'month') periodStart.setMonth(periodStart.getMonth() - 1);
          else periodStart.setMonth(periodStart.getMonth() - 3);
          params.created_from = periodStart.toISOString();
          break;
        }
        case 'all':
          break;
      }

      const result = await api.admin.getBookings(params) as any;
      let rows: BookingRow[] = [];
      if (Array.isArray(result)) {
        rows = result;
      } else {
        rows = result.data || result || [];
        if (result.count != null) setCount(result.count);
      }

      // For toProcess, also fetch EXPIRED_CLIENT
      if (activePill === 'toProcess') {
        const expiredCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        const expiredResult = await api.admin.getBookings({
          property_id: PROPERTY_ID,
          status: 'EXPIRED_CLIENT',
          created_from: expiredCutoff.toISOString(),
          limit: '50',
          offset: '0',
        }) as any;
        const expiredRows = Array.isArray(expiredResult) ? expiredResult : (expiredResult.data || []);
        rows = [...rows, ...expiredRows];
        setCount(rows.length);
      }

      // For history, filter to terminal statuses
      if (activePill === 'history') {
        rows = rows.filter((b) => HISTORY_STATUSES.includes(b.status));
        setCount(rows.length);
      }

      setBookings(rows);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }

  // Client-side search filter
  const filteredBookings = useMemo(() => {
    if (!searchQuery.trim()) return bookings;
    const q = searchQuery.toLowerCase();
    return bookings.filter(
      (b) =>
        b.client_name?.toLowerCase().includes(q) ||
        b.client_email?.toLowerCase().includes(q) ||
        b.client_phone?.includes(q),
    );
  }, [bookings, searchQuery]);

  async function handleAction(id: string, action: string, extra?: any) {
    setActionLoading(id);
    setError('');
    setSuccess('');
    try {
      switch (action) {
        case 'confirm': await api.admin.confirmBooking(id); break;
        case 'decline': await api.admin.declineBooking(id, extra?.reason); break;
        case 'cancel': await api.admin.cancelBooking(id); break;
        case 'resend': await api.admin.resendBooking(id); break;
        case 'complete': await api.admin.completeBooking(id); break;
        case 'noshow': await api.admin.noshowBooking(id); break;
      }
      setSuccess('Action effectuée');
      loadBookings();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setActionLoading(null);
    }
  }

  const pills: { key: PillFilter; label: string; count?: number }[] = [
    { key: 'toProcess', label: 'À traiter', count: counts.toProcess },
    { key: 'today', label: "Aujourd'hui", count: counts.today },
    { key: 'confirmed', label: 'Confirmées', count: counts.confirmed },
    { key: 'history', label: 'Historique' },
    { key: 'all', label: 'Tout', count: counts.all },
  ];

  return (
    <div>
      <h1 className="text-3xl font-display font-semibold mb-6">Gestion des demandes</h1>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {success && <Alert type="success" className="mb-4">{success}</Alert>}

      {/* Pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {pills.map(({ key, label, count: c }) => (
          <button
            key={key}
            onClick={() => { setActivePill(key); setOffset(0); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activePill === key
                ? 'bg-primary text-white'
                : 'bg-white text-tertiary border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
            {c != null && c > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                activePill === key ? 'bg-white/20' : 'bg-gray-100'
              }`}>
                {c}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* History period + search */}
      {(activePill === 'history' || activePill === 'all') && (
        <Card className="mb-4">
          <div className="flex flex-wrap gap-4 items-center">
            {activePill === 'history' && (
              <div className="flex gap-2">
                {(['week', 'month', '3months'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setHistoryPeriod(p); setOffset(0); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                      historyPeriod === p ? 'bg-primary/10 text-primary' : 'text-tertiary hover:bg-gray-100'
                    }`}
                  >
                    {p === 'week' ? 'Semaine' : p === 'month' ? 'Mois' : '3 mois'}
                  </button>
                ))}
              </div>
            )}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tertiary" />
              <input
                type="text"
                placeholder="Rechercher un client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card>
        {loading ? (
          <p className="text-tertiary py-4 text-center text-sm">Chargement...</p>
        ) : filteredBookings.length === 0 ? (
          <p className="text-tertiary py-4 text-center text-sm">Aucune demande trouvée</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 font-medium text-tertiary">Client</th>
                    <th className="text-left py-2 font-medium text-tertiary">Prestation</th>
                    <th className="text-left py-2 font-medium text-tertiary">Créneau</th>
                    <th className="text-left py-2 font-medium text-tertiary">Prix</th>
                    <th className="text-left py-2 font-medium text-tertiary">Statut</th>
                    <th className="text-left py-2 font-medium text-tertiary">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((b) => {
                    const total = (b.services?.price || 0) * (b.guest_count || 1);
                    return (
                      <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-3 cursor-pointer" onClick={() => navigate(`/admin/bookings/${b.id}`)}>
                          <div className="font-medium">{b.client_name}</div>
                          <div className="text-xs text-tertiary">{b.client_email}</div>
                        </td>
                        <td className="py-3">
                          {b.services?.name_fr || '—'}
                          {b.guest_count > 1 && <span className="text-xs text-tertiary ml-1">x{b.guest_count}</span>}
                        </td>
                        <td className="py-3 text-xs">{formatDateTime(b.confirmed_slot || b.requested_slot, 'fr')}</td>
                        <td className="py-3 font-medium">{formatPrice(total)}</td>
                        <td className="py-3"><StatusBadge status={b.status} /></td>
                        <td className="py-3">
                          <div className="flex gap-1 flex-wrap">
                            {b.status === 'REQUESTED' && (
                              <>
                                <Button size="sm" variant="primary" loading={actionLoading === b.id} onClick={(e) => { e.stopPropagation(); handleAction(b.id, 'confirm'); }}>
                                  Confirmer
                                </Button>
                                <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/admin/bookings/${b.id}`); }}>
                                  Détails
                                </Button>
                              </>
                            )}
                            {b.status === 'CLIENT_CONFIRMED' && (
                              <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/admin/bookings/${b.id}`); }}>
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                Voir
                              </Button>
                            )}
                            {b.status === 'EXPIRED_CLIENT' && (
                              <Button size="sm" variant="primary" loading={actionLoading === b.id} onClick={(e) => { e.stopPropagation(); handleAction(b.id, 'resend'); }}>
                                Relancer
                              </Button>
                            )}
                            {!['REQUESTED', 'CLIENT_CONFIRMED', 'EXPIRED_CLIENT'].includes(b.status) && (
                              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/admin/bookings/${b.id}`); }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {activePill !== 'toProcess' && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-4">
                <span className="text-xs text-tertiary">
                  {offset + 1}–{Math.min(offset + PAGE_SIZE, count || filteredBookings.length)} sur {count || filteredBookings.length}
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" disabled={offset + PAGE_SIZE >= (count || filteredBookings.length)} onClick={() => setOffset(offset + PAGE_SIZE)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
