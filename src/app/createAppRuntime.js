// @ts-check

import { notificationsSupported } from "../services/notifications.js";
import { startDailyResetWatcher } from "../services/reset-scheduler.js";
import { handleChangeAction, handleClickAction, handleInputAction } from "./action-handlers.js";
import { createReminderController } from "./createReminderController.js";
import { renderAppShell } from "./renderAppShell.js";
import { createStateController } from "./createStateController.js";
import { createToastController } from "./createToastController.js";
import { createViewController } from "./createViewController.js";

/**
 * Monta o runtime principal a partir de controladores menores.
 */
export function createAppRuntime(rootElement) {
  if (!rootElement) {
    throw new Error("App root element not found.");
  }

  const runtime = {
    root: rootElement,
    beforeInstallEvent: null,
    reminderMode: "foreground-only",
    isRendering: false,
    isMounted: false,
    listenersAttached: false,
    mountPromise: null,
    stopResetWatcher: null,
    handleRootClick: null,
    handleRootChange: null,
    handleRootInput: null
  };

  const viewController = createViewController();
  const toastController = createToastController({
    onChange: () => {
      runtime.render();
    }
  });
  const stateController = createStateController({
    onStateChange: () => {
      runtime.render();
    }
  });
  const reminderController = createReminderController({
    getState: () => stateController.getState(),
    commitState: (nextState, options) => stateController.commit(nextState, options),
    addToast: (message, tone, duration) => toastController.addToast(message, tone, duration),
    onModeChange: (mode) => {
      runtime.reminderMode = mode;
      runtime.render();
    }
  });

  runtime.getState = () => stateController.getState();
  runtime.getActiveView = () => viewController.getActiveView();
  runtime.getToasts = () => toastController.getToasts();

  runtime.setActiveView = (view, { syncUrl = true, render = true } = {}) => {
    viewController.setActiveView(view, { syncUrl });
    if (render) {
      runtime.render();
    }
  };

  runtime.persistState = async (nextState, options) => stateController.commit(nextState, options);
  runtime.flushPendingState = async () => stateController.flushPendingPersist();
  runtime.ensureCurrentDay = async () => stateController.ensureCurrentDay();
  runtime.addToast = (message, tone = "info", duration = 3200) => toastController.addToast(message, tone, duration);
  runtime.dismissToast = (id) => toastController.dismissToast(id);

  runtime.handleBeforeInstallPrompt = (event) => {
    event.preventDefault();
    runtime.beforeInstallEvent = event;
    runtime.render();
  };

  runtime.handlePopState = () => {
    viewController.syncFromUrl();
    runtime.render();
  };

  runtime.handlePageHide = () => {
    void runtime.flushPendingState();
  };

  function detachGlobalListeners() {
    if (!runtime.listenersAttached) {
      return;
    }

    window.removeEventListener("beforeinstallprompt", runtime.handleBeforeInstallPrompt);
    window.removeEventListener("popstate", runtime.handlePopState);
    window.removeEventListener("pagehide", runtime.handlePageHide);

    if (runtime.handleRootClick) {
      runtime.root.removeEventListener("click", runtime.handleRootClick);
      runtime.handleRootClick = null;
    }
    if (runtime.handleRootChange) {
      runtime.root.removeEventListener("change", runtime.handleRootChange);
      runtime.handleRootChange = null;
    }
    if (runtime.handleRootInput) {
      runtime.root.removeEventListener("input", runtime.handleRootInput);
      runtime.handleRootInput = null;
    }

    runtime.listenersAttached = false;
  }

  runtime.attachGlobalListeners = () => {
    if (runtime.listenersAttached) {
      return;
    }

    runtime.handleRootClick = (event) => {
      const actionElement = event.target instanceof Element
        ? event.target.closest("[data-action]")
        : null;
      if (!actionElement) {
        return;
      }

      void handleClickAction(runtime, actionElement);
    };

    runtime.handleRootChange = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.dataset.action) {
        return;
      }

      void handleChangeAction(runtime, target);
    };

    runtime.handleRootInput = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.dataset.action) {
        return;
      }

      void handleInputAction(runtime, target);
    };

    const { handleRootClick, handleRootChange, handleRootInput } = runtime;
    runtime.root.addEventListener("click", handleRootClick);
    runtime.root.addEventListener("change", handleRootChange);
    runtime.root.addEventListener("input", handleRootInput);

    window.addEventListener("beforeinstallprompt", runtime.handleBeforeInstallPrompt);
    window.addEventListener("popstate", runtime.handlePopState);
    window.addEventListener("pagehide", runtime.handlePageHide);
    runtime.listenersAttached = true;
  };

  runtime.render = () => {
    const state = stateController.getState();
    if (!state || runtime.isRendering) {
      return;
    }

    runtime.isRendering = true;
    runtime.root.innerHTML = renderAppShell({
      state,
      activeView: viewController.getActiveView(),
      beforeInstallEvent: runtime.beforeInstallEvent,
      toasts: toastController.getToasts(),
      reminderMode: runtime.reminderMode
    });
    runtime.isRendering = false;
  };

  runtime.configureNotifications = async () => {
    if (!notificationsSupported()) {
      return;
    }

    await reminderController.configureNotifications();
  };

  runtime.mount = async () => {
    if (runtime.isMounted) {
      return;
    }

    if (runtime.mountPromise) {
      return runtime.mountPromise;
    }

    runtime.mountPromise = (async () => {
      try {
        viewController.setActiveView(viewController.getInitialView(), { syncUrl: false });
        runtime.attachGlobalListeners();
        await stateController.bootstrap();

        if (runtime.stopResetWatcher) {
          runtime.stopResetWatcher();
        }
        runtime.stopResetWatcher = startDailyResetWatcher(() => {
          void runtime.ensureCurrentDay();
        });
        void runtime.configureNotifications();
        reminderController.start();
        runtime.isMounted = true;
      } catch (error) {
        reminderController.destroy();
        if (runtime.stopResetWatcher) {
          runtime.stopResetWatcher();
          runtime.stopResetWatcher = null;
        }
        detachGlobalListeners();
        throw error;
      } finally {
        runtime.mountPromise = null;
      }
    })();

    return runtime.mountPromise;
  };

  runtime.destroy = () => {
    runtime.isMounted = false;
    runtime.mountPromise = null;
    void runtime.flushPendingState();
    reminderController.destroy();
    stateController.destroy();
    toastController.destroy();

    if (runtime.stopResetWatcher) {
      runtime.stopResetWatcher();
      runtime.stopResetWatcher = null;
    }

    detachGlobalListeners();
  };

  return runtime;
}
