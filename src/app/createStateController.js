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
  onStateChange = () => {},
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

  function scheduleAnalyticsRefresh() {
    windowObject.clearTimeout(analyticsTimer);
    analyticsTimer = windowObject.setTimeout(async () => {
      const nextState = refreshAnalyticsCacheImpl(state);
      if (nextState === state) {
        return;
      }

      state = nextState;
      await saveStateImpl(state);
      onStateChange(state);
    }, 0);
  }

  function schedulePersist(debounceMs) {
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
          await saveStateImpl(state);
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
      state = normalizeAppStateImpl(null);
      onStateChange(state);

      const storedState = await loadStateImpl();
      state = normalizeAppStateImpl(storedState ?? state);
      await saveStateImpl(state);
      onStateChange(state);
      scheduleAnalyticsRefresh();

      return state;
    },
    async commit(nextState, {
      render = true,
      debounceMs = 0,
      scheduleAnalytics = true
    } = {}) {
      state = normalizeAppStateImpl(nextState);

      if (scheduleAnalytics) {
        scheduleAnalyticsRefresh();
      }

      if (debounceMs > 0) {
        notifyStateChange(render);
        return schedulePersist(debounceMs);
      }

      await persistCurrentState();
      notifyStateChange(render);
      return state;
    },
    async ensureCurrentDay() {
      const todayKey = getTodayKey();
      if (state?.currentDayKey === todayKey && state?.day?.date === todayKey) {
        return state;
      }

      state = normalizeAppStateImpl(state, todayKey);
      await persistCurrentState();
      onStateChange(state);
      return state;
    },
    async flushPendingPersist() {
      if (!persistTimer) {
        return state;
      }

      return persistCurrentState();
    },
    destroy() {
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
