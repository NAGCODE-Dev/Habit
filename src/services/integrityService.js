import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SECTION_OPEN,
  MAX_HISTORY_DAYS,
  MEAL_FIELDS
} from "./constants.js";
import { getLocalDateKey } from "./date-utils.js";
import { computeProgress } from "./historyService.js";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toDateKey(value, fallback) {
  return typeof value === "string" && DATE_KEY_PATTERN.test(value) ? value : fallback;
}

function defaultHabits() {
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

function defaultMeals() {
  return Object.fromEntries(MEAL_FIELDS.map((meal) => [meal.id, ""]));
}

function normalizeWaterLogs(logs) {
  if (!Array.isArray(logs)) {
    return [];
  }

  return logs
    .filter((entry) => isPlainObject(entry))
    .map((entry) => ({
      id: String(entry.id ?? `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
      amount: Math.max(0, Math.round(Number(entry.amount ?? 0))),
      timestamp: typeof entry.timestamp === "string" ? entry.timestamp : new Date().toISOString()
    }))
    .filter((entry) => entry.amount > 0);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeEvent(event, fallbackDateKey) {
  if (!isPlainObject(event)) {
    return null;
  }

  const date = toDateKey(event.date, fallbackDateKey);
  const type = typeof event.type === "string" ? event.type : "";
  if (!type) {
    return null;
  }

  const timestamp = Math.floor(safeNumber(event.timestamp, Date.now()));
  return {
    id: typeof event.id === "string" && event.id ? event.id : `evt_${timestamp}_${Math.random().toString(16).slice(2, 8)}`,
    date,
    type,
    payload: isPlainObject(event.payload) ? event.payload : {},
    timestamp
  };
}

function deduplicateEvents(events) {
  const seen = new Set();
  return events
    .filter((event) => event && event.id && !seen.has(event.id) && seen.add(event.id))
    .sort((a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)));
}

function buildEventIndex(events) {
  const byDate = {};
  const byType = {};

  for (const event of events) {
    if (!byDate[event.date]) {
      byDate[event.date] = [];
    }
    byDate[event.date].push(event.id);

    if (!byType[event.type]) {
      byType[event.type] = [];
    }
    byType[event.type].push(event.id);
  }

  return {
    byDate,
    byType,
    lastEventId: events.at(-1)?.id ?? null
  };
}

function sanitizeSnapshots(rawSnapshots) {
  if (!isPlainObject(rawSnapshots)) {
    return {};
  }

  const snapshots = {};
  for (const [dateKey, snapshot] of Object.entries(rawSnapshots)) {
    const safeDate = toDateKey(dateKey, "");
    if (!safeDate || !isPlainObject(snapshot)) {
      continue;
    }

    snapshots[safeDate] = {
      date: safeDate,
      state: validateDay(snapshot.state, safeDate),
      lastEventId: typeof snapshot.lastEventId === "string" ? snapshot.lastEventId : null,
      createdAt: Math.floor(safeNumber(snapshot.createdAt, Date.now())),
      eventCount: Math.max(0, Math.floor(safeNumber(snapshot.eventCount, 0)))
    };
  }

  return snapshots;
}

function sanitizeEventArchive(rawArchive) {
  if (!isPlainObject(rawArchive)) {
    return {};
  }

  const archive = {};
  for (const [dateKey, events] of Object.entries(rawArchive)) {
    const safeDate = toDateKey(dateKey, "");
    if (!safeDate) {
      continue;
    }
    archive[safeDate] = deduplicateEvents((Array.isArray(events) ? events : [])
      .map((event) => sanitizeEvent(event, safeDate))
      .filter(Boolean));
  }
  return archive;
}

function sanitizeAnalyticsCache(rawCache) {
  if (!isPlainObject(rawCache)) {
    return {
      payload: null,
      lastComputed: 0
    };
  }

  return {
    payload: rawCache.payload ?? null,
    lastComputed: Math.max(0, Math.floor(safeNumber(rawCache.lastComputed, 0)))
  };
}

export function createSafeDayTemplate(dateKey) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    date: toDateKey(dateKey, getLocalDateKey()),
    habits: defaultHabits(),
    meals: defaultMeals(),
    water: {
      total: 0,
      logs: [],
      reminderSentHours: []
    },
    sleep: {
      target: { sleep: "22:30", wake: "06:30" },
      actual: { sleep: "", wake: "" },
      onTime: { sleep: false, wake: false }
    },
    workout: {
      completed: {
        runDone: false,
        runSkipped: false,
        trainingActivation: false,
        strengthTraining: false,
        conditioning: false,
        postStretch: false
      },
      notes: ""
    },
    school: {
      checklist: {
        bagReady: false,
        assignmentsDelivered: false,
        schoolSnackWater: false,
        schoolReview: false
      }
    },
    meta: {
      completionScore: 0,
      completed: 0,
      total: 0,
      percentage: 0
    },
    updatedAt: new Date().toISOString()
  };
}

export function validateDay(day, fallbackDateKey = getLocalDateKey()) {
  const base = createSafeDayTemplate(fallbackDateKey);
  const input = isPlainObject(day) ? day : {};

  const isLegacy = input.dateKey || input.checkboxes || input.mealTimes || input.waterEntries;
  if (isLegacy) {
    const habits = {
      ...base.habits,
      ...(isPlainObject(input.checkboxes) ? input.checkboxes : {})
    };
    const logs = normalizeWaterLogs(input.waterEntries);

    const normalized = {
      ...base,
      date: toDateKey(input.dateKey, fallbackDateKey),
      habits: Object.fromEntries(Object.entries(habits).map(([key, value]) => [key, Boolean(value)])),
      meals: {
        ...base.meals,
        ...(isPlainObject(input.mealTimes) ? input.mealTimes : {})
      },
      water: {
        total: Math.max(0, Math.round(safeNumber(input.waterTotalMl, logs.reduce((sum, item) => sum + item.amount, 0)))),
        logs,
        reminderSentHours: Array.isArray(input.reminderSentHours)
          ? [...new Set(input.reminderSentHours.map((hour) => Math.round(Number(hour))).filter((hour) => Number.isFinite(hour) && hour >= 0 && hour <= 23))].sort((a, b) => a - b)
          : []
      },
      sleep: {
        ...base.sleep,
        actual: {
          sleep: typeof input.sleepActual === "string" ? input.sleepActual : "",
          wake: typeof input.wakeActual === "string" ? input.wakeActual : ""
        },
        onTime: {
          sleep: Boolean(habits.sleepOnTime),
          wake: Boolean(habits.wakeOnTime)
        }
      },
      workout: {
        ...base.workout,
        completed: {
          ...base.workout.completed,
          runDone: Boolean(habits.runDone),
          runSkipped: Boolean(habits.runSkipped),
          trainingActivation: Boolean(habits.trainingActivation),
          strengthTraining: Boolean(habits.strengthTraining),
          conditioning: Boolean(habits.conditioning),
          postStretch: Boolean(habits.postStretch)
        },
        notes: typeof input.trainingNotes === "string" ? input.trainingNotes : ""
      },
      school: {
        checklist: {
          bagReady: Boolean(habits.bagReady),
          assignmentsDelivered: Boolean(habits.assignmentsDelivered),
          schoolSnackWater: Boolean(habits.schoolSnackWater),
          schoolReview: Boolean(habits.schoolReview)
        }
      }
    };

    const progress = computeProgress(normalized);
    normalized.meta = {
      completionScore: progress.percentage,
      completed: progress.completed,
      total: progress.total,
      percentage: progress.percentage
    };
    return normalized;
  }

  const habits = {
    ...base.habits,
    ...(isPlainObject(input.habits) ? input.habits : {})
  };

  const logs = normalizeWaterLogs(input.water?.logs);
  const waterTotalFromLogs = logs.reduce((sum, entry) => sum + entry.amount, 0);
  const normalized = {
    ...base,
    ...input,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    date: toDateKey(input.date, fallbackDateKey),
    habits: Object.fromEntries(Object.entries(habits).map(([key, value]) => [key, Boolean(value)])),
    meals: {
      ...base.meals,
      ...(isPlainObject(input.meals) ? input.meals : {})
    },
    water: {
      ...base.water,
      ...(isPlainObject(input.water) ? input.water : {}),
      logs,
      total: Math.max(0, Math.round(safeNumber(input.water?.total, waterTotalFromLogs))),
      reminderSentHours: Array.isArray(input.water?.reminderSentHours)
        ? [...new Set(input.water.reminderSentHours.map((hour) => Math.round(Number(hour))).filter((hour) => Number.isFinite(hour) && hour >= 0 && hour <= 23))].sort((a, b) => a - b)
        : []
    },
    sleep: {
      ...base.sleep,
      ...(isPlainObject(input.sleep) ? input.sleep : {}),
      actual: {
        ...base.sleep.actual,
        ...(isPlainObject(input.sleep?.actual) ? input.sleep.actual : {})
      },
      onTime: {
        ...base.sleep.onTime,
        ...(isPlainObject(input.sleep?.onTime) ? input.sleep.onTime : {})
      }
    },
    workout: {
      ...base.workout,
      ...(isPlainObject(input.workout) ? input.workout : {}),
      completed: {
        ...base.workout.completed,
        ...(isPlainObject(input.workout?.completed) ? input.workout.completed : {})
      }
    },
    school: {
      ...base.school,
      ...(isPlainObject(input.school) ? input.school : {}),
      checklist: {
        ...base.school.checklist,
        ...(isPlainObject(input.school?.checklist) ? input.school.checklist : {})
      }
    },
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : new Date().toISOString()
  };

  normalized.sleep.onTime.sleep = Boolean(normalized.habits.sleepOnTime);
  normalized.sleep.onTime.wake = Boolean(normalized.habits.wakeOnTime);
  normalized.workout.completed.runDone = Boolean(normalized.habits.runDone);
  normalized.workout.completed.runSkipped = Boolean(normalized.habits.runSkipped);

  const progress = computeProgress(normalized);
  normalized.meta = {
    completionScore: progress.percentage,
    completed: progress.completed,
    total: progress.total,
    percentage: progress.percentage
  };

  return normalized;
}

function sanitizeHistoryEntry(entry) {
  if (!isPlainObject(entry)) {
    return null;
  }

  const dateKey = toDateKey(entry.dateKey, "");
  if (!dateKey) {
    return null;
  }

  const completed = Math.max(0, Math.round(safeNumber(entry.completed, 0)));
  const total = Math.max(1, Math.round(safeNumber(entry.total, 1)));
  const percentage = Math.round((completed / total) * 100);

  return {
    dateKey,
    completed,
    total,
    percentage,
    waterGoalMet: Boolean(entry.waterGoalMet),
    waterTotalMl: Math.max(0, Math.round(safeNumber(entry.waterTotalMl, 0))),
    sleepActual: typeof entry.sleepActual === "string" ? entry.sleepActual : "",
    wakeActual: typeof entry.wakeActual === "string" ? entry.wakeActual : "",
    runSkipped: Boolean(entry.runSkipped),
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : ""
  };
}

export function deduplicateDays(entries) {
  const map = new Map();

  for (const entry of entries) {
    if (!entry || !entry.dateKey) {
      continue;
    }

    const existing = map.get(entry.dateKey);
    if (!existing) {
      map.set(entry.dateKey, entry);
      continue;
    }

    const existingRank = existing.updatedAt ? Date.parse(existing.updatedAt) : Number.NEGATIVE_INFINITY;
    const nextRank = entry.updatedAt ? Date.parse(entry.updatedAt) : Number.NEGATIVE_INFINITY;

    if (nextRank >= existingRank) {
      map.set(entry.dateKey, {
        ...existing,
        ...entry
      });
    } else {
      map.set(entry.dateKey, {
        ...entry,
        ...existing
      });
    }
  }

  return [...map.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function migrateV1ToV2(state) {
  if (!isPlainObject(state)) {
    return { schemaVersion: 2 };
  }

  const next = { ...state };
  next.schemaVersion = 2;
  if (!next.version || next.version < 2) {
    next.version = 2;
  }
  return next;
}

function migrateV2ToV3(state, todayKey) {
  const next = isPlainObject(state) ? { ...state } : {};
  next.schemaVersion = 3;
  next.version = 3;
  next.currentDayKey = toDateKey(next.currentDayKey, todayKey);
  next.day = validateDay(next.day, next.currentDayKey);
  next.history = deduplicateDays((Array.isArray(next.history) ? next.history : []).map(sanitizeHistoryEntry).filter(Boolean));
  return next;
}

function migrateV3ToV4(state, todayKey) {
  const next = isPlainObject(state) ? { ...state } : {};
  next.schemaVersion = 4;
  next.version = 4;
  next.currentDayKey = toDateKey(next.currentDayKey, todayKey);
  const normalizedDay = validateDay(next.day, next.currentDayKey);
  next.day = normalizedDay;

  const rawEvents = Array.isArray(next.events) ? next.events : [];
  if (rawEvents.length > 0) {
    next.events = deduplicateEvents(rawEvents.map((event) => sanitizeEvent(event, next.currentDayKey)).filter(Boolean));
    return next;
  }

  // Dual mode bootstrap: seed current day snapshot as an immutable event once.
  next.events = [
    {
      id: `evt_seed_${Date.now()}`,
      date: next.currentDayKey,
      type: "SNAPSHOT_SEEDED",
      payload: { day: normalizedDay },
      timestamp: Date.now()
    }
  ];
  return next;
}

function migrateV4ToV5(state, todayKey) {
  const next = isPlainObject(state) ? { ...state } : {};
  next.schemaVersion = 5;
  next.version = 5;
  next.currentDayKey = toDateKey(next.currentDayKey, todayKey);
  next.snapshots = sanitizeSnapshots(next.snapshots);
  next.eventArchive = sanitizeEventArchive(next.eventArchive);
  const activeEvents = deduplicateEvents((Array.isArray(next.events) ? next.events : [])
    .map((event) => sanitizeEvent(event, next.currentDayKey))
    .filter(Boolean));
  next.events = activeEvents;
  next.eventIndex = buildEventIndex(activeEvents);
  return next;
}

function migrateV5ToV6(state) {
  const next = isPlainObject(state) ? { ...state } : {};
  next.schemaVersion = 6;
  next.version = 6;
  next.analyticsCache = sanitizeAnalyticsCache(next.analyticsCache);
  return next;
}

const MIGRATIONS = {
  1: (state) => migrateV1ToV2(state),
  2: (state, todayKey) => migrateV2ToV3(state, todayKey),
  3: (state, todayKey) => migrateV3ToV4(state, todayKey),
  4: (state, todayKey) => migrateV4ToV5(state, todayKey),
  5: (state) => migrateV5ToV6(state)
};

export function migrateIfNeeded(rawState, todayKey = getLocalDateKey()) {
  let state = isPlainObject(rawState) ? { ...rawState } : {};
  let version = Math.max(1, Math.floor(safeNumber(state.schemaVersion ?? state.version, 1)));

  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      break;
    }
    state = migration(state, todayKey);
    version += 1;
  }

  return {
    ...state,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    version: CURRENT_SCHEMA_VERSION
  };
}

export function repairDatabase(rawState, todayKey = getLocalDateKey()) {
  const migrated = migrateIfNeeded(rawState, todayKey);

  const state = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    version: CURRENT_SCHEMA_VERSION,
    currentDayKey: toDateKey(migrated.currentDayKey, todayKey),
    sectionsOpen: {
      ...DEFAULT_SECTION_OPEN,
      ...(isPlainObject(migrated.sectionsOpen) ? migrated.sectionsOpen : {})
    },
    preferences: {
      reminderPromptDismissed: Boolean(migrated.preferences?.reminderPromptDismissed)
    },
    analyticsCache: sanitizeAnalyticsCache(migrated.analyticsCache),
    day: validateDay(migrated.day, toDateKey(migrated.currentDayKey, todayKey)),
    events: deduplicateEvents((Array.isArray(migrated.events) ? migrated.events : [])
      .map((event) => sanitizeEvent(event, toDateKey(migrated.currentDayKey, todayKey)))
      .filter(Boolean)),
    snapshots: sanitizeSnapshots(migrated.snapshots),
    eventArchive: sanitizeEventArchive(migrated.eventArchive),
    history: deduplicateDays((Array.isArray(migrated.history) ? migrated.history : []).map(sanitizeHistoryEntry).filter(Boolean))
      .filter((entry) => entry.dateKey !== toDateKey(migrated.currentDayKey, todayKey))
      .slice(0, MAX_HISTORY_DAYS)
  };
  state.eventIndex = buildEventIndex(state.events);

  // Ensure the current day identity always matches the local date key used by app logic.
  state.day.date = state.currentDayKey;
  state.day = validateDay(state.day, state.currentDayKey);

  return state;
}
