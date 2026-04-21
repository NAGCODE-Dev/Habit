import { nowTimeValue } from "../services/date-utils.js";
import {
  registerBackgroundReminderSync,
  requestNotificationPermission
} from "../services/notifications.js";
import {
  addWater,
  dismissReminderPrompt,
  toggleSection,
  undoLastWater,
  updateHabit,
  updateMealTime,
  updateSleepTime,
  updateTrainingNotes
} from "../services/dayService.js";
import { saveState } from "../services/storageService.js";

const clickHandlers = {
  "toggle-section": async (runtime, actionElement) => {
    await runtime.persistState(toggleSection(runtime.state, actionElement.dataset.section));
  },
  "switch-view": async (runtime, actionElement) => {
    runtime.activeView = actionElement.dataset.view ?? "today";
    runtime.syncViewToUrl();
    runtime.render();
  },
  "add-water": async (runtime, actionElement) => {
    const amount = Number(actionElement.dataset.amount ?? 0);
    await runtime.persistState(addWater(runtime.state, amount));
  },
  "add-water-manual": async (runtime) => {
    const input = runtime.root.querySelector("#manual-water-amount");
    const amount = Number(input?.value ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      runtime.addToast("Digite uma quantidade válida em ml.", "warning");
      return;
    }

    await runtime.persistState(addWater(runtime.state, amount));
    if (input) {
      input.value = "";
    }
  },
  "undo-water": async (runtime) => {
    await runtime.persistState(undoLastWater(runtime.state));
  },
  "set-time-now": async (runtime, actionElement) => {
    const field = actionElement.dataset.field;
    await runtime.persistState(updateSleepTime(runtime.state, field, nowTimeValue()));
  },
  "request-notifications": async (runtime) => {
    const permission = await requestNotificationPermission();
    if (permission === "granted") {
      runtime.addToast("Lembretes de água ativados.");
      const result = await registerBackgroundReminderSync();
      runtime.reminderMode = result.mode;
    } else if (permission === "denied") {
      runtime.addToast("Notificações bloqueadas no navegador.", "warning");
    }
    runtime.render();
  },
  "dismiss-reminder-prompt": async (runtime) => {
    await runtime.persistState(dismissReminderPrompt(runtime.state));
  },
  "dismiss-toast": async (runtime, actionElement) => {
    runtime.dismissToast(actionElement.dataset.toastId);
  },
  "install-app": async (runtime) => {
    if (!runtime.beforeInstallEvent) {
      return;
    }

    await runtime.beforeInstallEvent.prompt();
    runtime.beforeInstallEvent = null;
    runtime.render();
  }
};

const changeHandlers = {
  "toggle-checkbox": async (runtime, target) => {
    const result = updateHabit(runtime.state, target.dataset.id, target.checked);
    if (result.blockedReason === "weekly-run-skip-limit") {
      runtime.addToast("Você só pode pular corrida 2x por semana.", "warning");
      runtime.render();
      return;
    }

    await runtime.persistState(result.state);
  },
  "time-input": async (runtime, target) => {
    await runtime.persistState(updateSleepTime(runtime.state, target.dataset.field, target.value));
  },
  "meal-time-input": async (runtime, target) => {
    await runtime.persistState(updateMealTime(runtime.state, target.dataset.meal, target.value));
  }
};

const inputHandlers = {
  "training-notes": async (runtime, target) => {
    runtime.state = updateTrainingNotes(runtime.state, target.value);
    await saveState(runtime.state);
  }
};

export async function handleClickAction(runtime, actionElement) {
  const action = actionElement.dataset.action;
  const handler = clickHandlers[action];
  if (!handler) {
    return;
  }

  await handler(runtime, actionElement);
}

export async function handleChangeAction(runtime, target) {
  const action = target.dataset.action;
  const handler = changeHandlers[action];
  if (!handler) {
    return;
  }

  await handler(runtime, target);
}

export async function handleInputAction(runtime, target) {
  const action = target.dataset.action;
  const handler = inputHandlers[action];
  if (!handler) {
    return;
  }

  await handler(runtime, target);
}
