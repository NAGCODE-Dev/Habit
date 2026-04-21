export function updateGoogleFitTelemetry(state, dateKey, summary) {
  const next = {
    ...state,
    telemetryShadow: {
      ...(state.telemetryShadow ?? {}),
      googleFit: {
        ...(state.telemetryShadow?.googleFit ?? {})
      }
    }
  };

  next.telemetryShadow.googleFit[dateKey] = {
    source: "google-fit",
    steps: Math.max(0, Math.round(Number(summary?.steps ?? 0))),
    calories: Math.max(0, Math.round(Number(summary?.calories ?? 0))),
    hydrationMl: Math.max(0, Math.round(Number(summary?.hydrationMl ?? 0))),
    activeMinutes: Math.max(0, Math.round(Number(summary?.activeMinutes ?? 0))),
    sleepStart: typeof summary?.sleepStart === "string" ? summary.sleepStart : "",
    wakeTime: typeof summary?.wakeTime === "string" ? summary.wakeTime : "",
    updatedAt: Date.now()
  };

  return next;
}

export function getGoogleFitTelemetry(state, dateKey) {
  return state?.telemetryShadow?.googleFit?.[dateKey] ?? null;
}
