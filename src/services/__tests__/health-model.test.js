import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAppState } from "../dayService.js";
import { updateGoogleFitTelemetry } from "../telemetryService.js";
import { buildUnifiedHealthModel } from "../healthModelService.js";

test("updateGoogleFitTelemetry grava telemetria sem alterar o core day", () => {
  const date = "2026-04-21";
  const base = normalizeAppState(null, date);
  const updated = updateGoogleFitTelemetry(base, date, { steps: 6000, hydrationMl: 900 });

  assert.equal(updated.day.water.total, base.day.water.total);
  assert.equal(updated.telemetryShadow.googleFit[date].steps, 6000);
  assert.equal(updated.telemetryShadow.googleFit[date].hydrationMl, 900);
});

test("buildUnifiedHealthModel combina core e telemetria para insights", () => {
  const date = "2026-04-21";
  const base = normalizeAppState(null, date);
  const updated = updateGoogleFitTelemetry(base, date, { activeMinutes: 40 });
  const model = buildUnifiedHealthModel(updated, date);

  assert.equal(model.date, date);
  assert.equal(model.telemetry.activeMinutes, 40);
  assert.equal(typeof model.insights.activityInsight, "string");
});
