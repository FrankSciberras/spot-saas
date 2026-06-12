// =============================================================================
// Database Types - Auto-generated from Supabase schema
// =============================================================================

export type UserRole = 'admin' | 'staff' | 'driver';
export type DriverStatus = 'active' | 'inactive';
export type EmploymentType = 'full_time' | 'part_time' | 'terminated';
export type VehicleStatus = 'active' | 'in_service' | 'out_of_service';
export type DocumentOwnerType = 'driver' | 'vehicle';
export type DocumentType = 
  | 'ID_CARD' 
  | 'ID_CARD_FRONT'
  | 'ID_CARD_BACK'
  | 'POLICE_CONDUCT' 
  | 'DRIVING_LICENSE' 
  | 'DRIVING_LICENSE_FRONT'
  | 'DRIVING_LICENSE_BACK'
  | 'VEHICLE_INSURANCE' 
  | 'ROAD_LICENSE' 
  | 'TAG_LICENSE'
  | 'OTHER';

// =============================================================================
// Core Entity Types
// =============================================================================

export interface User {
  id: string;
  email: string;
  role: UserRole;
  also_staff: boolean;
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
  employment_type: EmploymentType | null;
  assigned_vehicle_id: string | null;
  id_card_number: string | null;
  id_card_expiry_date: string | null;
  police_conduct_expiry_date: string | null;
  driving_license_number: string | null;
  driving_license_expiry_date: string | null;
  tag_license_expiry_date: string | null;
  notes: string | null;
  // Per-driver settlement scheme overrides. NULL = inherit the org default.
  settlement_driver_share_pct: number | null;
  settlement_tips_driver_pct: number | null;
  settlement_campaigns_driver_pct: number | null;
  settlement_fee_driver_pct: number | null;
  /** Per-driver settlement preset. NULL = inherit the fleet default preset. */
  settlement_preset_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A per-fleet ride platform (Bolt, Uber, …) used to build settlement entry
 * forms. `key` is the stable id stored on settlement_platforms.platform_id.
 */
export interface OrgPlatform {
  id: string;
  organization_id: string;
  key: string;
  name: string;
  default_fee_pct: number;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** How a preset's tax_value is interpreted. */
export type SettlementTaxType = 'flat' | 'percent';

/**
 * A named, reusable settlement scheme for a fleet: revenue split + tax + weekly
 * rent. Assigned per driver (drivers.settlement_preset_id) or as the fleet
 * default (organizations.default_settlement_preset_id).
 */
export interface SettlementPreset {
  id: string;
  organization_id: string;
  name: string;
  driver_share_pct: number;
  tips_driver_pct: number;
  campaigns_driver_pct: number;
  fee_driver_pct: number;
  /** 'flat' = tax_value is EUR; 'percent' = tax_value is % of balance before tax. */
  tax_type: SettlementTaxType;
  tax_value: number;
  /** Fixed weekly vehicle-rent deduction (EUR). 0 = none. */
  rent_weekly: number;
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
  vehicle_model_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A platform-admin-managed car model preset. Holds the friendly name + uploaded
 * top/side diagram images; the clickable damage zones traced over those images
 * live in the vehicle_diagram_zones table, joined on model_key. Presets are
 * global (shared across all fleets) — only platform admins can create/edit them,
 * fleet operators only pick one for a vehicle (vehicles.vehicle_model_id).
 */
export interface VehicleModel {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  model_key: string;
  side_image_url: string | null;
  top_image_url: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

/** A row in the platform-admin-managed `plans` catalogue (see lib/billing). */
export interface PlanRow {
  id: string;
  key: string;
  name: string;
  blurb: string | null;
  price_label: string;
  price_unit: string | null;
  price_amount: number;
  billing_note: string | null;
  cap_label: string | null;
  max_drivers: number | null;
  max_vehicles: number | null;
  /** Vehicles covered by the base price. NULL = unlimited included. */
  included_vehicles: number | null;
  /** Price per vehicle beyond `included_vehicles`. NULL = no per-vehicle add-on. */
  per_vehicle_price: number | null;
  features: string[];
  color: string | null;
  cta_label: string | null;
  cta_href: string | null;
  is_custom: boolean;
  is_popular: boolean;
  is_published: boolean;
  sort_order: number;
  /** Stripe recurring Price this package subscribes to (null = not sellable via Stripe yet). */
  stripe_price_id: string | null;
  /** Stripe Product id; checkout resolves its default price when no explicit price is set. */
  stripe_product_id: string | null;
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
  /** Where it came from: 'fleet' (the org) or 'platform' (Rovora HQ). */
  source: 'fleet' | 'platform';
  /** Display label for the sender, e.g. 'Rovora HQ' for platform sends. */
  sender_label: string | null;
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
  | 'damages'
  | 'notifications'
  | 'reports'
  | 'reminders'
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
  employment_type?: EmploymentType;
  assigned_vehicle_id?: string;
  assigned_vehicle_ids?: string[];
  id_card_number?: string;
  id_card_expiry_date?: string;
  police_conduct_expiry_date?: string;
  driving_license_number?: string;
  driving_license_expiry_date?: string;
  notes?: string;
  settlement_driver_share_pct?: number | null;
  settlement_tips_driver_pct?: number | null;
  settlement_campaigns_driver_pct?: number | null;
  settlement_fee_driver_pct?: number | null;
}

export interface UpdateDriverInput {
  full_name?: string;
  phone?: string;
  address?: string;
  status?: DriverStatus;
  employment_type?: EmploymentType | null;
  assigned_vehicle_id?: string | null;
  assigned_vehicle_ids?: string[];
  id_card_number?: string;
  id_card_expiry_date?: string;
  police_conduct_expiry_date?: string;
  driving_license_number?: string;
  driving_license_expiry_date?: string;
  tag_license_expiry_date?: string;
  notes?: string;
  settlement_driver_share_pct?: number | null;
  settlement_tips_driver_pct?: number | null;
  settlement_campaigns_driver_pct?: number | null;
  settlement_fee_driver_pct?: number | null;
}

export interface CreateVehicleInput {
  registration_number: string;
  make: string;
  model: string;
  year?: number;
  mileage?: number;
  status?: VehicleStatus;
  assigned_driver_id?: string;
  assigned_driver_ids?: string[];
  insurance_expiry_date?: string;
  road_license_expiry_date?: string;
  color?: string;
  notes?: string;
  vehicle_model_id?: string | null;
}

export interface UpdateVehicleInput {
  registration_number?: string;
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  status?: VehicleStatus;
  assigned_driver_id?: string | null;
  assigned_driver_ids?: string[];
  insurance_expiry_date?: string;
  road_license_expiry_date?: string;
  color?: string;
  notes?: string;
  vehicle_model_id?: string | null;
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
// Driver Adjustments Types
// =============================================================================

export type AdjustmentType = 'expense' | 'bonus' | 'deduction' | 'reimbursement' | 'other';

export interface DriverAdjustment {
  id: string;
  driver_id: string;
  type: AdjustmentType;
  amount: number;
  description: string;
  date: string;
  notes: string | null;
  /** The settlement that froze this adjustment. NULL = not yet attached. */
  settlement_id: string | null;
  /** Set when generated by a recurring rule (vs. entered by hand). */
  recurring_rule_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverAdjustmentWithDriver extends DriverAdjustment {
  drivers?: Pick<Driver, 'id' | 'full_name'> | null;
}

/** How a recurring rule's amount is interpreted. */
export type RecurringAmountType = 'fixed' | 'percent_of_gross';

/**
 * A per-fleet rule that auto-generates a driver_adjustment on each settlement
 * (e.g. weekly insurance contribution, equipment rental, standing bonus).
 */
export interface RecurringAdjustment {
  id: string;
  organization_id: string;
  /** NULL = applies to every driver in the fleet; otherwise scoped to one. */
  driver_id: string | null;
  type: AdjustmentType;
  amount_type: RecurringAmountType;
  /** EUR when amount_type='fixed'; percent of gross when 'percent_of_gross'. */
  amount: number;
  description: string;
  active: boolean;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAdjustmentInput {
  driver_id: string;
  type: AdjustmentType;
  amount: number;
  description: string;
  date: string;
  notes?: string;
}

export interface UpdateAdjustmentInput {
  type?: AdjustmentType;
  amount?: number;
  description?: string;
  date?: string;
  notes?: string;
}

// =============================================================================
// Driver Settlements Types
// =============================================================================

export type SettlementStatus = 'draft' | 'finalized';

export interface DriverSettlement {
  id: string;
  driver_id: string;
  week_start: string;
  week_end: string;
  week_label: string;
  period_name: string | null;
  settlement_month: string | null;
  fss_tax: number;
  // Frozen snapshot of the settlement scheme used to price this record.
  driver_share_pct: number;
  tips_driver_pct: number;
  campaigns_driver_pct: number;
  fee_driver_pct: number;
  /** Frozen snapshot of the weekly rent deducted in this settlement. */
  rent_amount: number;
  /** Frozen net of driver adjustments linked to this settlement. Owed = final_balance + total_adjustments. */
  total_adjustments: number;
  total_gross_fare: number;
  total_net: number;
  total_balance_before_tax: number;
  final_balance: number;
  status: SettlementStatus;
  notes: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettlementPlatform {
  id: string;
  settlement_id: string;
  platform_id: string;
  platform_name: string;
  gross_fare: number;
  platform_fee_percent: number;
  fifty_percent: number;
  fee: number;
  net: number;
  cash_ride: number;
  tips: number;
  campaigns: number;
  balance: number;
  created_at: string;
}

export interface DriverSettlementWithRelations extends DriverSettlement {
  drivers?: Driver | null;
  platforms?: SettlementPlatform[];
}

export interface CreateSettlementInput {
  driver_id: string;
  week_start: string;
  week_end: string;
  week_label: string;
  period_name?: string;
  settlement_month?: string;
  fss_tax: number;
  platforms: {
    platform_id: string;
    platform_name: string;
    gross_fare: number;
    platform_fee_percent: number;
    cash_ride: number;
    tips: number;
    campaigns: number;
  }[];
  notes?: string;
  status?: SettlementStatus;
}

export interface UpdateSettlementInput {
  period_name?: string;
  settlement_month?: string;
  fss_tax?: number;
  platforms?: {
    platform_id: string;
    platform_name: string;
    gross_fare: number;
    platform_fee_percent: number;
    cash_ride: number;
    tips: number;
    campaigns: number;
  }[];
  notes?: string;
  status?: SettlementStatus;
  paid_at?: string | null;
}

// =============================================================================
// Weekly Bookkeeping Types
// =============================================================================

export interface WeeklyBookkeeping {
  id: string;
  week_start: string;
  week_end: string;
  week_label: string;
  period_name: string | null;
  
  // Income (Platform Earnings)
  uber_earnings: number;
  bolt_earnings: number;
  ecabs_earnings: number;
  other_earnings: number;
  
  // Expenses
  employees: number;      // Driver settlements
  repairs: number;
  insurance: number;
  investments: number;
  vat: number;
  rent: number;
  employee_tax: number;
  other_expenses: number;
  
  // Calculated Totals
  total_income: number;
  total_expenses: number;
  net_profit: number;
  
  // Notes
  notes: string | null;
  
  // Metadata
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeeklyBookkeepingInput {
  week_start: string;
  week_end: string;
  week_label: string;
  period_name?: string;
  uber_earnings?: number;
  bolt_earnings?: number;
  ecabs_earnings?: number;
  other_earnings?: number;
  employees?: number;
  repairs?: number;
  insurance?: number;
  investments?: number;
  vat?: number;
  rent?: number;
  employee_tax?: number;
  other_expenses?: number;
  notes?: string;
}

// =============================================================================
// Vehicle Damages Types
// =============================================================================

export type DamageSeverity = 'minor' | 'moderate' | 'severe';
export type DamageStatus = 'open' | 'repaired' | 'monitoring';

export type DamageZone =
  | 'front_bumper'
  | 'rear_bumper'
  | 'hood'
  | 'trunk'
  | 'roof'
  | 'front_left_door'
  | 'front_right_door'
  | 'rear_left_door'
  | 'rear_right_door'
  | 'front_left_fender'
  | 'front_right_fender'
  | 'rear_left_fender'
  | 'rear_right_fender'
  | 'windshield'
  | 'rear_window'
  | 'left_side'
  | 'right_side'
  | 'front_left_rim'
  | 'front_right_rim'
  | 'rear_left_rim'
  | 'rear_right_rim';

export interface VehicleDamage {
  id: string;
  vehicle_id: string;
  zone: DamageZone;
  description: string;
  severity: DamageSeverity;
  status: DamageStatus;
  repair_cost: number | null;
  currency: string;
  images: string[];
  reported_by: string | null;
  reported_at: string;
  repaired_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleDamageWithReporter extends VehicleDamage {
  reporter?: { full_name: string | null; email: string } | null;
}

export interface CreateDamageInput {
  vehicle_id: string;
  zone: DamageZone;
  description: string;
  severity?: DamageSeverity;
  status?: DamageStatus;
  repair_cost?: number;
  currency?: string;
  images?: string[];
  notes?: string;
}

export interface UpdateDamageInput {
  zone?: DamageZone;
  description?: string;
  severity?: DamageSeverity;
  status?: DamageStatus;
  repair_cost?: number | null;
  currency?: string;
  images?: string[];
  repaired_at?: string | null;
  notes?: string;
}

// =============================================================================
// Reminder / To-Do Types
// =============================================================================

export type ReminderPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ReminderStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type ReminderRecurring = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Reminder {
  id: string;
  created_by: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  priority: ReminderPriority;
  status: ReminderStatus;
  due_date: string | null;
  remind_at: string | null;
  reminder_sent: boolean;
  recurring: ReminderRecurring | null;
  recurring_end_date: string | null;
  parent_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  creator?: { full_name: string | null; email: string };
  assignee?: { full_name: string | null; email: string };
}

export interface CreateReminderInput {
  title: string;
  description?: string;
  priority?: ReminderPriority;
  assigned_to?: string | null;
  due_date?: string | null;
  remind_at?: string | null;
  recurring?: ReminderRecurring | null;
  recurring_end_date?: string | null;
}

export interface UpdateReminderInput {
  title?: string;
  description?: string | null;
  priority?: ReminderPriority;
  status?: ReminderStatus;
  assigned_to?: string | null;
  due_date?: string | null;
  remind_at?: string | null;
  recurring?: ReminderRecurring | null;
  recurring_end_date?: string | null;
}

export type AuditLogAction = 'create' | 'update' | 'delete';

export interface AuditLogEntry {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  actor_role: string;
  action: AuditLogAction;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

// =============================================================================
// Session & Auth Types
// =============================================================================

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  also_staff: boolean;
  full_name: string | null;
  driver_id?: string;
  /** The organization the user is currently acting within (the active fleet). */
  organization_id: string;
  /** Display name of the active organization. */
  organization_name: string;
  /** All organizations the user belongs to (for the org switcher). */
  memberships: MembershipInfo[];
  /** True once the fleet onboarding tour has been shown (persisted per user). */
  fleet_tour_completed?: boolean;
}

/** A user's membership in one organization, with their role there. */
export interface MembershipInfo {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: UserRole;
  also_staff: boolean;
}

/** A tenant (fleet). */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'cancelled';
  stripe_customer_id: string | null;
  /** Live Stripe subscription for this fleet (set by the billing webhook). */
  stripe_subscription_id: string | null;
  /** Mirror of the Stripe subscription status, e.g. 'active', 'past_due', 'canceled'. */
  subscription_status: string | null;
  /** End of the current paid period (renewal / expiry), from Stripe. */
  current_period_end: string | null;
  // Fleet-wide default settlement scheme (percentages, 0–100).
  settlement_driver_share_pct: number;
  settlement_tips_driver_pct: number;
  settlement_campaigns_driver_pct: number;
  settlement_fee_driver_pct: number;
  /** Preset applied to drivers without their own settlement_preset_id. */
  default_settlement_preset_id: string | null;
  /** When true, drivers without push enabled see the "Stay in the loop" prompt on login. */
  prompt_drivers_push: boolean;
  created_at: string;
  updated_at: string;
}
