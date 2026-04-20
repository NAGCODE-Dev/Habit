import { HabitApp } from "./App.js";

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  } catch (error) {
    console.error("Service worker registration failed", error);
  }
}

async function bootstrap() {
  const root = document.querySelector("#app");
  const app = new HabitApp(root);
  await app.mount();
  void registerServiceWorker();
}

void bootstrap();
