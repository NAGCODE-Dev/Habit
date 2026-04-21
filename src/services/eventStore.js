import { createEvent } from "./eventService.js";

function normalizeEvents(events) {
  if (!Array.isArray(events)) {
    return [];
  }

  const seen = new Set();
  return events
    .filter((event) => event && event.id && !seen.has(event.id) && seen.add(event.id))
    .sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));
}

export function appendEvent(events, input) {
  const event = createEvent(input);
  return normalizeEvents([...normalizeEvents(events), event]);
}

export function getEventsByDate(events, dateKey) {
  return normalizeEvents(events).filter((event) => event.date === dateKey);
}

export function getEventsAfterEventId(events, eventId) {
  const normalized = normalizeEvents(events);
  const index = normalized.findIndex((event) => event.id === eventId);
  if (index < 0) {
    return normalized;
  }
  return normalized.slice(index + 1);
}

export function buildEventIndex(events) {
  const normalized = normalizeEvents(events);
  const byDate = {};
  const byType = {};

  for (const event of normalized) {
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
    lastEventId: normalized.at(-1)?.id ?? null
  };
}

export function getAllEvents(events) {
  return normalizeEvents(events);
}
