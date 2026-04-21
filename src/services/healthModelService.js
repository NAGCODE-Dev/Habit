import { getLegacyDaySnapshot } from "./dayService.js";
import { getGoogleFitTelemetry } from "./telemetryService.js";

export function buildUnifiedHealthModel(state, dateKey) {
  const core = getLegacyDaySnapshot(state.day);
  const telemetry = getGoogleFitTelemetry(state, dateKey) ?? {
    source: "google-fit",
    steps: 0,
    calories: 0,
    hydrationMl: 0,
    activeMinutes: 0,
    sleepStart: "",
    wakeTime: ""
  };

  const hydrationGap = core.waterTotalMl - telemetry.hydrationMl;
  const activityInsight = telemetry.activeMinutes > 0 && !core.checkboxes.conditioning
    ? "Google Fit detectou atividade, mas condicionamento não foi marcado."
    : "Atividade consistente entre registro manual e telemetria.";

  return {
    date: dateKey,
    core,
    telemetry,
    insights: {
      hydrationGap,
      activityInsight
    }
  };
}
