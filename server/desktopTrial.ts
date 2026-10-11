import type Database from 'better-sqlite3';

export type DesktopTrial = { startedAt: string; expiresAt: string };
export type DesktopTrialStatus = {
  mode: 'trial';
  status: 'Trial' | 'Expired';
  startedAt: string;
  expiresAt: string;
  daysRemaining: number;
  expired: boolean;
};

export function getOrCreateDesktopTrial(db: Database.Database, days = 7, now = Date.now()): DesktopTrial {
  db.exec('CREATE TABLE IF NOT EXISTS desktop_trial_state (id INTEGER PRIMARY KEY CHECK(id=1), started_at TEXT NOT NULL, expires_at TEXT NOT NULL)');
  const existing = db.prepare('SELECT started_at as startedAt,expires_at as expiresAt FROM desktop_trial_state WHERE id=1').get() as DesktopTrial | undefined;
  if (existing) return existing;
  const startedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + days * 86400000).toISOString();
  db.prepare('INSERT INTO desktop_trial_state (id,started_at,expires_at) VALUES (1,?,?)').run(startedAt, expiresAt);
  return { startedAt, expiresAt };
}

export function getDesktopTrialStatus(trial: DesktopTrial, now = Date.now()): DesktopTrialStatus {
  const remaining = Math.max(0, Date.parse(trial.expiresAt) - now);
  return {
    mode: 'trial',
    status: remaining ? 'Trial' : 'Expired',
    startedAt: trial.startedAt,
    expiresAt: trial.expiresAt,
    daysRemaining: Math.ceil(remaining / 86400000),
    expired: remaining === 0,
  };
}

export function isDesktopTrialExpired(trial: DesktopTrial | null, enabled: boolean, now = Date.now()): boolean {
  return !!(enabled && trial && getDesktopTrialStatus(trial, now).expired);
}
