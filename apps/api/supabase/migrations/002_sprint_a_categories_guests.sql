-- ============================================================
-- Sprint A — Categories, Guests, SetupIntent
-- ============================================================

-- ─── Service Categories ───

CREATE TABLE service_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name_fr VARCHAR(100) NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_categories_property ON service_categories(property_id);

-- RLS
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_categories_public_read" ON service_categories
  FOR SELECT USING (active = true);

CREATE POLICY "service_categories_admin_all" ON service_categories
  FOR ALL USING (
    property_id = auth_user_property_id() AND auth_user_role() IN ('admin', 'superadmin')
  );

-- ─── ALTER services: add category + guests config ───

ALTER TABLE services
  ADD COLUMN category_id UUID REFERENCES service_categories(id),
  ADD COLUMN default_guests INT NOT NULL DEFAULT 1,
  ADD COLUMN max_guests INT NOT NULL DEFAULT 4;

CREATE INDEX idx_services_category ON services(category_id);

-- ─── ALTER bookings: add guest_count ───

ALTER TABLE bookings
  ADD COLUMN guest_count INT NOT NULL DEFAULT 1;

-- ─── ALTER bookings: add stripe_setup_intent_id for SetupIntent flow ───

ALTER TABLE bookings
  ADD COLUMN stripe_setup_intent_id TEXT;
