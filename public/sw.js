const CACHE_NAME = `habit-athlete-__SW_VERSION__`;
const CACHE_FILES = __CACHE_FILES__;
const DB_NAME = "habit-athlete-pwa";
const DB_VERSION = 1;
const DB_STORE = "kv";
const APP_STATE_KEY = "app-state";
const APP_STATE_BACKUP_KEY = "app-state-backup";
const WATER_GOAL_ML = 3000;
const WATER_REMINDER_HOURS = [8, 10, 12, 14, 16, 18, 20];

function openDatabase() {
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

async function readState() {
  try {
    const database = await openDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readonly");
      const store = transaction.objectStore(DB_STORE);
      const request = store.get(APP_STATE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function saveState(state) {
  try {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readwrite");
      const store = transaction.objectStore(DB_STORE);
      store.put(state, APP_STATE_KEY);
      store.put(state, APP_STATE_BACKUP_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    return null;
  }

  return state;
}

function getTodayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dueReminderHour(date, sentHours) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const sentSet = new Set(sentHours ?? []);
  const due = WATER_REMINDER_HOURS.filter((hour) => {
    if (sentSet.has(hour)) {
      return false;
    }

    const start = hour * 60;
    return minutes >= start && minutes < start + 60;
  });

  return due.length ? due[due.length - 1] : null;
}

function getWaterTotal(day) {
  const amount = day?.water && typeof day.water === "object"
    ? day.water.total
    : day?.waterTotalMl;

  const safeAmount = Math.round(Number(amount ?? 0));
  return Number.isFinite(safeAmount) ? Math.max(0, safeAmount) : 0;
}

function getReminderSentHours(day) {
  const rawHours = Array.isArray(day?.water?.reminderSentHours)
    ? day.water.reminderSentHours
    : Array.isArray(day?.reminderSentHours)
      ? day.reminderSentHours
      : [];

  return [...new Set(
    rawHours
      .map((hour) => Math.round(Number(hour)))
      .filter((hour) => Number.isFinite(hour) && hour >= 0 && hour <= 23)
  )].sort((left, right) => left - right);
}

function assignReminderSentHours(day, sentHours) {
  if (!day || typeof day !== "object") {
    return;
  }

  if (day.water && typeof day.water === "object") {
    day.water.reminderSentHours = sentHours;
    delete day.reminderSentHours;
    return;
  }

  day.reminderSentHours = sentHours;
}

async function maybeSendWaterReminder() {
  const state = await readState();
  if (!state?.day || state.currentDayKey !== getTodayKey()) {
    return;
  }

  const waterTotalMl = getWaterTotal(state.day);
  if (waterTotalMl >= WATER_GOAL_ML) {
    return;
  }

  const sentHours = getReminderSentHours(state.day);
  const hour = dueReminderHour(new Date(), sentHours);
  if (hour === null) {
    return;
  }

  await self.registration.showNotification(`Agua ${String(hour).padStart(2, "0")}:00`, {
    body: `Hora de beber agua. Hoje: ${waterTotalMl} / ${WATER_GOAL_ML} ml.`,
    tag: `water-${state.currentDayKey}-${hour}`,
    badge: "./icons/icon-192.png",
    icon: "./icons/icon-192.png"
  });

  const sent = new Set(sentHours);
  sent.add(hour);
  assignReminderSentHours(state.day, [...sent].sort((left, right) => left - right));
  await saveState(state);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return null;
          })
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("message", (event) => {
  const message = event.data ?? {};
  if (message.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (message.type === "SHOW_NOTIFICATION") {
    const payload = message.payload ?? {};
    event.waitUntil(
      self.registration.showNotification(payload.title ?? "Rotina", {
        body: payload.body ?? "",
        tag: payload.tag ?? "habit-athlete-notice",
        badge: "./icons/icon-192.png",
        icon: "./icons/icon-192.png"
      })
    );
    return;
  }

  if (message.type === "CHECK_WATER_REMINDERS") {
    event.waitUntil(maybeSendWaterReminder());
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "water-reminders") {
    event.waitUntil(maybeSendWaterReminder());
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "water-reminders") {
    event.waitUntil(maybeSendWaterReminder());
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          return client.focus();
        }
      }

      return self.clients.openWindow("./");
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            new URL(event.request.url).origin === self.location.origin
          ) {
            const clonedResponse = networkResponse.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clonedResponse))
            );
          }

          return networkResponse;
        })
        .catch(async () => {
          if (event.request.mode === "navigate") {
            return caches.match("./offline.html");
          }

          return Response.error();
        });
    })
  );
});
