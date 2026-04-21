// @ts-check

import { renderAnalyticsDashboard } from "../components/AnalyticsDashboard.js";
import { renderWaterTracker } from "../components/WaterTracker.js";
import { WATER_GOAL_ML } from "../services/constants.js";
import { escapeHtml, formatMl } from "../services/dom-utils.js";
import { summarizeDay } from "../services/historyService.js";
import { getDashboardAnalytics } from "../services/analyticsService.js";
import { getLegacyDaySnapshot } from "../services/dayService.js";
import { reminderScheduleText } from "../services/notifications.js";
import { renderAfternoonSection, renderMorningSection, renderNightSection, renderSchoolSection } from "./renderDaySections.js";
import { renderReminderBanner } from "./renderReminderBanner.js";

export function renderTodayView(state, reminderMode) {
  const day = getLegacyDaySnapshot(state.day);
  const currentSummary = summarizeDay(state.day);
  const remainingWater = Math.max(0, WATER_GOAL_ML - day.waterTotalMl);

  return `
    <div data-testid="today-view">
      ${renderReminderBanner(state, reminderMode)}
      ${renderAnalyticsDashboard({
        analytics: getDashboardAnalytics(state),
        history: state.history,
        currentSummary
      })}
      ${renderWaterTracker(day)}

      <section class="summary-card">
        <div class="summary-line">
          <span>Água restante</span>
          <strong>${formatMl(remainingWater)}</strong>
        </div>
        <div class="summary-line">
          <span>Horários de lembrete</span>
          <strong>${escapeHtml(reminderScheduleText())}</strong>
        </div>
      </section>

      ${renderMorningSection(state)}
      ${renderSchoolSection(state)}
      ${renderAfternoonSection(state)}
      ${renderNightSection(state)}
    </div>
  `;
}
