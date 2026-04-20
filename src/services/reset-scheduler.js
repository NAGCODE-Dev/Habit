import { millisecondsUntilNextMidnight } from "./date-utils.js";

export function startDailyResetWatcher(onBoundary) {
  let midnightTimer = 0;
  let heartbeatTimer = 0;

  const triggerBoundary = () => {
    onBoundary();
    armMidnightTimer();
  };

  const armMidnightTimer = () => {
    window.clearTimeout(midnightTimer);
    midnightTimer = window.setTimeout(triggerBoundary, millisecondsUntilNextMidnight() + 500);
  };

  const onVisibilityChange = () => {
    if (!document.hidden) {
      onBoundary();
    }
  };

  const onFocus = () => onBoundary();

  armMidnightTimer();
  heartbeatTimer = window.setInterval(onBoundary, 60 * 1000);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", onFocus);

  return () => {
    window.clearTimeout(midnightTimer);
    window.clearInterval(heartbeatTimer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("focus", onFocus);
  };
}
