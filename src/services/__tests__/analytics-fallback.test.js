import test from 'node:test';
import assert from 'node:assert/strict';
import { getDashboardAnalytics } from '../analyticsService.js';

test('getDashboardAnalytics usa fallback live quando cache inválido', () => {
  const state = {
    currentDayKey: '2026-04-21',
    eventIndex: { lastEventId: null },
    history: [],
    events: [],
    eventArchive: {},
    snapshots: {},
    analyticsCache: {
      payload: { computedAt: 1, metrics: { currentDayScore: 10 }, insights: [] },
      lastComputed: 0,
      cacheKey: 'invalido'
    }
  };

  const analytics = getDashboardAnalytics(state);
  assert.equal(analytics._source, 'live');
  assert.ok(typeof analytics.computedAt === 'number');
});

