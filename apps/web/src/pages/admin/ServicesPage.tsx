import { useState, useEffect, type FormEvent } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { api, ApiError } from '../../lib/api';
import { formatPrice, formatDuration } from '../../lib/format';
import { Plus, Pencil, Trash2, X } from 'lucide-react';

const PROPERTY_ID = import.meta.env.VITE_PROPERTY_ID || '';

interface ServiceRow {
  id: string;
  name_fr: string;
  name_en: string;
  description_fr: string | null;
  description_en: string | null;
  duration_minutes: number;
  price: number;
  display_order: number;
  active: boolean;
  category?: string;
}

const emptyService = {
  name_fr: '', name_en: '', description_fr: '', description_en: '',
  duration_minutes: 60, price: 0, display_order: 0, active: true, category: '',
};

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyService);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadServices(); }, []);

  async function loadServices() {
    try {
      const data = await api.admin.getServices(PROPERTY_ID);
      setServices(data);
    } catch {
      setError('Erreur chargement');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(s: ServiceRow) {
    setEditing(s);
    setCreating(false);
    setForm({
      name_fr: s.name_fr,
      name_en: s.name_en,
      description_fr: s.description_fr || '',
      description_en: s.description_en || '',
      duration_minutes: s.duration_minutes,
      price: s.price,
      display_order: s.display_order,
      active: s.active,
      category: (s as any).category || '',
    });
  }

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setForm(emptyService);
  }

  function cancelEdit() {
    setEditing(null);
    setCreating(false);
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        property_id: PROPERTY_ID,
        ...form,
        description_fr: form.description_fr || null,
        description_en: form.description_en || null,
      };
      if (editing) {
        await api.admin.updateService(editing.id, body);
      } else {
        await api.admin.createService(body);
      }
      cancelEdit();
      await loadServices();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette prestation ?')) return;
    try {
      await api.admin.deleteService(id);
      await loadServices();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  const showForm = editing || creating;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-display font-semibold">Catalogue des prestations</h1>
        {!showForm && (
          <Button onClick={startCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Ajouter
          </Button>
        )}
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      {/* Form */}
      {showForm && (
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">{editing ? 'Modifier' : 'Nouvelle prestation'}</h3>
            <button onClick={cancelEdit} className="text-tertiary hover:text-gray-900"><X className="h-5 w-5" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Nom (FR)" value={form.name_fr} onChange={(e) => setForm({ ...form, name_fr: e.target.value })} required />
              <Input label="Nom (EN)" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (FR)</label>
                <textarea value={form.description_fr} onChange={(e) => setForm({ ...form, description_fr: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (EN)</label>
                <textarea value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Durée (min)" type="number" value={String(form.duration_minutes)} onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 0 })} required />
              <Input label="Prix (centimes)" type="number" value={String(form.price)} onChange={(e) => setForm({ ...form, price: parseInt(e.target.value) || 0 })} required />
              <Input label="Ordre d'affichage" type="number" value={String(form.display_order)} onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
              <label htmlFor="active" className="text-sm">Actif</label>
            </div>
            <Button type="submit" loading={saving}>{editing ? 'Enregistrer' : 'Créer'}</Button>
          </form>
        </Card>
      )}

      {/* Table */}
      <Card>
        {loading ? (
          <p className="text-tertiary text-sm text-center py-4">Chargement...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 font-medium text-tertiary">#</th>
                  <th className="text-left py-2 font-medium text-tertiary">Nom</th>
                  <th className="text-left py-2 font-medium text-tertiary">Durée</th>
                  <th className="text-left py-2 font-medium text-tertiary">Prix</th>
                  <th className="text-left py-2 font-medium text-tertiary">Actif</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50">
                    <td className="py-3 text-tertiary">{s.display_order}</td>
                    <td className="py-3">
                      <div className="font-medium">{s.name_fr}</div>
                      <div className="text-xs text-tertiary">{s.name_en}</div>
                    </td>
                    <td className="py-3">{s.duration_minutes ? formatDuration(s.duration_minutes) : '—'}</td>
                    <td className="py-3">{formatPrice(s.price)}</td>
                    <td className="py-3">
                      <span className={`inline-block w-2 h-2 rounded-full ${s.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(s)} className="text-tertiary hover:text-primary"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(s.id)} className="text-tertiary hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
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
