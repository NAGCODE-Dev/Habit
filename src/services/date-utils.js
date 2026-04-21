import { WATER_REMINDER_HOURS } from "./constants.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

export function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(dateKey, amount) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return getLocalDateKey(date);
}

export function listIntermediateDateKeys(fromDateKey, toDateKey) {
  const dates = [];
  let pointer = addDays(fromDateKey, 1);
  while (pointer < toDateKey) {
    dates.push(pointer);
    pointer = addDays(pointer, 1);
  }
  return dates;
}

export function formatDisplayDate(dateKey) {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short"
  });

  return formatter.format(parseDateKey(dateKey));
}

export function formatLongDate(dateKey) {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  });

  return formatter.format(parseDateKey(dateKey));
}

export function timeToMinutes(timeValue) {
  if (!timeValue || !timeValue.includes(":")) {
    return null;
  }

  const [hours, minutes] = timeValue.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function circularMinuteDifference(actualTime, idealTime) {
  const actualMinutes = timeToMinutes(actualTime);
  const idealMinutes = timeToMinutes(idealTime);

  if (actualMinutes === null || idealMinutes === null) {
    return null;
  }

  const absolute = Math.abs(actualMinutes - idealMinutes);
  return Math.min(absolute, 1440 - absolute);
}

export function diffNotice(actualTime, idealTime) {
  const difference = circularMinuteDifference(actualTime, idealTime);
  if (difference === null || difference <= 30) {
    return "";
  }

  return `Diferença de ${difference}min - ajuste amanhã.`;
}

export function nowTimeValue(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function millisecondsUntilNextMidnight(date = new Date()) {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - date.getTime();
}

export function findDueReminderHour(date, sentHours = []) {
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const sentSet = new Set(sentHours);

  const dueHours = WATER_REMINDER_HOURS.filter((hour) => {
    if (sentSet.has(hour)) {
      return false;
    }

    const reminderStart = hour * 60;
    return currentMinutes >= reminderStart && currentMinutes < reminderStart + 60;
  });

  return dueHours.length > 0 ? dueHours[dueHours.length - 1] : null;
}

export function reminderLabel(hour) {
  return `${pad(hour)}:00`;
}
