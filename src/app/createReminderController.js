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

  function stopPolling() {
    windowObject.clearInterval(reminderInterval);
    reminderInterval = 0;
  }

  async function checkNow(date = new Date()) {
    const state = getState();
    if (!state?.day) {
      return null;
    }

    const dayView = getLegacyDaySnapshotImpl(state.day);
    const dueHour = getDueReminderImpl(dayView, date);
    if (dueHour === null) {
      return null;
    }

    const nextState = markReminderSentImpl(state, dueHour);
    await commitState(nextState, { render: true });

    const currentState = getState();
    const title = `Água ${String(dueHour).padStart(2, "0")}:00`;
    const body = buildWaterReminderBodyImpl(currentState.day.water.total);

    if (documentObject.visibilityState === "visible") {
      addToast(body);
    } else if (notificationPermissionStateImpl() === "granted") {
      await showServiceWorkerNotificationImpl(
        title,
        body,
        `water-${currentState.currentDayKey}-${dueHour}`
      );
    }

    return dueHour;
  }

  return {
    getReminderMode() {
      return reminderMode;
    },
    async configureNotifications() {
      if (!notificationsSupportedImpl()) {
        return reminderMode;
      }

      const result = await registerBackgroundReminderSyncImpl();
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
      stopPolling();
    }
  };
}
