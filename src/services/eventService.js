import { createSafeDayTemplate, validateDay } from "./integrityService.js";

export const EVENT_TYPES = {
  SNAPSHOT_SEEDED: "SNAPSHOT_SEEDED",
  WATER_ADDED: "WATER_ADDED",
  WATER_UNDONE: "WATER_UNDONE",
  HABIT_SET: "HABIT_SET",
  SLEEP_TIME_SET: "SLEEP_TIME_SET",
  MEAL_TIME_SET: "MEAL_TIME_SET",
  TRAINING_NOTES_SET: "TRAINING_NOTES_SET",
  REMINDER_SENT: "REMINDER_SENT"
};

export function createEvent({ date, type, payload = {}, timestamp = Date.now() }) {
  return {
    id: `evt_${timestamp}_${Math.random().toString(16).slice(2, 8)}`,
    date,
    type,
    payload,
    timestamp
  };
}

export function reduceEvents(events, dateKey, { baseDay = null, startAfterEventId = null } = {}) {
  const day = baseDay ? validateDay(baseDay, dateKey) : createSafeDayTemplate(dateKey);

  const orderedEvents = (Array.isArray(events) ? events : [])
    .filter((event) => event && event.date === dateKey)
    .sort((a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)));
  const startIndex = startAfterEventId
    ? orderedEvents.findIndex((event) => event.id === startAfterEventId) + 1
    : 0;
  const dayEvents = startIndex > 0 ? orderedEvents.slice(startIndex) : orderedEvents;

  for (const event of dayEvents) {
    switch (event.type) {
      case EVENT_TYPES.SNAPSHOT_SEEDED: {
        const snapshot = validateDay(event.payload?.day, dateKey);
        day.habits = snapshot.habits;
        day.meals = snapshot.meals;
        day.water = snapshot.water;
        day.sleep = snapshot.sleep;
        day.workout = snapshot.workout;
        day.school = snapshot.school;
        break;
      }
      case EVENT_TYPES.WATER_ADDED:
        day.water.logs.push({
          id: String(event.payload?.id ?? `water_${event.timestamp}`),
          amount: Math.max(0, Math.round(Number(event.payload?.amount ?? 0))),
          timestamp: new Date(event.timestamp).toISOString()
        });
        day.water.total += Math.max(0, Math.round(Number(event.payload?.amount ?? 0)));
        break;
      case EVENT_TYPES.WATER_UNDONE: {
        const lastEntry = day.water.logs.pop();
        if (lastEntry) {
          day.water.total = Math.max(0, day.water.total - Number(lastEntry.amount ?? 0));
        }
        break;
      }
      case EVENT_TYPES.HABIT_SET: {
        const key = event.payload?.habitId;
        if (typeof key === "string" && Object.hasOwn(day.habits, key)) {
          day.habits[key] = Boolean(event.payload?.checked);
          if (key === "runDone" && day.habits.runDone) {
            day.habits.runSkipped = false;
          }
          if (key === "runSkipped" && day.habits.runSkipped) {
            day.habits.runDone = false;
          }
        }
        break;
      }
      case EVENT_TYPES.SLEEP_TIME_SET: {
        const field = event.payload?.field;
        if (field === "sleepActual") {
          day.sleep.actual.sleep = String(event.payload?.value ?? "");
        }
        if (field === "wakeActual") {
          day.sleep.actual.wake = String(event.payload?.value ?? "");
        }
        break;
      }
      case EVENT_TYPES.MEAL_TIME_SET: {
        const key = event.payload?.mealId;
        if (typeof key === "string" && Object.hasOwn(day.meals, key)) {
          day.meals[key] = String(event.payload?.value ?? "");
        }
        break;
      }
      case EVENT_TYPES.TRAINING_NOTES_SET:
        day.workout.notes = String(event.payload?.value ?? "");
        break;
      case EVENT_TYPES.REMINDER_SENT: {
        const hour = Math.round(Number(event.payload?.hour));
        if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
          const sent = new Set(day.water.reminderSentHours);
          sent.add(hour);
          day.water.reminderSentHours = [...sent].sort((a, b) => a - b);
        }
        break;
      }
      default:
        break;
    }
  }

  day.sleep.onTime.sleep = Boolean(day.habits.sleepOnTime);
  day.sleep.onTime.wake = Boolean(day.habits.wakeOnTime);
  day.workout.completed.runDone = Boolean(day.habits.runDone);
  day.workout.completed.runSkipped = Boolean(day.habits.runSkipped);
  day.workout.completed.trainingActivation = Boolean(day.habits.trainingActivation);
  day.workout.completed.strengthTraining = Boolean(day.habits.strengthTraining);
  day.workout.completed.conditioning = Boolean(day.habits.conditioning);
  day.workout.completed.postStretch = Boolean(day.habits.postStretch);

  return validateDay(day, dateKey);
}
