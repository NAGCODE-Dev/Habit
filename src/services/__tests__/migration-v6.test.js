import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateIfNeeded } from '../integrityService.js';

test('migracao v5 -> v6 preserva dados e normaliza analyticsCache', () => {
  const raw = {
    version: 5,
    schemaVersion: 5,
    currentDayKey: '2026-04-21',
    day: { date: '2026-04-21' },
    analyticsCache: { payload: { x: 1 }, lastComputed: '10' }
  };

  const migrated = migrateIfNeeded(raw, '2026-04-21');
  assert.equal(migrated.schemaVersion, 6);
  assert.equal(migrated.analyticsCache.lastComputed, 10);
  assert.deepEqual(migrated.analyticsCache.payload, { x: 1 });
});
