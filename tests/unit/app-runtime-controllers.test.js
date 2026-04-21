import test from "node:test";
import assert from "node:assert/strict";
import { handleChangeAction, handleInputAction } from "../../src/app/action-handlers.js";
import { createAppRuntime } from "../../src/app/createAppRuntime.js";
import { createReminderController } from "../../src/app/createReminderController.js";
import { createStateController } from "../../src/app/createStateController.js";
import { createToastController } from "../../src/app/createToastController.js";
import { createViewController } from "../../src/app/createViewController.js";

/**
 * @returns {any}
 */
function createTimerApi() {
  let nextId = 1;
  const timeouts = new Map();
  const intervals = new Map();

  return {
    setTimeout(callback) {
      const id = nextId++;
      timeouts.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval(callback) {
      const id = nextId++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    runAllTimeouts() {
      const callbacks = [...timeouts.entries()];
      timeouts.clear();
      for (const [, callback] of callbacks) {
        callback();
      }
    },
    countTimeouts() {
      return timeouts.size;
    },
    countIntervals() {
      return intervals.size;
    }
  };
}

test("viewController sincroniza a URL e normaliza views inválidas", () => {
  const historyCalls = [];
  const windowObject = /** @type {any} */ ({
    location: {
      href: "http://127.0.0.1:4173/?view=history"
    },
    history: {
      replaceState(_state, _title, nextUrl) {
        historyCalls.push(String(nextUrl));
        windowObject.location.href = String(nextUrl);
      }
    }
  });

  const controller = createViewController({ windowObject });
  assert.equal(controller.getInitialView(), "history");

  controller.setActiveView("today");
  assert.equal(controller.getActiveView(), "today");
  assert.equal(historyCalls.at(-1), "http://127.0.0.1:4173/");

  controller.setActiveView("invalid");
  assert.equal(controller.getActiveView(), "today");
});

test("toastController expira toast automaticamente e notifica mudanças", () => {
  const timerApi = createTimerApi();
  const snapshots = [];
  const controller = createToastController({
    windowObject: timerApi,
    onChange: (toasts) => {
      snapshots.push(toasts.map((toast) => toast.message));
    }
  });

  const toastId = controller.addToast("Salvo");
  assert.equal(typeof toastId, "string");
  assert.deepEqual(snapshots.at(-1), ["Salvo"]);

  timerApi.runAllTimeouts();
  assert.deepEqual(controller.getToasts(), []);
  assert.deepEqual(snapshots.at(-1), []);
});

test("stateController faz debounce de persistência e commit imediato limpa fila pendente", async () => {
  const timerApi = createTimerApi();
  const saves = [];
  const controller = createStateController({
    windowObject: timerApi,
    onStateChange: () => {},
    loadStateImpl: async () => null,
    saveStateImpl: async (state) => {
      saves.push(state);
    },
    normalizeAppStateImpl: (state) => ({ ...state }),
    refreshAnalyticsCacheImpl: (state) => state,
    getTodayKey: () => "2026-04-21"
  });

  const pendingDraft = controller.commit(
    { note: "rascunho", currentDayKey: "2026-04-21", day: { date: "2026-04-21" } },
    { render: false, debounceMs: 250, scheduleAnalytics: false }
  );
  assert.equal(saves.length, 0);
  assert.equal(timerApi.countTimeouts(), 1);

  await controller.commit(
    { note: "final", currentDayKey: "2026-04-21", day: { date: "2026-04-21" } },
    { render: false, scheduleAnalytics: false }
  );
  await pendingDraft;

  assert.equal(saves.length, 1);
  assert.equal(saves[0].note, "final");
  assert.equal(timerApi.countTimeouts(), 0);
});

test("stateController evita salvar novamente quando o dia atual já está alinhado", async () => {
  const timerApi = createTimerApi();
  const saves = [];
  const controller = createStateController({
    windowObject: timerApi,
    onStateChange: () => {},
    loadStateImpl: async () => null,
    saveStateImpl: async (state) => {
      saves.push(state);
    },
    normalizeAppStateImpl: (state, todayKey) => ({
      currentDayKey: state?.currentDayKey ?? todayKey,
      day: { date: state?.day?.date ?? todayKey }
    }),
    refreshAnalyticsCacheImpl: (state) => state,
    getTodayKey: () => "2026-04-21"
  });

  await controller.commit(
    { currentDayKey: "2026-04-21", day: { date: "2026-04-21" } },
    { render: false, scheduleAnalytics: false }
  );
  saves.length = 0;

  await controller.ensureCurrentDay();
  assert.equal(saves.length, 0);
});

test("reminderController persiste lembrete devido e usa toast no foreground", async () => {
  const timerApi = createTimerApi();
  const commits = [];
  const toasts = [];
  const notifications = [];
  let currentState = {
    currentDayKey: "2026-04-21",
    day: { water: { total: 500 } }
  };

  const controller = createReminderController({
    windowObject: timerApi,
    documentObject: /** @type {any} */ ({ visibilityState: "visible" }),
    getState: () => currentState,
    commitState: async (nextState) => {
      commits.push(nextState);
      currentState = nextState;
    },
    addToast: (message) => {
      toasts.push(message);
    },
    onModeChange: () => {},
    getDueReminderImpl: () => 14,
    markReminderSentImpl: (state, hour) => ({
      ...state,
      reminderHour: hour,
      day: { water: { total: state.day.water.total } }
    }),
    getLegacyDaySnapshotImpl: (day) => /** @type {any} */ ({
      waterTotalMl: day.water.total,
      reminderSentHours: []
    }),
    buildWaterReminderBodyImpl: (total) => `body:${total}`,
    notificationPermissionStateImpl: () => "granted",
    notificationsSupportedImpl: () => true,
    registerBackgroundReminderSyncImpl: async () => ({
      supported: true,
      mode: "periodicSync"
    }),
    showServiceWorkerNotificationImpl: async (...args) => {
      notifications.push(args);
    }
  });

  await controller.configureNotifications();
  assert.equal(controller.getReminderMode(), "periodicSync");

  const dueHour = await controller.checkNow(new Date("2026-04-21T14:00:00Z"));
  assert.equal(dueHour, 14);
  assert.equal(commits.length, 1);
  assert.deepEqual(toasts, ["body:500"]);
  assert.equal(notifications.length, 0);
});

test("training-notes usa o caminho único de persistência com debounce e flush por change", async () => {
  const optionsCalls = [];
  const runtime = {
    getState: () => ({
      currentDayKey: "2026-04-21",
      day: { date: "2026-04-21" }
    }),
    persistState: async (_nextState, options) => {
      optionsCalls.push(options);
    }
  };
  const target = {
    dataset: {
      action: "training-notes"
    },
    value: "anotacao"
  };

  await handleInputAction(runtime, target);
  await handleChangeAction(runtime, target);

  assert.deepEqual(optionsCalls, [
    {
      render: false,
      debounceMs: 250,
      scheduleAnalytics: false
    },
    {
      render: false,
      scheduleAnalytics: false
    }
  ]);
});

test("createAppRuntime remove listeners do root e da window no destroy", () => {
  const originalWindow = /** @type {any} */ (globalThis.window);
  const originalDocument = /** @type {any} */ (globalThis.document);
  const rootListeners = new Map();
  const windowListeners = new Map();
  let nextTimerId = 1;

  const windowStub = /** @type {any} */ ({
    addEventListener(type, handler) {
      windowListeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (windowListeners.get(type) === handler) {
        windowListeners.delete(type);
      }
    },
    clearTimeout() {},
    clearInterval() {},
    setTimeout() {
      return nextTimerId++;
    },
    setInterval() {
      return nextTimerId++;
    },
    location: {
      href: "http://127.0.0.1:4173/"
    },
    history: {
      replaceState() {}
    }
  });
  const documentStub = /** @type {any} */ ({
    visibilityState: "visible"
  });

  const root = /** @type {any} */ ({
    addEventListener(type, handler) {
      rootListeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (rootListeners.get(type) === handler) {
        rootListeners.delete(type);
      }
    }
  });

  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: windowStub
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: documentStub
    });

    const runtime = createAppRuntime(root);
    runtime.attachGlobalListeners();

    assert.equal(rootListeners.size, 3);
    assert.equal(windowListeners.size, 3);

    runtime.destroy();

    assert.equal(rootListeners.size, 0);
    assert.equal(windowListeners.size, 0);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: originalWindow
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: originalDocument
    });
  }
});
