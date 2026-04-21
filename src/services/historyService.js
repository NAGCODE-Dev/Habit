import { MAX_HISTORY_DAYS, WATER_GOAL_ML } from "./constants.js";
import { addDays, listIntermediateDateKeys } from "./date-utils.js";

export function computeProgress(day) {
  const habitEntries = Object.entries(day.habits ?? {});
  const trackedHabits = habitEntries.filter(([key]) => key !== "runSkipped" && key !== "runDone");
  const completedHabits = trackedHabits.reduce((sum, [, checked]) => sum + (checked ? 1 : 0), 0);

  const runHandled = day.habits?.runDone || day.habits?.runSkipped ? 1 : 0;
  const waterHandled = (day.water?.total ?? 0) >= WATER_GOAL_ML ? 1 : 0;
  const completed = completedHabits + runHandled + waterHandled;
  const total = trackedHabits.length + 2;

  return {
    completed,
    total,
    percentage: Math.round((completed / total) * 100),
    waterGoalMet: waterHandled === 1
  };
}

export function summarizeDay(day) {
  const stats = computeProgress(day);
  return {
    dateKey: day.date,
    completed: stats.completed,
    total: stats.total,
    percentage: stats.percentage,
    waterGoalMet: stats.waterGoalMet,
    waterTotalMl: day.water.total,
    sleepActual: day.sleep.actual.sleep,
    wakeActual: day.sleep.actual.wake,
    runSkipped: Boolean(day.habits.runSkipped)
  };
}

export function mergeHistory(history, summary) {
  const filtered = history.filter((entry) => entry.dateKey !== summary.dateKey);
  return [summary, ...filtered]
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
    .slice(0, MAX_HISTORY_DAYS);
}

export function rotateHistoryToDate(state, createDefaultDay, todayKey) {
  if (state.currentDayKey === todayKey) {
    return state;
  }

  let nextHistory = mergeHistory(state.history, summarizeDay(state.day));
  const gapDays = listIntermediateDateKeys(state.currentDayKey, todayKey);
  for (const dateKey of gapDays) {
    nextHistory = mergeHistory(nextHistory, summarizeDay(createDefaultDay(dateKey)));
  }

  return {
    ...state,
    currentDayKey: todayKey,
    day: createDefaultDay(todayKey),
    history: nextHistory
  };
}

export function countRunSkipsInLastWeek(state, anchorDateKey) {
  const startDateKey = addDays(anchorDateKey, -6);
  return state.history
    .filter((entry) => entry.dateKey >= startDateKey && entry.dateKey <= anchorDateKey)
    .reduce((sum, entry) => sum + (entry.runSkipped ? 1 : 0), 0);
}
