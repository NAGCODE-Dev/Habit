import { getAllDays } from "./analyticsQueryService.js";
import {
  sleepMetrics,
  waterMetrics,
  weeklyConsistency,
  weightedScore,
  workoutMetrics
} from "./metricsService.js";
import { generateInsights } from "./insightsService.js";

const ANALYTICS_CACHE_TTL_MS = 5 * 60 * 1000;

export function computeAnalytics(state) {
  const days = getAllDays(state);
  const consistency = weeklyConsistency(days);
  const water = waterMetrics(days);
  const workout = workoutMetrics(days);
  const sleep = sleepMetrics(days);
  const currentDayScore = days[0] ? weightedScore(days[0]) : 0;
  const metrics = {
    consistency,
    water,
    workout,
    sleep,
    currentDayScore
  };

  return {
    computedAt: Date.now(),
    metrics,
    insights: generateInsights(metrics)
  };
}

export function getCachedAnalytics(state) {
  const cache = state.analyticsCache;
  if (!cache || !cache.lastComputed) {
    return null;
  }

  if ((Date.now() - cache.lastComputed) > ANALYTICS_CACHE_TTL_MS) {
    return null;
  }

  return cache.payload ?? null;
}

export function refreshAnalyticsCache(state) {
  const payload = computeAnalytics(state);
  return {
    ...state,
    analyticsCache: {
      payload,
      lastComputed: payload.computedAt
    }
  };
}
