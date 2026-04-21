// @ts-check

/**
 * Controla criação, expiração e descarte de toasts.
 */
export function createToastController({
  windowObject = window,
  onChange = () => {}
} = {}) {
  let toasts = [];
  const toastTimers = new Map();

  function dismissToast(id) {
    const timer = toastTimers.get(id);
    if (timer) {
      windowObject.clearTimeout(timer);
      toastTimers.delete(id);
    }

    toasts = toasts.filter((toast) => toast.id !== id);
    onChange(toasts);
  }

  return {
    getToasts() {
      return toasts;
    },
    addToast(message, tone = "info", duration = 3200) {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      toasts = [...toasts, { id, message, tone }];
      onChange(toasts);

      const timer = windowObject.setTimeout(() => {
        dismissToast(id);
      }, duration);
      toastTimers.set(id, timer);

      return id;
    },
    dismissToast,
    destroy() {
      for (const timer of toastTimers.values()) {
        windowObject.clearTimeout(timer);
      }
      toastTimers.clear();
      toasts = [];
    }
  };
}
