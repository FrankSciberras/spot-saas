-- =============================================================================
-- SPOT SAAS - CONSOLIDATED INSTALL SCRIPT (auto-generated)
-- Run this ONCE on a fresh empty Supabase project (SQL Editor).
-- Reproduces the full current single-tenant schema. No multi-tenancy yet.
-- Source files concatenated in dependency order (see headers below).
-- =============================================================================



-- #############################################################################
-- SOURCE FILE: schema.sql
-- #############################################################################

-- =============================================================================
-- SPOT Dashboard - Supabase PostgreSQL Schema
-- =============================================================================
-- Run this file in Supabase SQL Editor to create all required tables.
-- This schema supports: users, drivers, vehicles, shifts, documents,
-- and future modules (earnings, payslips, events, notifications, chat).
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- User roles enum
CREATE TYPE user_role AS ENUM ('admin', 'staff', 'driver');

-- Driver status enum
CREATE TYPE driver_status AS ENUM ('active', 'inactive');

-- Vehicle status enum
CREATE TYPE vehicle_status AS ENUM ('active', 'in_service', 'out_of_service');

-- Document owner type enum
CREATE TYPE document_owner_type AS ENUM ('driver', 'vehicle');

-- Document type enum
CREATE TYPE document_type AS ENUM (
  'ID_CARD',
  'POLICE_CONDUCT',
  'DRIVING_LICENSE',
  'VEHICLE_INSURANCE',
  'ROAD_LICENSE',
  'OTHER'
);

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Users table (linked to Supabase Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL DEFAULT 'driver',
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Drivers table
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  status driver_status NOT NULL DEFAULT 'active',
  assigned_vehicle_id UUID, -- FK added after vehicles table
  id_card_number TEXT,
  id_card_expiry_date DATE,
  police_conduct_expiry_date DATE,
  driving_license_number TEXT,
  driving_license_expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create indexes for drivers
CREATE INDEX idx_drivers_user_id ON drivers(user_id);
CREATE INDEX idx_drivers_status ON drivers(status);
CREATE INDEX idx_drivers_assigned_vehicle_id ON drivers(assigned_vehicle_id);

-- Vehicles table
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_number TEXT NOT NULL UNIQUE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  mileage INTEGER DEFAULT 0,
  status vehicle_status NOT NULL DEFAULT 'active',
  assigned_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  insurance_expiry_date DATE,
  road_license_expiry_date DATE,
  color TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for vehicles
CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_assigned_driver_id ON vehicles(assigned_driver_id);
CREATE INDEX idx_vehicles_registration_number ON vehicles(registration_number);

-- Add foreign key from drivers to vehicles (circular reference)
ALTER TABLE drivers
ADD CONSTRAINT fk_drivers_assigned_vehicle
FOREIGN KEY (assigned_vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;

-- Driver Shifts table ("Go Online" records)
CREATE TABLE driver_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  starting_mileage INTEGER NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  front_image_url TEXT,
  left_image_url TEXT,
  right_image_url TEXT,
  back_image_url TEXT,
  dashcam_checked BOOLEAN NOT NULL DEFAULT FALSE,
  car_internal_checked BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for driver_shifts
CREATE INDEX idx_driver_shifts_driver_id ON driver_shifts(driver_id);
CREATE INDEX idx_driver_shifts_vehicle_id ON driver_shifts(vehicle_id);
CREATE INDEX idx_driver_shifts_start_time ON driver_shifts(start_time DESC);
CREATE INDEX idx_driver_shifts_created_at ON driver_shifts(created_at DESC);

-- Files/Documents table (generic, for any entity)
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_type document_owner_type NOT NULL,
  owner_id UUID NOT NULL,
  type document_type NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  expiry_date DATE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for files
CREATE INDEX idx_files_owner ON files(owner_type, owner_id);
CREATE INDEX idx_files_type ON files(type);
CREATE INDEX idx_files_expiry_date ON files(expiry_date);

-- =============================================================================
-- FUTURE MODULES (Minimal stubs for scalability)
-- =============================================================================

-- Earnings table
CREATE TABLE earnings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  details JSONB,
  status TEXT DEFAULT 'pending', -- pending, approved, paid
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_earnings_driver_id ON earnings(driver_id);
CREATE INDEX idx_earnings_period ON earnings(period_start, period_end);

-- Payslips table
CREATE TABLE payslips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  amount DECIMAL(10, 2),
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payslips_driver_id ON payslips(driver_id);
CREATE INDEX idx_payslips_period ON payslips(period_start, period_end);

-- Events table (for Gozo API integration)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_event_id TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  category TEXT,
  raw_json JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_event_date ON events(event_date);
CREATE INDEX idx_events_external_id ON events(external_event_id);
CREATE INDEX idx_events_is_active ON events(is_active);

-- Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE, -- NULL for broadcast
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'info', -- info, warning, alert
  action_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_driver_id ON notifications(driver_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_read_at ON notifications(read_at);

-- Chat Messages table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for room/group
  room_id UUID, -- For group chats (future)
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'text', -- text, image, file
  attachment_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_user_id);
CREATE INDEX idx_chat_messages_recipient ON chat_messages(recipient_user_id);
CREATE INDEX idx_chat_messages_room ON chat_messages(room_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role AS $$
  SELECT role FROM users WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function to check if user is admin or staff
CREATE OR REPLACE FUNCTION is_admin_or_staff(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = user_id AND role IN ('admin', 'staff')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function to get driver_id for a user
CREATE OR REPLACE FUNCTION get_driver_id(user_id UUID)
RETURNS UUID AS $$
  SELECT id FROM drivers WHERE user_id = $1;
$$ LANGUAGE sql SECURITY DEFINER;

-- =============================================================================
-- USERS TABLE POLICIES
-- =============================================================================

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Admins and staff can view all users
CREATE POLICY "Admins/Staff can view all users"
  ON users FOR SELECT
  USING (is_admin_or_staff(auth.uid()));

-- Users can update their own profile (limited fields via API)
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Only admins can insert/delete users
CREATE POLICY "Admins can insert users"
  ON users FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()) OR auth.uid() = id);

CREATE POLICY "Admins can delete users"
  ON users FOR DELETE
  USING (get_user_role(auth.uid()) = 'admin');

-- =============================================================================
-- DRIVERS TABLE POLICIES
-- =============================================================================

-- Drivers can view their own record
CREATE POLICY "Drivers can view own record"
  ON drivers FOR SELECT
  USING (user_id = auth.uid());

-- Admins and staff can view all drivers
CREATE POLICY "Admins/Staff can view all drivers"
  ON drivers FOR SELECT
  USING (is_admin_or_staff(auth.uid()));

-- Drivers can update limited fields on their own record (via API validation)
CREATE POLICY "Drivers can update own record"
  ON drivers FOR UPDATE
  USING (user_id = auth.uid());

-- Admins can do everything with drivers
CREATE POLICY "Admins can manage drivers"
  ON drivers FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

-- Staff can insert/update drivers
CREATE POLICY "Staff can insert drivers"
  ON drivers FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

-- =============================================================================
-- VEHICLES TABLE POLICIES
-- =============================================================================

-- All authenticated users can view vehicles
CREATE POLICY "Authenticated users can view vehicles"
  ON vehicles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admins can manage vehicles
CREATE POLICY "Admins can manage vehicles"
  ON vehicles FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

-- Staff can insert/update vehicles
CREATE POLICY "Staff can insert vehicles"
  ON vehicles FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

CREATE POLICY "Staff can update vehicles"
  ON vehicles FOR UPDATE
  USING (is_admin_or_staff(auth.uid()));

-- =============================================================================
-- DRIVER SHIFTS TABLE POLICIES
-- =============================================================================

-- Drivers can view their own shifts
CREATE POLICY "Drivers can view own shifts"
  ON driver_shifts FOR SELECT
  USING (driver_id = get_driver_id(auth.uid()));

-- Admins and staff can view all shifts
CREATE POLICY "Admins/Staff can view all shifts"
  ON driver_shifts FOR SELECT
  USING (is_admin_or_staff(auth.uid()));

-- Drivers can insert their own shifts
CREATE POLICY "Drivers can insert own shifts"
  ON driver_shifts FOR INSERT
  WITH CHECK (driver_id = get_driver_id(auth.uid()));

-- Admins can manage all shifts
CREATE POLICY "Admins can manage shifts"
  ON driver_shifts FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

-- =============================================================================
-- FILES TABLE POLICIES
-- =============================================================================

-- Drivers can view their own files
CREATE POLICY "Drivers can view own files"
  ON files FOR SELECT
  USING (
    owner_type = 'driver' AND owner_id = get_driver_id(auth.uid())
  );

-- Admins and staff can view all files
CREATE POLICY "Admins/Staff can view all files"
  ON files FOR SELECT
  USING (is_admin_or_staff(auth.uid()));

-- Drivers can insert their own files
CREATE POLICY "Drivers can insert own files"
  ON files FOR INSERT
  WITH CHECK (
    owner_type = 'driver' AND owner_id = get_driver_id(auth.uid())
  );

-- Admins and staff can create/update file records
CREATE POLICY "Admins/Staff can insert files"
  ON files FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

CREATE POLICY "Admins/Staff can update files"
  ON files FOR UPDATE
  USING (is_admin_or_staff(auth.uid()))
  WITH CHECK (is_admin_or_staff(auth.uid()));

-- Admins can manage all files
CREATE POLICY "Admins can manage files"
  ON files FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

-- =============================================================================
-- EARNINGS & PAYSLIPS POLICIES
-- =============================================================================

-- Drivers can view their own earnings
CREATE POLICY "Drivers can view own earnings"
  ON earnings FOR SELECT
  USING (driver_id = get_driver_id(auth.uid()));

-- Admins/Staff can view all earnings
CREATE POLICY "Admins/Staff can view all earnings"
  ON earnings FOR SELECT
  USING (is_admin_or_staff(auth.uid()));

-- Admins can manage earnings
CREATE POLICY "Admins can manage earnings"
  ON earnings FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

-- Drivers can view their own payslips
CREATE POLICY "Drivers can view own payslips"
  ON payslips FOR SELECT
  USING (driver_id = get_driver_id(auth.uid()));

-- Admins/Staff can view all payslips
CREATE POLICY "Admins/Staff can view all payslips"
  ON payslips FOR SELECT
  USING (is_admin_or_staff(auth.uid()));

-- Admins can manage payslips
CREATE POLICY "Admins can manage payslips"
  ON payslips FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

-- =============================================================================
-- EVENTS TABLE POLICIES
-- =============================================================================

-- All authenticated users can view events
CREATE POLICY "Authenticated users can view events"
  ON events FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admins can manage events
CREATE POLICY "Admins can manage events"
  ON events FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

-- =============================================================================
-- NOTIFICATIONS TABLE POLICIES
-- =============================================================================

-- Drivers can view notifications for them or broadcasts
CREATE POLICY "Drivers can view own notifications"
  ON notifications FOR SELECT
  USING (
    driver_id IS NULL OR driver_id = get_driver_id(auth.uid())
  );

-- Admins/Staff can view all notifications
CREATE POLICY "Admins/Staff can view all notifications"
  ON notifications FOR SELECT
  USING (is_admin_or_staff(auth.uid()));

-- Admins can manage notifications
CREATE POLICY "Admins can manage notifications"
  ON notifications FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

-- Drivers can mark their notifications as read (including broadcasts)
CREATE POLICY "Drivers can update own notifications"
  ON notifications FOR UPDATE
  USING (
    driver_id = get_driver_id(auth.uid()) 
    OR driver_id IS NULL
  )
  WITH CHECK (
    driver_id = get_driver_id(auth.uid()) 
    OR driver_id IS NULL
  );

-- =============================================================================
-- CHAT MESSAGES TABLE POLICIES
-- =============================================================================

-- Users can view messages they sent or received
CREATE POLICY "Users can view own messages"
  ON chat_messages FOR SELECT
  USING (
    sender_user_id = auth.uid() OR recipient_user_id = auth.uid()
  );

-- Users can insert messages they send
CREATE POLICY "Users can send messages"
  ON chat_messages FOR INSERT
  WITH CHECK (sender_user_id = auth.uid());

-- Admins can view all messages
CREATE POLICY "Admins can view all messages"
  ON chat_messages FOR SELECT
  USING (get_user_role(auth.uid()) = 'admin');

-- =============================================================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_earnings_updated_at
  BEFORE UPDATE ON earnings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- STORAGE BUCKET SETUP (Run in Supabase Dashboard or via API)
-- =============================================================================
-- Create a storage bucket for shift images and documents:
-- 
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('shift-images', 'shift-images', true);
-- 
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('documents', 'documents', false);
--
-- Then set up appropriate storage policies for authenticated uploads.
-- =============================================================================

-- =============================================================================
-- ROSTER TABLES
-- =============================================================================

-- Roster status enum
DO $$ BEGIN
  CREATE TYPE roster_status AS ENUM ('draft', 'published');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Rosters table (weekly rosters)
CREATE TABLE IF NOT EXISTS rosters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  title TEXT,
  status roster_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(week_start)
);

CREATE INDEX IF NOT EXISTS idx_rosters_week_start ON rosters(week_start DESC);
CREATE INDEX IF NOT EXISTS idx_rosters_status ON rosters(status);

-- Roster assignments (driver-vehicle-day assignments)
CREATE TABLE IF NOT EXISTS roster_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  roster_id UUID NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  assignment_date DATE NOT NULL,
  day_of_week INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(roster_id, vehicle_id, assignment_date)
);

CREATE INDEX IF NOT EXISTS idx_roster_assignments_roster_id ON roster_assignments(roster_id);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_vehicle_id ON roster_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_driver_id ON roster_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_date ON roster_assignments(assignment_date);

-- Enable RLS on roster tables
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_assignments ENABLE ROW LEVEL SECURITY;

-- Rosters policies
CREATE POLICY "Authenticated users can view published rosters"
  ON rosters FOR SELECT
  USING (auth.uid() IS NOT NULL AND (status = 'published' OR is_admin_or_staff(auth.uid())));

CREATE POLICY "Admins/Staff can insert rosters"
  ON rosters FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

CREATE POLICY "Admins/Staff can update rosters"
  ON rosters FOR UPDATE
  USING (is_admin_or_staff(auth.uid()));

CREATE POLICY "Admins/Staff can delete rosters"
  ON rosters FOR DELETE
  USING (is_admin_or_staff(auth.uid()));

-- Roster assignments policies
CREATE POLICY "Authenticated users can view assignments of published rosters"
  ON roster_assignments FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM rosters 
      WHERE rosters.id = roster_assignments.roster_id 
      AND (rosters.status = 'published' OR is_admin_or_staff(auth.uid()))
    )
  );

CREATE POLICY "Admins/Staff can insert roster assignments"
  ON roster_assignments FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

CREATE POLICY "Admins/Staff can update roster assignments"
  ON roster_assignments FOR UPDATE
  USING (is_admin_or_staff(auth.uid()));

CREATE POLICY "Admins/Staff can delete roster assignments"
  ON roster_assignments FOR DELETE
  USING (is_admin_or_staff(auth.uid()));

-- =============================================================================
-- INITIAL ADMIN USER SETUP
-- =============================================================================
-- After creating your first user via Supabase Auth, run:
-- 
-- INSERT INTO users (id, email, role, full_name)
-- VALUES (
--   'your-auth-user-uuid-here',
--   'admin@yourdomain.com',
--   'admin',
--   'Admin User'
-- );
-- =============================================================================


-- #############################################################################
-- SOURCE FILE: add_permissions.sql
-- #############################################################################

-- =============================================================================
-- ROLE PERMISSIONS SYSTEM
-- Run this in Supabase SQL Editor to add role-based permissions
-- =============================================================================

-- Role permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role TEXT NOT NULL, -- 'staff', 'driver'
  resource TEXT NOT NULL, -- 'drivers', 'vehicles', 'shifts', 'rosters', 'services', 'notifications', 'reports'
  can_view BOOLEAN DEFAULT false,
  can_create BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role, resource)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);

-- Enable RLS
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Only admins can manage permissions
DROP POLICY IF EXISTS "Admins can manage permissions" ON role_permissions;
CREATE POLICY "Admins can manage permissions"
  ON role_permissions FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Anyone authenticated can view permissions (needed to check their own)
DROP POLICY IF EXISTS "Users can view permissions" ON role_permissions;
CREATE POLICY "Users can view permissions"
  ON role_permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Insert default permissions for staff
INSERT INTO role_permissions (role, resource, can_view, can_create, can_edit, can_delete) VALUES
  -- Staff permissions (more access than drivers)
  ('staff', 'dashboard', true, false, false, false),
  ('staff', 'drivers', true, true, true, false),
  ('staff', 'vehicles', true, true, true, false),
  ('staff', 'shifts', true, true, true, false),
  ('staff', 'rosters', true, true, true, false),
  ('staff', 'services', true, true, true, false),
  ('staff', 'notifications', true, true, false, false),
  ('staff', 'reports', true, false, false, false),
  ('staff', 'settings', false, false, false, false),
  
  -- Driver permissions (limited access)
  ('driver', 'dashboard', true, false, false, false),
  ('driver', 'drivers', false, false, false, false),
  ('driver', 'vehicles', false, false, false, false),
  ('driver', 'shifts', true, false, false, false),
  ('driver', 'rosters', true, false, false, false),
  ('driver', 'services', false, false, false, false),
  ('driver', 'notifications', true, false, false, false),
  ('driver', 'reports', false, false, false, false),
  ('driver', 'settings', false, false, false, false)
ON CONFLICT (role, resource) DO NOTHING;

SELECT 'Role permissions table created successfully!' as message;


-- #############################################################################
-- SOURCE FILE: add_services.sql
-- #############################################################################

-- =============================================================================
-- VEHICLE SERVICES TABLE
-- Run this in Supabase SQL Editor to add vehicle service tracking
-- =============================================================================

-- Service type enum
DO $$ BEGIN
  CREATE TYPE service_type AS ENUM (
    'oil_change',
    'tire_rotation',
    'tire_replacement',
    'brake_service',
    'brake_pads',
    'brake_discs',
    'air_filter',
    'cabin_filter',
    'spark_plugs',
    'battery',
    'transmission',
    'coolant_flush',
    'timing_belt',
    'general_inspection',
    'annual_service',
    'major_service',
    'repair',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Vehicle services table
CREATE TABLE IF NOT EXISTS vehicle_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  service_type service_type NOT NULL DEFAULT 'other',
  mileage_at_service INTEGER NOT NULL,
  next_service_mileage INTEGER,
  next_service_date DATE,
  cost DECIMAL(10, 2),
  currency TEXT DEFAULT 'EUR',
  service_provider TEXT,
  description TEXT,
  parts_replaced TEXT,
  invoice_url TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_services_vehicle_id ON vehicle_services(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_services_service_date ON vehicle_services(service_date DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_services_next_service_mileage ON vehicle_services(next_service_mileage);
CREATE INDEX IF NOT EXISTS idx_vehicle_services_next_service_date ON vehicle_services(next_service_date);

-- Enable RLS
ALTER TABLE vehicle_services ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view services"
  ON vehicle_services FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins/Staff can insert services"
  ON vehicle_services FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

CREATE POLICY "Admins/Staff can update services"
  ON vehicle_services FOR UPDATE
  USING (is_admin_or_staff(auth.uid()));

CREATE POLICY "Admins can delete services"
  ON vehicle_services FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

SELECT 'Vehicle services table created successfully!' as message;


-- #############################################################################
-- SOURCE FILE: add_roster_tables.sql
-- #############################################################################

-- =============================================================================
-- ADD ROSTER TABLES
-- Run this in Supabase SQL Editor to add roster functionality
-- =============================================================================

-- Roster status enum
DO $$ BEGIN
  CREATE TYPE roster_status AS ENUM ('draft', 'published');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Rosters table (weekly rosters)
CREATE TABLE IF NOT EXISTS rosters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  title TEXT,
  status roster_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(week_start)
);

CREATE INDEX IF NOT EXISTS idx_rosters_week_start ON rosters(week_start DESC);
CREATE INDEX IF NOT EXISTS idx_rosters_status ON rosters(status);

-- Roster assignments (driver-vehicle-day assignments)
CREATE TABLE IF NOT EXISTS roster_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  roster_id UUID NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  assignment_date DATE NOT NULL,
  day_of_week INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(roster_id, vehicle_id, assignment_date)
);

CREATE INDEX IF NOT EXISTS idx_roster_assignments_roster_id ON roster_assignments(roster_id);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_vehicle_id ON roster_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_driver_id ON roster_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_date ON roster_assignments(assignment_date);

-- Enable RLS on roster tables
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_assignments ENABLE ROW LEVEL SECURITY;

-- Rosters policies
DROP POLICY IF EXISTS "Authenticated users can view published rosters" ON rosters;
CREATE POLICY "Authenticated users can view published rosters"
  ON rosters FOR SELECT
  USING (auth.uid() IS NOT NULL AND (status = 'published' OR is_admin_or_staff(auth.uid())));

DROP POLICY IF EXISTS "Admins/Staff can insert rosters" ON rosters;
CREATE POLICY "Admins/Staff can insert rosters"
  ON rosters FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can update rosters" ON rosters;
CREATE POLICY "Admins/Staff can update rosters"
  ON rosters FOR UPDATE
  USING (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can delete rosters" ON rosters;
CREATE POLICY "Admins/Staff can delete rosters"
  ON rosters FOR DELETE
  USING (is_admin_or_staff(auth.uid()));

-- Roster assignments policies
DROP POLICY IF EXISTS "Authenticated users can view assignments of published rosters" ON roster_assignments;
CREATE POLICY "Authenticated users can view assignments of published rosters"
  ON roster_assignments FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM rosters 
      WHERE rosters.id = roster_assignments.roster_id 
      AND (rosters.status = 'published' OR is_admin_or_staff(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Admins/Staff can insert roster assignments" ON roster_assignments;
CREATE POLICY "Admins/Staff can insert roster assignments"
  ON roster_assignments FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can update roster assignments" ON roster_assignments;
CREATE POLICY "Admins/Staff can update roster assignments"
  ON roster_assignments FOR UPDATE
  USING (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can delete roster assignments" ON roster_assignments;
CREATE POLICY "Admins/Staff can delete roster assignments"
  ON roster_assignments FOR DELETE
  USING (is_admin_or_staff(auth.uid()));

-- Done!
SELECT 'Roster tables created successfully!' as message;


-- #############################################################################
-- SOURCE FILE: add_notification_rules.sql
-- #############################################################################

-- =============================================================================
-- NOTIFICATION RULES & TEMPLATES
-- Run this in Supabase SQL Editor to add notification management
-- =============================================================================

-- Notification trigger types
DO $$ BEGIN
  CREATE TYPE notification_trigger AS ENUM (
    'roster_published',
    'roster_updated',
    'shift_reminder',
    'document_expiry',
    'service_due',
    'weekly_summary',
    'custom'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Notification channel types
DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM (
    'app',
    'push',
    'email',
    'all'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Notification rules/templates table
CREATE TABLE IF NOT EXISTS notification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type notification_trigger NOT NULL,
  channel notification_channel NOT NULL DEFAULT 'app',
  is_active BOOLEAN DEFAULT true,
  
  -- Trigger configuration (JSON for flexibility)
  trigger_config JSONB DEFAULT '{}',
  -- e.g., { "days_before": 7 } for document expiry
  -- e.g., { "hours_before": 24 } for shift reminder
  -- e.g., { "km_threshold": 2000 } for service due
  
  -- Template content
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  -- Templates can use variables like {{driver_name}}, {{vehicle_reg}}, etc.
  
  -- Targeting
  target_role TEXT DEFAULT 'driver', -- 'driver', 'admin', 'all'
  
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification log (sent notifications history)
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID REFERENCES notification_rules(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  
  channel notification_channel NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending', -- pending, sent, failed
  error_message TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_rules_trigger ON notification_rules(trigger_type);
CREATE INDEX IF NOT EXISTS idx_notification_rules_active ON notification_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_notification_log_recipient ON notification_log(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at DESC);

-- Enable RLS
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Policies for notification_rules
CREATE POLICY "Admins can manage notification rules"
  ON notification_rules FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Staff can view notification rules"
  ON notification_rules FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- Policies for notification_log
CREATE POLICY "Admins can view all logs"
  ON notification_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can view their own logs"
  ON notification_log FOR SELECT
  USING (recipient_id = auth.uid());

-- Insert default notification rules
INSERT INTO notification_rules (name, description, trigger_type, channel, title_template, body_template, trigger_config, target_role) VALUES
  ('Roster Published', 'Notify drivers when a new roster is published', 'roster_published', 'all', 'New Roster Published', 'The roster for {{roster_title}} is now available. Check your shifts!', '{}', 'driver'),
  ('Roster Updated', 'Notify drivers when a published roster is updated', 'roster_updated', 'all', 'Roster Updated', 'The roster for {{roster_title}} has been updated. Please check for changes.', '{}', 'driver'),
  ('Shift Reminder', 'Remind drivers of upcoming shifts', 'shift_reminder', 'push', 'Shift Tomorrow', 'You have a shift scheduled for tomorrow with {{vehicle_reg}}.', '{"hours_before": 24}', 'driver'),
  ('Document Expiry Warning', 'Alert about expiring documents', 'document_expiry', 'all', 'Document Expiring Soon', 'Your {{document_type}} expires on {{expiry_date}}. Please renew it.', '{"days_before": 30}', 'driver'),
  ('Service Due Alert', 'Alert about vehicles needing service', 'service_due', 'app', 'Vehicle Service Due', '{{vehicle_reg}} is due for service at {{next_service_mileage}} km.', '{"km_threshold": 2000}', 'admin'),
  ('Weekly Summary', 'Weekly summary for admins', 'weekly_summary', 'email', 'Weekly Fleet Summary', 'Here is your weekly fleet summary for the week of {{week_start}}.', '{"day_of_week": 1}', 'admin')
ON CONFLICT DO NOTHING;

SELECT 'Notification rules tables created successfully!' as message;


-- #############################################################################
-- SOURCE FILE: add_push_subscriptions.sql
-- #############################################################################

-- =============================================================================
-- PUSH SUBSCRIPTIONS TABLE
-- Run this in Supabase SQL Editor to add push notification support
-- =============================================================================

-- Push subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions"
  ON push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions"
  ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

SELECT 'Push subscriptions table created successfully!' as message;


-- #############################################################################
-- SOURCE FILE: add_secondary_driver.sql
-- #############################################################################

-- =============================================================================
-- ADD SECONDARY DRIVER TO ROSTER ASSIGNMENTS
-- Run this in Supabase SQL Editor to add secondary driver support
-- =============================================================================

-- Add secondary_driver_id column to roster_assignments
ALTER TABLE roster_assignments 
ADD COLUMN IF NOT EXISTS secondary_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

-- Add index for secondary driver lookups
CREATE INDEX IF NOT EXISTS idx_roster_assignments_secondary_driver_id 
ON roster_assignments(secondary_driver_id);

-- Done!
SELECT 'Secondary driver column added successfully!' as message;


-- #############################################################################
-- SOURCE FILE: add_tag_license.sql
-- #############################################################################

-- Add TAG License expiry date column to drivers table
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS tag_license_expiry_date DATE;

-- Add TAG_LICENSE to document_type enum if not exists
DO $$ BEGIN
  ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'TAG_LICENSE';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

SELECT 'TAG License field added successfully!' as message;


-- #############################################################################
-- SOURCE FILE: migrations/20241205_automated_alerts.sql
-- #############################################################################

-- =============================================================================
-- SERVICE DUE NOTIFICATION RULE UPDATE
-- Updates the default service_due rule with correct threshold and templates
-- =============================================================================

-- Update the Service Due Alert rule to use 2000km threshold (configurable in UI)
UPDATE notification_rules 
SET 
  trigger_config = '{"km_threshold": 2000}'::jsonb,
  title_template = 'Vehicle Service Due: {{vehicle_reg}}',
  body_template = '{{vehicle_reg}} is approaching its next service at {{next_service_mileage}} km.',
  description = 'Alert when vehicle mileage approaches service due (triggered when driver starts shift)',
  is_active = true
WHERE trigger_type = 'service_due';

-- If the rule doesn't exist, create it
INSERT INTO notification_rules (name, description, trigger_type, channel, title_template, body_template, trigger_config, target_role, is_active)
SELECT 
  'Service Due Alert',
  'Alert when vehicle mileage approaches service due (triggered when driver starts shift)',
  'service_due',
  'app',
  'Vehicle Service Due: {{vehicle_reg}}',
  '{{vehicle_reg}} is approaching its next service at {{next_service_mileage}} km.',
  '{"km_threshold": 2000}'::jsonb,
  'admin',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM notification_rules WHERE trigger_type = 'service_due'
);

SELECT 'Service due notification rule configured successfully!' as message;


-- #############################################################################
-- SOURCE FILE: migrations/20241205_driver_settlements.sql
-- #############################################################################

-- =============================================================================
-- Driver Settlements Tables
-- =============================================================================
-- Run this migration to create the tables for the driver settlement module.

-- Create driver_settlements table
CREATE TABLE IF NOT EXISTS driver_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  week_label TEXT NOT NULL,
  period_name TEXT,
  fss_tax DECIMAL(10, 2) NOT NULL DEFAULT 22,
  total_gross_fare DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_net DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_balance_before_tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
  final_balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one settlement per driver per week
  UNIQUE(driver_id, week_start)
);

-- Create settlement_platforms table
CREATE TABLE IF NOT EXISTS settlement_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES driver_settlements(id) ON DELETE CASCADE,
  platform_id TEXT NOT NULL,
  platform_name TEXT NOT NULL,
  gross_fare DECIMAL(10, 2) NOT NULL DEFAULT 0,
  platform_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 20,
  fifty_percent DECIMAL(10, 2) NOT NULL DEFAULT 0,
  fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  net DECIMAL(10, 2) NOT NULL DEFAULT 0,
  cash_ride DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tips DECIMAL(10, 2) NOT NULL DEFAULT 0,
  campaigns DECIMAL(10, 2) NOT NULL DEFAULT 0,
  balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_driver_settlements_driver_id ON driver_settlements(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_week_start ON driver_settlements(week_start);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_status ON driver_settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlement_platforms_settlement_id ON settlement_platforms(settlement_id);

-- Create updated_at trigger for driver_settlements
CREATE OR REPLACE FUNCTION update_driver_settlements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_driver_settlements_updated_at ON driver_settlements;
CREATE TRIGGER trigger_driver_settlements_updated_at
  BEFORE UPDATE ON driver_settlements
  FOR EACH ROW
  EXECUTE FUNCTION update_driver_settlements_updated_at();

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

-- Enable RLS on both tables
ALTER TABLE driver_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_platforms ENABLE ROW LEVEL SECURITY;

-- Policies for driver_settlements
-- Admin can do everything
CREATE POLICY "Admin full access to settlements" ON driver_settlements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Staff can view all settlements
CREATE POLICY "Staff can view settlements" ON driver_settlements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'staff'
    )
  );

-- Drivers can view their own finalized settlements
CREATE POLICY "Drivers can view own settlements" ON driver_settlements
  FOR SELECT
  TO authenticated
  USING (
    status = 'finalized'
    AND driver_id IN (
      SELECT id FROM drivers
      WHERE user_id = auth.uid()
    )
  );

-- Policies for settlement_platforms
-- Admin can do everything
CREATE POLICY "Admin full access to settlement platforms" ON settlement_platforms
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Staff can view all settlement platforms
CREATE POLICY "Staff can view settlement platforms" ON settlement_platforms
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'staff'
    )
  );

-- Drivers can view platforms for their own finalized settlements
CREATE POLICY "Drivers can view own settlement platforms" ON settlement_platforms
  FOR SELECT
  TO authenticated
  USING (
    settlement_id IN (
      SELECT ds.id FROM driver_settlements ds
      JOIN drivers d ON ds.driver_id = d.id
      WHERE d.user_id = auth.uid()
      AND ds.status = 'finalized'
    )
  );

-- =============================================================================
-- Comments for documentation
-- =============================================================================
COMMENT ON TABLE driver_settlements IS 'Weekly driver settlement records with calculated balances';
COMMENT ON TABLE settlement_platforms IS 'Per-platform earnings breakdown for each settlement';
COMMENT ON COLUMN driver_settlements.fss_tax IS 'FSS/Tax deduction amount (default €22, editable per settlement)';
COMMENT ON COLUMN driver_settlements.final_balance IS 'Final amount owed to driver after all deductions';
COMMENT ON COLUMN settlement_platforms.fifty_percent IS 'Driver share (50% of gross fare)';
COMMENT ON COLUMN settlement_platforms.fee IS 'Platform fee amount';
COMMENT ON COLUMN settlement_platforms.net IS 'Net after fee (fifty_percent - fee)';
COMMENT ON COLUMN settlement_platforms.campaigns IS 'Campaign bonuses - 100% to driver';
COMMENT ON COLUMN settlement_platforms.balance IS 'Platform balance (net - cash_ride + tips + campaigns)';


-- #############################################################################
-- SOURCE FILE: migrations/20241205_vehicle_mileage_function.sql
-- #############################################################################

-- =============================================================================
-- VEHICLE MILEAGE UPDATE FUNCTION
-- Allows any authenticated user to update vehicle mileage (for driver shifts)
-- =============================================================================

-- Create a function that updates vehicle mileage with SECURITY DEFINER
-- This bypasses RLS and allows drivers to update mileage when submitting shifts
CREATE OR REPLACE FUNCTION update_vehicle_mileage(
  p_vehicle_id UUID,
  p_mileage INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only update if new mileage is >= current mileage (prevent rollback)
  UPDATE vehicles 
  SET 
    mileage = p_mileage,
    updated_at = NOW()
  WHERE id = p_vehicle_id
    AND (mileage IS NULL OR mileage <= p_mileage);
    
  -- If no rows updated, check if it's because mileage was higher
  IF NOT FOUND THEN
    -- Check if vehicle exists
    IF NOT EXISTS (SELECT 1 FROM vehicles WHERE id = p_vehicle_id) THEN
      RAISE EXCEPTION 'Vehicle not found';
    END IF;
    -- Otherwise mileage was higher, which is fine - silently succeed
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_vehicle_mileage(UUID, INTEGER) TO authenticated;

-- =============================================================================
-- CREATE SERVICE NOTIFICATION FUNCTION
-- Allows drivers to create service due notifications (bypasses RLS)
-- =============================================================================

CREATE OR REPLACE FUNCTION create_service_notification(
  p_vehicle_id UUID,
  p_vehicle_reg TEXT,
  p_title TEXT,
  p_body TEXT,
  p_type TEXT DEFAULT 'warning',
  p_action_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- Verify the user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Insert the notification (driver_id = NULL means it's for admins)
  INSERT INTO notifications (driver_id, title, body, type, action_url)
  VALUES (NULL, p_title, p_body, p_type, p_action_url)
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_service_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

SELECT 'Vehicle mileage and notification functions created successfully!' as message;


-- #############################################################################
-- SOURCE FILE: migrations/20241206_monthly_earnings.sql
-- #############################################################################

-- =============================================================================
-- Monthly Earnings Table
-- =============================================================================
-- Admin-only table for tracking monthly business financials

CREATE TABLE IF NOT EXISTS monthly_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Period
  month DATE NOT NULL UNIQUE, -- First day of month (e.g., 2024-01-01)
  
  -- Platform Revenue (Gross)
  bolt_gross DECIMAL(10, 2) NOT NULL DEFAULT 0,
  uber_gross DECIMAL(10, 2) NOT NULL DEFAULT 0,
  offapp_gross DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- VAT (manually entered)
  bolt_vat DECIMAL(10, 2) NOT NULL DEFAULT 0,
  uber_vat DECIMAL(10, 2) NOT NULL DEFAULT 0,
  offapp_vat DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Platform Commissions (what Bolt/Uber take from you)
  bolt_commission DECIMAL(10, 2) NOT NULL DEFAULT 0,
  uber_commission DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Driver Costs
  driver_settlements_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Operating Expenses
  rent DECIMAL(10, 2) NOT NULL DEFAULT 0,
  utilities DECIMAL(10, 2) NOT NULL DEFAULT 0,
  insurance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ni_tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
  services_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  fuel DECIMAL(10, 2) NOT NULL DEFAULT 0,
  vehicle_expenses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  other_expenses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  other_expenses_notes TEXT,
  
  -- Calculated Totals (stored for convenience)
  total_gross_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_vat DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_commissions DECIMAL(10, 2) NOT NULL DEFAULT 0,
  net_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_expenses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  net_profit DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  notes TEXT,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_monthly_earnings_month ON monthly_earnings(month);
CREATE INDEX IF NOT EXISTS idx_monthly_earnings_status ON monthly_earnings(status);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_monthly_earnings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_monthly_earnings_updated_at ON monthly_earnings;
CREATE TRIGGER trigger_monthly_earnings_updated_at
  BEFORE UPDATE ON monthly_earnings
  FOR EACH ROW
  EXECUTE FUNCTION update_monthly_earnings_updated_at();

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

ALTER TABLE monthly_earnings ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admin full access to monthly_earnings"
  ON monthly_earnings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );


-- #############################################################################
-- SOURCE FILE: migrations/20241206_settlement_month_tag.sql
-- #############################################################################

-- =============================================================================
-- Settlement Month Tagging
-- =============================================================================
-- Simple addition to tag weekly settlements with a calendar month for grouping.

-- Add settlement_month column to driver_settlements
-- This stores the first day of the month (e.g., 2024-12-01 for December 2024)
ALTER TABLE driver_settlements 
ADD COLUMN IF NOT EXISTS settlement_month DATE;

-- Create index for filtering by month
CREATE INDEX IF NOT EXISTS idx_driver_settlements_settlement_month 
ON driver_settlements(settlement_month);

-- Comment for documentation
COMMENT ON COLUMN driver_settlements.settlement_month IS 'Calendar month this settlement belongs to (first day of month, e.g., 2024-12-01)';


-- #############################################################################
-- SOURCE FILE: migrations/20241206_settlement_paid_status.sql
-- #############################################################################

-- =============================================================================
-- Settlement Paid Status
-- =============================================================================
-- Track when driver settlements have been paid out

-- Add paid_at column to driver_settlements
ALTER TABLE driver_settlements 
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for filtering by paid status
CREATE INDEX IF NOT EXISTS idx_driver_settlements_paid_at 
ON driver_settlements(paid_at);

-- Comment for documentation
COMMENT ON COLUMN driver_settlements.paid_at IS 'Timestamp when the settlement was paid out to the driver. NULL means unpaid.';


-- #############################################################################
-- SOURCE FILE: migrations/20251222_driver_vehicle_assignments.sql
-- #############################################################################

CREATE TABLE IF NOT EXISTS public.driver_vehicle_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(driver_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_dva_driver_id ON public.driver_vehicle_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_dva_vehicle_id ON public.driver_vehicle_assignments(vehicle_id);

INSERT INTO public.driver_vehicle_assignments (driver_id, vehicle_id)
SELECT d.id, d.assigned_vehicle_id
FROM drivers d
WHERE d.assigned_vehicle_id IS NOT NULL
ON CONFLICT (driver_id, vehicle_id) DO NOTHING;

INSERT INTO public.driver_vehicle_assignments (driver_id, vehicle_id)
SELECT v.assigned_driver_id, v.id
FROM vehicles v
WHERE v.assigned_driver_id IS NOT NULL
ON CONFLICT (driver_id, vehicle_id) DO NOTHING;

ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins/Staff can view driver vehicle assignments" ON public.driver_vehicle_assignments;
CREATE POLICY "Admins/Staff can view driver vehicle assignments"
  ON public.driver_vehicle_assignments FOR SELECT
  USING (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can insert driver vehicle assignments" ON public.driver_vehicle_assignments;
CREATE POLICY "Admins/Staff can insert driver vehicle assignments"
  ON public.driver_vehicle_assignments FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can update driver vehicle assignments" ON public.driver_vehicle_assignments;
CREATE POLICY "Admins/Staff can update driver vehicle assignments"
  ON public.driver_vehicle_assignments FOR UPDATE
  USING (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can delete driver vehicle assignments" ON public.driver_vehicle_assignments;
CREATE POLICY "Admins/Staff can delete driver vehicle assignments"
  ON public.driver_vehicle_assignments FOR DELETE
  USING (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Drivers can view own vehicle assignments" ON public.driver_vehicle_assignments;
CREATE POLICY "Drivers can view own vehicle assignments"
  ON public.driver_vehicle_assignments FOR SELECT
  USING (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );


-- #############################################################################
-- SOURCE FILE: migrations/20251228_add_employment_type.sql
-- #############################################################################

-- =============================================================================
-- ADD EMPLOYMENT_TYPE TO DRIVERS TABLE
-- Run this migration to add employment type tracking for drivers
-- =============================================================================

-- Create employment_type enum if it doesn't exist
DO $$ BEGIN
  CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'terminated');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add employment_type column to drivers table
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS employment_type employment_type;

-- Create index for filtering by employment type
CREATE INDEX IF NOT EXISTS idx_drivers_employment_type ON drivers(employment_type);

SELECT 'Employment type column added successfully!' as message;


-- #############################################################################
-- SOURCE FILE: migrations/20260120_driver_adjustments.sql
-- #############################################################################

-- =============================================================================
-- Driver Adjustments Table
-- =============================================================================
-- Stores flexible expense, bonus, deduction, and reimbursement records for drivers.
-- This allows admins to track fuel expenses, bonuses, and other financial adjustments.

-- Create the adjustment type enum
DO $$ BEGIN
    CREATE TYPE adjustment_type AS ENUM ('expense', 'bonus', 'deduction', 'reimbursement', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create driver_adjustments table
CREATE TABLE IF NOT EXISTS driver_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    type adjustment_type NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    description TEXT NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_driver_adjustments_driver_id ON driver_adjustments(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_adjustments_date ON driver_adjustments(date DESC);
CREATE INDEX IF NOT EXISTS idx_driver_adjustments_type ON driver_adjustments(type);
CREATE INDEX IF NOT EXISTS idx_driver_adjustments_driver_date ON driver_adjustments(driver_id, date DESC);

-- Enable Row Level Security
ALTER TABLE driver_adjustments ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage all adjustments" ON driver_adjustments
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Policy: Staff can view all adjustments
CREATE POLICY "Staff can view all adjustments" ON driver_adjustments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'staff'
        )
    );

-- Policy: Drivers can view their own adjustments
CREATE POLICY "Drivers can view own adjustments" ON driver_adjustments
    FOR SELECT
    TO authenticated
    USING (
        driver_id IN (
            SELECT id FROM drivers 
            WHERE user_id = auth.uid()
        )
    );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_driver_adjustments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_driver_adjustments_updated_at ON driver_adjustments;
CREATE TRIGGER trigger_driver_adjustments_updated_at
    BEFORE UPDATE ON driver_adjustments
    FOR EACH ROW
    EXECUTE FUNCTION update_driver_adjustments_updated_at();

-- Grant permissions
GRANT ALL ON driver_adjustments TO authenticated;
GRANT SELECT ON driver_adjustments TO anon;


-- #############################################################################
-- SOURCE FILE: migrations/20260120_fix_notification_rls.sql
-- #############################################################################

-- =============================================================================
-- Fix Notification RLS Policy for Broadcast Notifications
-- =============================================================================
-- Issue: Drivers cannot mark broadcast notifications (driver_id IS NULL) as read
-- because the original policy only matched driver_id = get_driver_id(auth.uid())
-- which is always FALSE when driver_id IS NULL.

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Drivers can update own notifications" ON notifications;

-- Create new policy that allows drivers to update:
-- 1. Notifications specifically for them (driver_id = their driver_id)
-- 2. Broadcast notifications (driver_id IS NULL)
CREATE POLICY "Drivers can update own notifications"
  ON notifications FOR UPDATE
  USING (
    driver_id = get_driver_id(auth.uid()) 
    OR driver_id IS NULL
  )
  WITH CHECK (
    driver_id = get_driver_id(auth.uid()) 
    OR driver_id IS NULL
  );


-- #############################################################################
-- SOURCE FILE: migrations/20260120_fix_notification_target_role.sql
-- #############################################################################

-- =============================================================================
-- Fix Notification Target Role Issue
-- =============================================================================
-- Bug: Notifications with driver_id IS NULL were visible to ALL users (including drivers)
-- even when they were meant only for admins/staff (like service_due alerts).
--
-- Solution: Add target_role column to notifications table to properly filter
-- who should see broadcast notifications (driver_id IS NULL).

-- Add target_role column to notifications table
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS target_role TEXT DEFAULT 'all';
-- Values: 'driver' (only drivers), 'admin' (only admins/staff), 'all' (everyone)

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_notifications_target_role ON notifications(target_role);

-- Update existing admin-targeted notifications (those with action_url pointing to admin pages)
-- These were incorrectly visible to drivers before
UPDATE notifications 
SET target_role = 'admin' 
WHERE driver_id IS NULL 
  AND (
    action_url LIKE '/admin/%' 
    OR title LIKE '%Service Due%'
    OR title LIKE '%Vehicle Service%'
  );

-- Drop existing driver SELECT policy
DROP POLICY IF EXISTS "Drivers can view own notifications" ON notifications;

-- Create new policy that respects target_role for broadcasts
-- Drivers can see:
-- 1. Notifications specifically for them (driver_id = their driver_id)
-- 2. Broadcast notifications where target_role is 'driver' or 'all' (NOT 'admin')
CREATE POLICY "Drivers can view own notifications"
  ON notifications FOR SELECT
  USING (
    driver_id = get_driver_id(auth.uid()) 
    OR (
      driver_id IS NULL 
      AND target_role IN ('driver', 'all')
    )
  );

-- Update the driver UPDATE policy as well to match
DROP POLICY IF EXISTS "Drivers can update own notifications" ON notifications;

CREATE POLICY "Drivers can update own notifications"
  ON notifications FOR UPDATE
  USING (
    driver_id = get_driver_id(auth.uid()) 
    OR (
      driver_id IS NULL 
      AND target_role IN ('driver', 'all')
    )
  )
  WITH CHECK (
    driver_id = get_driver_id(auth.uid()) 
    OR (
      driver_id IS NULL 
      AND target_role IN ('driver', 'all')
    )
  );

-- =============================================================================
-- Add DELETE policy for drivers (they can delete their own notifications)
-- =============================================================================

DROP POLICY IF EXISTS "Drivers can delete own notifications" ON notifications;

CREATE POLICY "Drivers can delete own notifications"
  ON notifications FOR DELETE
  USING (
    driver_id = get_driver_id(auth.uid()) 
    OR (
      driver_id IS NULL 
      AND target_role IN ('driver', 'all')
    )
  );

-- =============================================================================
-- Update driver-specific notifications to have target_role = 'driver'
-- =============================================================================

UPDATE notifications 
SET target_role = 'driver' 
WHERE driver_id IS NOT NULL 
  AND target_role IS NULL;

-- =============================================================================
-- Fix create_service_notification function to include target_role
-- =============================================================================

CREATE OR REPLACE FUNCTION create_service_notification(
  p_vehicle_id UUID,
  p_vehicle_reg TEXT,
  p_title TEXT,
  p_body TEXT,
  p_type TEXT DEFAULT 'warning',
  p_action_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- Verify the user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Insert the notification for admins only (driver_id = NULL + target_role = 'admin')
  INSERT INTO notifications (driver_id, title, body, type, action_url, target_role)
  VALUES (NULL, p_title, p_body, p_type, p_action_url, 'admin')
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

SELECT 'Notification target_role fix applied successfully!' as message;


-- #############################################################################
-- SOURCE FILE: migrations/20260121_weekly_bookkeeping.sql
-- #############################################################################

-- =============================================================================
-- Weekly Bookkeeping Table
-- =============================================================================
-- Flexible week-by-week bookkeeping with custom date periods (like settlements)

CREATE TABLE IF NOT EXISTS weekly_bookkeeping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Period identification (flexible dates like settlements)
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  week_label TEXT NOT NULL,  -- e.g., "Week 1", "23 Dec - 29 Dec"
  period_name TEXT,          -- Optional custom name
  
  -- Income (Platform Earnings - what you receive after their deductions)
  uber_earnings DECIMAL(10, 2) NOT NULL DEFAULT 0,
  bolt_earnings DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ecabs_earnings DECIMAL(10, 2) NOT NULL DEFAULT 0,
  other_earnings DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Expenses
  employees DECIMAL(10, 2) NOT NULL DEFAULT 0,        -- Driver settlements
  repairs DECIMAL(10, 2) NOT NULL DEFAULT 0,
  insurance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  investments DECIMAL(10, 2) NOT NULL DEFAULT 0,
  vat DECIMAL(10, 2) NOT NULL DEFAULT 0,
  rent DECIMAL(10, 2) NOT NULL DEFAULT 0,
  employee_tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
  other_expenses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Calculated totals (stored for convenience)
  total_income DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_expenses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  net_profit DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one entry per date range
  UNIQUE(week_start, week_end)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_weekly_bookkeeping_dates ON weekly_bookkeeping(week_start, week_end);
CREATE INDEX IF NOT EXISTS idx_weekly_bookkeeping_start ON weekly_bookkeeping(week_start DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_weekly_bookkeeping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_weekly_bookkeeping_updated_at ON weekly_bookkeeping;
CREATE TRIGGER trigger_weekly_bookkeeping_updated_at
  BEFORE UPDATE ON weekly_bookkeeping
  FOR EACH ROW
  EXECUTE FUNCTION update_weekly_bookkeeping_updated_at();

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

ALTER TABLE weekly_bookkeeping ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admin full access to weekly_bookkeeping"
  ON weekly_bookkeeping
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );


-- #############################################################################
-- SOURCE FILE: migrations/20260129_driver_can_view_vehicle_files.sql
-- #############################################################################

-- Allow drivers to view vehicle-owned documents so they can access insurance/road license/logbook files.
-- Drivers already have read access to vehicles via existing policy "Authenticated users can view vehicles".

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can view vehicle files" ON public.files;
CREATE POLICY "Drivers can view vehicle files"
  ON public.files FOR SELECT
  USING (
    owner_type = 'vehicle'
    AND get_user_role(auth.uid()) = 'driver'
  );


-- #############################################################################
-- SOURCE FILE: migrations/20260207_vehicle_damages.sql
-- #############################################################################

-- =============================================================================
-- Vehicle Damages Table
-- =============================================================================

-- Damage severity enum
DO $$ BEGIN
  CREATE TYPE damage_severity AS ENUM ('minor', 'moderate', 'severe');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Damage status enum
DO $$ BEGIN
  CREATE TYPE damage_status AS ENUM ('open', 'repaired', 'monitoring');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Vehicle damages table
CREATE TABLE IF NOT EXISTS vehicle_damages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  zone TEXT NOT NULL,
  description TEXT NOT NULL,
  severity damage_severity NOT NULL DEFAULT 'minor',
  status damage_status NOT NULL DEFAULT 'open',
  repair_cost DECIMAL(10, 2),
  currency TEXT NOT NULL DEFAULT 'EUR',
  images JSONB DEFAULT '[]'::jsonb,
  reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  repaired_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_damages_vehicle_id ON vehicle_damages(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_damages_zone ON vehicle_damages(zone);
CREATE INDEX IF NOT EXISTS idx_vehicle_damages_severity ON vehicle_damages(severity);
CREATE INDEX IF NOT EXISTS idx_vehicle_damages_status ON vehicle_damages(status);
CREATE INDEX IF NOT EXISTS idx_vehicle_damages_reported_at ON vehicle_damages(reported_at DESC);

-- Enable RLS
ALTER TABLE vehicle_damages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view vehicle damages"
  ON vehicle_damages FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage vehicle damages"
  ON vehicle_damages FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Staff can insert vehicle damages"
  ON vehicle_damages FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

CREATE POLICY "Staff can update vehicle damages"
  ON vehicle_damages FOR UPDATE
  USING (is_admin_or_staff(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_vehicle_damages_updated_at
  BEFORE UPDATE ON vehicle_damages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- #############################################################################
-- SOURCE FILE: migrations/20260209_damages_permissions.sql
-- #############################################################################

-- =============================================================================
-- Add damages resource to role_permissions
-- =============================================================================

-- Staff can view, create, and edit damages (not delete)
INSERT INTO role_permissions (role, resource, can_view, can_create, can_edit, can_delete)
VALUES ('staff', 'damages', true, true, true, false)
ON CONFLICT DO NOTHING;

-- Drivers can view damages only
INSERT INTO role_permissions (role, resource, can_view, can_create, can_edit, can_delete)
VALUES ('driver', 'damages', true, false, false, false)
ON CONFLICT DO NOTHING;


-- #############################################################################
-- SOURCE FILE: migrations/20260210_document_type_front_back.sql
-- #############################################################################

-- =============================================================================
-- Add front/back variants for ID Card and Driving License document types
-- =============================================================================

ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'ID_CARD_FRONT';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'ID_CARD_BACK';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'DRIVING_LICENSE_FRONT';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'DRIVING_LICENSE_BACK';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'TAG_LICENSE';


-- #############################################################################
-- SOURCE FILE: migrations/20260303_app_settings.sql
-- #############################################################################

-- App Settings table for feature toggles
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'false'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read settings
CREATE POLICY "Authenticated users can read settings"
  ON app_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can update settings (enforced at API level, but service role bypasses RLS)
CREATE POLICY "Service role can manage settings"
  ON app_settings FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed the package update check toggle
INSERT INTO app_settings (key, value, description)
VALUES (
  'package_update_check_enabled',
  'true'::jsonb,
  'When enabled, a weekly cron job checks for npm package updates and emails the admin.'
)
ON CONFLICT (key) DO NOTHING;


-- #############################################################################
-- SOURCE FILE: migrations/20260325_vehicle_diagram_zones.sql
-- #############################################################################

-- Vehicle diagram zone configurations
-- Stores interactive zone polygons for each car model and view type
CREATE TABLE IF NOT EXISTS vehicle_diagram_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key text NOT NULL,           -- e.g. 'yaris-cross'
  view_type text NOT NULL,           -- e.g. 'side', 'top'
  svg_path text,                     -- path to SVG outline file, e.g. '/vehicle-diagrams/yaris cross outline.svg'
  zones jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { "front_left_door": { "path": "M ...", "points": [{x,y},...] }, ... }
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(model_key, view_type)
);

-- RLS
ALTER TABLE vehicle_diagram_zones ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read diagram configs
CREATE POLICY "Authenticated users can view diagram zones"
  ON vehicle_diagram_zones FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage diagram zones"
  ON vehicle_diagram_zones FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );


-- #############################################################################
-- SOURCE FILE: migrations/20260407_also_staff.sql
-- #############################################################################

-- Allow drivers to also have staff access without changing their primary role.
-- A driver with also_staff = true can access both /driver and /admin dashboards,
-- and is subject to the same staff permission RLS (role_permissions table).

ALTER TABLE users ADD COLUMN IF NOT EXISTS also_staff boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.also_staff IS 'When true, a driver user can also access the admin/staff dashboard with staff-level permissions.';


-- #############################################################################
-- SOURCE FILE: migrations/20260407_reminders.sql
-- #############################################################################

-- Reminders / To-Do system
-- Supports: priority, due dates, timed notifications, recurring (daily/weekly/monthly/yearly),
-- assignment to staff, completion tracking

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  due_date timestamptz,
  remind_at timestamptz,                    -- when to fire a notification
  reminder_sent boolean NOT NULL DEFAULT false,
  recurring text CHECK (recurring IN ('daily', 'weekly', 'monthly', 'yearly')),
  recurring_end_date timestamptz,           -- stop recurring after this date (null = forever)
  parent_id uuid REFERENCES reminders(id) ON DELETE SET NULL,  -- links recurring children to original
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminders_created_by ON reminders(created_by);
CREATE INDEX idx_reminders_assigned_to ON reminders(assigned_to);
CREATE INDEX idx_reminders_status ON reminders(status);
CREATE INDEX idx_reminders_due_date ON reminders(due_date);
CREATE INDEX idx_reminders_remind_at ON reminders(remind_at) WHERE NOT reminder_sent;

-- RLS
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access to reminders"
  ON reminders FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Staff can see reminders assigned to them or created by them
CREATE POLICY "Staff can view own reminders"
  ON reminders FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() OR assigned_to = auth.uid()
  );

-- Staff can update reminders assigned to them (mark complete etc)
CREATE POLICY "Staff can update assigned reminders"
  ON reminders FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());


-- #############################################################################
-- SOURCE FILE: migrations/20260408_also_staff_is_admin_or_staff.sql
-- #############################################################################

-- =============================================================================
-- Treat driver accounts with also_staff as staff in shared RLS helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin_or_staff(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = user_id
      AND (
        role IN ('admin', 'staff')
        OR (role = 'driver' AND COALESCE(also_staff, false))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_staff(uuid) TO authenticated;


-- #############################################################################
-- SOURCE FILE: migrations/20260408_audit_log.sql
-- #############################################################################

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_email text,
  actor_name text,
  actor_role text NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  entity_type text NOT NULL,
  entity_id text,
  summary text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );


-- #############################################################################
-- SOURCE FILE: migrations/20260408_reminders_permissions.sql
-- #############################################################################

-- =============================================================================
-- Reminder permissions for staff and driver+staff users
-- =============================================================================

-- Seed reminder permissions so staff can use reminders immediately.
INSERT INTO role_permissions (role, resource, can_view, can_create, can_edit, can_delete)
VALUES ('staff', 'reminders', true, true, true, true)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, resource, can_view, can_create, can_edit, can_delete)
VALUES ('driver', 'reminders', false, false, false, false)
ON CONFLICT DO NOTHING;

-- Resolve the effective permission role, including driver accounts that also have staff access.
CREATE OR REPLACE FUNCTION public.permission_role_for_user(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN u.role = 'admin' THEN 'admin'
    WHEN u.role = 'staff' THEN 'staff'
    WHEN u.role = 'driver' AND COALESCE(u.also_staff, false) THEN 'staff'
    WHEN u.role = 'driver' THEN 'driver'
    ELSE NULL
  END
  FROM public.users u
  WHERE u.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.has_resource_permission(
  p_user_id uuid,
  p_resource text,
  p_action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  effective_role text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT public.permission_role_for_user(p_user_id)
  INTO effective_role;

  IF effective_role IS NULL THEN
    RETURN false;
  END IF;

  IF effective_role = 'admin' THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    WHERE rp.role = effective_role
      AND rp.resource = p_resource
      AND CASE p_action
        WHEN 'view' THEN COALESCE(rp.can_view, false)
        WHEN 'create' THEN COALESCE(rp.can_create, false)
        WHEN 'edit' THEN COALESCE(rp.can_edit, false)
        WHEN 'delete' THEN COALESCE(rp.can_delete, false)
        ELSE false
      END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.permission_role_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_resource_permission(uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS "Staff can view own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Staff can update assigned reminders" ON public.reminders;
DROP POLICY IF EXISTS "Staff can create own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Staff can update own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Staff can delete own reminders" ON public.reminders;

CREATE POLICY "Staff can view own reminders"
  ON public.reminders FOR SELECT
  TO authenticated
  USING (
    public.has_resource_permission(auth.uid(), 'reminders', 'view')
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
  );

CREATE POLICY "Staff can create own reminders"
  ON public.reminders FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_resource_permission(auth.uid(), 'reminders', 'create')
    AND created_by = auth.uid()
  );

CREATE POLICY "Staff can update own reminders"
  ON public.reminders FOR UPDATE
  TO authenticated
  USING (
    public.has_resource_permission(auth.uid(), 'reminders', 'edit')
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
  )
  WITH CHECK (
    public.has_resource_permission(auth.uid(), 'reminders', 'edit')
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
  );

CREATE POLICY "Staff can delete own reminders"
  ON public.reminders FOR DELETE
  TO authenticated
  USING (
    public.has_resource_permission(auth.uid(), 'reminders', 'delete')
    AND (created_by = auth.uid() OR assigned_to = auth.uid())
  );


-- #############################################################################
-- SOURCE FILE: migrations/20260416_staff_can_insert_files.sql
-- #############################################################################

-- Allow staff and driver+staff users to create and update file records.
-- Damage photo uploads use the shared files table, so without this policy
-- staff uploads reach storage but fail when inserting the metadata row.

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins/Staff can insert files" ON public.files;
CREATE POLICY "Admins/Staff can insert files"
  ON public.files FOR INSERT
  WITH CHECK (public.is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can update files" ON public.files;
CREATE POLICY "Admins/Staff can update files"
  ON public.files FOR UPDATE
  USING (public.is_admin_or_staff(auth.uid()))
  WITH CHECK (public.is_admin_or_staff(auth.uid()));


-- #############################################################################
-- SOURCE FILE: setup_storage.sql
-- #############################################################################

-- =============================================================================
-- STORAGE BUCKET SETUP
-- Run this in Supabase SQL Editor to configure storage buckets
-- =============================================================================

-- Create the documents bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents', 
  'documents', 
  true,  -- Make it public so we can get public URLs
  10485760,  -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];

-- Create the shift-images bucket for vehicle photos during go-online
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shift-images', 
  'shift-images', 
  true,  -- Make it public so we can get public URLs
  10485760,  -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/heic', 'image/heif'];

-- Drop existing policies if any
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete" ON storage.objects;
DROP POLICY IF EXISTS "Users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload shift images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view shift images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view shift images" ON storage.objects;

-- =============================================================================
-- DOCUMENTS BUCKET POLICIES
-- =============================================================================

-- Policy: Allow authenticated users to upload files to documents bucket
CREATE POLICY "Users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Policy: Allow anyone to view files in documents bucket (since bucket is public)
CREATE POLICY "Users can view documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents');

-- Policy: Allow authenticated users to update their uploads
CREATE POLICY "Users can update documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'documents');

-- Policy: Allow authenticated users to delete files
CREATE POLICY "Admins can delete documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents');

-- =============================================================================
-- SHIFT-IMAGES BUCKET POLICIES
-- =============================================================================

-- Policy: Allow authenticated users to upload shift images
CREATE POLICY "Users can upload shift images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'shift-images');

-- Policy: Allow authenticated users to view shift images
CREATE POLICY "Users can view shift images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'shift-images');

-- Policy: Allow public/anonymous access to view shift images (for public URLs)
CREATE POLICY "Public can view shift images"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'shift-images');

SELECT 'Storage buckets and policies configured successfully!' as message;
