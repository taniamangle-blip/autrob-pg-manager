// @ts-nocheck
// server/index.ts
import express from "express";
import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import Database from "better-sqlite3";
import bcrypt2 from "bcryptjs";
import crypto2 from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fsSync from "node:fs";

// server/desktopTrial.ts
function getOrCreateDesktopTrial(db2, days = 7, now = Date.now()) {
  db2.exec("CREATE TABLE IF NOT EXISTS desktop_trial_state (id INTEGER PRIMARY KEY CHECK(id=1), started_at TEXT NOT NULL, expires_at TEXT NOT NULL)");
  const existing = db2.prepare("SELECT started_at as startedAt,expires_at as expiresAt FROM desktop_trial_state WHERE id=1").get();
  if (existing) return existing;
  const startedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + days * 864e5).toISOString();
  db2.prepare("INSERT INTO desktop_trial_state (id,started_at,expires_at) VALUES (1,?,?)").run(startedAt, expiresAt);
  return { startedAt, expiresAt };
}
function getDesktopTrialStatus(trial, now = Date.now()) {
  const remaining = Math.max(0, Date.parse(trial.expiresAt) - now);
  return {
    mode: "trial",
    status: remaining ? "Trial" : "Expired",
    startedAt: trial.startedAt,
    expiresAt: trial.expiresAt,
    daysRemaining: Math.ceil(remaining / 864e5),
    expired: remaining === 0
  };
}
function isDesktopTrialExpired(trial, enabled, now = Date.now()) {
  return !!(enabled && trial && getDesktopTrialStatus(trial, now).expired);
}

// server/messageTemplates.ts
var DEFAULT_MESSAGE_TEMPLATES = [
  {
    "templateKey": "system-01",
    "name": "Enquiry Received",
    "category": "ENQUIRY & BOOKING",
    "body": "Hi {{ResidentName}},\n\nThank you for your enquiry about accommodation at {{PropertyName}}.\n\nWe have received your request and will get back to you shortly with availability and stay details.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-02",
    "name": "Room/Bed Availability",
    "category": "ENQUIRY & BOOKING",
    "body": "Hi {{ResidentName}},\n\nGood news! We currently have accommodation available at {{PropertyName}}.\n\nRoom/Bed: {{RoomNumber}} / {{BedNumber}}\nMonthly Rent: \u20B9{{RentAmount}}\n\nPlease contact us if you would like to proceed with the booking.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-03",
    "name": "Booking Confirmation",
    "category": "ENQUIRY & BOOKING",
    "body": "Hi {{ResidentName}},\n\nYour booking at {{PropertyName}} is confirmed. \u{1F389}\n\nRoom/Bed: {{RoomNumber}} / {{BedNumber}}\nCheck-in Date: {{CheckInDate}}\nMonthly Rent: \u20B9{{RentAmount}}\nSecurity Deposit: \u20B9{{DepositAmount}}\n\nWe look forward to welcoming you!\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-04",
    "name": "Advance Payment Received",
    "category": "ENQUIRY & BOOKING",
    "body": "Hi {{ResidentName}},\n\nWe have received your advance/booking payment of \u20B9{{Amount}}.\n\nYour booking at {{PropertyName}} has been updated successfully.\n\nThank you!\n\n\u2014 {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-05",
    "name": "Upcoming Check-in Reminder",
    "category": "CHECK-IN & WELCOME",
    "body": "Hi {{ResidentName}},\n\nThis is a reminder that your check-in at {{PropertyName}} is scheduled for {{CheckInDate}}.\n\nRoom/Bed: {{RoomNumber}} / {{BedNumber}}\n\nPlease keep your required ID/KYC documents ready.\n\nWe look forward to welcoming you!\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-06",
    "name": "Welcome Message",
    "category": "CHECK-IN & WELCOME",
    "body": "Hi {{ResidentName}} \u{1F44B}\n\nWelcome to {{PropertyName}}!\n\nRoom/Bed: {{RoomNumber}} / {{BedNumber}}\n\nWe hope you have a comfortable and pleasant stay with us.\n\nFor any assistance, please contact {{ContactNumber}}.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-07",
    "name": "KYC/Documents Pending",
    "category": "CHECK-IN & WELCOME",
    "body": "Hi {{ResidentName}},\n\nYour KYC/document verification for your stay at {{PropertyName}} is still pending.\n\nPlease submit the required documents at the earliest.\n\nIf already submitted, please ignore this message.\n\nThank you.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-08",
    "name": "House Rules",
    "category": "CHECK-IN & WELCOME",
    "body": "Hi {{ResidentName}},\n\nA friendly reminder to please follow the house rules of {{PropertyName}} for a safe and comfortable environment for everyone.\n\nPlease check the House Rules section or contact management if you need any clarification.\n\nThank you for your cooperation.\n\n\u2014 {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-09",
    "name": "Upcoming Rent Reminder",
    "category": "RENT & PAYMENTS",
    "body": "Hi {{ResidentName}},\n\nA friendly reminder that your rent of \u20B9{{RentAmount}} is due on {{DueDate}}.\n\nPlease make the payment on or before the due date to avoid late charges.\n\nIf already paid, please ignore this message.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-10",
    "name": "Rent Due Today",
    "category": "RENT & PAYMENTS",
    "body": "Hi {{ResidentName}},\n\nYour rent of \u20B9{{RentAmount}} for {{PropertyName}} is due today.\n\nPlease complete the payment today to avoid late charges of \u20B950 per day from the applicable overdue date.\n\nIf already paid, please ignore this message.\n\nThank you.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-11",
    "name": "Rent Overdue",
    "category": "RENT & PAYMENTS",
    "body": "Hi {{ResidentName}},\n\nYour rent payment is overdue.\n\nRent: \u20B9{{RentAmount}}\nDue Date: {{DueDate}}\nDays Late: {{LateDays}}\nLate Fee: \u20B9{{LateFee}}\nTotal Due: \u20B9{{TotalDue}}\n\nPlease clear the outstanding amount at the earliest.\n\nIf already paid, please contact management so we can update our records.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-12",
    "name": "Payment Received",
    "category": "RENT & PAYMENTS",
    "body": "Hi {{ResidentName}},\n\nPayment received successfully. \u2705\n\nAmount: \u20B9{{Amount}}\nFor: {{PaymentType}}\nPayment Date: {{PaymentDate}}\nReceipt No.: {{ReceiptNumber}}\n\nThank you!\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-13",
    "name": "Pending Payment",
    "category": "RENT & PAYMENTS",
    "body": "Hi {{ResidentName}},\n\nThis is a reminder that \u20B9{{TotalDue}} is currently pending on your account at {{PropertyName}}.\n\nPlease clear the outstanding amount at the earliest.\n\nIf you believe this amount is incorrect, please contact management.\n\n\u2014 {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-14",
    "name": "Electricity Bill Generated",
    "category": "ELECTRICITY & OTHER CHARGES",
    "body": "Hi {{ResidentName}},\n\nYour electricity bill for the current billing period has been generated.\n\nUnits/Share: {{ElectricityUnits}}\nElectricity Amount: \u20B9{{ElectricityAmount}}\nDue Date: {{DueDate}}\n\nPlease make the payment on or before the due date.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-15",
    "name": "Additional Charges",
    "category": "ELECTRICITY & OTHER CHARGES",
    "body": "Hi {{ResidentName}},\n\nAn additional charge has been added to your account.\n\nCharge: {{PaymentType}}\nAmount: \u20B9{{Amount}}\nDue Date: {{DueDate}}\n\nPlease check your account for details or contact management if you have any questions.\n\n\u2014 {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-16",
    "name": "Cleaning Schedule",
    "category": "STAY & PROPERTY OPERATIONS",
    "body": "Hi {{ResidentName}},\n\nCleaning for your room/common area is scheduled for:\n\nDate: {{ScheduledDate}}\nTime: {{ScheduledTime}}\n\nPlease cooperate with the housekeeping team.\n\nThank you.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-17",
    "name": "Maintenance Notice",
    "category": "STAY & PROPERTY OPERATIONS",
    "body": "Hi {{ResidentName}},\n\nMaintenance work is scheduled at {{PropertyName}}.\n\nDate: {{ScheduledDate}}\nTime: {{ScheduledTime}}\n\nThere may be temporary inconvenience during this period.\n\nThank you for your patience and cooperation.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-18",
    "name": "Water Supply Notice",
    "category": "STAY & PROPERTY OPERATIONS",
    "body": "Hi {{ResidentName}},\n\nPlease note that the water supply may be temporarily affected at {{PropertyName}}.\n\nDate: {{ScheduledDate}}\nExpected Time: {{ScheduledTime}}\n\nWe apologize for the inconvenience and appreciate your cooperation.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-19",
    "name": "Electricity/Power Notice",
    "category": "STAY & PROPERTY OPERATIONS",
    "body": "Hi {{ResidentName}},\n\nPlease note that electricity/power supply may be temporarily affected at {{PropertyName}}.\n\nDate: {{ScheduledDate}}\nExpected Time: {{ScheduledTime}}\n\nThank you for your understanding.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-20",
    "name": "Wi-Fi/Internet Notice",
    "category": "STAY & PROPERTY OPERATIONS",
    "body": "Hi {{ResidentName}},\n\nThe Wi-Fi/internet service at {{PropertyName}} is currently undergoing maintenance.\n\nWe are working to restore the service as soon as possible.\n\nThank you for your patience.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-21",
    "name": "Parcel Received",
    "category": "STAY & PROPERTY OPERATIONS",
    "body": "Hi {{ResidentName}},\n\nA parcel/delivery has been received for you at {{PropertyName}}.\n\nPlease collect it from the designated collection point/reception.\n\nThank you.\n\n\u2014 {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-22",
    "name": "Complaint Received",
    "category": "COMPLAINTS & SERVICE REQUESTS",
    "body": "Hi {{ResidentName}},\n\nWe have received your complaint/service request.\n\nComplaint No.: {{ComplaintNumber}}\nIssue: {{ComplaintType}}\n\nOur team will review it and take the necessary action.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-23",
    "name": "Complaint In Progress",
    "category": "COMPLAINTS & SERVICE REQUESTS",
    "body": "Hi {{ResidentName}},\n\nYour complaint/service request {{ComplaintNumber}} is currently being worked on.\n\nIssue: {{ComplaintType}}\n\nWe will notify you once it has been resolved.\n\nThank you for your patience.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-24",
    "name": "Complaint Resolved",
    "category": "COMPLAINTS & SERVICE REQUESTS",
    "body": "Hi {{ResidentName}},\n\nYour complaint/service request has been marked as resolved. \u2705\n\nComplaint No.: {{ComplaintNumber}}\nIssue: {{ComplaintType}}\n\nIf the issue still persists, please contact management.\n\n\u2014 {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-25",
    "name": "General Notice",
    "category": "RULES, WARNINGS & NOTICES",
    "body": "Hi {{ResidentName}},\n\nImportant notice from {{PropertyName}}:\n\n{{CustomMessage}}\n\nThank you.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-26",
    "name": "Rule Violation Warning",
    "category": "RULES, WARNINGS & NOTICES",
    "body": "Hi {{ResidentName}},\n\nThis is a notice regarding a violation of the property/house rules at {{PropertyName}}.\n\nIssue:\n{{CustomMessage}}\n\nPlease ensure that the property rules are followed going forward.\n\nIf you need clarification, please contact management.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-27",
    "name": "Visitor Policy Reminder",
    "category": "RULES, WARNINGS & NOTICES",
    "body": "Hi {{ResidentName}},\n\nA friendly reminder to follow the visitor policy of {{PropertyName}}.\n\nPlease ensure that all visitors comply with the property's entry, timing and identification requirements.\n\nThank you for your cooperation.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-28",
    "name": "Emergency/Security Notice",
    "category": "RULES, WARNINGS & NOTICES",
    "body": "IMPORTANT NOTICE \u2014 {{PropertyName}}\n\nHi {{ResidentName}},\n\n{{CustomMessage}}\n\nPlease follow the instructions provided by management.\n\nFor assistance, contact {{ContactNumber}}.\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-29",
    "name": "Stay Renewal Reminder",
    "category": "RENEWAL",
    "body": "Hi {{ResidentName}},\n\nYour current stay period at {{PropertyName}} is approaching its renewal date.\n\nCurrent/Expected End Date: {{CheckOutDate}}\n\nPlease let us know whether you would like to continue your stay.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-30",
    "name": "Rent Revision Notice",
    "category": "RENEWAL",
    "body": "Hi {{ResidentName}},\n\nPlease note that your monthly rent at {{PropertyName}} will be revised.\n\nCurrent Rent: \u20B9{{RentAmount}}\nNew Rent: \u20B9{{NewRentAmount}}\nEffective From: {{EffectiveDate}}\n\nPlease contact management if you need any clarification.\n\n\u2014 {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-31",
    "name": "Checkout Reminder",
    "category": "CHECKOUT",
    "body": "Hi {{ResidentName}},\n\nThis is a reminder that your scheduled checkout from {{PropertyName}} is on {{CheckOutDate}}.\n\nRoom/Bed: {{RoomNumber}} / {{BedNumber}}\n\nPlease ensure that all pending dues and checkout formalities are completed before leaving.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-32",
    "name": "Pending Dues Before Checkout",
    "category": "CHECKOUT",
    "body": "Hi {{ResidentName}},\n\nYour checkout is scheduled for {{CheckOutDate}}.\n\nOutstanding Amount: \u20B9{{TotalDue}}\n\nPlease clear all pending dues before completing checkout.\n\nIf already paid, please contact management to update the records.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-33",
    "name": "Room Inspection",
    "category": "CHECKOUT",
    "body": "Hi {{ResidentName}},\n\nYour room/bed inspection is scheduled before checkout.\n\nDate: {{ScheduledDate}}\nTime: {{ScheduledTime}}\nRoom/Bed: {{RoomNumber}} / {{BedNumber}}\n\nPlease ensure your belongings have been removed and the space is ready for inspection.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-34",
    "name": "Security Deposit Settlement",
    "category": "CHECKOUT",
    "body": "Hi {{ResidentName}},\n\nYour security deposit settlement has been processed.\n\nSecurity Deposit: \u20B9{{DepositAmount}}\nAdjustments/Deductions: \u20B9{{DeductionAmount}}\nFinal Refund: \u20B9{{RefundAmount}}\n\nPlease check your settlement details for the complete breakdown.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-35",
    "name": "Refund Processed",
    "category": "CHECKOUT",
    "body": "Hi {{ResidentName}},\n\nYour refund of \u20B9{{RefundAmount}} has been processed successfully. \u2705\n\nRefund Date: {{PaymentDate}}\n\nThank you for staying with {{PropertyName}}.\n\n\u2014 {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-36",
    "name": "Thank You & Feedback",
    "category": "CHECKOUT",
    "body": "Hi {{ResidentName}},\n\nThank you for staying with {{PropertyName}}! \u{1F64F}\n\nWe hope you had a comfortable experience.\n\nWe would appreciate your feedback about your stay.\n\nYour feedback helps us improve our services.\n\nWe wish you all the best!\n\n\u2014 {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  }
];

// server/messageProvider.ts
var messageProviderStatus = (channel) => {
  if (channel === "WhatsApp") return { channel, configured: false, mode: "manual", label: "Manual WhatsApp handoff" };
  return { channel, configured: false, mode: "unavailable", label: "Not configured" };
};

// server/commercial.ts
var INITIAL_PLANS = [
  { code: "STARTER", name: "Starter", description: "Essential tools for one PG or hostel.", monthlyPricePaise: 39900, annualPricePaise: 399900, maxProperties: 1, maxBeds: 30, maxUsers: 1, maxDevices: 1, featured: false, order: 1, features: ["dashboard", "resident_management", "room_management", "booking_management", "checkin_checkout", "rent_management", "payment_tracking", "security_deposit", "electricity_billing", "expense_management", "invoice_management", "receipt_management", "basic_reports", "local_backup"] },
  { code: "PRO", name: "PRO", description: "For growing operators managing multiple properties.", monthlyPricePaise: 69900, annualPricePaise: 699900, maxProperties: 3, maxBeds: 100, maxUsers: 10, maxDevices: 3, featured: true, order: 2, features: ["dashboard", "resident_management", "room_management", "booking_management", "checkin_checkout", "rent_management", "payment_tracking", "security_deposit", "electricity_billing", "expense_management", "invoice_management", "receipt_management", "basic_reports", "local_backup", "multi_property", "whatsapp_reminders", "staff_accounts", "advanced_reports", "enhanced_backup", "business_reports"] },
  { code: "BUSINESS", name: "Business", description: "Advanced operations and analytics for larger teams.", monthlyPricePaise: 119900, annualPricePaise: 1199900, maxProperties: 10, maxBeds: 300, maxUsers: 50, maxDevices: 10, featured: false, order: 3, features: ["dashboard", "resident_management", "room_management", "booking_management", "checkin_checkout", "rent_management", "payment_tracking", "security_deposit", "electricity_billing", "expense_management", "invoice_management", "receipt_management", "basic_reports", "local_backup", "multi_property", "whatsapp_reminders", "staff_accounts", "advanced_reports", "enhanced_backup", "business_reports", "advanced_analytics", "priority_support", "consolidated_reports"] },
  { code: "ENTERPRISE", name: "Enterprise", description: "Custom plan for hostel chains and large operators.", monthlyPricePaise: null, annualPricePaise: null, maxProperties: -1, maxBeds: -1, maxUsers: -1, maxDevices: -1, featured: false, order: 4, features: ["dashboard", "resident_management", "room_management", "booking_management", "checkin_checkout", "rent_management", "payment_tracking", "security_deposit", "electricity_billing", "expense_management", "invoice_management", "receipt_management", "basic_reports", "local_backup", "multi_property", "whatsapp_reminders", "staff_accounts", "advanced_reports", "enhanced_backup", "business_reports", "advanced_analytics", "priority_support", "consolidated_reports", "custom_integrations", "custom_onboarding"] },
  { code: "DESKTOP", name: "Desktop", description: "Annual license for one Windows PC and one property.", monthlyPricePaise: null, annualPricePaise: 799900, maxProperties: 1, maxBeds: 100, maxUsers: 1, maxDevices: 1, featured: false, order: 5, features: ["dashboard", "resident_management", "room_management", "booking_management", "checkin_checkout", "rent_management", "payment_tracking", "security_deposit", "electricity_billing", "expense_management", "invoice_management", "receipt_management", "basic_reports", "local_backup"] }
];
var FEATURE_INFO = {
  dashboard: ["Dashboard", "Business overview and metrics"],
  resident_management: ["Resident management", "Manage resident profiles and stays"],
  room_management: ["Rooms and beds", "Manage property rooms and beds"],
  booking_management: ["Bookings", "Track enquiries and bookings"],
  checkin_checkout: ["Check-in and check-out", "Manage resident arrival and departure"],
  rent_management: ["Rent management", "Track rent due and collection"],
  payment_tracking: ["Payment tracking", "Record and reconcile payments"],
  security_deposit: ["Security deposits", "Track resident deposits and settlements"],
  electricity_billing: ["Electricity billing", "Meter readings and resident bills"],
  expense_management: ["Expense management", "Record business expenses"],
  invoice_management: ["Invoices", "Create resident invoices"],
  receipt_management: ["Receipts", "Record payment receipts"],
  basic_reports: ["Basic reports", "Standard property and financial reports"],
  local_backup: ["Local backup", "Download or restore local backups"],
  multi_property: ["Multi-property management", "Operate multiple properties"],
  whatsapp_reminders: ["WhatsApp reminders", "Prepare and send WhatsApp reminders"],
  staff_accounts: ["Staff accounts", "Create team logins"],
  advanced_reports: ["Advanced reports", "Detailed operational reports"],
  enhanced_backup: ["Enhanced backup", "Additional backup capabilities"],
  business_reports: ["Business reports", "Additional business reporting"],
  advanced_analytics: ["Advanced analytics", "Consolidated business analytics"],
  priority_support: ["Priority support", "Priority customer support"],
  consolidated_reports: ["Consolidated reporting", "Cross-property consolidated reporting"],
  custom_integrations: ["Custom integrations", "Custom integration options"],
  custom_onboarding: ["Custom onboarding", "Custom onboarding and setup"]
};
function installCommercialSchema(db2) {
  db2.exec(`
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
  const licenseColumns = db2.prepare("PRAGMA table_info(saas_licenses)").all();
  if (!licenseColumns.some((c) => c.name === "plan_code")) db2.exec("ALTER TABLE saas_licenses ADD COLUMN plan_code TEXT NOT NULL DEFAULT ''");
  if (!licenseColumns.some((c) => c.name === "subscription_id")) db2.exec("ALTER TABLE saas_licenses ADD COLUMN subscription_id TEXT NOT NULL DEFAULT ''");
  if (!licenseColumns.some((c) => c.name === "owner_login_email")) db2.exec("ALTER TABLE saas_licenses ADD COLUMN owner_login_email TEXT NOT NULL DEFAULT ''");
  if (!licenseColumns.some((c) => c.name === "owner_login_password_hash")) db2.exec("ALTER TABLE saas_licenses ADD COLUMN owner_login_password_hash TEXT NOT NULL DEFAULT ''");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const insertPlan = db2.prepare(`INSERT OR IGNORE INTO commercial_plans
    (plan_code,plan_name,description,monthly_price_paise,annual_price_paise,currency,max_properties,max_beds,max_users,max_devices,trial_days,is_active,is_featured,display_order,created_at,updated_at)
    VALUES (@code,@name,@description,@monthlyPricePaise,@annualPricePaise,'INR',@maxProperties,@maxBeds,@maxUsers,@maxDevices,14,1,@featured,@order,@now,@now)`);
  const insertFeature = db2.prepare("INSERT OR IGNORE INTO commercial_features (feature_code,feature_name,description) VALUES (?,?,?)");
  const insertPlanFeature = db2.prepare("INSERT OR IGNORE INTO commercial_plan_features (plan_code,feature_code,enabled) VALUES (?,?,1)");
  const seed = db2.transaction(() => {
    for (const [code, [name, description]] of Object.entries(FEATURE_INFO)) insertFeature.run(code, name, description);
    for (const plan of INITIAL_PLANS) {
      insertPlan.run({ ...plan, featured: plan.featured ? 1 : 0, now });
      for (const feature of plan.features) insertPlanFeature.run(plan.code, feature);
    }
  });
  seed();
  db2.prepare("INSERT OR IGNORE INTO schema_migrations (version,applied_at) VALUES (2,?)").run(now);
}
function normalizePlanCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (code === "GROWTH") return "PRO";
  if (code === "TRIAL") return "PRO";
  return code;
}

// server/remoteLicense.ts
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
var uid = () => crypto.randomUUID();
var normalizeKey = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
var keyHash = (value) => crypto.createHash("sha256").update(normalizeKey(value)).digest("hex");
function registerDesktopLicenseActivation(app2, db2, userFor2, licenseAuth2) {
  const attempts = /* @__PURE__ */ new Map();
  app2.post("/api/desktop/licenses/activate", (req, res) => {
    if (process.env.NIVASBOOK_ENABLE_DESKTOP_LICENSE_ACTIVATION !== "1") {
      return res.status(404).json({ error: "Desktop license activation is not enabled." });
    }
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const record = attempts.get(ip);
    if (record && record.expiresAt > now && record.count >= 12) {
      return res.status(429).json({ error: "Too many activation attempts. Wait 15 minutes and try again." });
    }
    if (!record || record.expiresAt <= now) attempts.set(ip, { count: 1, expiresAt: now + 15 * 6e4 });
    else record.count += 1;
    const normalized = normalizeKey(req.body?.key);
    const deviceId = String(req.body?.deviceId || "");
    const ownerLoginEmail = String(req.body?.ownerLoginEmail || "").trim().toLowerCase();
    const ownerLoginPassword = String(req.body?.ownerLoginPassword || "");
    if (!/^NVB1[A-F0-9]{32}$/.test(normalized) || !/^[A-F0-9]{64}$/i.test(deviceId)) {
      return res.status(400).json({ error: "Enter a valid activation key from the platform administrator." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerLoginEmail) || ownerLoginPassword.length < 10 || ownerLoginPassword.length > 200) {
      return res.status(400).json({ error: "Enter the owner login email and password that were set when this license was issued." });
    }
    const license = db2.prepare(`SELECT l.id,l.organization_id as organizationId,l.plan,l.plan_code as planCode,
      l.starts_at as startsAt,l.expires_at as expiresAt,l.status,l.key_hint as keyHint,
      l.owner_login_email as ownerLoginEmail,l.owner_login_password_hash as ownerLoginPasswordHash,
      o.name as pgName,u.id as ownerId,u.email as registeredOwnerEmail,u.password_hash as registeredPasswordHash
      FROM saas_licenses l JOIN organizations o ON o.id=l.organization_id
      JOIN users u ON u.id=o.owner_user_id WHERE l.key_hash=?`).get(keyHash(normalized));
    if (!license) return res.status(404).json({ error: "That activation key was not found." });
    const matchesRegisteredOwner = ownerLoginEmail === String(license.registeredOwnerEmail || "").toLowerCase() && bcrypt.compareSync(ownerLoginPassword, String(license.registeredPasswordHash || ""));
    const matchesLegacyLicenseLogin = Boolean(license.ownerLoginPasswordHash) && ownerLoginEmail === String(license.ownerLoginEmail || "").toLowerCase() && bcrypt.compareSync(ownerLoginPassword, license.ownerLoginPasswordHash);
    if (!matchesRegisteredOwner && !matchesLegacyLicenseLogin) {
      return res.status(401).json({ error: "Use the registered owner account email and password for this license." });
    }
    if (license.status === "Revoked") return res.status(409).json({ error: "This activation key has been revoked." });
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    if (license.startsAt > today || license.expiresAt < today || license.status === "Expired") {
      if (license.status === "Issued") db2.prepare("UPDATE saas_licenses SET status='Expired' WHERE id=? AND status='Issued'").run(license.id);
      return res.status(400).json({ error: "This activation key is outside its valid dates." });
    }
    const deviceHash = crypto.createHash("sha256").update(deviceId).digest("hex");
    const existing = db2.prepare("SELECT activation_id as activationId,status FROM license_device_activations WHERE license_id=? AND device_id_hash=?").get(license.id, deviceHash);
    if (existing?.status === "Revoked") return res.status(409).json({ error: "This device activation was reset by the platform administrator." });
    const activeCount = Number(db2.prepare("SELECT COUNT(*) as count FROM license_device_activations WHERE license_id=? AND status='Active'").get(license.id)?.count || 0);
    const planCode = normalizePlanCode(license.planCode || license.plan);
    const plan = db2.prepare("SELECT max_devices as maxDevices FROM commercial_plans WHERE plan_code=?").get(planCode);
    const maxDevices = 1;
    if (!existing && activeCount >= maxDevices) {
      return res.status(409).json({ error: `This license is already activated on its ${maxDevices} permitted device${maxDevices === 1 ? "" : "s"}. Ask the administrator to reset a device.` });
    }
    const activatedAt = nowIso();
    const activate = db2.transaction(() => {
      db2.prepare("UPDATE saas_licenses SET status='Active',activated_by=?,activated_at=CASE WHEN activated_at='' THEN ? ELSE activated_at END WHERE id=? AND status IN ('Issued','Active')").run(license.ownerId, activatedAt, license.id);
      db2.prepare("UPDATE organizations SET plan=?,status='Active',trial_ends_at='',next_billing_at=? WHERE id=?").run(license.plan, license.expiresAt, license.organizationId);
      db2.prepare("UPDATE commercial_trials SET trial_status='CONVERTED',converted_to_paid=1,updated_at=? WHERE business_id=? AND trial_status IN ('ACTIVE','EXPIRED')").run(activatedAt, license.organizationId);
      if (!existing) {
        db2.prepare(`INSERT INTO license_device_activations
          (activation_id,license_id,business_id,device_id_hash,device_name,status,activated_at,last_validated_at)
          VALUES (?,?,?,?,?,'Active',?,?)`).run(uid(), license.id, license.organizationId, deviceHash, "Windows Desktop", activatedAt, activatedAt);
      } else {
        db2.prepare("UPDATE license_device_activations SET last_validated_at=? WHERE activation_id=?").run(activatedAt, existing.activationId);
      }
      db2.prepare("INSERT INTO commercial_audit_log (audit_id,actor_id,action,entity,entity_id,previous_json,new_json,created_at) VALUES (?,?,?,?,?,?,?,?)").run(uid(), license.ownerId, existing ? "desktop_license.revalidated" : "desktop_license.activated", "license", license.id, "{}", JSON.stringify({ deviceHash, planCode }), activatedAt);
    });
    activate();
    res.json({ ok: true, plan: license.plan, expiresAt: license.expiresAt, pgName: license.pgName, ownerLoginEmail: license.ownerLoginEmail });
  });
  app2.post("/api/license/activate", licenseAuth2, async (req, res, next) => {
    const licenseServerUrl = process.env.NIVASBOOK_LICENSE_SERVER_URL?.trim();
    const desktop = Boolean(process.env.NIVASBOOK_DESKTOP_TOKEN);
    if (!desktop || !licenseServerUrl) return next();
    const user = userFor2(req);
    if (!user) return res.status(401).json({ error: "Please sign in to continue." });
    const deviceToken = process.env.NIVASBOOK_DESKTOP_TOKEN || "";
    const deviceId = crypto.createHash("sha256").update(deviceToken).digest("hex");
    try {
      const endpoint = new URL("/api/desktop/licenses/activate", licenseServerUrl);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: req.body?.key, deviceId, ownerLoginEmail: req.body?.ownerLoginEmail, ownerLoginPassword: req.body?.ownerLoginPassword }),
        signal: AbortSignal.timeout(15e3)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return res.status(response.status).json({ error: result.error || "The license server rejected this activation." });
      const normalized = normalizeKey(req.body?.key);
      const hash2 = keyHash(normalized);
      const licenseId = uid();
      const activatedAt = nowIso();
      const planCode = normalizePlanCode(result.plan);
      const applyLocal = db2.transaction(() => {
        const existing = db2.prepare("SELECT id FROM saas_licenses WHERE key_hash=?").get(hash2);
        if (existing) {
          db2.prepare("UPDATE saas_licenses SET status='Active',activated_by=?,activated_at=?,expires_at=?,plan=?,plan_code=? WHERE id=?").run(user.id, activatedAt, result.expiresAt, result.plan, planCode, existing.id);
        } else {
          db2.prepare(`INSERT INTO saas_licenses
            (id,organization_id,key_hash,key_hint,plan,starts_at,expires_at,status,activated_by,activated_at,created_by,created_at,revoked_at,plan_code,subscription_id)
            VALUES (?,?,?,?,?,?,?,'Active',?,?,?,?,'',?,?)`).run(
            licenseId,
            user.organizationId,
            hash2,
            "\u2022\u2022\u2022\u2022 " + normalized.slice(-4),
            result.plan,
            (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
            result.expiresAt,
            user.id,
            activatedAt,
            user.id,
            activatedAt,
            planCode,
            ""
          );
        }
        db2.prepare("UPDATE organizations SET plan=?,status='Active',trial_ends_at='',next_billing_at=? WHERE id=?").run(result.plan, result.expiresAt, user.organizationId);
        db2.prepare("UPDATE commercial_trials SET trial_status='CONVERTED',converted_to_paid=1,updated_at=? WHERE business_id=? AND trial_status IN ('ACTIVE','EXPIRED')").run(activatedAt, user.organizationId);
        db2.prepare("INSERT INTO activities (id,organization_id,title,detail,kind,created_at) VALUES (?,?,?,?,?,?)").run(uid(), user.organizationId, "Paid plan activated", result.plan + " plan \xB7 valid until " + result.expiresAt, "license", activatedAt);
        db2.prepare("INSERT INTO audit_log (id,organization_id,user_id,action,entity,entity_id,created_at) VALUES (?,?,?,?,?,?,?)").run(uid(), user.organizationId, user.id, "license.activated.remotely", "license", licenseId, activatedAt);
      });
      applyLocal();
      return res.json({ ok: true, plan: result.plan, status: "Active", expiresAt: result.expiresAt });
    } catch (error) {
      console.error("Desktop remote license activation failed:", error);
      return res.status(502).json({ error: "Could not reach the license server. Check your internet connection and try again." });
    }
  });
}

// server/index.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var root = path.resolve(__dirname, "..");
var isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  const requiredEnvironment = ["NIVASBOOK_SESSION_SECRET", "NIVASBOOK_OWNER_EMAIL", "NIVASBOOK_OWNER_PASSWORD", "NIVASBOOK_PLATFORM_EMAIL", "NIVASBOOK_PLATFORM_PASSWORD"];
  const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]?.trim());
  if (missingEnvironment.length) {
    throw new Error(`Missing required production environment variables: ${missingEnvironment.join(", ")}`);
  }
}
var dataDir = process.env.NIVASBOOK_DATA_DIR || path.join(root, "data");
var fs = await import("node:fs/promises");
await fs.mkdir(dataDir, { recursive: true });
var databasePath = path.join(dataDir, "nivasbook.sqlite");
var db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS desktop_master_license (id INTEGER PRIMARY KEY CHECK(id=1), activated_at TEXT NOT NULL, expires_at TEXT NOT NULL DEFAULT '', key_hint TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS owner_master_licenses (organization_id TEXT PRIMARY KEY, activated_by TEXT NOT NULL, activated_at TEXT NOT NULL, key_hint TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS resident_portal_tokens (token_hash TEXT PRIMARY KEY, resident_id TEXT NOT NULL DEFAULT '', phone_key TEXT NOT NULL DEFAULT '', expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, organization_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS org_settings (organization_id TEXT PRIMARY KEY, owner_phone TEXT NOT NULL DEFAULT '', business_name TEXT NOT NULL DEFAULT '', business_address TEXT NOT NULL DEFAULT '', payment_upi TEXT NOT NULL DEFAULT '', bank_name TEXT NOT NULL DEFAULT '', bank_account TEXT NOT NULL DEFAULT '', bank_ifsc TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS properties (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'PG / Co-living', beds INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, floor_name TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, number TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'Standard', created_at TEXT NOT NULL, floor_name TEXT NOT NULL DEFAULT '', UNIQUE(organization_id,property_id,number), FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS beds (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, room_id TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(room_id,label), FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS meter_readings (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, meter_type TEXT NOT NULL CHECK(meter_type IN ('Main meter','Sub meter')), period_year INTEGER NOT NULL, period_month INTEGER NOT NULL, floor_name TEXT NOT NULL DEFAULT '', room_id TEXT, room_number TEXT NOT NULL DEFAULT '', common_reading REAL NOT NULL DEFAULT 0, reading REAL, created_at TEXT NOT NULL, FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE, FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS electricity_cycles (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, period_year INTEGER NOT NULL, period_month INTEGER NOT NULL, rate REAL NOT NULL CHECK(rate>0), status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Finalized')), finalized_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,property_id,period_year,period_month), FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS electricity_bills (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, cycle_id TEXT NOT NULL, resident_id TEXT NOT NULL, resident_name TEXT NOT NULL, room TEXT NOT NULL, stay_days INTEGER NOT NULL, room_units REAL NOT NULL, common_units REAL NOT NULL, total_units REAL NOT NULL, rate REAL NOT NULL, amount REAL NOT NULL, paid_amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Unpaid', audit_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(cycle_id,resident_id), FOREIGN KEY(cycle_id) REFERENCES electricity_cycles(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS electricity_bill_revisions (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, cycle_id TEXT NOT NULL, revision INTEGER NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(cycle_id,revision), FOREIGN KEY(cycle_id) REFERENCES electricity_cycles(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS electricity_payments (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, cycle_id TEXT NOT NULL, bill_id TEXT NOT NULL, resident_id TEXT NOT NULL, amount REAL NOT NULL CHECK(amount>0), paid_date TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'UPI', created_at TEXT NOT NULL, FOREIGN KEY(cycle_id) REFERENCES electricity_cycles(id) ON DELETE CASCADE, FOREIGN KEY(bill_id) REFERENCES electricity_bills(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS residents (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, property_id TEXT, property TEXT NOT NULL, room TEXT NOT NULL DEFAULT '', rent INTEGER NOT NULL DEFAULT 0, due TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Pending', joined TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'mint', created_at TEXT NOT NULL, security_deposit INTEGER NOT NULL DEFAULT 0, move_in_date TEXT NOT NULL DEFAULT '', occupancy_status TEXT NOT NULL DEFAULT 'Active', exit_date TEXT NOT NULL DEFAULT '', FOREIGN KEY(property_id) REFERENCES properties(id));
CREATE TABLE IF NOT EXISTS resident_room_history (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, resident_id TEXT NOT NULL, previous_property TEXT NOT NULL, previous_room TEXT NOT NULL, previous_floor TEXT NOT NULL DEFAULT '', current_property TEXT NOT NULL, current_room TEXT NOT NULL, current_floor TEXT NOT NULL DEFAULT '', switched_at TEXT NOT NULL, FOREIGN KEY(resident_id) REFERENCES residents(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS resident_stays (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, resident_id TEXT NOT NULL, property_id TEXT, property TEXT NOT NULL, room TEXT NOT NULL DEFAULT '', rent INTEGER NOT NULL DEFAULT 0, due TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Pending', move_in_date TEXT NOT NULL DEFAULT '', stay_type TEXT NOT NULL DEFAULT 'Day Pass', check_out_date TEXT NOT NULL DEFAULT '', per_day_rent INTEGER NOT NULL DEFAULT 0, occupancy_status TEXT NOT NULL DEFAULT 'Active', exit_date TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, FOREIGN KEY(resident_id) REFERENCES residents(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, resident_id TEXT, resident TEXT NOT NULL, property TEXT NOT NULL, amount INTEGER NOT NULL, date TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'UPI', purpose TEXT NOT NULL DEFAULT 'Monthly rent', status TEXT NOT NULL DEFAULT 'Paid', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, amount INTEGER NOT NULL, vendor TEXT NOT NULL DEFAULT '', date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS food_items (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Meal', price REAL NOT NULL CHECK(price>=0), active INTEGER NOT NULL DEFAULT 1, is_system INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,name));
CREATE TABLE IF NOT EXISTS food_bills (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, resident_id TEXT NOT NULL, resident_name TEXT NOT NULL, property TEXT NOT NULL, room TEXT NOT NULL DEFAULT '', items_json TEXT NOT NULL, amount REAL NOT NULL CHECK(amount>=0), bill_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending', created_at TEXT NOT NULL, FOREIGN KEY(resident_id) REFERENCES residents(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS food_bills_org_date_idx ON food_bills(organization_id,bill_date);
CREATE TABLE IF NOT EXISTS enquiries (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, property TEXT NOT NULL, room TEXT NOT NULL, budget INTEGER NOT NULL DEFAULT 0, move_in TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'Website', stage TEXT NOT NULL DEFAULT 'New enquiry', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS maintenance_requests (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property TEXT NOT NULL, room TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'General', priority TEXT NOT NULL DEFAULT 'Medium', status TEXT NOT NULL DEFAULT 'New', assigned_to TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Other', quantity INTEGER NOT NULL DEFAULT 1, unit_value INTEGER NOT NULL DEFAULT 0, purchase_date TEXT NOT NULL DEFAULT '', condition TEXT NOT NULL DEFAULT 'Good', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS resident_item_issues (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, resident_id TEXT NOT NULL, resident_name TEXT NOT NULL, property TEXT NOT NULL, room TEXT NOT NULL DEFAULT '', bed TEXT NOT NULL DEFAULT '', issue_date TEXT NOT NULL, items_json TEXT NOT NULL DEFAULT '{}', utensils_description TEXT NOT NULL DEFAULT '', condition TEXT NOT NULL CHECK(condition IN ('New','Previous')), created_at TEXT NOT NULL, FOREIGN KEY(resident_id) REFERENCES residents(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, resident_id TEXT, resident TEXT NOT NULL, property TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Prepared', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS message_templates (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, template_key TEXT, name TEXT NOT NULL, category TEXT NOT NULL, body TEXT NOT NULL, default_body TEXT NOT NULL DEFAULT '', default_channel TEXT NOT NULL DEFAULT 'WhatsApp', active INTEGER NOT NULL DEFAULT 1, is_system INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,template_key));
CREATE TABLE IF NOT EXISTS message_settings (organization_id TEXT PRIMARY KEY, sender_name TEXT NOT NULL DEFAULT '', signature TEXT NOT NULL DEFAULT '', preferred_channel TEXT NOT NULL DEFAULT 'WhatsApp', late_fee_enabled INTEGER NOT NULL DEFAULT 1, late_fee_daily REAL NOT NULL DEFAULT 50, grace_period_days INTEGER NOT NULL DEFAULT 0, maximum_late_fee REAL, default_reminder_days INTEGER NOT NULL DEFAULT 3, whatsapp_configured INTEGER NOT NULL DEFAULT 0, sms_configured INTEGER NOT NULL DEFAULT 0, automations_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS message_automation_rules (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL, trigger_key TEXT NOT NULL, template_key TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'WhatsApp', offset_days INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, UNIQUE(organization_id,trigger_key));
CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_user_id TEXT NOT NULL, plan TEXT NOT NULL DEFAULT 'Trial', status TEXT NOT NULL DEFAULT 'Trial', trial_ends_at TEXT NOT NULL DEFAULT '', next_billing_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS platform_admins (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS saas_payments (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'INR', status TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'Bank transfer', reference TEXT NOT NULL DEFAULT '', period_start TEXT NOT NULL DEFAULT '', period_end TEXT NOT NULL DEFAULT '', paid_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, FOREIGN KEY(organization_id) REFERENCES organizations(id));
CREATE TABLE IF NOT EXISTS owner_wallets (organization_id TEXT PRIMARY KEY, balance_paise INTEGER NOT NULL DEFAULT 0 CHECK(balance_paise>=0), updated_at TEXT NOT NULL, FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS owner_wallet_transactions (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, direction TEXT NOT NULL CHECK(direction IN ('CREDIT','DEBIT')), amount_paise INTEGER NOT NULL CHECK(amount_paise>0), balance_after_paise INTEGER NOT NULL CHECK(balance_after_paise>=0), reference_type TEXT NOT NULL, reference_id TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, UNIQUE(organization_id,reference_type,reference_id,direction), FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS owner_wallet_transactions_org_date_idx ON owner_wallet_transactions(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS owner_wallet_recharge_requests (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, amount_paise INTEGER NOT NULL CHECK(amount_paise>0), note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')), reviewed_by TEXT NOT NULL DEFAULT '', reviewed_at TEXT NOT NULL DEFAULT '', transaction_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS saas_licenses (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, key_hint TEXT NOT NULL, plan TEXT NOT NULL, starts_at TEXT NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Issued', activated_by TEXT NOT NULL DEFAULT '', activated_at TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT NOT NULL DEFAULT '', FOREIGN KEY(organization_id) REFERENCES organizations(id));
CREATE TABLE IF NOT EXISTS owner_business_inquiries (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', business_name TEXT NOT NULL DEFAULT '', property_count INTEGER NOT NULL DEFAULT 1, property_type TEXT NOT NULL DEFAULT '', room_count INTEGER NOT NULL DEFAULT 0, bed_count INTEGER NOT NULL DEFAULT 0, setup_status TEXT NOT NULL DEFAULT '', area TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '', pincode TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT 'India', message TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'NEW', admin_notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
`);
var desktopMasterColumns = new Set(db.prepare("PRAGMA table_info(desktop_master_license)").all().map((column) => column.name));
if (!desktopMasterColumns.has("expires_at")) db.exec("ALTER TABLE desktop_master_license ADD COLUMN expires_at TEXT NOT NULL DEFAULT ''");
installCommercialSchema(db);
var businessInquiryColumns = db.prepare("PRAGMA table_info(owner_business_inquiries)").all().map((c) => c.name);
for (const [column, definition] of [["property_count", "INTEGER NOT NULL DEFAULT 1"], ["property_type", "TEXT NOT NULL DEFAULT ''"], ["room_count", "INTEGER NOT NULL DEFAULT 0"], ["bed_count", "INTEGER NOT NULL DEFAULT 0"], ["setup_status", "TEXT NOT NULL DEFAULT ''"], ["area", "TEXT NOT NULL DEFAULT ''"], ["state", "TEXT NOT NULL DEFAULT ''"], ["pincode", "TEXT NOT NULL DEFAULT ''"], ["country", "TEXT NOT NULL DEFAULT 'India'"]]) if (!businessInquiryColumns.includes(column)) db.exec("ALTER TABLE owner_business_inquiries ADD COLUMN " + column + " " + definition);
if (!process.env.NIVASBOOK_DESKTOP_TOKEN) {
  const networkFeatures = [["public_pg_listing", "Public PG listings", "Publish properties in the Autrob customer portal"], ["booking_leads", "Booking leads", "Receive customer booking requests"], ["marketplace_access", "Owner marketplace", "Discover products and services for PG operations"], ["community_access", "Owner community", "Read the private PG owner community"], ["community_posting", "Community posting", "Submit owner posts for moderation"], ["featured_pg_listing", "Featured PG listings", "Feature a property in the customer portal"]];
  const saveNetworkFeature = db.prepare("INSERT OR IGNORE INTO commercial_features (feature_code,feature_name,description) VALUES (?,?,?)");
  for (const feature of networkFeatures) saveNetworkFeature.run(...feature);
  const defaultEntitlements = { STARTER: ["marketplace_access", "community_access", "community_posting"], PRO: ["public_pg_listing", "booking_leads", "marketplace_access", "community_access", "community_posting"], BUSINESS: ["public_pg_listing", "booking_leads", "marketplace_access", "community_access", "community_posting", "featured_pg_listing"], ENTERPRISE: ["public_pg_listing", "booking_leads", "marketplace_access", "community_access", "community_posting", "featured_pg_listing"] };
  const saveNetworkEntitlement = db.prepare("INSERT OR IGNORE INTO commercial_plan_features (plan_code,feature_code,enabled) VALUES (?,?,1)");
  for (const [plan, codes] of Object.entries(defaultEntitlements)) for (const code of codes) saveNetworkEntitlement.run(plan, code);
}
if (!process.env.NIVASBOOK_DESKTOP_TOKEN) {
  db.exec(`
CREATE TABLE IF NOT EXISTS public_property_listings (
 property_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', area TEXT NOT NULL DEFAULT '',
 public_address TEXT NOT NULL DEFAULT '', gender TEXT NOT NULL DEFAULT 'Unisex', amenities_json TEXT NOT NULL DEFAULT '[]',
 house_rules TEXT NOT NULL DEFAULT '', photos_json TEXT NOT NULL DEFAULT '[]', monthly_rent INTEGER NOT NULL DEFAULT 0,
 security_deposit INTEGER NOT NULL DEFAULT 0, public_phone TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 0,
 featured INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS public_listing_search_idx ON public_property_listings(published,city,area,monthly_rent);
CREATE TABLE IF NOT EXISTS booking_leads (
 id TEXT PRIMARY KEY, booking_no TEXT NOT NULL UNIQUE, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
 customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', gender TEXT NOT NULL DEFAULT '',
 occupation TEXT NOT NULL DEFAULT '', occupants INTEGER NOT NULL DEFAULT 1, room_preference TEXT NOT NULL DEFAULT '',
 move_in TEXT NOT NULL DEFAULT '', duration TEXT NOT NULL DEFAULT '', budget INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'NEW', owner_notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS booking_leads_org_status_idx ON booking_leads(organization_id,status,created_at);
CREATE TABLE IF NOT EXISTS resident_stay_requirements (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', area TEXT NOT NULL, budget INTEGER NOT NULL DEFAULT 0, profession TEXT NOT NULL DEFAULT '', gender TEXT NOT NULL DEFAULT '', preference TEXT NOT NULL DEFAULT '', move_in TEXT NOT NULL DEFAULT '', duration TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'OPEN', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS resident_stay_requirements_status_idx ON resident_stay_requirements(status,created_at);
CREATE TABLE IF NOT EXISTS resident_enquiry_accounts (phone_key TEXT PRIMARY KEY, password_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS resident_portal_signups (phone_key TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS resident_portal_suspensions (phone_key TEXT PRIMARY KEY, suspended INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS resident_stay_quotes (id TEXT PRIMARY KEY, requirement_id TEXT NOT NULL, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, property_name TEXT NOT NULL, listing_title TEXT NOT NULL DEFAULT '', listing_slug TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL DEFAULT '', area TEXT NOT NULL DEFAULT '', monthly_rent REAL NOT NULL DEFAULT 0, security_deposit REAL NOT NULL DEFAULT 0, room_preference TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'QUOTED', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(requirement_id,organization_id), FOREIGN KEY(requirement_id) REFERENCES resident_stay_requirements(id) ON DELETE CASCADE, FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS resident_stay_quotes_org_idx ON resident_stay_quotes(organization_id,created_at);
CREATE TABLE IF NOT EXISTS owner_business_inquiries (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', business_name TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'NEW', admin_notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS owner_business_inquiries_status_idx ON owner_business_inquiries(status,created_at);
CREATE TABLE IF NOT EXISTS marketplace_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, kind TEXT NOT NULL DEFAULT 'Product', active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS marketplace_listings (
 id TEXT PRIMARY KEY, organization_id TEXT, category_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'Product', title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL DEFAULT '', price REAL, price_type TEXT NOT NULL DEFAULT 'On Request',
 city TEXT NOT NULL DEFAULT '', service_area TEXT NOT NULL DEFAULT '', seller TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
 whatsapp TEXT NOT NULL DEFAULT '', availability TEXT NOT NULL DEFAULT 'Available', status TEXT NOT NULL DEFAULT 'Active',
 featured INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(category_id) REFERENCES marketplace_categories(id));
CREATE INDEX IF NOT EXISTS marketplace_listing_search_idx ON marketplace_listings(status,category_id,city,kind,created_at);
CREATE TABLE IF NOT EXISTS marketplace_enquiries (
 id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, organization_id TEXT NOT NULL, requester_name TEXT NOT NULL,
 business_name TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL, quantity TEXT NOT NULL DEFAULT '',
 requirement TEXT NOT NULL DEFAULT '', preferred_date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'NEW', created_at TEXT NOT NULL,
 FOREIGN KEY(listing_id) REFERENCES marketplace_listings(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS marketplace_enquiries_org_idx ON marketplace_enquiries(organization_id,status,created_at);
CREATE TABLE IF NOT EXISTS community_posts (
 id TEXT PRIMARY KEY, organization_id TEXT, owner_name TEXT NOT NULL, business_name TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
 category TEXT NOT NULL DEFAULT 'General', title TEXT NOT NULL, body TEXT NOT NULL, images_json TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'PENDING', official INTEGER NOT NULL DEFAULT 0, important INTEGER NOT NULL DEFAULT 0,
 pinned INTEGER NOT NULL DEFAULT 0, rejection_reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, approved_at TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS community_posts_feed_idx ON community_posts(status,pinned,created_at);
CREATE TABLE IF NOT EXISTS community_comments (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL, organization_id TEXT NOT NULL, owner_name TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL,
 FOREIGN KEY(post_id) REFERENCES community_posts(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS community_likes (post_id TEXT NOT NULL, organization_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(post_id,organization_id), FOREIGN KEY(post_id) REFERENCES community_posts(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS community_reports (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL, comment_id TEXT NOT NULL DEFAULT '', organization_id TEXT NOT NULL, reason TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'NEW', created_at TEXT NOT NULL, reviewed_at TEXT NOT NULL DEFAULT '',
 FOREIGN KEY(post_id) REFERENCES community_posts(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS community_moderation_logs (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, admin_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS network_sample_dismissals (organization_id TEXT NOT NULL, sample_type TEXT NOT NULL, sample_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(organization_id,sample_type,sample_id));
`);
  if (!db.prepare("PRAGMA table_info(booking_leads)").all().some((c) => c.name === "enquiry_id")) db.exec("ALTER TABLE booking_leads ADD COLUMN enquiry_id TEXT NOT NULL DEFAULT ''");
  if (!db.prepare("PRAGMA table_info(booking_leads)").all().some((c) => c.name === "duration")) db.exec("ALTER TABLE booking_leads ADD COLUMN duration TEXT NOT NULL DEFAULT ''");
  if (!db.prepare("PRAGMA table_info(resident_stay_requirements)").all().some((c) => c.name === "gender")) db.exec("ALTER TABLE resident_stay_requirements ADD COLUMN gender TEXT NOT NULL DEFAULT ''");
  const initialMarketplaceCategories = ["Beds", "Mattresses", "Almirahs & Wardrobes", "Tables & Chairs", "Bedsheets & Linen", "Fans, Coolers & AC", "Geysers & Water Purifiers", "CCTV & Networking", "Inverters & Batteries", "Kitchen Equipment", "Refrigerators & Washing Machines", "Cleaning Equipment", "Fire Safety", "Locks & Access Control", "Sign Boards", "Furniture", "Electrical Items", "Plumbing Items", "Bathroom Accessories", "Painting", "Plumbing Services", "Electrical Work", "Carpentry", "Furniture Repair", "AC Service", "RO Service", "Pest Control", "Deep Cleaning", "Laundry Service", "CCTV Installation", "Internet Installation", "Property Maintenance", "Security Guards", "Housekeeping Staff", "Wardens & PG Managers", "Cooks & Kitchen Helpers", "Cleaners", "Property Brokers & Leasing", "Insurance", "Legal Services", "Accounting & GST", "Licensing & Compliance", "Marketing & Photography", "Digital Marketing"];
  const saveMarketplaceCategory = db.prepare("INSERT OR IGNORE INTO marketplace_categories (id,name,kind,active,sort_order,created_at) VALUES (?,?,'Product / Service',1,?,?)");
  initialMarketplaceCategories.forEach((name, index) => saveMarketplaceCategory.run(`seed-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, index, (/* @__PURE__ */ new Date()).toISOString()));
  const demoOrg = "demo-network-samples", demoNow = (/* @__PURE__ */ new Date()).toISOString();
  const removeNetworkDemoSamples = db.transaction(() => {
    db.prepare("DELETE FROM booking_leads WHERE organization_id='demo-network-samples' AND id IN ('demo-booking-lead-001','demo-booking-lead-002')").run();
    db.prepare("DELETE FROM public_property_listings WHERE organization_id='demo-network-samples' AND slug='sample-nivasnest-baner'").run();
  });
  removeNetworkDemoSamples();
  db.prepare("DELETE FROM public_property_listings WHERE organization_id='demo-network-samples' AND slug='sample-nivasnest-baner'").run();
  db.prepare("INSERT OR IGNORE INTO organizations (id,name,owner_user_id,plan,status,created_at,notes) VALUES (?,?,'demo-network-owner','PRO','Active',?,'Built-in preview samples')").run(demoOrg, "Autrob Stay Demo Samples", demoNow);
  db.prepare("INSERT OR IGNORE INTO org_settings (organization_id,business_name) VALUES (?,?)").run(demoOrg, "Demo Owner Community");
  const demoMarket = db.prepare(`INSERT OR IGNORE INTO marketplace_listings (id,organization_id,category_id,kind,title,description,image_url,price,price_type,city,service_area,seller,phone,whatsapp,availability,status,featured,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Active',1,?,?)`);
  demoMarket.run("demo-market-bunk-bed", demoOrg, "seed-beds", "Product", "Sample \xB7 Durable hostel bunk bed set", "A sturdy, space-saving metal bunk bed with safety rails, a ladder, and a compact study setup. Example product listing for previewing the marketplace.", "/demo/marketplace-bunk-bed.jpg", 18500, "Starting at", "Pune", "Pune and nearby areas", "Demo Hostel Supply Co.", "", "", "In stock", demoNow, demoNow);
  demoMarket.run("demo-market-bedroom-pack", demoOrg, "seed-furniture", "Product", "Sample \xB7 Furnished PG room starter set", "A practical room setup with two beds, wardrobes, and study desks for a new PG property. Example listing; contact details are intentionally omitted.", "/demo/pg-sample-room.jpg", 42e3, "Starting at", "Pune", "Pune and nearby areas", "Demo Hostel Supply Co.", "", "", "Available to order", demoNow, demoNow);
  demoMarket.run("demo-market-linen-pack", demoOrg, "seed-bedsheets-linen", "Product", "Sample \xB7 Fresh linen starter bundle", "A coordinated starter bundle of durable sheets and pillow covers sized for shared accommodation. Example listing for testing filters and quote requests.", "/demo/marketplace-bunk-bed.jpg", 6800, "Starting at", "Pune", "Ships across India", "Demo Hostel Supply Co.", "", "", "In stock", demoNow, demoNow);
  const extraSamples = [
    ["demo-market-beds", "seed-beds", "Product", "Single hostel beds with storage", "Powder-coated single beds with under-bed storage for compact PG rooms.", 7200, "Per Unit", "In stock"],
    ["demo-market-mattress", "seed-mattresses", "Product", "Medium-firm mattresses", "Durable, easy-clean mattresses suited to daily hostel use.", 4200, "Per Unit", "In stock"],
    ["demo-market-cctv", "seed-cctv-networking", "Product", "8-camera CCTV starter kit", "Cameras, recorder and cabling for shared entrances and common areas.", 26500, "Starting at", "Available to order"],
    ["demo-market-water", "seed-geysers-water-purifiers", "Product", "Commercial RO water purifier", "High-capacity water purifier with service support for shared accommodation.", 18900, "Starting at", "Available to order"],
    ["demo-market-laundry", "seed-laundry-service", "Service", "Weekly linen laundry pickup", "Scheduled pickup, wash, fold and return for bedsheets and towels.", 35, "Per Kg", "Booking open"],
    ["demo-market-plumbing", "seed-plumbing-services", "Service", "Plumbing repairs and installation", "Tap, shower, leakage and drain repairs with appointment slots.", null, "On Request", "Booking open"],
    ["demo-market-electrical", "seed-electrical-work", "Service", "Electrical safety inspection", "Room and common-area wiring inspection with a written checklist.", 1800, "Starting at", "Booking open"],
    ["demo-market-cleaning", "seed-deep-cleaning", "Service", "Move-in deep cleaning", "Room, bathroom and common-area deep cleaning before a new booking.", 2200, "Per Room", "Booking open"],
    ["demo-market-ac", "seed-ac-service", "Service", "AC servicing and annual maintenance", "Filter cleaning, seasonal service and repair visits for property AC units.", 850, "Per Unit", "Booking open"],
    ["demo-market-setup", "seed-furniture", "Business Service", "New PG setup consultation", "Room planning, bed capacity layout and furnishing recommendations.", null, "On Request", "Taking enquiries"]
  ];
  for (const [id, categoryId, kind, title, description, price, priceType, availability] of extraSamples) {
    if (!db.prepare("SELECT id FROM marketplace_categories WHERE id=?").get(categoryId)) continue;
    demoMarket.run(id, demoOrg, categoryId, kind, title, description, "/demo/marketplace-bunk-bed.jpg", price, priceType, "Pune", "Pune and nearby areas", "Autrob Stay Marketplace Demo", "", "", availability, demoNow, demoNow);
  }
  const sampleImage = db.prepare("UPDATE marketplace_listings SET image_url=? WHERE id=? AND organization_id=?");
  for (const [id, image] of [["demo-market-bunk-bed","/demo/marketplace-bunk-bed.jpg"],["demo-market-bedroom-pack","/demo/pg-sample-room.jpg"],["demo-market-linen-pack","/demo/marketplace/linen.svg"],["demo-market-beds","/demo/marketplace-bunk-bed.jpg"],["demo-market-mattress","/demo/marketplace/mattress.svg"],["demo-market-cctv","/demo/marketplace/cctv.svg"],["demo-market-water","/demo/marketplace/water-purifier.svg"],["demo-market-laundry","/demo/marketplace/laundry.svg"],["demo-market-plumbing","/demo/marketplace/plumbing.svg"],["demo-market-electrical","/demo/marketplace/electrical.svg"],["demo-market-cleaning","/demo/marketplace/cleaning.svg"],["demo-market-ac","/demo/marketplace/ac-service.svg"],["demo-market-setup","/demo/marketplace/pg-setup.svg"]]) sampleImage.run(image, id, demoOrg);
}
var ensurePaymentColumns = () => {
  const columns = new Set(db.prepare("PRAGMA table_info(payments)").all().map((c) => String(c.name)));
  if (!columns.has("billing_period")) db.exec("ALTER TABLE payments ADD COLUMN billing_period TEXT NOT NULL DEFAULT ''");
  if (!columns.has("invoice_no")) db.exec("ALTER TABLE payments ADD COLUMN invoice_no TEXT NOT NULL DEFAULT ''");
};
ensurePaymentColumns();
var ensureElectricityWaiverColumn = () => {
  const columns = new Set(db.prepare("PRAGMA table_info(electricity_bills)").all().map((c) => String(c.name)));
  if (!columns.has("waived_amount")) db.exec("ALTER TABLE electricity_bills ADD COLUMN waived_amount REAL NOT NULL DEFAULT 0");
};
ensureElectricityWaiverColumn();
var ensureResidentStayColumns = () => {
  db.exec("CREATE TABLE IF NOT EXISTS resident_stays (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, resident_id TEXT NOT NULL, property_id TEXT, property TEXT NOT NULL, room TEXT NOT NULL DEFAULT '', rent INTEGER NOT NULL DEFAULT 0, due TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Pending', move_in_date TEXT NOT NULL DEFAULT '', stay_type TEXT NOT NULL DEFAULT 'Day Pass', check_out_date TEXT NOT NULL DEFAULT '', per_day_rent INTEGER NOT NULL DEFAULT 0, occupancy_status TEXT NOT NULL DEFAULT 'Active', exit_date TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, FOREIGN KEY(resident_id) REFERENCES residents(id) ON DELETE CASCADE)");
  const columns = new Set(db.prepare("PRAGMA table_info(payments)").all().map((c) => String(c.name)));
  if (!columns.has("stay_id")) db.exec("ALTER TABLE payments ADD COLUMN stay_id TEXT NOT NULL DEFAULT ''");
  db.exec("INSERT INTO resident_stays (id,organization_id,resident_id,property_id,property,room,rent,due,status,move_in_date,stay_type,check_out_date,per_day_rent,occupancy_status,exit_date,created_at) SELECT 'stay_'||r.id,r.organization_id,r.id,r.property_id,r.property,r.room,r.rent,r.due,r.status,COALESCE(NULLIF(r.move_in_date,''),''),r.stay_type,r.check_out_date,r.per_day_rent,r.occupancy_status,r.exit_date,r.created_at FROM residents r WHERE r.stay_type='Day Pass' AND NOT EXISTS (SELECT 1 FROM resident_stays s WHERE s.resident_id=r.id)");
  db.exec("UPDATE payments SET stay_id=(SELECT s.id FROM resident_stays s WHERE s.resident_id=payments.resident_id ORDER BY s.created_at,s.id LIMIT 1) WHERE stay_id='' AND resident_id IS NOT NULL AND purpose LIKE '%day pass%' AND (SELECT COUNT(*) FROM resident_stays s WHERE s.resident_id=payments.resident_id)=1");
};
db.exec("CREATE INDEX IF NOT EXISTS saas_licenses_org_status_idx ON saas_licenses(organization_id,status,expires_at)");
db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(1, (/* @__PURE__ */ new Date()).toISOString());
if (!db.prepare("PRAGMA table_info(saas_licenses)").all().some((c) => c.name === "key_ciphertext")) db.exec("ALTER TABLE saas_licenses ADD COLUMN key_ciphertext TEXT NOT NULL DEFAULT ''");
if (!db.prepare("PRAGMA table_info(meter_readings)").all().some((c) => c.name === "reading_date")) db.exec("ALTER TABLE meter_readings ADD COLUMN reading_date TEXT NOT NULL DEFAULT ''");
for (const [name, ddl] of [["reading_mode", "TEXT NOT NULL DEFAULT 'readings'"], ["previous_reading", "REAL"], ["previous_common_reading", "REAL"]]) if (!db.prepare("PRAGMA table_info(meter_readings)").all().some((c) => c.name === name)) db.exec(`ALTER TABLE meter_readings ADD COLUMN ${name} ${ddl}`);
if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "role")) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'manager'");
if (!db.prepare("PRAGMA table_info(properties)").all().some((c) => c.name === "rooms_count")) db.exec("ALTER TABLE properties ADD COLUMN rooms_count INTEGER NOT NULL DEFAULT 0");
if (!db.prepare("PRAGMA table_info(properties)").all().some((c) => c.name === "floor_name")) db.exec("ALTER TABLE properties ADD COLUMN floor_name TEXT NOT NULL DEFAULT ''");
if (!db.prepare("PRAGMA table_info(rooms)").all().some((c) => c.name === "floor_name")) db.exec("ALTER TABLE rooms ADD COLUMN floor_name TEXT NOT NULL DEFAULT ''");
if (!db.prepare("PRAGMA table_info(residents)").all().some((c) => c.name === "security_deposit")) db.exec("ALTER TABLE residents ADD COLUMN security_deposit INTEGER NOT NULL DEFAULT 0");
for (const [name, ddl] of [["stay_type", "TEXT NOT NULL DEFAULT 'Monthly'"], ["professional", "TEXT NOT NULL DEFAULT ''"], ["check_out_date", "TEXT NOT NULL DEFAULT ''"], ["per_day_rent", "INTEGER NOT NULL DEFAULT 0"], ["address", "TEXT NOT NULL DEFAULT ''"], ["company_name", "TEXT NOT NULL DEFAULT ''"]]) if (!db.prepare("PRAGMA table_info(residents)").all().some((c) => c.name === name)) db.exec(`ALTER TABLE residents ADD COLUMN ${name} ${ddl}`);
if (!db.prepare("PRAGMA table_info(enquiries)").all().some((c) => c.name === "assigned_room")) db.exec("ALTER TABLE enquiries ADD COLUMN assigned_room TEXT NOT NULL DEFAULT ''");
if (!db.prepare("PRAGMA table_info(payments)").all().some((c) => c.name === "invoice_no")) db.exec("ALTER TABLE payments ADD COLUMN invoice_no TEXT NOT NULL DEFAULT ''");
if (!db.prepare("PRAGMA table_info(org_settings)").all().some((c) => c.name === "payment_qr_url")) db.exec("ALTER TABLE org_settings ADD COLUMN payment_qr_url TEXT NOT NULL DEFAULT ''");
for (const [name, ddl] of [["document_type", "TEXT NOT NULL DEFAULT ''"], ["document_number", "TEXT NOT NULL DEFAULT ''"], ["document_file_name", "TEXT NOT NULL DEFAULT ''"], ["document_data", "TEXT NOT NULL DEFAULT ''"], ["kyc_verified", "INTEGER NOT NULL DEFAULT 0"]]) if (!db.prepare("PRAGMA table_info(residents)").all().some((c) => c.name === name)) db.exec(`ALTER TABLE residents ADD COLUMN ${name} ${ddl}`);
if (!db.prepare("PRAGMA table_info(residents)").all().some((c) => c.name === "move_in_date")) db.exec("ALTER TABLE residents ADD COLUMN move_in_date TEXT NOT NULL DEFAULT ''");
if (!db.prepare("PRAGMA table_info(residents)").all().some((c) => c.name === "occupancy_status")) db.exec("ALTER TABLE residents ADD COLUMN occupancy_status TEXT NOT NULL DEFAULT 'Active'");
if (!db.prepare("PRAGMA table_info(residents)").all().some((c) => c.name === "exit_date")) db.exec("ALTER TABLE residents ADD COLUMN exit_date TEXT NOT NULL DEFAULT ''");
if (!db.prepare("PRAGMA table_info(residents)").all().some((c) => c.name === "portal_password_hash")) db.exec("ALTER TABLE residents ADD COLUMN portal_password_hash TEXT NOT NULL DEFAULT ''");
if (!db.prepare("PRAGMA table_info(residents)").all().some((c) => c.name === "rent_paid_through_period")) db.exec("ALTER TABLE residents ADD COLUMN rent_paid_through_period TEXT NOT NULL DEFAULT ''");
ensureResidentStayColumns();
for (const [name, ddl] of [["category", "TEXT NOT NULL DEFAULT ''"], ["template_id", "TEXT NOT NULL DEFAULT ''"], ["channel", "TEXT NOT NULL DEFAULT 'WhatsApp'"], ["scheduled_at", "TEXT NOT NULL DEFAULT ''"], ["sent_at", "TEXT NOT NULL DEFAULT ''"], ["failure_reason", "TEXT NOT NULL DEFAULT ''"], ["created_by", "TEXT NOT NULL DEFAULT ''"], ["batch_id", "TEXT NOT NULL DEFAULT ''"]]) if (!db.prepare("PRAGMA table_info(messages)").all().some((c) => c.name === name)) db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${ddl}`);
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS meter_readings_main_unique ON meter_readings(organization_id,property_id,period_year,period_month) WHERE meter_type='Main meter'");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS meter_readings_sub_unique ON meter_readings(organization_id,property_id,period_year,period_month,floor_name,room_number) WHERE meter_type='Sub meter'");
var hash = (password) => bcrypt2.hashSync(password, 12);
var desktopApp = Boolean(process.env.NIVASBOOK_DESKTOP_TOKEN);
var removeDemoResidentFixtures = db.transaction(() => {
  db.prepare("DELETE FROM food_bills WHERE id='demo-resident-food-bill'").run();
  db.prepare("DELETE FROM electricity_bills WHERE id='demo-resident-electricity-bill'").run();
  db.prepare("DELETE FROM electricity_cycles WHERE id='demo-resident-electricity-cycle'").run();
  db.prepare("DELETE FROM payments WHERE id IN ('demo-resident-rent-paid','demo-resident-security-paid')").run();
  if (!desktopApp && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='booking_leads'").get()) db.prepare("DELETE FROM booking_leads WHERE id='demo-resident-booking' AND organization_id='demo-network-samples'").run();
  db.prepare("DELETE FROM residents WHERE id='demo-resident-portal-001' AND organization_id='demo-network-samples'").run();
});
removeDemoResidentFixtures();
var defaultPassword = process.env.NIVASBOOK_OWNER_PASSWORD || "Nivasbook@2026";
var defaultEmail = (process.env.NIVASBOOK_OWNER_EMAIL || "owner@nivasbook.local").trim().toLowerCase();
var orgId = "org-nivasbook-demo";
var downloadedWorkspaceBackups = /* @__PURE__ */ new Set();
var nowIso2 = () => (/* @__PURE__ */ new Date()).toISOString();
var residentTokenHash = (token) => crypto2.createHash("sha256").update(token).digest("hex");
var residentSuspended = (phoneKey) => !desktopApp && Boolean(db.prepare("SELECT 1 FROM resident_portal_suspensions WHERE substr(phone_key,-10)=? AND suspended=1").get(String(phoneKey || "").replace(/\D/g, "").slice(-10)));
var createResidentAccessToken = (residentId, phoneKey) => {
  const token = crypto2.randomBytes(32).toString("base64url"), created = nowIso2(), expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString();
  db.prepare("INSERT INTO resident_portal_tokens (token_hash,resident_id,phone_key,expires_at,created_at) VALUES (?,?,?,?,?)").run(residentTokenHash(token), residentId, phoneKey, expires, created);
  return token;
};
var residentPortalIdentity = (req) => {
  const header = String(req.get("authorization") || ""), match = header.match(/^Bearer\s+(.+)$/i), token = match?.[1] || String(req.get("x-resident-token") || "");
  if (token) {
    const row = db.prepare("SELECT resident_id as residentId,phone_key as phoneKey FROM resident_portal_tokens WHERE token_hash=? AND expires_at>?").get(residentTokenHash(token), nowIso2());
    if (row) return { residentId: String(row.residentId || ""), phoneKey: String(row.phoneKey || "") };
  }
  return { residentId: String(req.session.residentPortalId || ""), phoneKey: String(req.session.residentPortalPhone || "") };
};
var uid2 = () => crypto2.randomUUID();
var desktopTrialMode = process.env.NIVASBOOK_DESKTOP_TRIAL_MODE === "1";
var desktopTrialDays = Math.min(30, Math.max(1, Number(process.env.NIVASBOOK_DESKTOP_TRIAL_DAYS) || 7));
var desktopTrial = desktopTrialMode ? getOrCreateDesktopTrial(db, desktopTrialDays) : null;
var existingUser = db.prepare("SELECT id,email,organization_id as organizationId FROM users WHERE email=? OR (id='user-owner' AND organization_id=?) ORDER BY CASE WHEN email=? THEN 0 ELSE 1 END LIMIT 1").get(defaultEmail, orgId, defaultEmail);
if (!existingUser) db.prepare("INSERT INTO users (id,name,email,password_hash,organization_id,role) VALUES (?, ?, ?, ?, ?, ?)").run("user-owner", "Ramesh Mehta", defaultEmail, hash(defaultPassword), orgId, "owner");
db.prepare("UPDATE users SET role='owner' WHERE id=?").run(existingUser?.id || "user-owner");
db.prepare("INSERT OR IGNORE INTO org_settings (organization_id) VALUES (?)").run(orgId);
var currentOwner = db.prepare("SELECT id,name FROM users WHERE id=?").get(existingUser?.id || "user-owner");
db.prepare(`INSERT OR IGNORE INTO organizations (id,name,owner_user_id,plan,status,trial_ends_at,next_billing_at,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(orgId, `${currentOwner?.name || "PG"} Workspace`, existingUser?.id || "user-owner", desktopTrialMode || desktopApp ? "Trial" : "Pro", desktopTrialMode || desktopApp ? "Trial" : "Active", desktopTrial?.expiresAt.slice(0, 10) || "", "", nowIso2());
var populatedDesktopWorkspace = db.prepare(`SELECT id FROM organizations WHERE id<>? AND (EXISTS(SELECT 1 FROM properties WHERE properties.organization_id=organizations.id) OR EXISTS(SELECT 1 FROM residents WHERE residents.organization_id=organizations.id)) ORDER BY (SELECT COUNT(*) FROM properties WHERE properties.organization_id=organizations.id) DESC,(SELECT COUNT(*) FROM residents WHERE residents.organization_id=organizations.id) DESC LIMIT 1`).get(orgId);
var desktopWorkspaceOrgId = existingUser?.organizationId && existingUser.organizationId !== orgId ? existingUser.organizationId : populatedDesktopWorkspace?.id || orgId;
var addCalendarYear = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid activation date.");
  const year2 = date.getUTCFullYear() + 1, month2 = date.getUTCMonth(), day = Math.min(date.getUTCDate(), new Date(Date.UTC(year2, month2 + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year2, month2, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds())).toISOString();
};
var desktopMasterLicenseState = () => {
  let state = db.prepare("SELECT activated_at as activatedAt,expires_at as expiresAt,key_hint as keyHint FROM desktop_master_license WHERE id=1").get();
  if (state && !state.expiresAt) {
    state = { ...state, expiresAt: addCalendarYear(state.activatedAt) };
    db.prepare("UPDATE desktop_master_license SET expires_at=? WHERE id=1").run(state.expiresAt);
  }
  if (state && Date.parse(state.expiresAt) <= Date.now()) {
    db.prepare("UPDATE organizations SET status='Past due' WHERE id=? AND status='Active'").run(desktopWorkspaceOrgId);
    return { ...state, active: false };
  }
  return state ? { ...state, active: true } : null;
};
if (desktopTrialMode && desktopTrial) db.prepare("UPDATE organizations SET plan='Trial',status='Trial',trial_ends_at=?,next_billing_at='' WHERE id=?").run(desktopTrial.expiresAt.slice(0, 10), desktopWorkspaceOrgId);
var platformEmail = (process.env.NIVASBOOK_PLATFORM_EMAIL || (process.env.NODE_ENV === "production" ? "" : "8882504698")).trim().toLowerCase();
var platformPassword = process.env.NIVASBOOK_PLATFORM_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "8882504698");
if (platformEmail && platformPassword) {
  const configured = db.prepare("SELECT id FROM platform_admins WHERE email=?").get(platformEmail);
  if (configured) db.prepare("UPDATE platform_admins SET password_hash=? WHERE id=?").run(hash(platformPassword), configured.id);
  else {
    const existing = db.prepare("SELECT id FROM platform_admins ORDER BY created_at LIMIT 1").get();
    if (existing) db.prepare("UPDATE platform_admins SET name=?,email=?,password_hash=? WHERE id=?").run("Autrob Stay Platform Admin", platformEmail, hash(platformPassword), existing.id);
    else db.prepare("INSERT INTO platform_admins VALUES (?, ?, ?, ?, ?)").run(uid2(), "Autrob Stay Platform Admin", platformEmail, hash(platformPassword), nowIso2());
  }
}
var savedBusinessName = db.prepare("SELECT business_name as name FROM org_settings WHERE organization_id=?").get(orgId)?.name;
var firstPgName = db.prepare("SELECT name FROM properties WHERE organization_id=? ORDER BY created_at LIMIT 1").get(orgId)?.name;
var seededOrgName = savedBusinessName || firstPgName || `${currentOwner?.name || "PG"} Workspace`;
db.prepare("UPDATE organizations SET name=? WHERE id=? AND name=?").run(seededOrgName, orgId, `${currentOwner?.name || "PG"} Workspace`);
db.prepare(`UPDATE payments SET resident_id=(SELECT residents.id FROM residents WHERE residents.organization_id=payments.organization_id AND residents.name=payments.resident LIMIT 1) WHERE resident_id IS NULL`).run();
var app = express();
app.disable("x-powered-by");
if (isProduction) app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
var SqliteStore = connectSqlite3(session);
app.use(session({ store: new SqliteStore({ db: "sessions.sqlite", dir: dataDir, concurrentDB: true }), secret: process.env.NIVASBOOK_SESSION_SECRET || "local-development-session-secret-change-before-deployment", resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: "lax", secure: "auto", maxAge: 1e3 * 60 * 60 * 24 * 7 } }));
var userFor = (req) => db.prepare("SELECT id,name,email,role,organization_id as organizationId FROM users WHERE id=?").get(req.session.userId);
var DESKTOP_MASTER_LICENSE_HASH = "097ED83D0F0259A03C11F5F87B76973E7D8BA66E4F441D3C121779CCE04B02C0";
var isMasterLicenseActivated = () => desktopApp && !!desktopMasterLicenseState()?.active;
var hasOwnerMasterLicense = (_organizationId) => false;
var desktopTrialExpired = () => isDesktopTrialExpired(desktopTrial, desktopTrialMode);
var hasActiveSaasLicense = (organizationId) => !!db.prepare("SELECT 1 FROM saas_licenses WHERE organization_id=? AND status='Active' AND starts_at<=? AND expires_at>=? LIMIT 1").get(organizationId, (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
var hasActiveCommercialSubscription = (organizationId) => !!db.prepare("SELECT 1 FROM commercial_subscriptions WHERE business_id=? AND subscription_status='ACTIVE' AND start_date<=? AND end_date>=? LIMIT 1").get(organizationId, (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
if (!desktopApp) {
  const webToday = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  db.prepare("UPDATE organizations SET status='Past due',plan='STARTER' WHERE id IN (SELECT organization_id FROM owner_master_licenses) AND NOT EXISTS(SELECT 1 FROM saas_licenses l WHERE l.organization_id=organizations.id AND l.status='Active' AND l.expires_at>=?) AND NOT EXISTS(SELECT 1 FROM commercial_subscriptions c WHERE c.business_id=organizations.id AND c.subscription_status='ACTIVE' AND c.end_date>=?)").run(webToday, webToday);
}
var requiresPlanActivation = (organizationId) => {
  if (isMasterLicenseActivated() || hasOwnerMasterLicense(organizationId)) return false;
  const org = db.prepare("SELECT status,trial_ends_at as trialEndsAt,next_billing_at as nextBillingAt FROM organizations WHERE id=?").get(organizationId);
  if (!org) return true;
  if (["Suspended", "Cancelled"].includes(org.status)) return true;
  if (hasActiveSaasLicense(organizationId) || hasActiveCommercialSubscription(organizationId)) return false;
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return desktopTrialExpired() || org.status === "Past due" || org.status === "Trial" && (!org.trialEndsAt || org.trialEndsAt < today) || org.status === "Active" && org.nextBillingAt && org.nextBillingAt < today;
};
var currentCommercialPlanCode = (organizationId) => {
  if (isMasterLicenseActivated() || hasOwnerMasterLicense(organizationId)) return "BUSINESS";
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const subscription = db.prepare("SELECT plan_code as planCode FROM commercial_subscriptions WHERE business_id=? AND subscription_status='ACTIVE' AND start_date<=? AND end_date>=? ORDER BY end_date DESC LIMIT 1").get(organizationId, today, today);
  if (subscription?.planCode) return subscription.planCode;
  const trial = db.prepare("SELECT trial_id FROM commercial_trials WHERE business_id=? AND trial_status='ACTIVE' AND trial_start_date<=? AND trial_end_date>=? LIMIT 1").get(organizationId, today, today);
  if (trial) return "PRO";
  const license = db.prepare("SELECT plan_code as planCode,plan FROM saas_licenses WHERE organization_id=? AND status='Active' AND starts_at<=? AND expires_at>=? ORDER BY expires_at DESC LIMIT 1").get(organizationId, today, today);
  if (license) return normalizePlanCode(license.planCode || license.plan);
  const org = db.prepare("SELECT plan,status FROM organizations WHERE id=?").get(organizationId);
  return normalizePlanCode(org?.plan || "STARTER");
};
var canUseFeature = (organizationId, featureCode) => {
  const planCode = currentCommercialPlanCode(organizationId);
  return !!db.prepare("SELECT 1 FROM commercial_plan_features WHERE plan_code=? AND feature_code=? AND enabled=1").get(planCode, featureCode);
};
var planLimitFailure = (organizationId, resource, adding) => {
  const code = currentCommercialPlanCode(organizationId), plan = commercialPlan(code);
  if (!plan) return null;
  const config = { properties: { limit: Number(plan.maxProperties), label: "property", table: "properties" }, beds: { limit: Number(plan.maxBeds), label: "bed", table: "beds" }, users: { limit: Number(plan.maxUsers), label: "user account", table: "users" } }[resource];
  if (config.limit < 0) return null;
  const current = Number(db.prepare(`SELECT COUNT(*) as count FROM ${config.table} WHERE organization_id=?`).get(organizationId)?.count || 0);
  if (current + adding <= config.limit) return null;
  const next = { STARTER: "PRO", PRO: "BUSINESS", DESKTOP: "PRO" }[code];
  const nextPlan = next ? commercialPlan(next) : null;
  const nextLimit = nextPlan ? Number(nextPlan[resource === "properties" ? "maxProperties" : resource === "beds" ? "maxBeds" : "maxUsers"]) : 0;
  return { error: `You've reached the ${config.limit}-${config.label} limit of the ${plan.name} plan.${next ? ` Upgrade to ${next} to manage up to ${nextLimit} ${config.label}s.` : ""}`, code: "PLAN_LIMIT", planCode: code, limit: config.limit, used: current, upgradePlan: next || null, upgradeLimit: nextLimit };
};
var licenseRequiredError = "Your trial or paid plan has ended. Enter an activation key to continue.";
var auth = (req, res, next) => {
  const u = userFor(req);
  if (!u) return res.status(401).json({ error: "Please sign in to continue." });
  const accountStatus = db.prepare("SELECT status FROM organizations WHERE id=?").get(u.organizationId)?.status;
  if (!desktopApp && accountStatus === "Suspended") return res.status(403).json({ error: "This owner account is suspended. Contact platform support." });
  if (requiresPlanActivation(u.organizationId)) return res.status(403).json({ error: licenseRequiredError, code: "LICENSE_REQUIRED" });
  next();
};
var licenseAuth = (req, res, next) => {
  const u = userFor(req);
  if (!u) return res.status(401).json({ error: "Please sign in to continue." });
  if (u.role !== "owner") return res.status(403).json({ error: "Only the workspace owner can activate a license." });
  next();
};
if (!desktopApp) registerDesktopLicenseActivation(app, db, userFor, licenseAuth);
var ownerAuth = (req, res, next) => {
  auth(req, res, () => {
    const u = userFor(req);
    if (u?.role !== "owner") return res.status(403).json({ error: "Owner access is required to manage workspace details and accounts." });
    next();
  });
};
var platformUserFor = (req) => db.prepare("SELECT id,name,email FROM platform_admins WHERE id=?").get(req.session.platformAdminId);
var safeEqual = (a, b) => {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto2.timingSafeEqual(aa, bb);
};
var platformAuth = (req, res, next) => {
  if (!platformUserFor(req)) return res.status(401).json({ error: "Platform admin sign-in is required." });
  next();
};
var ensureOwnerWallet = (organizationId) => db.prepare("INSERT OR IGNORE INTO owner_wallets (organization_id,balance_paise,updated_at) VALUES (?,0,?)").run(organizationId, nowIso2());
var walletBalance = (organizationId) => Number(db.prepare("SELECT balance_paise FROM owner_wallets WHERE organization_id=?").get(organizationId)?.balance_paise || 0);
var addWalletCredit = (organizationId, amountPaise, referenceType, referenceId, description, createdBy) => {
  ensureOwnerWallet(organizationId);
  const prior = db.prepare("SELECT id,balance_after_paise as balanceAfter FROM owner_wallet_transactions WHERE organization_id=? AND reference_type=? AND reference_id=? AND direction='CREDIT'").get(organizationId, referenceType, referenceId);
  if (prior) return { transactionId: prior.id, balancePaise: Number(prior.balanceAfter), already: true };
  const id = uid2(), created = nowIso2(), next = walletBalance(organizationId) + amountPaise;
  db.prepare("UPDATE owner_wallets SET balance_paise=?,updated_at=? WHERE organization_id=?").run(next, created, organizationId);
  db.prepare("INSERT INTO owner_wallet_transactions (id,organization_id,direction,amount_paise,balance_after_paise,reference_type,reference_id,description,created_by,created_at) VALUES (?,?,'CREDIT',?,?,?,?,?,?,?)").run(id, organizationId, amountPaise, next, referenceType, referenceId, description, createdBy, created);
  return { transactionId: id, balancePaise: next, already: false };
};
var debitOwnerWallet = (organizationId, amountPaise, referenceType, referenceId, description, createdBy) => {
  ensureOwnerWallet(organizationId);
  const prior = db.prepare("SELECT id,balance_after_paise as balanceAfter FROM owner_wallet_transactions WHERE organization_id=? AND reference_type=? AND reference_id=? AND direction='DEBIT'").get(organizationId, referenceType, referenceId);
  if (prior) return { ok: true, transactionId: prior.id, balancePaise: Number(prior.balanceAfter), already: true };
  const balance = walletBalance(organizationId);
  if (balance < amountPaise) return { ok: false, balancePaise: balance };
  const id = uid2(), created = nowIso2(), next = balance - amountPaise;
  db.prepare("UPDATE owner_wallets SET balance_paise=?,updated_at=? WHERE organization_id=?").run(next, created, organizationId);
  db.prepare("INSERT INTO owner_wallet_transactions (id,organization_id,direction,amount_paise,balance_after_paise,reference_type,reference_id,description,created_by,created_at) VALUES (?,?,'DEBIT',?,?,?,?,?,?,?)").run(id, organizationId, amountPaise, next, referenceType, referenceId, description, createdBy, created);
  return { ok: true, transactionId: id, balancePaise: next, already: false };
};
app.get("/api/wallet", ownerAuth, (req, res) => {
  const u = userFor(req);
  ensureOwnerWallet(u.organizationId);
  const wallet = db.prepare("SELECT balance_paise as balancePaise,updated_at as updatedAt FROM owner_wallets WHERE organization_id=?").get(u.organizationId);
  const transactions = db.prepare("SELECT id,direction,amount_paise as amountPaise,balance_after_paise as balanceAfterPaise,reference_type as referenceType,reference_id as referenceId,description,created_at as createdAt FROM owner_wallet_transactions WHERE organization_id=? ORDER BY created_at DESC LIMIT 200").all(u.organizationId);
  const requests = db.prepare("SELECT id,amount_paise as amountPaise,note,status,reviewed_at as reviewedAt,created_at as createdAt FROM owner_wallet_recharge_requests WHERE organization_id=? ORDER BY created_at DESC LIMIT 100").all(u.organizationId);
  res.json({ wallet, transactions, requests });
});
app.post("/api/wallet/recharge-requests", ownerAuth, (req, res) => {
  const u = userFor(req), amount = Number(req.body?.amount), amountPaise = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amountPaise < 100) return res.status(400).json({ error: "Enter a recharge request of at least ₹1." });
  const id = uid2(), created = nowIso2();
  db.prepare("INSERT INTO owner_wallet_recharge_requests (id,organization_id,amount_paise,note,status,created_at,updated_at) VALUES (?,?,?,?,'PENDING',?,?)").run(id, u.organizationId, amountPaise, val(req.body?.note, 500), created, created);
  audit(u.organizationId, u.id, "wallet.recharge.requested", "wallet_recharge_request", id);
  res.status(201).json({ id, status: "PENDING" });
});app.get("/api/platform/wallets", platformAuth, (_req, res) => {
  const owners = db.prepare(`SELECT o.id as organizationId,o.name as pgName,u.name as ownerName,u.email as ownerEmail,COALESCE(w.balance_paise,0) as balancePaise FROM organizations o JOIN users u ON u.id=o.owner_user_id LEFT JOIN owner_wallets w ON w.organization_id=o.id ORDER BY o.name`).all();
  const requests = db.prepare(`SELECT r.id,r.organization_id as organizationId,o.name as pgName,u.name as ownerName,r.amount_paise as amountPaise,r.note,r.status,r.created_at as createdAt FROM owner_wallet_recharge_requests r JOIN organizations o ON o.id=r.organization_id JOIN users u ON u.id=o.owner_user_id ORDER BY CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 500`).all();
  res.json({ owners, requests });
});
app.post("/api/platform/wallets/:organizationId/recharge", platformAuth, (req, res) => {
  const admin = platformUserFor(req), organizationId = val(req.params.organizationId, 120), amount = Number(req.body?.amount), amountPaise = Math.round(amount * 100);
  if (!db.prepare("SELECT 1 FROM organizations WHERE id=?").get(organizationId)) return res.status(404).json({ error: "Owner workspace not found." });
  if (!Number.isFinite(amount) || amountPaise < 100) return res.status(400).json({ error: "Enter a recharge amount of at least \u20B91." });
  const result = db.transaction(() => addWalletCredit(organizationId, amountPaise, "admin_topup", uid2(), val(req.body?.note, 500) || "Wallet recharge from platform admin", admin.id))();
  audit(organizationId, admin.id, "wallet.recharged", "owner_wallet", organizationId);
  res.json({ ok: true, ...result });
});
app.patch("/api/platform/wallet-recharge-requests/:id", platformAuth, (req, res) => {
  const admin = platformUserFor(req), action = val(req.body?.action, 20), request = db.prepare("SELECT id,organization_id as organizationId,amount_paise as amountPaise,status FROM owner_wallet_recharge_requests WHERE id=?").get(val(req.params.id, 120));
  if (!request) return res.status(404).json({ error: "Recharge request not found." });
  if (request.status !== "PENDING") return res.status(409).json({ error: "This recharge request was already reviewed." });
  if (!["approve", "reject"].includes(action)) return res.status(400).json({ error: "Choose approve or reject." });
  const outcome = db.transaction(() => {
    const now = nowIso2();
    if (action === "reject") {
      db.prepare("UPDATE owner_wallet_recharge_requests SET status='REJECTED',reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=? AND status='PENDING'").run(admin.id, now, now, request.id);
      return { status: "REJECTED" };
    }
    const credit = addWalletCredit(request.organizationId, Number(request.amountPaise), "recharge_request", request.id, "Approved owner wallet recharge request", admin.id);
    db.prepare("UPDATE owner_wallet_recharge_requests SET status='APPROVED',reviewed_by=?,reviewed_at=?,transaction_id=?,updated_at=? WHERE id=? AND status='PENDING'").run(admin.id, now, credit.transactionId, now, request.id);
    return { status: "APPROVED", ...credit };
  })();
  audit(request.organizationId, admin.id, `wallet.recharge.${action}d`, "wallet_recharge_request", request.id);
  res.json({ ok: true, ...outcome });
});
app.get("/api/downloads/windows", ownerAuth, (_req, res) => {
  const installer = path.join(root, "outputs", "Autrob-Stay-Windows-Updated-2026-10-28.zip");
  if (!fsSync.existsSync(installer)) return res.status(404).json({ error: "The Windows installer is not available on this server yet." });
  res.download(installer, "Autrob-Stay-Windows-Updated-2026-10-28.zip");
});
app.use("/api/network", (req, res, next) => desktopApp ? res.status(404).json({ error: "This module is available in the web application." }) : next());
app.use("/api/public/stay", (req, res, next) => desktopApp ? res.status(404).json({ error: "This module is available in the web application." }) : next());
app.use("/api/platform/network", (req, res, next) => desktopApp ? res.status(404).json({ error: "This module is available in the web application." }) : next());
app.get("/api/health", (_req, res) => res.json({ ok: true, product: "Autrob Stay", expenseCrud: true, workspaceModules: true, monthlyRentByPeriod: true, rentCarryForward: true, residentPortal: true, platformLoginPhone: true, globalStayRequirements: !desktopApp, platformBookingInbox: !desktopApp, ownerBusinessInquiries: !desktopApp, residentEnquiryAccounts: true, residentSessionCookieAutoSecure: true }));
app.get("/api/license/status", (req, res) => {
  const desktopMaster = desktopApp ? desktopMasterLicenseState() : null;
  if (desktopMaster?.active) return res.json({ mode: "licensed", status: "Active", plan: "Business", expiresAt: desktopMaster.expiresAt });
  const u = userFor(req), today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  if (u && (hasActiveSaasLicense(u.organizationId) || hasActiveCommercialSubscription(u.organizationId))) {
    const license = db.prepare("SELECT plan,expires_at as expiresAt FROM saas_licenses WHERE organization_id=? AND status='Active' ORDER BY expires_at DESC LIMIT 1").get(u.organizationId);
    return res.json({ mode: "licensed", plan: license?.plan || currentCommercialPlanCode(u.organizationId), expiresAt: license?.expiresAt || "" });
  }
  if (u) {
    const trial = db.prepare("SELECT trial_start_date as startedAt,trial_end_date as expiresAt,trial_status as status FROM commercial_trials WHERE business_id=? ORDER BY created_at DESC LIMIT 1").get(u.organizationId);
    if (trial) {
      const remaining = Math.max(0, Date.parse(`${trial.expiresAt}T23:59:59Z`) - Date.now());
      return res.json({ mode: "trial", status: trial.status === "ACTIVE" && remaining ? "Trial" : "Expired", startedAt: trial.startedAt, expiresAt: trial.expiresAt, daysRemaining: Math.ceil(remaining / 864e5), expired: trial.status !== "ACTIVE" || remaining === 0 });
    }
  }
  if (!desktopTrialMode || !desktopTrial) return res.json({ mode: "unconfigured" });
  res.json(getDesktopTrialStatus(desktopTrial));
});
var commercialPlan = (planCode) => {
  const row = db.prepare("SELECT plan_code as code,plan_name as name,description,monthly_price_paise as monthlyPricePaise,annual_price_paise as annualPricePaise,currency,max_properties as maxProperties,max_beds as maxBeds,max_users as maxUsers,max_devices as maxDevices,trial_days as trialDays,is_featured as featured,is_active as isActive FROM commercial_plans WHERE plan_code=?").get(planCode);
  if (!row) return null;
  row.features = db.prepare("SELECT pf.feature_code as code,f.feature_name as name,pf.enabled,pf.limit_value as limitValue FROM commercial_plan_features pf JOIN commercial_features f ON f.feature_code=pf.feature_code WHERE pf.plan_code=? ORDER BY f.feature_name").all(planCode);
  return row;
};
app.get("/api/commercial/plans", (_req, res) => {
  const plans = db.prepare("SELECT plan_code as code FROM commercial_plans WHERE is_active=1 ORDER BY display_order,plan_code").all().map((x) => commercialPlan(x.code)).filter(Boolean);
  res.json({ plans });
});
app.get("/api/commercial/subscription", licenseAuth, (req, res) => {
  const u = userFor(req), org = db.prepare("SELECT plan,status,trial_ends_at as trialEndsAt,next_billing_at as nextBillingAt FROM organizations WHERE id=?").get(u.organizationId);
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  db.prepare("UPDATE commercial_subscriptions SET subscription_status='EXPIRED',updated_at=? WHERE business_id=? AND subscription_status IN ('ACTIVE','TRIAL') AND end_date<>'' AND end_date<?").run(nowIso2(), u.organizationId, today);
  db.prepare("UPDATE commercial_trials SET trial_status='EXPIRED',updated_at=? WHERE business_id=? AND trial_status='ACTIVE' AND trial_end_date<?").run(nowIso2(), u.organizationId, today);
  const subscription = db.prepare("SELECT * FROM commercial_subscriptions WHERE business_id=? ORDER BY created_at DESC LIMIT 1").get(u.organizationId);
  const trial = db.prepare("SELECT trial_id as trialId,trial_start_date as trialStartDate,trial_end_date as trialEndDate,trial_status as trialStatus,converted_to_paid as convertedToPaid FROM commercial_trials WHERE business_id=? ORDER BY created_at DESC LIMIT 1").get(u.organizationId);
  const usage = db.prepare(`SELECT (SELECT COUNT(*) FROM properties WHERE organization_id=?) as properties,(SELECT COUNT(*) FROM beds WHERE organization_id=?) as beds,(SELECT COUNT(*) FROM users WHERE organization_id=?) as users`).get(u.organizationId, u.organizationId, u.organizationId);
  const devices = db.prepare("SELECT activation_id as activationId,device_name as deviceName,status,activated_at as activatedAt FROM license_device_activations WHERE business_id=? AND status='Active' ORDER BY activated_at DESC").all(u.organizationId);
  const license = db.prepare("SELECT id,plan,status,expires_at as expiresAt,key_hint as keyHint FROM saas_licenses WHERE organization_id=? ORDER BY created_at DESC LIMIT 1").get(u.organizationId);
  const planCode = normalizePlanCode(subscription?.plan_code || license?.plan || org?.plan || "STARTER");
  res.json({ organization: org, plan: commercialPlan(planCode), subscription: subscription || null, trial: trial || null, license: license || null, masterLicense: null, devices, usage: { ...usage, devices: devices.length }, activationRequired: requiresPlanActivation(u.organizationId) });
});
app.post("/api/commercial/trials/start", licenseAuth, (req, res) => {
  const u = userFor(req), orgId2 = u.organizationId, orgState = db.prepare("SELECT status FROM organizations WHERE id=?").get(orgId2), existingSubscription = db.prepare("SELECT subscription_id FROM commercial_subscriptions WHERE business_id=? AND payment_status='Paid' LIMIT 1").get(orgId2), existingLicense = db.prepare("SELECT id FROM saas_licenses WHERE organization_id=? LIMIT 1").get(orgId2);
  if (orgState?.status !== "Trial" || existingSubscription || existingLicense) return res.status(409).json({ error: "A free trial is only available once for a Trial workspace that has not had a paid license." });
  const previous = db.prepare("SELECT trial_id,trial_status as status FROM commercial_trials WHERE business_id=? ORDER BY created_at DESC LIMIT 1").get(orgId2);
  if (previous) return res.status(409).json({ error: previous.status === "ACTIVE" ? "This workspace trial is already active." : "A trial has already been used for this workspace. Contact support if it needs review." });
  const plan = commercialPlan("PRO");
  if (!plan) return res.status(500).json({ error: "Trial plan configuration is unavailable." });
  const today = /* @__PURE__ */ new Date(), end = new Date(today.getTime() + Number(plan.trialDays || 14) * 864e5), startDate = today.toISOString().slice(0, 10), endDate = end.toISOString().slice(0, 10), trialId = uid2(), subscriptionId = uid2(), now = nowIso2(), deviceId = String(req.body?.deviceId || "").slice(0, 180), deviceHash = deviceId ? crypto2.createHash("sha256").update(deviceId).digest("hex") : "";
  const begin = db.transaction(() => {
    db.prepare("INSERT INTO commercial_trials (trial_id,customer_id,business_id,device_id,trial_start_date,trial_end_date,trial_status,created_at,updated_at) VALUES (?,?,?,?,?,?,'ACTIVE',?,?)").run(trialId, u.id, orgId2, deviceHash, startDate, endDate, now, now);
    db.prepare("INSERT INTO commercial_subscriptions (subscription_id,customer_id,business_id,plan_code,plan_name_snapshot,billing_cycle,subscription_status,start_date,end_date,trial_start_date,trial_end_date,payment_status,pricing_snapshot_json,created_at,updated_at) VALUES (?,?,?,'PRO','PRO','CUSTOM','TRIAL',?,?,?,?,'Not required','{}',?,?)").run(subscriptionId, u.id, orgId2, startDate, endDate, startDate, endDate, now, now);
    db.prepare("UPDATE organizations SET plan='Trial',status='Trial',trial_ends_at=?,next_billing_at='' WHERE id=?").run(endDate, orgId2);
    db.prepare("INSERT INTO activities (id,organization_id,title,detail,kind,created_at) VALUES (?,?,?,?,?,?)").run(uid2(), orgId2, "Free trial started", "PRO features \xB7 14-day trial ends " + endDate, "subscription", now);
    db.prepare("INSERT INTO audit_log (id,organization_id,user_id,action,entity,entity_id,created_at) VALUES (?,?,?,?,?,?,?)").run(uid2(), orgId2, u.id, "trial.started", "trial", trialId, now);
  });
  begin();
  res.status(201).json({ trial: { trialId, trialStartDate: startDate, trialEndDate: endDate, trialStatus: "ACTIVE" }, plan });
});
app.post("/api/commercial/subscriptions", licenseAuth, (req, res) => {
  const u = userFor(req), planCode = normalizePlanCode(String(req.body?.planCode || "")), billingCycle = String(req.body?.billingCycle || "").toUpperCase();
  if (!["MONTHLY", "ANNUAL"].includes(billingCycle)) return res.status(400).json({ error: "Choose monthly or annual billing." });
  const plan = commercialPlan(planCode);
  if (!plan || !plan.monthlyPricePaise && !plan.annualPricePaise) return res.status(400).json({ error: "Choose a configured paid plan or contact sales for Enterprise." });
  const amount = billingCycle === "MONTHLY" ? plan.monthlyPricePaise : plan.annualPricePaise;
  if (!Number.isSafeInteger(amount) || amount <= 0) return res.status(400).json({ error: "That billing option is not configured." });
  const id = uid2(), now = nowIso2(), snapshot = JSON.stringify({ planCode: plan.code, planName: plan.name, billingCycle, baseAmountPaise: amount, currency: plan.currency });
  db.prepare("INSERT INTO commercial_subscriptions (subscription_id,customer_id,business_id,plan_code,plan_name_snapshot,billing_cycle,subscription_status,base_amount_paise,taxable_amount_paise,total_amount_paise,currency,payment_status,payment_provider,pricing_snapshot_json,created_at,updated_at) VALUES (?,?,?,?,?,?,'PENDING',?,?,?,?,'Pending','Manual',?,?,?)").run(id, u.id, u.organizationId, plan.code, plan.name, billingCycle, amount, amount, amount, plan.currency, snapshot, now, now);
  db.prepare("INSERT INTO audit_log (id,organization_id,user_id,action,entity,entity_id,created_at) VALUES (?,?,?,?,?,?,?)").run(uid2(), u.organizationId, u.id, "subscription.requested", "subscription", id, now);
  res.status(201).json({ subscription: { subscriptionId: id, planCode: plan.code, billingCycle, status: "PENDING", amountPaise: amount, currency: plan.currency, paymentStatus: "Pending" }, message: "Request saved. The plan activates only after an administrator confirms payment." });
});
var normalizeLicenseKey = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
var hashLicenseKey = (value) => crypto2.createHash("sha256").update(normalizeLicenseKey(value)).digest("hex");
var licenseEncryptionKey = () => crypto2.createHash("sha256").update(process.env.NIVASBOOK_SESSION_SECRET || "local-development-session-secret-change-before-deployment").digest();
var encryptLicenseKey = (value) => {
  const iv = crypto2.randomBytes(12), cipher = crypto2.createCipheriv("aes-256-gcm", licenseEncryptionKey(), iv), encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
};
var decryptLicenseKey = (value) => {
  try {
    const [iv, tag, encrypted] = value.split(".");
    if (!iv || !tag || !encrypted) return "";
    const decipher = crypto2.createDecipheriv("aes-256-gcm", licenseEncryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
};
app.get("/api/license/profile", licenseAuth, (req, res) => {
  const u = userFor(req), today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const org = db.prepare("SELECT plan,status,trial_ends_at as trialEndsAt,next_billing_at as nextBillingAt FROM organizations WHERE id=?").get(u.organizationId);
  let license = db.prepare("SELECT id,plan,status,starts_at as startsAt,expires_at as expiresAt,key_hint as keyHint,activated_at as activatedAt,owner_login_email as ownerLoginEmail,(SELECT email FROM users WHERE id=saas_licenses.activated_by) as activatedEmail FROM saas_licenses WHERE organization_id=? ORDER BY created_at DESC LIMIT 1").get(u.organizationId);
  if (license?.status === "Active" && license.expiresAt < today) {
    db.prepare("UPDATE saas_licenses SET status='Expired' WHERE id=? AND status='Active'").run(license.id);
    db.prepare("UPDATE organizations SET status='Past due' WHERE id=? AND status='Active'").run(u.organizationId);
    license = { ...license, status: "Expired" };
  }
  const trialUsed = !!db.prepare("SELECT trial_id FROM commercial_trials WHERE business_id=? LIMIT 1").get(u.organizationId);
  const everPaid = !!db.prepare("SELECT subscription_id FROM commercial_subscriptions WHERE business_id=? AND billing_cycle<>'CUSTOM' AND payment_status='Paid' LIMIT 1").get(u.organizationId) || !!db.prepare("SELECT id FROM saas_licenses WHERE organization_id=? LIMIT 1").get(u.organizationId);
  res.json({ plan: org?.plan || "Trial", status: org?.status || "Trial", trialEndsAt: org?.trialEndsAt || "", nextBillingAt: org?.nextBillingAt || "", trialAvailable: !trialUsed && !everPaid, license: license || null, activationRequired: requiresPlanActivation(u.organizationId) });
});
app.get("/api/license/master-status", licenseAuth, (_req, res) => res.status(404).json({ error: "Not found." }));
app.post("/api/license/activate-master", licenseAuth, (_req, res) => res.status(404).json({ error: "Not found." }));
app.post("/api/license/activate", licenseAuth, (req, res) => {
  const u = userFor(req), normalized = normalizeLicenseKey(req.body?.key);
  if (!/^NVB1[A-F0-9]{32}$/.test(normalized)) return res.status(400).json({ error: "Enter a valid Autrob Stay activation key." });
  const license = db.prepare("SELECT id,organization_id as organizationId,plan,starts_at as startsAt,expires_at as expiresAt,status FROM saas_licenses WHERE key_hash=?").get(hashLicenseKey(req.body?.key));
  if (!license) return res.status(404).json({ error: "That activation key was not found." });
  if (license.organizationId !== u.organizationId) return res.status(403).json({ error: "This activation key was issued for a different owner account." });
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  if (license.status !== "Issued") return res.status(409).json({ error: license.status === "Revoked" ? "This activation key has been revoked." : license.status === "Expired" ? "This activation key has expired." : "This activation key has already been used." });
  if (license.startsAt > today || license.expiresAt < today) {
    db.prepare("UPDATE saas_licenses SET status='Expired' WHERE id=? AND status='Issued'").run(license.id);
    return res.status(400).json({ error: "This activation key is outside its valid dates." });
  }
  const activate = db.transaction(() => {
    db.prepare("UPDATE saas_licenses SET status='Active',activated_by=?,activated_at=? WHERE id=? AND status='Issued'").run(u.id, nowIso2(), license.id);
    db.prepare("UPDATE organizations SET plan=?,status='Active',trial_ends_at='',next_billing_at=? WHERE id=?").run(license.plan, license.expiresAt, u.organizationId);
    db.prepare("INSERT INTO activities (id,organization_id,title,detail,kind,created_at) VALUES (?,?,?,?,?,?)").run(uid2(), u.organizationId, "Paid plan activated", license.plan + " plan \xB7 valid until " + license.expiresAt, "license", nowIso2());
    db.prepare("INSERT INTO audit_log (id,organization_id,user_id,action,entity,entity_id,created_at) VALUES (?,?,?,?,?,?,?)").run(uid2(), u.organizationId, u.id, "license.activated", "license", license.id, nowIso2());
  });
  activate();
  res.json({ ok: true, plan: license.plan, status: "Active", expiresAt: license.expiresAt });
});
var desktopAuth = (req, res, next) => {
  const expected = process.env.NIVASBOOK_DESKTOP_TOKEN || "", provided = String(req.headers["x-autrob-desktop-token"] || "");
  if (!expected || !provided || !safeEqual(expected, provided)) return res.status(403).json({ error: "Desktop application authorization is required." });
  next();
};
app.post("/api/desktop/licenses/activate", desktopAuth, async (req, res) => {
  const licenseServerUrl = process.env.NIVASBOOK_LICENSE_SERVER_URL?.trim();
  if (!desktopApp || !licenseServerUrl) return res.status(503).json({ error: "Online license activation is not configured for this Windows app." });
  const normalized = normalizeLicenseKey(req.body?.key);
  if (!/^NVB1[A-F0-9]{32}$/.test(normalized)) return res.status(400).json({ error: "Enter a valid Autrob Stay activation key." });
  const ownerLoginEmail = String(req.body?.ownerLoginEmail || "").trim().toLowerCase(), ownerLoginPassword = String(req.body?.ownerLoginPassword || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerLoginEmail) || ownerLoginPassword.length < 12 || ownerLoginPassword.length > 72) return res.status(400).json({ error: "Enter the owner login email and a password of 12\u201372 characters used when this license was issued." });
  const owner = db.prepare("SELECT owner_user_id as ownerId FROM organizations WHERE id=?").get(desktopWorkspaceOrgId);
  if (!owner) return res.status(404).json({ error: "The local owner workspace was not found." });
  const conflictingUser = db.prepare("SELECT id FROM users WHERE lower(email)=? AND id<>?").get(ownerLoginEmail, owner.ownerId);
  if (conflictingUser) return res.status(409).json({ error: "That email already belongs to another account in this Windows workspace. Use the owner login email issued with the license." });
  try {
    const deviceId = crypto2.createHash("sha256").update(process.env.NIVASBOOK_DESKTOP_TOKEN || "").digest("hex");
    const endpoint = new URL("/api/desktop/licenses/activate", licenseServerUrl);
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: normalized, deviceId, ownerLoginEmail, ownerLoginPassword }), signal: AbortSignal.timeout(15e3) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: result.error || "The license server rejected this activation." });
    const licenseId = uid2(), activatedAt = nowIso2(), planCode = normalizePlanCode(result.plan), keyHash2 = hashLicenseKey(normalized);
    const activate = db.transaction(() => {
      const existing = db.prepare("SELECT id FROM saas_licenses WHERE key_hash=?").get(keyHash2);
      if (existing) db.prepare("UPDATE saas_licenses SET organization_id=?,status='Active',activated_by=?,activated_at=?,expires_at=?,plan=?,plan_code=?,owner_login_email=?,owner_login_password_hash=? WHERE id=?").run(desktopWorkspaceOrgId, owner.ownerId, activatedAt, result.expiresAt, result.plan, planCode, ownerLoginEmail, hash(ownerLoginPassword), existing.id);
      else db.prepare("INSERT INTO saas_licenses (id,organization_id,key_hash,key_hint,plan,starts_at,expires_at,status,activated_by,activated_at,created_by,created_at,revoked_at,plan_code,subscription_id,owner_login_email,owner_login_password_hash) VALUES (?,?,?,?,?,?,?,'Active',?,?,?,?,?,?,?,?,?)").run(licenseId, desktopWorkspaceOrgId, keyHash2, "\u2022\u2022\u2022\u2022 " + normalized.slice(-4), result.plan, (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), result.expiresAt, owner.ownerId, activatedAt, owner.ownerId, activatedAt, "", planCode, "", ownerLoginEmail, hash(ownerLoginPassword));
      db.prepare("UPDATE users SET email=?,password_hash=?,role='owner' WHERE id=?").run(ownerLoginEmail, hash(ownerLoginPassword), owner.ownerId);
      db.prepare("UPDATE organizations SET plan=?,status='Active',trial_ends_at='',next_billing_at=? WHERE id=?").run(result.plan, result.expiresAt, desktopWorkspaceOrgId);
      db.prepare("UPDATE commercial_trials SET trial_status='CONVERTED',converted_to_paid=1,updated_at=? WHERE business_id=? AND trial_status IN ('ACTIVE','EXPIRED')").run(activatedAt, desktopWorkspaceOrgId);
      db.prepare("INSERT INTO activities (id,organization_id,title,detail,kind,created_at) VALUES (?,?,?,?,?,?)").run(uid2(), desktopWorkspaceOrgId, "Paid plan activated", result.plan + " plan \xB7 valid until " + result.expiresAt, "license", activatedAt);
      db.prepare("INSERT INTO audit_log (id,organization_id,user_id,action,entity,entity_id,created_at) VALUES (?,?,?,?,?,?,?)").run(uid2(), desktopWorkspaceOrgId, owner.ownerId, "license.activated.remotely", "license", existing?.id || licenseId, activatedAt);
    });
    activate();
    res.json({ ok: true, plan: result.plan, status: "Active", expiresAt: result.expiresAt, ownerLoginEmail });
  } catch (error) {
    console.error("Desktop license activation failed:", error);
    res.status(502).json({ error: "Could not reach the license server. Check the internet connection and try again." });
  }
});
app.post("/api/desktop/owner-credentials/recover", desktopAuth, (req, res) => {
  const password = String(req.body?.password || "");
  if (password.length < 12 || password.length > 200) return res.status(400).json({ error: "Temporary password is invalid." });
  const user = db.prepare("SELECT u.id FROM organizations o JOIN users u ON u.id=o.owner_user_id WHERE o.id=?").get(desktopWorkspaceOrgId);
  if (!user) return res.status(404).json({ error: "The local owner account was not found." });
  db.prepare("UPDATE users SET password_hash=?,role='owner' WHERE id=?").run(hash(password), user.id);
  res.json({ ok: true });
});
app.get("/api/desktop/master-license/status", desktopAuth, (_req, res) => {
  const state = desktopMasterLicenseState();
  res.json({ active: !!state?.active, activatedAt: state?.activatedAt || "", expiresAt: state?.expiresAt || "", keyHint: state?.keyHint || "" });
});
app.post("/api/desktop/master-license/activate", desktopAuth, (req, res) => {
  if (!desktopApp) return res.status(404).json({ error: "Not found." });
  const normalized = normalizeLicenseKey(req.body?.key), candidateHash = crypto2.createHash("sha256").update(normalized).digest("hex").toUpperCase();
  if (!safeEqual(candidateHash, DESKTOP_MASTER_LICENSE_HASH)) return res.status(401).json({ error: "The key could not be verified." });
  const existing = desktopMasterLicenseState();
  if (existing?.active) return res.json({ ok: true, active: true, plan: "Business", expiresAt: existing.expiresAt });
  if (existing) return res.status(410).json({ error: "This key is no longer active." });
  const activatedAt = nowIso2(), expiresAt = addCalendarYear(activatedAt);
  db.prepare("INSERT INTO desktop_master_license (id,activated_at,expires_at,key_hint) VALUES (1,?,?,?)").run(activatedAt, expiresAt, "\u2022\u2022\u2022\u2022-" + normalized.slice(-6));
  db.prepare("UPDATE organizations SET plan='BUSINESS',status='Active',trial_ends_at='',next_billing_at='' WHERE id=?").run(desktopWorkspaceOrgId);
  res.json({ ok: true, active: true, plan: "Business", expiresAt });
});
app.post("/api/desktop/master-license/remove", desktopAuth, (_req, res) => {
  db.prepare("DELETE FROM desktop_master_license WHERE id=1").run();
  if (!hasActiveSaasLicense(desktopWorkspaceOrgId) && !hasActiveCommercialSubscription(desktopWorkspaceOrgId)) db.prepare("UPDATE organizations SET status='Past due' WHERE id=?").run(desktopWorkspaceOrgId);
  res.json({ ok: true, active: false });
});
app.get("/api/desktop/health", desktopAuth, (_req, res) => res.json({ ok: true, product: "Autrob Stay", dataDirectory: path.resolve(dataDir) }));
app.get("/api/desktop/backups", desktopAuth, (_req, res) => {
  const backupDir = path.join(dataDir, "backups");
  try {
    const entries = fsSync.readdirSync(backupDir).filter((name) => /^nivasbook-.*\.sqlite$/i.test(name)).map((name) => {
      const fullPath = path.join(backupDir, name);
      const stat = fsSync.statSync(fullPath);
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ backups: entries, automaticBackupFolder: backupDir });
  } catch {
    res.json({ backups: [], automaticBackupFolder: backupDir });
  }
});
app.post("/api/desktop/backup", desktopAuth, async (_req, res) => {
  let dest = "";
  try {
    const backupDir = path.join(dataDir, "backups");
    await fs.mkdir(backupDir, { recursive: true });
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    dest = path.join(backupDir, `nivasbook-${timestamp}.sqlite`);
    await db.backup(dest);
    const check = new Database(dest, { readonly: true, fileMustExist: true });
    let integrity;
    let schemaVersion = 0;
    try {
      integrity = check.pragma("integrity_check", { simple: true });
      const hasMigrations = !!check.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
      if (hasMigrations) schemaVersion = Number(check.prepare("SELECT COALESCE(MAX(version),0) as version FROM schema_migrations").get().version);
    } finally {
      check.close();
    }
    if (integrity !== "ok") {
      await fs.rm(dest, { force: true });
      return res.status(500).json({ error: "Backup validation failed. The saved copy did not pass SQLite integrity check." });
    }
    const backups = fsSync.readdirSync(backupDir).filter((name) => /^nivasbook-.*\.sqlite$/i.test(name)).map((name) => ({ name, path: path.join(backupDir, name), mtime: fsSync.statSync(path.join(backupDir, name)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
    for (const stale of backups.slice(30)) await fs.rm(stale.path, { force: true });
    res.json({ path: dest, integrity, schemaVersion, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
  } catch (error) {
    console.error("Database backup failed:", error);
    if (dest) await fs.rm(dest, { force: true }).catch(() => {
    });
    res.status(500).json({ error: error instanceof Error ? `Could not create a validated database backup: ${error.message}` : "Could not create a validated database backup." });
  }
});
app.get("/api/backups", ownerAuth, (req, res) => {
  const user = userFor(req);
  const orgId2 = user.organizationId;
  const orgKey = crypto2.createHash("sha256").update(orgId2).digest("hex").slice(0, 20);
  const backupDir = path.join(dataDir, "backups", orgKey);
  try {
    const backups = fsSync.readdirSync(backupDir).filter((name) => /^nivasbook-workspace-.*\.sqlite$/i.test(name)).map((name) => {
      const stat = fsSync.statSync(path.join(backupDir, name));
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ backups, automaticBackupFolder: "Downloads" });
  } catch {
    res.json({ backups: [], automaticBackupFolder: "Downloads" });
  }
});
app.delete("/api/backups/:name", ownerAuth, (req, res) => {
  const user = userFor(req), name = String(req.params.name || "");
  if (!/^nivasbook-workspace-[a-z0-9T_-]+\.sqlite$/i.test(name)) return res.status(400).json({ error: "Choose a verified backup file." });
  const orgKey = crypto2.createHash("sha256").update(user.organizationId).digest("hex").slice(0, 20), backupDir = path.resolve(dataDir, "backups", orgKey), target = path.resolve(backupDir, name);
  if (path.dirname(target) !== backupDir) return res.status(400).json({ error: "Invalid backup path." });
  try {
    const stat = fsSync.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) return res.status(400).json({ error: "Backup file is not a regular file." });
    fsSync.unlinkSync(target);
    res.json({ ok: true });
  } catch (error) {
    if (error?.code === "ENOENT") return res.status(404).json({ error: "Backup copy was not found." });
    res.status(500).json({ error: "Could not delete this backup copy." });
  }
});
app.post("/api/backups", ownerAuth, async (req, res) => {
  const user = userFor(req);
  const orgId2 = user.organizationId;
  const orgKey = crypto2.createHash("sha256").update(orgId2).digest("hex").slice(0, 20);
  const backupDir = path.join(dataDir, "backups", orgKey);
  let dest = "";
  try {
    await fs.mkdir(backupDir, { recursive: true });
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const name = `nivasbook-workspace-${timestamp}.sqlite`;
    dest = path.join(backupDir, name);
    await db.backup(dest);
    const snapshot = new Database(dest);
    try {
      snapshot.pragma("foreign_keys = OFF");
      const tables = snapshot.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      const scrub = snapshot.transaction(() => {
        for (const { name: table } of tables) {
          const columns = snapshot.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all();
          if (columns.some((column) => column.name === "organization_id")) snapshot.prepare(`DELETE FROM ${JSON.stringify(table)} WHERE organization_id<>?`).run(orgId2);
          else if (table === "platform_admins") snapshot.prepare("DELETE FROM platform_admins").run();
        }
      });
      scrub();
    } finally {
      snapshot.close();
    }
    const check = new Database(dest, { readonly: true, fileMustExist: true });
    let integrity;
    let belongsToOrg = false;
    try {
      integrity = check.pragma("integrity_check", { simple: true });
      belongsToOrg = !!check.prepare("SELECT 1 FROM organizations WHERE id=?").get(orgId2);
      const hasOtherOrganizations = !!check.prepare("SELECT 1 FROM organizations WHERE id<>? LIMIT 1").get(orgId2);
      if (hasOtherOrganizations) throw new Error("Workspace backup contained another organization.");
    } finally {
      check.close();
    }
    if (integrity !== "ok" || !belongsToOrg) {
      await fs.rm(dest, { force: true });
      return res.status(500).json({ error: "The workspace backup did not pass verification." });
    }
    const backups = fsSync.readdirSync(backupDir).filter((file) => /^nivasbook-workspace-.*\.sqlite$/i.test(file)).map((file) => ({ file, mtime: fsSync.statSync(path.join(backupDir, file)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
    for (const stale of backups.slice(30)) await fs.rm(path.join(backupDir, stale.file), { force: true });
    res.status(200).set({
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="${name}"`,
      "X-Backup-Integrity": integrity
    }).sendFile(dest, (error) => {
      if (error) console.error("Workspace backup download failed:", error.message);
      else downloadedWorkspaceBackups.add(`${orgId2}:${name}`);
    });
  } catch (error) {
    console.error("Workspace backup failed:", error);
    if (dest) await fs.rm(dest, { force: true }).catch(() => {
    });
    if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? `Could not create a verified workspace backup: ${error.message}` : "Could not create a verified workspace backup." });
  }
});
app.get("/api/backups/:name/download", ownerAuth, (req, res) => {
  const user = userFor(req), orgId2 = user.organizationId;
  const name = String(req.params.name || "");
  if (!/^nivasbook-workspace-[a-z0-9T_-]+\.sqlite$/i.test(name)) return res.status(400).json({ error: "Choose a verified workspace backup." });
  const orgKey = crypto2.createHash("sha256").update(orgId2).digest("hex").slice(0, 20);
  const backupDir = path.resolve(dataDir, "backups", orgKey), backupPath = path.resolve(backupDir, name);
  if (path.dirname(backupPath) !== backupDir || !fsSync.existsSync(backupPath)) return res.status(404).json({ error: "The verified backup is no longer available." });
  try {
    const check = new Database(backupPath, { readonly: true, fileMustExist: true });
    let integrity = "";
    let belongsToOrg = false;
    let hasOtherOrganizations = false;
    try {
      integrity = check.pragma("integrity_check", { simple: true });
      belongsToOrg = !!check.prepare("SELECT 1 FROM organizations WHERE id=?").get(orgId2);
      hasOtherOrganizations = !!check.prepare("SELECT 1 FROM organizations WHERE id<>? LIMIT 1").get(orgId2);
    } finally {
      check.close();
    }
    if (integrity !== "ok" || !belongsToOrg || hasOtherOrganizations) return res.status(400).json({ error: "The selected backup failed verification." });
    res.status(200).set({ "Content-Type": "application/vnd.sqlite3", "Content-Disposition": `attachment; filename="${name}"`, "X-Backup-Integrity": "ok" }).sendFile(backupPath, (error) => {
      if (error) console.error("Workspace backup download failed:", error.message);
      else downloadedWorkspaceBackups.add(`${orgId2}:${name}`);
    });
  } catch (error) {
    console.error("Workspace backup verification failed:", error);
    return res.status(400).json({ error: "The selected backup failed verification." });
  }
});
app.post("/api/backups/restore", ownerAuth, express.raw({ type: ["application/vnd.sqlite3", "application/octet-stream"], limit: "100mb" }), async (req, res) => {
  const owner = userFor(req), orgId2 = owner.organizationId, bytes = req.body;
  if (!Buffer.isBuffer(bytes) || bytes.length < 100) return res.status(400).json({ error: "Choose a valid Autrob Stay SQLite backup file." });
  const orgKey = crypto2.createHash("sha256").update(orgId2).digest("hex").slice(0, 20), backupDir = path.join(dataDir, "backups", orgKey);
  let uploadedPath = "", source;
  try {
    await fs.mkdir(backupDir, { recursive: true });
    uploadedPath = path.join(dataDir, `restore-upload-${crypto2.randomUUID()}.sqlite`);
    await fs.writeFile(uploadedPath, bytes, { flag: "wx" });
    source = new Database(uploadedPath, { readonly: true, fileMustExist: true });
    const integrity = source.pragma("integrity_check", { simple: true });
    const hasOwnerOrg = !!source.prepare("SELECT 1 FROM organizations WHERE id=?").get(orgId2);
    const hasOtherOrg = !!source.prepare("SELECT 1 FROM organizations WHERE id<>? LIMIT 1").get(orgId2);
    const required = ["properties", "rooms", "beds", "residents", "payments", "expenses"];
    const present = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((x) => x.name));
    if (integrity !== "ok" || !hasOwnerOrg || hasOtherOrg || required.some((name) => !present.has(name))) {
      source.close(); source = void 0;
      return res.status(400).json({ error: "This file is not a verified backup for your workspace. No live data was changed." });
    }
    const safetyName = `nivasbook-workspace-before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`, safetyPath = path.join(backupDir, safetyName);
    await db.backup(safetyPath);
    const safety = new Database(safetyPath);
    try {
      safety.pragma("foreign_keys = OFF");
      const snapshotTables = safety.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      safety.transaction(() => { for (const { name } of snapshotTables) { const cols = safety.prepare(`PRAGMA table_info(${JSON.stringify(name)})`).all(); if (cols.some((c) => c.name === "organization_id")) safety.prepare(`DELETE FROM ${JSON.stringify(name)} WHERE organization_id<>?`).run(orgId2); else if (name === "platform_admins") safety.prepare("DELETE FROM platform_admins").run(); } })();
    } finally { safety.close(); }
    source.close(); source = new Database(uploadedPath, { readonly: true, fileMustExist: true });
    const keepCurrent = /^(users|organizations|platform_admins|saas_|commercial_|owner_master_licenses|desktop_master_license|schema_migrations|audit_logs?$)/i;
    const tableNames = [...present].filter((name) => /^[a-zA-Z0-9_]+$/.test(name));
    const restoreCounts = {};
    db.pragma("foreign_keys = OFF");
    try {
      db.transaction(() => {
        const tables = tableNames.map((name) => ({ name, current: db.prepare(`PRAGMA table_info(${JSON.stringify(name)})`).all(), backup: source.prepare(`PRAGMA table_info(${JSON.stringify(name)})`).all() })).filter((t) => t.current.some((c) => c.name === "organization_id") && !keepCurrent.test(t.name));
        for (const table of [...tables].reverse()) restoreCounts[table.name] = db.prepare(`DELETE FROM ${JSON.stringify(table.name)} WHERE organization_id=?`).run(orgId2).changes;
        for (const table of tables) {
          const columns = table.current.map((c) => c.name).filter((name) => table.backup.some((b) => b.name === name));
          const select = source.prepare(`SELECT ${columns.map((c) => JSON.stringify(c)).join(",")} FROM ${JSON.stringify(table.name)} WHERE organization_id=?`);
          const insert = db.prepare(`INSERT INTO ${JSON.stringify(table.name)} (${columns.map((c) => JSON.stringify(c)).join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
          let count = 0; for (const row of select.iterate(orgId2)) { insert.run(...columns.map((c) => row[c])); count++; }
          restoreCounts[table.name] = count;
        }
      })();
    } finally { db.pragma("foreign_keys = ON"); }
    source.close(); source = void 0;
    audit(orgId2, owner.id, "workspace.backup_restored", "backup", safetyName);
    res.json({ ok: true, restored: restoreCounts, safetyBackup: safetyName });
  } catch (error) {
    source?.close();
    console.error("Workspace backup restore failed:", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ error: "Could not restore this backup. The current workspace was preserved." });
  } finally { if (uploadedPath) await fs.rm(uploadedPath, { force: true }).catch(() => {}); }
});
app.post("/api/backups/clear-data", ownerAuth, (req, res) => {
  const user = userFor(req), orgId2 = user.organizationId, backupName = String(req.body?.backupName || ""), downloadKey = `${orgId2}:${backupName}`;
  if (!/^nivasbook-workspace-[a-z0-9T_-]+\.sqlite$/i.test(backupName) || !downloadedWorkspaceBackups.has(downloadKey)) return res.status(400).json({ error: "Download this verified backup from Verified copies before deleting workspace data." });
  const orgKey = crypto2.createHash("sha256").update(orgId2).digest("hex").slice(0, 20), backupDir = path.resolve(dataDir, "backups", orgKey), backupPath = path.resolve(backupDir, backupName);
  if (path.dirname(backupPath) !== backupDir || !fsSync.existsSync(backupPath)) return res.status(400).json({ error: "The required verified backup is missing. No workspace data was deleted." });
  try {
    const check = new Database(backupPath, { readonly: true, fileMustExist: true });
    let integrity = "";
    let belongsToOrg = false;
    let hasOtherOrganizations = false;
    try {
      integrity = check.pragma("integrity_check", { simple: true });
      belongsToOrg = !!check.prepare("SELECT 1 FROM organizations WHERE id=?").get(orgId2);
      hasOtherOrganizations = !!check.prepare("SELECT 1 FROM organizations WHERE id<>? LIMIT 1").get(orgId2);
    } finally {
      check.close();
    }
    if (integrity !== "ok" || !belongsToOrg || hasOtherOrganizations) return res.status(400).json({ error: "The backup failed workspace verification. No data was deleted." });
    const org = db.prepare("SELECT owner_user_id as ownerUserId FROM organizations WHERE id=?").get(orgId2);
    if (!org) return res.status(404).json({ error: "Workspace not found." });
    const clear = db.transaction(() => {
      const counts = {}, tables = ["electricity_payments", "electricity_bills", "electricity_bill_revisions", "food_bills", "food_items", "resident_item_issues", "resident_room_history", "resident_stays", "electricity_cycles", "meter_readings", "beds", "rooms", "residents", "payments", "expenses", "enquiries", "maintenance_requests", "assets", "message_automation_rules", "message_templates", "messages", "activities", "audit_log", "properties"];
      for (const table of tables) {
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
        counts[table] = Number(db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE organization_id=?`).get(orgId2).count);
        db.prepare(`DELETE FROM ${table} WHERE organization_id=?`).run(orgId2);
      }
      const messageSettings = db.prepare("SELECT 1 FROM message_settings WHERE organization_id=?").get(orgId2);
      if (messageSettings) {
        counts.messageSettings = 1;
        db.prepare("DELETE FROM message_settings WHERE organization_id=?").run(orgId2);
      }
      counts.teamUsers = Number(db.prepare("SELECT COUNT(*) as count FROM users WHERE organization_id=? AND id<>?").get(orgId2, org.ownerUserId).count);
      db.prepare("DELETE FROM users WHERE organization_id=? AND id<>?").run(orgId2, org.ownerUserId);
      db.prepare("UPDATE org_settings SET owner_phone='',business_name='',business_address='',payment_upi='',bank_name='',bank_account='',bank_ifsc='',payment_qr_url='' WHERE organization_id=?").run(orgId2);
      return counts;
    });
    const deleted = clear();
    downloadedWorkspaceBackups.delete(downloadKey);
    res.json({ ok: true, deleted });
  } catch (error) {
    console.error("Workspace data deletion failed:", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ error: "Could not delete workspace data. No partial changes were saved." });
  }
});
app.post("/api/desktop/clear-data", desktopAuth, (req, res) => {
  try {
    const backupName = String(req.body?.backupName || "");
    if (!/^nivasbook-[a-z0-9T_-]+\.sqlite$/i.test(backupName)) return res.status(400).json({ error: "Download a verified copy before deleting workspace data." });
    const backupDir = path.resolve(dataDir, "backups");
    const backupPath = path.resolve(backupDir, backupName);
    if (path.dirname(backupPath) !== backupDir || !fsSync.existsSync(backupPath)) return res.status(400).json({ error: "The required verified backup is missing. No workspace data was deleted." });
    const backupCheck = new Database(backupPath, { readonly: true, fileMustExist: true });
    let backupIntegrity;
    try {
      backupIntegrity = backupCheck.pragma("integrity_check", { simple: true });
    } finally {
      backupCheck.close();
    }
    if (backupIntegrity !== "ok") return res.status(400).json({ error: "The backup failed integrity verification. No workspace data was deleted." });
    const org = db.prepare("SELECT owner_user_id as ownerUserId FROM organizations WHERE id=?").get(desktopWorkspaceOrgId);
    if (!org) return res.status(404).json({ error: "Workspace not found." });
    const clear = db.transaction(() => {
      const counts2 = {};
      const tables = ["electricity_payments", "electricity_bills", "electricity_bill_revisions", "resident_item_issues", "resident_room_history", "electricity_cycles", "meter_readings", "beds", "rooms", "residents", "payments", "expenses", "enquiries", "maintenance_requests", "assets", "message_automation_rules", "message_templates", "messages", "activities", "audit_log", "properties"];
      for (const table of tables) {
        const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
        if (!exists) continue;
        counts2[table] = Number(db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE organization_id=?`).get(desktopWorkspaceOrgId).count);
        db.prepare(`DELETE FROM ${table} WHERE organization_id=?`).run(desktopWorkspaceOrgId);
      }
      const messageSettings = db.prepare("SELECT 1 FROM message_settings WHERE organization_id=?").get(desktopWorkspaceOrgId);
      if (messageSettings) {
        counts2.messageSettings = 1;
        db.prepare("DELETE FROM message_settings WHERE organization_id=?").run(desktopWorkspaceOrgId);
      }
      counts2.teamUsers = Number(db.prepare("SELECT COUNT(*) as count FROM users WHERE organization_id=? AND id<>?").get(desktopWorkspaceOrgId, org.ownerUserId).count);
      db.prepare("DELETE FROM users WHERE organization_id=? AND id<>?").run(desktopWorkspaceOrgId, org.ownerUserId);
      db.prepare("UPDATE org_settings SET owner_phone='',business_name='',business_address='',payment_upi='',bank_name='',bank_account='',bank_ifsc='',payment_qr_url='' WHERE organization_id=?").run(desktopWorkspaceOrgId);
      for (const table of tables) {
        if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table) && Number(db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE organization_id=?`).get(desktopWorkspaceOrgId).count) > 0) throw new Error(`Workspace data remains in ${table}; deletion was rolled back.`);
      }
      return counts2;
    });
    const counts = clear();
    res.json({ ok: true, deleted: counts });
  } catch (error) {
    console.error("Workspace data deletion failed:", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ error: "Could not delete workspace data. No partial changes were saved." });
  }
});
app.post("/api/desktop/restore", desktopAuth, async (req, res) => {
  let source;
  let incoming = "";
  let replaced = "";
  let databaseClosed = false;
  try {
    const input = String(req.body?.path || ""), selected = input.startsWith("file:") ? fileURLToPath(input) : path.resolve(input), sourceStat = await fs.stat(selected);
    if (!sourceStat.isFile() || sourceStat.size < 100) return res.status(400).json({ error: "The selected backup file is invalid." });
    source = new Database(selected, { readonly: true, fileMustExist: true });
    const integrity = source.pragma("integrity_check", { simple: true });
    const tables = source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','organizations','properties','residents','payments','expenses')").all();
    if (integrity !== "ok" || tables.length < 6) {
      source.close();
      source = void 0;
      return res.status(400).json({ error: "The selected file is not a valid Autrob Stay database backup." });
    }
    const hasMigrationTable = !!source.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
    const version = hasMigrationTable ? Number(source.prepare("SELECT COALESCE(MAX(version),0) as version FROM schema_migrations").get()?.version || 0) : 0;
    const requiredColumns = {
      users: ["id", "name", "email", "password_hash", "organization_id"],
      organizations: ["id", "name", "owner_user_id", "plan", "status", "trial_ends_at", "next_billing_at", "created_at"],
      properties: ["id", "organization_id", "name", "address", "type", "beds", "created_at"],
      residents: ["id", "organization_id", "name", "phone", "property", "room", "rent", "due", "status", "joined", "created_at"],
      payments: ["id", "organization_id", "resident", "property", "amount", "date", "method", "purpose", "status", "created_at"],
      expenses: ["id", "organization_id", "property", "description", "category", "amount", "date", "created_at"]
    };
    for (const [table, required2] of Object.entries(requiredColumns)) {
      const columns = new Set(source.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
      const missing = required2.filter((column) => !columns.has(column));
      if (missing.length) {
        source.close();
        source = void 0;
        return res.status(400).json({ error: `This backup uses an incompatible ${table} schema (missing ${missing.join(", ")}). It was not restored.` });
      }
    }
    const backupDir = path.join(dataDir, "backups");
    await fs.mkdir(backupDir, { recursive: true });
    const safe = path.join(backupDir, `nivasbook-before-restore-${Date.now()}.sqlite`);
    await db.backup(safe);
    const restoreOwner = source.prepare(`SELECT o.id as organizationId,o.owner_user_id as ownerUserId,(SELECT COUNT(*) FROM properties p WHERE p.organization_id=o.id) as properties,(SELECT COUNT(*) FROM residents r WHERE r.organization_id=o.id) as residents FROM organizations o JOIN users u ON u.id=o.owner_user_id WHERE o.id<>'org-nivasbook-demo' AND (EXISTS(SELECT 1 FROM properties p WHERE p.organization_id=o.id) OR EXISTS(SELECT 1 FROM residents r WHERE r.organization_id=o.id)) ORDER BY properties DESC,residents DESC,o.created_at LIMIT 1`).get();
    incoming = path.join(dataDir, `restore-${crypto2.randomUUID()}.sqlite`);
    await source.backup(incoming);
    source.close();
    source = void 0;
    if (restoreOwner) {
      const restoredDb = new Database(incoming);
      try {
        restoredDb.prepare("UPDATE users SET password_hash=?,role='owner' WHERE id=?").run(hash(defaultPassword), restoreOwner.ownerUserId);
        if (desktopTrialMode && desktopTrial) restoredDb.prepare("UPDATE organizations SET plan='Trial',status='Trial',trial_ends_at=?,next_billing_at='' WHERE id=?").run(desktopTrial.expiresAt.slice(0, 10), restoreOwner.organizationId);
      } finally {
        restoredDb.close();
      }
    }
    const verify = new Database(incoming, { readonly: true });
    const incomingIntegrity = verify.pragma("integrity_check", { simple: true });
    verify.close();
    if (incomingIntegrity !== "ok") throw new Error("The restored copy did not pass SQLite integrity validation.");
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
    databaseClosed = true;
    replaced = path.join(backupDir, `nivasbook-replaced-${Date.now()}.sqlite`);
    await fs.rename(databasePath, replaced);
    await fs.rename(incoming, databasePath);
    incoming = "";
    res.json({ ok: true, safetyBackup: safe, schemaVersion: version, requiresRestart: true });
    res.once("finish", () => setTimeout(() => process.exit(0), 250));
  } catch (error) {
    source?.close();
    if (incoming) {
      try {
        await fs.rm(incoming, { force: true });
      } catch {
      }
    }
    let recoveryError = "";
    if (replaced) {
      try {
        await fs.access(databasePath);
      } catch {
        try {
          await fs.rename(replaced, databasePath);
        } catch (restoreError) {
          recoveryError = restoreError instanceof Error ? restoreError.message : "Could not return the original database file.";
        }
      }
    }
    const reason = error instanceof Error ? error.message : "Unknown restore error";
    console.error("Database restore failed:", reason, recoveryError ? `Recovery failed: ${recoveryError}` : "");
    if (databaseClosed) res.once("finish", () => setTimeout(() => process.exit(0), 250));
    if (!res.headersSent) res.status(500).json({ error: `Restore failed: ${reason}.${recoveryError ? ` Recovery also failed: ${recoveryError}.` : ""} ${databaseClosed ? "The local service will restart automatically." : "The current database was preserved."}`, requiresRestart: databaseClosed });
  }
});
app.post("/api/resident/portal/signup", (req, res) => {
  if (desktopApp) return res.status(404).json({ error: "Route not found." });
  const name = val(req.body?.name, 120), phone = val(req.body?.phone, 30), phoneKey = phone.replace(/\D/g, ""), email = val(req.body?.email, 180).toLowerCase(), password = String(req.body?.password || "");
  if (name.length < 2 || phoneKey.length < 10 || phoneKey.length > 15 || password.length < 8) return res.status(400).json({ error: "Enter your name, a valid mobile number and a password with at least 8 characters." });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address or leave it blank." });
  if (residentSuspended(phoneKey)) return res.status(403).json({ error: "This resident account is suspended. Contact support." });
  const candidates = db.prepare("SELECT id,phone FROM residents WHERE phone<>'' ORDER BY created_at DESC LIMIT 5000").all().filter((r) => String(r.phone || "").replace(/\D/g, "").slice(-10) === phoneKey.slice(-10));
  if (candidates.length > 1) return res.status(409).json({ error: "This number is linked to more than one resident record. Ask your PG owner to verify the account." });
  try {
    const now = nowIso2();
    if (candidates.length === 1) db.prepare("UPDATE residents SET portal_password_hash=? WHERE id=?").run(hash(password), candidates[0].id);
    else db.prepare("INSERT INTO resident_portal_signups (phone_key,name,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(phoneKey, name, email, hash(password), now, now);
    const token = createResidentAccessToken(candidates[0]?.id || "", phoneKey);
    res.status(201).json({ accessToken: token, resident: { id: candidates[0]?.id || "", name, email }, accountType: candidates.length ? "resident" : "enquiry" });
  } catch (e) {
    res.status(e?.code?.startsWith("SQLITE_CONSTRAINT") ? 409 : 500).json({ error: e?.code?.startsWith("SQLITE_CONSTRAINT") ? "An account with this mobile number already exists. Please sign in." : "Could not create resident account." });
  }
});
app.post("/api/resident/portal/login", (req, res) => {
  const identifier = String(req.body?.identifier || req.body?.email || "").trim().toLowerCase(), password = String(req.body?.password || ""), digits = (v) => String(v || "").replace(/\D/g, "");
  if (!identifier || !password) return res.status(400).json({ error: "Enter the resident email or mobile number and password." });
  const emailLogin = identifier.includes("@"), phoneKey = digits(identifier);
  if (!emailLogin && phoneKey && residentSuspended(phoneKey)) return res.status(403).json({ error: "This resident account is suspended. Contact support." });
  const candidates = db.prepare("SELECT id,name,email,phone,organization_id as organizationId,portal_password_hash as passwordHash FROM residents WHERE lower(email)=? OR phone<>'' ORDER BY created_at DESC LIMIT 5000").all(emailLogin ? identifier : "");
  const matches = candidates.filter((x) => {
    const phone = digits(x.phone), identity = emailLogin ? String(x.email || "").toLowerCase() === identifier : phoneKey && (phone === phoneKey || phone.length >= 10 && phoneKey.length >= 10 && phone.slice(-10) === phoneKey.slice(-10));
    if (!identity) return false;
    if (x.passwordHash) return bcrypt2.compareSync(password, x.passwordHash);
    const entered = digits(password);
    return Boolean(phone && entered && (phone === entered || phone.length >= 10 && entered.length >= 10 && phone.slice(-10) === entered.slice(-10)));
  });
  if (matches.length === 1) {
    const resident = matches[0];
    if (!resident.passwordHash) db.prepare("UPDATE residents SET portal_password_hash=? WHERE id=? AND portal_password_hash=''").run(hash(password), resident.id);
    const token2 = createResidentAccessToken(String(resident.id), digits(resident.phone));
    return res.json({ accessToken: token2, resident: { id: resident.id, name: resident.name, email: resident.email }, accountType: "resident" });
  }
  if (emailLogin || !phoneKey) return res.status(401).json({ error: "Resident email/phone or password is incorrect." });
  const registered = db.prepare("SELECT name,email,password_hash as passwordHash FROM resident_portal_signups WHERE phone_key=?").get(phoneKey);
  if (registered) {
    if (!bcrypt2.compareSync(password, registered.passwordHash)) return res.status(401).json({ error: "Resident phone or password is incorrect." });
    const token = createResidentAccessToken("", phoneKey);
    return res.json({ accessToken: token, resident: { id: "", name: registered.name, email: registered.email }, accountType: "enquiry" });
  }
  const enquiries = db.prepare("SELECT name,phone FROM resident_stay_requirements ORDER BY created_at DESC").all().filter((x) => digits(x.phone) === phoneKey);
  if (!enquiries.length) return res.status(401).json({ error: "No stay enquiry is registered with this phone number. Submit an enquiry first, then sign in using the phone number as username and initial password." });
  let account = db.prepare("SELECT password_hash as passwordHash FROM resident_enquiry_accounts WHERE phone_key=?").get(phoneKey);
  if (!account) {
    if (digits(password) !== phoneKey) return res.status(401).json({ error: "For your first enquiry sign-in, use your phone number as the initial password." });
    const now = nowIso2();
    db.prepare("INSERT OR IGNORE INTO resident_enquiry_accounts (phone_key,password_hash,created_at,updated_at) VALUES (?,?,?,?)").run(phoneKey, hash(password), now, now);
    account = db.prepare("SELECT password_hash as passwordHash FROM resident_enquiry_accounts WHERE phone_key=?").get(phoneKey);
  }
  if (!bcrypt2.compareSync(password, String(account.passwordHash || "")) && !(phoneKey === digits(password) && bcrypt2.compareSync(phoneKey, String(account.passwordHash || "")))) return res.status(401).json({ error: "Phone number or password is incorrect." });
  const token = createResidentAccessToken("", phoneKey);
  return res.json({ accessToken: token, resident: { id: "", name: String(enquiries[0].name || "Resident"), email: "" }, accountType: "enquiry" });
});
app.get("/api/resident/portal/session", (req, res) => {
  const auth2 = residentPortalIdentity(req), id = auth2.residentId, resident = id ? db.prepare("SELECT id,name,email FROM residents WHERE id=?").get(id) : null;
  if (resident) return res.json({ resident, accountType: "resident" });
  const phoneKey = auth2.phoneKey;
  if (!phoneKey) return res.json({ resident: null, accountType: null });
  if (residentSuspended(phoneKey)) return res.json({ resident: null, accountType: null });
  const registered = db.prepare("SELECT name,email FROM resident_portal_signups WHERE phone_key=?").get(phoneKey);
  if (registered) return res.json({ resident: { id: "", name: registered.name, email: registered.email }, accountType: "enquiry" });
  const enquiry = db.prepare("SELECT name FROM resident_stay_requirements ORDER BY created_at DESC").all().find((r) => String(r.phone || "").replace(/\D/g, "") === phoneKey);
  if (!enquiry) return res.json({ resident: null, accountType: null });
  res.json({ resident: { id: "", name: enquiry.name, email: "" }, accountType: "enquiry" });
});
app.post("/api/resident/portal/logout", (req, res) => {
  const header = String(req.get("authorization") || ""), match = header.match(/^Bearer\s+(.+)$/i), token = match?.[1] || String(req.get("x-resident-token") || "");
  if (token) db.prepare("DELETE FROM resident_portal_tokens WHERE token_hash=?").run(residentTokenHash(token));
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});
app.post("/api/resident/portal/password", (req, res) => {
  const auth2 = residentPortalIdentity(req), id = auth2.residentId, current = String(req.body?.currentPassword || ""), next = String(req.body?.newPassword || ""), confirm = String(req.body?.confirmPassword || "");
  if (next.length < 8) return res.status(400).json({ error: "Use a new password with at least 8 characters." });
  if (next !== confirm) return res.status(400).json({ error: "The new password and confirmation do not match." });
  if (id) {
    const resident = db.prepare("SELECT phone,portal_password_hash as passwordHash FROM residents WHERE id=?").get(id);
    if (!resident) return res.status(404).json({ error: "Resident account not found." });
    const digits = (v) => String(v || "").replace(/\D/g, ""), phone = digits(resident.phone), entered = digits(current), isDefault = Boolean(phone && entered && (phone === entered || phone.length >= 10 && entered.length >= 10 && phone.slice(-10) === entered.slice(-10)));
    if (resident.passwordHash ? !bcrypt2.compareSync(current, resident.passwordHash) : !isDefault) return res.status(400).json({ error: "Current password is incorrect." });
    db.prepare("UPDATE residents SET portal_password_hash=? WHERE id=?").run(hash(next), id);
    return res.json({ ok: true });
  }
  const phoneKey = auth2.phoneKey;
  if (!phoneKey) return res.status(401).json({ error: "Resident sign-in is required." });
  const registered = db.prepare("SELECT password_hash as passwordHash FROM resident_portal_signups WHERE phone_key=?").get(phoneKey);
  if (registered) {
    if (!bcrypt2.compareSync(current, String(registered.passwordHash || ""))) return res.status(400).json({ error: "Current password is incorrect." });
    db.prepare("UPDATE resident_portal_signups SET password_hash=?,updated_at=? WHERE phone_key=?").run(hash(next), nowIso2(), phoneKey);
    return res.json({ ok: true });
  }
  const account = db.prepare("SELECT password_hash as passwordHash FROM resident_enquiry_accounts WHERE phone_key=?").get(phoneKey);
  if (!account || !bcrypt2.compareSync(current, String(account.passwordHash || ""))) return res.status(400).json({ error: "Current password is incorrect." });
  db.prepare("UPDATE resident_enquiry_accounts SET password_hash=?,updated_at=? WHERE phone_key=?").run(hash(next), nowIso2(), phoneKey);
  res.json({ ok: true });
});
var currentPortalRentInvoice = (resident, payments) => {
  if (resident.stayType !== "Monthly" || resident.occupancyStatus === "Exited") return null;
  const today = /* @__PURE__ */ new Date(), period = String(today.getFullYear()) + "-" + String(today.getMonth() + 1).padStart(2, "0"), start = dateOnly(resident.moveIn || resident.joined), end = dateOnly(resident.exitDate || resident.checkOutDate);
  if (!start) return null;
  const startPeriod = String(start.getFullYear()) + "-" + String(start.getMonth() + 1).padStart(2, "0"), endPeriod = end ? String(end.getFullYear()) + "-" + String(end.getMonth() + 1).padStart(2, "0") : "";
  if (period < startPeriod || endPeriod && period >= endPeriod || start > today) return null;
  if (resident.paidThroughPeriod && period <= resident.paidThroughPeriod) return null;
  if (start.getDate() >= 28 && today.getFullYear() === start.getFullYear() && today.getMonth() === start.getMonth() + 1) return null;
  const rentRows = payments.filter((p) => /rent/i.test(String(p.purpose || "")) && !/day pass|electric|security|deposit|other|food/i.test(String(p.purpose || "")) && String(p.billingPeriod || "") === period);
  if (rentRows.some((p) => ["Pending", "Partial", "Overdue"].includes(String(p.status)))) return null;
  const paid = rentRows.filter((p) => p.status === "Paid").reduce((n, p) => n + Number(p.amount || 0), 0), amount = Math.max(0, Number(resident.rent || 0) - paid);
  if (amount < 1) return null;
  const dueDate = new Date(today.getFullYear(), today.getMonth(), Math.min(start.getDate(), new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()), 12), todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12), periodDate = new Date(today.getFullYear(), today.getMonth(), 1);
  return { id: "virtual-rent:" + period, type: "Monthly rent", date: dueDate.toISOString().slice(0, 10), amount, status: dueDate < todayStart ? "Overdue" : "Pending", reference: "", detail: periodDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" }), dueAmount: amount };
};
app.get("/api/resident/portal/dashboard", (req, res) => {
  const auth2 = residentPortalIdentity(req), id = auth2.residentId;
  if (residentSuspended(auth2.phoneKey)) return res.status(403).json({ error: "This resident account is suspended. Contact support." });
  const resident = id ? db.prepare("SELECT id,organization_id as organizationId,name,email,phone,property,room,rent,address,company_name as companyName,security_deposit as securityDeposit,stay_type as stayType,move_in_date as moveIn,check_out_date as checkOutDate,occupancy_status as occupancyStatus,exit_date as exitDate,status,due,rent_paid_through_period as paidThroughPeriod,joined FROM residents WHERE id=?").get(id) : null;
  if (!resident) {
    const phoneKey = auth2.phoneKey;
    if (!phoneKey) return res.status(401).json({ error: "Resident sign-in is required." });
    const stayRequirements2 = db.prepare("SELECT * FROM resident_stay_requirements ORDER BY created_at DESC LIMIT 1000").all().filter((r) => String(r.phone || "").replace(/\D/g, "") === phoneKey).slice(0, 100);
    if (!stayRequirements2.length) {
      const registered = db.prepare("SELECT name,email FROM resident_portal_signups WHERE phone_key=?").get(phoneKey);
      if (!registered) return res.status(404).json({ error: "No enquiries were found for this resident account." });
      return res.json({ resident: { id: "", name: registered.name, email: registered.email, phone: phoneKey, property: "No confirmed stay", room: "", rent: 0, securityDeposit: 0, stayType: "—", moveIn: "", checkOutDate: "", occupancyStatus: "No confirmed stay", exitDate: "", status: "", due: "" }, payments: [], electricityBills: [], foodBills: [], messages: [], bookings: [], invoices: [], invoiceSettings: null, stayRequirements: [], stayOffers: [], accountType: "enquiry" });
    }
    const stayOffers2 = stayRequirements2.flatMap((r) => db.prepare("SELECT q.*,l.photos_json as currentPhotos FROM resident_stay_quotes q LEFT JOIN public_property_listings l ON l.property_id=q.property_id WHERE q.requirement_id=? ORDER BY q.created_at DESC").all(r.id).map((q) => ({ ...q, requirementId: r.id, requirementArea: r.area, photos: safeJsonArray(q.currentPhotos || "[]") })));
    return res.json({ resident: { id: "", name: stayRequirements2[0].name, email: "", phone: phoneKey, property: "Enquiry account", room: "", rent: 0, securityDeposit: 0, stayType: "Enquiry", moveIn: "", checkOutDate: "", occupancyStatus: "No confirmed stay", exitDate: "", status: "", due: "" }, payments: [], electricityBills: [], foodBills: [], messages: [], bookings: [], invoices: [], invoiceSettings: null, stayRequirements: stayRequirements2, stayOffers: stayOffers2, accountType: "enquiry" });
  }
  const payments = db.prepare("SELECT id,stay_id as stayId,amount,date,method,purpose,status,invoice_no as invoiceNo,billing_period as billingPeriod FROM payments WHERE organization_id=? AND resident_id=? ORDER BY date DESC,created_at DESC").all(resident.organizationId, id), electricityBills = db.prepare("SELECT b.id,b.amount,b.paid_amount as paidAmount,b.waived_amount as waivedAmount,b.status,c.period_year as year,c.period_month as month,c.rate FROM electricity_bills b JOIN electricity_cycles c ON c.id=b.cycle_id WHERE b.organization_id=? AND b.resident_id=? ORDER BY c.period_year DESC,c.period_month DESC").all(resident.organizationId, id), foodBills = db.prepare("SELECT id,items_json as itemsJson,amount,bill_date as billDate,status FROM food_bills WHERE organization_id=? AND resident_id=? ORDER BY bill_date DESC,created_at DESC").all(resident.organizationId, id), messages = db.prepare("SELECT id,body,category,status,channel,created_at as createdAt,sent_at as sentAt FROM messages WHERE organization_id=? AND resident_id=? ORDER BY created_at DESC LIMIT 100").all(resident.organizationId, id), invoiceSettings = db.prepare("SELECT business_name as businessName,payment_upi as paymentUpi,bank_name as bankName,bank_account as bankAccount,bank_ifsc as bankIfsc,payment_qr_url as paymentQrUrl FROM org_settings WHERE organization_id=?").get(resident.organizationId);
  const invoices = payments.map((p) => ({ id: p.id, type: p.purpose || "Payment", date: p.date, amount: Number(p.amount) || 0, status: p.status || "Paid", reference: p.invoiceNo || "", detail: p.billingPeriod || p.method || "", dueAmount: p.status === "Paid" ? 0 : Number(p.amount) || 0 }));
  const liveRentDue = currentPortalRentInvoice(resident, payments);
  if (liveRentDue) invoices.unshift(liveRentDue);
  const phone = String(resident.phone || "").replace(/\D/g, ""), stayRequirements = db.prepare("SELECT * FROM resident_stay_requirements ORDER BY created_at DESC LIMIT 500").all().filter((r) => phone && String(r.phone || "").replace(/\D/g, "") === phone || resident.email && String(r.email || "").toLowerCase() === String(resident.email).toLowerCase()).slice(0, 100), stayOffers = stayRequirements.flatMap((r) => db.prepare("SELECT q.*,l.photos_json as currentPhotos FROM resident_stay_quotes q LEFT JOIN public_property_listings l ON l.property_id=q.property_id WHERE q.requirement_id=? ORDER BY q.created_at DESC").all(r.id).map((q) => ({ ...q, requirementId: r.id, requirementArea: r.area, photos: safeJsonArray(q.currentPhotos || "[]") })));
  res.json({ resident, payments, electricityBills, foodBills, messages, bookings: [], invoices, invoiceSettings, stayRequirements, stayOffers, accountType: "resident" });
});
app.get("/api/auth/session", (req, res) => {
  const user = userFor(req);
  res.json({ user: user ? { id: user.id, name: user.name, email: user.email } : null });
});
app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const defaultOwnerLogin = desktopApp && email === defaultEmail;
  const user = defaultOwnerLogin ? db.prepare("SELECT u.* FROM organizations o JOIN users u ON u.id=o.owner_user_id WHERE o.id=?").get(desktopWorkspaceOrgId) : db.prepare("SELECT * FROM users WHERE email=?").get(email);
  const ownerStatus = user ? db.prepare("SELECT status FROM organizations WHERE id=?").get(user.organization_id)?.status : "";
  if (!desktopApp && ownerStatus === "Suspended") return res.status(403).json({ error: "This owner account is suspended. Contact platform support." });
  if (!user || !bcrypt2.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: desktopApp ? "This Windows app uses a local account. Select Fill local sign-in details; website login credentials do not work here." : "Email or password is incorrect." });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "Could not start your session." });
    req.session.userId = user.id;
    req.session.save((saveError) => saveError ? res.status(500).json({ error: "Could not save your sign-in session." }) : res.json({ user: { id: user.id, name: user.name, email: user.email } }));
  });
});
app.post("/api/auth/signup", (req, res) => {
  if (desktopApp) return res.status(404).json({ error: "Route not found." });
  const name = val(req.body?.name, 100), pgName = val(req.body?.pgName, 180), email = val(req.body?.email, 180).toLowerCase(), password = String(req.body?.password || "");
  if (name.length < 2 || pgName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10) return res.status(400).json({ error: "Enter your name, PG/business name, valid email and a password with at least 10 characters." });
  const organizationId = `org-${uid2()}`, userId = uid2(), now = nowIso2(), start = new Date().toISOString().slice(0, 10), end = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), trialId = uid2(), subscriptionId = uid2();
  try {
    db.transaction(() => {
      db.prepare("INSERT INTO users (id,name,email,password_hash,organization_id,role) VALUES (?,?,?,?,?,'owner')").run(userId, name, email, hash(password), organizationId);
      db.prepare("INSERT INTO organizations (id,name,owner_user_id,plan,status,trial_ends_at,created_at,notes) VALUES (?,?,?,'Trial','Trial',?,?,?)").run(organizationId, pgName, userId, end, now, "Self-registered from website");
      db.prepare("INSERT INTO org_settings (organization_id,business_name) VALUES (?,?)").run(organizationId, pgName);
      db.prepare("INSERT INTO commercial_trials (trial_id,customer_id,business_id,trial_start_date,trial_end_date,trial_status,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)").run(trialId, userId, organizationId, start, end, now, now);
      db.prepare("INSERT INTO commercial_subscriptions (subscription_id,customer_id,business_id,plan_code,plan_name_snapshot,billing_cycle,subscription_status,start_date,end_date,trial_start_date,trial_end_date,payment_status,pricing_snapshot_json,created_at,updated_at) VALUES (?,?,?,'PRO','PRO','CUSTOM','TRIAL',?,?,?,?,'Not required','{}',?,?)").run(subscriptionId, userId, organizationId, start, end, start, end, now, now);
    })();
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Account created, but the session could not start. Please sign in." });
      req.session.userId = userId;
      req.session.save((saveError) => saveError ? res.status(500).json({ error: "Account was created, but the sign-in session could not be saved. Please sign in." }) : res.status(201).json({ user: { id: userId, name, email }, trialEndsAt: end }));
    });
  } catch (e) {
    res.status(e?.code?.startsWith("SQLITE_CONSTRAINT") ? 409 : 500).json({ error: e?.code?.startsWith("SQLITE_CONSTRAINT") ? "This email already has an account. Please sign in." : "Could not create owner account." });
  }
});
app.get("/api/platform/session", (req, res) => {
  const admin = platformUserFor(req);
  res.json({ admin: admin || null });
});
app.post("/api/platform/login", (req, res) => {
  const email = String(req.body?.identifier || req.body?.email || "").trim().toLowerCase(), password = String(req.body?.password || "");
  const admin = db.prepare("SELECT * FROM platform_admins WHERE lower(email)=?").get(email);
  if (!admin || !bcrypt2.compareSync(password, admin.password_hash)) return res.status(401).json({ error: "Platform admin email or password is incorrect." });
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "Could not start platform session." });
    req.session.platformAdminId = admin.id;
    req.session.save((saveError) => saveError ? res.status(500).json({ error: "Could not save platform session." }) : res.json({ admin: { id: admin.id, name: admin.name, email: admin.email } }));
  });
});
app.post("/api/platform/logout", (req, res) => {
  req.session.platformAdminId = void 0;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: "Could not end platform session." });
    res.json({ ok: true });
  });
});
app.post("/api/auth/logout", (req, res) => req.session.destroy(() => {
  res.clearCookie("connect.sid");
  res.json({ ok: true });
}));
app.post("/api/auth/password", auth, (req, res) => {
  const current = String(req.body?.currentPassword || "");
  const next = String(req.body?.newPassword || "");
  if (next.length < 10) return res.status(400).json({ error: "Use at least 10 characters for your new password." });
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if (!bcrypt2.compareSync(current, user.password_hash)) return res.status(400).json({ error: "Current password is incorrect." });
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hash(next), user.id);
  res.json({ ok: true });
});
app.get("/api/bootstrap", auth, (req, res) => {
  ensurePaymentColumns();
  const u = userFor(req);
  const org = u.organizationId;
  const foodSeed = [["Veg Thali", "Meals", 120], ["Non Veg Thali", "Meals", 180], ["Poha", "Breakfast", 40], ["Samosa", "Snacks", 20], ["Tea", "Beverages", 15]];
  if (!db.prepare("SELECT 1 FROM food_items WHERE organization_id=? LIMIT 1").get(org)) {
    const seedFood = db.prepare("INSERT OR IGNORE INTO food_items (id,organization_id,name,category,price,active,is_system,created_at,updated_at) VALUES (?,?,?,?,?,1,1,?,?)");
    for (const [name, category, price] of foodSeed) seedFood.run(uid2(), org, name, category, price, nowIso2(), nowIso2());
  }
  const properties = db.prepare("SELECT id,name,address,type,beds,rooms_count as roomsCount,floor_name as floorName FROM properties WHERE organization_id=? ORDER BY name").all(org);
  const residents = db.prepare("SELECT id,name,phone,email,property_id as propertyId,property,room,rent,due,status,joined,color,security_deposit as securityDeposit,move_in_date as moveIn,stay_type as stayType,professional,check_out_date as checkOutDate,per_day_rent as perDayRent,address,company_name as companyName,document_type as documentType,document_number as documentNumber,document_file_name as documentFileName,kyc_verified as kycVerified,occupancy_status as occupancyStatus,exit_date as exitDate,rent_paid_through_period as paidThroughPeriod FROM residents WHERE organization_id=? ORDER BY created_at DESC").all(org);
  const stayRows = db.prepare("SELECT id,resident_id as residentId,property_id as propertyId,property,room,rent,due,status,move_in_date as moveIn,check_out_date as checkOutDate,per_day_rent as perDayRent,occupancy_status as occupancyStatus,exit_date as exitDate,created_at as createdAt FROM resident_stays WHERE organization_id=? ORDER BY move_in_date,created_at,id").all(org);
  const staysByResident = /* @__PURE__ */ new Map();
  for (const stay of stayRows) {
    stay.stayType = "Day Pass";
    stay.checkInDate = stay.moveIn;
    const list = staysByResident.get(stay.residentId) || [];
    list.push(stay);
    staysByResident.set(stay.residentId, list);
  }
  for (const resident of residents) resident.bookings = staysByResident.get(resident.id) || [];
  const historyRows = db.prepare("SELECT id,resident_id as residentId,previous_property as previousProperty,previous_room as previousRoom,previous_floor as previousFloor,current_property as currentProperty,current_room as currentRoom,current_floor as currentFloor,switched_at as switchedAt FROM resident_room_history WHERE organization_id=? ORDER BY switched_at DESC").all(org);
  const historyByResident = /* @__PURE__ */ new Map();
  for (const h of historyRows) {
    const items = historyByResident.get(h.residentId) || [];
    items.push(h);
    historyByResident.set(h.residentId, items);
  }
  for (const resident of residents) resident.roomHistory = historyByResident.get(resident.id) || [];
  const payments = db.prepare("SELECT id,resident_id as residentId,stay_id as stayId,resident,property,amount,date,method,purpose,status,invoice_no as invoiceNo,billing_period as billingPeriod FROM payments WHERE organization_id=? ORDER BY created_at DESC").all(org);
  const expenses = db.prepare("SELECT id,property,description,category,amount,vendor,date,notes FROM expenses WHERE organization_id=? ORDER BY created_at DESC LIMIT 100").all(org);
  const foodItems = db.prepare("SELECT id,name,category,price,active,is_system as isSystem FROM food_items WHERE organization_id=? ORDER BY is_system DESC,category,name").all(org);
  const foodBills = db.prepare("SELECT id,resident_id as residentId,resident_name as residentName,property,room,items_json as itemsJson,amount,bill_date as billDate,status FROM food_bills WHERE organization_id=? ORDER BY bill_date DESC,created_at DESC").all(org);
  const enquiries = db.prepare("SELECT id,name,phone,property,room,budget,move_in as moveIn,source,stage,assigned_room as assignedRoom FROM enquiries WHERE organization_id=? ORDER BY created_at DESC").all(org);
  const maintenance = db.prepare("SELECT id,property,room,title,description,category,priority,status,assigned_to as assignedTo,created_at as createdAt,updated_at as updatedAt FROM maintenance_requests WHERE organization_id=? ORDER BY created_at DESC").all(org);
  const assets = db.prepare("SELECT id,property,name,category,quantity,unit_value as unitValue,purchase_date as purchaseDate,condition,notes,created_at as createdAt,updated_at as updatedAt FROM assets WHERE organization_id=? ORDER BY created_at DESC").all(org);
  const residentItemIssues = db.prepare("SELECT id,resident_id as residentId,resident_name as residentName,property,room,bed,issue_date as issueDate,items_json as itemsJson,utensils_description as utensilsDescription,condition,created_at as createdAt FROM resident_item_issues WHERE organization_id=? ORDER BY issue_date DESC,created_at DESC").all(org).map((x) => ({ ...x, items: JSON.parse(x.itemsJson || "{}") }));
  const messages = db.prepare("SELECT id,resident_id as residentId,resident,property,phone,body,status,created_at as createdAt,category,template_id as templateId,channel,scheduled_at as scheduledAt,sent_at as sentAt,failure_reason as failureReason,created_by as createdBy,(SELECT room FROM residents r WHERE r.id=messages.resident_id AND r.organization_id=messages.organization_id) as room FROM messages WHERE organization_id=? ORDER BY created_at DESC").all(org);
  const activityEvents = db.prepare('SELECT title,detail,kind,created_at as createdAt FROM activities WHERE organization_id=? ORDER BY created_at DESC LIMIT 100').all(org);
  const auditEvents = db.prepare('SELECT a.action,a.entity,a.entity_id as entityId,a.created_at as createdAt,u.name as actor FROM audit_log a LEFT JOIN users u ON u.id=a.user_id AND u.organization_id=a.organization_id WHERE a.organization_id=? ORDER BY a.created_at DESC LIMIT 100').all(org).map((a) => ({title:a.action.replace(/[._]/g,' '),detail:a.entity+' · '+a.entityId+(a.actor?' · '+a.actor:''),kind:a.entity,createdAt:a.createdAt}));
  const activities = [...activityEvents,...auditEvents].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100);
  const roomRows = db.prepare(`SELECT r.id,r.property_id as propertyId,p.name as property,r.number,r.type,r.floor_name as floorName,b.id as bedId,b.label as bedLabel FROM rooms r JOIN properties p ON p.id=r.property_id LEFT JOIN beds b ON b.room_id=r.id AND b.organization_id=r.organization_id WHERE r.organization_id=? ORDER BY p.name,r.number,b.label`).all(org);
  const roomMap = /* @__PURE__ */ new Map();
  for (const rr of roomRows) {
    let room = roomMap.get(rr.id);
    if (!room) {
      room = { id: rr.id, propertyId: rr.propertyId, property: rr.property, number: rr.number, type: rr.type, floorName: rr.floorName, beds: [] };
      roomMap.set(rr.id, room);
    }
    if (rr.bedId) room.beds.push({ id: rr.bedId, label: rr.bedLabel });
  }
  const rooms = [...roomMap.values()];
  const meterReadings = db.prepare(`SELECT m.id,m.property_id as propertyId,p.name as property,m.meter_type as meterType,m.period_year as year,m.period_month as month,m.floor_name as floorName,m.room_id as roomId,m.room_number as roomNumber,m.common_reading as commonReading,m.reading,m.reading_date as readingDate,m.reading_mode as readingMode,m.previous_reading as previousReading,m.previous_common_reading as previousCommonReading,m.created_at as createdAt FROM meter_readings m JOIN properties p ON p.id=m.property_id WHERE m.organization_id=? ORDER BY m.period_year DESC,m.period_month DESC,p.name,m.floor_name,m.room_number`).all(org);
  const electricityCycles = db.prepare("SELECT c.id,c.property_id as propertyId,p.name as property,c.period_year as year,c.period_month as month,c.rate,c.status,c.finalized_at as finalizedAt FROM electricity_cycles c JOIN properties p ON p.id=c.property_id WHERE c.organization_id=? ORDER BY c.period_year DESC,c.period_month DESC,p.name").all(org);
  const electricityBills = db.prepare("SELECT id,cycle_id as cycleId,resident_id as residentId,resident_name as residentName,room,stay_days as stayDays,room_units as roomUnits,common_units as commonUnits,total_units as totalUnits,rate,amount,paid_amount as paidAmount,waived_amount as waivedAmount,status,audit_json as auditJson FROM electricity_bills WHERE organization_id=? ORDER BY created_at DESC").all(org);
  const electricityPayments = db.prepare("SELECT id,cycle_id as cycleId,bill_id as billId,resident_id as residentId,amount,paid_date as paidDate,method,created_at as createdAt FROM electricity_payments WHERE organization_id=? ORDER BY paid_date DESC").all(org);
  const settings = u.role === "owner" ? db.prepare("SELECT owner_phone as ownerPhone,business_name as businessName,business_address as businessAddress,payment_upi as paymentUpi,bank_name as bankName,bank_account as bankAccount,bank_ifsc as bankIfsc,payment_qr_url as paymentQrUrl FROM org_settings WHERE organization_id=?").get(org) : null;
  res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role }, settings, properties, rooms, residents, payments, expenses, enquiries, maintenance, assets, residentItemIssues, foodItems, foodBills, messages, activities, meterReadings, electricityCycles, electricityBills, electricityPayments });
});
app.get("/api/invoice/payment-details", auth, (req, res) => {
  const u = userFor(req);
  const details = db.prepare("SELECT payment_upi as paymentUpi,bank_name as bankName,bank_account as bankAccount,bank_ifsc as bankIfsc,payment_qr_url as paymentQrUrl FROM org_settings WHERE organization_id=?").get(u.organizationId);
  res.json(details || { paymentUpi: "", bankName: "", bankAccount: "", bankIfsc: "", paymentQrUrl: "" });
});
app.put("/api/admin/profile", ownerAuth, (req, res) => {
  const b = req.body || {}, name = val(b.name, 100), email = val(b.email, 180).toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid owner name and email address." });
  const u = userFor(req);
  try {
    db.prepare("UPDATE users SET name=?,email=? WHERE id=?").run(name, email, u.id);
    db.prepare(`UPDATE org_settings SET owner_phone=?,business_name=?,business_address=?,payment_upi=?,bank_name=?,bank_account=?,bank_ifsc=?,payment_qr_url=? WHERE organization_id=?`).run(val(b.ownerPhone, 60), val(b.businessName, 180), val(b.businessAddress, 300), val(b.paymentUpi, 120), val(b.bankName, 150), val(b.bankAccount, 100), val(b.bankIfsc, 30), /^https:\/\//i.test(val(b.paymentQrUrl, 15e5)) || /^data:image\/(png|jpeg|webp);base64,/i.test(val(b.paymentQrUrl, 15e5)) ? val(b.paymentQrUrl, 15e5) : "", u.organizationId);
    audit(u.organizationId, u.id, "admin.profile.updated", "organization", u.organizationId);
    res.json({ user: { id: u.id, name, email } });
  } catch (e) {
    res.status(e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? 409 : 500).json({ error: e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? "That email address is already in use." : "Could not save owner details." });
  }
});
app.get("/api/admin/users", ownerAuth, (req, res) => {
  const u = userFor(req);
  const rows = db.prepare("SELECT id,name,email,role,organization_id as organizationId FROM users WHERE organization_id=? ORDER BY name").all(u.organizationId);
  res.json({ users: rows.map((x) => ({ ...x, role: x.role === "owner" ? "Owner" : x.role === "staff" ? "Staff" : "Manager" })) });
});
app.post("/api/admin/users", ownerAuth, (req, res) => {
  const b = req.body || {}, name = val(b.name, 100), email = val(b.email, 180).toLowerCase(), password = String(b.password || ""), role = val(b.role, 20) === "Staff" ? "staff" : "manager";
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10) return res.status(400).json({ error: "Enter a name, valid email, and temporary password of at least 10 characters." });
  const u = userFor(req), limit = planLimitFailure(u.organizationId, "users", 1);
  if (limit) return res.status(403).json(limit);
  try {
    const id = uid2();
    db.prepare("INSERT INTO users (id,name,email,password_hash,organization_id,role) VALUES (?, ?, ?, ?, ?, ?)").run(id, name, email, hash(password), u.organizationId, role);
    audit(u.organizationId, u.id, "admin.user.created", "user", id);
    res.status(201).json({ user: { id, name, email, role: role === "staff" ? "Staff" : "Manager" } });
  } catch (e) {
    res.status(e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? 409 : 500).json({ error: e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? "That email address is already registered." : "Could not create account." });
  }
});
app.patch("/api/admin/users/:id/password", ownerAuth, (req, res) => {
  const password = String(req.body?.password || ""), u = userFor(req);
  if (password.length < 10) return res.status(400).json({ error: "Use at least 10 characters for the temporary password." });
  if (req.params.id === u.id) return res.status(400).json({ error: "Use Change password in your own account settings." });
  const result = db.prepare("UPDATE users SET password_hash=? WHERE id=? AND organization_id=? AND role IN ('manager','staff')").run(hash(password), req.params.id, u.organizationId);
  if (!result.changes) return res.status(404).json({ error: "Team member account not found in this workspace." });
  audit(u.organizationId, u.id, "admin.user.password_reset", "user", req.params.id);
  res.json({ ok: true });
});
var audit = (org, user, action, entity, id) => db.prepare("INSERT INTO audit_log VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid2(), org, user, action, entity, id, nowIso2());
var val = (x, max = 180) => String(x ?? "").trim().slice(0, max);
var required = (body, fields) => fields.every((k) => val(body?.[k], 500).length > 0);
var validateResidentRoom = (organizationId, propertyId, assignment, excludeId = "") => {
  const match = assignment.match(/^Room\s+(.+?)(?:\s+·\s+Bed\s+(.+))?$/);
  if (!match) return { status: 400, message: "Choose a saved bed or room; resident assignment is required." };
  const [, number, bedLabel] = match, room = db.prepare("SELECT id FROM rooms WHERE organization_id=? AND property_id=? AND number=?").get(organizationId, propertyId, number);
  if (!room) return { status: 400, message: "Choose a room in the selected property." };
  const bedCount = db.prepare("SELECT COUNT(*) as count FROM beds WHERE organization_id=? AND room_id=?").get(organizationId, room.id).count;
  if (bedLabel && !db.prepare("SELECT id FROM beds WHERE organization_id=? AND room_id=? AND label=?").get(organizationId, room.id, bedLabel)) return { status: 400, message: "Choose a bed configured in this room." };
  if (!bedLabel && bedCount < 1) return { status: 400, message: "This room has no beds configured yet." };
  const occupied = db.prepare("SELECT room FROM residents WHERE organization_id=? AND property_id=? AND occupancy_status='Active' AND id<>? AND (stay_type<>'Day Pass' OR check_out_date='' OR check_out_date>=date('now'))").all(organizationId, propertyId, excludeId);
  const confirmed = db.prepare("SELECT e.assigned_room as room FROM enquiries e JOIN properties p ON p.organization_id=e.organization_id AND p.name=e.property WHERE e.organization_id=? AND p.id=? AND e.stage IN ('Booking confirmed','Checked in') AND e.assigned_room<>''").all(organizationId, propertyId);
  for (const record of [...occupied, ...confirmed]) {
    const other = String(record.room || "").match(/^Room\s+(.+?)(?:\s+·\s+Bed\s+(.+))?$/);
    if (!other || other[1] !== number) continue;
    if (!bedLabel || !other[2] || other[2] === bedLabel) return { status: 409, message: bedLabel ? "This bed is already occupied." : "Room booked: one or more beds in this room are already occupied." };
  }
  return null;
};
app.delete("/api/platform/booking-leads/:source/:id", platformAuth, (req, res) => {
  const source = val(req.params.source, 20), id = val(req.params.id, 100);
  if (source === "area") {
    const row = db.prepare("SELECT id FROM resident_stay_requirements WHERE id=?").get(id);
    if (!row) return res.status(404).json({ error: "Stay enquiry not found." });
    db.prepare("DELETE FROM resident_stay_requirements WHERE id=?").run(id);
    return res.json({ ok: true });
  }
  if (source === "property") {
    const row = db.prepare("SELECT id,organization_id as organizationId,enquiry_id as enquiryId FROM booking_leads WHERE id=?").get(id);
    if (!row) return res.status(404).json({ error: "Booking enquiry not found." });
    db.transaction(() => {
      if (row.enquiryId) db.prepare("DELETE FROM enquiries WHERE id=? AND organization_id=?").run(row.enquiryId, row.organizationId);
      db.prepare("DELETE FROM booking_leads WHERE id=?").run(id);
    })();
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: "Choose a valid enquiry type." });
});
app.get("/api/platform/booking-leads", platformAuth, (_req, res) => {
  if (desktopApp) return res.status(404).json({ error: "Platform booking inbox is available in the web application." });
  const listingLeads = db.prepare(`SELECT b.id,b.booking_no as reference,b.customer_name as name,b.phone,b.email,b.occupation as profession,b.room_preference as preference,b.move_in as moveIn,b.duration,b.budget,b.notes,p.name as property,p.id as propertyId,p.address as area,o.name as workspace,u.name as ownerName,b.status,b.created_at as createdAt,'Property enquiry' as source FROM booking_leads b JOIN properties p ON p.id=b.property_id JOIN organizations o ON o.id=b.organization_id JOIN users u ON u.id=o.owner_user_id WHERE b.organization_id<>'demo-network-samples' ORDER BY b.created_at DESC LIMIT 1000`).all(), areaRequirements = db.prepare(`SELECT r.id,r.name,r.phone,r.email,r.profession,r.preference,r.move_in as moveIn,r.duration,r.budget,r.notes,r.area,r.status,r.created_at as createdAt,'Area requirement' as source FROM resident_stay_requirements r ORDER BY r.created_at DESC LIMIT 1000`).all();
  res.json({ leads: [...listingLeads, ...areaRequirements].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
});
app.get("/api/platform/business-inquiries", platformAuth, (_req, res) => res.json({ inquiries: db.prepare("SELECT * FROM owner_business_inquiries ORDER BY created_at DESC LIMIT 500").all() }));
app.patch("/api/platform/business-inquiries/:id", platformAuth, (req, res) => {
  const status = val(req.body?.status, 20);
  if (!["NEW", "CONTACTED", "CLOSED"].includes(status)) return res.status(400).json({ error: "Choose a valid enquiry status." });
  const result = db.prepare("UPDATE owner_business_inquiries SET status=?,admin_notes=?,updated_at=? WHERE id=?").run(status, val(req.body?.adminNotes, 1e3), nowIso2(), req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Business enquiry not found." });
  res.json({ ok: true });
});
app.get("/api/platform/overview", platformAuth, (_req, res) => {
  const totals = db.prepare(`SELECT COUNT(*) as owners,SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) as active,SUM(CASE WHEN status='Trial' THEN 1 ELSE 0 END) as trials,SUM(CASE WHEN status='Past due' THEN 1 ELSE 0 END) as pastDue,(SELECT COALESCE(SUM(amount),0) FROM saas_payments WHERE status='Paid' AND organization_id<>'org-nivasbook-demo') as collected,(SELECT COUNT(*) FROM saas_payments WHERE status='Pending' AND organization_id<>'org-nivasbook-demo') as awaiting FROM organizations WHERE id<>'org-nivasbook-demo'`).get();
  totals.collected += Number(db.prepare("SELECT COALESCE(SUM(amount_paise),0)/100.0 as total FROM commercial_payments WHERE payment_status='Paid'").get().total || 0);
  totals.awaiting += Number(db.prepare("SELECT COUNT(*) as total FROM commercial_subscriptions WHERE subscription_status='PENDING'").get().total || 0);
  const recent = db.prepare(`SELECT p.id,p.organization_id as organizationId,o.name as pgName,p.amount,p.status,p.method,p.reference,p.period_start as periodStart,p.period_end as periodEnd,p.paid_at as paidAt,p.created_at as createdAt FROM saas_payments p JOIN organizations o ON o.id=p.organization_id WHERE p.organization_id<>'org-nivasbook-demo' ORDER BY p.created_at DESC LIMIT 8`).all();
  res.json({ totals, recent });
});
app.get("/api/platform/owners", platformAuth, (_req, res) => {
  const owners = db.prepare(`SELECT o.id as organizationId,o.name as pgName,o.plan,o.status,o.trial_ends_at as trialEndsAt,o.next_billing_at as nextBillingAt,o.created_at as createdAt,o.notes,u.id as userId,u.name as ownerName,u.email as ownerEmail,u.role,(SELECT COUNT(*) FROM properties p WHERE p.organization_id=o.id) as properties,(SELECT COUNT(*) FROM residents r WHERE r.organization_id=o.id) as residents,(SELECT COALESCE(SUM(amount),0) FROM saas_payments s WHERE s.organization_id=o.id AND s.status='Paid') as lifetimePaid FROM organizations o JOIN users u ON u.id=o.owner_user_id WHERE o.id<>'org-nivasbook-demo' ORDER BY o.created_at DESC`).all();
  res.json({ owners });
});
app.get("/api/platform/residents", platformAuth, (_req, res) => {
  if (desktopApp) return res.status(404).json({ error: "Route not found." });
  const rows = db.prepare(`SELECT r.name,r.phone,r.email,r.property,r.room,r.stay_type as stayType,r.occupancy_status as occupancyStatus,r.joined,r.organization_id as organizationId,o.name as workspace,u.name as ownerName FROM residents r LEFT JOIN organizations o ON o.id=r.organization_id LEFT JOIN users u ON u.id=o.owner_user_id WHERE r.phone<>'' ORDER BY r.created_at DESC LIMIT 3000`).all();
  const inquiries = db.prepare("SELECT name,phone,email,area,created_at as joined FROM resident_stay_requirements ORDER BY created_at DESC LIMIT 1000").all();
  const signups = db.prepare("SELECT name,phone_key as phone,email,created_at as joined FROM resident_portal_signups ORDER BY created_at DESC LIMIT 1000").all();
  const latest = new Map();
  for (const row of [...rows, ...inquiries, ...signups]) { const phone = String(row.phone || "").replace(/\D/g, ""); if (phone) { const prior = latest.get(phone) || {}; latest.set(phone, { ...prior, ...row, phone }); } }
  const suspended = db.prepare("SELECT phone_key FROM resident_portal_suspensions WHERE suspended=1").all();
  const suspendedSet = new Set(suspended.map((x) => x.phone_key));
  res.json({ residents: [...latest.entries()].map(([phone, row]) => ({ ...row, suspended: suspendedSet.has(phone) })).sort((a, b) => String(b.joined || "").localeCompare(String(a.joined || ""))) });
});
app.patch("/api/platform/residents/:phone/suspension", platformAuth, (req, res) => {
  if (desktopApp) return res.status(404).json({ error: "Route not found." });
  const phone = String(req.params.phone || "").replace(/\D/g, "");
  if (phone.length < 10 || typeof req.body?.suspended !== "boolean") return res.status(400).json({ error: "Choose a valid resident and suspension state." });
  db.prepare("INSERT INTO resident_portal_suspensions (phone_key,suspended,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(phone_key) DO UPDATE SET suspended=excluded.suspended,updated_at=excluded.updated_at,updated_by=excluded.updated_by").run(phone, req.body.suspended ? 1 : 0, nowIso2(), platformUserFor(req).id);
  res.json({ ok: true });
});
app.post("/api/platform/owners", platformAuth, (req, res) => {
  const b = req.body || {}, ownerName = val(b.ownerName, 100), pgName = val(b.pgName, 180), email = val(b.email, 180).toLowerCase(), password = String(b.password || ""), plan = val(b.plan, 30) || "Trial";
  if (!ownerName || !pgName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10) return res.status(400).json({ error: "Enter PG name, owner name, valid login email, and a password of at least 10 characters." });
  if (!["Trial", "Starter", "Growth", "Business"].includes(plan)) return res.status(400).json({ error: "Choose a valid plan." });
  const id = `org-${uid2()}`, userId = uid2(), trialDays = Math.min(90, Math.max(1, Number(b.trialDays) || 14)), trialEnd = new Date(Date.now() + trialDays * 864e5).toISOString().slice(0, 10), status = plan === "Trial" ? "Trial" : "Active";
  try {
    const provision = db.transaction(() => {
      db.prepare("INSERT INTO users (id,name,email,password_hash,organization_id,role) VALUES (?, ?, ?, ?, ?, ?)").run(userId, ownerName, email, hash(password), id, "owner");
      db.prepare("INSERT INTO org_settings (organization_id,business_name) VALUES (?,?)").run(id, pgName);
      db.prepare("INSERT INTO organizations (id,name,owner_user_id,plan,status,trial_ends_at,created_at,notes) VALUES (?,?,?,?,?,?,?,?)").run(id, pgName, userId, plan, status, plan === "Trial" ? trialEnd : "", nowIso2(), val(b.notes, 500));
      if (plan === "Trial") {
        const started = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), trialId = uid2(), subscriptionId = uid2(), createdAt = nowIso2();
        db.prepare("INSERT INTO commercial_trials (trial_id,customer_id,business_id,trial_start_date,trial_end_date,trial_status,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)").run(trialId, userId, id, started, trialEnd, createdAt, createdAt);
        db.prepare("INSERT INTO commercial_subscriptions (subscription_id,customer_id,business_id,plan_code,plan_name_snapshot,billing_cycle,subscription_status,start_date,end_date,trial_start_date,trial_end_date,payment_status,pricing_snapshot_json,created_at,updated_at) VALUES (?,?,?,'PRO','PRO','CUSTOM','TRIAL',?,?,?,?,'Not required','{}',?,?)").run(subscriptionId, userId, id, started, trialEnd, started, trialEnd, createdAt, createdAt);
      }
    });
    provision();
    res.status(201).json({ owner: { organizationId: id, userId, pgName, ownerName, ownerEmail: email, plan, status, trialEndsAt: plan === "Trial" ? trialEnd : "" } });
  } catch (e) {
    res.status(e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? 409 : 500).json({ error: e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? "This login email already belongs to an account." : "Could not register PG owner." });
  }
});
app.patch("/api/platform/owners/:orgId", platformAuth, (req, res) => {
  const b = req.body || {}, id = val(req.params.orgId, 100), status = val(b.status, 30), plan = val(b.plan, 30), pgName = val(b.pgName, 180), ownerName = val(b.ownerName, 100), email = val(b.email, 180).toLowerCase(), nextBilling = val(b.nextBillingAt, 30), notes = val(b.notes, 500);
  if (status && !["Trial", "Active", "Past due", "Suspended", "Cancelled"].includes(status)) return res.status(400).json({ error: "Choose a valid subscription status." });
  if (plan && !["Trial", "Starter", "Growth", "Business"].includes(plan)) return res.status(400).json({ error: "Choose a valid plan." });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid owner login email." });
  const current = db.prepare("SELECT owner_user_id as ownerUserId FROM organizations WHERE id=?").get(id);
  if (!current) return res.status(404).json({ error: "PG owner workspace not found." });
  try {
    const update = db.transaction(() => {
      if (ownerName || email) {
        const user = db.prepare("UPDATE users SET name=COALESCE(NULLIF(?,''),name),email=COALESCE(NULLIF(?,''),email) WHERE id=?").run(ownerName, email, current.ownerUserId);
        void user;
      }
      db.prepare(`UPDATE organizations SET name=COALESCE(NULLIF(?,''),name),plan=COALESCE(NULLIF(?,''),plan),status=COALESCE(NULLIF(?,''),status),next_billing_at=COALESCE(NULLIF(?,''),next_billing_at),notes=COALESCE(NULLIF(?,''),notes) WHERE id=?`).run(pgName, plan, status, nextBilling, notes, id);
      db.prepare("UPDATE org_settings SET business_name=COALESCE(NULLIF(?,''),business_name) WHERE organization_id=?").run(pgName, id);
    });
    update();
    res.json({ ok: true });
  } catch (e) {
    res.status(e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? 409 : 500).json({ error: e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? "That login email already belongs to another account." : "Could not update PG owner." });
  }
});
app.patch("/api/platform/owners/:orgId/password", platformAuth, (req, res) => {
  const password = String(req.body?.password || ""), id = val(req.params.orgId, 100);
  if (password.length < 10) return res.status(400).json({ error: "Set a temporary password of at least 10 characters." });
  const owner = db.prepare("SELECT owner_user_id as ownerUserId FROM organizations WHERE id=?").get(id);
  if (!owner) return res.status(404).json({ error: "PG owner workspace not found." });
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hash(password), owner.ownerUserId);
  res.json({ ok: true });
});
app.get("/api/platform/payments", platformAuth, (_req, res) => {
  const payments = db.prepare(`SELECT p.id,p.organization_id as organizationId,o.name as pgName,u.name as ownerName,u.email as ownerEmail,p.amount,p.currency,p.status,p.method,p.reference,p.period_start as periodStart,p.period_end as periodEnd,p.paid_at as paidAt,p.created_at as createdAt FROM saas_payments p JOIN organizations o ON o.id=p.organization_id JOIN users u ON u.id=o.owner_user_id ORDER BY p.created_at DESC LIMIT 300`).all();
  const owners = db.prepare("SELECT id as organizationId,name as pgName FROM organizations ORDER BY name").all();
  res.json({ payments, owners });
});
app.post("/api/platform/payments", platformAuth, (req, res) => {
  const b = req.body || {}, org = val(b.organizationId, 100), amount = Math.round(Number(b.amount)), status = val(b.status, 20), method = val(b.method, 40) || "Bank transfer";
  if (!org || !db.prepare("SELECT id FROM organizations WHERE id=?").get(org)) return res.status(404).json({ error: "Select a registered PG owner." });
  if (!Number.isFinite(amount) || amount < 1) return res.status(400).json({ error: "Enter a valid payment amount." });
  if (!["Paid", "Pending", "Failed"].includes(status)) return res.status(400).json({ error: "Choose Paid, Pending, or Failed." });
  const id = uid2(), start = val(b.periodStart, 30), end = val(b.periodEnd, 30), paidAt = status === "Paid" ? val(b.paidAt, 30) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) : "";
  db.prepare("INSERT INTO saas_payments (id,organization_id,amount,currency,status,method,reference,period_start,period_end,paid_at,created_at) VALUES (?,?,?,'INR',?,?,?,?,?,?,?)").run(id, org, amount, status, method, val(b.reference, 100), start, end, paidAt, nowIso2());
  if (status === "Paid") db.prepare("UPDATE organizations SET status='Active',trial_ends_at='',next_billing_at=COALESCE(NULLIF(? ,''),next_billing_at) WHERE id=?").run(end, org);
  res.status(201).json({ ok: true, id });
});
app.get("/api/platform/commercial/plans", platformAuth, (_req, res) => {
  const plans = db.prepare("SELECT plan_code as code FROM commercial_plans ORDER BY display_order,plan_code").all().map((x) => commercialPlan(x.code));
  res.json({ plans });
});
app.patch("/api/platform/commercial/plans/:code", platformAuth, (req, res) => {
  const code = normalizePlanCode(val(req.params.code, 40)), previous = commercialPlan(code);
  if (!previous) return res.status(404).json({ error: "Plan not found." });
  const b = req.body || {}, intField = (name, current) => b[name] === void 0 ? current : Number(b[name]), monthly = b.monthlyPricePaise === null ? null : intField("monthlyPricePaise", previous.monthlyPricePaise), annual = b.annualPricePaise === null ? null : intField("annualPricePaise", previous.annualPricePaise), maxProperties = intField("maxProperties", previous.maxProperties), maxBeds = intField("maxBeds", previous.maxBeds), maxUsers = intField("maxUsers", previous.maxUsers), maxDevices = intField("maxDevices", previous.maxDevices), trialDays = intField("trialDays", previous.trialDays);
  if (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 90) return res.status(400).json({ error: "Trial duration must be from 1 to 90 days." });
  for (const [label, value] of [["monthly price", monthly], ["annual price", annual], ["property limit", maxProperties], ["bed limit", maxBeds], ["user limit", maxUsers], ["device limit", maxDevices]]) {
    if (value !== null && (!Number.isSafeInteger(value) || label.endsWith("limit") && value < -1 || !label.endsWith("limit") && value < 0)) return res.status(400).json({ error: `Enter a valid ${label}.` });
  }
  const features = Array.isArray(b.features) ? b.features.filter((x) => typeof x === "string") : null, now = nowIso2(), next = { name: val(b.name, 80) || previous.name, description: val(b.description, 400) || previous.description, monthlyPricePaise: monthly, annualPricePaise: annual, maxProperties, maxBeds, maxUsers, maxDevices, trialDays, featured: b.featured === void 0 ? previous.featured ? 1 : 0 : b.featured ? 1 : 0, isActive: b.isActive === void 0 ? void 0 : b.isActive ? 1 : 0 };
  const update = db.transaction(() => {
    db.prepare("UPDATE commercial_plans SET plan_name=?,description=?,monthly_price_paise=?,annual_price_paise=?,max_properties=?,max_beds=?,max_users=?,max_devices=?,trial_days=?,is_featured=?,is_active=COALESCE(?,is_active),updated_at=? WHERE plan_code=?").run(next.name, next.description, monthly, annual, maxProperties, maxBeds, maxUsers, maxDevices, trialDays, next.featured, next.isActive ?? null, now, code);
    if (features) {
      db.prepare("UPDATE commercial_plan_features SET enabled=0 WHERE plan_code=?").run(code);
      const save = db.prepare("INSERT INTO commercial_plan_features (plan_code,feature_code,enabled) SELECT ?,?,1 WHERE EXISTS(SELECT 1 FROM commercial_features WHERE feature_code=?) ON CONFLICT(plan_code,feature_code) DO UPDATE SET enabled=1");
      for (const feature of features) save.run(code, feature, feature);
    }
  });
  update();
  db.prepare("INSERT INTO commercial_audit_log (audit_id,actor_id,action,entity,entity_id,previous_json,new_json,created_at) VALUES (?,?,?,?,?,?,?,?)").run(uid2(), platformUserFor(req).id, "plan.updated", "plan", code, JSON.stringify(previous), JSON.stringify(next), now);
  res.json({ plan: commercialPlan(code) });
});
app.get("/api/platform/commercial/subscriptions", platformAuth, (_req, res) => {
  const subscriptions = db.prepare(`SELECT s.subscription_id as id,s.business_id as businessId,o.name as pgName,u.name as ownerName,u.email as ownerEmail,s.plan_code as planCode,s.plan_name_snapshot as planName,s.billing_cycle as billingCycle,s.subscription_status as status,s.start_date as startDate,s.end_date as endDate,s.base_amount_paise as baseAmountPaise,s.discount_paise as discountPaise,s.taxable_amount_paise as taxableAmountPaise,s.cgst_paise as cgstPaise,s.sgst_paise as sgstPaise,s.igst_paise as igstPaise,s.total_amount_paise as totalAmountPaise,s.currency,s.payment_status as paymentStatus,s.payment_provider as paymentProvider,s.payment_reference as paymentReference,s.created_at as createdAt FROM commercial_subscriptions s JOIN organizations o ON o.id=s.business_id JOIN users u ON u.id=o.owner_user_id ORDER BY s.created_at DESC LIMIT 500`).all();
  res.json({ subscriptions });
});
app.get("/api/platform/commercial/payments", platformAuth, (_req, res) => {
  const payments = db.prepare(`SELECT p.payment_id as id,p.business_id as organizationId,o.name as pgName,u.name as ownerName,u.email as ownerEmail,ROUND(p.amount_paise/100.0,2) as amount,p.currency,p.payment_status as status,p.method,p.provider_reference as reference,s.start_date as periodStart,s.end_date as periodEnd,p.paid_at as paidAt,p.created_at as createdAt FROM commercial_payments p JOIN organizations o ON o.id=p.business_id JOIN users u ON u.id=o.owner_user_id JOIN commercial_subscriptions s ON s.subscription_id=p.subscription_id ORDER BY p.created_at DESC LIMIT 500`).all();
  res.json({ payments });
});
app.post("/api/platform/commercial/subscriptions/:id/activate", platformAuth, (req, res) => {
  const admin = platformUserFor(req), id = val(req.params.id, 100), subscription = db.prepare("SELECT * FROM commercial_subscriptions WHERE subscription_id=?").get(id);
  if (!subscription) return res.status(404).json({ error: "Subscription request not found." });
  if (subscription.subscription_status === "ACTIVE") return res.json({ ok: true, alreadyActive: true });
  if (req.body?.verifiedManually !== true) return res.status(400).json({ error: "Confirm that the offline payment was received and verified before activation." });
  const amountPaise = Number(req.body?.amountPaise ?? subscription.total_amount_paise);
  if (!Number.isSafeInteger(amountPaise) || amountPaise !== subscription.total_amount_paise) return res.status(400).json({ error: "Verified payment amount must match the saved subscription total." });
  const startDate = val(req.body?.startDate, 10) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), endDate = val(req.body?.endDate, 10) || (() => {
    const d = /* @__PURE__ */ new Date(`${startDate}T12:00:00Z`);
    if (subscription.billing_cycle === "ANNUAL") d.setUTCFullYear(d.getUTCFullYear() + 1);
    else if (subscription.billing_cycle === "MONTHLY") d.setUTCMonth(d.getUTCMonth() + 1);
    else return "";
    return d.toISOString().slice(0, 10);
  })();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) return res.status(400).json({ error: "Enter a valid subscription start and expiry date." });
  const now = nowIso2(), reference = val(req.body?.reference, 120), method = val(req.body?.method, 40) || "Manual", paymentId = uid2(), licenseId = uid2(), secret = crypto2.randomBytes(32).toString("hex"), licensePlan = subscription.plan_code === "PRO" ? "Growth" : subscription.plan_code === "BUSINESS" ? "Business" : subscription.plan_code === "DESKTOP" ? "Desktop" : subscription.plan_code === "ENTERPRISE" ? "Enterprise" : "Starter";
  const activate = db.transaction(() => {
    db.prepare("UPDATE commercial_subscriptions SET subscription_status='ACTIVE',start_date=?,end_date=?,payment_status='Paid',payment_provider='Manual',payment_reference=?,updated_at=? WHERE subscription_id=?").run(startDate, endDate, reference, now, id);
    db.prepare("INSERT OR IGNORE INTO commercial_payments (payment_id,subscription_id,business_id,amount_paise,currency,payment_status,payment_provider,provider_reference,idempotency_key,method,paid_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(paymentId, id, subscription.business_id, amountPaise, subscription.currency, "Paid", "Manual", reference, `manual-activation-${id}`, method, val(req.body?.paidAt, 30) || startDate, now);
    db.prepare("UPDATE organizations SET plan=?,status='Active',trial_ends_at='',next_billing_at=? WHERE id=?").run(subscription.plan_code, endDate, subscription.business_id);
    db.prepare("UPDATE commercial_trials SET trial_status='CONVERTED',converted_to_paid=1,updated_at=? WHERE business_id=? AND trial_status IN ('ACTIVE','EXPIRED')").run(now, subscription.business_id);
    db.prepare("INSERT INTO saas_licenses (id,organization_id,key_hash,key_hint,plan,starts_at,expires_at,status,activated_by,activated_at,created_by,created_at,revoked_at,plan_code,subscription_id) VALUES (?,?,?,?,?,?,?,'Active',?,?,?,?,?,?,?)").run(licenseId, subscription.business_id, hashLicenseKey(secret), "\u2022\u2022\u2022\u2022 " + secret.slice(-4), licensePlan, startDate, endDate, subscription.customer_id, now, admin.id, now, "", subscription.plan_code, id);
    db.prepare("INSERT INTO commercial_audit_log (audit_id,actor_id,action,entity,entity_id,previous_json,new_json,created_at) VALUES (?,?,?,?,?,?,?,?)").run(uid2(), admin.id, "subscription.manually_activated", "subscription", id, JSON.stringify({ status: subscription.subscription_status, paymentStatus: subscription.payment_status }), JSON.stringify({ status: "ACTIVE", paymentStatus: "Paid", startDate, endDate, amountPaise, method, reference }), now);
  });
  activate();
  res.json({ ok: true, subscriptionId: id, status: "ACTIVE", startDate, endDate, amountPaise });
});
app.get("/api/platform/commercial/trials", platformAuth, (_req, res) => {
  const trials = db.prepare(`SELECT t.trial_id as id,t.customer_id as customerId,t.business_id as businessId,t.device_id as deviceId,t.trial_start_date as startDate,t.trial_end_date as endDate,t.trial_status as status,t.converted_to_paid as convertedToPaid,t.created_at as createdAt,o.name as pgName,u.name as ownerName,u.email as ownerEmail FROM commercial_trials t JOIN organizations o ON o.id=t.business_id JOIN users u ON u.id=o.owner_user_id ORDER BY t.created_at DESC LIMIT 500`).all();
  res.json({ trials });
});
app.patch("/api/platform/commercial/trials/:id", platformAuth, (req, res) => {
  const id = val(req.params.id, 100), trial = db.prepare("SELECT * FROM commercial_trials WHERE trial_id=?").get(id);
  if (!trial) return res.status(404).json({ error: "Trial was not found." });
  const action = val(req.body?.action, 20), now = nowIso2();
  if (action === "extend") {
    const days = Math.round(Number(req.body?.days));
    if (!Number.isInteger(days) || days < 1 || days > 90) return res.status(400).json({ error: "Trial extension must be from 1 to 90 days." });
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), baseDate = trial.trial_end_date > today ? trial.trial_end_date : today, base = /* @__PURE__ */ new Date(`${baseDate}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + days);
    const end = base.toISOString().slice(0, 10);
    db.prepare("UPDATE commercial_trials SET trial_status='ACTIVE',trial_end_date=?,updated_at=? WHERE trial_id=?").run(end, now, id);
    db.prepare("UPDATE organizations SET plan='Trial',status='Trial',trial_ends_at=?,next_billing_at='' WHERE id=?").run(end, trial.business_id);
    db.prepare("UPDATE commercial_subscriptions SET subscription_status='TRIAL',end_date=?,trial_end_date=?,updated_at=? WHERE business_id=? AND billing_cycle='CUSTOM' AND subscription_status IN ('TRIAL','EXPIRED')").run(end, end, now, trial.business_id);
    db.prepare("INSERT INTO commercial_audit_log (audit_id,actor_id,action,entity,entity_id,previous_json,new_json,created_at) VALUES (?,?,?,?,?,?,?,?)").run(uid2(), platformUserFor(req).id, "trial.extended", "trial", id, JSON.stringify({ endDate: trial.trial_end_date, status: trial.trial_status }), JSON.stringify({ endDate: end, status: "ACTIVE", daysAdded: days }), now);
    return res.json({ ok: true, endDate: end, status: "ACTIVE" });
  }
  if (action === "cancel") {
    db.prepare("UPDATE commercial_trials SET trial_status='CANCELLED',updated_at=? WHERE trial_id=?").run(now, id);
    db.prepare("UPDATE organizations SET status='Past due' WHERE id=? AND status='Trial'").run(trial.business_id);
    db.prepare("UPDATE commercial_subscriptions SET subscription_status='CANCELLED',updated_at=? WHERE business_id=? AND subscription_status='TRIAL'").run(now, trial.business_id);
    return res.json({ ok: true, status: "CANCELLED" });
  }
  return res.status(400).json({ error: "Choose extend or cancel." });
});
app.get("/api/platform/commercial/devices", platformAuth, (_req, res) => {
  const devices = db.prepare(`SELECT d.activation_id as activationId,d.business_id as businessId,o.name as pgName,u.email as ownerEmail,l.plan_code as planCode,d.device_name as deviceName,d.status,d.activated_at as activatedAt,d.last_validated_at as lastValidatedAt,d.revoked_at as revokedAt FROM license_device_activations d JOIN organizations o ON o.id=d.business_id JOIN saas_licenses l ON l.id=d.license_id JOIN users u ON u.id=o.owner_user_id ORDER BY d.activated_at DESC LIMIT 1000`).all();
  res.json({ devices });
});
app.patch("/api/platform/commercial/devices/:id", platformAuth, (req, res) => {
  const id = val(req.params.id, 100), activation = db.prepare("SELECT activation_id as activationId,status,business_id as businessId FROM license_device_activations WHERE activation_id=?").get(id);
  if (!activation) return res.status(404).json({ error: "Device activation was not found." });
  if (req.body?.action !== "reset") return res.status(400).json({ error: "Choose reset to revoke this device activation." });
  const now = nowIso2();
  db.prepare("UPDATE license_device_activations SET status='Revoked',revoked_at=? WHERE activation_id=?").run(now, id);
  db.prepare("INSERT INTO commercial_audit_log (audit_id,actor_id,action,entity,entity_id,previous_json,new_json,created_at) VALUES (?,?,?,?,?,?,?,?)").run(uid2(), platformUserFor(req).id, "device.reset", "device", id, JSON.stringify({ status: activation.status }), JSON.stringify({ status: "Revoked" }), now);
  res.json({ ok: true, status: "Revoked" });
});
app.get("/api/platform/licenses", platformAuth, (_req, res) => {
  const rows = db.prepare("SELECT l.id,l.organization_id as organizationId,o.name as pgName,u.email as ownerEmail,l.owner_login_email as ownerLoginEmail,l.key_hint as keyHint,l.key_ciphertext as keyCiphertext,l.plan,l.plan_code as planCode,l.subscription_id as subscriptionId,l.starts_at as startsAt,l.expires_at as expiresAt,l.status,l.activated_at as activatedAt,l.created_at as createdAt FROM saas_licenses l JOIN organizations o ON o.id=l.organization_id JOIN users u ON u.id=o.owner_user_id ORDER BY l.created_at DESC LIMIT 500").all();
  const licenses = rows.map(({ keyCiphertext, ...license }) => ({ ...license, activationKey: decryptLicenseKey(String(keyCiphertext || "")) }));
  res.json({ licenses });
});
app.post("/api/platform/licenses", platformAuth, (req, res) => {
  const b = req.body || {}, organizationId = val(b.organizationId, 100), plan = val(b.plan, 30), expiresAt = val(b.expiresAt, 10), today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), owner = db.prepare("SELECT u.email FROM organizations o JOIN users u ON u.id=o.owner_user_id WHERE o.id=?").get(organizationId);
  if (!owner) return res.status(404).json({ error: "Select a registered PG owner." });
  if (!["Starter", "Growth", "Business"].includes(plan)) return res.status(400).json({ error: "Choose a paid plan." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) || expiresAt < today) return res.status(400).json({ error: "Choose a valid license expiry date today or later." });
  const ownerLoginEmail = String(owner.email || "").trim().toLowerCase(), id = uid2(), secret = crypto2.randomBytes(16).toString("hex").toUpperCase(), activationKey = "NVB1-" + secret.match(/.{1,4}/g).join("-"), keyHash2 = hashLicenseKey(activationKey), keyCiphertext = encryptLicenseKey(activationKey), createdAt = nowIso2();
  db.prepare("INSERT INTO saas_licenses (id,organization_id,key_hash,key_hint,key_ciphertext,plan,starts_at,expires_at,status,created_by,created_at,owner_login_email,owner_login_password_hash) VALUES (?,?,?,?,?,?,?,?, 'Issued',?,?,?,'')").run(id, organizationId, keyHash2, "\u2022\u2022\u2022\u2022 " + secret.slice(-4), keyCiphertext, plan, today, expiresAt, platformUserFor(req).id, createdAt, ownerLoginEmail);
  const license = db.prepare("SELECT id,organization_id as organizationId,plan,starts_at as startsAt,expires_at as expiresAt,status,key_hint as keyHint,created_at as createdAt,owner_login_email as ownerLoginEmail FROM saas_licenses WHERE id=?").get(id);
  res.status(201).json({ license, activationKey });
});
app.patch("/api/platform/licenses/:id/revoke", platformAuth, (req, res) => {
  const license = db.prepare("SELECT id,organization_id as organizationId,status FROM saas_licenses WHERE id=?").get(val(req.params.id, 100));
  if (!license) return res.status(404).json({ error: "License was not found." });
  if (license.status === "Revoked") return res.json({ ok: true });
  db.transaction(() => {
    db.prepare("UPDATE saas_licenses SET status='Revoked',revoked_at=? WHERE id=?").run(nowIso2(), license.id);
    if (license.status === "Active") db.prepare("UPDATE organizations SET status='Suspended' WHERE id=?").run(license.organizationId);
  })();
  res.json({ ok: true });
});
app.post("/api/residents", auth, (req, res) => {
  const body = req.body || {}, stayType = val(body.stayType, 20) || "Monthly", phone = val(body.phone, 60), rent = Math.round(Number(body.rent)), perDayRent = Math.round(Number(body.perDayRent)), checkInDate = val(body.checkInDate, 10) || val(body.date, 10), checkOutDate = val(body.checkOutDate, 10), monthlyOk = stayType === "Monthly" && Number.isFinite(rent) && rent >= 0, dayPassOk = stayType === "Day Pass" && Number.isFinite(perDayRent) && perDayRent > 0 && /^\d{4}-\d{2}-\d{2}$/.test(checkInDate) && /^\d{4}-\d{2}-\d{2}$/.test(checkOutDate) && checkOutDate >= checkInDate;
  const portalEmail = val(body.email, 180).toLowerCase(), portalPassword = String(body.portalPassword || "");
  if (portalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(portalEmail)) return res.status(400).json({ error: "Enter a valid resident email for portal access." });
  if (portalPassword && (portalPassword.length < 10 || !portalEmail)) return res.status(400).json({ error: "Set a valid resident email and a portal password of at least 10 characters." });
  if (!val(body.name, 100) || !val(body.property, 180) || !["Monthly", "Day Pass"].includes(stayType) || !monthlyOk && !dayPassOk || !Number.isFinite(Number(body.securityDeposit || 0)) || Number(body.securityDeposit || 0) < 0 || !Number.isFinite(Number(body.advanceAmount || 0)) || Number(body.advanceAmount || 0) < 0 || !Number.isFinite(Number(body.securityAmountReceived || 0)) || Number(body.securityAmountReceived || 0) < 0 || Number(body.securityAmountReceived || 0) > Number(body.securityDeposit || 0) || Number(body.advanceAmount || 0) > 0 && (stayType !== "Monthly" || Number(body.advanceAmount) > rent)) return res.status(400).json({ error: "Enter valid resident details. Security received cannot exceed the deposit, and rent advance cannot exceed one month of rent." });
  const u = userFor(req), id = uid2(), property = val(body.property), propertyRow = db.prepare("SELECT id FROM properties WHERE organization_id=? AND name=?").get(u.organizationId, property);
  if (!propertyRow) return res.status(404).json({ error: "Choose a property in your workspace." });
  const propertyId = propertyRow.id, room = val(body.room, 150), roomIssue = validateResidentRoom(u.organizationId, propertyId, room);
  if (roomIssue) return res.status(roomIssue.status).json({ error: roomIssue.message });
  const securityDeposit = Math.round(Number(body.securityDeposit) || 0), securityAmountReceived = Math.round(Number(body.securityAmountReceived) || 0), advanceAmount = Math.round(Number(body.advanceAmount) || 0), advanceDate = val(body.advanceDate, 10) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), amount = stayType === "Day Pass" ? perDayRent : rent, moveIn = stayType === "Day Pass" ? checkInDate : val(body.date, 30), joined = moveIn ? (/* @__PURE__ */ new Date(`${moveIn}T00:00:00`)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : (/* @__PURE__ */ new Date()).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if ((advanceAmount > 0 || securityAmountReceived > 0) && (!/^\d{4}-\d{2}-\d{2}$/.test(moveIn) || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(advanceDate))) return res.status(400).json({ error: "Enter a move-in date and a valid advance payment date." });
  const row = { id, name: val(body.name, 100), phone, email: portalEmail || null, propertyId, property, room, rent: amount, due: val(body.dueDate, 30), securityDeposit, moveIn, stayType, professional: val(body.professional, 100), checkInDate, checkOutDate, perDayRent: stayType === "Day Pass" ? perDayRent : 0, address: val(body.address, 300), companyName: val(body.companyName, 160), status: "Pending", joined, color: "mint" };
  db.prepare("INSERT INTO residents (id,organization_id,name,phone,email,property_id,property,room,rent,due,status,joined,color,created_at,security_deposit,move_in_date,stay_type,professional,check_out_date,per_day_rent,address,company_name,document_type,document_number,document_file_name,document_data,kyc_verified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, u.organizationId, row.name, row.phone, row.email, row.propertyId, row.property, row.room, row.rent, row.due, row.status, row.joined, row.color, nowIso2(), row.securityDeposit, row.moveIn, row.stayType, row.professional, row.checkOutDate, row.perDayRent, row.address, row.companyName, val(body.documentType, 80), val(body.documentNumber, 120), val(body.documentFileName, 240), String(body.documentData || ""), 0);
  if (portalPassword) db.prepare("UPDATE residents SET portal_password_hash=? WHERE id=? AND organization_id=?").run(hash(portalPassword), id, u.organizationId);
  if (advanceAmount > 0 || securityAmountReceived > 0) {
    const moveInPeriod = moveIn.slice(0, 7), advanceReceiptPeriod = advanceDate.slice(0, 7), moveInDay = Number(moveIn.slice(8, 10)), nextPeriod = (() => {
      const [y, m] = moveInPeriod.split("-").map(Number), d = new Date(Date.UTC(y, m, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    })(), rentPeriod = moveInDay >= 28 ? nextPeriod : advanceReceiptPeriod > moveInPeriod ? advanceReceiptPeriod : moveInPeriod;
    if (securityAmountReceived > 0) db.prepare("INSERT INTO payments (id,organization_id,resident_id,resident,property,amount,date,method,purpose,status,created_at,billing_period) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(uid2(), u.organizationId, id, row.name, row.property, securityAmountReceived, advanceDate, val(body.advanceMethod, 40) || "UPI", "Security deposit", "Paid", nowIso2(), moveInPeriod);
    if (advanceAmount > 0) db.prepare("INSERT INTO payments (id,organization_id,resident_id,resident,property,amount,date,method,purpose,status,created_at,billing_period) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(uid2(), u.organizationId, id, row.name, row.property, advanceAmount, advanceDate, val(body.advanceMethod, 40) || "UPI", "Advance rent", "Paid", nowIso2(), rentPeriod);
  }
  if (row.stayType === "Day Pass") {
    const stayId = uid2();
    db.prepare("INSERT INTO resident_stays (id,organization_id,resident_id,property_id,property,room,rent,due,status,move_in_date,stay_type,check_out_date,per_day_rent,occupancy_status,exit_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(stayId, u.organizationId, id, propertyId, row.property, row.room, row.rent, row.due, "Pending", row.moveIn, "Day Pass", row.checkOutDate, row.perDayRent, "Active", "", nowIso2());
  }
  db.prepare("INSERT INTO activities VALUES (?, ?, ?, ?, ?, ?)").run(uid2(), u.organizationId, "New resident added", `${row.name} \xB7 ${row.property}`, "resident", nowIso2());
  audit(u.organizationId, u.id, "resident.created", "resident", id);
  res.status(201).json(row);
});
app.patch("/api/residents/:id", auth, (req, res) => {
  const b = req.body || {}, u = userFor(req), resident = db.prepare("SELECT id,name,phone,email,property_id as propertyId,property,room,rent,status,security_deposit as securityDeposit,due,move_in_date as moveIn,joined,stay_type as stayType,occupancy_status as occupancyStatus,check_out_date as checkOutDate,exit_date as exitDate FROM residents WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!resident) return res.status(404).json({ error: "Resident not found." });
  const rebooking = b.rebook === true || b.rebook === "1";
  const name = val(b.name, 100), phone = val(b.phone, 60), property = val(b.property), room = val(b.room, 150) || "Unassigned", stayType = val(b.stayType, 20) || "Monthly", monthlyRent = Math.round(Number(b.rent)), perDayRent = Math.round(Number(b.perDayRent)), checkInDate = val(b.checkInDate, 10) || val(b.date, 10), checkOutDate = val(b.checkOutDate, 10), rent = stayType === "Day Pass" ? perDayRent : monthlyRent, securityDeposit = stayType === "Day Pass" ? 0 : Math.round(Number(b.securityDeposit)), status = val(b.status, 20) || resident.status, email = val(b.email, 180).toLowerCase() || null, portalPassword = String(b.portalPassword || ""), professional = val(b.professional, 100), address = val(b.address, 300), companyName = val(b.companyName, 160), documentType = val(b.documentType, 80), documentNumber = val(b.documentNumber, 120), documentFileName = val(b.documentFileName, 240), documentData = String(b.documentData || ""), due = stayType === "Day Pass" ? "" : val(b.dueDate, 30) || (rebooking ? "" : resident.due || ""), newMoveIn = stayType === "Day Pass" ? checkInDate : val(b.date, 30) || resident.moveIn || "", dayPassEnded = resident.stayType === "Day Pass" && Boolean(resident.checkOutDate) && resident.checkOutDate < newMoveIn;
  if (rebooking && resident.occupancyStatus !== "Exited" && !dayPassEnded) return res.status(409).json({ error: "This Day Pass stay has not ended yet." });
  const joined = rebooking && newMoveIn ? (/* @__PURE__ */ new Date(`${newMoveIn}T00:00:00`)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : resident.joined;
  if (portalPassword && (portalPassword.length < 10 || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return res.status(400).json({ error: "Set a valid resident email and a portal password of at least 10 characters." });
  if (!name || !property || !room || room === "Unassigned" || !["Monthly", "Day Pass"].includes(stayType) || rebooking && stayType === "Monthly" && !/^\d{4}-\d{2}-\d{2}$/.test(val(b.date, 10)) || !Number.isFinite(rent) || rent < (stayType === "Day Pass" ? 1 : 0) || stayType === "Day Pass" && (!/^\d{4}-\d{2}-\d{2}$/.test(checkInDate) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOutDate) || checkOutDate < checkInDate) || !Number.isFinite(securityDeposit) || securityDeposit < 0 || !["Paid", "Pending", "Overdue", "Partial"].includes(status)) return res.status(400).json({ error: "Enter a name, property, valid stay dates and rent, security deposit, and payment status." });
  const targetProperty = db.prepare("SELECT id FROM properties WHERE organization_id=? AND name=?").get(u.organizationId, property);
  if (!targetProperty) return res.status(404).json({ error: "Choose a property in your workspace." });
  const roomIssue = validateResidentRoom(u.organizationId, targetProperty.id, room, resident.id);
  if (roomIssue) return res.status(roomIssue.status).json({ error: roomIssue.message });
  let nextFloor = "";
  if (room !== "Unassigned") {
    const match = room.match(/^Room\s+(.+?)(?:\s+·\s+Bed\s+(.+))?$/);
    if (!match) return res.status(400).json({ error: "Choose a saved bed or room." });
    const [_, number, label] = match;
    const targetRoom = db.prepare("SELECT id,floor_name as floorName FROM rooms WHERE organization_id=? AND property_id=? AND number=?").get(u.organizationId, targetProperty.id, number);
    if (!targetRoom) return res.status(400).json({ error: "That room does not belong to the selected property." });
    if (label && !db.prepare("SELECT id FROM beds WHERE organization_id=? AND room_id=? AND label=?").get(u.organizationId, targetRoom.id, label)) return res.status(400).json({ error: "That bed is not configured in the selected room." });
    nextFloor = targetRoom.floorName || "";
  }
  const roomChanged = resident.propertyId !== targetProperty.id || resident.room !== room;
  let previousFloor = "";
  if (roomChanged && resident.propertyId && resident.room !== "Unassigned") {
    const oldMatch = String(resident.room).match(/^Room\s+(.+?)(?:\s+·\s+Bed\s+.+)?$/);
    if (oldMatch) previousFloor = db.prepare("SELECT floor_name as floorName FROM rooms WHERE organization_id=? AND property_id=? AND number=?").get(u.organizationId, resident.propertyId, oldMatch[1])?.floorName || "";
  }
  const switchDate = val(b.switchDate, 10) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), timestamp = `${switchDate}T00:00:00.000Z`;
  const update = db.transaction(() => {
    const oldStay = resident.stayType === "Day Pass" ? db.prepare("SELECT id FROM resident_stays WHERE organization_id=? AND resident_id=? ORDER BY created_at DESC,id DESC LIMIT 1").get(u.organizationId, resident.id) : void 0;
    if (rebooking && oldStay) {
      const oldExit = resident.occupancyStatus === "Exited" ? resident.exitDate || resident.checkOutDate || "" : resident.checkOutDate || "";
      db.prepare("UPDATE resident_stays SET occupancy_status='Exited',exit_date=? WHERE id=? AND organization_id=?").run(oldExit, oldStay.id, u.organizationId);
      db.prepare("UPDATE payments SET stay_id=? WHERE organization_id=? AND resident_id=? AND stay_id='' AND purpose LIKE '%day pass%'").run(oldStay.id, u.organizationId, resident.id);
    }
    db.prepare(`UPDATE residents SET name=?,phone=?,email=?,property_id=?,property=?,room=?,rent=?,security_deposit=?,status=?,stay_type=?,professional=?,check_out_date=?,per_day_rent=?,address=?,company_name=?,document_type=?,document_number=?,document_file_name=CASE WHEN ?<>'' THEN ? ELSE document_file_name END,document_data=CASE WHEN ?<>'' THEN ? ELSE document_data END,move_in_date=?,due=?,occupancy_status=CASE WHEN ?=1 THEN 'Active' ELSE occupancy_status END,exit_date=CASE WHEN ?=1 THEN '' ELSE exit_date END,rent_paid_through_period=CASE WHEN ?=1 THEN '' ELSE rent_paid_through_period END,joined=CASE WHEN ?=1 THEN ? ELSE joined END WHERE id=? AND organization_id=?`).run(name, phone, email, targetProperty.id, property, room, rent, securityDeposit, status, stayType, professional, checkOutDate, stayType === "Day Pass" ? perDayRent : 0, address, companyName, documentType, documentNumber, documentFileName, documentFileName, documentData, documentData, stayType === "Day Pass" ? checkInDate : val(b.date, 30) || resident.moveIn || "", due, rebooking ? 1 : 0, rebooking ? 1 : 0, rebooking ? 1 : 0, rebooking ? 1 : 0, joined, resident.id, u.organizationId);
    if (rebooking && stayType === "Day Pass") {
      const stayId = uid2();
      db.prepare("INSERT INTO resident_stays (id,organization_id,resident_id,property_id,property,room,rent,due,status,move_in_date,stay_type,check_out_date,per_day_rent,occupancy_status,exit_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(stayId, u.organizationId, resident.id, targetProperty.id, property, room, rent, due, "Pending", checkInDate, "Day Pass", checkOutDate, perDayRent, "Active", "", nowIso2());
    } else if (!rebooking && stayType === "Day Pass") {
      db.prepare("UPDATE resident_stays SET property_id=?,property=?,room=?,rent=?,due=?,status=?,move_in_date=?,check_out_date=?,per_day_rent=?,occupancy_status=?,exit_date=? WHERE id=(SELECT id FROM resident_stays WHERE organization_id=? AND resident_id=? ORDER BY created_at DESC,id DESC LIMIT 1)").run(targetProperty.id, property, room, rent, due, status, checkInDate, checkOutDate, perDayRent, resident.occupancyStatus || "Active", resident.exitDate || "", u.organizationId, resident.id);
    }
    if (roomChanged) db.prepare("INSERT INTO resident_room_history (id,organization_id,resident_id,previous_property,previous_room,previous_floor,current_property,current_room,current_floor,switched_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(uid2(), u.organizationId, resident.id, resident.property, resident.room, previousFloor, property, room, nextFloor, timestamp);
  });
  update();
  if (portalPassword) db.prepare("UPDATE residents SET portal_password_hash=? WHERE id=? AND organization_id=?").run(hash(portalPassword), resident.id, u.organizationId);
  db.prepare("INSERT INTO activities VALUES (?, ?, ?, ?, ?, ?)").run(uid2(), u.organizationId, rebooking ? "Returning resident booked again" : roomChanged ? "Resident room changed" : "Resident details updated", roomChanged ? `${name} \xB7 ${resident.room} \u2192 ${room}` : `${name} \xB7 ${property}`, "resident", nowIso2());
  audit(u.organizationId, u.id, rebooking ? "resident.booked_again" : roomChanged ? "resident.room_switched" : "resident.updated", "resident", resident.id);
  res.json({ ok: true, roomChanged, rebooking, switchDate });
});
app.delete("/api/residents/:id", auth, (req, res) => {
  const u = userFor(req), resident = db.prepare("SELECT id,name FROM residents WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!resident) return res.status(404).json({ error: "Resident not found." });
  const remove = db.transaction(() => {
    db.prepare("DELETE FROM payments WHERE resident_id=? AND organization_id=?").run(resident.id, u.organizationId);
    db.prepare("DELETE FROM electricity_bills WHERE resident_id=? AND organization_id=?").run(resident.id, u.organizationId);
    db.prepare("DELETE FROM residents WHERE id=? AND organization_id=?").run(resident.id, u.organizationId);
  });
  remove();
  audit(u.organizationId, u.id, "resident.deleted", "resident", resident.id);
  db.prepare("INSERT INTO activities VALUES (?, ?, ?, ?, ?, ?)").run(uid2(), u.organizationId, "Resident deleted", resident.name, "resident", nowIso2());
  res.json({ ok: true, id: resident.id });
});
app.patch("/api/residents/:id/payment-status", auth, (req, res) => {
  const u = userFor(req), date = val(req.body?.date, 10), period = val(req.body?.billingPeriod, 7), received = Math.round(Number(req.body?.amount)), paymentType = val(req.body?.paymentType, 40) || "Rent";
  const resident = db.prepare("SELECT id,name,property,rent,security_deposit as securityDeposit,stay_type as stayType,joined,move_in_date as moveIn,rent_paid_through_period as paidThroughPeriod FROM residents WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!resident) return res.status(404).json({ error: "Resident not found." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + "T00:00:00Z"))) return res.status(400).json({ error: "Choose a valid payment date." });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return res.status(400).json({ error: "Choose a valid billing month." });
  if (!Number.isFinite(received) || received < 1) return res.status(400).json({ error: "Enter the amount received." });
  const stayId = val(req.body?.stayId, 120), selectedStay = stayId ? db.prepare("SELECT id,resident_id as residentId,property,rent,move_in_date as moveIn,check_out_date as checkOutDate,per_day_rent as perDayRent,stay_type as stayType FROM resident_stays WHERE id=? AND resident_id=? AND organization_id=?").get(stayId, resident.id, u.organizationId) : resident.stayType === "Day Pass" ? db.prepare("SELECT id,resident_id as residentId,property,rent,move_in_date as moveIn,check_out_date as checkOutDate,per_day_rent as perDayRent,stay_type as stayType FROM resident_stays WHERE resident_id=? AND organization_id=? ORDER BY created_at DESC,id DESC LIMIT 1").get(resident.id, u.organizationId) : void 0;
  if (stayId && !selectedStay) return res.status(404).json({ error: "Day Pass booking not found for this resident." });
  const save = db.transaction(() => {
    const insert = (amount, purpose, billingPeriod, receiptStayId = "") => {
      if (amount <= 0) return "";
      const id = uid2();
      db.prepare("INSERT INTO payments (id,organization_id,resident_id,stay_id,resident,property,amount,date,method,purpose,status,created_at,billing_period) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, u.organizationId, resident.id, receiptStayId, resident.name, receiptStayId ? selectedStay?.property || resident.property : resident.property, amount, date, val(req.body?.method, 40) || "Other", purpose, "Paid", nowIso2(), billingPeriod);
      return id;
    };
    if (selectedStay?.stayType === "Day Pass") {
      if (paymentType === "Security deposit") throw new Error("Day Pass bookings do not have a security deposit due.");
      const checkIn = Date.parse(String(selectedStay.moveIn || "") + "T00:00:00Z"), checkOut = Date.parse(String(selectedStay.checkOutDate || "") + "T00:00:00Z"), days = Number.isFinite(checkIn) && Number.isFinite(checkOut) && checkOut >= checkIn ? Math.floor((checkOut - checkIn) / 864e5) + 1 : 0, total = Math.max(0, Math.round(Number(selectedStay.perDayRent || selectedStay.rent) * days));
      if (!total) throw new Error("This Day Pass booking has no valid stay amount.");
      const paid = Number(db.prepare("SELECT COALESCE(SUM(amount),0) as amount FROM payments WHERE organization_id=? AND resident_id=? AND stay_id=? AND purpose LIKE '%day pass%' AND status='Paid'").get(u.organizationId, resident.id, selectedStay.id)?.amount || 0), outstanding = Math.max(0, total - paid);
      if (received > outstanding) throw new Error(`Amount exceeds the outstanding Day Pass balance of \u20B9${outstanding.toLocaleString("en-IN")}.`);
      const paymentId2 = insert(received, "Day Pass Payment", period, selectedStay.id), nextPaid = paid + received;
      db.prepare("UPDATE resident_stays SET status=? WHERE id=? AND organization_id=?").run(nextPaid >= total ? "Paid" : "Partial", selectedStay.id, u.organizationId);
      db.prepare("INSERT INTO activities VALUES (?, ?, ?, ?, ?, ?)").run(uid2(), u.organizationId, "Day Pass payment received", resident.name + " \xB7 " + selectedStay.moveIn + " \u2013 " + selectedStay.checkOutDate + " \xB7 " + date + " \xB7 \u20B9" + received.toLocaleString("en-IN"), "payment", nowIso2());
      audit(u.organizationId, u.id, "resident.day_pass_payment_received", "resident_stay", selectedStay.id);
      return { paymentId: paymentId2, balance: Math.max(0, total - nextPaid), status: nextPaid >= total ? "Paid" : "Partial" };
    }
    const moveIn = resident.moveIn || resident.joined, moveInPeriod = (() => {
      const raw = String(moveIn || "").trim(), iso = raw.match(/^(\d{4})-(\d{2})/);
      if (iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12) return `${iso[1]}-${iso[2]}`;
      const dmy = raw.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
      if (dmy && Number(dmy[1]) >= 1 && Number(dmy[1]) <= 31 && Number(dmy[2]) >= 1 && Number(dmy[2]) <= 12) return `${dmy[3]}-${String(Number(dmy[2])).padStart(2, "0")}`;
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? "" : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
    })();
    if (moveInPeriod && period < moveInPeriod) throw new Error("The billing month cannot be before the resident moved in.");
    const securityTarget = Math.max(0, Math.round(Number(req.body?.securityAmount ?? resident.securityDeposit) || 0));
    const deposits = db.prepare("SELECT COALESCE(SUM(amount),0) as amount FROM payments WHERE organization_id=? AND resident_id=? AND (purpose LIKE '%security%' OR purpose LIKE '%deposit%') AND status='Paid'").get(u.organizationId, resident.id);
    const securityOutstanding = Math.max(0, securityTarget - Number(deposits?.amount || 0));
    const monthlyReceipts = db.prepare("SELECT id,amount,date,billing_period as billingPeriod FROM payments WHERE organization_id=? AND resident_id=? AND status='Paid' AND purpose LIKE '%rent%' AND purpose NOT LIKE '%day pass%' AND purpose NOT LIKE '%electric%' AND purpose NOT LIKE '%security%' AND purpose NOT LIKE '%deposit%'").all(u.organizationId, resident.id);
    const receiptPeriod = (receipt) => {
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(receipt.billingPeriod || "")) return receipt.billingPeriod;
      const paidDate = dateOnly(receipt.date);
      return paidDate ? `${paidDate.getFullYear()}-${String(paidDate.getMonth() + 1).padStart(2, "0")}` : "";
    };
    const effectivePeriod = (receipt) => {
      const recorded = receiptPeriod(receipt), paidDate = dateOnly(receipt.date);
      if (!paidDate) return recorded;
      const paidPeriod = `${paidDate.getFullYear()}-${String(paidDate.getMonth() + 1).padStart(2, "0")}`;
      if (!recorded || recorded <= paidPeriod) return recorded || paidPeriod;
      const moveInDate = dateOnly(moveIn), dueDay = moveInDate ? Math.min(moveInDate.getDate(), new Date(Number(paidPeriod.slice(0, 4)), Number(paidPeriod.slice(5, 7)), 0).getDate()) : null, dueDate = dueDay === null ? null : new Date(Number(paidPeriod.slice(0, 4)), Number(paidPeriod.slice(5, 7)) - 1, dueDay);
      if (!dueDate || paidDate < dueDate) return recorded;
      const alreadyPaid = monthlyReceipts.filter((other) => other.id !== receipt.id && receiptPeriod(other) === paidPeriod).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      return alreadyPaid < Math.max(0, Number(resident.rent) || 0) ? paidPeriod : recorded;
    };
    let effectivePaidThrough = resident.paidThroughPeriod || "";
    if (effectivePaidThrough) {
      const throughReceipts = monthlyReceipts.filter((receipt) => receiptPeriod(receipt) === effectivePaidThrough);
      if (throughReceipts.length) {
        const latestEffective = throughReceipts.map(effectivePeriod).sort().slice(-1)[0] || effectivePaidThrough;
        if (latestEffective < effectivePaidThrough) effectivePaidThrough = latestEffective;
      }
    }
    const rentDue = effectivePaidThrough && period <= effectivePaidThrough ? 0 : Math.max(0, Math.round(Number(resident.rent) || 0));
    const currentRentPaid = monthlyReceipts.filter((receipt) => effectivePeriod(receipt) === period).reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
    const rentOutstanding = Math.max(0, rentDue - currentRentPaid), securityOnly = paymentType === "Security deposit", totalOutstanding = securityOnly ? securityOutstanding : rentOutstanding + securityOutstanding;
    if (totalOutstanding <= 0) throw new Error("This rent or deposit is already covered for the selected month. The list is being refreshed.");
    if (received > totalOutstanding) throw new Error(`Amount exceeds the outstanding balance of \u20B9${totalOutstanding.toLocaleString("en-IN")}.`);
    const rentReceipt = securityOnly ? 0 : Math.min(received, rentOutstanding), securityReceipt = securityOnly ? received : Math.max(0, received - rentReceipt);
    const paymentId = rentReceipt ? insert(rentReceipt, "Monthly rent", period) : insert(securityReceipt, "Security deposit", moveInPeriod || period);
    if (rentReceipt && securityReceipt) insert(securityReceipt, "Security deposit", moveInPeriod || period);
    const newRentPaid = currentRentPaid + rentReceipt, rentFullyPaid = rentDue > 0 && newRentPaid >= rentDue;
    let rentPaidThroughPeriod = resident.paidThroughPeriod || "";
    if (rentFullyPaid) {
      rentPaidThroughPeriod = rentPaidThroughPeriod > period ? rentPaidThroughPeriod : period;
      db.prepare("UPDATE residents SET rent_paid_through_period=? WHERE id=? AND organization_id=?").run(rentPaidThroughPeriod, resident.id, u.organizationId);
    }
    db.prepare("INSERT INTO activities VALUES (?, ?, ?, ?, ?, ?)").run(uid2(), u.organizationId, "Resident payment received", resident.name + " \xB7 " + period + " \xB7 " + date + " \xB7 \u20B9" + received.toLocaleString("en-IN"), "payment", nowIso2());
    audit(u.organizationId, u.id, "resident.payment_received", "resident", resident.id);
    return { paymentId, balance: Math.max(0, totalOutstanding - received), status: received >= totalOutstanding ? "Paid" : "Partial", rentPaidThroughPeriod, rentFullyPaid };
  });
  try {
    const result = save();
    res.json({ ok: true, ...result, date, amount: received, billingPeriod: period, stayId: selectedStay?.id || "" });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not record payment." });
  }
});
app.patch("/api/residents/:id/verification", ownerAuth, (req, res) => {
  const u = userFor(req), id = val(req.params.id, 100), resident = db.prepare("SELECT id,name,kyc_verified as verified FROM residents WHERE id=? AND organization_id=?").get(id, u.organizationId);
  if (!resident) return res.status(404).json({ error: "Resident not found." });
  if (req.body?.aadhaarAuthenticated !== true) return res.status(400).json({ error: "Confirm that identity verification was completed through the official Aadhaar portal." });
  const now = nowIso2();
  db.prepare("UPDATE residents SET kyc_verified=1 WHERE id=? AND organization_id=?").run(id, u.organizationId);
  audit(u.organizationId, u.id, "resident.identity_verified", "resident", id);
  res.json({ ok: true, id, verified: true });
});
app.patch("/api/residents/:id/exit", auth, (req, res) => {
  const u = userFor(req), resident = db.prepare("SELECT id,name,occupancy_status as occupancyStatus,stay_type as stayType FROM residents WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!resident) return res.status(404).json({ error: "Resident not found." });
  if (resident.occupancyStatus === "Exited") return res.status(409).json({ error: "This resident has already exited." });
  const exitDate = val(req.body?.exitDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exitDate) || !Number.isFinite(Date.parse(exitDate + "T00:00:00Z"))) return res.status(400).json({ error: "Choose a valid exit date." });
  db.prepare("UPDATE residents SET occupancy_status='Exited',exit_date=? WHERE id=? AND organization_id=?").run(exitDate, resident.id, u.organizationId);
  if (resident.stayType === "Day Pass") db.prepare("UPDATE resident_stays SET occupancy_status='Exited',exit_date=? WHERE organization_id=? AND resident_id=? AND id=(SELECT id FROM resident_stays WHERE organization_id=? AND resident_id=? ORDER BY created_at DESC,id DESC LIMIT 1)").run(exitDate, u.organizationId, resident.id, u.organizationId, resident.id);
  db.prepare("INSERT INTO activities VALUES (?, ?, ?, ?, ?, ?)").run(uid2(), u.organizationId, "Resident checked out", `${resident.name} \xB7 ${exitDate}`, "resident", nowIso2());
  audit(u.organizationId, u.id, "resident.exited", "resident", resident.id);
  res.json({ ok: true, id: resident.id, occupancyStatus: "Exited", exitDate });
});
app.patch("/api/residents/:id/exit/revoke", auth, (req, res) => {
  const u = userFor(req), resident = db.prepare("SELECT id,name,occupancy_status as occupancyStatus,exit_date as exitDate,stay_type as stayType FROM residents WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!resident) return res.status(404).json({ error: "Resident not found." });
  if (resident.occupancyStatus !== "Exited") return res.status(409).json({ error: "This resident is not marked as exited." });
  db.prepare("UPDATE residents SET occupancy_status='Active',exit_date='' WHERE id=? AND organization_id=?").run(resident.id, u.organizationId);
  if (resident.stayType === "Day Pass") db.prepare("UPDATE resident_stays SET occupancy_status='Active',exit_date='' WHERE organization_id=? AND resident_id=? AND id=(SELECT id FROM resident_stays WHERE organization_id=? AND resident_id=? ORDER BY created_at DESC,id DESC LIMIT 1)").run(u.organizationId, resident.id, u.organizationId, resident.id);
  db.prepare("INSERT INTO activities VALUES (?, ?, ?, ?, ?, ?)").run(uid2(), u.organizationId, "Resident exit revoked", `${resident.name} \xB7 previous exit date ${resident.exitDate || "\u2014"}`, "resident", nowIso2());
  audit(u.organizationId, u.id, "resident.exit_revoked", "resident", resident.id);
  res.json({ ok: true, id: resident.id, occupancyStatus: "Active", exitDate: "" });
});
app.post("/api/properties", auth, (req, res) => {
  const b = req.body || {};
  if (!required(b, ["name", "address"])) return res.status(400).json({ error: "Enter the property name and address." });
  const u = userFor(req), limit = planLimitFailure(u.organizationId, "properties", 1);
  if (limit) return res.status(403).json(limit);
  const id = uid2();
  const row = { id, name: val(b.name), address: val(b.address, 300), type: val(b.type) || "PG / Co-living", beds: Math.max(0, Math.round(Number(b.beds) || 0)), roomsCount: Math.max(0, Math.round(Number(b.rooms) || 0)), floorName: val(b.floorName, 100) };
  db.prepare("INSERT INTO properties (id,organization_id,name,address,type,beds,created_at,rooms_count,floor_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, u.organizationId, row.name, row.address, row.type, row.beds, nowIso2(), row.roomsCount, row.floorName);
  audit(u.organizationId, u.id, "property.created", "property", id);
  res.status(201).json(row);
});
app.post("/api/rooms", auth, (req, res) => {
  const b = req.body || {}, u = userFor(req), propertyId = val(b.propertyId, 100), number = val(b.number, 50), type = val(b.type, 60) || "Standard", floorName = val(b.floorName, 100), bedCount = Math.max(0, Math.round(Number(b.beds) || 0));
  const limit = planLimitFailure(u.organizationId, "beds", bedCount);
  if (limit) return res.status(403).json(limit);
  const property = db.prepare("SELECT id,name,beds,rooms_count as roomsCount,floor_name as floorName FROM properties WHERE id=? AND organization_id=?").get(propertyId, u.organizationId);
  if (!property) return res.status(404).json({ error: "Select a property in your workspace." });
  const readingId = val(b.readingId, 100), editedReading = readingId ? db.prepare("SELECT id,property_id as propertyId,meter_type as meterType,period_year as year,period_month as month,floor_name as floorName,room_id as roomId FROM meter_readings WHERE id=? AND organization_id=?").get(readingId, u.organizationId) : null;
  if (readingId && !editedReading) return res.status(404).json({ error: "The meter reading you are editing no longer exists." });
  if (editedReading && (editedReading.propertyId !== propertyId || editedReading.meterType !== meterType || editedReading.year !== year || editedReading.month !== month || editedReading.floorName !== (meterType === "Sub meter" ? floorName : ""))) return res.status(409).json({ error: "Keep the property, meter type, month, and floor unchanged while editing this reading." });
  const selectedFloor = floorName || property.floorName;
  if (!selectedFloor) return res.status(400).json({ error: "Choose a floor for this room." });
  if (!number || bedCount < 1) return res.status(400).json({ error: "Enter a room number and at least one bed." });
  const counts = db.prepare("SELECT COUNT(*) as rooms,COALESCE(SUM((SELECT COUNT(*) FROM beds b WHERE b.room_id=r.id)),0) as beds FROM rooms r WHERE r.organization_id=? AND r.property_id=?").get(u.organizationId, propertyId);
  if (property.roomsCount > 0 && counts.rooms >= property.roomsCount) return res.status(400).json({ error: `This property has reached its ${property.roomsCount}-room limit.` });
  if (counts.beds + bedCount > property.beds) return res.status(400).json({ error: `This property has ${property.beds - counts.beds} unassigned beds available.` });
  const roomId = uid2();
  try {
    const insert = db.transaction(() => {
      db.prepare("INSERT INTO rooms (id,organization_id,property_id,number,type,created_at,floor_name) VALUES (?, ?, ?, ?, ?, ?, ?)").run(roomId, u.organizationId, propertyId, number, type, nowIso2(), selectedFloor);
      const addBed = db.prepare("INSERT INTO beds VALUES (?, ?, ?, ?, ?)");
      for (let i = 0; i < bedCount; i++) addBed.run(uid2(), u.organizationId, roomId, i < 26 ? String.fromCharCode(65 + i) : `B${i + 1}`, nowIso2());
    });
    insert();
    audit(u.organizationId, u.id, "room.created", "room", roomId);
    res.status(201).json({ id: roomId, propertyId, property: property.name, number, type, floorName: selectedFloor, beds: bedCount });
  } catch (e) {
    res.status(e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? 409 : 500).json({ error: e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? "A room with this number already exists in this property." : "Could not add room." });
  }
});
app.patch("/api/rooms/:id", auth, (req, res) => {
  const u = userFor(req), number = val(req.body?.number, 50), type = val(req.body?.type, 60) || "Standard", floorName = val(req.body?.floorName, 100);
  if (!number || !floorName) return res.status(400).json({ error: "Enter a room number and choose a floor." });
  const room = db.prepare("SELECT id,property_id as propertyId,number as oldNumber FROM rooms WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!room) return res.status(404).json({ error: "Room not found." });
  try {
    const update = db.transaction(() => {
      db.prepare("UPDATE rooms SET number=?,type=?,floor_name=? WHERE id=? AND organization_id=?").run(number, type, floorName, room.id, u.organizationId);
      if (number !== room.oldNumber) {
        const residents = db.prepare("SELECT id,room FROM residents WHERE organization_id=? AND property_id=?").all(u.organizationId, room.propertyId);
        const updateResident = db.prepare("UPDATE residents SET room=? WHERE id=?");
        for (const resident of residents) {
          const original = String(resident.room || ""), prefix = original.replace(/^Room\s+/i, ""), suffix = prefix.startsWith(room.oldNumber) ? prefix.slice(room.oldNumber.length) : null;
          if (suffix !== null && (suffix === "" || suffix.startsWith(" \xB7") || suffix.startsWith(" -"))) updateResident.run(`${/^Room\s+/i.test(original) ? "Room " : ""}${number}${suffix}`, resident.id);
        }
      }
    });
    update();
    audit(u.organizationId, u.id, "room.updated", "room", room.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? 409 : 500).json({ error: e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? "That room number is already used in this property." : "Could not update room." });
  }
});
app.delete("/api/rooms/:id", auth, (req, res) => {
  const u = userFor(req), room = db.prepare("SELECT id,property_id as propertyId,number FROM rooms WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!room) return res.status(404).json({ error: "Room not found." });
  const assigned = db.prepare("SELECT room FROM residents WHERE organization_id=? AND property_id=? AND occupancy_status='Active'").all(u.organizationId, room.propertyId).some((r) => String(r.room).replace(/^Room\s+/i, "").startsWith(room.number));
  if (assigned) return res.status(409).json({ error: "This room has residents assigned. Move them first before deleting it." });
  db.prepare("DELETE FROM rooms WHERE id=? AND organization_id=?").run(room.id, u.organizationId);
  audit(u.organizationId, u.id, "room.deleted", "room", room.id);
  res.json({ ok: true });
});
app.post("/api/rooms/:id/beds", auth, (req, res) => {
  const u = userFor(req), room = db.prepare("SELECT r.id,r.property_id as propertyId,p.beds as capacity FROM rooms r JOIN properties p ON p.id=r.property_id WHERE r.id=? AND r.organization_id=? AND p.organization_id=?").get(req.params.id, u.organizationId, u.organizationId);
  if (!room) return res.status(404).json({ error: "Room not found." });
  const limit = planLimitFailure(u.organizationId, "beds", 1);
  if (limit) return res.status(403).json(limit);
  const counts = db.prepare("SELECT (SELECT COUNT(*) FROM beds b WHERE b.room_id=?) as roomBeds,(SELECT COALESCE(SUM((SELECT COUNT(*) FROM beds b WHERE b.room_id=r.id)),0) FROM rooms r WHERE r.property_id=?) as propertyBeds").get(room.id, room.propertyId);
  let index = 0, label = "";
  while (!label) {
    const candidate = index < 26 ? String.fromCharCode(65 + index) : `B${index + 1}`;
    if (!db.prepare("SELECT id FROM beds WHERE room_id=? AND label=?").get(room.id, candidate)) label = candidate;
    index++;
  }
  const id = uid2();
  db.prepare("INSERT INTO beds VALUES (?, ?, ?, ?, ?)").run(id, u.organizationId, room.id, label, nowIso2());
  db.prepare("UPDATE properties SET beds=MAX(beds,?) WHERE id=? AND organization_id=?").run(counts.propertyBeds + 1, room.propertyId, u.organizationId);
  audit(u.organizationId, u.id, "bed.created", "bed", id);
  res.status(201).json({ id, label });
});
app.delete("/api/rooms/:id/beds/:bedId", auth, (req, res) => {
  const u = userFor(req), bed = db.prepare("SELECT b.id,b.label,r.number,r.property_id as propertyId FROM beds b JOIN rooms r ON r.id=b.room_id WHERE b.id=? AND r.id=? AND b.organization_id=? AND r.organization_id=?").get(req.params.bedId, req.params.id, u.organizationId, u.organizationId);
  if (!bed) return res.status(404).json({ error: "Bed not found." });
  const assigned = db.prepare("SELECT room FROM residents WHERE organization_id=? AND property_id=? AND occupancy_status='Active'").all(u.organizationId, bed.propertyId).some((r) => {
    const text = String(r.room);
    return text.includes(bed.number) && text.includes(`Bed ${bed.label}`);
  });
  if (assigned) return res.status(409).json({ error: "This bed is assigned to a resident and can\u2019t be removed." });
  db.prepare("DELETE FROM beds WHERE id=?").run(bed.id);
  db.prepare("UPDATE properties SET beds=MAX(0,beds-1) WHERE id=? AND organization_id=?").run(bed.propertyId, u.organizationId);
  audit(u.organizationId, u.id, "bed.deleted", "bed", bed.id);
  res.json({ ok: true });
});
app.post("/api/electricity/readings", auth, (req, res) => {
  const b = req.body || {}, u = userFor(req), propertyId = val(b.propertyId, 100), meterType2 = val(b.meterType, 20), year2 = Math.round(Number(b.year)), month2 = Math.round(Number(b.month)), reading = Number(b.reading), commonReading = Number(b.commonReading), floorName = val(b.floorName, 100), readingDate = val(b.readingDate, 10), readingMode = val(b.readingMode, 20) || "direct", property = db.prepare("SELECT id FROM properties WHERE id=? AND organization_id=?").get(propertyId, u.organizationId);
  if (!property) return res.status(404).json({ error: "Select a property in your workspace." });
  const readingId = val(b.readingId, 100), editedReading = readingId ? db.prepare("SELECT id,property_id as propertyId,meter_type as meterType,period_year as year,period_month as month,floor_name as floorName,room_id as roomId FROM meter_readings WHERE id=? AND organization_id=?").get(readingId, u.organizationId) : null;
  if (readingId && !editedReading) return res.status(404).json({ error: "The meter reading you are editing no longer exists." });
  if (editedReading && (editedReading.propertyId !== propertyId || editedReading.meterType !== meterType2 || editedReading.floorName !== (meterType2 === "Sub meter" ? floorName : ""))) return res.status(409).json({ error: "Property, meter type, and floor cannot be changed while editing a reading." });
  if (editedReading) {
    const conflict = editedReading.meterType === "Main meter" ? db.prepare("SELECT id FROM meter_readings WHERE organization_id=? AND property_id=? AND meter_type='Main meter' AND period_year=? AND period_month=? AND id<>?").get(u.organizationId, propertyId, year2, month2, readingId) : db.prepare("SELECT id FROM meter_readings WHERE organization_id=? AND property_id=? AND meter_type='Sub meter' AND period_year=? AND period_month=? AND floor_name=? AND NOT (period_year=? AND period_month=? AND floor_name=?) LIMIT 1").get(u.organizationId, propertyId, year2, month2, floorName, editedReading.year, editedReading.month, editedReading.floorName);
    if (conflict) return res.status(409).json({ error: "A reading already exists for this property, meter and month. Edit that entry or choose another month." });
  }
  if (!["Main meter", "Sub meter"].includes(meterType2) || !["readings", "direct"].includes(readingMode) || !Number.isInteger(year2) || year2 < 2e3 || year2 > 2200 || !Number.isInteger(month2) || month2 < 1 || month2 > 12 || !/^\d{4}-\d{2}-\d{2}$/.test(readingDate) || Number.isNaN(Date.parse(`${readingDate}T00:00:00Z`)) || (/* @__PURE__ */ new Date(`${readingDate}T00:00:00Z`)).toISOString().slice(0, 10) !== readingDate) return res.status(400).json({ error: "Choose a valid meter type, entry method, month and year, and reading date." });
  const now = nowIso2();
  if (meterType2 === "Main meter") {
    const previousReading = readingMode === "readings" ? Number(b.previousReading) : null;
    if (!Number.isFinite(reading) || reading < 0 || readingMode === "readings" && (!Number.isFinite(previousReading) || previousReading < 0 || reading < previousReading)) return res.status(400).json({ error: readingMode === "readings" ? "Current main meter reading cannot be lower than its valid previous reading." : "Enter a valid nonnegative main-meter consumption." });
    const save = db.prepare(`INSERT INTO meter_readings (id,organization_id,property_id,meter_type,period_year,period_month,floor_name,room_id,room_number,common_reading,reading,reading_date,reading_mode,previous_reading,previous_common_reading,created_at) VALUES (?,?,?,'Main meter',?,?, '',NULL,'',0,?,?,?,?,NULL,?) ON CONFLICT(organization_id,property_id,period_year,period_month) WHERE meter_type='Main meter' DO UPDATE SET reading=excluded.reading,reading_date=excluded.reading_date,reading_mode=excluded.reading_mode,previous_reading=excluded.previous_reading,created_at=excluded.created_at`);
    if (editedReading) db.prepare("UPDATE meter_readings SET period_year=?,period_month=?,reading=?,reading_date=?,reading_mode=?,previous_reading=?,created_at=? WHERE id=? AND organization_id=?").run(year2, month2, reading, readingDate, readingMode, previousReading, now, readingId, u.organizationId);
    else save.run(uid2(), u.organizationId, propertyId, year2, month2, reading, readingDate, readingMode, previousReading, now);
  } else {
    const previousCommonReading = readingMode === "readings" ? Number(b.previousCommonReading) : null;
    if (!floorName || !Number.isFinite(commonReading) || commonReading < 0 || readingMode === "readings" && (!Number.isFinite(previousCommonReading) || previousCommonReading < 0 || commonReading < previousCommonReading)) return res.status(400).json({ error: readingMode === "readings" ? "Current common-area reading cannot be lower than its valid previous reading." : "Choose a floor and enter valid nonnegative common-area consumption." });
    const floorRooms = db.prepare("SELECT id,number FROM rooms WHERE property_id=? AND organization_id=? AND floor_name=? ORDER BY number").all(propertyId, u.organizationId, floorName);
    if (!floorRooms.length) return res.status(400).json({ error: "There are no rooms assigned to the selected floor." });
    const submitted = Array.isArray(b.roomReadings) ? b.roomReadings : [];
    if (submitted.length !== floorRooms.length) return res.status(400).json({ error: "Enter a value for every room on this floor." });
    const readingsByRoom = /* @__PURE__ */ new Map();
    for (const entry of submitted) {
      const roomId = val(entry?.roomId, 100), value = entry?.reading === "" || entry?.reading === null || entry?.reading === void 0 ? null : Number(entry.reading), previous = readingMode === "readings" ? Number(entry?.previousReading) : null;
      if (!floorRooms.some((r) => r.id === roomId) || readingsByRoom.has(roomId)) return res.status(400).json({ error: "Room entries must match each room on the selected floor exactly once." });
      if (value === null || !Number.isFinite(value) || value < 0) return res.status(400).json({ error: "Enter a valid nonnegative value for every room." });
      if (readingMode === "readings" && (!Number.isFinite(previous) || previous < 0 || value < previous)) return res.status(400).json({ error: "A room current reading cannot be lower than its valid previous reading." });
      readingsByRoom.set(roomId, { reading: value, previous });
    }
    const save = db.prepare(`INSERT INTO meter_readings (id,organization_id,property_id,meter_type,period_year,period_month,floor_name,room_id,room_number,common_reading,reading,reading_date,reading_mode,previous_reading,previous_common_reading,created_at) VALUES (?,?,?,'Sub meter',?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,property_id,period_year,period_month,floor_name,room_number) WHERE meter_type='Sub meter' DO UPDATE SET room_id=excluded.room_id,common_reading=excluded.common_reading,reading=excluded.reading,reading_date=excluded.reading_date,reading_mode=excluded.reading_mode,previous_reading=excluded.previous_reading,previous_common_reading=excluded.previous_common_reading,created_at=excluded.created_at`);
    const transaction = db.transaction(() => {
      if (editedReading) {
        const sourceRows = db.prepare("SELECT id,room_id as roomId FROM meter_readings WHERE organization_id=? AND property_id=? AND meter_type='Sub meter' AND period_year=? AND period_month=? AND floor_name=?").all(u.organizationId, propertyId, editedReading.year, editedReading.month, editedReading.floorName);
        const byRoom = new Map(sourceRows.map((row) => [row.roomId, row.id]));
        for (const room of floorRooms) {
          const value = readingsByRoom.get(room.id), existingId = byRoom.get(room.id);
          if (existingId) {
            db.prepare("UPDATE meter_readings SET period_year=?,period_month=?,room_id=?,room_number=?,common_reading=?,reading=?,reading_date=?,reading_mode=?,previous_reading=?,previous_common_reading=?,created_at=? WHERE id=? AND organization_id=?").run(year2, month2, room.id, room.number, commonReading, value.reading, readingDate, readingMode, value.previous, previousCommonReading, now, existingId, u.organizationId);
            byRoom.delete(room.id);
          } else save.run(uid2(), u.organizationId, propertyId, year2, month2, floorName, room.id, room.number, commonReading, value.reading, readingDate, readingMode, value.previous, previousCommonReading, now);
        }
        for (const obsoleteId of byRoom.values()) db.prepare("DELETE FROM meter_readings WHERE id=? AND organization_id=?").run(obsoleteId, u.organizationId);
      } else {
        for (const room of floorRooms) {
          const value = readingsByRoom.get(room.id);
          save.run(uid2(), u.organizationId, propertyId, year2, month2, floorName, room.id, room.number, commonReading, value.reading, readingDate, readingMode, value.previous, previousCommonReading, now);
        }
      }
    });
    transaction();
  }
  audit(u.organizationId, u.id, "electricity.reading.saved", "meter_reading", `${propertyId}:${meterType2}:${year2}-${month2}:${floorName}`);
  res.status(readingId ? 200 : 201).json({ ok: true, propertyId, meterType: meterType2, year: year2, month: month2, floorName: meterType2 === "Sub meter" ? floorName : "", readingDate, readingMode, roomCount: meterType2 === "Sub meter" ? Number(db.prepare("SELECT COUNT(*) as n FROM rooms WHERE organization_id=? AND property_id=? AND floor_name=?").get(u.organizationId, propertyId, floorName).n) : 0 });
});
app.delete("/api/electricity/readings/:id", auth, (req, res) => {
  const u = userFor(req), entry = db.prepare("SELECT id FROM meter_readings WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!entry) return res.status(404).json({ error: "Meter reading not found." });
  db.prepare("DELETE FROM meter_readings WHERE id=? AND organization_id=?").run(entry.id, u.organizationId);
  audit(u.organizationId, u.id, "electricity.reading.deleted", "meter_reading", entry.id);
  res.json({ ok: true, id: entry.id });
});
app.post("/api/payments", auth, (req, res) => {
  const b = req.body || {};
  const amount = Math.round(Number(b.amount));
  if (!required(b, ["resident"]) || !Number.isFinite(amount) || amount < 1) return res.status(400).json({ error: "Select a resident and enter a payment amount." });
  const u = userFor(req), id = uid2(), residentId = val(b.residentId, 120), resident = (residentId ? db.prepare("SELECT * FROM residents WHERE organization_id=? AND id=?").get(u.organizationId, residentId) : void 0) || db.prepare("SELECT * FROM residents WHERE organization_id=? AND name=?").get(u.organizationId, val(b.resident));
  if (!resident) return res.status(404).json({ error: "Resident not found." });
  let stayId = val(b.stayId, 120);
  let stayRecord = stayId ? db.prepare("SELECT id,property FROM resident_stays WHERE id=? AND resident_id=? AND organization_id=?").get(stayId, resident.id, u.organizationId) : void 0;
  if (stayId && !stayRecord) return res.status(404).json({ error: "Day Pass booking not found for this resident." });
  if (!stayId && resident.stay_type === "Day Pass") {
    stayRecord = db.prepare("SELECT id,property FROM resident_stays WHERE resident_id=? AND organization_id=? ORDER BY created_at DESC,id DESC LIMIT 1").get(resident.id, u.organizationId);
    stayId = stayRecord?.id || "";
  }
  const date = val(b.date) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), purposeBase = val(b.purpose) || "Monthly rent", purpose = purposeBase === "Other" && val(b.otherDetails) ? "Other \xB7 " + val(b.otherDetails) : purposeBase, isMonthlyRent = /rent/i.test(purpose) && !/day pass/i.test(purpose);
  let billingPeriod = val(b.billingPeriod, 7);
  if (isMonthlyRent && !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingPeriod)) {
    const purposeMonth = purpose.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i), paidDate = new Date(date);
    billingPeriod = purposeMonth ? purposeMonth[2] + "-" + String((/* @__PURE__ */ new Date(purposeMonth[1] + " 1, " + purposeMonth[2])).getMonth() + 1).padStart(2, "0") : !Number.isNaN(paidDate.getTime()) ? paidDate.getFullYear() + "-" + String(paidDate.getMonth() + 1).padStart(2, "0") : "";
  }
  if (isMonthlyRent && !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingPeriod)) return res.status(400).json({ error: "Choose a valid rent billing month." });
  const row = { id, resident: resident.name, residentId: resident.id, stayId, property: stayRecord?.property || resident.property, amount, date, method: val(b.method) || "UPI", purpose, status: "Paid", billingPeriod: isMonthlyRent ? billingPeriod : "" };
  db.prepare("INSERT INTO payments (id,organization_id,resident_id,stay_id,resident,property,amount,date,method,purpose,status,created_at,billing_period) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, u.organizationId, row.residentId, row.stayId || "", row.resident, row.property, row.amount, row.date, row.method, row.purpose, row.status, nowIso2(), row.billingPeriod);
  db.prepare("INSERT INTO activities VALUES (?, ?, ?, ?, ?, ?)").run(uid2(), u.organizationId, "Rent payment received", new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount) + " from " + resident.name, "payment", nowIso2());
  audit(u.organizationId, u.id, "payment.created", "payment", id);
  res.status(201).json(row);
});
app.patch("/api/payments/:id", auth, (req, res) => {
  const u = userFor(req), entry = db.prepare("SELECT * FROM payments WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!entry) return res.status(404).json({ error: "Payment entry not found." });
  const b = req.body || {}, amount = Math.round(Number(b.amount)), date = val(b.date, 10), method = val(b.method, 80), purposeInput = val(b.purpose, 120), purpose = purposeInput === "Other" ? "Other \xB7 " + val(b.otherDetails, 160) : purposeInput, status = val(b.status, 20) || entry.status, billingPeriodInput = val(b.billingPeriod, 7), billingPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(billingPeriodInput) ? billingPeriodInput : entry.billing_period || "";
  if (!Number.isFinite(amount) || amount < 1) return res.status(400).json({ error: "Enter a valid payment amount." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return res.status(400).json({ error: "Choose a valid payment date." });
  if (!method || !purposeInput || purposeInput === "Other" && purpose === "Other \xB7 ") return res.status(400).json({ error: "Choose a payment method and payment type." });
  if (!["Paid", "Pending", "Partial", "Overdue"].includes(status)) return res.status(400).json({ error: "Choose a valid payment status." });
  if (/rent/i.test(purpose) && !/day pass/i.test(purpose) && !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingPeriod)) return res.status(400).json({ error: "Choose a valid billing month for rent." });
  db.prepare("UPDATE payments SET amount=?,date=?,method=?,purpose=?,status=?,billing_period=? WHERE id=? AND organization_id=?").run(amount, date, method, purpose, status, billingPeriod, entry.id, u.organizationId);
  audit(u.organizationId, u.id, "payment.updated", "payment", entry.id);
  res.json({ ok: true, id: entry.id });
});
app.delete("/api/payments/:id", auth, (req, res) => {
  const u = userFor(req), entry = db.prepare("SELECT id,purpose,resident_id as residentId,stay_id as stayId,billing_period as billingPeriod,date FROM payments WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!entry) return res.status(404).json({ error: "Payment entry not found." });
  const isRent = /rent|day pass/i.test(entry.purpose || "") && !/^other\s*·/i.test(entry.purpose || ""), isMonthlyRent = isRent && !/day pass/i.test(entry.purpose || "");
  const paymentPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(entry.billingPeriod || "") ? entry.billingPeriod : (() => {
    const d = dateOnly(entry.date);
    return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "";
  })();
  const remove = db.transaction(() => {
    db.prepare("DELETE FROM payments WHERE id=? AND organization_id=?").run(entry.id, u.organizationId);
    if (isMonthlyRent && entry.residentId && paymentPeriod) {
      const resident = db.prepare("SELECT rent,rent_paid_through_period as paidThroughPeriod FROM residents WHERE id=? AND organization_id=?").get(entry.residentId, u.organizationId);
      if (resident?.paidThroughPeriod && paymentPeriod <= resident.paidThroughPeriod) {
        const remaining = db.prepare("SELECT COALESCE(SUM(amount),0) as amount FROM payments WHERE organization_id=? AND resident_id=? AND status='Paid' AND billing_period=? AND purpose LIKE '%rent%' AND purpose NOT LIKE '%day pass%' AND purpose NOT LIKE '%electric%' AND purpose NOT LIKE '%security%' AND purpose NOT LIKE '%deposit%'").get(u.organizationId, entry.residentId, paymentPeriod);
        if (Number(remaining?.amount || 0) < Number(resident.rent || 0)) {
          const [year2, month2] = paymentPeriod.split("-").map(Number), previous = new Date(year2, month2 - 2, 1), previousPeriod = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
          db.prepare("UPDATE residents SET rent_paid_through_period=? WHERE id=? AND organization_id=?").run(previousPeriod, entry.residentId, u.organizationId);
        }
      }
    }
    if (entry.stayId) {
      const stay = db.prepare("SELECT id,per_day_rent as perDayRent,rent,move_in_date as moveIn,check_out_date as checkOutDate FROM resident_stays WHERE id=? AND organization_id=?").get(entry.stayId, u.organizationId);
      if (stay) {
        const from = dateOnly(stay.moveIn), to = dateOnly(stay.checkOutDate), days = from && to && to >= from ? Math.floor((to.getTime() - from.getTime()) / 864e5) + 1 : 0, total = Math.max(0, Math.round(Number(stay.perDayRent || stay.rent || 0) * days)), paid = Number(db.prepare("SELECT COALESCE(SUM(amount),0) as amount FROM payments WHERE organization_id=? AND resident_id=? AND stay_id=? AND purpose LIKE '%day pass%' AND status='Paid'").get(u.organizationId, entry.residentId, entry.stayId)?.amount || 0);
        db.prepare("UPDATE resident_stays SET status=? WHERE id=? AND organization_id=?").run(paid >= total ? "Paid" : paid > 0 ? "Partial" : "Pending", entry.stayId, u.organizationId);
      }
    }
  });
  remove();
  audit(u.organizationId, u.id, "payment.deleted", "payment", entry.id);
  res.json({ ok: true, id: entry.id });
});
app.post("/api/electricity/cycles", auth, (req, res) => {
  const b = req.body || {}, u = userFor(req), propertyId = val(b.propertyId, 100), year2 = Math.round(Number(b.year)), month2 = Math.round(Number(b.month)), rate = Number(b.rate);
  if (!Number.isInteger(year2) || year2 < 2e3 || year2 > 2200 || !Number.isInteger(month2) || month2 < 1 || month2 > 12 || !Number.isFinite(rate) || rate <= 0) return res.status(400).json({ error: "Choose a valid billing period and a positive rate per unit." });
  if (!db.prepare("SELECT id FROM properties WHERE id=? AND organization_id=?").get(propertyId, u.organizationId)) return res.status(404).json({ error: "Property not found." });
  const existing = db.prepare("SELECT id,status FROM electricity_cycles WHERE organization_id=? AND property_id=? AND period_year=? AND period_month=?").get(u.organizationId, propertyId, year2, month2);
  if (existing?.status === "Finalized") return res.status(409).json({ error: "Unlock this finalized cycle before changing its rate." });
  const now = nowIso2();
  if (existing) {
    db.prepare("UPDATE electricity_cycles SET rate=?,updated_at=? WHERE id=? AND organization_id=?").run(rate, now, existing.id, u.organizationId);
    audit(u.organizationId, u.id, "electricity_cycle.rate_updated", "electricity_cycle", existing.id);
    return res.json({ id: existing.id, propertyId, year: year2, month: month2, rate, status: "Draft" });
  }
  const id = uid2();
  db.prepare("INSERT INTO electricity_cycles (id,organization_id,property_id,period_year,period_month,rate,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'Draft',?,?)").run(id, u.organizationId, propertyId, year2, month2, rate, now, now);
  audit(u.organizationId, u.id, "electricity_cycle.created", "electricity_cycle", id);
  res.status(201).json({ id, propertyId, year: year2, month: month2, rate, status: "Draft" });
});
app.post("/api/electricity/cycles/:id/finalize", auth, (req, res) => {
  const u = userFor(req), cycle = db.prepare("SELECT id,property_id as propertyId,status FROM electricity_cycles WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!cycle) return res.status(404).json({ error: "Billing cycle not found." });
  if (cycle.status === "Finalized") return res.status(409).json({ error: "This cycle is already finalized." });
  const bills = Array.isArray(req.body?.bills) ? req.body.bills : [];
  if (!bills.length) return res.status(400).json({ error: "There are no guest bills to finalize." });
  for (const b of bills) {
    const amount = Number(b.amount), units = Number(b.totalUnits), roomUnits = Number(b.roomUnits), commonUnits = Number(b.commonUnits), days = Math.round(Number(b.stayDays));
    if (!b.residentId || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(units) || units < 0 || !Number.isFinite(roomUnits) || roomUnits < 0 || !Number.isFinite(commonUnits) || commonUnits < 0 || days < 1) return res.status(400).json({ error: "Guest bill data contains missing or invalid values." });
    if (!db.prepare("SELECT id FROM residents WHERE id=? AND organization_id=? AND (property_id=? OR (property_id IS NULL AND property=?))").get(val(b.residentId, 100), u.organizationId, cycle.propertyId, db.prepare("SELECT name FROM properties WHERE id=? AND organization_id=?").get(cycle.propertyId, u.organizationId)?.name || "")) return res.status(400).json({ error: "A bill includes a guest who is not assigned to this property." });
  }
  try {
    const now = nowIso2();
    const save = db.transaction(() => {
      const oldBills = db.prepare("SELECT id,organization_id as organizationId,cycle_id as cycleId,resident_id as residentId,resident_name as residentName,room,stay_days as stayDays,room_units as roomUnits,common_units as commonUnits,total_units as totalUnits,rate,amount,paid_amount as paidAmount,waived_amount as waivedAmount,status,audit_json as auditJson,created_at as createdAt FROM electricity_bills WHERE cycle_id=? AND organization_id=?").all(cycle.id, u.organizationId);
      if (oldBills.length) {
        const payments = db.prepare("SELECT id,bill_id as billId,resident_id as residentId,amount,paid_date as paidDate,method,created_at as createdAt FROM electricity_payments WHERE cycle_id=? AND organization_id=? ORDER BY paid_date,id").all(cycle.id, u.organizationId);
        const revision = Number(db.prepare("SELECT COALESCE(MAX(revision),0)+1 as next FROM electricity_bill_revisions WHERE cycle_id=?").get(cycle.id).next);
        db.prepare("INSERT INTO electricity_bill_revisions (id,organization_id,cycle_id,revision,snapshot_json,created_at) VALUES (?,?,?,?,?,?)").run(uid2(), u.organizationId, cycle.id, revision, JSON.stringify({ bills: oldBills, payments }), now);
        const incoming = new Set(bills.map((b) => String(b.residentId)));
        for (const old of oldBills) {
          if (incoming.has(String(old.residentId))) continue;
          const hasPayments = payments.some((p) => p.billId === old.id);
          if (!hasPayments && Number(old.waivedAmount || 0) <= 0) db.prepare("DELETE FROM electricity_bills WHERE id=? AND organization_id=?").run(old.id, u.organizationId);
        }
      }
      const insert = db.prepare("INSERT INTO electricity_bills (id,organization_id,cycle_id,resident_id,resident_name,room,stay_days,room_units,common_units,total_units,rate,amount,paid_amount,status,audit_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,'Unpaid',?,?) ON CONFLICT(cycle_id,resident_id) DO UPDATE SET resident_name=excluded.resident_name,room=excluded.room,stay_days=excluded.stay_days,room_units=excluded.room_units,common_units=excluded.common_units,total_units=excluded.total_units,rate=excluded.rate,amount=excluded.amount,status=CASE WHEN electricity_bills.paid_amount+electricity_bills.waived_amount>=excluded.amount-0.001 THEN CASE WHEN electricity_bills.waived_amount>0 THEN 'Waived' ELSE 'Paid' END WHEN electricity_bills.waived_amount>0 THEN 'Partially waived' WHEN electricity_bills.paid_amount>0 THEN 'Partially paid' ELSE 'Unpaid' END,audit_json=excluded.audit_json");
      for (const b of bills) insert.run(uid2(), u.organizationId, cycle.id, val(b.residentId, 100), val(b.name, 120), val(b.room, 200), Math.round(Number(b.stayDays)), Number(b.roomUnits), Number(b.commonUnits), Number(b.totalUnits), Number(b.rate), Number(b.amount), JSON.stringify(b.audit || {}), now);
      db.prepare("UPDATE electricity_cycles SET status='Finalized',finalized_at=?,updated_at=? WHERE id=? AND organization_id=?").run(now, now, cycle.id, u.organizationId);
    });
    save();
    audit(u.organizationId, u.id, "electricity_cycle.finalized", "electricity_cycle", cycle.id);
    res.json({ ok: true, cycleId: cycle.id, bills: bills.length });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Could not finalize electricity bills." });
  }
});
app.post("/api/electricity/cycles/:id/unlock", auth, (req, res) => {
  const u = userFor(req), result = db.prepare("UPDATE electricity_cycles SET status='Draft',finalized_at='',updated_at=? WHERE id=? AND organization_id=? AND status='Finalized'").run(nowIso2(), req.params.id, u.organizationId);
  if (!result.changes) return res.status(404).json({ error: "Finalized billing cycle not found." });
  audit(u.organizationId, u.id, "electricity_cycle.unlocked", "electricity_cycle", req.params.id);
  res.json({ ok: true, id: req.params.id, status: "Draft" });
});
app.delete("/api/electricity/bills/:id/payments/:paymentId", auth, (req, res) => {
  const u = userFor(req), payment = db.prepare("SELECT id,bill_id as billId,cycle_id as cycleId FROM electricity_payments WHERE id=? AND bill_id=? AND organization_id=?").get(req.params.paymentId, req.params.id, u.organizationId);
  if (!payment) return res.status(404).json({ error: "Electricity payment not found." });
  const save = db.transaction(() => {
    db.prepare("DELETE FROM electricity_payments WHERE id=? AND organization_id=?").run(payment.id, u.organizationId);
    const paidAmount2 = Number(db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM electricity_payments WHERE bill_id=? AND organization_id=?").get(payment.billId, u.organizationId).total || 0);
    const bill = db.prepare("SELECT amount,waived_amount as waivedAmount FROM electricity_bills WHERE id=? AND organization_id=?").get(payment.billId, u.organizationId);
    if (bill) {
      const status = paidAmount2 + bill.waivedAmount >= bill.amount - 1e-3 ? bill.waivedAmount > 0 ? "Waived" : "Paid" : bill.waivedAmount > 0 ? "Partially waived" : paidAmount2 > 0 ? "Partially paid" : "Unpaid";
      db.prepare("UPDATE electricity_bills SET paid_amount=?,status=? WHERE id=? AND organization_id=?").run(paidAmount2, status, payment.billId, u.organizationId);
    }
    return paidAmount2;
  });
  const paidAmount = save();
  audit(u.organizationId, u.id, "electricity_bill.payment_deleted", "electricity_bill", payment.billId);
  res.json({ ok: true, billId: payment.billId, paidAmount });
});
app.post("/api/electricity/bills/:id/payments", auth, (req, res) => {
  const u = userFor(req), bill = db.prepare("SELECT b.id,b.cycle_id as cycleId,b.resident_id as residentId,b.amount,b.paid_amount as paidAmount,b.waived_amount as waivedAmount,c.status as cycleStatus FROM electricity_bills b JOIN electricity_cycles c ON c.id=b.cycle_id WHERE b.id=? AND b.organization_id=?").get(req.params.id, u.organizationId);
  if (!bill) return res.status(404).json({ error: "Electricity bill not found." });
  if (bill.cycleStatus !== "Finalized") return res.status(409).json({ error: "Finalize this billing cycle before recording a bill payment." });
  const amount = Math.round(Number(req.body?.amount) * 100) / 100, date = val(req.body?.paidDate, 10), method = val(req.body?.method, 40) || "UPI", remaining = Math.round((bill.amount - bill.paidAmount - bill.waivedAmount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Enter a positive payment amount." });
  if (method === "Waiver" && amount > remaining + 1e-3) return res.status(400).json({ error: "Waiver amount cannot exceed the remaining bill balance." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return res.status(400).json({ error: "Choose a valid date." });
  const waived = method === "Waiver", paidAmount = Math.round((bill.paidAmount + (waived ? 0 : amount)) * 100) / 100, waivedAmount = Math.round((bill.waivedAmount + (waived ? amount : 0)) * 100) / 100, status = paidAmount + waivedAmount >= bill.amount - 1e-3 ? waivedAmount > 0 ? "Waived" : "Paid" : waivedAmount > 0 ? "Partially waived" : paidAmount > 0 ? "Partially paid" : "Unpaid";
  if (waived) {
    db.prepare("UPDATE electricity_bills SET waived_amount=?,status=? WHERE id=? AND organization_id=?").run(waivedAmount, status, bill.id, u.organizationId);
    audit(u.organizationId, u.id, "electricity_bill.balance_waived", "electricity_bill", `${bill.id} \xB7 \u20B9${amount.toFixed(2)} \xB7 ${date}`);
    return res.json({ ok: true, billId: bill.id, amount, paidAmount, waivedAmount, remaining: Math.max(0, bill.amount - paidAmount - waivedAmount), status });
  }
  const id = uid2(), save = db.transaction(() => {
    db.prepare("INSERT INTO electricity_payments (id,organization_id,cycle_id,bill_id,resident_id,amount,paid_date,method,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id, u.organizationId, bill.cycleId, bill.id, bill.residentId, amount, date, method, nowIso2());
    db.prepare("UPDATE electricity_bills SET paid_amount=?,status=? WHERE id=? AND organization_id=?").run(paidAmount, status, bill.id, u.organizationId);
  });
  save();
  audit(u.organizationId, u.id, "electricity_bill.payment_recorded", "electricity_bill", bill.id);
  res.status(201).json({ id, billId: bill.id, amount, paidDate: date, paidAmount, waivedAmount, status });
});
app.post("/api/foods", auth, (req, res) => {
  const b = req.body || {}, name = val(b.name, 100), category = val(b.category, 50) || "Meals", price = Number(b.price);
  if (!name || !Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Enter a food name and valid non-negative rate." });
  const u = userFor(req), id = uid2(), now = nowIso2();
  try {
    db.prepare("INSERT INTO food_items (id,organization_id,name,category,price,active,is_system,created_at,updated_at) VALUES (?,?,?,?,?,1,0,?,?)").run(id, u.organizationId, name, category, price, now, now);
    audit(u.organizationId, u.id, "food_item.created", "food_item", id);
    res.status(201).json({ id, name, category, price, active: 1, isSystem: 0 });
  } catch (e) {
    res.status(e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? 409 : 500).json({ error: e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? "A food item with this name already exists." : "Could not save the food item." });
  }
});
app.patch("/api/foods/:id", auth, (req, res) => {
  const b = req.body || {}, name = val(b.name, 100), category = val(b.category, 50) || "Meals", price = Number(b.price), active = b.active === void 0 ? 1 : b.active ? 1 : 0, u = userFor(req);
  if (!name || !Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Enter a food name and valid non-negative rate." });
  const row = db.prepare("SELECT id FROM food_items WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!row) return res.status(404).json({ error: "Food item not found." });
  try {
    db.prepare("UPDATE food_items SET name=?,category=?,price=?,active=?,updated_at=? WHERE id=? AND organization_id=?").run(name, category, price, active, nowIso2(), req.params.id, u.organizationId);
    audit(u.organizationId, u.id, "food_item.updated", "food_item", req.params.id);
    res.json({ ok: true, id: req.params.id });
  } catch (e) {
    res.status(e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? 409 : 500).json({ error: e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? "A food item with this name already exists." : "Could not update the food item." });
  }
});
app.delete("/api/foods/:id", auth, (req, res) => {
  const u = userFor(req), row = db.prepare("SELECT id,is_system as isSystem FROM food_items WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!row) return res.status(404).json({ error: "Food item not found." });
  if (row.isSystem) db.prepare("UPDATE food_items SET active=0,updated_at=? WHERE id=? AND organization_id=?").run(nowIso2(), req.params.id, u.organizationId);
  else db.prepare("DELETE FROM food_items WHERE id=? AND organization_id=?").run(req.params.id, u.organizationId);
  audit(u.organizationId, u.id, "food_item.deleted", "food_item", req.params.id);
  res.json({ ok: true, id: req.params.id });
});
app.post("/api/food-bills", auth, (req, res) => {
  const b = req.body || {}, u = userFor(req), residentId = val(b.residentId, 100), billDate = val(b.billDate, 10), items = Array.isArray(b.items) ? b.items : [];
  if (!residentId || !/^\d{4}-\d{2}-\d{2}$/.test(billDate) || !items.length) return res.status(400).json({ error: "Select a resident, bill date, and at least one food item." });
  const resident = db.prepare("SELECT id,name,property,room,phone,occupancy_status as occupancyStatus FROM residents WHERE id=? AND organization_id=?").get(residentId, u.organizationId);
  if (!resident) return res.status(404).json({ error: "Resident not found in this workspace." });
  let lines = [];
  try {
    for (const item of items) {
      const id2 = val(item?.id, 100), quantity = Math.floor(Number(item?.quantity)), food = db.prepare("SELECT id,name,category,price FROM food_items WHERE id=? AND organization_id=? AND active=1").get(id2, u.organizationId);
      if (!food || !Number.isFinite(quantity) || quantity < 1 || quantity > 500) throw new Error("Select available menu items and enter quantities from 1 to 500.");
      lines.push({ id: food.id, name: food.name, category: food.category, quantity, rate: Number(food.price), amount: Math.round(Number(food.price) * quantity * 100) / 100 });
    }
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid food selection." });
  }
  const amount = Math.round(lines.reduce((n, item) => n + item.amount, 0) * 100) / 100, id = uid2(), now = nowIso2();
  db.prepare("INSERT INTO food_bills (id,organization_id,resident_id,resident_name,property,room,items_json,amount,bill_date,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id, u.organizationId, resident.id, resident.name, resident.property, resident.room, JSON.stringify(lines), amount, billDate, "Pending", now);
  audit(u.organizationId, u.id, "food_bill.created", "food_bill", id);
  res.status(201).json({ id, residentId: resident.id, residentName: resident.name, phone: resident.phone, property: resident.property, room: resident.room, items: lines, amount, billDate, status: "Pending" });
});
app.delete("/api/food-bills/:id", auth, (req, res) => {
  const u = userFor(req), row = db.prepare("SELECT id FROM food_bills WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!row) return res.status(404).json({ error: "Food bill not found." });
  db.prepare("DELETE FROM food_bills WHERE id=? AND organization_id=?").run(req.params.id, u.organizationId);
  audit(u.organizationId, u.id, "food_bill.deleted", "food_bill", req.params.id);
  res.json({ ok: true, id: req.params.id });
});
app.post("/api/expenses", auth, (req, res) => {
  const b = req.body || {};
  const amount = Math.round(Number(b.amount));
  if (!required(b, ["description", "category", "property"]) || !Number.isFinite(amount) || amount < 1) return res.status(400).json({ error: "Enter an expense, category, property, and valid amount." });
  const u = userFor(req), id = uid2();
  const row = { id, property: val(b.property), description: val(b.description), category: val(b.category), amount, vendor: val(b.vendor), date: val(b.date) || (/* @__PURE__ */ new Date()).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }), notes: val(b.notes) };
  db.prepare("INSERT INTO expenses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, u.organizationId, row.property, row.description, row.category, row.amount, row.vendor, row.date, row.notes, nowIso2());
  audit(u.organizationId, u.id, "expense.created", "expense", id);
  res.status(201).json(row);
});
app.patch("/api/expenses/:id", auth, (req, res) => {
  const b = req.body || {}, amount = Math.round(Number(b.amount));
  if (!required(b, ["description", "category", "property"]) || !Number.isFinite(amount) || amount < 1) return res.status(400).json({ error: "Enter an expense, category, property, and valid amount." });
  const u = userFor(req), existing = db.prepare("SELECT id,date FROM expenses WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!existing) return res.status(404).json({ error: "Expense not found." });
  const row = { property: val(b.property), description: val(b.description), category: val(b.category), amount, vendor: val(b.vendor), date: val(b.date) || existing.date, notes: val(b.notes) };
  db.prepare("UPDATE expenses SET property=?,description=?,category=?,amount=?,vendor=?,date=?,notes=? WHERE id=? AND organization_id=?").run(row.property, row.description, row.category, row.amount, row.vendor, row.date, row.notes, req.params.id, u.organizationId);
  audit(u.organizationId, u.id, "expense.updated", "expense", req.params.id);
  res.json({ ok: true, id: req.params.id });
});
app.delete("/api/expenses/:id", auth, (req, res) => {
  const u = userFor(req), existing = db.prepare("SELECT id FROM expenses WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!existing) return res.status(404).json({ error: "Expense not found." });
  db.prepare("DELETE FROM expenses WHERE id=? AND organization_id=?").run(req.params.id, u.organizationId);
  audit(u.organizationId, u.id, "expense.deleted", "expense", req.params.id);
  res.json({ ok: true, id: req.params.id });
});
app.post("/api/enquiries", auth, (req, res) => {
  const b = req.body || {};
  if (!required(b, ["name", "phone", "property"])) return res.status(400).json({ error: "Enter the enquiry name, phone, and property." });
  const u = userFor(req), id = uid2(), property = val(b.property), assignedRoom = val(b.assignedRoom, 150), propertyRow = db.prepare("SELECT id FROM properties WHERE organization_id=? AND name=?").get(u.organizationId, property);
  if (!propertyRow) return res.status(404).json({ error: "Choose a property in your workspace." });
  if (assignedRoom) {
    const roomIssue = validateResidentRoom(u.organizationId, propertyRow.id, assignedRoom);
    if (roomIssue) return res.status(roomIssue.status).json({ error: roomIssue.message });
  }
  const row = { id, name: val(b.name), phone: val(b.phone), property, room: val(b.room) || "Double sharing", assignedRoom, budget: Math.round(Number(b.budget) || 0), moveIn: val(b.date), source: val(b.source) || "Website", stage: "New enquiry" };
  db.prepare("INSERT INTO enquiries (id,organization_id,name,phone,property,room,budget,move_in,source,stage,created_at,assigned_room) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, u.organizationId, row.name, row.phone, row.property, row.room, row.budget, row.moveIn, row.source, row.stage, nowIso2(), row.assignedRoom);
  audit(u.organizationId, u.id, "enquiry.created", "enquiry", id);
  res.status(201).json(row);
});
app.patch("/api/enquiries/:id", auth, (req, res) => {
  const stage = val(req.body?.stage);
  if (!["New enquiry", "Contacted", "Visit scheduled", "Booking confirmed", "Checked in", "Lost"].includes(stage)) return res.status(400).json({ error: "Choose a valid enquiry stage." });
  const u = userFor(req), enquiry = db.prepare("SELECT id,property,stage,assigned_room as assignedRoom FROM enquiries WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!enquiry) return res.status(404).json({ error: "Enquiry not found." });
  if (["Booking confirmed", "Checked in"].includes(stage) && !["Booking confirmed", "Checked in"].includes(enquiry.stage) && enquiry.assignedRoom) {
    const property = db.prepare("SELECT id FROM properties WHERE organization_id=? AND name=?").get(u.organizationId, enquiry.property);
    if (!property) return res.status(404).json({ error: "Booking property not found." });
    const roomIssue = validateResidentRoom(u.organizationId, property.id, enquiry.assignedRoom);
    if (roomIssue) return res.status(roomIssue.status).json({ error: roomIssue.message });
  }
  db.prepare("UPDATE enquiries SET stage=? WHERE id=? AND organization_id=?").run(stage, enquiry.id, u.organizationId);
  audit(u.organizationId, u.id, "enquiry.updated", "enquiry", enquiry.id);
  res.json({ ok: true });
});
app.patch("/api/properties/:id", auth, (req, res) => {
  const b = req.body || {}, u = userFor(req), name = val(b.name, 180), address = val(b.address, 300);
  if (!name || !address) return res.status(400).json({ error: "Enter the property name and address." });
  const property = db.prepare("SELECT id,name FROM properties WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!property) return res.status(404).json({ error: "Property not found." });
  try {
    const update = db.transaction(() => {
      db.prepare("UPDATE properties SET name=?,address=?,type=?,beds=?,rooms_count=?,floor_name=? WHERE id=? AND organization_id=?").run(name, address, val(b.type, 60) || "PG / Co-living", Math.max(0, Math.round(Number(b.beds) || 0)), Math.max(0, Math.round(Number(b.rooms) || 0)), val(b.floorName, 100), property.id, u.organizationId);
      if (name !== property.name) {
        for (const table of ["residents", "payments", "expenses", "enquiries", "maintenance_requests", "assets", "messages"]) db.prepare(`UPDATE ${table} SET property=? WHERE organization_id=? AND property=?`).run(name, u.organizationId, property.name);
      }
    });
    update();
    audit(u.organizationId, u.id, "property.updated", "property", property.id);
    res.json({ ok: true, id: property.id });
  } catch (e) {
    res.status(e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? 409 : 500).json({ error: "Could not update property details." });
  }
});
app.delete("/api/properties/:id", auth, (req, res) => {
  const u = userFor(req), property = db.prepare("SELECT id,name FROM properties WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!property) return res.status(404).json({ error: "Property not found." });
  const residentCount = db.prepare("SELECT COUNT(*) as n FROM residents WHERE organization_id=? AND property_id=?").get(u.organizationId, property.id).n;
  if (residentCount) return res.status(409).json({ error: "Move or remove this property\u2019s residents before deleting the property." });
  db.prepare("DELETE FROM properties WHERE id=? AND organization_id=?").run(property.id, u.organizationId);
  audit(u.organizationId, u.id, "property.deleted", "property", property.id);
  res.json({ ok: true, id: property.id });
});
app.post("/api/maintenance", auth, (req, res) => {
  const b = req.body || {}, u = userFor(req), property = val(b.property, 180), title = val(b.title, 180);
  if (!title || !property || !db.prepare("SELECT id FROM properties WHERE organization_id=? AND name=?").get(u.organizationId, property)) return res.status(400).json({ error: "Choose a property and enter a request title." });
  const id = uid2(), row = { id, property, room: val(b.room, 100), title, description: val(b.description, 1e3), category: val(b.category, 80) || "General", priority: ["Low", "Medium", "High", "Urgent"].includes(val(b.priority)) ? val(b.priority) : "Medium", status: "New", assignedTo: val(b.assignedTo, 100), createdAt: nowIso2() };
  db.prepare("INSERT INTO maintenance_requests (id,organization_id,property,room,title,description,category,priority,status,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, u.organizationId, row.property, row.room, row.title, row.description, row.category, row.priority, row.status, row.assignedTo, row.createdAt, row.createdAt);
  audit(u.organizationId, u.id, "maintenance.created", "maintenance", id);
  res.status(201).json(row);
});
app.patch("/api/maintenance/:id", auth, (req, res) => {
  const b = req.body || {}, u = userFor(req), title = val(b.title, 180), property = val(b.property, 180), status = val(b.status, 30);
  if (!title || !property || !["New", "In progress", "Resolved"].includes(status)) return res.status(400).json({ error: "Enter a title, property, and valid request status." });
  const current = db.prepare("SELECT id FROM maintenance_requests WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!current) return res.status(404).json({ error: "Maintenance request not found." });
  db.prepare("UPDATE maintenance_requests SET property=?,room=?,title=?,description=?,category=?,priority=?,status=?,assigned_to=?,updated_at=? WHERE id=? AND organization_id=?").run(property, val(b.room, 100), title, val(b.description, 1e3), val(b.category, 80) || "General", ["Low", "Medium", "High", "Urgent"].includes(val(b.priority)) ? val(b.priority) : "Medium", status, val(b.assignedTo, 100), nowIso2(), req.params.id, u.organizationId);
  audit(u.organizationId, u.id, "maintenance.updated", "maintenance", req.params.id);
  res.json({ ok: true, id: req.params.id });
});
app.delete("/api/maintenance/:id", auth, (req, res) => {
  const u = userFor(req), result = db.prepare("DELETE FROM maintenance_requests WHERE id=? AND organization_id=?").run(req.params.id, u.organizationId);
  if (!result.changes) return res.status(404).json({ error: "Maintenance request not found." });
  audit(u.organizationId, u.id, "maintenance.deleted", "maintenance", req.params.id);
  res.json({ ok: true, id: req.params.id });
});
app.post("/api/assets", auth, (req, res) => {
  const b = req.body || {}, u = userFor(req), name = val(b.name, 180), property = val(b.property, 180), quantity = Math.max(1, Math.round(Number(b.quantity) || 0)), unitValue = Math.round(Number(b.unitValue) || 0);
  if (!name || !property || !Number.isFinite(unitValue) || unitValue < 0) return res.status(400).json({ error: "Enter an asset name, property, and valid estimated value." });
  const id = uid2(), row = { id, property, name, category: val(b.category, 80) || "Other", quantity, unitValue, purchaseDate: val(b.purchaseDate, 10), condition: val(b.condition, 30) || "Good", notes: val(b.notes, 1e3) };
  db.prepare("INSERT INTO assets (id,organization_id,property,name,category,quantity,unit_value,purchase_date,condition,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, u.organizationId, row.property, row.name, row.category, row.quantity, row.unitValue, row.purchaseDate, row.condition, row.notes, nowIso2(), nowIso2());
  audit(u.organizationId, u.id, "asset.created", "asset", id);
  res.status(201).json(row);
});
app.patch("/api/assets/:id", auth, (req, res) => {
  const b = req.body || {}, u = userFor(req), name = val(b.name, 180), property = val(b.property, 180), quantity = Math.max(1, Math.round(Number(b.quantity) || 0)), unitValue = Math.round(Number(b.unitValue) || 0);
  if (!name || !property || !Number.isFinite(unitValue) || unitValue < 0) return res.status(400).json({ error: "Enter an asset name, property, and valid estimated value." });
  if (!db.prepare("SELECT id FROM assets WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId)) return res.status(404).json({ error: "Asset not found." });
  db.prepare("UPDATE assets SET property=?,name=?,category=?,quantity=?,unit_value=?,purchase_date=?,condition=?,notes=?,updated_at=? WHERE id=? AND organization_id=?").run(property, name, val(b.category, 80) || "Other", quantity, unitValue, val(b.purchaseDate, 10), val(b.condition, 30) || "Good", val(b.notes, 1e3), nowIso2(), req.params.id, u.organizationId);
  audit(u.organizationId, u.id, "asset.updated", "asset", req.params.id);
  res.json({ ok: true, id: req.params.id });
});
app.delete("/api/assets/:id", auth, (req, res) => {
  const u = userFor(req), result = db.prepare("DELETE FROM assets WHERE id=? AND organization_id=?").run(req.params.id, u.organizationId);
  if (!result.changes) return res.status(404).json({ error: "Asset not found." });
  audit(u.organizationId, u.id, "asset.deleted", "asset", req.params.id);
  res.json({ ok: true, id: req.params.id });
});
app.post("/api/resident-item-issues", auth, (req, res) => {
  const b = req.body || {}, u = userFor(req), residentId = val(b.residentId, 100), issueDate = val(b.issueDate, 10), condition = val(b.condition, 20), utensilsDescription = val(b.utensilsDescription, 1e3), allowed = ["Bedsheet", "Blanket", "Quilt", "Razai", "Pillow", "Pillow Cover", "Mattress Protector", "Towel"];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate) || !Number.isFinite(Date.parse(issueDate + "T00:00:00Z")) || !["New", "Previous"].includes(condition)) return res.status(400).json({ error: "Choose a valid issue date and item condition." });
  const resident = db.prepare("SELECT id,name,property_id as propertyId,property,room,occupancy_status as occupancyStatus FROM residents WHERE id=? AND organization_id=?").get(residentId, u.organizationId);
  if (!resident) return res.status(404).json({ error: "Select a resident from your workspace." });
  if (resident.occupancyStatus === "Exited") return res.status(400).json({ error: "Items can only be issued to a current resident." });
  const items = {};
  for (const item of allowed) {
    const count = Number(b.items?.[item] ?? 0);
    if (!Number.isInteger(count) || count < 0 || count > 999) return res.status(400).json({ error: "Enter a whole-number quantity from 0 to 999 for each item." });
    if (count) items[item] = count;
  }
  if (!Object.keys(items).length && !utensilsDescription) return res.status(400).json({ error: "Add at least one item quantity or utensils description." });
  const rawRoom = String(resident.room || "").trim(), bedMatch = rawRoom.match(/(?:·|\||,|-\s*)\s*Bed\s+([^·|,]+)/i), bed = bedMatch?.[1]?.trim() || "", room = rawRoom.replace(/\s*(?:·|\||,|-\s*)\s*Bed\s+[^·|,]+/i, "").replace(/^Room\s+/i, "").trim(), id = uid2(), createdAt = nowIso2();
  db.prepare("INSERT INTO resident_item_issues (id,organization_id,resident_id,resident_name,property,room,bed,issue_date,items_json,utensils_description,condition,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, u.organizationId, resident.id, resident.name, resident.property, room, bed, issueDate, JSON.stringify(items), utensilsDescription, condition, createdAt);
  audit(u.organizationId, u.id, "resident.items.issued", "resident_item_issue", id);
  res.status(201).json({ id, residentId: resident.id, residentName: resident.name, property: resident.property, room, bed, issueDate, items, utensilsDescription, condition, createdAt });
});
var ensureMessageDefaults = (organizationId) => {
  const insert = db.prepare("INSERT OR IGNORE INTO message_templates (id,organization_id,template_key,name,category,body,default_body,default_channel,active,is_system,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'WhatsApp',1,1,?,?)");
  const update = db.prepare("UPDATE message_templates SET default_body=?,body=CASE WHEN body=default_body THEN ? ELSE body END,category=?,name=?,updated_at=? WHERE organization_id=? AND template_key=?");
  const at = nowIso2();
  for (const t of DEFAULT_MESSAGE_TEMPLATES) {
    insert.run(uid2(), organizationId, t.templateKey, t.name, t.category, t.body, t.body, at, at);
    update.run(t.body, t.body, t.category, t.name, at, organizationId, t.templateKey);
  }
  db.prepare("INSERT OR IGNORE INTO message_settings (organization_id) VALUES (?)").run(organizationId);
  const rules = [["rent-before", "Rent reminder before due date", "rent_before", -3, "system-09"], ["rent-due", "Rent due date reminder", "rent_due", 0, "system-10"], ["rent-overdue", "Rent overdue reminder", "rent_overdue", 1, "system-11"], ["payment-received", "Payment received", "payment_received", 0, "system-12"], ["booking-confirmed", "Booking confirmed", "booking_confirmed", 0, "system-03"], ["checkin-reminder", "Upcoming check-in", "checkin_before", -1, "system-05"], ["welcome", "Welcome after check-in", "checkin_completed", 0, "system-06"], ["complaint-created", "Complaint received", "complaint_created", 0, "system-22"], ["complaint-resolved", "Complaint resolved", "complaint_resolved", 0, "system-24"], ["checkout-reminder", "Checkout reminder", "checkout_before", -7, "system-31"], ["checkout-thanks", "Thank you after checkout", "checkout_completed", 0, "system-36"]];
  const rule = db.prepare("INSERT OR IGNORE INTO message_automation_rules (id,organization_id,name,trigger_key,template_key,channel,offset_days,enabled,updated_at) VALUES (?,?,?,?,?,'WhatsApp',?,0,?)");
  for (const [key, name, trigger, offset, template] of rules) rule.run(uid2(), organizationId, name, trigger, template, offset, at);
};
var messageTemplateRows = (organizationId) => db.prepare("SELECT id,template_key as templateKey,name,category,body,default_body as defaultBody,default_channel as defaultChannel,active,is_system as isSystem,created_at as createdAt,updated_at as updatedAt FROM message_templates WHERE organization_id=? ORDER BY is_system DESC,category,name").all(organizationId);
app.get("/api/messages/templates", auth, (req, res) => {
  const u = userFor(req);
  ensureMessageDefaults(u.organizationId);
  res.json({ templates: messageTemplateRows(u.organizationId), settings: db.prepare("SELECT sender_name as senderName,signature,preferred_channel as preferredChannel,late_fee_enabled as lateFeeEnabled,late_fee_daily as lateFeeDaily,grace_period_days as gracePeriodDays,maximum_late_fee as maximumLateFee,default_reminder_days as defaultReminderDays,whatsapp_configured as whatsappConfigured,sms_configured as smsConfigured FROM message_settings WHERE organization_id=?").get(u.organizationId), automations: db.prepare("SELECT id,name,trigger_key as triggerKey,template_key as templateKey,channel,offset_days as offsetDays,enabled,updated_at as updatedAt FROM message_automation_rules WHERE organization_id=? ORDER BY name").all(u.organizationId), providers: ["WhatsApp", "SMS", "In-App"].map((channel) => messageProviderStatus(channel)) });
});
app.patch("/api/messages/templates/:id", ownerAuth, (req, res) => {
  const u = userFor(req), b = req.body || {}, old = db.prepare("SELECT * FROM message_templates WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!old) return res.status(404).json({ error: "Template not found." });
  const name = val(b.name, 120), body = val(b.body, 4e3), category = val(b.category, 100);
  if (!name || !body || !category) return res.status(400).json({ error: "Template name, category, and message are required." });
  db.prepare("UPDATE message_templates SET name=?,body=?,category=?,active=?,updated_at=? WHERE id=? AND organization_id=?").run(name, body, category, b.active === false ? 0 : 1, nowIso2(), old.id, u.organizationId);
  audit(u.organizationId, u.id, "message.template.updated", "message_template", old.id);
  res.json({ ok: true });
});
app.post("/api/messages/templates", ownerAuth, (req, res) => {
  const u = userFor(req), b = req.body || {}, name = val(b.name, 120), category = val(b.category, 100), body = val(b.body, 4e3);
  if (!name || !category || !body) return res.status(400).json({ error: "Enter a template name, category, and message." });
  const id = uid2(), at = nowIso2();
  db.prepare("INSERT INTO message_templates (id,organization_id,name,category,body,default_body,default_channel,active,is_system,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,0,?,?)").run(id, u.organizationId, name, category, body, "", val(b.defaultChannel, 30) || "WhatsApp", at, at);
  audit(u.organizationId, u.id, "message.template.created", "message_template", id);
  res.status(201).json({ id });
});
app.post("/api/messages/templates/:id/reset", ownerAuth, (req, res) => {
  const u = userFor(req), r = db.prepare("SELECT template_key FROM message_templates WHERE id=? AND organization_id=? AND is_system=1").get(req.params.id, u.organizationId);
  if (!r) return res.status(404).json({ error: "System template not found." });
  const t = DEFAULT_MESSAGE_TEMPLATES.find((x) => x.templateKey === r.template_key);
  if (!t) return res.status(404).json({ error: "Default template version is unavailable." });
  db.prepare("UPDATE message_templates SET name=?,category=?,body=?,default_body=?,active=1,updated_at=? WHERE id=? AND organization_id=?").run(t.name, t.category, t.body, t.body, nowIso2(), req.params.id, u.organizationId);
  audit(u.organizationId, u.id, "message.template.reset", "message_template", req.params.id);
  res.json({ ok: true });
});
app.put("/api/messages/settings", ownerAuth, (req, res) => {
  const u = userFor(req), b = req.body || {}, daily = Number(b.lateFeeDaily), grace = Math.max(0, Math.floor(Number(b.gracePeriodDays) || 0)), cap = b.maximumLateFee === "" || b.maximumLateFee == null ? null : Number(b.maximumLateFee), reminder = Math.max(0, Math.floor(Number(b.defaultReminderDays) || 0));
  if (!Number.isFinite(daily) || daily < 0 || cap !== null && (!Number.isFinite(cap) || cap < 0)) return res.status(400).json({ error: "Enter valid late fee and maximum fee amounts." });
  ensureMessageDefaults(u.organizationId);
  db.prepare("UPDATE message_settings SET sender_name=?,signature=?,preferred_channel=?,late_fee_enabled=?,late_fee_daily=?,grace_period_days=?,maximum_late_fee=?,default_reminder_days=? WHERE organization_id=?").run(val(b.senderName, 120), val(b.signature, 500), ["WhatsApp", "SMS", "In-App"].includes(b.preferredChannel) ? b.preferredChannel : "WhatsApp", b.lateFeeEnabled === false ? 0 : 1, daily, grace, cap, reminder, u.organizationId);
  audit(u.organizationId, u.id, "message.settings.updated", "message_settings", u.organizationId);
  res.json({ ok: true });
});
app.put("/api/messages/automations", ownerAuth, (req, res) => {
  const u = userFor(req), rows = Array.isArray(req.body?.rules) ? req.body.rules : [];
  for (const x of rows) {
    const rule = db.prepare("SELECT id FROM message_automation_rules WHERE id=? AND organization_id=?").get(val(x.id, 100), u.organizationId);
    if (!rule) continue;
    const enabled = x.enabled === true ? 1 : 0, channel = ["WhatsApp", "SMS", "In-App"].includes(x.channel) ? x.channel : "WhatsApp";
    if (enabled) return res.status(400).json({ error: "Automatic delivery is disabled until a real messaging provider is configured. You can save these rules as OFF." });
    db.prepare("UPDATE message_automation_rules SET template_key=?,channel=?,offset_days=?,enabled=0,updated_at=? WHERE id=? AND organization_id=?").run(val(x.templateKey, 100), channel, Math.round(Number(x.offsetDays) || 0), nowIso2(), x.id, u.organizationId);
  }
  audit(u.organizationId, u.id, "message.automations.updated", "message_automation_rules", u.organizationId);
  res.json({ ok: true });
});
var dateOnly = (v) => {
  const s = String(v || "");
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[\/ -](\d{1,2})[\/ -](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return Number.isNaN(+d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
var dateDisplay = (v) => {
  const d = dateOnly(v);
  return d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : String(v || "");
};
var templateValues = (resident, u, org, b) => {
  const payments = db.prepare("SELECT amount,date,purpose,status,invoice_no as invoiceNo FROM payments WHERE organization_id=? AND resident_id=? ORDER BY created_at DESC").all(org, resident.id), bill = db.prepare("SELECT amount,paid_amount as paidAmount,total_units as totalUnits,status,cycle_id as cycleId FROM electricity_bills WHERE organization_id=? AND resident_id=? ORDER BY created_at DESC LIMIT 1").get(org, resident.id), settings = db.prepare("SELECT * FROM message_settings WHERE organization_id=?").get(org), ownerSettings = db.prepare("SELECT owner_phone as ownerPhone FROM org_settings WHERE organization_id=?").get(org);
  const due = dateOnly(resident.due), today = dateOnly(/* @__PURE__ */ new Date()), targetMonth = (due || today)?.getMonth(), targetYear = (due || today)?.getFullYear(), rentPayments = payments.filter((p) => /rent/i.test(p.purpose || "") && !/electric|day pass|security|deposit/i.test(p.purpose || "")), paid = rentPayments.filter((p) => ["Paid", "Partial"].includes(p.status) && (() => {
    const d = dateOnly(p.date);
    return d && d.getMonth() === targetMonth && d.getFullYear() === targetYear;
  })()).reduce((n, p) => n + Number(p.amount || 0), 0), rent = Math.max(0, Number(resident.rent || 0)), outstanding = resident.status === "Paid" ? 0 : Math.max(0, rent - paid), elapsed = due && today ? Math.floor((+today - +due) / 864e5) : 0, lateDays = outstanding > 0 ? Math.max(0, elapsed - Number(settings?.grace_period_days || 0)) : 0;
  let lateFee = settings?.late_fee_enabled ? lateDays * Number(settings.late_fee_daily || 0) : 0;
  if (settings?.maximum_late_fee != null) lateFee = Math.min(lateFee, Number(settings.maximum_late_fee));
  const last = payments[0], values = { ResidentName: resident.name, PropertyName: resident.property, RoomNumber: String(resident.room || "").match(/Room\s*([^·-]+)/i)?.[1]?.trim() || resident.room || "", BedNumber: String(resident.room || "").match(/Bed\s*(.+)$/i)?.[1]?.trim() || "", CheckInDate: dateDisplay(resident.move_in_date || resident.joined || ""), CheckOutDate: dateDisplay(resident.check_out_date || ""), RentAmount: (resident.stay_type === "Day Pass" ? Number(resident.per_day_rent || rent) : rent) || "", DueDate: dateDisplay(resident.due || ""), LateFee: lateFee, LateDays: lateDays, TotalDue: outstanding + lateFee, Amount: last?.amount || "", PaymentDate: dateDisplay(last?.date || ""), ReceiptNumber: last?.invoiceNo || "", PaymentType: last?.purpose || "Monthly rent", ElectricityAmount: bill ? Math.max(0, Number(bill.amount) - Number(bill.paidAmount)) : 0, ElectricityUnits: bill?.totalUnits || "", DepositAmount: resident.security_deposit || 0, RefundAmount: b.refundAmount || "", ComplaintNumber: b.complaintNumber || "", ComplaintType: b.complaintType || "", ScheduledDate: dateDisplay(b.scheduledDate || ""), ScheduledTime: b.scheduledTime || "", OwnerName: u.name, ContactNumber: ownerSettings?.ownerPhone || "", CustomMessage: b.customMessage || "", NewRentAmount: b.newRentAmount || "", EffectiveDate: b.effectiveDate || "", DeductionAmount: b.deductionAmount || "" };
  for (const k of ["RentAmount", "LateFee", "TotalDue", "Amount", "ElectricityAmount", "DepositAmount", "RefundAmount", "NewRentAmount", "DeductionAmount"]) if (values[k] !== "" && Number.isFinite(Number(values[k]))) values[k] = Number(values[k]).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  for (const [k, v] of Object.entries(b.customValues || {})) values[k] = ["EffectiveDate", "PaymentDate", "ScheduledDate", "CheckInDate", "CheckOutDate", "DueDate"].includes(k) ? dateDisplay(v) : ["RentAmount", "LateFee", "TotalDue", "Amount", "ElectricityAmount", "DepositAmount", "RefundAmount", "NewRentAmount", "DeductionAmount"].includes(k) && Number.isFinite(Number(v)) ? Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : v;
  return values;
};
app.post("/api/messages/prepare", auth, (req, res) => {
  const u = userFor(req), b = req.body || {}, ids = [...new Set((Array.isArray(b.residentIds) ? b.residentIds : []).map((x) => val(x, 100)).filter(Boolean))], body = val(b.body, 4e3), channel = val(b.channel, 30) || "WhatsApp", scheduledAt = val(b.scheduledAt, 40), templateId = val(b.templateId, 100), category = val(b.category, 100);
  if (!ids.length || ids.length > 500 || !body) return res.status(400).json({ error: "Choose at least one resident and write a message." });
  if (!["WhatsApp", "SMS", "In-App"].includes(channel)) return res.status(400).json({ error: "Choose a supported message channel." });
  if (channel !== "WhatsApp") return res.status(409).json({ error: `${channel} is not configured. Configure a real provider before using this channel.` });
  const residents = db.prepare(`SELECT id,name,phone,property,room,rent,due,joined,status,security_deposit as securityDeposit,move_in_date as moveInDate,check_out_date as checkOutDate,stay_type as stayType,per_day_rent as perDayRent FROM residents WHERE organization_id=? AND occupancy_status!='Exited' AND id IN (${ids.map(() => "?").join(",")})`).all(u.organizationId, ...ids);
  if (residents.length !== ids.length) return res.status(400).json({ error: "One or more selected residents are unavailable in this workspace." });
  for (const r of residents) {
    const phoneDigits = String(r.phone || "").replace(/\D/g, "");
    if (!/^\+?[\d\s().-]{8,20}$/.test(r.phone || "") || phoneDigits.length < 10 || phoneDigits.length > 15) return res.status(400).json({ error: `A valid phone number is required for ${r.name} to use WhatsApp.` });
  }
  if (scheduledAt) {
    const d = new Date(scheduledAt);
    if (Number.isNaN(+d) || d <= /* @__PURE__ */ new Date()) return res.status(400).json({ error: "Choose a future schedule date and time." });
  }
  ensureMessageDefaults(u.organizationId);
  const template = db.prepare("SELECT id FROM message_templates WHERE id=? AND organization_id=?").get(templateId, u.organizationId), at = nowIso2(), batch = uid2(), insert = db.prepare("INSERT INTO messages (id,organization_id,resident_id,resident,property,phone,body,status,created_at,category,template_id,channel,scheduled_at,created_by,batch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"), created = [];
  const tx = db.transaction(() => {
    for (const r of residents) {
      const values = templateValues(r, u, u.organizationId, b), rendered = body.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_m, k) => values[k] === void 0 || values[k] === "" ? `{{${k}}}` : String(values[k]));
      const unresolved = [...rendered.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)].map((m) => m[1]);
      if (unresolved.length) throw new Error(`${r.name}: Fill or remove unresolved fields: ${[...new Set(unresolved)].join(", ")}.`);
      const id = uid2(), status = scheduledAt ? "Scheduled" : "Draft";
      insert.run(id, u.organizationId, r.id, r.name, r.property, r.phone, rendered, status, at, category, template?.id || "", channel, scheduledAt, u.id, batch);
      created.push({ id, residentId: r.id, resident: r.name, property: r.property, room: r.room, phone: r.phone, body: rendered, status, category, templateId: template?.id || "", channel, scheduledAt, createdAt: at });
    }
    audit(u.organizationId, u.id, residents.length > 1 ? "message.bulk.prepared" : "message.prepared", "message", batch);
  });
  try {
    tx();
    res.status(201).json({ messages: created, providerConfigured: false, notice: scheduledAt ? "Scheduled locally; automatic WhatsApp sending is unavailable until a provider is configured." : "Prepared for manual WhatsApp handoff; delivery is not tracked." });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not prepare these messages." });
  }
});
app.get("/api/messages/:id", auth, (req, res) => {
  const u = userFor(req), row = db.prepare("SELECT id,resident_id as residentId,resident,property,phone,body,status,created_at as createdAt,category,template_id as templateId,channel,scheduled_at as scheduledAt,sent_at as sentAt,failure_reason as failureReason,created_by as createdBy,batch_id as batchId FROM messages WHERE id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (!row) return res.status(404).json({ error: "Message not found." });
  res.json(row);
});
app.post("/api/messages/:id/cancel", auth, (req, res) => {
  const u = userFor(req), r = db.prepare("UPDATE messages SET status='Cancelled' WHERE id=? AND organization_id=? AND status='Scheduled'").run(req.params.id, u.organizationId);
  if (!r.changes) return res.status(409).json({ error: "Only a scheduled message can be cancelled." });
  audit(u.organizationId, u.id, "message.cancelled", "message", req.params.id);
  res.json({ ok: true });
});
app.post("/api/messages/:id/retry", auth, (req, res) => {
  const u = userFor(req), row = db.prepare("SELECT id FROM messages WHERE id=? AND organization_id=? AND status='Failed'").get(req.params.id, u.organizationId);
  if (!row) return res.status(409).json({ error: "Only a failed message can be retried." });
  res.json({ ok: true, notice: "No provider is configured. The existing failed record is available to copy or open in WhatsApp; no duplicate was created." });
});
app.post("/api/messages", auth, (req, res) => {
  const b = req.body || {}, u = userFor(req), resident = db.prepare("SELECT id,name,phone,property FROM residents WHERE id=? AND organization_id=?").get(val(b.residentId, 100), u.organizationId), body = val(b.body, 4e3);
  if (!resident || !body) return res.status(400).json({ error: "Choose a resident and write a message." });
  if (!canUseFeature(u.organizationId, "whatsapp_reminders")) return res.status(403).json({ error: "WhatsApp reminders are included in PRO and Business plans.", code: "PLAN_FEATURE_REQUIRED", feature: "whatsapp_reminders", upgradePlan: "PRO" });
  const id = uid2(), createdAt = nowIso2();
  db.prepare("INSERT INTO messages (id,organization_id,resident_id,resident,property,phone,body,status,created_at,category,channel,created_by) VALUES (?,?,?,?,?,?,?,'Draft',?,'Custom','WhatsApp',?)").run(id, u.organizationId, resident.id, resident.name, resident.property, resident.phone, body, createdAt, u.id);
  audit(u.organizationId, u.id, "message.prepared", "message", id);
  res.status(201).json({ id, residentId: resident.id, resident: resident.name, property: resident.property, phone: resident.phone, body, status: "Draft", createdAt });
});
app.delete("/api/admin/users/:id", ownerAuth, (req, res) => {
  const u = userFor(req);
  if (req.params.id === u.id) return res.status(400).json({ error: "You cannot remove your own owner account." });
  const result = db.prepare("DELETE FROM users WHERE id=? AND organization_id=? AND role IN ('manager','staff')").run(req.params.id, u.organizationId);
  if (!result.changes) return res.status(404).json({ error: "Team member account not found." });
  audit(u.organizationId, u.id, "admin.user.deleted", "user", req.params.id);
  res.json({ ok: true });
});
var publicLeadWindows = /* @__PURE__ */ new Map();
var slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "pg";
var publicListingSelect = `SELECT l.property_id as propertyId,l.slug,l.title,l.description,l.city,l.area,l.public_address as publicAddress,l.gender,l.amenities_json as amenitiesJson,l.house_rules as houseRules,l.photos_json as photosJson,l.monthly_rent as monthlyRent,l.security_deposit as securityDeposit,l.public_phone as publicPhone,l.featured,p.name as propertyName,p.type,p.beds,p.created_at as propertyCreatedAt FROM public_property_listings l JOIN properties p ON p.id=l.property_id`;
app.delete("/api/resident/portal/stay-requirements/:id", (req, res) => {
  const auth2 = residentPortalIdentity(req), phoneKey = String(auth2.phoneKey || "").replace(/\D/g, "");
  if (!phoneKey) return res.status(401).json({ error: "Resident sign-in is required." });
  const requirement = db.prepare("SELECT id,phone FROM resident_stay_requirements WHERE id=?").get(val(req.params.id, 100));
  if (!requirement || String(requirement.phone || "").replace(/\D/g, "") !== phoneKey) return res.status(404).json({ error: "Stay enquiry not found for this resident account." });
  db.prepare("DELETE FROM resident_stay_requirements WHERE id=?").run(requirement.id);
  res.json({ ok: true });
});
app.post("/api/public/stay-requirements", (req, res) => {
  const ip = String(req.ip || req.socket.remoteAddress || "unknown"), now = Date.now(), bucket = publicLeadWindows.get(ip);
  if (bucket && now - bucket.start < 6e4 && bucket.count >= 8) return res.status(429).json({ error: "Too many requests. Please try again in a minute." });
  if (!bucket || now - bucket.start >= 6e4) publicLeadWindows.set(ip, { start: now, count: 1 });
  else bucket.count++;
  const b = req.body || {}, name = val(b.name, 120), phone = val(b.phone, 30).replace(/[^+\d]/g, ""), area = val(b.area, 160), budget = Math.max(0, Number(b.budget) || 0);
  if (name.length < 2 || phone.replace(/\D/g, "").length < 10 || area.length < 2) return res.status(400).json({ error: "Enter your name, valid mobile number, and preferred area." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val(b.moveIn, 10))) return res.status(400).json({ error: "Choose a valid move-in date." });
  const id = uid2(), created = nowIso2(), phoneKey = phone.replace(/\D/g, "");
  db.prepare("INSERT OR IGNORE INTO resident_enquiry_accounts (phone_key,password_hash,created_at,updated_at) VALUES (?,?,?,?)").run(phoneKey, hash(phoneKey), created, created);
  db.prepare("INSERT INTO resident_stay_requirements (id,name,phone,email,area,budget,profession,gender,preference,move_in,duration,notes,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'OPEN',?,?)").run(id, name, phone, val(b.email, 180).toLowerCase(), area, budget, val(b.profession, 120), val(b.gender, 30), val(b.preference, 60), val(b.moveIn, 10), val(b.duration, 80), val(b.notes, 1e3), created, created);
  res.status(201).json({ id, message: "Your stay requirement has been shared with PG and hostel owners in your area. Sign in at /resident/login using your phone number as both username and initial password to see owner responses." });
});
app.post("/api/public/business-inquiries", (req, res) => {
  const ip = String(req.ip || req.socket.remoteAddress || "unknown"), now = Date.now(), bucket = publicLeadWindows.get(ip);
  if (bucket && now - bucket.start < 6e4 && bucket.count >= 8) return res.status(429).json({ error: "Too many requests. Please try again in a minute." });
  if (!bucket || now - bucket.start >= 6e4) publicLeadWindows.set(ip, { start: now, count: 1 });
  else bucket.count++;
  const b = req.body || {}, name = val(b.name, 120), email = val(b.email, 180).toLowerCase(), phone = val(b.phone, 30).replace(/[^+\d]/g, "");
  if (name.length < 2 || !email && !phone || email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone && phone.replace(/\D/g, "").length < 10) return res.status(400).json({ error: "Enter your name and a valid email or mobile number." });
  const id = uid2(), created = nowIso2();
  db.prepare("INSERT INTO owner_business_inquiries (id,name,email,phone,business_name,property_count,property_type,room_count,bed_count,setup_status,area,city,state,pincode,country,message,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,'NEW',?,?)").run(id, name, email, phone, val(b.businessName, 180), Math.max(1, Math.min(100, Number(b.propertyCount) || 1)), val(b.propertyType, 40), Math.max(0, Math.min(1e4, Number(b.roomCount) || 0)), Math.max(0, Math.min(1e5, Number(b.bedCount) || 0)), val(b.setupStatus, 60), val(b.area, 160), val(b.city, 120), val(b.state, 120), val(b.pincode, 20), val(b.country, 100) || "India", val(b.message, 2e3), created, created);
  res.status(201).json({ id, message: "Thank you. The Autrob Stay team will contact you soon." });
});
app.get("/api/public/stay", (req, res) => {
  const city = val(req.query.city, 100).toLowerCase(), query = val(req.query.q, 120).toLowerCase(), gender = val(req.query.gender, 20), budget = Number(req.query.budget) || 0;
  const rows = db.prepare(`${publicListingSelect} WHERE l.published=1 AND l.organization_id<>'demo-network-samples' AND (?='' OR lower(l.city)=? OR lower(l.area)=?) AND (?='' OR lower(l.title) LIKE ? OR lower(l.area) LIKE ? OR lower(l.city) LIKE ? OR lower(l.public_address) LIKE ?) AND (?='' OR l.gender=? OR l.gender='Unisex') AND (?=0 OR l.monthly_rent<=?) ORDER BY l.featured DESC,l.updated_at DESC`).all(city, city, city, query, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, gender, gender, budget, budget);
  const listings = rows.map((x) => {
    x.amenities = JSON.parse(x.amenitiesJson || "[]");
    x.photos = JSON.parse(x.photosJson || "[]");
    x.roomTypes = db.prepare("SELECT DISTINCT type FROM rooms WHERE property_id=? ORDER BY type").all(x.propertyId).map((r) => r.type);
    delete x.amenitiesJson;
    delete x.photosJson;
    x.availableBeds = Math.max(0, Number(x.beds || 0) - Number(db.prepare("SELECT COUNT(*) as n FROM residents WHERE organization_id=(SELECT organization_id FROM properties WHERE id=?) AND property_id=? AND occupancy_status='Active'").get(x.propertyId, x.propertyId)?.n || 0));
    x.availableRooms = Number(db.prepare("SELECT COUNT(*) as n FROM rooms WHERE property_id=? AND organization_id=(SELECT organization_id FROM properties WHERE id=?)").get(x.propertyId, x.propertyId)?.n || 0);
    delete x.publicPhone;
    return x;
  });
  res.json({ listings, cities: db.prepare("SELECT DISTINCT city FROM public_property_listings WHERE published=1 AND organization_id<>'demo-network-samples' AND city<>'' ORDER BY city").all().map((x) => x.city) });
});
app.get("/api/public/stay/:slug", (req, res) => {
  const x = db.prepare(`${publicListingSelect} WHERE l.published=1 AND l.organization_id<>'demo-network-samples' AND l.slug=?`).get(req.params.slug);
  if (!x) return res.status(404).json({ error: "This property listing is unavailable." });
  x.amenities = JSON.parse(x.amenitiesJson || "[]");
  x.photos = JSON.parse(x.photosJson || "[]");
  x.roomTypes = db.prepare("SELECT DISTINCT type FROM rooms WHERE property_id=? ORDER BY type").all(x.propertyId).map((r) => r.type);
  delete x.amenitiesJson;
  delete x.photosJson;
  x.availableBeds = Math.max(0, Number(x.beds || 0) - Number(db.prepare("SELECT COUNT(*) as n FROM residents WHERE organization_id=(SELECT organization_id FROM properties WHERE id=?) AND property_id=? AND occupancy_status='Active'").get(x.propertyId, x.propertyId)?.n || 0));
  x.availableRooms = Number(db.prepare("SELECT COUNT(*) as n FROM rooms WHERE property_id=?").get(x.propertyId)?.n || 0);
  res.json({ listing: x });
});
app.post("/api/public/stay/:slug/book", (req, res) => {
  const ip = String(req.ip || req.socket.remoteAddress || "unknown"), now = Date.now(), bucket = publicLeadWindows.get(ip);
  if (bucket && now - bucket.start < 6e4 && bucket.count >= 8) return res.status(429).json({ error: "Too many requests. Please try again in a minute." });
  if (!bucket || now - bucket.start >= 6e4) publicLeadWindows.set(ip, { start: now, count: 1 });
  else bucket.count++;
  const listing = db.prepare(`${publicListingSelect} WHERE l.published=1 AND l.slug=?`).get(req.params.slug);
  if (!listing) return res.status(404).json({ error: "This property listing is unavailable." });
  const b = req.body || {}, name = val(b.name, 120), phone = val(b.phone, 30).replace(/[^+\d]/g, "");
  if (name.length < 2 || phone.replace(/\D/g, "").length < 10) return res.status(400).json({ error: "Enter your name and a valid mobile number." });
  const id = uid2(), created = nowIso2(), sequence = Number(db.prepare("SELECT COUNT(*) as n FROM booking_leads WHERE created_at>=?").get(`${(/* @__PURE__ */ new Date()).getFullYear()}-01-01`).n || 0) + 1, bookingNo = `ABR-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(sequence).padStart(6, "0")}`;
  db.prepare(`INSERT INTO booking_leads (id,booking_no,organization_id,property_id,customer_name,phone,email,gender,occupation,occupants,room_preference,move_in,duration,budget,notes,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'NEW',?,? WHERE EXISTS(SELECT 1 FROM public_property_listings WHERE property_id=? AND published=1)`).run(id, bookingNo, db.prepare("SELECT organization_id FROM properties WHERE id=?").pluck().get(listing.propertyId), listing.propertyId, name, phone, val(b.email, 180), val(b.gender, 30), val(b.occupation, 100), Math.min(20, Math.max(1, Number(b.occupants) || 1)), val(b.roomPreference, 100), val(b.moveIn, 20), val(b.duration, 60), Math.max(0, Number(b.budget) || 0), val(b.notes, 1e3), created, created, listing.propertyId);
  res.status(201).json({ bookingNo, status: "NEW", message: "Your request has been sent to the property. The owner will contact you to confirm availability." });
});
var requireNetworkFeature = (feature) => (req, res, next) => {
  const u = userFor(req);
  if (!u) return res.status(401).json({ error: "Please sign in to continue." });
  if (!canUseFeature(u.organizationId, feature)) return res.status(403).json({ error: `This feature is not enabled for your plan. Contact your administrator to enable ${feature.replaceAll("_", " ")}.`, code: "PLAN_FEATURE_REQUIRED", feature });
  next();
};
var safeJsonArray = (s) => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
var safeNetworkImage = (s) => /^https:\/\/[^\s"'<>]+$/i.test(s) || s.length < 13e5 && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(s);
var safeMarketplaceImage = (s) => safeNetworkImage(s) ? s : "";
app.get("/api/network/listings", ownerAuth, requireNetworkFeature("public_pg_listing"), (req, res) => {
  const u = userFor(req);
  const rows = db.prepare(`SELECT p.id as propertyId,p.name as propertyName,p.name,p.address,p.type,l.slug,l.title,l.description,l.city,l.area,l.public_address as publicAddress,l.gender,l.amenities_json as amenitiesJson,l.house_rules as houseRules,l.photos_json as photosJson,l.monthly_rent as monthlyRent,l.security_deposit as securityDeposit,l.public_phone as publicPhone,l.published,l.featured FROM properties p LEFT JOIN public_property_listings l ON l.property_id=p.id AND l.organization_id=p.organization_id WHERE p.organization_id=? ORDER BY p.name`).all(u.organizationId);
  res.json({ listings: rows.map((r) => ({ ...r, slug:r.slug||"", title:r.title||r.propertyName, description:r.description||"", city:r.city||"", area:r.area||"", publicAddress:r.publicAddress||"", gender:r.gender||"Unisex", amenities:safeJsonArray(r.amenitiesJson||"[]"), houseRules:r.houseRules||"", photos:safeJsonArray(r.photosJson||"[]"), monthlyRent:Number(r.monthlyRent||0), securityDeposit:Number(r.securityDeposit||0), publicPhone:r.publicPhone||"", published:Number(r.published||0), featured:Number(r.featured||0), availableBeds:0, availableRooms:0 })) });
});
app.put("/api/network/listings/:propertyId", ownerAuth, requireNetworkFeature("public_pg_listing"), (req, res) => {
  const u = userFor(req), p = db.prepare("SELECT id,name,address FROM properties WHERE id=? AND organization_id=?").get(req.params.propertyId, u.organizationId);
  if (!p) return res.status(404).json({ error: "Property not found." });
  const b = req.body || {}, title = val(b.title, 160) || p.name, slug = slugify(val(b.slug, 120) || `${val(b.city, 100)}-${title}`), photos = Array.isArray(b.photos) ? b.photos.filter((x) => typeof x === "string" && (/^https:\/\//i.test(x) || /^data:image\/(png|jpeg|webp);base64,/i.test(x) && x.length < 13e5)).slice(0, 8) : [], amenities = Array.isArray(b.amenities) ? b.amenities.filter((x) => typeof x === "string").map((x) => x.slice(0, 80)).slice(0, 40) : [];
  if (b.published && (!val(b.city, 100) || !val(b.area, 120))) return res.status(400).json({ error: "Add a city and area before publishing." });
  const existing = db.prepare("SELECT property_id FROM public_property_listings WHERE property_id=?").get(p.id);
  try {
    if (existing) db.prepare(`UPDATE public_property_listings SET slug=?,title=?,description=?,city=?,area=?,public_address=?,gender=?,amenities_json=?,house_rules=?,photos_json=?,monthly_rent=?,security_deposit=?,public_phone=?,published=?,updated_at=? WHERE property_id=? AND organization_id=?`).run(slug, title, val(b.description, 4e3), val(b.city, 100), val(b.area, 120), val(b.publicAddress, 300), ["Male", "Female", "Unisex"].includes(b.gender) ? b.gender : "Unisex", JSON.stringify(amenities), val(b.houseRules, 3e3), JSON.stringify(photos), Math.max(0, Number(b.monthlyRent) || 0), Math.max(0, Number(b.securityDeposit) || 0), b.showPhone ? val(b.publicPhone, 30) : "", b.published ? 1 : 0, nowIso2(), p.id, u.organizationId);
    else db.prepare(`INSERT INTO public_property_listings (property_id,organization_id,slug,title,description,city,area,public_address,gender,amenities_json,house_rules,photos_json,monthly_rent,security_deposit,public_phone,published,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(p.id, u.organizationId, slug, title, val(b.description, 4e3), val(b.city, 100), val(b.area, 120), val(b.publicAddress, 300), ["Male", "Female", "Unisex"].includes(b.gender) ? b.gender : "Unisex", JSON.stringify(amenities), val(b.houseRules, 3e3), JSON.stringify(photos), Math.max(0, Number(b.monthlyRent) || 0), Math.max(0, Number(b.securityDeposit) || 0), b.showPhone ? val(b.publicPhone, 30) : "", b.published ? 1 : 0, nowIso2(), nowIso2());
    audit(u.organizationId, u.id, "public_listing.saved", "property", p.id);
    res.json({ ok: true, slug, published: !!b.published });
  } catch (e) {
    res.status(e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? 409 : 500).json({ error: e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? "That listing URL is already in use." : "Could not save public listing." });
  }
});
app.get("/api/network/stay-requirements", ownerAuth, (req, res) => {
  const u = userFor(req), requirements = db.prepare("SELECT r.*,q.id as quoteId,q.property_id as quotedPropertyId,q.property_name as quotedPropertyName,q.monthly_rent as quotedRent,q.image_url as quotedImage,q.status as quoteStatus FROM resident_stay_requirements r LEFT JOIN resident_stay_quotes q ON q.requirement_id=r.id AND q.organization_id=? WHERE r.status IN ('OPEN','QUOTED','CONFIRMED') ORDER BY r.created_at DESC LIMIT 300").all(u.organizationId), properties = db.prepare("SELECT p.id as propertyId,p.name,l.title,l.slug,l.city,l.area,l.monthly_rent as monthlyRent,l.security_deposit as securityDeposit,l.photos_json as photosJson FROM properties p LEFT JOIN public_property_listings l ON l.property_id=p.id WHERE p.organization_id=? ORDER BY p.name").all(u.organizationId);
  res.json({ requirements, properties: properties.map((p) => ({ ...p, photos: safeJsonArray(p.photosJson || "[]") })) });
});
app.get("/api/network/stay-requirements/unread-count", ownerAuth, (req, res) => {
  const u = userFor(req), count = Number(db.prepare("SELECT COUNT(*) as n FROM resident_stay_requirements r LEFT JOIN resident_stay_quotes q ON q.requirement_id=r.id AND q.organization_id=? WHERE r.status='OPEN' AND q.id IS NULL").get(u.organizationId)?.n || 0);
  res.json({ count });
});
app.post("/api/network/stay-requirements/:id/quotes", ownerAuth, (req, res) => {
  const u = userFor(req), b = req.body || {}, requirement = db.prepare("SELECT id FROM resident_stay_requirements WHERE id=? AND status IN ('OPEN','QUOTED','CONFIRMED')").get(req.params.id), property = db.prepare("SELECT p.id,p.name,l.title,l.slug,l.city,l.area,l.photos_json as photosJson,l.monthly_rent as monthlyRent,l.security_deposit as securityDeposit FROM properties p LEFT JOIN public_property_listings l ON l.property_id=p.id WHERE p.id=? AND p.organization_id=?").get(val(b.propertyId, 100), u.organizationId), rent = Number(b.monthlyRent);
  if (!requirement) return res.status(404).json({ error: "Stay requirement is no longer available." });
  if (!property) return res.status(400).json({ error: "Choose one of your properties." });
  if (!Number.isFinite(rent) || rent < 0) return res.status(400).json({ error: "Enter a valid quoted monthly rent." });
  const now = nowIso2(), photos = safeJsonArray(property.photosJson || "[]"), existing = db.prepare("SELECT id FROM resident_stay_quotes WHERE requirement_id=? AND organization_id=?").get(req.params.id, u.organizationId), id = existing?.id || uid2();
  if (existing) db.prepare("UPDATE resident_stay_quotes SET property_id=?,property_name=?,listing_title=?,listing_slug=?,image_url=?,area=?,monthly_rent=?,security_deposit=?,room_preference=?,details=?,status='QUOTED',updated_at=? WHERE id=? AND organization_id=?").run(property.id, property.name, property.title || property.name, property.slug || "", photos[0] || "", property.area || property.city || "", rent, Math.max(0, Number(b.securityDeposit) || 0), val(b.roomPreference, 80), val(b.details, 1500), now, id, u.organizationId);
  else db.prepare("INSERT INTO resident_stay_quotes (id,requirement_id,organization_id,property_id,property_name,listing_title,listing_slug,image_url,area,monthly_rent,security_deposit,room_preference,details,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'QUOTED',?,?)").run(id, req.params.id, u.organizationId, property.id, property.name, property.title || property.name, property.slug || "", photos[0] || "", property.area || property.city || "", rent, Math.max(0, Number(b.securityDeposit) || 0), val(b.roomPreference, 80), val(b.details, 1500), now, now);
  audit(u.organizationId, u.id, "stay_requirement.quoted", "stay_requirement", req.params.id);
  res.status(201).json({ ok: true });
});
app.patch("/api/network/stay-requirements/:id/confirm", ownerAuth, (req, res) => {
  const u = userFor(req), quote = db.prepare("SELECT id,status,monthly_rent as monthlyRent FROM resident_stay_quotes WHERE id=? AND requirement_id=? AND organization_id=?").get(val(req.body?.quoteId, 100), req.params.id, u.organizationId);
  if (!quote) return res.status(404).json({ error: "Send a quotation from your property before confirming this enquiry." });
  const amountPaise = Math.round(Number(quote.monthlyRent || 0) * 15);
  if (amountPaise < 1) return res.status(400).json({ error: "Set a quoted monthly rent before confirming this booking." });
  const result = db.transaction(() => {
    const current = db.prepare("SELECT status FROM resident_stay_quotes WHERE id=? AND organization_id=?").get(quote.id, u.organizationId);
    if (current?.status === "CONFIRMED") return { ok: true, alreadyConfirmed: true, balancePaise: walletBalance(u.organizationId) };
    const debit = debitOwnerWallet(u.organizationId, amountPaise, "stay_requirement_quote", quote.id, `Booking confirmation charge (15% of \u20B9${Number(quote.monthlyRent).toLocaleString("en-IN")} monthly rent)`, u.id);
    if (!debit.ok) return { ok: false, balancePaise: debit.balancePaise };
    db.prepare("UPDATE resident_stay_quotes SET status='CONFIRMED',updated_at=? WHERE id=? AND organization_id=?").run(nowIso2(), quote.id, u.organizationId);
    return { ok: true, ...debit };
  })();
  if (!result.ok) return res.status(402).json({ error: `Insufficient wallet balance. \u20B9${(result.balancePaise / 100).toLocaleString("en-IN")} available; \u20B9${(amountPaise / 100).toLocaleString("en-IN")} is required (15% of the quoted monthly rent).`, code: "INSUFFICIENT_WALLET" });
  audit(u.organizationId, u.id, "stay_requirement.confirmed", "stay_requirement", req.params.id);
  res.json(result);
});
app.get("/api/network/booking-leads", ownerAuth, requireNetworkFeature("booking_leads"), (req, res) => {
  const u = userFor(req);
  const leads = db.prepare("SELECT b.*,p.name as property,l.photos_json as listingPhotos,l.monthly_rent as monthlyRent,0 as isSample FROM booking_leads b JOIN properties p ON p.id=b.property_id LEFT JOIN public_property_listings l ON l.property_id=p.id WHERE b.organization_id=? ORDER BY b.created_at DESC").all(u.organizationId);
  res.json({ leads: leads.map((x) => ({ ...x, imageUrl: safeJsonArray(x.listingPhotos || "[]")[0] || "" })) });
});
app.patch("/api/network/booking-leads/:id", ownerAuth, requireNetworkFeature("booking_leads"), (req, res) => {
  const u = userFor(req), status = val(req.body?.status, 30), allowed = ["NEW", "CONTACTED", "VISIT_SCHEDULED", "INTERESTED", "CONFIRMED", "REJECTED", "CANCELLED"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Choose a valid lead status." });
  const lead = db.prepare("SELECT b.id,b.status,l.monthly_rent as monthlyRent FROM booking_leads b LEFT JOIN public_property_listings l ON l.property_id=b.property_id WHERE b.id=? AND b.organization_id=?").get(req.params.id, u.organizationId);
  if (!lead) return res.status(404).json({ error: "Booking lead not found." });
  const now = nowIso2();
  if (status === "CONFIRMED" && lead.status !== "CONFIRMED") {
    const monthlyRent = Number(lead.monthlyRent || 0), amountPaise = Math.round(monthlyRent * 15);
    if (amountPaise < 1) return res.status(400).json({ error: "Set a monthly rent on the published listing before confirming this booking." });
    const result = db.transaction(() => {
      const debit = debitOwnerWallet(u.organizationId, amountPaise, "booking_lead", lead.id, `Booking confirmation charge (15% of \u20B9${monthlyRent.toLocaleString("en-IN")} monthly rent)`, u.id);
      if (!debit.ok) return debit;
      db.prepare("UPDATE booking_leads SET status=?,owner_notes=?,updated_at=? WHERE id=? AND organization_id=?").run(status, val(req.body?.ownerNotes, 1500), now, req.params.id, u.organizationId);
      return debit;
    })();
    if (!result.ok) return res.status(402).json({ error: `Insufficient wallet balance. \u20B9${(result.balancePaise / 100).toLocaleString("en-IN")} available; \u20B9${(amountPaise / 100).toLocaleString("en-IN")} is required (15% of the monthly rent).`, code: "INSUFFICIENT_WALLET" });
  } else db.prepare("UPDATE booking_leads SET status=?,owner_notes=?,updated_at=? WHERE id=? AND organization_id=?").run(status, val(req.body?.ownerNotes, 1500), now, req.params.id, u.organizationId);
  audit(u.organizationId, u.id, "booking_lead.updated", "booking_lead", req.params.id);
  res.json({ ok: true, status, balancePaise: walletBalance(u.organizationId) });
});
app.post("/api/network/booking-leads/:id/convert", ownerAuth, requireNetworkFeature("booking_leads"), (req, res) => {
  const u = userFor(req), lead = db.prepare("SELECT b.*,p.name as property_name FROM booking_leads b JOIN properties p ON p.id=b.property_id WHERE b.id=? AND b.organization_id=?").get(req.params.id, u.organizationId);
  if (!lead) return res.status(404).json({ error: "Booking lead not found." });
  if (lead.enquiry_id) return res.json({ ok: true, enquiryId: lead.enquiry_id, alreadyConverted: true });
  const id = uid2(), now = nowIso2();
  const convert = db.transaction(() => {
    const current = db.prepare("SELECT enquiry_id FROM booking_leads WHERE id=? AND organization_id=?").get(lead.id, u.organizationId);
    if (current?.enquiry_id) return current.enquiry_id;
    db.prepare(`INSERT INTO enquiries (id,organization_id,name,phone,property,room,budget,move_in,source,stage,created_at,assigned_room) VALUES (?,?,?,?,?,?,?,?,?,'New enquiry',?,'')`).run(id, u.organizationId, lead.customer_name, lead.phone, lead.property_name, lead.room_preference || "Any available", lead.budget, lead.move_in, "Public booking portal", now);
    db.prepare("UPDATE booking_leads SET enquiry_id=?,updated_at=? WHERE id=? AND organization_id=?").run(id, now, lead.id, u.organizationId);
    return id;
  });
  const enquiryId = convert();
  audit(u.organizationId, u.id, "booking_lead.converted", "booking_lead", lead.id);
  res.status(201).json({ ok: true, enquiryId });
});
app.get("/api/network/marketplace/categories", auth, requireNetworkFeature("marketplace_access"), (_req, res) => res.json({ categories: db.prepare("SELECT id,name,kind FROM marketplace_categories WHERE active=1 ORDER BY sort_order,name").all() }));
app.get("/api/network/marketplace/listings", auth, requireNetworkFeature("marketplace_access"), (req, res) => {
  const q = val(req.query.q, 100).toLowerCase(), city = val(req.query.city, 100).toLowerCase(), category = val(req.query.category, 80), rows = db.prepare(`SELECT l.*,c.name as category FROM marketplace_listings l JOIN marketplace_categories c ON c.id=l.category_id WHERE l.status='Active' AND c.active=1 AND (?='' OR lower(l.title) LIKE ? OR lower(l.description) LIKE ?) AND (?='' OR lower(l.city)=?) AND (?='' OR c.id=?) ORDER BY l.featured DESC,l.created_at DESC`).all(q, `%${q}%`, `%${q}%`, city, city, category, category);
  res.json({ listings: rows });
});
app.post("/api/network/marketplace/listings/:id/enquiries", auth, requireNetworkFeature("marketplace_access"), (req, res) => {
  const u = userFor(req), l = db.prepare("SELECT id FROM marketplace_listings WHERE id=? AND status='Active'").get(req.params.id);
  if (!l) return res.status(404).json({ error: "Listing is unavailable." });
  const b = req.body || {}, name = val(b.name, 120), phone = val(b.phone, 30);
  if (name.length < 2 || phone.replace(/\D/g, "").length < 10) return res.status(400).json({ error: "Enter your name and a valid mobile number." });
  const id = uid2();
  db.prepare("INSERT INTO marketplace_enquiries (id,listing_id,organization_id,requester_name,business_name,city,phone,quantity,requirement,preferred_date,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,'NEW',?)").run(id, req.params.id, u.organizationId, name, val(b.businessName, 150), val(b.city, 100), phone, val(b.quantity, 60), val(b.requirement, 1e3), val(b.preferredDate, 20), nowIso2());
  res.status(201).json({ id, status: "NEW" });
});
app.get("/api/network/marketplace/enquiries", ownerAuth, (req, res) => {
  const u = userFor(req);
  res.json({ enquiries: db.prepare("SELECT e.*,l.title as listing FROM marketplace_enquiries e JOIN marketplace_listings l ON l.id=e.listing_id WHERE e.organization_id=? ORDER BY e.created_at DESC").all(u.organizationId) });
});
app.get("/api/network/community", auth, requireNetworkFeature("community_access"), (req, res) => {
  const posts = db.prepare(`SELECT p.*,COALESCE(o.business_name,p.business_name,'Autrob Official') as display_business,(SELECT COUNT(*) FROM community_likes x WHERE x.post_id=p.id) as likes,(SELECT COUNT(*) FROM community_comments x WHERE x.post_id=p.id AND x.status='ACTIVE') as comments,EXISTS(SELECT 1 FROM community_likes x WHERE x.post_id=p.id AND x.organization_id=?) as liked FROM community_posts p LEFT JOIN org_settings o ON o.organization_id=p.organization_id WHERE p.status='APPROVED' AND COALESCE(p.organization_id,'')<>'demo-network-samples' ORDER BY p.pinned DESC,p.important DESC,p.created_at DESC LIMIT 100`).all(userFor(req).organizationId);
  res.json({ posts });
});
app.post("/api/network/community/posts", auth, requireNetworkFeature("community_posting"), (req, res) => {
  const u = userFor(req), b = req.body || {}, title = val(b.title, 180), body = val(b.body, 5e3);
  if (!title || !body) return res.status(400).json({ error: "Enter a title and post details." });
  const profile = db.prepare("SELECT business_name as businessName FROM org_settings WHERE organization_id=?").get(u.organizationId), images = Array.isArray(b.images) ? b.images.filter((x) => typeof x === "string" && (/^https:\/\//i.test(x) || /^data:image\/(png|jpeg|webp);base64,/i.test(x) && x.length < 13e5)).slice(0, 5) : [], id = uid2(), now = nowIso2();
  db.prepare(`INSERT INTO community_posts (id,organization_id,owner_name,business_name,city,category,title,body,images_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'PENDING',?,?)`).run(id, u.organizationId, u.name, profile?.businessName || "", val(b.city, 100), val(b.category, 60) || "General", title, body, JSON.stringify(images), now, now);
  audit(u.organizationId, u.id, "community_post.submitted", "community_post", id);
  res.status(201).json({ id, status: "PENDING", message: "Your post has been submitted for admin approval." });
});
app.get("/api/network/community/mine", auth, requireNetworkFeature("community_access"), (req, res) => res.json({ posts: db.prepare("SELECT id,category,title,body,status,rejection_reason as rejectionReason,created_at as createdAt FROM community_posts WHERE organization_id=? ORDER BY created_at DESC").all(userFor(req).organizationId) }));
app.post("/api/network/community/posts/:id/like", auth, requireNetworkFeature("community_access"), (req, res) => {
  const u = userFor(req), p = db.prepare("SELECT id FROM community_posts WHERE id=? AND status='APPROVED'").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Post not found." });
  const old = db.prepare("SELECT 1 FROM community_likes WHERE post_id=? AND organization_id=?").get(req.params.id, u.organizationId);
  if (old) db.prepare("DELETE FROM community_likes WHERE post_id=? AND organization_id=?").run(req.params.id, u.organizationId);
  else db.prepare("INSERT INTO community_likes (post_id,organization_id,created_at) VALUES (?,?,?)").run(req.params.id, u.organizationId, nowIso2());
  res.json({ liked: !old });
});
app.get("/api/network/community/posts/:id/comments", auth, requireNetworkFeature("community_access"), (req, res) => {
  const p = db.prepare("SELECT id FROM community_posts WHERE id=? AND status='APPROVED'").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Post not found." });
  res.json({ comments: db.prepare("SELECT id,owner_name as ownerName,body,created_at as createdAt FROM community_comments WHERE post_id=? AND status='ACTIVE' ORDER BY created_at").all(req.params.id) });
});
app.post("/api/network/community/posts/:id/comments", auth, requireNetworkFeature("community_access"), (req, res) => {
  const u = userFor(req), p = db.prepare("SELECT id FROM community_posts WHERE id=? AND status='APPROVED'").get(req.params.id), body = val(req.body?.body, 1500);
  if (!p) return res.status(404).json({ error: "Post not found." });
  if (!body) return res.status(400).json({ error: "Write a comment first." });
  const id = uid2();
  db.prepare("INSERT INTO community_comments (id,post_id,organization_id,owner_name,body,created_at) VALUES (?,?,?,?,?,?)").run(id, req.params.id, u.organizationId, u.name, body, nowIso2());
  res.status(201).json({ id });
});
app.post("/api/network/community/posts/:id/report", auth, requireNetworkFeature("community_access"), (req, res) => {
  const u = userFor(req), p = db.prepare("SELECT id FROM community_posts WHERE id=? AND status='APPROVED'").get(req.params.id), reason = val(req.body?.reason, 50);
  if (!p) return res.status(404).json({ error: "Post not found." });
  if (!["Spam", "Misleading", "Inappropriate", "Fraud/Suspicious", "Wrong Category", "Other"].includes(reason)) return res.status(400).json({ error: "Choose a valid report reason." });
  if (db.prepare("SELECT 1 FROM community_reports WHERE post_id=? AND organization_id=? AND status='NEW'").get(req.params.id, u.organizationId)) return res.status(409).json({ error: "You have already reported this post." });
  db.prepare("INSERT INTO community_reports (id,post_id,organization_id,reason,details,created_at) VALUES (?,?,?,?,?,?)").run(uid2(), req.params.id, u.organizationId, reason, val(req.body?.details, 500), nowIso2());
  res.status(201).json({ ok: true });
});
app.get("/api/platform/network/community", platformAuth, (req, res) => {
  const status = val(req.query.status, 20) || "PENDING";
  res.json({ posts: db.prepare(`SELECT p.*,o.name as workspace FROM community_posts p LEFT JOIN organizations o ON o.id=p.organization_id WHERE p.organization_id<>'demo-network-samples' AND (?='ALL' OR p.status=?) ORDER BY p.created_at DESC LIMIT 300`).all(status, status) });
});
app.get("/api/platform/network/marketplace", platformAuth, (_req, res) => res.json({ categories: db.prepare("SELECT * FROM marketplace_categories ORDER BY sort_order,name").all(), listings: db.prepare("SELECT l.*,c.name as category FROM marketplace_listings l JOIN marketplace_categories c ON c.id=l.category_id ORDER BY l.created_at DESC").all(), enquiries: db.prepare("SELECT e.*,l.title as listing FROM marketplace_enquiries e JOIN marketplace_listings l ON l.id=e.listing_id ORDER BY e.created_at DESC LIMIT 300").all() }));
app.get("/api/platform/network/stay", platformAuth, (_req, res) => res.json({ listings: db.prepare(`SELECT l.property_id as propertyId,l.slug,l.title,l.city,l.area,l.published,l.featured,p.name as propertyName,o.name as workspace,(SELECT COUNT(*) FROM booking_leads b WHERE b.property_id=l.property_id) as enquiries FROM public_property_listings l JOIN properties p ON p.id=l.property_id LEFT JOIN organizations o ON o.id=l.organization_id ORDER BY l.updated_at DESC`).all() }));
app.patch("/api/platform/network/stay/:propertyId", platformAuth, (req, res) => {
  const l = db.prepare("SELECT property_id as propertyId,organization_id as organizationId FROM public_property_listings WHERE property_id=?").get(req.params.propertyId);
  if (!l) return res.status(404).json({ error: "Public listing not found." });
  if (req.body?.published !== void 0 && typeof req.body.published !== "boolean") return res.status(400).json({ error: "Choose a valid publish state." });
  db.prepare("UPDATE public_property_listings SET published=COALESCE(?,published),featured=COALESCE(?,featured),updated_at=? WHERE property_id=?").run(req.body?.published === void 0 ? null : req.body.published ? 1 : 0, req.body?.featured === void 0 ? null : req.body.featured ? 1 : 0, nowIso2(), l.propertyId);
  audit(l.organizationId, platformUserFor(req).id, "public_listing.moderated", "property", l.propertyId);
  res.json({ ok: true });
});
app.patch("/api/platform/network/marketplace/enquiries/:id", platformAuth, (req, res) => {
  const status = val(req.body?.status, 30);
  if (!["NEW", "CONTACTED", "QUOTED", "NEGOTIATING", "WON", "LOST", "CANCELLED"].includes(status)) return res.status(400).json({ error: "Choose a valid marketplace enquiry status." });
  const r = db.prepare("UPDATE marketplace_enquiries SET status=? WHERE id=?").run(status, req.params.id);
  if (!r.changes) return res.status(404).json({ error: "Marketplace quote request not found." });
  res.json({ ok: true });
});
app.post("/api/platform/network/marketplace/categories", platformAuth, (req, res) => {
  const name = val(req.body?.name, 100);
  if (!name) return res.status(400).json({ error: "Enter a category name." });
  const id = uid2();
  try {
    db.prepare("INSERT INTO marketplace_categories (id,name,kind,active,sort_order,created_at) VALUES (?,?,?,1,100,?)").run(id, name, val(req.body?.kind, 40) || "Product / Service", nowIso2());
    res.status(201).json({ id, name });
  } catch (e) {
    res.status(e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? 409 : 500).json({ error: "Category name already exists or could not be saved." });
  }
});
app.patch("/api/platform/network/marketplace/categories/:id", platformAuth, (req, res) => {
  const name = val(req.body?.name, 100);
  if (!name) return res.status(400).json({ error: "Enter a category name." });
  try {
    const r = db.prepare("UPDATE marketplace_categories SET name=?,kind=?,active=? WHERE id=?").run(name, val(req.body?.kind, 40) || "Product / Service", req.body?.active === false ? 0 : 1, req.params.id);
    if (!r.changes) return res.status(404).json({ error: "Category not found." });
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: "Category name already exists." });
  }
});
app.post("/api/platform/network/marketplace/listings", platformAuth, (req, res) => {
  const b = req.body || {}, title = val(b.title, 180), categoryId = val(b.categoryId, 100);
  if (!title || !db.prepare("SELECT id FROM marketplace_categories WHERE id=?").get(categoryId)) return res.status(400).json({ error: "Enter a title and choose a category." });
  const id = uid2(), kind = ["Product", "Service", "Manpower", "Business Service"].includes(b.kind) ? b.kind : "Product", price = Number(b.price);
  db.prepare(`INSERT INTO marketplace_listings (id,category_id,kind,title,description,image_url,price,price_type,city,service_area,seller,phone,whatsapp,availability,status,featured,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`).run(id, categoryId, kind, title, val(b.description, 3e3), safeMarketplaceImage(val(b.imageUrl, 4e3)), Number.isFinite(price) && price >= 0 ? price : null, val(b.priceType, 30) || "On Request", val(b.city, 100), val(b.serviceArea, 160), val(b.seller, 150), val(b.phone, 30), val(b.whatsapp, 30), val(b.availability, 100) || "Available", req.body?.active === false ? "Inactive" : "Active", nowIso2(), nowIso2());
  res.status(201).json({ id });
});
app.patch("/api/platform/network/marketplace/listings/:id", platformAuth, (req, res) => {
  const b = req.body || {}, title = val(b.title, 180), categoryId = val(b.categoryId, 100);
  if (!title || !db.prepare("SELECT id FROM marketplace_categories WHERE id=?").get(categoryId)) return res.status(400).json({ error: "Enter a title and choose a category." });
  const r = db.prepare(`UPDATE marketplace_listings SET category_id=?,kind=?,title=?,description=?,image_url=?,price=?,price_type=?,city=?,service_area=?,seller=?,phone=?,whatsapp=?,availability=?,status=?,featured=?,updated_at=? WHERE id=?`).run(categoryId, ["Product", "Service", "Manpower", "Business Service"].includes(b.kind) ? b.kind : "Product", title, val(b.description, 3e3), safeMarketplaceImage(val(b.imageUrl, 4e3)), Number.isFinite(Number(b.price)) && Number(b.price) >= 0 ? Number(b.price) : null, val(b.priceType, 30) || "On Request", val(b.city, 100), val(b.serviceArea, 160), val(b.seller, 150), val(b.phone, 30), val(b.whatsapp, 30), val(b.availability, 100) || "Available", b.active === false ? "Inactive" : "Active", b.featured ? 1 : 0, nowIso2(), req.params.id);
  if (!r.changes) return res.status(404).json({ error: "Listing not found." });
  res.json({ ok: true });
});
app.delete("/api/platform/network/marketplace/listings/:id", platformAuth, (req, res) => {
  if (desktopApp) return res.status(404).json({ error: "Route not found." });
  const listing = db.prepare("SELECT id,organization_id as organizationId,title FROM marketplace_listings WHERE id=?").get(req.params.id);
  if (!listing) return res.status(404).json({ error: "Marketplace listing not found." });
  db.transaction(() => {
    db.prepare("DELETE FROM marketplace_enquiries WHERE listing_id=?").run(listing.id);
    db.prepare("DELETE FROM marketplace_listings WHERE id=?").run(listing.id);
  })();
  if (listing.organizationId) audit(listing.organizationId, platformUserFor(req).id, "marketplace_listing.deleted", "marketplace_listing", listing.id);
  res.json({ ok: true, title: listing.title });
});
app.post("/api/platform/network/community", platformAuth, (req, res) => {
  const admin = platformUserFor(req), b = req.body || {}, title = val(b.title, 180), body = val(b.body, 5e3);
  if (!title || !body) return res.status(400).json({ error: "Enter an official post title and message." });
  const images = Array.isArray(b.images) ? b.images.filter((x) => typeof x === "string" && safeNetworkImage(x)).slice(0, 5) : [], id = uid2(), now = nowIso2();
  db.prepare(`INSERT INTO community_posts (id,owner_name,business_name,city,category,title,body,images_json,status,official,important,pinned,created_at,updated_at,approved_at) VALUES (?,?,'Autrob Technologies Private Limited',?,?,?,?,?,'APPROVED',1,?,?,?, ?,?)`).run(id, admin.name, val(b.city, 100), val(b.category, 60) || "Official update", title, body, JSON.stringify(images), b.important ? 1 : 0, b.pinned ? 1 : 0, now, now, now);
  res.status(201).json({ id, status: "APPROVED" });
});
app.patch("/api/platform/network/community/:id", platformAuth, (req, res) => {
  const admin = platformUserFor(req), p = db.prepare("SELECT id,status,organization_id as organizationId FROM community_posts WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Post not found." });
  const action = val(req.body?.action, 20), reason = val(req.body?.reason, 500);
  if (action === "approve") db.prepare("UPDATE community_posts SET status='APPROVED',approved_at=?,rejection_reason='',updated_at=? WHERE id=?").run(nowIso2(), nowIso2(), p.id);
  else if (action === "reject") db.prepare("UPDATE community_posts SET status='REJECTED',rejection_reason=?,updated_at=? WHERE id=?").run(reason, nowIso2(), p.id);
  else if (action === "remove") db.prepare("UPDATE community_posts SET status='REMOVED',updated_at=? WHERE id=?").run(nowIso2(), p.id);
  else if (action === "pin") db.prepare("UPDATE community_posts SET pinned=?,updated_at=? WHERE id=?").run(req.body?.pinned ? 1 : 0, nowIso2(), p.id);
  else return res.status(400).json({ error: "Choose approve, reject, remove, or pin." });
  db.prepare("INSERT INTO community_moderation_logs (id,post_id,admin_id,action,reason,created_at) VALUES (?,?,?,?,?,?)").run(uid2(), p.id, admin.id, action, reason, nowIso2());
  if (p.organizationId) audit(p.organizationId, admin.id, `community_post.${action}`, "community_post", p.id);
  res.json({ ok: true });
});
app.get("/api/platform/network/reports", platformAuth, (_req, res) => res.json({ reports: db.prepare(`SELECT r.*,p.title,p.owner_name as ownerName,p.business_name as businessName FROM community_reports r JOIN community_posts p ON p.id=r.post_id WHERE r.status='NEW' ORDER BY r.created_at DESC`).all() }));
app.patch("/api/platform/network/reports/:id", platformAuth, (req, res) => {
  const status = val(req.body?.status, 20);
  if (!["DISMISSED", "REVIEWED"].includes(status)) return res.status(400).json({ error: "Choose a valid review action." });
  const update = db.prepare("UPDATE community_reports SET status=?,reviewed_at=? WHERE id=? AND status='NEW'").run(status, nowIso2(), req.params.id);
  if (!update.changes) return res.status(404).json({ error: "Report not found." });
  res.json({ ok: true });
});
app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));
var dist = path.join(root, "dist");
var hasBuiltUi = false;
try {
  await fs.access(path.join(dist, "index.html"));
  hasBuiltUi = true;
} catch (error) {
  console.error("Built UI is unavailable:", error instanceof Error ? error.message : "unknown error");
}
if (hasBuiltUi) {
  app.use(express.static(dist));
  app.get("/platform", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}
var port = Number(process.env.PORT) || 3e3;
var host = process.env.HOST || "127.0.0.1";
var httpServer = app.listen(port, host, () => console.log(`Autrob Stay service listening on ${host}:${port}`));
httpServer.ref();
var serviceKeepAlive = setInterval(() => {
  if (!httpServer.listening) httpServer.listen(port, host);
}, 3e4);
serviceKeepAlive.ref();
var stopService = () => {
  clearInterval(serviceKeepAlive);
  httpServer.close();
};
process.once("SIGINT", stopService);
process.once("SIGTERM", stopService);
