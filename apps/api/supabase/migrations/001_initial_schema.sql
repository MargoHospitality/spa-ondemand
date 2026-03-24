-- ============================================================
-- Margo Spa Booking — Initial Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUM types ───

CREATE TYPE booking_status AS ENUM (
  'REQUESTED',
  'MANAGER_CONFIRMED',
  'MANAGER_RESCHEDULED',
  'MANAGER_DECLINED',
  'CLIENT_DECLINED_RESCHEDULE',
  'CLIENT_CONFIRMED',
  'EXPIRED_MANAGER',
  'EXPIRED_CLIENT',
  'MODIFICATION_REQUESTED',
  'CANCELLED_CLIENT',
  'CANCELLED_MANAGER',
  'COMPLETED',
  'NO_SHOW'
);

CREATE TYPE user_role AS ENUM ('manager', 'admin', 'superadmin');
CREATE TYPE notification_channel AS ENUM ('whatsapp', 'email');
CREATE TYPE notification_recipient AS ENUM ('client', 'manager');
CREATE TYPE notification_status AS ENUM ('sent', 'failed', 'delivered');
CREATE TYPE client_source AS ENUM ('social_media', 'recommendation', 'website', 'other');

-- ─── Properties ───

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#000000',
  secondary_color TEXT NOT NULL DEFAULT '#ffffff',
  opening_time TIME NOT NULL DEFAULT '09:00',
  closing_time TIME NOT NULL DEFAULT '20:00',
  manager_response_delay_minutes INT NOT NULL DEFAULT 60,
  manager_auto_fail_delay_minutes INT NOT NULL DEFAULT 90,
  client_confirmation_delay_24h INT NOT NULL DEFAULT 2,       -- hours (slot < 24h)
  client_confirmation_delay_48h TEXT NOT NULL DEFAULT 'end_of_day', -- slot 24-48h
  client_confirmation_delay_long INT NOT NULL DEFAULT 24,     -- hours (slot > 48h)
  microtransaction_amount INT NOT NULL DEFAULT 1000,          -- centimes (10.00 MAD)
  twilio_whatsapp_number TEXT,
  stripe_account_id TEXT,
  locale_default TEXT NOT NULL DEFAULT 'fr',
  locales_available TEXT[] NOT NULL DEFAULT '{fr,en}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Services (spa treatments catalog) ───

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name_fr TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_fr TEXT,
  description_en TEXT,
  duration_minutes INT NOT NULL,
  price INT NOT NULL,              -- centimes
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_services_property ON services(property_id);

-- ─── Users (managers / admins) ───

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE,            -- Supabase Auth user id
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_whatsapp TEXT,
  role user_role NOT NULL DEFAULT 'manager',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_property ON users(property_id);
CREATE INDEX idx_users_auth_id ON users(auth_id);

-- ─── Bookings ───

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id),
  service_id UUID NOT NULL REFERENCES services(id),
  manager_id UUID REFERENCES users(id),

  -- Client info
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_locale TEXT NOT NULL DEFAULT 'fr',
  client_origin_property TEXT,
  client_source client_source,
  client_message TEXT,

  -- Slots
  requested_slot TIMESTAMPTZ NOT NULL,
  confirmed_slot TIMESTAMPTZ,

  -- Status
  status booking_status NOT NULL DEFAULT 'REQUESTED',

  -- Tokens
  manager_token TEXT,
  manager_token_expires_at TIMESTAMPTZ,
  client_token TEXT,
  client_token_expires_at TIMESTAMPTZ,

  -- Stripe
  stripe_payment_method_id TEXT,
  stripe_customer_id TEXT,
  stripe_charge_id TEXT,
  stripe_charge_status TEXT,
  microtransaction_amount INT NOT NULL DEFAULT 1000,

  -- Transition timestamps (analytics)
  requested_at TIMESTAMPTZ,
  manager_notified_at TIMESTAMPTZ,
  manager_responded_at TIMESTAMPTZ,
  client_notified_at TIMESTAMPTZ,
  client_confirmed_at TIMESTAMPTZ,
  reminder_48h_sent_at TIMESTAMPTZ,
  reminder_4h_sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancellation_by TEXT,
  completed_at TIMESTAMPTZ,

  -- Flags
  policy_override_by_manager BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_property ON bookings(property_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_requested_slot ON bookings(requested_slot);
CREATE INDEX idx_bookings_client_email ON bookings(client_email);
CREATE INDEX idx_bookings_client_phone ON bookings(client_phone);
CREATE INDEX idx_bookings_manager_token ON bookings(manager_token) WHERE manager_token IS NOT NULL;
CREATE INDEX idx_bookings_client_token ON bookings(client_token) WHERE client_token IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─── Notifications log ───

CREATE TABLE notifications_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL,
  recipient notification_recipient NOT NULL,
  event_type TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'fr',
  status notification_status NOT NULL DEFAULT 'sent',
  twilio_sid TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_booking ON notifications_log(booking_id);
-- Idempotency: one notification per booking per event_type per channel
CREATE UNIQUE INDEX idx_notifications_idempotent
  ON notifications_log(booking_id, event_type, channel);

-- ─── Closures (exceptional closing periods) ───

CREATE TABLE closures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT closures_valid_range CHECK (end_at > start_at)
);

CREATE INDEX idx_closures_property ON closures(property_id);
CREATE INDEX idx_closures_dates ON closures(start_at, end_at);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE closures ENABLE ROW LEVEL SECURITY;

-- ─── Helper function: get user's property_id from auth ───

CREATE OR REPLACE FUNCTION auth_user_property_id()
RETURNS UUID AS $$
  SELECT property_id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Helper function: get user's role from auth ───

CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS user_role AS $$
  SELECT role FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Properties policies ───

-- Public: anyone can read active properties (for public booking form)
CREATE POLICY "properties_public_read" ON properties
  FOR SELECT USING (active = true);

-- Admin/superadmin: full access to own property
CREATE POLICY "properties_admin_update" ON properties
  FOR UPDATE USING (
    id = auth_user_property_id() AND auth_user_role() IN ('admin', 'superadmin')
  );

-- Superadmin: can manage all properties
CREATE POLICY "properties_superadmin_all" ON properties
  FOR ALL USING (auth_user_role() = 'superadmin');

-- ─── Services policies ───

-- Public: anyone can read active services (for booking form)
CREATE POLICY "services_public_read" ON services
  FOR SELECT USING (active = true);

-- Admin: CRUD on own property's services
CREATE POLICY "services_admin_all" ON services
  FOR ALL USING (
    property_id = auth_user_property_id() AND auth_user_role() IN ('admin', 'superadmin')
  );

-- ─── Users policies ───

-- Users can read their own record
CREATE POLICY "users_self_read" ON users
  FOR SELECT USING (auth_id = auth.uid());

-- Admin: manage users in own property
CREATE POLICY "users_admin_all" ON users
  FOR ALL USING (
    property_id = auth_user_property_id() AND auth_user_role() IN ('admin', 'superadmin')
  );

-- ─── Bookings policies ───

-- Public: insert (create booking) — no auth required, API validates
CREATE POLICY "bookings_public_insert" ON bookings
  FOR INSERT WITH CHECK (true);

-- Manager/admin: read bookings in own property
CREATE POLICY "bookings_staff_read" ON bookings
  FOR SELECT USING (property_id = auth_user_property_id());

-- Manager/admin: update bookings in own property
CREATE POLICY "bookings_staff_update" ON bookings
  FOR UPDATE USING (property_id = auth_user_property_id());

-- Superadmin: full access
CREATE POLICY "bookings_superadmin_all" ON bookings
  FOR ALL USING (auth_user_role() = 'superadmin');

-- ─── Notifications log policies ───

-- Staff: read notifications for own property's bookings
CREATE POLICY "notifications_staff_read" ON notifications_log
  FOR SELECT USING (
    booking_id IN (
      SELECT id FROM bookings WHERE property_id = auth_user_property_id()
    )
  );

-- Insert: allowed (service role inserts via API)
CREATE POLICY "notifications_insert" ON notifications_log
  FOR INSERT WITH CHECK (true);

-- ─── Closures policies ───

-- Public: anyone can read closures (for date picker)
CREATE POLICY "closures_public_read" ON closures
  FOR SELECT USING (true);

-- Admin: manage own property's closures
CREATE POLICY "closures_admin_all" ON closures
  FOR ALL USING (
    property_id = auth_user_property_id() AND auth_user_role() IN ('admin', 'superadmin')
  );
