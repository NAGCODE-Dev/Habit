import {
  DEFAULT_SECTION_OPEN,
  MAX_WATER_SINGLE_ENTRY_ML,
  MEAL_FIELDS
} from "./constants.js";

const VALID_SECTION_IDS = new Set(Object.keys(DEFAULT_SECTION_OPEN));
const VALID_MEAL_IDS = new Set(MEAL_FIELDS.map((meal) => meal.id));
const TIME_VALUE_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidSectionId(sectionId) {
  return VALID_SECTION_IDS.has(sectionId);
}

export function isValidMealId(mealId) {
  return VALID_MEAL_IDS.has(mealId);
}

export function isValidHabitId(day, habitId) {
  return typeof habitId === "string" && Boolean(day?.habits) && Object.hasOwn(day.habits, habitId);
}

export function sanitizeTimeValue(value) {
  const time = String(value ?? "").trim();
  return TIME_VALUE_PATTERN.test(time) ? time : "";
}

export function sanitizeWaterAmount(amount) {
  const value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value <= 0 || value > MAX_WATER_SINGLE_ENTRY_ML) {
    return null;
  }
  return value;
}
