Warning: truncated output (original token count: 95857)
Total output lines: 3509

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
CREATE TABLE IF NOT EXISTS resident_stay_requirements (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone T…65857 tokens truncated…error: "Template name, category, and message are required." });
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

