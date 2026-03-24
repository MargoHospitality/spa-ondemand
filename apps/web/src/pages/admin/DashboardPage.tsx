import { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { api } from '../../lib/api';
import { formatDateTime, formatPrice, getServiceName } from '../../lib/format';
import { CalendarCheck, Clock, CheckCircle, XCircle, AlertTriangle, TrendingUp } from 'lucide-react';
import type { BookingStatus } from '@margo/shared';

interface DashboardStats {
  today: number;
  week: number;
  month: number;
  confirmed: number;
  declined: number;
  noshow: number;
  avgResponseMinutes: number;
  confirmRate: number;
}

interface BookingRow {
  id: string;
  client_name: string;
  status: BookingStatus;
  requested_slot: string;
  created_at: string;
  services: { name_fr: string; name_en: string; price: number; duration_minutes: number };
}

// Hardcoded property ID for now (single-tenant V1)
const PROPERTY_ID = import.meta.env.VITE_PROPERTY_ID || '';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayBookings, setTodayBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [statsData, bookingsData] = await Promise.all([
        api.admin.getDashboardStats(PROPERTY_ID).catch(() => null),
        api.admin.getBookings({
          property_id: PROPERTY_ID,
          from: new Date().toISOString().split('T')[0] + 'T00:00:00Z',
          to: new Date().toISOString().split('T')[0] + 'T23:59:59Z',
          limit: '50',
          offset: '0',
        }).catch(() => []),
      ]);
      if (statsData) setStats(statsData);
      if (Array.isArray(bookingsData)) setTodayBookings(bookingsData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  const kpis = stats ? [
    { label: "Demandes du jour", value: stats.today, icon: CalendarCheck, color: 'text-blue-600 bg-blue-50' },
    { label: "Cette semaine", value: stats.week, icon: TrendingUp, color: 'text-primary bg-primary/10' },
    { label: "Confirmées", value: stats.confirmed, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
    { label: "Refusées", value: stats.declined, icon: XCircle, color: 'text-red-600 bg-red-50' },
    { label: "No-show", value: stats.noshow, icon: AlertTriangle, color: 'text-yellow-600 bg-yellow-50' },
    { label: "Délai moyen réponse", value: stats.avgResponseMinutes ? `${stats.avgResponseMinutes} min` : '—', icon: Clock, color: 'text-purple-600 bg-purple-50' },
  ] : [];

  return (
    <div>
      <h1 className="text-3xl font-display font-semibold mb-6">Tableau de bord</h1>

      {loading && <p className="text-tertiary">Chargement...</p>}

      {/* KPI cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {kpis.map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{value}</p>
                <p className="text-xs text-tertiary">{label}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {stats && stats.confirmRate > 0 && (
        <Card className="mb-8">
          <h3 className="text-sm font-medium text-tertiary mb-3">Taux de confirmation client</h3>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-gray-200 rounded-full h-3">
              <div
                className="bg-primary rounded-full h-3 transition-all"
                style={{ width: `${Math.min(100, stats.confirmRate)}%` }}
              />
            </div>
            <span className="text-lg font-semibold">{stats.confirmRate.toFixed(0)}%</span>
          </div>
        </Card>
      )}

      {/* Today's bookings */}
      <Card>
        <h3 className="text-lg font-display font-semibold mb-4">Demandes du jour</h3>
        {todayBookings.length === 0 ? (
          <p className="text-tertiary text-sm py-4 text-center">Aucune demande aujourd'hui</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 font-medium text-tertiary">Client</th>
                  <th className="text-left py-2 font-medium text-tertiary">Prestation</th>
                  <th className="text-left py-2 font-medium text-tertiary">Créneau</th>
                  <th className="text-left py-2 font-medium text-tertiary">Statut</th>
                </tr>
              </thead>
              <tbody>
                {todayBookings.map((b) => (
                  <tr key={b.id} className="border-b border-gray-50">
                    <td className="py-3 font-medium">{b.client_name}</td>
                    <td className="py-3">{b.services?.name_fr || '—'}</td>
                    <td className="py-3">{formatDateTime(b.requested_slot, 'fr')}</td>
                    <td className="py-3"><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
