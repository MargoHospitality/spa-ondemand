import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Alert } from '../../components/ui/Alert';
import { api, ApiError } from '../../lib/api';
import { formatTime, formatPrice, formatDateTime } from '../../lib/format';
import { Calendar, Inbox, Clock, DollarSign, CheckCircle, XCircle, ArrowRight } from 'lucide-react';

const PROPERTY_ID = import.meta.env.VITE_PROPERTY_ID || '';

interface DashboardData {
  todaySoins: any[];
  toProcess: any[];
  toConfirmRealisation: any[];
  finances: {
    today: { total: number; count: number };
    week: { total: number; count: number };
    month: { total: number; count: number };
  };
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const result = await api.admin.getDashboardStats(PROPERTY_ID);
      setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(id: string, action: 'complete' | 'noshow') {
    setActionLoading(id);
    setSuccess('');
    try {
      if (action === 'complete') {
        await api.admin.completeBooking(id);
      } else {
        await api.admin.noshowBooking(id);
      }
      setSuccess(`Action effectuée`);
      loadData();
    } catch (err) {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) return <p className="text-tertiary">Chargement...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-display font-semibold">Tableau de bord</h1>

      {success && <Alert type="success">{success}</Alert>}

      {/* Section 1: Soins du jour */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <Calendar className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-display font-semibold">Soins du jour</h2>
          {data?.todaySoins && data.todaySoins.length > 0 && (
            <span className="ml-auto text-sm font-medium bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full">
              {data.todaySoins.length}
            </span>
          )}
        </div>
        {!data?.todaySoins?.length ? (
          <p className="text-tertiary text-sm py-2 text-center">Aucun soin programmé aujourd'hui</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 font-medium text-tertiary">Heure</th>
                  <th className="text-left py-2 font-medium text-tertiary">Client</th>
                  <th className="text-left py-2 font-medium text-tertiary">Prestation</th>
                  <th className="text-left py-2 font-medium text-tertiary">Pers.</th>
                </tr>
              </thead>
              <tbody>
                {data.todaySoins.map((b: any) => (
                  <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer" onClick={() => navigate(`/admin/bookings/${b.id}`)}>
                    <td className="py-3 font-medium text-blue-600">{formatTime(b.confirmed_slot)}</td>
                    <td className="py-3 font-medium">{b.client_name}</td>
                    <td className="py-3">{b.services?.name_fr || '—'}</td>
                    <td className="py-3">{b.guest_count || 1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Section 2: A traiter */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
            <Inbox className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-display font-semibold">À traiter</h2>
          {data?.toProcess && data.toProcess.length > 0 && (
            <span className="ml-auto text-sm font-medium bg-orange-100 text-orange-700 px-2.5 py-0.5 rounded-full">
              {data.toProcess.length}
            </span>
          )}
        </div>
        {!data?.toProcess?.length ? (
          <p className="text-tertiary text-sm py-2 text-center">Aucune demande en attente</p>
        ) : (
          <div className="space-y-3">
            {data.toProcess.map((b: any) => (
              <div
                key={b.id}
                className="flex items-center gap-4 p-3 rounded-lg border border-gray-100 hover:border-gray-200 cursor-pointer"
                onClick={() => navigate(`/admin/bookings/${b.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{b.client_name}</span>
                    <StatusBadge status={b._type || 'REQUESTED'} />
                  </div>
                  <div className="text-xs text-tertiary mt-0.5">
                    {b.services?.name_fr || '—'} · {formatDateTime(b.requested_slot || b.confirmed_slot, 'fr')}
                  </div>
                </div>
                {b._type === 'REQUESTED' && b.manager_token_expires_at && (
                  <div className="text-xs text-orange-600 font-medium whitespace-nowrap">
                    Expire: {formatTime(b.manager_token_expires_at)}
                  </div>
                )}
                {b._type === 'EXPIRED_CLIENT' && (
                  <span className="text-xs text-red-500 font-medium">Expiré</span>
                )}
                <ArrowRight className="h-4 w-4 text-tertiary shrink-0" />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Section 3: Realisation a confirmer */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
            <Clock className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-display font-semibold">Réalisation à confirmer</h2>
          {data?.toConfirmRealisation && data.toConfirmRealisation.length > 0 && (
            <span className="ml-auto text-sm font-medium bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full">
              {data.toConfirmRealisation.length}
            </span>
          )}
        </div>
        {!data?.toConfirmRealisation?.length ? (
          <p className="text-tertiary text-sm py-2 text-center">Aucun soin à confirmer</p>
        ) : (
          <div className="space-y-3">
            {data.toConfirmRealisation.map((b: any) => (
              <div key={b.id} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{b.client_name}</div>
                  <div className="text-xs text-tertiary mt-0.5">
                    {b.services?.name_fr || '—'} · {formatDateTime(b.confirmed_slot, 'fr')} · {b.guest_count || 1} pers.
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="primary"
                    loading={actionLoading === b.id}
                    onClick={(e) => { e.stopPropagation(); handleAction(b.id, 'complete'); }}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Effectué
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={actionLoading === b.id}
                    onClick={(e) => { e.stopPropagation(); handleAction(b.id, 'noshow'); }}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    No-show
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Section 4: Apercu financier */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-green-50 text-green-600">
            <DollarSign className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-display font-semibold">Aperçu financier</h2>
        </div>
        {data?.finances ? (
          <div className="space-y-3">
            <FinanceRow
              label="Aujourd'hui"
              amount={data.finances.today.total}
              count={data.finances.today.count}
            />
            <FinanceRow
              label="Cette semaine"
              amount={data.finances.week.total}
              count={data.finances.week.count}
            />
            <FinanceRow
              label="Ce mois"
              amount={data.finances.month.total}
              count={data.finances.month.count}
            />
            <div className="pt-3 border-t border-gray-100">
              <button
                onClick={() => navigate('/admin/finances')}
                className="text-sm text-primary font-medium hover:underline flex items-center gap-1"
              >
                Voir détails <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <p className="text-tertiary text-sm py-2 text-center">Aucune donnée financière</p>
        )}
      </Card>
    </div>
  );
}

function FinanceRow({ label, amount, count }: { label: string; amount: number; count: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-tertiary">{label}</span>
      <div className="text-right">
        <span className="font-semibold text-lg">{formatPrice(amount)}</span>
        <span className="text-tertiary text-xs ml-2">({count} soins)</span>
      </div>
    </div>
  );
}
