import { useState, useEffect, type FormEvent } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Alert } from '../../components/ui/Alert';
import { api, ApiError } from '../../lib/api';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { USER_ROLES, type UserRole } from '@margo/shared';

const PROPERTY_ID = import.meta.env.VITE_PROPERTY_ID || '';

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone_whatsapp: string | null;
  role: UserRole;
  active: boolean;
}

const emptyUser = { name: '', email: '', phone_whatsapp: '', role: 'manager' as UserRole, active: true };

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyUser);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    try {
      const data = await api.admin.getUsers(PROPERTY_ID);
      setUsers(data);
    } catch {
      setError('Erreur chargement');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(u: UserRow) {
    setEditing(u);
    setCreating(false);
    setForm({
      name: u.name,
      email: u.email,
      phone_whatsapp: u.phone_whatsapp || '',
      role: u.role,
      active: u.active,
    });
    setPassword('');
  }

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setForm(emptyUser);
    setPassword('');
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
        phone_whatsapp: form.phone_whatsapp || null,
        ...(creating || password ? { password } : {}),
      };
      if (editing) {
        await api.admin.updateUser(editing.id, body);
      } else {
        await api.admin.createUser(body);
      }
      cancelEdit();
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    try {
      await api.admin.deleteUser(id);
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  const showForm = editing || creating;
  const roleLabels: Record<string, string> = { manager: 'Manager', admin: 'Admin', superadmin: 'Super Admin' };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-display font-semibold">Gestion des utilisateurs</h1>
        {!showForm && (
          <Button onClick={startCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Ajouter
          </Button>
        )}
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      {showForm && (
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">{editing ? 'Modifier' : 'Nouvel utilisateur'}</h3>
            <button onClick={cancelEdit} className="text-tertiary hover:text-gray-900"><X className="h-5 w-5" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <Input label="WhatsApp" type="tel" value={form.phone_whatsapp} onChange={(e) => setForm({ ...form, phone_whatsapp: e.target.value })} />
            <Select
              label="Rôle"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              options={USER_ROLES.map((r) => ({ value: r, label: roleLabels[r] }))}
              required
            />
            <Input
              label={editing ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe'}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={creating}
            />
            <div className="flex items-center gap-2">
              <input type="checkbox" id="user-active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
              <label htmlFor="user-active" className="text-sm">Actif</label>
            </div>
            <Button type="submit" loading={saving}>{editing ? 'Enregistrer' : 'Créer'}</Button>
          </form>
        </Card>
      )}

      <Card>
        {loading ? (
          <p className="text-tertiary text-sm text-center py-4">Chargement...</p>
        ) : users.length === 0 ? (
          <p className="text-tertiary text-sm text-center py-4">Aucun utilisateur</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 font-medium text-tertiary">Nom</th>
                  <th className="text-left py-2 font-medium text-tertiary">Email</th>
                  <th className="text-left py-2 font-medium text-tertiary">WhatsApp</th>
                  <th className="text-left py-2 font-medium text-tertiary">Rôle</th>
                  <th className="text-left py-2 font-medium text-tertiary">Actif</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50">
                    <td className="py-3 font-medium">{u.name}</td>
                    <td className="py-3">{u.email}</td>
                    <td className="py-3">{u.phone_whatsapp || '—'}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        u.role === 'superadmin' ? 'bg-purple-100 text-purple-800' :
                        u.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>{roleLabels[u.role]}</span>
                    </td>
                    <td className="py-3">
                      <span className={`inline-block w-2 h-2 rounded-full ${u.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(u)} className="text-tertiary hover:text-primary"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(u.id)} className="text-tertiary hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
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
