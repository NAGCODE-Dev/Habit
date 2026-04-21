import { addDays } from "./date-utils.js";
import { reduceEvents } from "./eventService.js";
import { getEventsByDate } from "./eventStore.js";
import { getSnapshot } from "./snapshotService.js";

function sortEvents(events) {
  return [...events].sort((a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)));
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
    const snapshot = getSnapshot(state, dateKey);
    const events = getDailyEvents(state, dateKey);
    if (snapshot) {
      return reduceEvents(events, dateKey, {
        baseDay: snapshot.state,
        startAfterEventId: snapshot.lastEventId
      });
    }
    return reduceEvents(events, dateKey);
  });
}
