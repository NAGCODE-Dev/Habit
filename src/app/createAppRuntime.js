import { getLocalDateKey } from "../services/date-utils.js";
import {
  buildWaterReminderBody,
  getDueReminder,
  notificationPermissionState,
  notificationsSupported,
  registerBackgroundReminderSync,
  showServiceWorkerNotification
} from "../services/notifications.js";
import { getLegacyDaySnapshot, markReminderSent, normalizeAppState } from "../services/dayService.js";
import { refreshAnalyticsCache } from "../services/analyticsService.js";
import { startDailyResetWatcher } from "../services/reset-scheduler.js";
import { loadState, saveState } from "../services/storageService.js";
import { handleChangeAction, handleClickAction, handleInputAction } from "./action-handlers.js";
import { renderAppShell } from "./renderAppShell.js";

export function createAppRuntime(rootElement) {
  const runtime = {
    root: rootElement,
    state: null,
    activeView: "today",
    toasts: [],
    toastTimers: new Map(),
    beforeInstallEvent: null,
    reminderMode: "foreground-only",
    reminderInterval: 0,
    analyticsTimer: 0,
    isRendering: false,
    stopResetWatcher: null
  };

  runtime.getInitialView = () => {
    const currentUrl = new URL(window.location.href);
    return currentUrl.searchParams.get("view") === "history" ? "history" : "today";
  };

  runtime.syncViewToUrl = () => {
    const currentUrl = new URL(window.location.href);
    if (runtime.activeView === "history") {
      currentUrl.searchParams.set("view", "history");
    } else {
      currentUrl.searchParams.delete("view");
    }

    window.history.replaceState({}, "", currentUrl);
  };

  runtime.handleBeforeInstallPrompt = (event) => {
    event.preventDefault();
    runtime.beforeInstallEvent = event;
    runtime.render();
  };

  runtime.attachGlobalListeners = () => {
    runtime.root.addEventListener("click", (event) => {
      const actionElement = event.target.closest("[data-action]");
      if (!actionElement) {
        return;
      }

      void handleClickAction(runtime, actionElement);
    });

    runtime.root.addEventListener("change", (event) => {
      const target = event.target;
      if (!target?.dataset?.action) {
        return;
      }

      void handleChangeAction(runtime, target);
    });

    runtime.root.addEventListener("input", (event) => {
      const target = event.target;
      if (!target?.dataset?.action) {
        return;
      }

      void handleInputAction(runtime, target);
    });
  };

  runtime.configureNotifications = async () => {
    if (!notificationsSupported()) {
      return;
    }

    const result = await registerBackgroundReminderSync();
    runtime.reminderMode = result.mode;
    runtime.render();
  };

  runtime.ensureCurrentDay = async () => {
    const todayKey = getLocalDateKey();
    if (runtime.state?.currentDayKey === todayKey && runtime.state?.day?.date === todayKey) {
      return;
    }

    runtime.state = normalizeAppState(runtime.state, todayKey);
    await saveState(runtime.state);
    runtime.render();
  };

  runtime.persistState = async (nextState, { render = true } = {}) => {
    runtime.state = normalizeAppState(nextState);
    await saveState(runtime.state);
    if (render) {
      runtime.render();
    }
    runtime.scheduleAnalyticsRefresh();
  };

  runtime.scheduleAnalyticsRefresh = () => {
    window.clearTimeout(runtime.analyticsTimer);
    runtime.analyticsTimer = window.setTimeout(async () => {
      const nextState = refreshAnalyticsCache(runtime.state);
      if (nextState === runtime.state) {
        return;
      }

      runtime.state = nextState;
      await saveState(runtime.state);
      runtime.render();
    }, 0);
  };

  runtime.addToast = (message, tone = "info", duration = 3200) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    runtime.toasts = [...runtime.toasts, { id, message, tone }];
    runtime.render();

    const timer = window.setTimeout(() => {
      runtime.dismissToast(id);
    }, duration);
    runtime.toastTimers.set(id, timer);
  };

  runtime.dismissToast = (id) => {
    const timer = runtime.toastTimers.get(id);
    if (timer) {
      window.clearTimeout(timer);
      runtime.toastTimers.delete(id);
    }

    runtime.toasts = runtime.toasts.filter((toast) => toast.id !== id);
    runtime.render();
  };

  runtime.startReminderPolling = () => {
    window.clearInterval(runtime.reminderInterval);

    const runCheck = async () => {
      const dayView = getLegacyDaySnapshot(runtime.state.day);
      const dueHour = getDueReminder(dayView, new Date());
      if (dueHour === null) {
        return;
      }

      const nextState = markReminderSent(runtime.state, dueHour);
      await runtime.persistState(nextState, { render: true });

      const title = `Água ${String(dueHour).padStart(2, "0")}:00`;
      const body = buildWaterReminderBody(runtime.state.day.water.total);

      if (document.visibilityState === "visible") {
        runtime.addToast(body);
      } else if (notificationPermissionState() === "granted") {
        await showServiceWorkerNotification(
          title,
          body,
          `water-${runtime.state.currentDayKey}-${dueHour}`
        );
      }
    };

    void runCheck();
    runtime.reminderInterval = window.setInterval(() => {
      void runCheck();
    }, 60 * 1000);
  };

  runtime.render = () => {
    if (!runtime.state || runtime.isRendering) {
      return;
    }

    runtime.isRendering = true;
    runtime.root.innerHTML = renderAppShell({
      state: runtime.state,
      activeView: runtime.activeView,
      beforeInstallEvent: runtime.beforeInstallEvent,
      toasts: runtime.toasts,
      reminderMode: runtime.reminderMode
    });
    runtime.isRendering = false;
  };

  runtime.mount = async () => {
    runtime.activeView = runtime.getInitialView();
    runtime.state = normalizeAppState(null);
    runtime.attachGlobalListeners();
    runtime.render();

    const storedState = await loadState();
    runtime.state = normalizeAppState(storedState ?? runtime.state);
    await saveState(runtime.state);
    runtime.render();
    runtime.scheduleAnalyticsRefresh();

    runtime.stopResetWatcher = startDailyResetWatcher(() => {
      void runtime.ensureCurrentDay();
    });
    void runtime.configureNotifications();
    runtime.startReminderPolling();
    window.addEventListener("beforeinstallprompt", runtime.handleBeforeInstallPrompt);
  };

  runtime.destroy = () => {
    window.clearInterval(runtime.reminderInterval);
    window.clearTimeout(runtime.analyticsTimer);
    if (runtime.stopResetWatcher) {
      runtime.stopResetWatcher();
      runtime.stopResetWatcher = null;
    }
    for (const timer of runtime.toastTimers.values()) {
      window.clearTimeout(timer);
    }
    runtime.toastTimers.clear();
    window.removeEventListener("beforeinstallprompt", runtime.handleBeforeInstallPrompt);
  };

  return runtime;
}
