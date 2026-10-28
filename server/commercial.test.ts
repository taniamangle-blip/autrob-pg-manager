import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { installCommercialSchema } from './commercial.js';

test('commercial catalog seeds configured prices, limits, and plan features', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE saas_licenses (id TEXT PRIMARY KEY, organization_id TEXT, key_hash TEXT, key_hint TEXT, plan TEXT, starts_at TEXT, expires_at TEXT, status TEXT, activated_by TEXT, activated_at TEXT, created_by TEXT, created_at TEXT, revoked_at TEXT)');
  installCommercialSchema(db);
  const starter = db.prepare('SELECT monthly_price_paise as monthly,annual_price_paise as annual,max_properties as properties,max_beds as beds FROM commercial_plans WHERE plan_code=?').get('STARTER') as any;
  const pro = db.prepare('SELECT monthly_price_paise as monthly,annual_price_paise as annual,max_properties as properties,max_beds as beds,is_featured as featured FROM commercial_plans WHERE plan_code=?').get('PRO') as any;
  const enterprise = db.prepare('SELECT monthly_price_paise as monthly,annual_price_paise as annual,max_beds as beds FROM commercial_plans WHERE plan_code=?').get('ENTERPRISE') as any;
  assert.deepEqual(starter, { monthly: 39900, annual: 399900, properties: 1, beds: 30 });
  assert.deepEqual(pro, { monthly: 69900, annual: 699900, properties: 3, beds: 100, featured: 1 });
  assert.deepEqual(enterprise, { monthly: null, annual: null, beds: -1 });
  assert.equal(db.prepare("SELECT enabled FROM commercial_plan_features WHERE plan_code='PRO' AND feature_code='whatsapp_reminders'").get()?.enabled, 1);
  assert.equal(db.prepare("SELECT enabled FROM commercial_plan_features WHERE plan_code='STARTER' AND feature_code='whatsapp_reminders'").get(), undefined);
  db.close();
});

test('commercial seeding is idempotent and preserves admin-edited prices', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE saas_licenses (id TEXT PRIMARY KEY, organization_id TEXT, key_hash TEXT, key_hint TEXT, plan TEXT, starts_at TEXT, expires_at TEXT, status TEXT, activated_by TEXT, activated_at TEXT, created_by TEXT, created_at TEXT, revoked_at TEXT)');
  installCommercialSchema(db);
  db.prepare("UPDATE commercial_plans SET monthly_price_paise=12345 WHERE plan_code='STARTER'").run();
  installCommercialSchema(db);
  assert.equal((db.prepare("SELECT monthly_price_paise FROM commercial_plans WHERE plan_code='STARTER'").get() as any).monthly_price_paise, 12345);
  assert.equal((db.prepare('SELECT COUNT(*) as count FROM commercial_plans').get() as any).count, 5);
  db.close();
});
