import { escapeHtml } from "../services/dom-utils.js";

export function renderSectionCard({ id, title, subtitle, open, content }) {
  return `
    <section class="section-card ${open ? "is-open" : ""}">
      <button
        class="section-toggle"
        type="button"
        data-action="toggle-section"
        data-section="${escapeHtml(id)}"
        aria-expanded="${open ? "true" : "false"}"
      >
        <span class="section-copy">
          <span class="section-title">${escapeHtml(title)}</span>
          <span class="section-subtitle">${escapeHtml(subtitle)}</span>
        </span>
        <span class="section-chevron">${open ? "−" : "+"}</span>
      </button>
      <div class="section-body ${open ? "is-visible" : ""}">
        ${content}
      </div>
    </section>
  `;
}
