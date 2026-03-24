import { type ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarCheck, Sparkles, Users, Settings, LogOut, Menu, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/admin/bookings', icon: CalendarCheck, label: 'Demandes' },
  { to: '/admin/services', icon: Sparkles, label: 'Prestations' },
  { to: '/admin/users', icon: Users, label: 'Utilisateurs' },
  { to: '/admin/settings', icon: Settings, label: 'Paramètres' },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    localStorage.removeItem('sb-access-token');
    navigate('/admin/login');
  }

  const nav = (
    <nav className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-2 px-3 py-4 mb-4">
        <img src="/assets/logo-riad-elisa.png" alt="Logo" className="h-8 w-auto" />
        <span className="font-display text-lg font-semibold text-gray-900">Margo Spa</span>
      </div>
      {navItems.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive ? 'bg-primary/10 text-primary' : 'text-tertiary hover:bg-gray-100'
            }`
          }
          onClick={() => setSidebarOpen(false)}
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}
      <div className="mt-auto pt-4 border-t border-gray-200 mt-8">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-tertiary hover:bg-gray-100 w-full"
        >
          <LogOut className="h-5 w-5" />
          Déconnexion
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-gray-200">
        {nav}
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 w-64 bg-white z-50">
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 text-gray-500">
              <X className="h-5 w-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="lg:pl-64 flex-1">
        <header className="bg-white border-b border-gray-200 px-4 py-3 lg:hidden flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-500">
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-display text-lg font-semibold">Margo Spa</span>
        </header>
        <main className="p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
