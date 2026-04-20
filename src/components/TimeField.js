import { escapeHtml } from "../services/dom-utils.js";

export function renderTimeField({
  field,
  label,
  value,
  ideal,
  notice = "",
  withNowButton = true
}) {
  return `
    <div class="time-field">
      <div class="time-copy">
        <span class="time-label">${escapeHtml(label)}</span>
        <span class="time-ideal">Ideal ${escapeHtml(ideal)}</span>
      </div>
      <div class="time-controls">
        <input
          class="time-input"
          type="time"
          data-action="time-input"
          data-field="${escapeHtml(field)}"
          value="${escapeHtml(value || "")}"
        />
        ${
          withNowButton
            ? `<button class="ghost-button" type="button" data-action="set-time-now" data-field="${escapeHtml(
                field
              )}">Agora</button>`
            : ""
        }
      </div>
      ${notice ? `<div class="inline-notice">${escapeHtml(notice)}</div>` : ""}
    </div>
  `;
}
