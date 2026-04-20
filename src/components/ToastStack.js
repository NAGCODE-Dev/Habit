import { escapeHtml } from "../services/dom-utils.js";

export function renderToastStack(toasts) {
  return `
    <div class="toast-stack" aria-live="polite" aria-atomic="true">
      ${toasts
        .map(
          (toast) => `
            <div class="toast ${toast.tone === "warning" ? "warning" : ""}">
              <span>${escapeHtml(toast.message)}</span>
              <button
                type="button"
                class="toast-close"
                data-action="dismiss-toast"
                data-toast-id="${escapeHtml(toast.id)}"
                aria-label="Fechar aviso"
              >
                x
              </button>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}
