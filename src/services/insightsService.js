export function generateInsights(metrics) {
  const insights = [];

  if (metrics.consistency.completionRate >= 80) {
    insights.push({ tone: "positive", message: "Você manteve alta consistência nesta semana." });
  }
  if (metrics.workout.missedDays >= 2) {
    insights.push({ tone: "warning", message: "Sua consistência de treino caiu nos últimos dias." });
  }
  if (metrics.workout.consistencyTrend === "up") {
    insights.push({ tone: "positive", message: "Sua performance de treino está melhorando progressivamente." });
  }
  if (metrics.sleep.deviationFromTarget > 45) {
    insights.push({ tone: "warning", message: "Seu sono está inconsistente nas últimas semanas." });
  }
  if (metrics.water.daysBelowGoal >= 4) {
    insights.push({ tone: "info", message: "Você ficou abaixo da meta de hidratação em vários dias recentes." });
  }

  if (!insights.length) {
    insights.push({ tone: "info", message: "Sem alertas importantes no momento. Continue registrando." });
  }

  return insights;
}
