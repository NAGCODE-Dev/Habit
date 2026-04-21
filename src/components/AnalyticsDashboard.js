import { escapeHtml } from "../services/dom-utils.js";

function levelClass(percentage) {
  if (percentage < 30) return "level-red";
  if (percentage < 50) return "level-orange";
  if (percentage < 80) return "level-yellow";
  return "level-green";
}

function buildWeeklyHeatmap(history, currentSummary) {
  const entries = [currentSummary, ...(history ?? [])]
    .filter(Boolean)
    .filter((entry, index, array) => array.findIndex((item) => item.dateKey === entry.dateKey) === index)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
    .slice(0, 7)
    .reverse();

  return entries
    .map((entry) => {
      const percentage = Number(entry.percentage ?? 0);
      return `
        <div class="mini-heat-cell ${levelClass(percentage)}" title="${escapeHtml(`${entry.dateKey}: ${percentage}%`)}" aria-label="${escapeHtml(`${entry.dateKey}: ${percentage}%`)}">
          <span>${percentage}%</span>
        </div>
      `;
    })
    .join("");
}

export function renderAnalyticsDashboard({ analytics, history, currentSummary }) {
  if (!analytics || !analytics.metrics) {
    return `
      <section class="analytics-card">
        <div>
          <p class="eyebrow">Dashboard</p>
          <h2>Resumo semanal</h2>
        </div>
        <p class="support-copy">Analytics indisponível no momento. O app continua registrando seus eventos normalmente.</p>
      </section>
    `;
  }

  const consistency = analytics.metrics.consistency;
  const water = analytics.metrics.water;
  const workout = analytics.metrics.workout;
  const sleep = analytics.metrics.sleep;
  const insights = Array.isArray(analytics.insights) ? analytics.insights.slice(0, 2) : [];
  const updatedAt = analytics.computedAt ? new Date(analytics.computedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--";
  const sourceLabel = analytics._source === "cache" ? "cache" : "realtime";

  return `
    <section class="analytics-card">
      <div class="history-topline">
        <div>
          <p class="eyebrow">Dashboard</p>
          <h2>Resumo semanal</h2>
        </div>
        <div class="history-pill">${analytics.metrics.currentDayScore}%</div>
      </div>

      <div class="analytics-grid">
        <div class="metric-card">
          <span class="metric-label">Consistência</span>
          <strong>${consistency.completionRate}%</strong>
          <p class="tiny-copy">${consistency.completedDays}/${consistency.activeDays} dias fortes</p>
        </div>
        <div class="metric-card water">
          <span class="metric-label">Hidratação média</span>
          <strong>${water.avgPerDay} ml</strong>
          <p class="tiny-copy">streak: ${water.streakAboveGoal} dia(s)</p>
        </div>
        <div class="metric-card">
          <span class="metric-label">Treino</span>
          <strong>${workout.workoutFrequency}%</strong>
          <p class="tiny-copy">tendência: ${escapeHtml(workout.consistencyTrend)}</p>
        </div>
        <div class="metric-card">
          <span class="metric-label">Sono</span>
          <strong>${sleep.consistency}%</strong>
          <p class="tiny-copy">desvio: ${sleep.deviationFromTarget} min</p>
        </div>
      </div>

      <div class="mini-heatmap">${buildWeeklyHeatmap(history, currentSummary)}</div>

      ${insights.length ? `
        <div class="insight-list">
          ${insights.map((item) => `<p class="support-copy">• ${escapeHtml(item.message)}</p>`).join("")}
        </div>
      ` : ""}
      <p class="tiny-copy">Atualizado às ${updatedAt} (${sourceLabel})</p>
    </section>
  `;
}
