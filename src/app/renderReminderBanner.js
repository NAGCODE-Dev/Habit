import { escapeHtml } from "../services/dom-utils.js";
import {
  notificationPermissionState,
  notificationsSupported,
  reminderScheduleText,
  reminderSupportMessage
} from "../services/notifications.js";

export function renderReminderBanner(state, reminderMode) {
  if (!notificationsSupported()) {
    return `
      <section class="notice-card">
        <p class="notice-title">Lembretes de água</p>
        <p class="support-copy">Este navegador não oferece Notification API. O controle fino de água continua funcionando normalmente.</p>
      </section>
    `;
  }

  const permission = notificationPermissionState();
  const promptDismissed = state.preferences.reminderPromptDismissed;

  if (permission === "granted") {
    return `
      <section class="notice-card success">
        <div>
          <p class="notice-title">Lembretes de água</p>
          <p class="support-copy">${escapeHtml(reminderSupportMessage(reminderMode))}</p>
          <p class="tiny-copy">Horários: ${escapeHtml(reminderScheduleText())}</p>
        </div>
      </section>
    `;
  }

  if (promptDismissed) {
    return "";
  }

  return `
    <section class="notice-card">
      <div>
        <p class="notice-title">Lembretes de água</p>
        <p class="support-copy">Avisos às 8h, 10h, 12h, 14h, 16h, 18h e 20h. Se o navegador deixar, eles também rodam pelo service worker.</p>
      </div>
      <div class="notice-actions">
        <button type="button" class="action-button accent" data-action="request-notifications">Permitir</button>
        <button type="button" class="ghost-button" data-action="dismiss-reminder-prompt">Agora não</button>
      </div>
    </section>
  `;
}
