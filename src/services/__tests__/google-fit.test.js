import test from "node:test";
import assert from "node:assert/strict";
import { parseGoogleFitAggregate } from "../googleFitService.js";

test("parseGoogleFitAggregate consolida métricas do bucket diário", () => {
  const payload = {
    bucket: [
      {
        dataset: [
          {
            dataSourceId: "derived:com.google.step_count.delta:merge_step_deltas",
            point: [{ value: [{ intVal: 8500 }] }]
          },
          {
            dataSourceId: "derived:com.google.calories.expended:merge_calories_expended",
            point: [{ value: [{ fpVal: 530.4 }] }]
          },
          {
            dataSourceId: "derived:com.google.hydration:merge_hydration",
            point: [{ value: [{ fpVal: 1.2 }] }]
          },
          {
            dataSourceId: "derived:com.google.active_minutes:merge_active_minutes",
            point: [{ value: [{ intVal: 42 }] }]
          },
          {
            dataSourceId: "derived:com.google.sleep.segment:merge_sleep_segments",
            point: [
              {
                startTimeNanos: "1713666000000000000",
                endTimeNanos: "1713691200000000000"
              }
            ]
          }
        ]
      }
    ]
  };

  const summary = parseGoogleFitAggregate(payload);
  assert.equal(summary.steps, 8500);
  assert.equal(summary.calories, 530);
  assert.equal(summary.hydrationMl, 1200);
  assert.equal(summary.activeMinutes, 42);
  assert.equal(typeof summary.sleepStart, "string");
  assert.equal(typeof summary.wakeTime, "string");
});

test("parseGoogleFitAggregate retorna zeros para payload vazio", () => {
  const summary = parseGoogleFitAggregate({});
  assert.deepEqual(summary, {
    steps: 0,
    calories: 0,
    hydrationMl: 0,
    activeMinutes: 0,
    sleepStart: "",
    wakeTime: ""
  });
});
