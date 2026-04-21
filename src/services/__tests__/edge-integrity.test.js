import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_TYPES, reduceEvents } from '../eventService.js';
import { compactDate, reconstructDayWithSnapshot, COMPACT_AFTER_EVENTS } from '../snapshotService.js';
import { appendEvent } from '../eventStore.js';
import { validateDay, repairDatabase } from '../integrityService.js';
import { addWater, normalizeAppState, updateHabit } from '../dayService.js';

test('reduceEvents é determinístico com eventos fora de ordem', () => {
  const date = '2026-04-21';
  const unordered = [
    { id: 'e2', date, type: EVENT_TYPES.WATER_ADDED, payload: { amount: 300, id: 'w2' }, timestamp: 20 },
    { id: 'e1', date, type: EVENT_TYPES.WATER_ADDED, payload: { amount: 200, id: 'w1' }, timestamp: 10 }
  ];

  const day = reduceEvents(unordered, date);
  assert.equal(day.water.total, 500);
  assert.equal(day.water.logs[0].id, 'w1');
  assert.equal(day.water.logs[1].id, 'w2');
});

test('compaction + append posterior preserva reconstrução correta', () => {
  const date = '2026-04-21';
  const events = Array.from({ length: COMPACT_AFTER_EVENTS + 2 }, (_, index) => ({
    id: `e-${index}`,
    date,
    type: EVENT_TYPES.WATER_ADDED,
    payload: { amount: 100, id: `w-${index}` },
    timestamp: index
  }));

  let state = { currentDayKey: date, events, snapshots: {}, eventArchive: {} };
  state = compactDate(state, date);

  state.events = appendEvent(state.events, {
    date,
    type: EVENT_TYPES.WATER_ADDED,
    payload: { amount: 50, id: 'w-new' },
    timestamp: 999
  });

  const reconstructed = reconstructDayWithSnapshot(state, date);
  assert.equal(reconstructed.water.total, (events.length * 100) + 50);
});

test('repairDatabase remove duplicidade de eventId', () => {
  const date = '2026-04-21';
  const raw = {
    version: 6,
    schemaVersion: 6,
    currentDayKey: date,
    day: { date },
    events: [
      { id: 'dup', date, type: EVENT_TYPES.WATER_ADDED, payload: { amount: 100 }, timestamp: 1 },
      { id: 'dup', date, type: EVENT_TYPES.WATER_ADDED, payload: { amount: 200 }, timestamp: 2 }
    ]
  };

  const repaired = repairDatabase(raw, date);
  assert.equal(repaired.events.length, 1);
});

test('validateDay recalcula meta e corrige snapshot incompleto', () => {
  const date = '2026-04-21';
  const day = validateDay({
    date,
    habits: { sleepOnTime: true },
    water: { total: 3000, logs: [] },
    meta: { completionScore: 0, completed: 0, total: 1, percentage: 0 }
  }, date);

  assert.ok(day.meta.completionScore > 0);
  assert.equal(typeof day.sleep.actual.sleep, 'string');
  assert.equal(Array.isArray(day.water.logs), true);
});

test('duas mutações rápidas sequenciais preservam estado acumulado', () => {
  const date = '2026-04-21';
  const base = normalizeAppState(null, date);
  const afterFirst = addWater(base, 200);
  const second = updateHabit(afterFirst, 'trainingActivation', true);
  const finalState = second.state;

  assert.equal(finalState.day.water.total, 200);
  assert.equal(finalState.day.habits.trainingActivation, true);
});

test('compactação repetida com append intercalado não perde dados', () => {
  const date = '2026-04-21';
  const events = Array.from({ length: COMPACT_AFTER_EVENTS + 1 }, (_, index) => ({
    id: `c-${index}`,
    date,
    type: EVENT_TYPES.WATER_ADDED,
    payload: { amount: 100, id: `cw-${index}` },
    timestamp: index
  }));

  let state = { currentDayKey: date, events, snapshots: {}, eventArchive: {} };
  state = compactDate(state, date);
  state.events = appendEvent(state.events, {
    date,
    type: EVENT_TYPES.WATER_ADDED,
    payload: { amount: 150, id: 'extra' },
    timestamp: 999
  });
  state = compactDate(state, date);

  const reconstructed = reconstructDayWithSnapshot(state, date);
  assert.equal(reconstructed.water.total, (events.length * 100) + 150);
});
