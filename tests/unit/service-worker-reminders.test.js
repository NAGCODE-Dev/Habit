// @ts-check

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import FDBFactory from "fake-indexeddb/lib/FDBFactory";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const serviceWorkerPath = path.join(rootDir, "public", "sw.js");
const DB_NAME = "habit-athlete-pwa";
const DB_VERSION = 1;
const DB_STORE = "kv";
const APP_STATE_KEY = "app-state";
const APP_STATE_BACKUP_KEY = "app-state-backup";
const FIXED_NOW = "2026-04-21T14:15:00";

const serviceWorkerSource = (await readFile(serviceWorkerPath, "utf8"))
  .replace("__CACHE_FILES__", "[]")
  .replace("__SW_VERSION__", "test-version");

function createFixedDate(nowIsoString) {
  const RealDate = Date;

  return class FixedDate extends RealDate {
    constructor(value = nowIsoString) {
      super(value);
    }

    static now() {
      return new RealDate(nowIsoString).getTime();
    }
  };
}

async function openDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DB_STORE)) {
        database.createObjectStore(DB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seedState(indexedDB, state) {
  const database = await openDatabase(indexedDB);
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readwrite");
    const store = transaction.objectStore(DB_STORE);
    store.put(state, APP_STATE_KEY);
    store.put(state, APP_STATE_BACKUP_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function readState(indexedDB, key = APP_STATE_KEY) {
  const database = await openDatabase(indexedDB);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readonly");
    const store = transaction.objectStore(DB_STORE);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

function createServiceWorkerHarness({
  now = FIXED_NOW,
  showNotificationImpl = async () => {}
} = {}) {
  const listeners = new Map();
  const indexedDB = new FDBFactory();

  const self = {
    registration: {
      showNotification: showNotificationImpl
    },
    clients: {
      matchAll: async () => [],
      openWindow: async () => null
    },
    location: {
      origin: "http://localhost"
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    skipWaiting() {}
  };

  const context = {
    console,
    indexedDB,
    caches: {
      open: async () => ({
        addAll: async () => {},
        put: async () => {}
      }),
      keys: async () => [],
      match: async () => null
    },
    fetch: async () => ({
      status: 200,
      clone() {
        return this;
      }
    }),
    Response: {
      error() {
        return new Error("response-error");
      }
    },
    URL,
    Date: createFixedDate(now),
    Promise,
    setTimeout,
    clearTimeout,
    self
  };

  context.globalThis = context;

  vm.runInNewContext(serviceWorkerSource, context, {
    filename: "public/sw.js"
  });

  return {
    indexedDB,
    async dispatch(type, init = {}) {
      const handler = listeners.get(type);
      assert.ok(handler, `missing ${type} listener`);

      const pending = [];
      const event = {
        ...init,
        waitUntil(promise) {
          pending.push(Promise.resolve(promise));
        }
      };

      handler(event);
      await Promise.all(pending);
    }
  };
}

test("service worker respeita total de água no schema atual", async () => {
  const notifications = [];
  const harness = createServiceWorkerHarness({
    showNotificationImpl: async (...args) => {
      notifications.push(args);
    }
  });

  await seedState(harness.indexedDB, {
    currentDayKey: "2026-04-21",
    day: {
      water: {
        total: 3000,
        reminderSentHours: []
      }
    }
  });

  await harness.dispatch("sync", { tag: "water-reminders" });

  assert.equal(notifications.length, 0);
  const savedState = await readState(harness.indexedDB);
  assert.deepEqual(savedState.day.water.reminderSentHours, []);
});

test("service worker respeita reminderSentHours no schema atual", async () => {
  const notifications = [];
  const harness = createServiceWorkerHarness({
    showNotificationImpl: async (...args) => {
      notifications.push(args);
    }
  });

  await seedState(harness.indexedDB, {
    currentDayKey: "2026-04-21",
    day: {
      water: {
        total: 500,
        reminderSentHours: [14]
      }
    }
  });

  await harness.dispatch("sync", { tag: "water-reminders" });

  assert.equal(notifications.length, 0);
  const savedState = await readState(harness.indexedDB);
  assert.deepEqual(savedState.day.water.reminderSentHours, [14]);
});

test("service worker não consome reminder quando showNotification falha", async () => {
  const harness = createServiceWorkerHarness({
    showNotificationImpl: async () => {
      throw new Error("notification-failed");
    }
  });

  await seedState(harness.indexedDB, {
    currentDayKey: "2026-04-21",
    day: {
      water: {
        total: 500,
        reminderSentHours: []
      }
    }
  });

  await assert.rejects(
    () => harness.dispatch("sync", { tag: "water-reminders" }),
    /notification-failed/
  );

  const savedState = await readState(harness.indexedDB);
  assert.deepEqual(savedState.day.water.reminderSentHours, []);
});

test("service worker persiste reminder enviado no campo aninhado após entrega", async () => {
  const notifications = [];
  const harness = createServiceWorkerHarness({
    showNotificationImpl: async (...args) => {
      notifications.push(args);
    }
  });

  await seedState(harness.indexedDB, {
    currentDayKey: "2026-04-21",
    day: {
      water: {
        total: 500,
        reminderSentHours: []
      }
    }
  });

  await harness.dispatch("sync", { tag: "water-reminders" });

  assert.equal(notifications.length, 1);
  assert.match(String(notifications[0][1]?.body ?? ""), /500 \/ 3000 ml/);

  const savedState = await readState(harness.indexedDB);
  assert.deepEqual(savedState.day.water.reminderSentHours, [14]);
  assert.equal(savedState.day.reminderSentHours, undefined);

  const backupState = await readState(harness.indexedDB, APP_STATE_BACKUP_KEY);
  assert.deepEqual(backupState.day.water.reminderSentHours, [14]);
});
