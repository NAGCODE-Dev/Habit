import {
  DB_APP_STATE_BACKUP_KEY,
  DB_APP_STATE_KEY,
  DB_NAME,
  DB_STORE,
  DB_VERSION
} from "./constants.js";
import { getLocalDateKey } from "./date-utils.js";
import { repairDatabase } from "./integrityService.js";

let dbPromise = null;

function openDatabase() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
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

  return dbPromise;
}

async function readRawState() {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readonly");
    const store = transaction.objectStore(DB_STORE);
    const primaryRequest = store.get(DB_APP_STATE_KEY);

    primaryRequest.onerror = () => reject(primaryRequest.error);
    primaryRequest.onsuccess = () => {
      const primary = primaryRequest.result;
      if (primary) {
        resolve(primary);
        return;
      }

      const backupRequest = store.get(DB_APP_STATE_BACKUP_KEY);
      backupRequest.onerror = () => reject(backupRequest.error);
      backupRequest.onsuccess = () => resolve(backupRequest.result ?? null);
    };
  });
}

export async function loadState() {
  try {
    const rawState = await readRawState();
    return repairDatabase(rawState, getLocalDateKey());
  } catch (error) {
    console.error("Unable to load app state", error);
    return repairDatabase(null, getLocalDateKey());
  }
}

export async function saveState(state) {
  const safeState = repairDatabase(state, getLocalDateKey());

  try {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readwrite");
      const store = transaction.objectStore(DB_STORE);

      store.put(safeState, DB_APP_STATE_KEY);
      store.put(safeState, DB_APP_STATE_BACKUP_KEY);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch (error) {
    console.error("Unable to save app state", error);
  }
}
