import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceEvents, EVENT_TYPES } from '../eventService.js';
import { createSafeDayTemplate } from '../integrityService.js';

test('reduceEvents aplica apenas delta apos startAfterEventId', () => {
  const date = '2026-04-21';
  const base = createSafeDayTemplate(date);
  base.water.total = 500;
  base.water.logs = [{ id: 'base-1', amount: 500, timestamp: new Date().toISOString() }];

  const events = [
    { id: 'e1', date, type: EVENT_TYPES.WATER_ADDED, payload: { amount: 300, id: 'w1' }, timestamp: 1 },
    { id: 'e2', date, type: EVENT_TYPES.WATER_ADDED, payload: { amount: 200, id: 'w2' }, timestamp: 2 }
  ];

  const day = reduceEvents(events, date, { baseDay: base, startAfterEventId: 'e1' });
  assert.equal(day.water.total, 700);
});
