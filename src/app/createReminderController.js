// @ts-check

import { getLegacyDaySnapshot, markReminderSent } from "../services/dayService.js";
import {
  buildWaterReminderBody,
  getDueReminder,
  notificationPermissionState,
  notificationsSupported,
  registerBackgroundReminderSync,
  showServiceWorkerNotification
} from "../services/notifications.js";

/**
 * Controla polling de lembretes e integração opcional com notificações.
 */
export function createReminderController({
  windowObject = window,
  documentObject = document,
  getState,
  commitState,
  addToast,
  onModeChange = (_mode) => {},
  getDueReminderImpl = getDueReminder,
  markReminderSentImpl = markReminderSent,
  getLegacyDaySnapshotImpl = getLegacyDaySnapshot,
  buildWaterReminderBodyImpl = buildWaterReminderBody,
  notificationPermissionStateImpl = notificationPermissionState,
  registerBackgroundReminderSyncImpl = registerBackgroundReminderSync,
  notificationsSupportedImpl = notificationsSupported,
  showServiceWorkerNotificationImpl = showServiceWorkerNotification
}) {
  let reminderMode = "foreground-only";
  let reminderInterval = 0;
  let lifecycleVersion = 0;

  function isStale(version) {
    return version !== lifecycleVersion;
  }

  function stopPolling() {
    windowObject.clearInterval(reminderInterval);
    reminderInterval = 0;
  }

  async function checkNow(date = new Date()) {
    const version = lifecycleVersion;
    const state = getState();
    if (!state?.day) {
      return null;
    }

    const dayView = getLegacyDaySnapshotImpl(state.day);
    const dueHour = getDueReminderImpl(dayView, date);
    if (dueHour === null) {
      return null;
    }

    const title = `Água ${String(dueHour).padStart(2, "0")}:00`;
    const body = buildWaterReminderBodyImpl(state.day.water.total);

    if (documentObject.visibilityState === "visible") {
      addToast(body);
    } else if (notificationPermissionStateImpl() === "granted") {
      await showServiceWorkerNotificationImpl(
        title,
        body,
        `water-${state.currentDayKey}-${dueHour}`
      );
    } else {
      return null;
    }

    if (isStale(version)) {
      return null;
    }

    const nextState = markReminderSentImpl(state, dueHour);
    await commitState(nextState, { render: true });
    if (isStale(version)) {
      return null;
    }

    return dueHour;
  }

  return {
    getReminderMode() {
      return reminderMode;
    },
    async configureNotifications() {
      const version = lifecycleVersion;
      if (!notificationsSupportedImpl()) {
        return reminderMode;
      }

      const result = await registerBackgroundReminderSyncImpl();
      if (isStale(version)) {
        return reminderMode;
      }
      reminderMode = result.mode;
      onModeChange(reminderMode);
      return reminderMode;
    },
    start() {
      stopPolling();
      void checkNow();
      reminderInterval = windowObject.setInterval(() => {
        void checkNow();
      }, 60 * 1000);
    },
    stop() {
      stopPolling();
    },
    checkNow,
    destroy() {
      lifecycleVersion += 1;
      stopPolling();
    }
  };
}
