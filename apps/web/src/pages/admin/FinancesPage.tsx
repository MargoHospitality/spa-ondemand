import { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { api } from '../../lib/api';
import { formatPrice, formatDateTime } from '../../lib/format';
import { DollarSign, TrendingUp, ShoppingCart, UserX, XCircle, Download } from 'lucide-react';

const PROPERTY_ID = import.meta.env.VITE_PROPERTY_ID || '';

type Period = 'today' | 'week' | 'month' | 'custom';

interface FinancesData {
  caRealise: { total: number; count: number };
  caAVenir: { total: number; count: number };
  panierMoyen: number;
  noshows: { total: number; count: number };
  cancellations: { total: number; count: number };
  details: any[];
}

function getPeriodRange(period: Period, customFrom?: string, customTo?: string): { from: string; to: string } {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  switch (period) {
    case 'today':
      return { from: todayStart.toISOString(), to: todayEnd.toISOString() };
    case 'week': {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      return { from: weekStart.toISOString(), to: todayEnd.toISOString() };
    }
    case 'month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: monthStart.toISOString(), to: todayEnd.toISOString() };
    }
    case 'custom':
      return {
        from: customFrom ? `${customFrom}T00:00:00Z` : todayStart.toISOString(),
        to: customTo ? `${customTo}T23:59:59Z` : todayEnd.toISOString(),
      };
  }
}

export default function FinancesPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<FinancesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [period, customFrom, customTo]);

  async function loadData() {
    if (period === 'custom' && (!customFrom || !customTo)) return;
    setLoading(true);
    setError('');
    try {
      const range = getPeriodRange(period, customFrom, customTo);
      const result = await api.admin.getFinances({
        property_id: PROPERTY_ID,
        from: range.from,
        to: range.to,
      });
      setData(result);
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    const range = getPeriodRange(period, customFrom, customTo);
    const url = api.admin.getFinancesExportUrl({
      property_id: PROPERTY_ID,
      from: range.from,
      to: range.to,
    });
    window.open(url, '_blank');
  }

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: "Aujourd'hui" },
    { key: 'week', label: 'Cette semaine' },
    { key: 'month', label: 'Ce mois' },
    { key: 'custom', label: 'Personnalisé' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-display font-semibold">Finances</h1>
        <Button variant="secondary" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1" /> Exporter CSV
        </Button>
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      {/* Period pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {periods.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              period === key
                ? 'bg-primary text-white'
                : 'bg-white text-tertiary border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Custom period inputs */}
      {period === 'custom' && (
        <Card className="mb-4">
          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-tertiary mb-1">Du</label>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-tertiary mb-1">Au</label>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-tertiary text-center py-8">Chargement...</p>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <MetricCard
              icon={DollarSign}
              color="text-green-600 bg-green-50"
              label="CA réalisé"
              value={formatPrice(data.caRealise.total)}
              sub={`${data.caRealise.count} soins`}
            />
            <MetricCard
              icon={TrendingUp}
              color="text-blue-600 bg-blue-50"
              label="CA à venir"
              value={formatPrice(data.caAVenir.total)}
              sub={`${data.caAVenir.count} soins`}
            />
            <MetricCard
              icon={ShoppingCart}
              color="text-purple-600 bg-purple-50"
              label="Panier moyen"
              value={formatPrice(data.panierMoyen)}
              sub=""
            />
            <MetricCard
              icon={UserX}
              color="text-yellow-600 bg-yellow-50"
              label="No-shows"
              value={String(data.noshows.count)}
              sub={formatPrice(data.noshows.total)}
            />
            <MetricCard
              icon={XCircle}
              color="text-red-600 bg-red-50"
              label="Annulations"
              value={String(data.cancellations.count)}
              sub={formatPrice(data.cancellations.total)}
            />
          </div>

          {/* Detail table */}
          <Card>
            <h3 className="text-lg font-display font-semibold mb-4">Détail des soins réalisés</h3>
            {data.details.length === 0 ? (
              <p className="text-tertiary text-sm py-4 text-center">Aucun soin sur cette période</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 font-medium text-tertiary">Date</th>
                      <th className="text-left py-2 font-medium text-tertiary">Client</th>
                      <th className="text-left py-2 font-medium text-tertiary">Prestation</th>
                      <th className="text-left py-2 font-medium text-tertiary">Pers.</th>
                      <th className="text-left py-2 font-medium text-tertiary">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.details.map((row: any) => {
                      const total = ((row.services as any)?.price || 0) * (row.guest_count || 1);
                      return (
                        <tr key={row.id} className="border-b border-gray-50">
                          <td className="py-3 text-xs">{formatDateTime(row.completed_at || row.confirmed_slot, 'fr')}</td>
                          <td className="py-3 font-medium">{row.client_name}</td>
                          <td className="py-3">{(row.services as any)?.name_fr || '—'}</td>
                          <td className="py-3">{row.guest_count || 1}</td>
                          <td className="py-3 font-medium">{formatPrice(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ icon: Icon, color, label, value, sub }: {
  icon: any;
  color: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="flex flex-col items-start gap-2">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xl font-semibold">{value}</p>
        <p className="text-xs text-tertiary">{label}</p>
        {sub && <p className="text-xs text-tertiary">{sub}</p>}
      </div>
    </Card>
  );
}
