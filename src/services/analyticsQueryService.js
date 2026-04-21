import { addDays } from "./date-utils.js";
import { reduceEvents } from "./eventService.js";
import { getEventsByDate } from "./eventStore.js";
import { createSafeDayTemplate } from "./integrityService.js";
import { getSnapshot } from "./snapshotService.js";

function sortEvents(events) {
  return [...events].sort((a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)));
}

function applyHistorySummary(day, historyEntry) {
  const nextDay = day ? createSafeDayTemplate(day.date) : createSafeDayTemplate(historyEntry.dateKey);

  if (day) {
    nextDay.tasks = { ...nextDay.tasks, ...day.tasks };
    nextDay.habits = { ...nextDay.habits, ...day.habits };
    nextDay.sleep = {
      ...nextDay.sleep,
      ...day.sleep,
      onTime: { ...nextDay.sleep.onTime, ...(day.sleep?.onTime ?? {}) },
      actual: { ...nextDay.sleep.actual, ...(day.sleep?.actual ?? {}) }
    };
    nextDay.workout = {
      ...nextDay.workout,
      ...day.workout,
      completed: { ...nextDay.workout.completed, ...(day.workout?.completed ?? {}) }
    };
    nextDay.school = {
      ...nextDay.school,
      ...day.school,
      checklist: { ...nextDay.school.checklist, ...(day.school?.checklist ?? {}) }
    };
    nextDay.water = { ...nextDay.water, ...(day.water ?? {}) };
    nextDay.meta = { ...nextDay.meta, ...(day.meta ?? {}) };
  }

  nextDay.water.total = Math.max(0, Math.round(Number(historyEntry.waterTotalMl ?? 0)));
  nextDay.sleep.actual.sleep = typeof historyEntry.sleepActual === "string" ? historyEntry.sleepActual : "";
  nextDay.sleep.actual.wake = typeof historyEntry.wakeActual === "string" ? historyEntry.wakeActual : "";
  nextDay.habits.runSkipped = Boolean(historyEntry.runSkipped);
  nextDay.historySummary = {
    completed: Math.max(0, Math.round(Number(historyEntry.completed ?? 0))),
    total: Math.max(1, Math.round(Number(historyEntry.total ?? 1))),
    percentage: Math.max(0, Math.round(Number(historyEntry.percentage ?? 0))),
    waterGoalMet: Boolean(historyEntry.waterGoalMet)
  };

  return nextDay;
}

function looksLikeEmptyDay(day) {
  if (!day) {
    return true;
  }

  const hasCompletedHabits = Object.entries(day.habits ?? {})
    .some(([key, value]) => key !== "runSkipped" && Boolean(value));

  return day.water?.total === 0
    && (day.water?.logs?.length ?? 0) === 0
    && !day.sleep?.actual?.sleep
    && !day.sleep?.actual?.wake
    && !hasCompletedHabits
    && day.habits?.runSkipped === false;
}

export function getDailyEvents(state, dateKey) {
  const active = getEventsByDate(state.events ?? [], dateKey);
  const archived = Array.isArray(state.eventArchive?.[dateKey]) ? state.eventArchive[dateKey] : [];
  return sortEvents([...archived, ...active]);
}

export function getEventsByType(state, type) {
  const all = [...(state.events ?? []), ...Object.values(state.eventArchive ?? {}).flat()];
  return all.filter((event) => event?.type === type);
}

export function getEventsRange(state, startDateKey, endDateKey) {
  let cursor = startDateKey;
  const events = [];
  while (cursor <= endDateKey) {
    events.push(...getDailyEvents(state, cursor));
    cursor = addDays(cursor, 1);
  }
  return sortEvents(events);
}

export function getAllDays(state) {
  const historyByDate = new Map((state.history ?? [])
    .filter((entry) => entry?.dateKey)
    .map((entry) => [entry.dateKey, entry]));
  const dateSet = new Set();
  dateSet.add(state.currentDayKey);
  for (const entry of state.history ?? []) {
    if (entry?.dateKey) {
      dateSet.add(entry.dateKey);
    }
  }
  for (const dateKey of Object.keys(state.snapshots ?? {})) {
    dateSet.add(dateKey);
  }
  for (const event of state.events ?? []) {
    if (event?.date) {
      dateSet.add(event.date);
    }
  }
  for (const dateKey of Object.keys(state.eventArchive ?? {})) {
    dateSet.add(dateKey);
  }

  const days = [...dateSet].sort((a, b) => b.localeCompare(a));
  return days.map((dateKey) => {
    const historyEntry = historyByDate.get(dateKey);
    const snapshot = getSnapshot(state, dateKey);
    const events = getDailyEvents(state, dateKey);

    if (historyEntry && events.length === 0) {
      const baseDay = snapshot?.state ? snapshot.state : createSafeDayTemplate(dateKey);
      return applyHistorySummary(baseDay, historyEntry);
    }

    const reducedDay = snapshot
      ? reduceEvents(events, dateKey, {
        baseDay: snapshot.state,
        startAfterEventId: snapshot.lastEventId
      })
      : reduceEvents(events, dateKey);

    if (historyEntry && (events.length === 0 || looksLikeEmptyDay(reducedDay))) {
      return applyHistorySummary(reducedDay, historyEntry);
    }

    return reducedDay;
  });
}
