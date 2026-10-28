import crypto from 'node:crypto';
import type express from 'express';
import type Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { normalizePlanCode } from './commercial.js';

type User = { id: string; email: string; organizationId: string };
const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const normalizeKey = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const keyHash = (value: unknown) => crypto.createHash('sha256').update(normalizeKey(value)).digest('hex');

export function registerDesktopLicenseActivation(
  app: express.Express,
  db: Database.Database,
  userFor: (req: express.Request) => User | undefined,
  licenseAuth: express.RequestHandler,
) {
  const attempts = new Map<string, { count: number; expiresAt: number }>();

  app.post('/api/desktop/licenses/activate', (req, res) => {
    if (process.env.NIVASBOOK_ENABLE_DESKTOP_LICENSE_ACTIVATION !== '1') {
      return res.status(404).json({ error: 'Desktop license activation is not enabled.' });
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = attempts.get(ip);
    if (record && record.expiresAt > now && record.count >= 12) {
      return res.status(429).json({ error: 'Too many activation attempts. Wait 15 minutes and try again.' });
    }
    if (!record || record.expiresAt <= now) attempts.set(ip, { count: 1, expiresAt: now + 15 * 60_000 });
    else record.count += 1;

    const normalized = normalizeKey(req.body?.key);
    const deviceId = String(req.body?.deviceId || '');
    const ownerLoginEmail = String(req.body?.ownerLoginEmail || '').trim().toLowerCase();
    const ownerLoginPassword = String(req.body?.ownerLoginPassword || '');
    if (!/^NVB1[A-F0-9]{32}$/.test(normalized) || !/^[A-F0-9]{64}$/i.test(deviceId)) {
      return res.status(400).json({ error: 'Enter a valid activation key from the platform administrator.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerLoginEmail) || ownerLoginPassword.length < 10 || ownerLoginPassword.length > 200) {
      return res.status(400).json({ error: 'Enter the owner login email and password that were set when this license was issued.' });
    }
    const license = db.prepare(`SELECT l.id,l.organization_id as organizationId,l.plan,l.plan_code as planCode,
      l.starts_at as startsAt,l.expires_at as expiresAt,l.status,l.key_hint as keyHint,
      l.owner_login_email as ownerLoginEmail,l.owner_login_password_hash as ownerLoginPasswordHash,
      o.name as pgName,u.id as ownerId,u.email as registeredOwnerEmail,u.password_hash as registeredPasswordHash
      FROM saas_licenses l JOIN organizations o ON o.id=l.organization_id
      JOIN users u ON u.id=o.owner_user_id WHERE l.key_hash=?`).get(keyHash(normalized)) as any;
    if (!license) return res.status(404).json({ error: 'That activation key was not found.' });
    const matchesRegisteredOwner = ownerLoginEmail === String(license.registeredOwnerEmail || '').toLowerCase() && bcrypt.compareSync(ownerLoginPassword, String(license.registeredPasswordHash || ''));
    const matchesLegacyLicenseLogin = Boolean(license.ownerLoginPasswordHash) && ownerLoginEmail === String(license.ownerLoginEmail || '').toLowerCase() && bcrypt.compareSync(ownerLoginPassword, license.ownerLoginPasswordHash);
    if (!matchesRegisteredOwner && !matchesLegacyLicenseLogin) {
      return res.status(401).json({ error: 'Use the registered owner account email and password for this license.' });
    }
    if (license.status === 'Revoked') return res.status(409).json({ error: 'This activation key has been revoked.' });
    const today = new Date().toISOString().slice(0, 10);
    if (license.startsAt > today || license.expiresAt < today || license.status === 'Expired') {
      if (license.status === 'Issued') db.prepare("UPDATE saas_licenses SET status='Expired' WHERE id=? AND status='Issued'").run(license.id);
      return res.status(400).json({ error: 'This activation key is outside its valid dates.' });
    }
    const deviceHash = crypto.createHash('sha256').update(deviceId).digest('hex');
    const existing = db.prepare('SELECT activation_id as activationId,status FROM license_device_activations WHERE license_id=? AND device_id_hash=?').get(license.id, deviceHash) as any;
    if (existing?.status === 'Revoked') return res.status(409).json({ error: 'This device activation was reset by the platform administrator.' });
    const activeCount = Number((db.prepare("SELECT COUNT(*) as count FROM license_device_activations WHERE license_id=? AND status='Active'").get(license.id) as any)?.count || 0);
    const planCode = normalizePlanCode(license.planCode || license.plan);
    const plan = db.prepare('SELECT max_devices as maxDevices FROM commercial_plans WHERE plan_code=?').get(planCode) as any;
    const maxDevices = 1; // Desktop licenses are limited to one active Windows PC.
    if (!existing && activeCount >= maxDevices) {
      return res.status(409).json({ error: `This license is already activated on its ${maxDevices} permitted device${maxDevices === 1 ? '' : 's'}. Ask the administrator to reset a device.` });
    }

    const activatedAt = nowIso();
    const activate = db.transaction(() => {
      db.prepare("UPDATE saas_licenses SET status='Active',activated_by=?,activated_at=CASE WHEN activated_at='' THEN ? ELSE activated_at END WHERE id=? AND status IN ('Issued','Active')")
        .run(license.ownerId, activatedAt, license.id);
      db.prepare("UPDATE organizations SET plan=?,status='Active',trial_ends_at='',next_billing_at=? WHERE id=?")
        .run(license.plan, license.expiresAt, license.organizationId);
      db.prepare("UPDATE commercial_trials SET trial_status='CONVERTED',converted_to_paid=1,updated_at=? WHERE business_id=? AND trial_status IN ('ACTIVE','EXPIRED')")
        .run(activatedAt, license.organizationId);
      if (!existing) {
        db.prepare(`INSERT INTO license_device_activations
          (activation_id,license_id,business_id,device_id_hash,device_name,status,activated_at,last_validated_at)
          VALUES (?,?,?,?,?,'Active',?,?)`).run(uid(), license.id, license.organizationId, deviceHash, 'Windows Desktop', activatedAt, activatedAt);
      } else {
        db.prepare("UPDATE license_device_activations SET last_validated_at=? WHERE activation_id=?").run(activatedAt, existing.activationId);
      }
      db.prepare('INSERT INTO commercial_audit_log (audit_id,actor_id,action,entity,entity_id,previous_json,new_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(uid(), license.ownerId, existing ? 'desktop_license.revalidated' : 'desktop_license.activated', 'license', license.id, '{}', JSON.stringify({ deviceHash, planCode }), activatedAt);
    });
    activate();
    res.json({ ok: true, plan: license.plan, expiresAt: license.expiresAt, pgName: license.pgName, ownerLoginEmail: license.ownerLoginEmail });
  });

  app.post('/api/license/activate', licenseAuth, async (req, res, next) => {
    const licenseServerUrl = process.env.NIVASBOOK_LICENSE_SERVER_URL?.trim();
    const desktop = Boolean(process.env.NIVASBOOK_DESKTOP_TOKEN);
    if (!desktop || !licenseServerUrl) return next();
    const user = userFor(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
    const deviceToken = process.env.NIVASBOOK_DESKTOP_TOKEN || '';
    const deviceId = crypto.createHash('sha256').update(deviceToken).digest('hex');
    try {
      const endpoint = new URL('/api/desktop/licenses/activate', licenseServerUrl);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: req.body?.key, deviceId, ownerLoginEmail: req.body?.ownerLoginEmail, ownerLoginPassword: req.body?.ownerLoginPassword }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json().catch(() => ({})) as any;
      if (!response.ok) return res.status(response.status).json({ error: result.error || 'The license server rejected this activation.' });
      const normalized = normalizeKey(req.body?.key);
      const hash = keyHash(normalized);
      const licenseId = uid();
      const activatedAt = nowIso();
      const planCode = normalizePlanCode(result.plan);
      const applyLocal = db.transaction(() => {
        const existing = db.prepare('SELECT id FROM saas_licenses WHERE key_hash=?').get(hash) as any;
        if (existing) {
          db.prepare("UPDATE saas_licenses SET status='Active',activated_by=?,activated_at=?,expires_at=?,plan=?,plan_code=? WHERE id=?")
            .run(user.id, activatedAt, result.expiresAt, result.plan, planCode, existing.id);
        } else {
          db.prepare(`INSERT INTO saas_licenses
            (id,organization_id,key_hash,key_hint,plan,starts_at,expires_at,status,activated_by,activated_at,created_by,created_at,revoked_at,plan_code,subscription_id)
            VALUES (?,?,?,?,?,?,?,'Active',?,?,?,?,'',?,?)`).run(
              licenseId, user.organizationId, hash, '•••• ' + normalized.slice(-4), result.plan,
              new Date().toISOString().slice(0, 10), result.expiresAt, user.id, activatedAt, user.id, activatedAt, planCode, '',
            );
        }
        db.prepare("UPDATE organizations SET plan=?,status='Active',trial_ends_at='',next_billing_at=? WHERE id=?").run(result.plan, result.expiresAt, user.organizationId);
        db.prepare("UPDATE commercial_trials SET trial_status='CONVERTED',converted_to_paid=1,updated_at=? WHERE business_id=? AND trial_status IN ('ACTIVE','EXPIRED')").run(activatedAt, user.organizationId);
        db.prepare('INSERT INTO activities (id,organization_id,title,detail,kind,created_at) VALUES (?,?,?,?,?,?)').run(uid(), user.organizationId, 'Paid plan activated', result.plan + ' plan · valid until ' + result.expiresAt, 'license', activatedAt);
        db.prepare('INSERT INTO audit_log (id,organization_id,user_id,action,entity,entity_id,created_at) VALUES (?,?,?,?,?,?,?)').run(uid(), user.organizationId, user.id, 'license.activated.remotely', 'license', licenseId, activatedAt);
      });
      applyLocal();
      return res.json({ ok: true, plan: result.plan, status: 'Active', expiresAt: result.expiresAt });
    } catch (error) {
      console.error('Desktop remote license activation failed:', error);
      return res.status(502).json({ error: 'Could not reach the license server. Check your internet connection and try again.' });
    }
  });
}
