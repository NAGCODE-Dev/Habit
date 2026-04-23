import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldSilenceBackgroundSyncError,
  showServiceWorkerNotification
} from "../../src/services/notifications.js";

function createFakeMessageChannel() {
  class FakePort {
    constructor() {
      this.onmessage = null;
      this.peer = null;
    }

    postMessage(data) {
      queueMicrotask(() => {
        this.peer?.onmessage?.({ data });
      });
    }

    close() {}
  }

  return class FakeMessageChannel {
    constructor() {
      this.port1 = new FakePort();
      this.port2 = new FakePort();
      this.port1.peer = this.port2;
      this.port2.peer = this.port1;
    }
  };
}

test("shouldSilenceBackgroundSyncError silencia NotAllowedError", () => {
  assert.equal(shouldSilenceBackgroundSyncError({ name: "NotAllowedError" }), true);
  assert.equal(shouldSilenceBackgroundSyncError({ message: "NotAllowedError: Permission denied." }), true);
  assert.equal(shouldSilenceBackgroundSyncError({ name: "SecurityError", message: "Permission denied." }), false);
  assert.equal(shouldSilenceBackgroundSyncError({ name: "TypeError" }), false);
  assert.equal(shouldSilenceBackgroundSyncError(null), false);
});

test("showServiceWorkerNotification confirma entrega via ack do service worker", async () => {
  const originalNavigator = globalThis.navigator;
  const OriginalMessageChannel = globalThis.MessageChannel;

  globalThis.MessageChannel = /** @type {any} */ (createFakeMessageChannel());
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      serviceWorker: {
        ready: Promise.resolve({
          active: {
            postMessage(message, ports) {
              ports[0].postMessage({
                requestId: message.payload.requestId,
                ok: true
              });
            }
          }
        })
      }
    }
  });

  try {
    const delivered = await showServiceWorkerNotification("Titulo", "Corpo", "tag");
    assert.equal(delivered, true);
  } finally {
    globalThis.MessageChannel = OriginalMessageChannel;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  }
});

test("showServiceWorkerNotification falha quando não existe service worker ativo", async () => {
  const originalNavigator = globalThis.navigator;
  const OriginalMessageChannel = globalThis.MessageChannel;

  globalThis.MessageChannel = /** @type {any} */ (createFakeMessageChannel());
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      serviceWorker: {
        ready: Promise.resolve({
          active: null
        })
      }
    }
  });

  try {
    const delivered = await showServiceWorkerNotification("Titulo", "Corpo", "tag");
    assert.equal(delivered, false);
  } finally {
    globalThis.MessageChannel = OriginalMessageChannel;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  }
});
