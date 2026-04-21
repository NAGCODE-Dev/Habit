import test from "node:test";
import assert from "node:assert/strict";
import { EVENT_TYPES, reduceEvents } from "../../src/services/eventService.js";
import {
  COMPACT_AFTER_EVENTS,
  compactDate,
  reconstructDayWithSnapshot
} from "../../src/services/snapshotService.js";

test("compactDate gera snapshot e preserva reconstrução", () => {
  const date = "2026-04-21";
  const events = Array.from({ length: COMPACT_AFTER_EVENTS + 1 }, (_, index) => ({
    id: `e-${index}`,
    date,
    type: EVENT_TYPES.WATER_ADDED,
    payload: { amount: 100, id: `w-${index}` },
    timestamp: index
  }));

  const state = {
    currentDayKey: date,
    events,
    eventArchive: {},
    snapshots: {}
  };

  const compacted = compactDate(state, date);
  assert.ok(compacted.snapshots[date]);
  assert.equal(compacted.events.filter((event) => event.date === date).length, 0);
  assert.equal(compacted.eventArchive[date].length, COMPACT_AFTER_EVENTS + 1);

  const fullReplay = reduceEvents(events, date);
  const reconstructed = reconstructDayWithSnapshot(compacted, date);
  assert.equal(reconstructed.water.total, fullReplay.water.total);
});
