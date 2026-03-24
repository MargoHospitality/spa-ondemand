import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LocaleContext, type Locale } from './lib/i18n';
import { AuthGuard } from './components/AuthGuard';
import { AdminLayout } from './components/layout/AdminLayout';

// Pages
import BookingRequestPage from './pages/BookingRequestPage';
import ConfirmationPage from './pages/ConfirmationPage';
import ManageBookingPage from './pages/ManageBookingPage';
import ManagerBookingPage from './pages/ManagerBookingPage';
import LoginPage from './pages/admin/LoginPage';
import DashboardPage from './pages/admin/DashboardPage';
import BookingsPage from './pages/admin/BookingsPage';
import BookingDetailPage from './pages/admin/BookingDetailPage';
import ServicesPage from './pages/admin/ServicesPage';
import UsersPage from './pages/admin/UsersPage';
import SettingsPage from './pages/admin/SettingsPage';

import './index.css';

function App() {
  const [locale, setLocale] = useState<Locale>('fr');

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <BrowserRouter>
        <Routes>
          {/* Public client-facing pages */}
          <Route path="/:slug/request" element={<BookingRequestPage />} />
          <Route path="/confirm/:token" element={<ConfirmationPage />} />
          <Route path="/manage/:token" element={<ManageBookingPage />} />

          {/* Manager tokenized page */}
          <Route path="/manager/booking/:token" element={<ManagerBookingPage />} />

          {/* Admin login */}
          <Route path="/admin/login" element={<LoginPage />} />

          {/* Admin back-office (authenticated) */}
          <Route
            path="/admin/*"
            element={
              <AuthGuard>
                <AdminLayout>
                  <Routes>
                    <Route index element={<DashboardPage />} />
                    <Route path="bookings" element={<BookingsPage />} />
                    <Route path="bookings/:id" element={<BookingDetailPage />} />
                    <Route path="services" element={<ServicesPage />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Routes>
                </AdminLayout>
              </AuthGuard>
            }
          />
        </Routes>
      </BrowserRouter>
    </LocaleContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
