import { WATER_GOAL_ML } from "./constants.js";
import { timeToMinutes } from "./date-utils.js";
import { computeProgress } from "./historyService.js";

function trend(values) {
  if (values.length < 4) {
    return "stable";
  }

  const midpoint = Math.floor(values.length / 2);
  const previous = values.slice(0, midpoint);
  const recent = values.slice(midpoint);

  const previousAvg = previous.reduce((sum, value) => sum + value, 0) / Math.max(previous.length, 1);
  const recentAvg = recent.reduce((sum, value) => sum + value, 0) / Math.max(recent.length, 1);

  if (recentAvg > previousAvg + 5) {
    return "up";
  }
  if (recentAvg < previousAvg - 5) {
    return "down";
  }
  return "stable";
}

export function weeklyConsistency(days) {
  const considered = days.slice(0, 7);
  const completedDays = considered.filter((day) => computeProgress(day).percentage >= 80).length;
  return {
    activeDays: considered.length,
    completedDays,
    completionRate: considered.length ? Math.round((completedDays / considered.length) * 100) : 0
  };
}

export function waterMetrics(days) {
  const considered = days.slice(0, 30);
  const totals = considered.map((day) => day.water.total);
  const avgPerDay = totals.length ? Math.round(totals.reduce((sum, value) => sum + value, 0) / totals.length) : 0;
  const daysBelowGoal = considered.filter((day) => day.water.total < WATER_GOAL_ML).length;

  let streakAboveGoal = 0;
  for (const day of considered) {
    if (day.water.total >= WATER_GOAL_ML) {
      streakAboveGoal += 1;
      continue;
    }
    break;
  }

  return {
    avgPerDay,
    daysBelowGoal,
    streakAboveGoal,
    trend: trend(totals.reverse())
  };
}

export function workoutMetrics(days) {
  const considered = days.slice(0, 30);
  const done = considered.filter((day) => day.habits.runDone || day.habits.trainingActivation).length;
  const missedDays = considered.filter((day) => day.habits.runSkipped).length;
  const intensityValues = considered.map((day) => {
    let score = 0;
    if (day.habits.trainingActivation) score += 1;
    if (day.habits.strengthTraining) score += 1;
    if (day.habits.conditioning) score += 1;
    if (day.habits.postStretch) score += 1;
    return score * 25;
  });

  return {
    workoutFrequency: considered.length ? Math.round((done / considered.length) * 100) : 0,
    missedDays,
    intensityScore: intensityValues.length ? Math.round(intensityValues.reduce((sum, v) => sum + v, 0) / intensityValues.length) : 0,
    consistencyTrend: trend(intensityValues.reverse())
  };
}

export function sleepMetrics(days) {
  const considered = days.slice(0, 30);
  const sleepMins = considered
    .map((day) => timeToMinutes(day.sleep.actual.sleep))
    .filter((value) => value !== null);
  const target = timeToMinutes("22:30") ?? 0;
  const avgSleepTime = sleepMins.length ? Math.round(sleepMins.reduce((sum, value) => sum + value, 0) / sleepMins.length) : target;
  const deviationFromTarget = Math.abs(avgSleepTime - target);

  const consistency = considered.length
    ? Math.round((considered.filter((day) => day.habits.sleepOnTime && day.habits.wakeOnTime).length / considered.length) * 100)
    : 0;

  return {
    avgSleepTime,
    consistency,
    deviationFromTarget
  };
}

export function weightedScore(day) {
  const progress = computeProgress(day);
  const habitsScore = progress.percentage;
  const waterScore = Math.min(100, Math.round((day.water.total / WATER_GOAL_ML) * 100));
  const sleepScore = day.habits.sleepOnTime && day.habits.wakeOnTime ? 100 : day.habits.sleepOnTime || day.habits.wakeOnTime ? 50 : 0;
  const workoutScore = day.habits.trainingActivation || day.habits.runDone ? 100 : 0;

  return Math.round((habitsScore * 0.4) + (waterScore * 0.2) + (sleepScore * 0.2) + (workoutScore * 0.2));
}
