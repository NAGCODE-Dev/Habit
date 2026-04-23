import test from "node:test";
import assert from "node:assert/strict";
import FDBFactory from "fake-indexeddb/lib/FDBFactory";
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

test("stateController ignora efeitos tardios quando destroy ocorre durante bootstrap", async () => {
  const timerApi = createTimerApi();
  const renders = [];
  const saves = [];
  /** @type {null | ((value: any) => void)} */
  let resolveLoadState = null;

  const controller = createStateController({
    windowObject: timerApi,
    onStateChange: (state) => {
      renders.push(state);
    },
    loadStateImpl: async () => new Promise((resolve) => {
      resolveLoadState = resolve;
    }),
    saveStateImpl: async (state) => {
      saves.push(state);
    },
    normalizeAppStateImpl: (state) => state ?? {
      currentDayKey: "2026-04-21",
      day: { date: "2026-04-21" }
    },
    refreshAnalyticsCacheImpl: () => {
      throw new Error("analytics refresh should not run after destroy");
    },
    getTodayKey: () => "2026-04-21"
  });

  const bootstrapPromise = controller.bootstrap();
  assert.equal(renders.length, 1);

  controller.destroy();
  assert.ok(resolveLoadState);
  resolveLoadState(null);
  await bootstrapPromise;

  assert.equal(renders.length, 1);
  assert.equal(saves.length, 0);
  assert.equal(timerApi.countTimeouts(), 0);
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
      assert.deepEqual(toasts, ["body:500"]);
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

test("reminderController não consome reminder quando não há canal de entrega", async () => {
  const timerApi = createTimerApi();
  const commits = [];
  const toasts = [];
  const notifications = [];
  const controller = createReminderController({
    windowObject: timerApi,
    documentObject: /** @type {any} */ ({ visibilityState: "hidden" }),
    getState: () => ({
      currentDayKey: "2026-04-21",
      day: { water: { total: 500 } }
    }),
    commitState: async (nextState) => {
      commits.push(nextState);
    },
    addToast: (message) => {
      toasts.push(message);
    },
    onModeChange: () => {},
    getDueReminderImpl: () => 14,
    markReminderSentImpl: (state, hour) => ({
      ...state,
      reminderHour: hour
    }),
    getLegacyDaySnapshotImpl: (day) => /** @type {any} */ ({
      waterTotalMl: day.water.total,
      reminderSentHours: []
    }),
    buildWaterReminderBodyImpl: (total) => `body:${total}`,
    notificationPermissionStateImpl: () => "default",
    notificationsSupportedImpl: () => true,
    registerBackgroundReminderSyncImpl: async () => ({
      supported: true,
      mode: "periodicSync"
    }),
    showServiceWorkerNotificationImpl: async (...args) => {
      notifications.push(args);
    }
  });

  const dueHour = await controller.checkNow(new Date("2026-04-21T14:00:00Z"));
  assert.equal(dueHour, null);
  assert.equal(commits.length, 0);
  assert.equal(toasts.length, 0);
  assert.equal(notifications.length, 0);
});

test("reminderController não consome reminder quando o service worker não confirma entrega", async () => {
  const timerApi = createTimerApi();
  const commits = [];
  const notifications = [];
  const controller = createReminderController({
    windowObject: timerApi,
    documentObject: /** @type {any} */ ({ visibilityState: "hidden" }),
    getState: () => ({
      currentDayKey: "2026-04-21",
      day: { water: { total: 500 } }
    }),
    commitState: async (nextState) => {
      commits.push(nextState);
    },
    addToast: () => {
      throw new Error("toast não deveria ser usado em background");
    },
    onModeChange: () => {},
    getDueReminderImpl: () => 14,
    markReminderSentImpl: (state, hour) => ({
      ...state,
      reminderHour: hour
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
      return false;
    }
  });

  const dueHour = await controller.checkNow(new Date("2026-04-21T14:00:00Z"));
  assert.equal(dueHour, null);
  assert.equal(commits.length, 0);
  assert.equal(notifications.length, 1);
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

test("createAppRuntime não ressuscita side effects após destroy durante mount pendente", async () => {
  const originalWindow = /** @type {any} */ (globalThis.window);
  const originalDocument = /** @type {any} */ (globalThis.document);
  const rootAdds = new Map();
  const rootRemoves = new Map();
  const windowAdds = new Map();
  const windowRemoves = new Map();
  /** @type {null | ((value?: any) => void)} */
  let resolveBootstrap = null;
  let stateDestroys = 0;
  let reminderStarts = 0;
  let reminderDestroys = 0;
  let configureCalls = 0;
  let watcherStarts = 0;
  let watcherStops = 0;
  let toastDestroys = 0;

  const count = (bucket, type) => {
    bucket.set(type, (bucket.get(type) ?? 0) + 1);
  };

  const windowStub = /** @type {any} */ ({
    addEventListener(type) {
      count(windowAdds, type);
    },
    removeEventListener(type) {
      count(windowRemoves, type);
    },
    clearTimeout() {},
    clearInterval() {},
    setTimeout() {
      return 1;
    },
    setInterval() {
      return 2;
    },
    location: {
      href: "http://127.0.0.1:4173/"
    },
    history: {
      replaceState() {}
    }
  });
  const documentStub = /** @type {any} */ ({
    hidden: false,
    visibilityState: "visible"
  });
  const root = /** @type {any} */ ({
    innerHTML: "",
    addEventListener(type) {
      count(rootAdds, type);
    },
    removeEventListener(type) {
      count(rootRemoves, type);
    }
  });

  const stateControllerStub = {
    getState() {
      return {
        currentDayKey: "2026-04-21",
        day: { date: "2026-04-21" }
      };
    },
    async bootstrap() {
      return new Promise((resolve) => {
        resolveBootstrap = resolve;
      });
    },
    async commit(nextState) {
      return nextState;
    },
    async flushPendingPersist() {},
    async ensureCurrentDay() {
      return this.getState();
    },
    destroy() {
      stateDestroys += 1;
    }
  };

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

    const runtime = createAppRuntime(root, {
      createViewControllerImpl: () => ({
        getInitialView() {
          return "today";
        },
        getActiveView() {
          return "today";
        },
        setActiveView() {
          return "today";
        },
        syncFromUrl() {
          return "today";
        }
      }),
      createToastControllerImpl: () => ({
        getToasts() {
          return [];
        },
        addToast() {
          return "toast-id";
        },
        dismissToast() {},
        destroy() {
          toastDestroys += 1;
        }
      }),
      createStateControllerImpl: () => stateControllerStub,
      createReminderControllerImpl: () => ({
        getReminderMode() {
          return "foreground-only";
        },
        async configureNotifications() {
          configureCalls += 1;
          return "periodicSync";
        },
        start() {
          reminderStarts += 1;
        },
        stop() {},
        async checkNow() {
          return null;
        },
        destroy() {
          reminderDestroys += 1;
        }
      }),
      notificationsSupportedImpl: () => true,
      startDailyResetWatcherImpl: () => {
        watcherStarts += 1;
        return () => {
          watcherStops += 1;
        };
      }
    });

    const mountPromise = runtime.mount();
    runtime.destroy();
    assert.ok(resolveBootstrap);
    resolveBootstrap();
    await mountPromise;

    assert.equal(rootAdds.get("click"), 1);
    assert.equal(rootAdds.get("change"), 1);
    assert.equal(rootAdds.get("input"), 1);
    assert.equal(rootRemoves.get("click"), 1);
    assert.equal(rootRemoves.get("change"), 1);
    assert.equal(rootRemoves.get("input"), 1);
    assert.equal(windowAdds.get("beforeinstallprompt"), 1);
    assert.equal(windowAdds.get("popstate"), 1);
    assert.equal(windowAdds.get("pagehide"), 1);
    assert.equal(windowRemoves.get("beforeinstallprompt"), 1);
    assert.equal(windowRemoves.get("popstate"), 1);
    assert.equal(windowRemoves.get("pagehide"), 1);
    assert.equal(stateDestroys, 1);
    assert.equal(reminderDestroys, 1);
    assert.equal(toastDestroys, 1);
    assert.equal(watcherStarts, 0);
    assert.equal(watcherStops, 0);
    assert.equal(reminderStarts, 0);
    assert.equal(configureCalls, 0);
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

test("createAppRuntime ignora mount duplicado e não duplica listeners globais", async () => {
  const originalWindow = /** @type {any} */ (globalThis.window);
  const originalDocument = /** @type {any} */ (globalThis.document);
  const originalIndexedDB = /** @type {any} */ (globalThis.indexedDB);
  const rootAdds = new Map();
  const rootRemoves = new Map();
  const windowAdds = new Map();
  const windowRemoves = new Map();
  const documentAdds = new Map();
  const documentRemoves = new Map();
  let nextTimerId = 1;

  const count = (bucket, type) => {
    bucket.set(type, (bucket.get(type) ?? 0) + 1);
  };

  const windowStub = /** @type {any} */ ({
    addEventListener(type) {
      count(windowAdds, type);
    },
    removeEventListener(type) {
      count(windowRemoves, type);
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
    hidden: false,
    visibilityState: "visible",
    addEventListener(type) {
      count(documentAdds, type);
    },
    removeEventListener(type) {
      count(documentRemoves, type);
    }
  });
  const root = /** @type {any} */ ({
    innerHTML: "",
    addEventListener(type) {
      count(rootAdds, type);
    },
    removeEventListener(type) {
      count(rootRemoves, type);
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
    globalThis.indexedDB = new FDBFactory();

    const runtime = createAppRuntime(root);
    await runtime.mount();
    await runtime.mount();

    assert.equal(rootAdds.get("click"), 1);
    assert.equal(rootAdds.get("change"), 1);
    assert.equal(rootAdds.get("input"), 1);
    assert.equal(windowAdds.get("beforeinstallprompt"), 1);
    assert.equal(windowAdds.get("popstate"), 1);
    assert.equal(windowAdds.get("pagehide"), 1);
    assert.equal(windowAdds.get("focus"), 1);
    assert.equal(documentAdds.get("visibilitychange"), 1);

    runtime.destroy();

    assert.equal(rootRemoves.get("click"), 1);
    assert.equal(rootRemoves.get("change"), 1);
    assert.equal(rootRemoves.get("input"), 1);
    assert.equal(windowRemoves.get("beforeinstallprompt"), 1);
    assert.equal(windowRemoves.get("popstate"), 1);
    assert.equal(windowRemoves.get("pagehide"), 1);
    assert.equal(windowRemoves.get("focus"), 1);
    assert.equal(documentRemoves.get("visibilitychange"), 1);
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
    if (typeof originalIndexedDB === "undefined") {
      delete globalThis.indexedDB;
    } else {
      globalThis.indexedDB = originalIndexedDB;
    }
  }
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
