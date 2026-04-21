import test from "node:test";
import assert from "node:assert/strict";
import { migrateIfNeeded } from "../../src/services/integrityService.js";

test("migracao v6 -> v7 remove telemetryShadow legado e preserva analyticsCache", () => {
  const raw = {
    version: 6,
    schemaVersion: 6,
    currentDayKey: "2026-04-21",
    day: { date: "2026-04-21" },
    analyticsCache: { payload: { x: 1 }, lastComputed: "10" },
    telemetryShadow: {
      googleFit: {
        "2026-04-21": { steps: 5000 }
      }
    }
  };

  const migrated = migrateIfNeeded(raw, "2026-04-21");
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(migrated.version, 7);
  assert.equal("telemetryShadow" in migrated, false);
  assert.equal(migrated.analyticsCache.lastComputed, 10);
  assert.deepEqual(migrated.analyticsCache.payload, { x: 1 });
});
