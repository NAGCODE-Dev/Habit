export function logOperationalWarning(scope, error, { silence = false } = {}) {
  if (silence) {
    return;
  }

  console.warn(`[${scope}]`, error);
}

export function logOperationalError(scope, error) {
  console.error(`[${scope}]`, error);
}
