import {
  WATER_GOAL_ML,
  WATER_REMINDER_HOURS
} from "./constants.js";
import { findDueReminderHour, reminderLabel } from "./date-utils.js";

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
    const registration = await navigator.serviceWorker.ready;
    if ("periodicSync" in registration) {
      await registration.periodicSync.register("water-reminders", {
        minInterval: 60 * 60 * 1000
      });
      return { supported: true, mode: "periodicSync" };
    }
  } catch (error) {
    if (!shouldSilenceBackgroundSyncError(error)) {
      console.warn("Background reminder sync unavailable", error);
    }
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
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  if (!registration.active) {
    return;
  }

  registration.active.postMessage({
    type: "SHOW_NOTIFICATION",
    payload: {
      title,
      body,
      tag
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
