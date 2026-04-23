// @ts-check

import {
  WATER_GOAL_ML,
  WATER_REMINDER_HOURS
} from "./constants.js";
import { findDueReminderHour, reminderLabel } from "./date-utils.js";
import { logOperationalWarning } from "./logger.js";

const NOTIFICATION_ACK_TIMEOUT_MS = 2500;

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermissionState() {
  if (!notificationsSupported()) {
    return "unsupported";
  }

  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) {
    return "unsupported";
  }

  return Notification.requestPermission();
}

export async function registerBackgroundReminderSync() {
  if (!("serviceWorker" in navigator)) {
    return { supported: false, mode: "none" };
  }

  try {
    const registration = /** @type {ServiceWorkerRegistration & { periodicSync?: { register?: (tag: string, options: { minInterval: number }) => Promise<void> } }} */ (
      await navigator.serviceWorker.ready
    );
    const periodicSync = registration.periodicSync;
    if (periodicSync && typeof periodicSync.register === "function") {
      await periodicSync.register("water-reminders", {
        minInterval: 60 * 60 * 1000
      });
      return { supported: true, mode: "periodicSync" };
    }
  } catch (error) {
    logOperationalWarning("notifications/background-sync", error, {
      silence: shouldSilenceBackgroundSyncError(error),
      context: {
        notificationsSupported: notificationsSupported(),
        serviceWorkerSupported: "serviceWorker" in navigator
      }
    });
  }

  return { supported: false, mode: "foreground-only" };
}

export function shouldSilenceBackgroundSyncError(error) {
  const name = String(error?.name ?? "");
  const message = String(error?.message ?? "");
  return name === "NotAllowedError"
    || message.includes("NotAllowedError");
}

export async function showServiceWorkerNotification(title, body, tag) {
  if (!("serviceWorker" in navigator)) {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  if (!registration.active) {
    return false;
  }

  const requestId = `sw-notice-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const channel = new MessageChannel();

  return new Promise((resolve) => {
    let settled = false;

    function finish(result) {
      if (settled) {
        return;
      }

      settled = true;
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
      clearTimeout(timeoutId);
      resolve(result);
    }

    const timeoutId = setTimeout(() => {
      finish(false);
    }, NOTIFICATION_ACK_TIMEOUT_MS);

    channel.port1.onmessage = (event) => {
      const payload = event.data ?? {};
      if (payload.requestId !== requestId) {
        return;
      }

      finish(payload.ok === true);
    };

    try {
      registration.active.postMessage({
        type: "SHOW_NOTIFICATION",
        payload: {
          requestId,
          title,
          body,
          tag
        }
      }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

export function buildWaterReminderBody(currentMl) {
  if (currentMl >= WATER_GOAL_ML) {
    return "Meta de agua concluida. Mantenha o ritmo ao longo do dia.";
  }

  return `Hora de beber agua. Hoje: ${currentMl} / ${WATER_GOAL_ML} ml.`;
}

export function getDueReminder(day, date = new Date()) {
  if (!day || day.waterTotalMl >= WATER_GOAL_ML) {
    return null;
  }

  return findDueReminderHour(date, day.reminderSentHours ?? []);
}

export function reminderSupportMessage(mode) {
  if (mode === "periodicSync") {
    return "Lembretes em segundo plano ativos quando o navegador permitir.";
  }

  return "Em navegadores sem sincronizacao em segundo plano, os alertas ficam ativos enquanto o app estiver aberto.";
}

export function reminderScheduleText() {
  return WATER_REMINDER_HOURS.map((hour) => reminderLabel(hour)).join("  ");
}
