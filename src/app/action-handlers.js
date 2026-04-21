// @ts-check

import { nowTimeValue } from "../services/date-utils.js";
import {
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

const NOTE_PERSIST_DEBOUNCE_MS = 250;

const clickHandlers = {
  "toggle-section": async (runtime, actionElement) => {
    await runtime.persistState(toggleSection(runtime.getState(), actionElement.dataset.section));
  },
  "switch-view": async (runtime, actionElement) => {
    runtime.setActiveView(actionElement.dataset.view ?? "today");
  },
  "add-water": async (runtime, actionElement) => {
    const amount = Number(actionElement.dataset.amount ?? 0);
    await runtime.persistState(addWater(runtime.getState(), amount));
  },
  "add-water-manual": async (runtime) => {
    const input = runtime.root.querySelector("#manual-water-amount");
    const amount = Number(input?.value ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      runtime.addToast("Digite uma quantidade válida em ml.", "warning");
      return;
    }

    await runtime.persistState(addWater(runtime.getState(), amount));
    if (input) {
      input.value = "";
    }
  },
  "undo-water": async (runtime) => {
    await runtime.persistState(undoLastWater(runtime.getState()));
  },
  "set-time-now": async (runtime, actionElement) => {
    const field = actionElement.dataset.field;
    await runtime.persistState(updateSleepTime(runtime.getState(), field, nowTimeValue()));
  },
  "request-notifications": async (runtime) => {
    const permission = await requestNotificationPermission();
    if (permission === "granted") {
      runtime.addToast("Lembretes de água ativados.");
      await runtime.configureNotifications();
    } else if (permission === "denied") {
      runtime.addToast("Notificações bloqueadas no navegador.", "warning");
    }
    runtime.render();
  },
  "dismiss-reminder-prompt": async (runtime) => {
    await runtime.persistState(dismissReminderPrompt(runtime.getState()));
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
    const result = updateHabit(runtime.getState(), target.dataset.id, target.checked);
    if (result.blockedReason === "weekly-run-skip-limit") {
      runtime.addToast("Você só pode pular corrida 2x por semana.", "warning");
      runtime.render();
      return;
    }

    await runtime.persistState(result.state);
  },
  "time-input": async (runtime, target) => {
    await runtime.persistState(updateSleepTime(runtime.getState(), target.dataset.field, target.value));
  },
  "meal-time-input": async (runtime, target) => {
    await runtime.persistState(updateMealTime(runtime.getState(), target.dataset.meal, target.value));
  },
  "training-notes": async (runtime, target) => {
    await runtime.persistState(updateTrainingNotes(runtime.getState(), target.value), {
      render: false,
      scheduleAnalytics: false
    });
  }
};

const inputHandlers = {
  "training-notes": async (runtime, target) => {
    await runtime.persistState(updateTrainingNotes(runtime.getState(), target.value), {
      render: false,
      debounceMs: NOTE_PERSIST_DEBOUNCE_MS,
      scheduleAnalytics: false
    });
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
