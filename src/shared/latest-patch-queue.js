function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mergeLatestPatch(base = {}, incoming = {}) {
  if (!isPlainObject(base)) return structuredClone(incoming);
  if (!isPlainObject(incoming)) return structuredClone(incoming);

  const merged = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = mergeLatestPatch(merged[key], value);
    } else if (Array.isArray(value)) {
      merged[key] = value.map((entry) => structuredClone(entry));
    } else {
      merged[key] = structuredClone(value);
    }
  }
  return merged;
}

export function createLatestPatchQueue(sendPatch) {
  if (typeof sendPatch !== 'function') throw new TypeError('sendPatch must be a function.');

  let running = false;
  let pendingPatch = null;
  let pendingWaiters = [];
  let idleWaiters = [];

  function resolveIdleWaiters() {
    if (running || pendingPatch) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (pendingPatch) {
        const patch = pendingPatch;
        const waiters = pendingWaiters;
        pendingPatch = null;
        pendingWaiters = [];

        try {
          const response = await sendPatch(patch);
          for (const waiter of waiters) waiter.resolve(response);
        } catch (error) {
          for (const waiter of waiters) waiter.reject(error);
        }
      }
    } finally {
      running = false;
      if (pendingPatch) {
        queueMicrotask(drain);
      } else {
        resolveIdleWaiters();
      }
    }
  }

  function enqueueLatestPatch(patch) {
    return new Promise((resolve, reject) => {
      pendingPatch = mergeLatestPatch(pendingPatch || {}, patch || {});
      pendingWaiters.push({ resolve, reject });
      void drain();
    });
  }

  enqueueLatestPatch.flush = function flushLatestPatches() {
    if (!running && !pendingPatch) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.push(resolve));
  };

  return enqueueLatestPatch;
}
