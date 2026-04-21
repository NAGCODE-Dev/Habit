import { escapeHtml } from "../services/dom-utils.js";

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

function groupByMonth(entries) {
  const groups = new Map();

  for (const entry of entries) {
    const monthKey = entry.dateKey.slice(0, 7);
    if (!groups.has(monthKey)) {
      groups.set(monthKey, []);
    }
    groups.get(monthKey).push(entry);
  }

  return [...groups.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([monthKey, items]) => ({ monthKey, items }));
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1, 12, 0, 0, 0);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric"
  }).format(date);
}

function dayClass(percentage) {
  if (percentage < 30) {
    return "level-red";
  }
  if (percentage < 50) {
    return "level-orange";
  }
  if (percentage < 80) {
    return "level-yellow";
  }
  return "level-green";
}

function monthAverage(entries) {
  if (!entries.length) {
    return 0;
  }

  const total = entries.reduce((sum, entry) => sum + Number(entry.percentage ?? 0), 0);
  return Math.round(total / entries.length);
}

function buildMonthGrid(monthKey, entries, currentDateKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1, 12, 0, 0, 0);
  const daysInMonth = new Date(year, month, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;
  const entryMap = new Map(entries.map((entry) => [entry.dateKey, entry]));
  const cells = [];

  for (let blankIndex = 0; blankIndex < offset; blankIndex += 1) {
    cells.push('<div class="calendar-cell is-empty" aria-hidden="true"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    const entry = entryMap.get(dateKey);
    const isToday = dateKey === currentDateKey;
    const isFuture = dateKey > currentDateKey;
    const hasEntry = Boolean(entry);
    const percentage = Number(entry?.percentage ?? 0);
    const colorClass = hasEntry ? dayClass(percentage) : "level-none";
    const title = hasEntry
      ? `${entry.dateKey} - ${percentage}% (${entry.completed}/${entry.total})`
      : `${dateKey} - sem dados`;

    cells.push(`
      <div
        class="calendar-cell ${colorClass} ${isToday ? "is-today" : ""} ${isFuture ? "is-future" : ""}"
        title="${escapeHtml(title)}"
        aria-label="${escapeHtml(title)}"
      >
        <span class="calendar-day-number">${day}</span>
        <span class="calendar-score">${hasEntry && !isFuture ? `${percentage}%` : ""}</span>
      </div>
    `);
  }

  return cells.join("");
}

function renderRecentList(entries) {
  const recentEntries = entries.slice(0, 10);
  if (!recentEntries.length) {
    return "";
  }

  return `
    <section class="recent-history-card">
      <div class="history-topline">
        <div>
          <p class="eyebrow">Detalhe rápido</p>
          <h2>Últimos registros</h2>
        </div>
      </div>
      <div class="recent-history-list">
        ${recentEntries
          .map(
            (entry) => `
              <div class="recent-history-row">
                <strong>${escapeHtml(entry.dateKey)}</strong>
                <span>${entry.percentage}%</span>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

export function renderHistoryView(history, currentEntry) {
  const mergedEntries = [currentEntry, ...history]
    .filter(Boolean)
    .filter((entry, index, array) => array.findIndex((item) => item.dateKey === entry.dateKey) === index)
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey));

  if (!mergedEntries.length) {
    return `
      <section class="empty-state">
        <h2>Histórico vazio</h2>
        <p>Os dias vão aparecer aqui em formato de calendário conforme o app for salvando o fechamento diário.</p>
      </section>
    `;
  }

  const monthGroups = groupByMonth(mergedEntries);
  const firstTrackedDate = mergedEntries[mergedEntries.length - 1]?.dateKey ?? currentEntry?.dateKey ?? "";

  return `
    <section class="history-layout" data-testid="history-view">
      <section class="history-overview-card">
        <div>
          <p class="eyebrow">Histórico</p>
          <h2 data-testid="history-title">Calendário</h2>
        </div>
        <p class="support-copy">Cada dia fica com uma cor pela porcentagem concluída.</p>
        <div class="calendar-legend">
          <span class="legend-item"><i class="legend-swatch level-red"></i> vermelho: abaixo de 30%</span>
          <span class="legend-item"><i class="legend-swatch level-orange"></i> laranja: 30% a 49%</span>
          <span class="legend-item"><i class="legend-swatch level-yellow"></i> amarelo: 50% a 79%</span>
          <span class="legend-item"><i class="legend-swatch level-green"></i> verde: 80% a 100%</span>
        </div>
        <div class="history-overview-grid">
          <div class="metric-card">
            <span class="metric-label">Dias salvos</span>
            <strong>${mergedEntries.length}</strong>
          </div>
          <div class="metric-card water">
            <span class="metric-label">Primeiro dia</span>
            <strong>${escapeHtml(firstTrackedDate || "--")}</strong>
          </div>
        </div>
      </section>

      ${monthGroups
        .map(
          ({ monthKey, items }) => `
            <article class="history-card month-card">
              <div class="history-topline">
                <div>
                  <p class="eyebrow">${escapeHtml(monthKey.slice(0, 4))}</p>
                  <h2>${escapeHtml(monthLabel(monthKey))}</h2>
                </div>
                <div class="history-pill">${monthAverage(items)}%</div>
              </div>

              <div class="calendar-weekdays">
                ${WEEKDAY_LABELS.map((label) => `<span>${label}</span>`).join("")}
              </div>
              <div class="calendar-grid">
                ${buildMonthGrid(monthKey, items, currentEntry?.dateKey ?? mergedEntries[0].dateKey)}
              </div>
            </article>
          `
        )
        .join("")}
      ${renderRecentList(mergedEntries)}
    </section>
  `;
}
