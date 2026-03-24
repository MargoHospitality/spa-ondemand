import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Alert } from '../../components/ui/Alert';
import { api, ApiError } from '../../lib/api';
import { formatDateTime, formatPrice, getServiceName } from '../../lib/format';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { BOOKING_STATUSES, type BookingStatus } from '@margo/shared';

const PROPERTY_ID = import.meta.env.VITE_PROPERTY_ID || '';
const PAGE_SIZE = 20;

interface BookingRow {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  status: BookingStatus;
  requested_slot: string;
  confirmed_slot: string | null;
  created_at: string;
  services: { name_fr: string; name_en: string; price: number; duration_minutes: number };
}

export default function BookingsPage() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    loadBookings();
  }, [offset, statusFilter, dateFrom, dateTo]);

  async function loadBookings() {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        property_id: PROPERTY_ID,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      };
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.from = `${dateFrom}T00:00:00Z`;
      if (dateTo) params.to = `${dateTo}T23:59:59Z`;

      const result = await api.admin.getBookings(params) as any;
      // The API returns { data, count } when called from the bookings list endpoint
      if (Array.isArray(result)) {
        setBookings(result);
      } else {
        setBookings(result.data || result || []);
        if (result.count != null) setCount(result.count);
      }
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-display font-semibold mb-6">Gestion des demandes</h1>

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-tertiary mb-1">Statut</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">Tous</option>
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-tertiary mb-1">Du</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-tertiary mb-1">Au</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {loading ? (
          <p className="text-tertiary py-4 text-center text-sm">Chargement...</p>
        ) : bookings.length === 0 ? (
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
                    <th className="text-left py-2 font-medium text-tertiary">Statut</th>
                    <th className="text-left py-2 font-medium text-tertiary">Créé</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer" onClick={() => navigate(`/admin/bookings/${b.id}`)}>
                      <td className="py-3">
                        <div className="font-medium">{b.client_name}</div>
                        <div className="text-xs text-tertiary">{b.client_email}</div>
                      </td>
                      <td className="py-3">{b.services?.name_fr || '—'}</td>
                      <td className="py-3">{formatDateTime(b.confirmed_slot || b.requested_slot, 'fr')}</td>
                      <td className="py-3"><StatusBadge status={b.status} /></td>
                      <td className="py-3 text-xs text-tertiary">{formatDateTime(b.created_at, 'fr')}</td>
                      <td className="py-3">
                        <Eye className="h-4 w-4 text-tertiary" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-4">
              <span className="text-xs text-tertiary">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, count || bookings.length)} sur {count || bookings.length}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= (count || bookings.length)}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
