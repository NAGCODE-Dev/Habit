import { renderCheckboxField } from "../components/CheckboxField.js";
import { renderSectionCard } from "../components/SectionCard.js";
import { renderTimeField } from "../components/TimeField.js";
import { MEAL_FIELDS, SECTION_TITLES } from "../services/constants.js";
import { diffNotice } from "../services/date-utils.js";
import { escapeHtml } from "../services/dom-utils.js";
import { getLegacyDaySnapshot } from "../services/dayService.js";

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

export function renderMorningSection(state) {
  const day = getLegacyDaySnapshot(state.day);
  const open = state.sectionsOpen.morning;
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

export function renderSchoolSection(state) {
  const day = getLegacyDaySnapshot(state.day);
  const open = state.sectionsOpen.school;

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

export function renderAfternoonSection(state) {
  const day = getLegacyDaySnapshot(state.day);
  const open = state.sectionsOpen.afternoon;

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

export function renderNightSection(state) {
  const day = getLegacyDaySnapshot(state.day);
  const open = state.sectionsOpen.night;

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
