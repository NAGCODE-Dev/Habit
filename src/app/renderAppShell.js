import { renderHistoryView } from "../components/HistoryView.js";
import { renderProgressHeader } from "../components/ProgressHeader.js";
import { renderToastStack } from "../components/ToastStack.js";
import { formatDisplayDate } from "../services/date-utils.js";
import { getLegacyDaySnapshot } from "../services/dayService.js";
import { computeProgress, summarizeDay } from "../services/historyService.js";
import { renderTodayView } from "./renderTodayView.js";

export function renderAppShell({
  state,
  activeView,
  beforeInstallEvent,
  toasts,
  reminderMode
}) {
  const progress = computeProgress(state.day);
  const day = getLegacyDaySnapshot(state.day);

  return `
    <main class="app-shell">
      ${renderProgressHeader({
        dateLabel: formatDisplayDate(state.currentDayKey),
        activeView,
        percentage: progress.percentage,
        completed: progress.completed,
        total: progress.total,
        waterTotalMl: day.waterTotalMl,
        installAvailable: Boolean(beforeInstallEvent)
      })}

      <section class="content-stack">
        ${activeView === "today"
          ? renderTodayView(state, reminderMode)
          : renderHistoryView(state.history, summarizeDay(state.day))}
      </section>
    </main>
    ${renderToastStack(toasts)}
  `;
}
