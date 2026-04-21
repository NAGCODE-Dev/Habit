import { getLocalDateKey } from "./date-utils.js";
import {
  computeProgress,
  countRunSkipsInLastWeek,
  rotateHistoryToDate
} from "./historyService.js";
import {
  createSafeDayTemplate,
  repairDatabase,
  validateDay
} from "./integrityService.js";
import { appendEvent } from "./eventStore.js";
import { EVENT_TYPES } from "./eventService.js";
import { buildEventIndex } from "./eventStore.js";
import { compactDate, reconstructDayWithSnapshot } from "./snapshotService.js";
import {
  isValidHabitId,
  isValidMealId,
  isValidSectionId,
  sanitizeTimeValue,
  sanitizeWaterAmount
} from "./domainGuards.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createDefaultDay(dateKey) {
  return validateDay(createSafeDayTemplate(dateKey), dateKey);
}

function runIntegrityStage(rawState, todayKey) {
  const repaired = repairDatabase(rawState, todayKey);
  repaired.day = reconstructDayWithSnapshot(repaired, repaired.currentDayKey);
  return repaired;
}

function runStateStage(repairedState, todayKey) {
  const rotated = rotateHistoryToDate(repairedState, createDefaultDay, todayKey);
  rotated.day = reconstructDayWithSnapshot(rotated, rotated.currentDayKey);
  const compacted = compactDate(rotated, rotated.currentDayKey);
  compacted.day = reconstructDayWithSnapshot(compacted, compacted.currentDayKey);
  compacted.eventIndex = buildEventIndex(compacted.events ?? []);
  compacted.day = validateDay(compacted.day, compacted.currentDayKey);
  return compacted;
}

export function normalizeAppState(rawState, todayKey = getLocalDateKey()) {
  const integrityState = runIntegrityStage(rawState, todayKey);
  const stateStage = runStateStage(integrityState, todayKey);
  return stateStage;
}

function withProgress(state) {
  const next = clone(state);
  next.day = validateDay(next.day, next.currentDayKey);
  const progress = computeProgress(next.day);
  next.day.meta = {
    completionScore: progress.percentage,
    completed: progress.completed,
    total: progress.total,
    percentage: progress.percentage
  };
  next.day.updatedAt = new Date().toISOString();
  return next;
}

export function getLegacyDaySnapshot(day) {
  const safeDay = validateDay(day, day?.date ?? getLocalDateKey());
  return {
    dateKey: safeDay.date,
    checkboxes: safeDay.habits,
    mealTimes: safeDay.meals,
    sleepActual: safeDay.sleep.actual.sleep,
    wakeActual: safeDay.sleep.actual.wake,
    waterEntries: safeDay.water.logs,
    waterTotalMl: safeDay.water.total,
    reminderSentHours: safeDay.water.reminderSentHours,
    trainingNotes: safeDay.workout.notes
  };
}

export function toggleSection(state, sectionId) {
  const next = clone(state);
  if (!isValidSectionId(sectionId)) {
    return next;
  }
  next.sectionsOpen[sectionId] = !next.sectionsOpen[sectionId];
  return next;
}

export function updateHabit(state, habitId, checked) {
  const next = withProgress(normalizeAppState(state));
  if (!isValidHabitId(next.day, habitId)) {
    return { state: next };
  }

  if (habitId === "runSkipped" && checked) {
    const historySkips = countRunSkipsInLastWeek(next, next.currentDayKey);
    const todayCounts = next.day.habits.runSkipped ? 1 : 0;
    if (historySkips + todayCounts >= 2) {
      return { state: next, blockedReason: "weekly-run-skip-limit" };
    }
  }

  next.events = appendEvent(next.events, {
    date: next.currentDayKey,
    type: EVENT_TYPES.HABIT_SET,
    payload: { habitId, checked }
  });
  next.eventIndex = buildEventIndex(next.events);
  next.day = reconstructDayWithSnapshot(next, next.currentDayKey);
  return { state: withProgress(next) };
}

export function updateSleepTime(state, field, value) {
  const next = withProgress(normalizeAppState(state));
  if (field !== "sleepActual" && field !== "wakeActual") {
    return next;
  }
  next.events = appendEvent(next.events, {
    date: next.currentDayKey,
    type: EVENT_TYPES.SLEEP_TIME_SET,
    payload: { field, value: sanitizeTimeValue(value) }
  });
  next.eventIndex = buildEventIndex(next.events);
  next.day = reconstructDayWithSnapshot(next, next.currentDayKey);
  return withProgress(next);
}

export function updateMealTime(state, mealId, value) {
  const next = withProgress(normalizeAppState(state));
  if (!isValidMealId(mealId)) {
    return next;
  }
  next.events = appendEvent(next.events, {
    date: next.currentDayKey,
    type: EVENT_TYPES.MEAL_TIME_SET,
    payload: { mealId, value: sanitizeTimeValue(value) }
  });
  next.eventIndex = buildEventIndex(next.events);
  next.day = reconstructDayWithSnapshot(next, next.currentDayKey);
  return withProgress(next);
}

export function updateTrainingNotes(state, value) {
  const next = normalizeAppState(state);
  next.events = appendEvent(next.events, {
    date: next.currentDayKey,
    type: EVENT_TYPES.TRAINING_NOTES_SET,
    payload: { value: String(value ?? "") }
  });
  next.eventIndex = buildEventIndex(next.events);
  next.day = reconstructDayWithSnapshot(next, next.currentDayKey);
  next.day.updatedAt = new Date().toISOString();
  return next;
}

export function addWater(state, amount) {
  const safeAmount = sanitizeWaterAmount(amount);
  if (safeAmount === null) {
    return normalizeAppState(state);
  }

  const next = withProgress(normalizeAppState(state));
  next.events = appendEvent(next.events, {
    date: next.currentDayKey,
    type: EVENT_TYPES.WATER_ADDED,
    payload: {
      amount: safeAmount,
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    }
  });
  next.eventIndex = buildEventIndex(next.events);
  next.day = reconstructDayWithSnapshot(next, next.currentDayKey);
  return withProgress(next);
}

export function undoLastWater(state) {
  const next = withProgress(normalizeAppState(state));
  if (!next.day.water.logs.length) {
    return next;
  }
  next.events = appendEvent(next.events, {
    date: next.currentDayKey,
    type: EVENT_TYPES.WATER_UNDONE,
    payload: {}
  });
  next.eventIndex = buildEventIndex(next.events);
  next.day = reconstructDayWithSnapshot(next, next.currentDayKey);
  return withProgress(next);
}

export function markReminderSent(state, hour) {
  const next = normalizeAppState(state);
  next.events = appendEvent(next.events, {
    date: next.currentDayKey,
    type: EVENT_TYPES.REMINDER_SENT,
    payload: { hour }
  });
  next.eventIndex = buildEventIndex(next.events);
  next.day = reconstructDayWithSnapshot(next, next.currentDayKey);
  next.day.updatedAt = new Date().toISOString();
  return next;
}

export function dismissReminderPrompt(state) {
  const next = normalizeAppState(state);
  next.preferences.reminderPromptDismissed = true;
  return next;
}
