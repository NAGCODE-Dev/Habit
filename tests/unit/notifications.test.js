import test from "node:test";
import assert from "node:assert/strict";
import { shouldSilenceBackgroundSyncError } from "../../src/services/notifications.js";

test("shouldSilenceBackgroundSyncError silencia NotAllowedError", () => {
  assert.equal(shouldSilenceBackgroundSyncError({ name: "NotAllowedError" }), true);
  assert.equal(shouldSilenceBackgroundSyncError({ message: "NotAllowedError: Permission denied." }), true);
  assert.equal(shouldSilenceBackgroundSyncError({ name: "SecurityError", message: "Permission denied." }), false);
  assert.equal(shouldSilenceBackgroundSyncError({ name: "TypeError" }), false);
  assert.equal(shouldSilenceBackgroundSyncError(null), false);
});
