import { APP_NAME, WATER_GOAL_ML } from "../services/constants.js";
import { escapeHtml } from "../services/dom-utils.js";

export function renderProgressHeader({
  dateLabel,
  activeView,
  percentage,
  completed,
  total,
  waterTotalMl,
  installAvailable
}) {
  const progressWidth = `${percentage}%`;

  return `
    <header class="hero-card" data-testid="progress-header">
      <div class="hero-topline">
        <div>
          <p class="eyebrow">${escapeHtml(dateLabel)}</p>
          <h1 data-testid="app-title">${escapeHtml(APP_NAME)}</h1>
        </div>
        <div class="hero-pill">${percentage}%</div>
      </div>

      <p class="hero-summary">${completed} de ${total} feitos hoje</p>
      <div class="progress-track" aria-hidden="true">
        <span class="progress-fill" style="width:${progressWidth}"></span>
      </div>

      <div class="hero-metrics">
        <div class="metric-card">
          <span class="metric-label">Checklist</span>
          <strong>${completed}/${total}</strong>
        </div>
        <div class="metric-card water">
          <span class="metric-label">Água</span>
          <strong>${waterTotalMl}/${WATER_GOAL_ML} ml</strong>
        </div>
      </div>

      <div class="hero-actions">
        <button class="tab-button ${activeView === "today" ? "is-active" : ""}" type="button" data-action="switch-view" data-view="today" data-testid="tab-today">Hoje</button>
        <button class="tab-button ${activeView === "history" ? "is-active" : ""}" type="button" data-action="switch-view" data-view="history" data-testid="tab-history">Histórico</button>
        ${
          installAvailable
            ? '<button class="ghost-button" type="button" data-action="install-app" data-testid="install-app-button">Tela inicial</button>'
            : ""
        }
      </div>
    </header>
  `;
}
