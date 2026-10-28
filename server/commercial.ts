import type Database from 'better-sqlite3';

type CommercialPlan = {
  code: string; name: string; description: string; monthlyPricePaise: number | null;
  annualPricePaise: number | null; maxProperties: number; maxBeds: number;
  maxUsers: number; maxDevices: number; featured: boolean; order: number;
  features: string[];
};

// One authoritative seed catalog. Rows are inserted only when absent so admin
// pricing/entitlement edits remain intact across normal server restarts.
export const INITIAL_PLANS: CommercialPlan[] = [
  { code: 'STARTER', name: 'Starter', description: 'Essential tools for one PG or hostel.', monthlyPricePaise: 39900, annualPricePaise: 399900, maxProperties: 1, maxBeds: 30, maxUsers: 1, maxDevices: 1, featured: false, order: 1, features: ['dashboard','resident_management','room_management','booking_management','checkin_checkout','rent_management','payment_tracking','security_deposit','electricity_billing','expense_management','invoice_management','receipt_management','basic_reports','local_backup'] },
  { code: 'PRO', name: 'PRO', description: 'For growing operators managing multiple properties.', monthlyPricePaise: 69900, annualPricePaise: 699900, maxProperties: 3, maxBeds: 100, maxUsers: 10, maxDevices: 3, featured: true, order: 2, features: ['dashboard','resident_management','room_management','booking_management','checkin_checkout','rent_management','payment_tracking','security_deposit','electricity_billing','expense_management','invoice_management','receipt_management','basic_reports','local_backup','multi_property','whatsapp_reminders','staff_accounts','advanced_reports','enhanced_backup','business_reports'] },
  { code: 'BUSINESS', name: 'Business', description: 'Advanced operations and analytics for larger teams.', monthlyPricePaise: 119900, annualPricePaise: 1199900, maxProperties: 10, maxBeds: 300, maxUsers: 50, maxDevices: 10, featured: false, order: 3, features: ['dashboard','resident_management','room_management','booking_management','checkin_checkout','rent_management','payment_tracking','security_deposit','electricity_billing','expense_management','invoice_management','receipt_management','basic_reports','local_backup','multi_property','whatsapp_reminders','staff_accounts','advanced_reports','enhanced_backup','business_reports','advanced_analytics','priority_support','consolidated_reports'] },
  { code: 'ENTERPRISE', name: 'Enterprise', description: 'Custom plan for hostel chains and large operators.', monthlyPricePaise: null, annualPricePaise: null, maxProperties: -1, maxBeds: -1, maxUsers: -1, maxDevices: -1, featured: false, order: 4, features: ['dashboard','resident_management','room_management','booking_management','checkin_checkout','rent_management','payment_tracking','security_deposit','electricity_billing','expense_management','invoice_management','receipt_management','basic_reports','local_backup','multi_property','whatsapp_reminders','staff_accounts','advanced_reports','enhanced_backup','business_reports','advanced_analytics','priority_support','consolidated_reports','custom_integrations','custom_onboarding'] },
  { code: 'DESKTOP', name: 'Desktop', description: 'Annual license for one Windows PC and one property.', monthlyPricePaise: null, annualPricePaise: 799900, maxProperties: 1, maxBeds: 100, maxUsers: 1, maxDevices: 1, featured: false, order: 5, features: ['dashboard','resident_management','room_management','booking_management','checkin_checkout','rent_management','payment_tracking','security_deposit','electricity_billing','expense_management','invoice_management','receipt_management','basic_reports','local_backup'] },
];

const FEATURE_INFO: Record<string, [string, string]> = {
  dashboard: ['Dashboard', 'Business overview and metrics'], resident_management: ['Resident management', 'Manage resident profiles and stays'],
  room_management: ['Rooms and beds', 'Manage property rooms and beds'], booking_management: ['Bookings', 'Track enquiries and bookings'],
  checkin_checkout: ['Check-in and check-out', 'Manage resident arrival and departure'], rent_management: ['Rent management', 'Track rent due and collection'],
  payment_tracking: ['Payment tracking', 'Record and reconcile payments'], security_deposit: ['Security deposits', 'Track resident deposits and settlements'],
  electricity_billing: ['Electricity billing', 'Meter readings and resident bills'], expense_management: ['Expense management', 'Record business expenses'],
  invoice_management: ['Invoices', 'Create resident invoices'], receipt_management: ['Receipts', 'Record payment receipts'],
  basic_reports: ['Basic reports', 'Standard property and financial reports'], local_backup: ['Local backup', 'Download or restore local backups'],
  multi_property: ['Multi-property management', 'Operate multiple properties'], whatsapp_reminders: ['WhatsApp reminders', 'Prepare and send WhatsApp reminders'],
  staff_accounts: ['Staff accounts', 'Create team logins'], advanced_reports: ['Advanced reports', 'Detailed operational reports'],
  enhanced_backup: ['Enhanced backup', 'Additional backup capabilities'], business_reports: ['Business reports', 'Additional business reporting'],
  advanced_analytics: ['Advanced analytics', 'Consolidated business analytics'], priority_support: ['Priority support', 'Priority customer support'],
  consolidated_reports: ['Consolidated reporting', 'Cross-property consolidated reporting'], custom_integrations: ['Custom integrations', 'Custom integration options'],
  custom_onboarding: ['Custom onboarding', 'Custom onboarding and setup'],
};

export function installCommercialSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS commercial_plans (
      plan_code TEXT PRIMARY KEY, plan_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      monthly_price_paise INTEGER, annual_price_paise INTEGER, currency TEXT NOT NULL DEFAULT 'INR',
      max_properties INTEGER NOT NULL DEFAULT 1, max_beds INTEGER NOT NULL DEFAULT 30,
      max_users INTEGER NOT NULL DEFAULT 1, max_devices INTEGER NOT NULL DEFAULT 1,
      trial_days INTEGER NOT NULL DEFAULT 14, is_active INTEGER NOT NULL DEFAULT 1,
      is_featured INTEGER NOT NULL DEFAULT 0, display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS commercial_features (
      feature_code TEXT PRIMARY KEY, feature_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS commercial_plan_features (
      plan_code TEXT NOT NULL, feature_code TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      limit_value INTEGER, PRIMARY KEY(plan_code,feature_code),
      FOREIGN KEY(plan_code) REFERENCES commercial_plans(plan_code) ON DELETE CASCADE,
      FOREIGN KEY(feature_code) REFERENCES commercial_features(feature_code) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS commercial_trials (
      trial_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, business_id TEXT NOT NULL,
      device_id TEXT NOT NULL DEFAULT '', trial_start_date TEXT NOT NULL DEFAULT '',
      trial_end_date TEXT NOT NULL DEFAULT '', trial_status TEXT NOT NULL DEFAULT 'PENDING',
      converted_to_paid INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(business_id) REFERENCES organizations(id)
    );
    CREATE INDEX IF NOT EXISTS commercial_trials_business_idx ON commercial_trials(business_id,trial_status,trial_end_date);
    CREATE TABLE IF NOT EXISTS commercial_subscriptions (
      subscription_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, business_id TEXT NOT NULL,
      plan_code TEXT NOT NULL, plan_name_snapshot TEXT NOT NULL, billing_cycle TEXT NOT NULL,
      subscription_status TEXT NOT NULL, start_date TEXT NOT NULL DEFAULT '', end_date TEXT NOT NULL DEFAULT '',
      trial_start_date TEXT NOT NULL DEFAULT '', trial_end_date TEXT NOT NULL DEFAULT '',
      base_amount_paise INTEGER NOT NULL DEFAULT 0, discount_paise INTEGER NOT NULL DEFAULT 0,
      taxable_amount_paise INTEGER NOT NULL DEFAULT 0, cgst_paise INTEGER NOT NULL DEFAULT 0,
      sgst_paise INTEGER NOT NULL DEFAULT 0, igst_paise INTEGER NOT NULL DEFAULT 0,
      total_amount_paise INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'INR',
      payment_status TEXT NOT NULL DEFAULT 'Pending', payment_provider TEXT NOT NULL DEFAULT 'Manual',
      payment_reference TEXT NOT NULL DEFAULT '', auto_renew INTEGER NOT NULL DEFAULT 0,
      pricing_snapshot_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(plan_code) REFERENCES commercial_plans(plan_code),
      FOREIGN KEY(business_id) REFERENCES organizations(id)
    );
    CREATE INDEX IF NOT EXISTS commercial_subscriptions_business_idx ON commercial_subscriptions(business_id,subscription_status,end_date);
    CREATE TABLE IF NOT EXISTS commercial_payments (
      payment_id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL, business_id TEXT NOT NULL,
      amount_paise INTEGER NOT NULL CHECK(amount_paise>=0), currency TEXT NOT NULL DEFAULT 'INR',
      payment_status TEXT NOT NULL, payment_provider TEXT NOT NULL, provider_reference TEXT NOT NULL DEFAULT '',
      idempotency_key TEXT NOT NULL UNIQUE, method TEXT NOT NULL DEFAULT '', paid_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, FOREIGN KEY(subscription_id) REFERENCES commercial_subscriptions(subscription_id),
      FOREIGN KEY(business_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS license_device_activations (
      activation_id TEXT PRIMARY KEY, license_id TEXT NOT NULL, business_id TEXT NOT NULL,
      device_id_hash TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Active',
      activated_at TEXT NOT NULL, last_validated_at TEXT NOT NULL DEFAULT '', revoked_at TEXT NOT NULL DEFAULT '',
      UNIQUE(license_id,device_id_hash), FOREIGN KEY(license_id) REFERENCES saas_licenses(id),
      FOREIGN KEY(business_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS commercial_audit_log (
      audit_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL,
      entity TEXT NOT NULL, entity_id TEXT NOT NULL, previous_json TEXT NOT NULL DEFAULT '{}',
      new_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
    );
  `);
  const licenseColumns = db.prepare('PRAGMA table_info(saas_licenses)').all() as { name: string }[];
  if (!licenseColumns.some(c => c.name === 'plan_code')) db.exec('ALTER TABLE saas_licenses ADD COLUMN plan_code TEXT NOT NULL DEFAULT \'\'');
  if (!licenseColumns.some(c => c.name === 'subscription_id')) db.exec('ALTER TABLE saas_licenses ADD COLUMN subscription_id TEXT NOT NULL DEFAULT \'\'');
  if (!licenseColumns.some(c => c.name === 'owner_login_email')) db.exec("ALTER TABLE saas_licenses ADD COLUMN owner_login_email TEXT NOT NULL DEFAULT ''");
  if (!licenseColumns.some(c => c.name === 'owner_login_password_hash')) db.exec("ALTER TABLE saas_licenses ADD COLUMN owner_login_password_hash TEXT NOT NULL DEFAULT ''");

  const now = new Date().toISOString();
  const insertPlan = db.prepare(`INSERT OR IGNORE INTO commercial_plans
    (plan_code,plan_name,description,monthly_price_paise,annual_price_paise,currency,max_properties,max_beds,max_users,max_devices,trial_days,is_active,is_featured,display_order,created_at,updated_at)
    VALUES (@code,@name,@description,@monthlyPricePaise,@annualPricePaise,'INR',@maxProperties,@maxBeds,@maxUsers,@maxDevices,14,1,@featured,@order,@now,@now)`);
  const insertFeature = db.prepare('INSERT OR IGNORE INTO commercial_features (feature_code,feature_name,description) VALUES (?,?,?)');
  const insertPlanFeature = db.prepare('INSERT OR IGNORE INTO commercial_plan_features (plan_code,feature_code,enabled) VALUES (?,?,1)');
  const seed = db.transaction(() => {
    for (const [code, [name, description]] of Object.entries(FEATURE_INFO)) insertFeature.run(code, name, description);
    for (const plan of INITIAL_PLANS) {
      insertPlan.run({ ...plan, featured: plan.featured ? 1 : 0, now });
      for (const feature of plan.features) insertPlanFeature.run(plan.code, feature);
    }
  });
  seed();
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version,applied_at) VALUES (2,?)').run(now);
}

export function normalizePlanCode(value: string) {
  const code = String(value || '').trim().toUpperCase();
  if (code === 'GROWTH') return 'PRO';
  if (code === 'TRIAL') return 'PRO';
  return code;
}

export function exceedsPlanLimit(current: number, adding: number, limit: number) {
  return limit >= 0 && current + adding > limit;
}

export function annualSavingsPaise(monthlyPricePaise: number | null, annualPricePaise: number | null) {
  if (monthlyPricePaise === null || annualPricePaise === null) return null;
  return Math.max(0, monthlyPricePaise * 12 - annualPricePaise);
}

export function trialWindow(days: number, now = new Date()) {
  const start = now.toISOString().slice(0, 10);
  const end = new Date(now.getTime() + Math.max(1, Math.min(90, Math.floor(days))) * 86400000).toISOString().slice(0, 10);
  return { startDate: start, endDate: end };
}

export function formatMoneyPaise(paise: number | null) {
  if (paise === null || !Number.isFinite(paise)) return null;
  return Math.round(paise / 100);
}
