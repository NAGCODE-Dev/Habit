import {
  DEFAULT_SECTION_OPEN,
  MAX_HISTORY_DAYS,
  MEAL_FIELDS,
  STATIC_PROGRESS_IDS,
  WATER_GOAL_ML
} from "./constants.js";
import {
  addDays,
  getLocalDateKey,
  listIntermediateDateKeys
} from "./date-utils.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDefaultCheckboxes() {
  return {
    sleepOnTime: false,
    wakeOnTime: false,
    bagReady: false,
    assignmentsDelivered: false,
    schoolSnackWater: false,
    schoolReview: false,
    breakfast: false,
    lunch: false,
    preWorkoutMeal: false,
    postWorkoutMeal: false,
    dinner: false,
    runDone: false,
    runSkipped: false,
    trainingActivation: false,
    strengthTraining: false,
    conditioning: false,
    postStretch: false,
    screensOff: false,
    brushTeeth: false,
    nightStretch: false,
    calmMedia: false
  };
}

function createDefaultMealTimes() {
  return Object.fromEntries(MEAL_FIELDS.map((meal) => [meal.id, ""]));
}

export function createDefaultDay(dateKey) {
  return {
    dateKey,
    checkboxes: createDefaultCheckboxes(),
    mealTimes: createDefaultMealTimes(),
    sleepActual: "",
    wakeActual: "",
    waterEntries: [],
    waterTotalMl: 0,
    reminderSentHours: [],
    trainingNotes: ""
  };
}

function normalizeDay(day, fallbackDateKey) {
  const defaultDay = createDefaultDay(fallbackDateKey);
  const merged = {
    ...defaultDay,
    ...(day ?? {})
  };

  merged.checkboxes = {
    ...defaultDay.checkboxes,
    ...(day?.checkboxes ?? {})
  };

  merged.mealTimes = {
    ...defaultDay.mealTimes,
    ...(day?.mealTimes ?? {})
  };

  merged.waterEntries = Array.isArray(day?.waterEntries) ? day.waterEntries : [];
  merged.waterTotalMl = Number(day?.waterTotalMl ?? 0);
  merged.reminderSentHours = Array.isArray(day?.reminderSentHours)
    ? day.reminderSentHours.filter((value) => Number.isFinite(value))
    : [];
  merged.trainingNotes = String(day?.trainingNotes ?? "");
  return merged;
}

export function normalizeState(rawState, todayKey = getLocalDateKey()) {
  const fallback = {
    version: 1,
    currentDayKey: todayKey,
    sectionsOpen: { ...DEFAULT_SECTION_OPEN },
    day: createDefaultDay(todayKey),
    history: [],
    preferences: {
      reminderPromptDismissed: false
    }
  };

  const state = {
    ...fallback,
    ...(rawState ?? {})
  };

  state.sectionsOpen = {
    ...DEFAULT_SECTION_OPEN,
    ...(rawState?.sectionsOpen ?? {})
  };
  state.preferences = {
    ...fallback.preferences,
    ...(rawState?.preferences ?? {})
  };
  state.day = normalizeDay(rawState?.day, state.currentDayKey || todayKey);
  state.currentDayKey = state.day.dateKey || state.currentDayKey || todayKey;

  const seen = new Set();
  state.history = (Array.isArray(rawState?.history) ? rawState.history : [])
    .filter((entry) => entry && entry.dateKey && !seen.has(entry.dateKey) && seen.add(entry.dateKey))
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
    .slice(0, MAX_HISTORY_DAYS);

  return state;
}

export function getProgressStats(day) {
  const staticCompleted = STATIC_PROGRESS_IDS.reduce((count, id) => {
    return count + (day.checkboxes[id] ? 1 : 0);
  }, 0);

  const runHandled = day.checkboxes.runDone || day.checkboxes.runSkipped ? 1 : 0;
  const waterHandled = day.waterTotalMl >= WATER_GOAL_ML ? 1 : 0;
  const completed = staticCompleted + runHandled + waterHandled;
  const total = STATIC_PROGRESS_IDS.length + 2;

  return {
    completed,
    total,
    percentage: Math.round((completed / total) * 100),
    waterGoalMet: day.waterTotalMl >= WATER_GOAL_ML
  };
}

export function summarizeDay(day) {
  const stats = getProgressStats(day);
  return {
    dateKey: day.dateKey,
    completed: stats.completed,
    total: stats.total,
    percentage: stats.percentage,
    waterGoalMet: stats.waterGoalMet,
    waterTotalMl: day.waterTotalMl,
    sleepActual: day.sleepActual,
    wakeActual: day.wakeActual
  };
}

function historyWithSummary(history, summary) {
  const filtered = history.filter((entry) => entry.dateKey !== summary.dateKey);
  return [summary, ...filtered]
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
    .slice(0, MAX_HISTORY_DAYS);
}

export function rotateStateToToday(rawState, todayKey = getLocalDateKey()) {
  const state = normalizeState(rawState, todayKey);
  if (state.currentDayKey === todayKey) {
    return state;
  }

  let nextHistory = historyWithSummary(state.history, summarizeDay(state.day));
  const gapDays = listIntermediateDateKeys(state.currentDayKey, todayKey);
  for (const dateKey of gapDays) {
    nextHistory = historyWithSummary(nextHistory, summarizeDay(createDefaultDay(dateKey)));
  }

  const nextState = clone(state);
  nextState.currentDayKey = todayKey;
  nextState.day = createDefaultDay(todayKey);
  nextState.history = nextHistory;
  return nextState;
}

export function archiveAndResetForDate(rawState, targetDate = addDays(getLocalDateKey(), 0)) {
  return rotateStateToToday(rawState, targetDate);
}

export function toggleCheckbox(rawState, checkboxId, checked) {
  const state = clone(normalizeState(rawState));
  state.day.checkboxes[checkboxId] = checked;

  if (checkboxId === "runDone" && checked) {
    state.day.checkboxes.runSkipped = false;
  }

  if (checkboxId === "runSkipped" && checked) {
    state.day.checkboxes.runDone = false;
  }

  return state;
}

export function updateSleepTime(rawState, field, value) {
  const state = clone(normalizeState(rawState));
  if (field === "sleepActual" || field === "wakeActual") {
    state.day[field] = value;
  }
  return state;
}

export function updateMealTime(rawState, mealId, value) {
  const state = clone(normalizeState(rawState));
  if (state.day.mealTimes[mealId] !== undefined) {
    state.day.mealTimes[mealId] = value;
  }
  return state;
}

export function updateTrainingNotes(rawState, value) {
  const state = clone(normalizeState(rawState));
  state.day.trainingNotes = value;
  return state;
}

export function addWater(rawState, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return normalizeState(rawState);
  }

  const state = clone(normalizeState(rawState));
  const safeAmount = Math.round(value);
  state.day.waterEntries.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    amount: safeAmount,
    timestamp: new Date().toISOString()
  });
  state.day.waterTotalMl += safeAmount;
  return state;
}

export function undoLastWater(rawState) {
  const state = clone(normalizeState(rawState));
  const lastEntry = state.day.waterEntries.pop();
  if (!lastEntry) {
    return state;
  }

  state.day.waterTotalMl = Math.max(0, state.day.waterTotalMl - Number(lastEntry.amount ?? 0));
  return state;
}

export function toggleSection(rawState, sectionId) {
  const state = clone(normalizeState(rawState));
  state.sectionsOpen[sectionId] = !state.sectionsOpen[sectionId];
  return state;
}

export function markReminderSent(rawState, hour) {
  const state = clone(normalizeState(rawState));
  const sent = new Set(state.day.reminderSentHours);
  sent.add(hour);
  state.day.reminderSentHours = [...sent].sort((left, right) => left - right);
  return state;
}

export function dismissReminderPrompt(rawState) {
  const state = clone(normalizeState(rawState));
  state.preferences.reminderPromptDismissed = true;
  return state;
}
