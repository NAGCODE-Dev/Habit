// @ts-check

import { getLocalDateKey } from "../services/date-utils.js";
import { refreshAnalyticsCache } from "../services/analyticsService.js";
import { normalizeAppState } from "../services/dayService.js";
import { loadState, saveState } from "../services/storageService.js";

/**
 * Orquestra leitura, normalização, persistência e refresh de analytics.
 */
export function createStateController({
  windowObject = window,
  onStateChange = (_state) => {},
  loadStateImpl = loadState,
  saveStateImpl = saveState,
  normalizeAppStateImpl = normalizeAppState,
  refreshAnalyticsCacheImpl = refreshAnalyticsCache,
  getTodayKey = getLocalDateKey
} = {}) {
  let state = null;
  let analyticsTimer = 0;
  let persistTimer = 0;
  let pendingPersistEntries = [];
  let lifecycleVersion = 0;

  function isStale(version) {
    return version !== lifecycleVersion;
  }

  function notifyStateChange(shouldRender) {
    if (shouldRender) {
      onStateChange(state);
    }
  }

  function clearPendingPersist() {
    if (!persistTimer) {
      return null;
    }

    windowObject.clearTimeout(persistTimer);
    persistTimer = 0;

    const entries = pendingPersistEntries;
    pendingPersistEntries = [];
    return entries;
  }

  async function persistCurrentState() {
    const pendingEntries = clearPendingPersist();
    await saveStateImpl(state);

    if (pendingEntries) {
      for (const entry of pendingEntries) {
        entry.resolve(state);
      }
    }

    return state;
  }

  function scheduleAnalyticsRefresh(version = lifecycleVersion) {
    windowObject.clearTimeout(analyticsTimer);
    analyticsTimer = windowObject.setTimeout(async () => {
      if (isStale(version)) {
        return;
      }

      const nextState = refreshAnalyticsCacheImpl(state);
      if (nextState === state || isStale(version)) {
        return;
      }

      state = nextState;
      await saveStateImpl(state);
      if (isStale(version)) {
        return;
      }
      onStateChange(state);
    }, 0);
  }

  function schedulePersist(debounceMs, version = lifecycleVersion) {
    const existingEntries = clearPendingPersist();
    if (existingEntries) {
      for (const entry of existingEntries) {
        entry.resolve(state);
      }
    }

    return new Promise((resolve, reject) => {
      pendingPersistEntries.push({ resolve, reject });
      persistTimer = windowObject.setTimeout(async () => {
        const entries = pendingPersistEntries;
        pendingPersistEntries = [];
        persistTimer = 0;

        try {
          if (!isStale(version)) {
            await saveStateImpl(state);
          }
          for (const entry of entries) {
            entry.resolve(state);
          }
        } catch (error) {
          for (const entry of entries) {
            entry.reject(error);
          }
        }
      }, debounceMs);
    });
  }

  return {
    getState() {
      return state;
    },
    async bootstrap() {
      const version = lifecycleVersion;
      state = normalizeAppStateImpl(null);
      if (!isStale(version)) {
        onStateChange(state);
      }

      const storedState = await loadStateImpl();
      if (isStale(version)) {
        return state;
      }
      state = normalizeAppStateImpl(storedState ?? state);
      await saveStateImpl(state);
      if (isStale(version)) {
        return state;
      }
      onStateChange(state);
      scheduleAnalyticsRefresh(version);

      return state;
    },
    async commit(nextState, {
      render = true,
      debounceMs = 0,
      scheduleAnalytics = true
    } = {}) {
      const version = lifecycleVersion;
      state = normalizeAppStateImpl(nextState);

      if (scheduleAnalytics) {
        scheduleAnalyticsRefresh(version);
      }

      if (debounceMs > 0) {
        if (!isStale(version)) {
          notifyStateChange(render);
        }
        return schedulePersist(debounceMs, version);
      }

      await persistCurrentState();
      if (!isStale(version)) {
        notifyStateChange(render);
      }
      return state;
    },
    async ensureCurrentDay() {
      const version = lifecycleVersion;
      const todayKey = getTodayKey();
      if (state?.currentDayKey === todayKey && state?.day?.date === todayKey) {
        return state;
      }

      state = normalizeAppStateImpl(state, todayKey);
      await persistCurrentState();
      if (!isStale(version)) {
        onStateChange(state);
      }
      return state;
    },
    async flushPendingPersist() {
      if (!persistTimer) {
        return state;
      }

      return persistCurrentState();
    },
    destroy() {
      lifecycleVersion += 1;
      const pendingEntries = clearPendingPersist();
      if (pendingEntries) {
        for (const entry of pendingEntries) {
          entry.resolve(state);
        }
      }
      windowObject.clearTimeout(analyticsTimer);
      analyticsTimer = 0;
    }
  };
}
