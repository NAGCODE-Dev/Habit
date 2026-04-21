import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_TYPES, reduceEvents } from '../eventService.js';
import { compactDate, reconstructDayWithSnapshot, COMPACT_AFTER_EVENTS } from '../snapshotService.js';
import { appendEvent } from '../eventStore.js';
import { validateDay, repairDatabase } from '../integrityService.js';
import { addWater, normalizeAppState, toggleSection, updateHabit, updateMealTime, updateSleepTime } from '../dayService.js';

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

test('dayService ignora inputs inválidos para evitar corrupção de estado', () => {
  const date = '2026-04-21';
  const base = normalizeAppState(null, date);

  const invalidSection = toggleSection(base, '__proto__');
  assert.equal(invalidSection.sectionsOpen.morning, base.sectionsOpen.morning);
  assert.equal(Object.getPrototypeOf(invalidSection.sectionsOpen), Object.prototype);

  const invalidHabitUpdate = updateHabit(base, '__proto__', true);
  assert.equal(invalidHabitUpdate.state.day.habits.runDone, false);

  const invalidSleep = updateSleepTime(base, 'sleepActual', '99:99');
  assert.equal(invalidSleep.day.sleep.actual.sleep, '');

  const invalidMeal = updateMealTime(base, 'lunch', '25:99');
  assert.equal(invalidMeal.day.meals.lunch, '');
});

test('addWater impõe limite superior para evitar payload anômalo', () => {
  const date = '2026-04-21';
  const base = normalizeAppState(null, date);
  const state = addWater(base, 6000);
  assert.equal(state.day.water.total, 0);
});

test('reduceEvents ignora eventos históricos inválidos durante replay', () => {
  const date = '2026-04-21';
  const replay = reduceEvents([
    { id: 'bad-water', date, type: EVENT_TYPES.WATER_ADDED, payload: { amount: 90000, id: 'w-bad' }, timestamp: 1 },
    { id: 'bad-meal', date, type: EVENT_TYPES.MEAL_TIME_SET, payload: { mealId: 'lunch', value: '99:99' }, timestamp: 2 },
    { id: 'ok-water', date, type: EVENT_TYPES.WATER_ADDED, payload: { amount: 300, id: 'w-ok' }, timestamp: 3 }
  ], date);

  assert.equal(replay.water.total, 300);
  assert.equal(replay.meals.lunch, '');
});

test('repairDatabase descarta telemetryShadow legado do Google Fit', () => {
  const date = '2026-04-21';
  const repaired = repairDatabase({
    currentDayKey: date,
    day: { date, water: { total: 300 } },
    telemetryShadow: {
      googleFit: {
        [date]: { steps: '1200', hydrationMl: -10, activeMinutes: 30 }
      }
    }
  }, date);

  assert.equal('telemetryShadow' in repaired, false);
  assert.equal(repaired.day.water.total, 300);
});
