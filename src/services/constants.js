export const APP_NAME = "Rotina";
export const WATER_GOAL_ML = 3000;
export const MAX_WATER_SINGLE_ENTRY_ML = 5000;
export const WATER_PRESET_AMOUNTS = [250, 500, 1000];
export const WATER_REMINDER_HOURS = [8, 10, 12, 14, 16, 18, 20];
export const DB_NAME = "habit-athlete-pwa";
export const DB_VERSION = 1;
export const DB_STORE = "kv";
export const DB_APP_STATE_KEY = "app-state";
export const DB_APP_STATE_BACKUP_KEY = "app-state-backup";
export const MAX_HISTORY_DAYS = 540;
export const CURRENT_SCHEMA_VERSION = 7;

export const DEFAULT_SECTION_OPEN = {
  morning: true,
  school: true,
  afternoon: true,
  night: false
};

export const MEAL_FIELDS = [
  {
    id: "breakfast",
    label: "Cafe da manha",
    range: "ate 9h",
    period: "morning"
  },
  {
    id: "lunch",
    label: "Almoco",
    range: "12h - 13h",
    period: "school"
  },
  {
    id: "preWorkoutMeal",
    label: "Pre-treino",
    range: "14h - 14h30",
    period: "afternoon"
  },
  {
    id: "postWorkoutMeal",
    label: "Pos-treino",
    range: "18h - 18h30",
    period: "afternoon"
  },
  {
    id: "dinner",
    label: "Jantar",
    range: "20h - 21h",
    period: "night"
  }
];

export const STATIC_PROGRESS_IDS = [
  "sleepOnTime",
  "wakeOnTime",
  "bagReady",
  "assignmentsDelivered",
  "schoolSnackWater",
  "schoolReview",
  "breakfast",
  "lunch",
  "preWorkoutMeal",
  "postWorkoutMeal",
  "dinner",
  "trainingActivation",
  "strengthTraining",
  "conditioning",
  "postStretch",
  "screensOff",
  "brushTeeth",
  "nightStretch",
  "calmMedia"
];

export const SECTION_TITLES = {
  morning: {
    title: "Manha",
    subtitle: "Sono, ativacao e primeira refeicao"
  },
  school: {
    title: "Escola",
    subtitle: "Bloco da manha e intervalos"
  },
  afternoon: {
    title: "Tarde",
    subtitle: "Treino principal e refeicoes ao redor"
  },
  night: {
    title: "Noite",
    subtitle: "Recuperacao e preparacao para dormir"
  }
};
