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
const ANALYTICS_CACHE_KEY_VERSION = "ak_v2";

function buildCacheKey(state) {
  const lastEventId = state.eventIndex?.lastEventId ?? "none";
  const newestHistory = state.history?.[0]?.dateKey ?? "none";
  const historySize = state.history?.length ?? 0;
  return `${ANALYTICS_CACHE_KEY_VERSION}:${lastEventId}:${state.currentDayKey}:${newestHistory}:${historySize}`;
}

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

  if (cache.cacheKey !== buildCacheKey(state)) {
    return null;
  }

  if ((Date.now() - cache.lastComputed) > ANALYTICS_CACHE_TTL_MS) {
    return null;
  }

  return cache.payload ?? null;
}

export function refreshAnalyticsCache(state) {
  const cached = getCachedAnalytics(state);
  if (cached) {
    return state;
  }

  const payload = computeAnalytics(state);
  return {
    ...state,
    analyticsCache: {
      payload,
      lastComputed: payload.computedAt,
      cacheKey: buildCacheKey(state)
    }
  };
}

export function getDashboardAnalytics(state) {
  const cached = getCachedAnalytics(state);
  if (cached) {
    return {
      ...cached,
      _source: "cache"
    };
  }

  const live = computeAnalytics(state);
  return {
    ...live,
    _source: "live"
  };
}
