import {
  WATER_GOAL_ML,
  WATER_PRESET_AMOUNTS
} from "../services/constants.js";
import { escapeHtml, formatMl } from "../services/dom-utils.js";

export function renderWaterTracker(day) {
  const percent = Math.min(100, Math.round((day.waterTotalMl / WATER_GOAL_ML) * 100));
  const lastEntry = day.waterEntries.at(-1);
  const helper = day.waterTotalMl >= WATER_GOAL_ML
    ? "Meta diaria atingida."
    : `${WATER_GOAL_ML - day.waterTotalMl} ml restantes para fechar o dia.`;

  return `
    <section class="water-card">
      <div class="water-header">
        <div>
          <p class="eyebrow">Hidratacao</p>
          <h2>${formatMl(day.waterTotalMl)} / ${formatMl(WATER_GOAL_ML)}</h2>
        </div>
        <div class="water-pill">${percent}%</div>
      </div>

      <div class="progress-track water-track" aria-hidden="true">
        <span class="progress-fill water-fill" style="width:${percent}%"></span>
      </div>
      <p class="support-copy">${escapeHtml(helper)}</p>

      <div class="water-presets">
        ${WATER_PRESET_AMOUNTS.map(
          (amount) => `
            <button
              type="button"
              class="action-button"
              data-action="add-water"
              data-amount="${amount}"
            >
              +${amount} ml
            </button>
          `
        ).join("")}
      </div>

      <div class="water-manual-row">
        <label class="field-shell">
          <span class="field-label">Quantidade manual</span>
          <input
            id="manual-water-amount"
            class="text-input"
            type="number"
            inputmode="numeric"
            min="1"
            placeholder="Ex: 330"
          />
        </label>
        <button type="button" class="action-button accent" data-action="add-water-manual">Adicionar</button>
      </div>

      <div class="water-footer">
        <button type="button" class="ghost-button" data-action="undo-water" ${lastEntry ? "" : "disabled"}>
          Desfazer ultimo consumo
        </button>
        <span class="support-copy">
          ${lastEntry ? `Ultimo registro: ${escapeHtml(String(lastEntry.amount))} ml` : "Nenhum consumo registrado ainda."}
        </span>
      </div>
    </section>
  `;
}
