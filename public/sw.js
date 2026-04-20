const CACHE_NAME = `habit-athlete-__SW_VERSION__`;
const CACHE_FILES = __CACHE_FILES__;
const DB_NAME = "habit-athlete-pwa";
const DB_VERSION = 1;
const DB_STORE = "kv";
const APP_STATE_KEY = "app-state";
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
      const request = store.put(state, APP_STATE_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
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

async function maybeSendWaterReminder() {
  const state = await readState();
  if (!state?.day || state.currentDayKey !== getTodayKey()) {
    return;
  }

  if (Number(state.day.waterTotalMl ?? 0) >= WATER_GOAL_ML) {
    return;
  }

  const hour = dueReminderHour(new Date(), state.day.reminderSentHours ?? []);
  if (hour === null) {
    return;
  }

  const sent = new Set(state.day.reminderSentHours ?? []);
  sent.add(hour);
  state.day.reminderSentHours = [...sent].sort((left, right) => left - right);
  await saveState(state);

  await self.registration.showNotification(`Agua ${String(hour).padStart(2, "0")}:00`, {
    body: `Hora de beber agua. Hoje: ${state.day.waterTotalMl ?? 0} / ${WATER_GOAL_ML} ml.`,
    tag: `water-${state.currentDayKey}-${hour}`,
    badge: "./icons/icon-192.png",
    icon: "./icons/icon-192.png"
  });
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
