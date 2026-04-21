import { createAppRuntime } from "./app/createAppRuntime.js";

export class HabitApp {
  constructor(rootElement) {
    this.runtime = createAppRuntime(rootElement);
  }

  async mount() {
    await this.runtime.mount();
  }

  destroy() {
    this.runtime.destroy();
  }
}
