import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { test } from 'node:test';
import { getDesktopTrialStatus, getOrCreateDesktopTrial, isDesktopTrialExpired } from './desktopTrial.js';

test('desktop trial persists a seven-day window and expires at its end', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'autrob-trial-test-'));
  const filename = path.join(directory, 'trial.sqlite');
  const now = Date.parse('2026-10-05T10:00:00.000Z');
  try {
    let db = new Database(filename);
    const trial = getOrCreateDesktopTrial(db, 7, now);
    assert.equal(Date.parse(trial.expiresAt) - Date.parse(trial.startedAt), 7 * 86400000);
    assert.equal(getDesktopTrialStatus(trial, now).daysRemaining, 7);
    assert.equal(isDesktopTrialExpired(trial, true, now), false);
    assert.equal(isDesktopTrialExpired(trial, false, now + 8 * 86400000), false, 'trial mode is desktop-only');
    db.close();

    db = new Database(filename);
    const resumedTrial = getOrCreateDesktopTrial(db, 7, now + 3 * 86400000);
    assert.deepEqual(resumedTrial, trial, 'reopening the app does not reset its trial window');
    assert.equal(getDesktopTrialStatus(resumedTrial, Date.parse(trial.expiresAt) - 1).expired, false);
    assert.equal(getDesktopTrialStatus(resumedTrial, Date.parse(trial.expiresAt)).expired, true);
    assert.equal(isDesktopTrialExpired(resumedTrial, true, Date.parse(trial.expiresAt)), true);
    db.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
