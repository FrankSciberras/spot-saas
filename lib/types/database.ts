// =============================================================================
// Database Types - Auto-generated from Supabase schema
// =============================================================================

export type UserRole = 'admin' | 'staff' | 'driver';
export type DriverStatus = 'active' | 'inactive';
export type VehicleStatus = 'active' | 'in_service' | 'out_of_service';
export type DocumentOwnerType = 'driver' | 'vehicle';
export type DocumentType = 
  | 'ID_CARD' 
  | 'POLICE_CONDUCT' 
  | 'DRIVING_LICENSE' 
  | 'VEHICLE_INSURANCE' 
  | 'ROAD_LICENSE' 
  | 'OTHER';

// =============================================================================
// Core Entity Types
// =============================================================================

export interface User {
  id: string;
  email: string;
  role: UserRole;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  status: DriverStatus;
  assigned_vehicle_id: string | null;
  id_card_number: string | null;
  id_card_expiry_date: string | null;
  police_conduct_expiry_date: string | null;
  driving_license_number: string | null;
  driving_license_expiry_date: string | null;
  tag_license_expiry_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  registration_number: string;
  make: string;
  model: string;
  year: number | null;
  mileage: number;
  status: VehicleStatus;
  assigned_driver_id: string | null;
  insurance_expiry_date: string | null;
  road_license_expiry_date: string | null;
  color: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverShift {
  id: string;
  driver_id: string;
  vehicle_id: string;
  name: string;
  starting_mileage: number;
  start_time: string;
  end_time: string | null;
  front_image_url: string | null;
  left_image_url: string | null;
  right_image_url: string | null;
  back_image_url: string | null;
  dashcam_checked: boolean;
  car_internal_checked: boolean;
  notes: string | null;
  created_at: string;
}

export interface FileRecord {
  id: string;
  owner_type: DocumentOwnerType;
  owner_id: string;
  type: DocumentType;
  file_url: string;
  file_name: string | null;
  expiry_date: string | null;
  uploaded_at: string;
  created_at: string;
}

// =============================================================================
// Future Module Types
// =============================================================================

export interface Earning {
  id: string;
  driver_id: string;
  period_start: string;
  period_end: string;
  amount: number;
  currency: string;
  details: Record<string, unknown> | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Payslip {
  id: string;
  driver_id: string;
  period_start: string;
  period_end: string;
  file_url: string;
  file_name: string | null;
  amount: number | null;
  currency: string;
  created_at: string;
}

export interface Event {
  id: string;
  external_event_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  event_date: string;
  end_date: string | null;
  category: string | null;
  raw_json: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  driver_id: string | null;
  title: string;
  body: string;
  type: string;
  action_url: string | null;
  created_at: string;
  read_at: string | null;
  sent_at: string | null;
}

export interface ChatMessage {
  id: string;
  sender_user_id: string;
  recipient_user_id: string | null;
  room_id: string | null;
  message: string;
  message_type: string;
  attachment_url: string | null;
  is_read: boolean;
  created_at: string;
}

// =============================================================================
// Notification Rules Types
// =============================================================================

export type NotificationTrigger = 
  | 'roster_published'
  | 'roster_updated'
  | 'shift_reminder'
  | 'document_expiry'
  | 'service_due'
  | 'custom';

export type NotificationChannel = 'app' | 'email' | 'push' | 'all';

export interface NotificationRule {
  id: string;
  name: string;
  description: string | null;
  trigger_type: NotificationTrigger;
  channel: NotificationChannel;
  is_active: boolean;
  trigger_config: Record<string, unknown>;
  title_template: string;
  body_template: string;
  target_role: UserRole | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationLog {
  id: string;
  rule_id: string | null;
  recipient_id: string | null;
  driver_id: string | null;
  channel: NotificationChannel;
  title: string;
  body: string;
  status: 'pending' | 'sent' | 'failed';
  error_message: string | null;
  metadata: Record<string, unknown>;
  sent_at: string | null;
  created_at: string;
}

// =============================================================================
// Role Permissions Types
// =============================================================================

export type PermissionResource = 
  | 'dashboard'
  | 'drivers'
  | 'vehicles'
  | 'shifts'
  | 'rosters'
  | 'services'
  | 'notifications'
  | 'reports'
  | 'settings';

export interface RolePermission {
  id: string;
  role: 'staff' | 'driver';
  resource: PermissionResource;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Vehicle Services Types
// =============================================================================

export type ServiceType = 
  | 'oil_change'
  | 'tire_rotation'
  | 'brake_service'
  | 'full_service'
  | 'inspection'
  | 'repair'
  | 'other';

export interface VehicleService {
  id: string;
  vehicle_id: string;
  service_type: ServiceType;
  service_date: string;
  mileage_at_service: number | null;
  next_service_mileage: number | null;
  next_service_date: string | null;
  cost: number | null;
  provider: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Extended Types with Relations
// =============================================================================

export interface DriverWithVehicle extends Driver {
  vehicle?: Vehicle | null;
  user?: User | null;
}

export interface VehicleWithDriver extends Vehicle {
  driver?: Driver | null;
}

export interface DriverShiftWithRelations extends DriverShift {
  driver?: Driver | null;
  vehicle?: Vehicle | null;
}

// =============================================================================
// Form/Input Types
// =============================================================================

export interface CreateDriverInput {
  user_id: string;
  full_name: string;
  phone?: string;
  address?: string;
  status?: DriverStatus;
  assigned_vehicle_id?: string;
  id_card_number?: string;
  id_card_expiry_date?: string;
  police_conduct_expiry_date?: string;
  driving_license_number?: string;
  driving_license_expiry_date?: string;
  notes?: string;
}

export interface UpdateDriverInput {
  full_name?: string;
  phone?: string;
  address?: string;
  status?: DriverStatus;
  assigned_vehicle_id?: string | null;
  id_card_number?: string;
  id_card_expiry_date?: string;
  police_conduct_expiry_date?: string;
  driving_license_number?: string;
  driving_license_expiry_date?: string;
  tag_license_expiry_date?: string;
  notes?: string;
}

export interface CreateVehicleInput {
  registration_number: string;
  make: string;
  model: string;
  year?: number;
  mileage?: number;
  status?: VehicleStatus;
  assigned_driver_id?: string;
  insurance_expiry_date?: string;
  road_license_expiry_date?: string;
  color?: string;
  notes?: string;
}

export interface UpdateVehicleInput {
  registration_number?: string;
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  status?: VehicleStatus;
  assigned_driver_id?: string | null;
  insurance_expiry_date?: string;
  road_license_expiry_date?: string;
  color?: string;
  notes?: string;
}

export interface CreateShiftInput {
  driver_id: string;
  vehicle_id: string;
  name: string;
  starting_mileage: number;
  start_time: string;
  front_image_url?: string;
  left_image_url?: string;
  right_image_url?: string;
  back_image_url?: string;
  dashcam_checked: boolean;
  car_internal_checked: boolean;
  notes?: string;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// Session & Auth Types
// =============================================================================

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  full_name: string | null;
  driver_id?: string;
}
