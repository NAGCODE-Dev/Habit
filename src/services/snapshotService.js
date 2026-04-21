// @ts-check

import { reduceEvents } from "./eventService.js";
import { getEventsByDate } from "./eventStore.js";
import { validateDay } from "./integrityService.js";

export const COMPACT_AFTER_EVENTS = 50;

function normalizeArchive(archive) {
  return Array.isArray(archive) ? archive : [];
}

function mergeUniqueEvents(left, right) {
  const seen = new Set();
  return [...left, ...right]
    .filter((event) => event && event.id && !seen.has(event.id) && seen.add(event.id))
    .sort((a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)));
}

export function getSnapshot(state, dateKey) {
  return state?.snapshots?.[dateKey] ?? null;
}

/**
 * Reconstrói um dia a partir do snapshot mais recente e do delta de eventos ativo.
 */
export function reconstructDayWithSnapshot(state, dateKey) {
  const snapshot = getSnapshot(state, dateKey);
  const activeEvents = getEventsByDate(state?.events ?? [], dateKey);

  if (!snapshot) {
    return reduceEvents(activeEvents, dateKey);
  }

  return reduceEvents(activeEvents, dateKey, {
    baseDay: validateDay(snapshot.state, dateKey),
    startAfterEventId: snapshot.lastEventId
  });
}

/**
 * Compacta o histórico ativo de uma data em snapshot + arquivo imutável.
 */
export function compactDate(state, dateKey) {
  const next = {
    ...state,
    snapshots: { ...(state.snapshots ?? {}) },
    eventArchive: { ...(state.eventArchive ?? {}) }
  };

  const activeEvents = getEventsByDate(next.events ?? [], dateKey);
  if (activeEvents.length < COMPACT_AFTER_EVENTS) {
    return next;
  }

  const archivedForDate = normalizeArchive(next.eventArchive[dateKey]);
  const fullEvents = mergeUniqueEvents(archivedForDate, activeEvents);
  if (!fullEvents.length) {
    return next;
  }

  const reducedState = reduceEvents(fullEvents, dateKey);
  const lastEvent = fullEvents[fullEvents.length - 1];

  next.snapshots[dateKey] = {
    date: dateKey,
    state: reducedState,
    lastEventId: lastEvent.id,
    createdAt: Date.now(),
    eventCount: fullEvents.length
  };

  // Keep source-of-truth: move compacted events to archive instead of discarding.
  next.eventArchive[dateKey] = fullEvents;
  next.events = (next.events ?? []).filter((event) => !(event.date === dateKey));

  return next;
}
