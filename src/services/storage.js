import {
  DB_APP_STATE_KEY,
  DB_NAME,
  DB_STORE,
  DB_VERSION
} from "./constants.js";

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

async function withStore(mode, callback) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, mode);
    const store = transaction.objectStore(DB_STORE);
    const request = callback(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadAppState() {
  try {
    return (await withStore("readonly", (store) => store.get(DB_APP_STATE_KEY))) ?? null;
  } catch (error) {
    console.error("Unable to load app state", error);
    return null;
  }
}

export async function saveAppState(state) {
  try {
    await withStore("readwrite", (store) => store.put(state, DB_APP_STATE_KEY));
  } catch (error) {
    console.error("Unable to save app state", error);
  }
}
