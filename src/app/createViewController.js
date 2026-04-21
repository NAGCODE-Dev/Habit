// @ts-check

function sanitizeView(view) {
  return view === "history" ? "history" : "today";
}

/**
 * Centraliza a view ativa e a sincronização da URL.
 */
export function createViewController({ windowObject = window } = {}) {
  let activeView = "today";

  function readViewFromUrl() {
    const currentUrl = new URL(windowObject.location.href);
    return sanitizeView(currentUrl.searchParams.get("view"));
  }

  function writeViewToUrl() {
    const currentUrl = new URL(windowObject.location.href);
    if (activeView === "history") {
      currentUrl.searchParams.set("view", "history");
    } else {
      currentUrl.searchParams.delete("view");
    }

    windowObject.history.replaceState({}, "", currentUrl);
  }

  return {
    getInitialView() {
      return readViewFromUrl();
    },
    getActiveView() {
      return activeView;
    },
    setActiveView(view, { syncUrl = true } = {}) {
      activeView = sanitizeView(view);
      if (syncUrl) {
        writeViewToUrl();
      }
      return activeView;
    },
    syncFromUrl() {
      activeView = readViewFromUrl();
      return activeView;
    }
  };
}
