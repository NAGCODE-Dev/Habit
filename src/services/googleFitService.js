import { getLocalDateKey } from "./date-utils.js";

const GOOGLE_FIT_AGGREGATE_URL = "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate";
const NS_IN_MS = 1_000_000;

function toMillisFromDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function nanosToTimeString(nanos) {
  const ms = Number(nanos) / NS_IN_MS;
  if (!Number.isFinite(ms) || ms <= 0) {
    return "";
  }

  const date = new Date(ms);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getPointNumericValue(point) {
  const value = point?.value?.[0];
  if (!value) {
    return 0;
  }

  if (Number.isFinite(value.intVal)) {
    return Number(value.intVal);
  }
  if (Number.isFinite(value.fpVal)) {
    return Number(value.fpVal);
  }
  return 0;
}

export function parseGoogleFitAggregate(responseBody) {
  const buckets = Array.isArray(responseBody?.bucket) ? responseBody.bucket : [];
  const summary = {
    steps: 0,
    calories: 0,
    hydrationMl: 0,
    activeMinutes: 0,
    sleepStart: "",
    wakeTime: ""
  };

  for (const bucket of buckets) {
    const datasets = Array.isArray(bucket?.dataset) ? bucket.dataset : [];
    for (const dataset of datasets) {
      const source = String(dataset?.dataSourceId ?? "");
      const points = Array.isArray(dataset?.point) ? dataset.point : [];

      if (source.includes("step_count")) {
        summary.steps += points.reduce((sum, point) => sum + getPointNumericValue(point), 0);
      }
      if (source.includes("calories.expended")) {
        summary.calories += points.reduce((sum, point) => sum + getPointNumericValue(point), 0);
      }
      if (source.includes("hydration")) {
        const liters = points.reduce((sum, point) => sum + getPointNumericValue(point), 0);
        summary.hydrationMl += Math.round(liters * 1000);
      }
      if (source.includes("active_minutes")) {
        summary.activeMinutes += points.reduce((sum, point) => sum + getPointNumericValue(point), 0);
      }
      if (source.includes("sleep.segment")) {
        const sleepPoints = points
          .map((point) => ({
            start: Number(point?.startTimeNanos ?? 0),
            end: Number(point?.endTimeNanos ?? 0)
          }))
          .filter((point) => Number.isFinite(point.start) && Number.isFinite(point.end) && point.end > point.start)
          .sort((left, right) => left.start - right.start);

        if (sleepPoints.length) {
          summary.sleepStart = nanosToTimeString(sleepPoints[0].start);
          summary.wakeTime = nanosToTimeString(sleepPoints[sleepPoints.length - 1].end);
        }
      }
    }
  }

  summary.steps = Math.max(0, Math.round(summary.steps));
  summary.calories = Math.max(0, Math.round(summary.calories));
  summary.activeMinutes = Math.max(0, Math.round(summary.activeMinutes));
  summary.hydrationMl = Math.max(0, Math.round(summary.hydrationMl));
  return summary;
}

export async function fetchGoogleFitDailySummary(accessToken, dateKey = getLocalDateKey()) {
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error("Token de acesso do Google Fit não informado.");
  }

  const startTimeMillis = toMillisFromDateKey(dateKey);
  const endTimeMillis = startTimeMillis + (24 * 60 * 60 * 1000);

  const response = await fetch(GOOGLE_FIT_AGGREGATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken.trim()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      startTimeMillis,
      endTimeMillis,
      aggregateBy: [
        { dataTypeName: "com.google.step_count.delta" },
        { dataTypeName: "com.google.calories.expended" },
        { dataTypeName: "com.google.hydration" },
        { dataTypeName: "com.google.active_minutes" },
        { dataTypeName: "com.google.sleep.segment" }
      ],
      bucketByTime: { durationMillis: 24 * 60 * 60 * 1000 }
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Google Fit retornou erro ${response.status}: ${message}`);
  }

  const payload = await response.json();
  return parseGoogleFitAggregate(payload);
}
