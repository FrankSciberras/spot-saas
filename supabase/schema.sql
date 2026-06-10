-- =============================================================================
-- Rovora - Supabase PostgreSQL Schema
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
