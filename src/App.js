import { renderCheckboxField } from "./components/CheckboxField.js";
import { renderAnalyticsDashboard } from "./components/AnalyticsDashboard.js";
import { renderHistoryView } from "./components/HistoryView.js";
import { renderProgressHeader } from "./components/ProgressHeader.js";
import { renderSectionCard } from "./components/SectionCard.js";
import { renderTimeField } from "./components/TimeField.js";
import { renderToastStack } from "./components/ToastStack.js";
import { renderWaterTracker } from "./components/WaterTracker.js";
import {
  MEAL_FIELDS,
  SECTION_TITLES,
  WATER_GOAL_ML
} from "./services/constants.js";
import {
  diffNotice,
  formatDisplayDate,
  nowTimeValue
} from "./services/date-utils.js";
import { escapeHtml, formatMl } from "./services/dom-utils.js";
import {
  buildWaterReminderBody,
  getDueReminder,
  notificationPermissionState,
  notificationsSupported,
  registerBackgroundReminderSync,
  reminderScheduleText,
  reminderSupportMessage,
  requestNotificationPermission,
  showServiceWorkerNotification
} from "./services/notifications.js";
import {
  addWater,
  dismissReminderPrompt,
  getLegacyDaySnapshot,
  markReminderSent,
  normalizeAppState,
  toggleSection,
  undoLastWater,
  updateHabit,
  updateMealTime,
  updateSleepTime,
  updateTrainingNotes
} from "./services/dayService.js";
import { computeProgress, summarizeDay } from "./services/historyService.js";
import { getDashboardAnalytics, refreshAnalyticsCache } from "./services/analyticsService.js";
import { loadState, saveState } from "./services/storageService.js";

function mealRow(meal, checked, timeValue) {
  return `
    <div class="compound-row">
      ${renderCheckboxField({
        id: meal.id,
        label: meal.label,
        checked,
        hint: meal.range
      })}
      <div class="inline-time-row">
        <span class="mini-label">Horário real</span>
        <input
          class="time-input compact"
          type="time"
          data-action="meal-time-input"
          data-meal="${meal.id}"
          value="${escapeHtml(timeValue || "")}"
        />
      </div>
    </div>
  `;
}

export class HabitApp {
  constructor(rootElement) {
    this.root = rootElement;
    this.state = null;
    this.activeView = "today";
    this.toasts = [];
    this.toastTimers = new Map();
    this.beforeInstallEvent = null;
    this.reminderMode = "foreground-only";
    this.reminderInterval = 0;
    this.isRendering = false;
    this.analyticsTimer = 0;
  }

  getInitialView() {
    const currentUrl = new URL(window.location.href);
    return currentUrl.searchParams.get("view") === "history" ? "history" : "today";
  }

  syncViewToUrl() {
    const currentUrl = new URL(window.location.href);
    if (this.activeView === "history") {
      currentUrl.searchParams.set("view", "history");
    } else {
      currentUrl.searchParams.delete("view");
    }

    window.history.replaceState({}, "", currentUrl);
  }

  async mount() {
    this.activeView = this.getInitialView();
    this.state = normalizeAppState(null);
    this.attachGlobalListeners();
    this.render();

    const storedState = await loadState();
    this.state = normalizeAppState(storedState ?? this.state);
    void saveState(this.state);
    this.render();
    this.scheduleAnalyticsRefresh();

    void this.configureNotifications();
    this.startReminderPolling();
    window.addEventListener("beforeinstallprompt", this.handleBeforeInstallPrompt);
  }

  destroy() {
    window.clearInterval(this.reminderInterval);
    window.clearTimeout(this.analyticsTimer);
    window.removeEventListener("beforeinstallprompt", this.handleBeforeInstallPrompt);
  }

  attachGlobalListeners() {
    this.root.addEventListener("click", (event) => {
      void this.handleClick(event);
    });
    this.root.addEventListener("change", (event) => {
      void this.handleChange(event);
    });
    this.root.addEventListener("input", (event) => {
      void this.handleInput(event);
    });
  }

  handleBeforeInstallPrompt = (event) => {
    event.preventDefault();
    this.beforeInstallEvent = event;
    this.render();
  };

  async configureNotifications() {
    if (!notificationsSupported()) {
      return;
    }

    const result = await registerBackgroundReminderSync();
    this.reminderMode = result.mode;
    this.render();
  }

  async ensureCurrentDay() {
    const nextState = normalizeAppState(this.state);
    if (JSON.stringify(nextState) === JSON.stringify(this.state)) {
      return;
    }

    this.state = nextState;
    await saveState(this.state);
    this.render();
  }

  async persistState(nextState, { render = true } = {}) {
    this.state = normalizeAppState(nextState);
    await saveState(this.state);
    if (render) {
      this.render();
    }
    this.scheduleAnalyticsRefresh();
  }

  scheduleAnalyticsRefresh() {
    window.clearTimeout(this.analyticsTimer);
    this.analyticsTimer = window.setTimeout(async () => {
      const nextState = refreshAnalyticsCache(this.state);
      if (nextState === this.state) {
        return;
      }

      this.state = nextState;
      await saveState(this.state);
      this.render();
    }, 0);
  }

  addToast(message, tone = "info", duration = 3200) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    this.toasts = [...this.toasts, { id, message, tone }];
    this.render();

    const timer = window.setTimeout(() => {
      this.dismissToast(id);
    }, duration);
    this.toastTimers.set(id, timer);
  }

  dismissToast(id) {
    const timer = this.toastTimers.get(id);
    if (timer) {
      window.clearTimeout(timer);
      this.toastTimers.delete(id);
    }

    this.toasts = this.toasts.filter((toast) => toast.id !== id);
    this.render();
  }

  startReminderPolling() {
    window.clearInterval(this.reminderInterval);

    const runCheck = async () => {
      await this.ensureCurrentDay();
      const dayView = getLegacyDaySnapshot(this.state.day);
      const dueHour = getDueReminder(dayView, new Date());
      if (dueHour === null) {
        return;
      }

      const nextState = markReminderSent(this.state, dueHour);
      await this.persistState(nextState, { render: true });

      const title = `Água ${String(dueHour).padStart(2, "0")}:00`;
      const body = buildWaterReminderBody(this.state.day.water.total);

      if (document.visibilityState === "visible") {
        this.addToast(body);
      } else if (notificationPermissionState() === "granted") {
        await showServiceWorkerNotification(
          title,
          body,
          `water-${this.state.currentDayKey}-${dueHour}`
        );
      }
    };

    void runCheck();
    this.reminderInterval = window.setInterval(() => {
      void runCheck();
    }, 60 * 1000);
  }

  async handleClick(event) {
    const actionElement = event.target.closest("[data-action]");
    if (!actionElement) {
      return;
    }

    const action = actionElement.dataset.action;
    if (action === "toggle-section") {
      await this.persistState(toggleSection(this.state, actionElement.dataset.section));
      return;
    }

    if (action === "switch-view") {
      this.activeView = actionElement.dataset.view ?? "today";
      this.syncViewToUrl();
      this.render();
      return;
    }

    if (action === "add-water") {
      const amount = Number(actionElement.dataset.amount ?? 0);
      await this.persistState(addWater(this.state, amount));
      return;
    }

    if (action === "add-water-manual") {
      const input = this.root.querySelector("#manual-water-amount");
      const amount = Number(input?.value ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        this.addToast("Digite uma quantidade válida em ml.", "warning");
        return;
      }

      await this.persistState(addWater(this.state, amount));
      if (input) {
        input.value = "";
      }
      return;
    }

    if (action === "undo-water") {
      await this.persistState(undoLastWater(this.state));
      return;
    }

    if (action === "set-time-now") {
      const field = actionElement.dataset.field;
      await this.persistState(updateSleepTime(this.state, field, nowTimeValue()));
      return;
    }

    if (action === "request-notifications") {
      const permission = await requestNotificationPermission();
      if (permission === "granted") {
        this.addToast("Lembretes de água ativados.");
        const result = await registerBackgroundReminderSync();
        this.reminderMode = result.mode;
      } else if (permission === "denied") {
        this.addToast("Notificações bloqueadas no navegador.", "warning");
      }
      this.render();
      return;
    }

    if (action === "dismiss-reminder-prompt") {
      await this.persistState(dismissReminderPrompt(this.state));
      return;
    }

    if (action === "dismiss-toast") {
      this.dismissToast(actionElement.dataset.toastId);
      return;
    }

    if (action === "install-app" && this.beforeInstallEvent) {
      await this.beforeInstallEvent.prompt();
      this.beforeInstallEvent = null;
      this.render();
    }
  }

  async handleChange(event) {
    const target = event.target;

    if (target.matches('[data-action="toggle-checkbox"]')) {
      const result = updateHabit(this.state, target.dataset.id, target.checked);
      if (result.blockedReason === "weekly-run-skip-limit") {
        this.addToast("Você só pode pular corrida 2x por semana.", "warning");
        this.render();
        return;
      }
      await this.persistState(result.state);
      return;
    }

    if (target.matches('[data-action="time-input"]')) {
      await this.persistState(updateSleepTime(this.state, target.dataset.field, target.value));
      return;
    }

    if (target.matches('[data-action="meal-time-input"]')) {
      await this.persistState(updateMealTime(this.state, target.dataset.meal, target.value));
    }
  }

  async handleInput(event) {
    const target = event.target;
    if (!target.matches('[data-action="training-notes"]')) {
      return;
    }

    this.state = updateTrainingNotes(this.state, target.value);
    await saveState(this.state);
  }

  renderReminderBanner() {
    if (!notificationsSupported()) {
      return `
        <section class="notice-card">
          <p class="notice-title">Lembretes de água</p>
          <p class="support-copy">Este navegador não oferece Notification API. O controle fino de água continua funcionando normalmente.</p>
        </section>
      `;
    }

    const permission = notificationPermissionState();
    const promptDismissed = this.state.preferences.reminderPromptDismissed;

    if (permission === "granted") {
      return `
        <section class="notice-card success">
          <div>
            <p class="notice-title">Lembretes de água</p>
            <p class="support-copy">${escapeHtml(reminderSupportMessage(this.reminderMode))}</p>
            <p class="tiny-copy">Horários: ${escapeHtml(reminderScheduleText())}</p>
          </div>
        </section>
      `;
    }

    if (promptDismissed) {
      return "";
    }

    return `
      <section class="notice-card">
        <div>
          <p class="notice-title">Lembretes de água</p>
          <p class="support-copy">Avisos às 8h, 10h, 12h, 14h, 16h, 18h e 20h. Se o navegador deixar, eles também rodam pelo service worker.</p>
        </div>
        <div class="notice-actions">
          <button type="button" class="action-button accent" data-action="request-notifications">Permitir</button>
          <button type="button" class="ghost-button" data-action="dismiss-reminder-prompt">Agora não</button>
        </div>
      </section>
    `;
  }

  renderMorningSection() {
    const day = getLegacyDaySnapshot(this.state.day);
    const open = this.state.sectionsOpen.morning;
    const sleepNotice = diffNotice(day.sleepActual, "22:30");
    const wakeNotice = diffNotice(day.wakeActual, "06:30");

    return renderSectionCard({
      id: "morning",
      title: SECTION_TITLES.morning.title,
      subtitle: SECTION_TITLES.morning.subtitle,
      open,
      content: `
        <div class="section-group">
          <h3>Sono</h3>
          ${renderCheckboxField({
            id: "sleepOnTime",
            label: "Dormi no horário (22h30)",
            checked: day.checkboxes.sleepOnTime
          })}
          ${renderTimeField({
            field: "sleepActual",
            label: "Horário real de dormir",
            value: day.sleepActual,
            ideal: "22:30",
            notice: sleepNotice
          })}
          ${renderCheckboxField({
            id: "wakeOnTime",
            label: "Acordei no horário (6h30)",
            checked: day.checkboxes.wakeOnTime
          })}
          ${renderTimeField({
            field: "wakeActual",
            label: "Horário real de acordar",
            value: day.wakeActual,
            ideal: "06:30",
            notice: wakeNotice
          })}
        </div>

        <div class="section-group">
          <h3>Corrida leve</h3>
          ${renderCheckboxField({
            id: "runDone",
            label: "Corrida/ativação realizada",
            checked: day.checkboxes.runDone,
            disabled: day.checkboxes.runSkipped,
            badge: day.checkboxes.runSkipped ? "ignorado" : ""
          })}
          ${renderCheckboxField({
            id: "runSkipped",
            label: "Pular hoje",
            checked: day.checkboxes.runSkipped,
            hint: "Corrida é opcional - não pule mais que 2x por semana"
          })}
        </div>

        <div class="section-group">
          <h3>Alimentação</h3>
          ${mealRow(MEAL_FIELDS[0], day.checkboxes.breakfast, day.mealTimes.breakfast)}
        </div>
      `
    });
  }

  renderSchoolSection() {
    const day = getLegacyDaySnapshot(this.state.day);
    const open = this.state.sectionsOpen.school;

    return renderSectionCard({
      id: "school",
      title: SECTION_TITLES.school.title,
      subtitle: SECTION_TITLES.school.subtitle,
      open,
      content: `
        <div class="section-group">
          <h3>Manhã e intervalos</h3>
          ${renderCheckboxField({
            id: "bagReady",
            label: "Mochila pronta",
            checked: day.checkboxes.bagReady
          })}
          ${renderCheckboxField({
            id: "assignmentsDelivered",
            label: "Tarefas entregues",
            checked: day.checkboxes.assignmentsDelivered
          })}
          ${renderCheckboxField({
            id: "schoolSnackWater",
            label: "Intervalo - lanche e água",
            checked: day.checkboxes.schoolSnackWater
          })}
          ${renderCheckboxField({
            id: "schoolReview",
            label: "Material revisado para próxima aula",
            checked: day.checkboxes.schoolReview
          })}
        </div>
        <div class="section-group">
          <h3>Refeição do meio do dia</h3>
          ${mealRow(MEAL_FIELDS[1], day.checkboxes.lunch, day.mealTimes.lunch)}
        </div>
      `
    });
  }

  renderAfternoonSection() {
    const day = getLegacyDaySnapshot(this.state.day);
    const open = this.state.sectionsOpen.afternoon;

    return renderSectionCard({
      id: "afternoon",
      title: SECTION_TITLES.afternoon.title,
      subtitle: SECTION_TITLES.afternoon.subtitle,
      open,
      content: `
        <div class="section-group">
          <h3>Alimentação</h3>
          ${mealRow(MEAL_FIELDS[2], day.checkboxes.preWorkoutMeal, day.mealTimes.preWorkoutMeal)}
          ${mealRow(MEAL_FIELDS[3], day.checkboxes.postWorkoutMeal, day.mealTimes.postWorkoutMeal)}
        </div>
        <div class="section-group">
          <h3>Treino principal (15h - 17h/18h)</h3>
          ${renderCheckboxField({
            id: "trainingActivation",
            label: "Ativação geral (10min)",
            checked: day.checkboxes.trainingActivation
          })}
          ${renderCheckboxField({
            id: "strengthTraining",
            label: "Treino de força (executado)",
            checked: day.checkboxes.strengthTraining
          })}
          ${renderCheckboxField({
            id: "conditioning",
            label: "Condicionamento (executado)",
            checked: day.checkboxes.conditioning
          })}
          ${renderCheckboxField({
            id: "postStretch",
            label: "Alongamento pós-treino",
            checked: day.checkboxes.postStretch
          })}
          <label class="field-shell textarea-shell">
            <span class="field-label">Anotações do treino</span>
            <textarea
              class="text-area"
              rows="4"
              data-action="training-notes"
              placeholder="Ex: agachamento 3x10, 40kg"
            >${escapeHtml(day.trainingNotes)}</textarea>
          </label>
        </div>
      `
    });
  }

  renderNightSection() {
    const day = getLegacyDaySnapshot(this.state.day);
    const open = this.state.sectionsOpen.night;

    return renderSectionCard({
      id: "night",
      title: SECTION_TITLES.night.title,
      subtitle: SECTION_TITLES.night.subtitle,
      open,
      content: `
        <div class="section-group">
          <h3>Alimentação</h3>
          ${mealRow(MEAL_FIELDS[4], day.checkboxes.dinner, day.mealTimes.dinner)}
        </div>
        <div class="section-group">
          <h3>Recuperação</h3>
          ${renderCheckboxField({
            id: "screensOff",
            label: "Desconectar de telas 30min antes (21h30)",
            checked: day.checkboxes.screensOff
          })}
          ${renderCheckboxField({
            id: "brushTeeth",
            label: "Escovar os dentes",
            checked: day.checkboxes.brushTeeth
          })}
          ${renderCheckboxField({
            id: "nightStretch",
            label: "Alongamento noturno leve (5min)",
            checked: day.checkboxes.nightStretch
          })}
          ${renderCheckboxField({
            id: "calmMedia",
            label: "Ler ou ouvir música calma",
            checked: day.checkboxes.calmMedia
          })}
          ${renderCheckboxField({
            id: "sleepOnTime",
            label: "Deitar no horário (22h30)",
            checked: day.checkboxes.sleepOnTime,
            hint: "Ligado ao bloco de sono"
          })}
        </div>
      `
    });
  }

  renderTodayView() {
    const day = getLegacyDaySnapshot(this.state.day);
    const currentSummary = summarizeDay(this.state.day);
    const remainingWater = Math.max(0, WATER_GOAL_ML - day.waterTotalMl);
    return `
      ${this.renderReminderBanner()}
      ${renderAnalyticsDashboard({
        analytics: getDashboardAnalytics(this.state),
        history: this.state.history,
        currentSummary
      })}
      ${renderWaterTracker(day)}

      <section class="summary-card">
        <div class="summary-line">
          <span>Água restante</span>
          <strong>${formatMl(remainingWater)}</strong>
        </div>
        <div class="summary-line">
          <span>Horários de lembrete</span>
          <strong>${escapeHtml(reminderScheduleText())}</strong>
        </div>
      </section>

      ${this.renderMorningSection()}
      ${this.renderSchoolSection()}
      ${this.renderAfternoonSection()}
      ${this.renderNightSection()}
    `;
  }

  render() {
    if (!this.state || this.isRendering) {
      return;
    }

    this.isRendering = true;
    const progress = computeProgress(this.state.day);
    const day = getLegacyDaySnapshot(this.state.day);
    const shell = `
      <main class="app-shell">
        ${renderProgressHeader({
          dateLabel: formatDisplayDate(this.state.currentDayKey),
          activeView: this.activeView,
          percentage: progress.percentage,
          completed: progress.completed,
          total: progress.total,
          waterTotalMl: day.waterTotalMl,
          installAvailable: Boolean(this.beforeInstallEvent)
        })}

        <section class="content-stack">
          ${this.activeView === "today" ? this.renderTodayView() : renderHistoryView(this.state.history, summarizeDay(this.state.day))}
        </section>
      </main>
      ${renderToastStack(this.toasts)}
    `;

    this.root.innerHTML = shell;
    this.isRendering = false;
  }
}
