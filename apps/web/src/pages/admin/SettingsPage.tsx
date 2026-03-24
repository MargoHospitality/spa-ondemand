import { useState, useEffect, type FormEvent } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { api, ApiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Plus, Trash2 } from 'lucide-react';
import type { Property, Closure } from '@margo/shared';

const PROPERTY_ID = import.meta.env.VITE_PROPERTY_ID || '';

export default function SettingsPage() {
  const [property, setProperty] = useState<Property | null>(null);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state for property settings
  const [form, setForm] = useState({
    name: '',
    opening_time: '',
    closing_time: '',
    manager_response_delay_minutes: 60,
    manager_auto_fail_delay_minutes: 90,
    client_confirmation_delay_long: 24,
    client_confirmation_delay_24h: 2,
    microtransaction_amount: 1000,
  });

  // Closure form
  const [closureForm, setClosureForm] = useState({ label: '', start_at: '', end_at: '' });
  const [addingClosure, setAddingClosure] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [p, c] = await Promise.all([
        api.admin.getProperty(PROPERTY_ID),
        api.admin.getClosures(PROPERTY_ID),
      ]);
      setProperty(p);
      setClosures(c);
      setForm({
        name: p.name,
        opening_time: p.opening_time,
        closing_time: p.closing_time,
        manager_response_delay_minutes: p.manager_response_delay_minutes,
        manager_auto_fail_delay_minutes: p.manager_auto_fail_delay_minutes,
        client_confirmation_delay_long: p.client_confirmation_delay_long,
        client_confirmation_delay_24h: p.client_confirmation_delay_24h,
        microtransaction_amount: p.microtransaction_amount,
      });
    } catch {
      setError('Erreur chargement');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProperty(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.admin.updateProperty(PROPERTY_ID, form);
      setSuccess('Paramètres enregistrés');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddClosure(e: FormEvent) {
    e.preventDefault();
    try {
      await api.admin.createClosure({
        property_id: PROPERTY_ID,
        label: closureForm.label,
        start_at: new Date(closureForm.start_at).toISOString(),
        end_at: new Date(closureForm.end_at).toISOString(),
      });
      setClosureForm({ label: '', start_at: '', end_at: '' });
      setAddingClosure(false);
      const c = await api.admin.getClosures(PROPERTY_ID);
      setClosures(c);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  async function handleDeleteClosure(id: string) {
    if (!confirm('Supprimer cette fermeture ?')) return;
    try {
      await api.admin.deleteClosure(id);
      setClosures(closures.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  if (loading) return <p className="text-tertiary">Chargement...</p>;

  return (
    <div>
      <h1 className="text-3xl font-display font-semibold mb-6">Paramètres</h1>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {success && <Alert type="success" className="mb-4">{success}</Alert>}

      {/* General settings */}
      <Card className="mb-6">
        <h3 className="text-sm font-medium text-tertiary uppercase tracking-wide mb-4">Informations générales</h3>
        <form onSubmit={handleSaveProperty} className="space-y-4">
          <Input label="Nom de la propriété" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />

          <div className="grid grid-cols-2 gap-4">
            <Input label="Heure d'ouverture" type="time" value={form.opening_time} onChange={(e) => setForm({ ...form, opening_time: e.target.value })} required />
            <Input label="Heure de fermeture" type="time" value={form.closing_time} onChange={(e) => setForm({ ...form, closing_time: e.target.value })} required />
          </div>

          <h4 className="text-sm font-medium text-tertiary mt-6">Délais manager</h4>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Délai rappel (min)" type="number" value={String(form.manager_response_delay_minutes)} onChange={(e) => setForm({ ...form, manager_response_delay_minutes: parseInt(e.target.value) || 0 })} />
            <Input label="Délai auto-expiration (min)" type="number" value={String(form.manager_auto_fail_delay_minutes)} onChange={(e) => setForm({ ...form, manager_auto_fail_delay_minutes: parseInt(e.target.value) || 0 })} />
          </div>

          <h4 className="text-sm font-medium text-tertiary mt-6">Délais confirmation client</h4>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Soin > 48h (heures)" type="number" value={String(form.client_confirmation_delay_long)} onChange={(e) => setForm({ ...form, client_confirmation_delay_long: parseInt(e.target.value) || 0 })} />
            <Input label="Soin < 24h (heures)" type="number" value={String(form.client_confirmation_delay_24h)} onChange={(e) => setForm({ ...form, client_confirmation_delay_24h: parseInt(e.target.value) || 0 })} />
          </div>

          <h4 className="text-sm font-medium text-tertiary mt-6">Paiement</h4>
          <Input label="Montant microtransaction (centimes)" type="number" value={String(form.microtransaction_amount)} onChange={(e) => setForm({ ...form, microtransaction_amount: parseInt(e.target.value) || 0 })} />

          <Button type="submit" loading={saving}>Enregistrer</Button>
        </form>
      </Card>

      {/* Closures */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-tertiary uppercase tracking-wide">Fermetures exceptionnelles</h3>
          <Button size="sm" variant="secondary" onClick={() => setAddingClosure(!addingClosure)}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter
          </Button>
        </div>

        {addingClosure && (
          <form onSubmit={handleAddClosure} className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
            <Input label="Label" value={closureForm.label} onChange={(e) => setClosureForm({ ...closureForm, label: e.target.value })} required placeholder="Ex: Aïd al-Fitr" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Début" type="date" value={closureForm.start_at} onChange={(e) => setClosureForm({ ...closureForm, start_at: e.target.value })} required />
              <Input label="Fin" type="date" value={closureForm.end_at} onChange={(e) => setClosureForm({ ...closureForm, end_at: e.target.value })} required />
            </div>
            <Button type="submit" size="sm">Ajouter la fermeture</Button>
          </form>
        )}

        {closures.length === 0 ? (
          <p className="text-tertiary text-sm text-center py-4">Aucune fermeture programmée</p>
        ) : (
          <div className="space-y-2">
            {closures.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium text-sm">{c.label}</span>
                  <span className="text-tertiary text-xs ml-2">
                    {formatDate(c.start_at, 'fr')} — {formatDate(c.end_at, 'fr')}
                  </span>
                </div>
                <button onClick={() => handleDeleteClosure(c.id)} className="text-tertiary hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
