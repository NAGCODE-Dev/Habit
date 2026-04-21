// @ts-check

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? ""
    };
  }

  if (error === undefined) {
    return {};
  }

  return {
    error: error
  };
}

function logOperational(level, scope, error, {
  silence = false,
  context = {}
} = {}) {
  if (silence) {
    return;
  }

  const payload = {
    scope,
    ...context,
    ...serializeError(error)
  };

  if (level === "warn") {
    console.warn(`[${scope}]`, payload);
    return;
  }

  if (level === "info") {
    console.info(`[${scope}]`, payload);
    return;
  }

  console.error(`[${scope}]`, payload);
}

export function logOperationalWarning(scope, error, options = {}) {
  logOperational("warn", scope, error, options);
}

export function logOperationalError(scope, error, options = {}) {
  logOperational("error", scope, error, options);
}

export function logOperationalInfo(scope, error, options = {}) {
  logOperational("info", scope, error, options);
}
