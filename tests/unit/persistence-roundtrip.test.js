import test from "node:test";
import assert from "node:assert/strict";
import FDBFactory from "fake-indexeddb/lib/FDBFactory";
import {
  DB_APP_STATE_BACKUP_KEY,
  DB_APP_STATE_KEY,
  DB_NAME,
  DB_STORE,
  DB_VERSION
} from "../../src/services/constants.js";

function openDatabase(factory) {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);

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

async function writeRawState(factory, state) {
  const database = await openDatabase(factory);

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readwrite");
    const store = transaction.objectStore(DB_STORE);
    store.put(state, DB_APP_STATE_KEY);
    store.put(state, DB_APP_STATE_BACKUP_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function readRawState(factory) {
  const database = await openDatabase(factory);

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readonly");
    const store = transaction.objectStore(DB_STORE);
    const request = store.get(DB_APP_STATE_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

test("storageService faz roundtrip e remove campos legados do estado persistido", async () => {
  const factory = new FDBFactory();
  globalThis.indexedDB = factory;

  const todayKey = "2026-04-21";
  await writeRawState(factory, {
    version: 6,
    schemaVersion: 6,
    currentDayKey: todayKey,
    day: {
      date: todayKey,
      water: { total: 400, logs: [] }
    },
    analyticsCache: { payload: { ok: true }, lastComputed: "12" },
    telemetryShadow: {
      googleFit: {
        [todayKey]: { steps: 8000 }
      }
    }
  });

  const storageModule = await import(`../../src/services/storageService.js?case=${Date.now()}`);
  const loaded = await storageModule.loadState();
  assert.equal("telemetryShadow" in loaded, false);
  assert.equal(loaded.day.water.total, 400);
  assert.equal(loaded.analyticsCache.lastComputed, 12);

  await storageModule.saveState(loaded);

  const rawPersisted = await readRawState(factory);
  assert.equal("telemetryShadow" in rawPersisted, false);
  assert.equal(rawPersisted.day.water.total, 400);

  const reread = await storageModule.loadState();
  assert.equal("telemetryShadow" in reread, false);
  assert.equal(reread.day.water.total, 400);

  delete globalThis.indexedDB;
});
