import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import Database from 'better-sqlite3';
import { registerDesktopLicenseActivation } from './remoteLicense.js';

function database() {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, organization_id TEXT NOT NULL);
    CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_user_id TEXT NOT NULL, plan TEXT NOT NULL, status TEXT NOT NULL, trial_ends_at TEXT NOT NULL, next_billing_at TEXT NOT NULL);
    CREATE TABLE saas_licenses (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, key_hint TEXT NOT NULL, plan TEXT NOT NULL, plan_code TEXT NOT NULL DEFAULT '', subscription_id TEXT NOT NULL DEFAULT '', starts_at TEXT NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL, activated_by TEXT NOT NULL DEFAULT '', activated_at TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE commercial_plans (plan_code TEXT PRIMARY KEY, max_devices INTEGER NOT NULL);
    CREATE TABLE license_device_activations (activation_id TEXT PRIMARY KEY, license_id TEXT NOT NULL, business_id TEXT NOT NULL, device_id_hash TEXT NOT NULL, device_name TEXT NOT NULL, status TEXT NOT NULL, activated_at TEXT NOT NULL, last_validated_at TEXT NOT NULL, revoked_at TEXT NOT NULL DEFAULT '', UNIQUE(license_id,device_id_hash));
    CREATE TABLE commercial_audit_log (audit_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, previous_json TEXT NOT NULL, new_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE activities (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE audit_log (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
  return db;
}

function handlerAt(app: express.Express, path: string) {
  const route = (app as any).router.stack.find((layer: any) => layer.route?.path === path)?.route;
  assert(route, `route ${path} is registered`);
  return route.stack.at(-1).handle as (req: any, res: any) => unknown;
}

function invoke(handler: (req: any, res: any) => unknown, req: any) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(body: any) { resolve({ status: this.statusCode, body }); return this; },
    };
    try {
      const pending = handler(req, res);
      if (pending && typeof (pending as Promise<unknown>).catch === 'function') (pending as Promise<unknown>).catch(reject);
    } catch (error) { reject(error); }
  });
}

test('Windows activation forwards to hosted licensing and stores an active local license', async () => {
  const original = {
    enabled: process.env.NIVASBOOK_ENABLE_DESKTOP_LICENSE_ACTIVATION,
    desktopToken: process.env.NIVASBOOK_DESKTOP_TOKEN,
    serverUrl: process.env.NIVASBOOK_LICENSE_SERVER_URL,
  };
  const cloud = database();
  const local = database();
  const originalFetch = globalThis.fetch;
  const key = 'NVB1-1234-5678-9ABC-DEF0-1234-5678-9ABC-DEF0';
  const normalized = key.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const hash = createHash('sha256').update(normalized).digest('hex');
  const today = new Date().toISOString().slice(0, 10);
  const expiry = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

  try {
    process.env.NIVASBOOK_ENABLE_DESKTOP_LICENSE_ACTIVATION = '1';
    cloud.exec("INSERT INTO users VALUES ('cloud-user','Test Owner','owner@example.test','cloud-org'); INSERT INTO organizations VALUES ('cloud-org','Test PG','cloud-user','Trial','Trial','',''); INSERT INTO commercial_plans VALUES ('STARTER',1);");
    cloud.prepare(`INSERT INTO saas_licenses (id,organization_id,key_hash,key_hint,plan,plan_code,starts_at,expires_at,status,created_by,created_at)
      VALUES ('cloud-license','cloud-org',?,'•••• DEF0','Starter','STARTER',?,?,'Issued','platform-admin',?)`).run(hash, today, expiry, new Date().toISOString());

    const cloudApp = express();
    registerDesktopLicenseActivation(cloudApp, cloud, () => undefined, (_req, _res, next) => next());
    const cloudActivate = handlerAt(cloudApp, '/api/desktop/licenses/activate');

    process.env.NIVASBOOK_DESKTOP_TOKEN = 'this-is-a-stable-test-device-token';
    process.env.NIVASBOOK_LICENSE_SERVER_URL = 'https://license-test.example';
    local.exec("INSERT INTO users VALUES ('local-user','Test Owner','owner@example.test','local-org'); INSERT INTO organizations VALUES ('local-org','Local PG','local-user','Trial','Trial','',''); INSERT INTO commercial_plans VALUES ('STARTER',1);");
    const localApp = express();
    registerDesktopLicenseActivation(localApp, local, () => ({ id: 'local-user', email: 'owner@example.test', organizationId: 'local-org' }), (_req, _res, next) => next());
    const localActivate = handlerAt(localApp, '/api/license/activate');
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body || '{}'));
      const result = await invoke(cloudActivate, { body: requestBody, ip: 'test-client' });
      return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const activation = await invoke(localActivate, { body: { key }, ip: 'desktop-test', session: {} });
    assert.equal(activation.status, 200, JSON.stringify(activation.body));
    assert.deepEqual(activation.body, { ok: true, plan: 'Starter', status: 'Active', expiresAt: expiry });
    assert.equal((cloud.prepare("SELECT status FROM saas_licenses WHERE id='cloud-license'").get() as any).status, 'Active');
    assert.equal((cloud.prepare('SELECT COUNT(*) as count FROM license_device_activations').get() as any).count, 1);
    assert.equal((local.prepare("SELECT status FROM saas_licenses WHERE organization_id='local-org'").get() as any).status, 'Active');
    assert.equal((local.prepare("SELECT status FROM organizations WHERE id='local-org'").get() as any).status, 'Active');

    const secondDevice = await invoke(cloudActivate, { body: { key, deviceId: createHash('sha256').update('another-device').digest('hex') }, ip: 'test-client' });
    assert.equal(secondDevice.status, 409);
  } finally {
    globalThis.fetch = originalFetch;
    cloud.close();
    local.close();
    if (original.enabled === undefined) delete process.env.NIVASBOOK_ENABLE_DESKTOP_LICENSE_ACTIVATION;
    else process.env.NIVASBOOK_ENABLE_DESKTOP_LICENSE_ACTIVATION = original.enabled;
    if (original.desktopToken === undefined) delete process.env.NIVASBOOK_DESKTOP_TOKEN;
    else process.env.NIVASBOOK_DESKTOP_TOKEN = original.desktopToken;
    if (original.serverUrl === undefined) delete process.env.NIVASBOOK_LICENSE_SERVER_URL;
    else process.env.NIVASBOOK_LICENSE_SERVER_URL = original.serverUrl;
  }
});
