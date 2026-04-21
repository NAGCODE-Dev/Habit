// @ts-check

import { logOperationalError } from "../services/logger.js";
import { createAppRuntime } from "./createAppRuntime.js";

async function waitForBootstrapBlocker() {
  const blocker = window["__APP_BOOTSTRAP_BLOCKER__"];
  if (!blocker) {
    return;
  }

  await blocker;
  window["__APP_BOOTSTRAP_BLOCKER__"] = null;
}

export async function registerServiceWorker() {
  if (window["__DISABLE_SERVICE_WORKER__"] === true || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    return registration;
  } catch (error) {
    logOperationalError("service-worker/register", error, {
      context: {
        script: "./sw.js"
      }
    });
    return null;
  }
}

export async function bootstrap() {
  await waitForBootstrapBlocker();
  const root = document.querySelector("#app");
  const app = createAppRuntime(root);
  await app.mount();
  void registerServiceWorker();
  return app;
}
