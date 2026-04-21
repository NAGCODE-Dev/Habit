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
    stopResetWatcher: null
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

  runtime.attachGlobalListeners = () => {
    runtime.root.addEventListener("click", (event) => {
      const actionElement = event.target?.closest?.("[data-action]");
      if (!actionElement) {
        return;
      }

      void handleClickAction(runtime, actionElement);
    });

    runtime.root.addEventListener("change", (event) => {
      const target = event.target;
      if (!target?.dataset?.action) {
        return;
      }

      void handleChangeAction(runtime, target);
    });

    runtime.root.addEventListener("input", (event) => {
      const target = event.target;
      if (!target?.dataset?.action) {
        return;
      }

      void handleInputAction(runtime, target);
    });

    window.addEventListener("beforeinstallprompt", runtime.handleBeforeInstallPrompt);
    window.addEventListener("popstate", runtime.handlePopState);
    window.addEventListener("pagehide", runtime.handlePageHide);
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
    viewController.setActiveView(viewController.getInitialView(), { syncUrl: false });
    runtime.attachGlobalListeners();
    await stateController.bootstrap();

    runtime.stopResetWatcher = startDailyResetWatcher(() => {
      void runtime.ensureCurrentDay();
    });
    void runtime.configureNotifications();
    reminderController.start();
  };

  runtime.destroy = () => {
    void runtime.flushPendingState();
    reminderController.destroy();
    stateController.destroy();
    toastController.destroy();

    if (runtime.stopResetWatcher) {
      runtime.stopResetWatcher();
      runtime.stopResetWatcher = null;
    }

    window.removeEventListener("beforeinstallprompt", runtime.handleBeforeInstallPrompt);
    window.removeEventListener("popstate", runtime.handlePopState);
    window.removeEventListener("pagehide", runtime.handlePageHide);
  };

  return runtime;
}
