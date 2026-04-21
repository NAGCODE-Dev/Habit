import { logOperationalError } from "../services/logger.js";
import { createAppRuntime } from "./createAppRuntime.js";

export async function registerServiceWorker() {
  if (window.__DISABLE_SERVICE_WORKER__ === true || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    return registration;
  } catch (error) {
    logOperationalError("service-worker/register", error);
    return null;
  }
}

export async function bootstrap() {
  const root = document.querySelector("#app");
  const app = createAppRuntime(root);
  await app.mount();
  void registerServiceWorker();
  return app;
}
