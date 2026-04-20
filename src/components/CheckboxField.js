import { escapeHtml } from "../services/dom-utils.js";

export function renderCheckboxField({
  id,
  label,
  checked,
  hint = "",
  disabled = false,
  badge = ""
}) {
  return `
    <label class="check-row ${checked ? "is-checked" : ""} ${disabled ? "is-disabled" : ""}">
      <input
        class="check-input"
        type="checkbox"
        data-action="toggle-checkbox"
        data-id="${escapeHtml(id)}"
        ${checked ? "checked" : ""}
        ${disabled ? "disabled" : ""}
      />
      <span class="check-copy">
        <span class="check-topline">
          <span class="check-label">${escapeHtml(label)}</span>
          ${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : ""}
        </span>
        ${hint ? `<span class="check-hint">${escapeHtml(hint)}</span>` : ""}
      </span>
    </label>
  `;
}
