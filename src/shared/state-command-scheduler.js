import { mergeLatestPatch } from './latest-patch-queue.js';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createStateCommandScheduler(applyPatch, { patchDebounceMs = 24 } = {}) {
  if (typeof applyPatch !== 'function') throw new TypeError('applyPatch must be a function.');

  const queue = [];
  let running = false;
  let idleWaiters = [];

  function resolveIdleWaiters() {
    if (running || queue.length) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function mergeAdjacentPatchEntries(entry) {
    while (queue[0]?.kind === 'patch') {
      const next = queue.shift();
      entry.patch = mergeLatestPatch(entry.patch, next.patch);
      entry.waiters.push(...next.waiters);
    }
  }

  function mergeAdjacentLatestCommandEntries(entry) {
    while (queue[0]?.kind === 'latest-command' && queue[0].key === entry.key) {
      const next = queue.shift();
      entry.command = next.command;
      entry.waiters.push(...next.waiters);
    }
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const entry = queue.shift();
        if (entry.kind === 'patch') {
          if (patchDebounceMs > 0) await delay(patchDebounceMs);
          mergeAdjacentPatchEntries(entry);
          try {
            const result = await applyPatch(entry.patch);
            for (const waiter of entry.waiters) waiter.resolve(result);
          } catch (error) {
            for (const waiter of entry.waiters) waiter.reject(error);
          }
          continue;
        }

        if (entry.kind === 'latest-command') {
          // Never hold the Manifest V3 service worker open on a debounce timer.
          // An already-running command is allowed to finish; adjacent pending
          // commands with the same key collapse to the newest operation.
          mergeAdjacentLatestCommandEntries(entry);
          try {
            const result = await entry.command();
            for (const waiter of entry.waiters) waiter.resolve(result);
          } catch (error) {
            for (const waiter of entry.waiters) waiter.reject(error);
          }
          continue;
        }

        try {
          entry.resolve(await entry.command());
        } catch (error) {
          entry.reject(error);
        }
      }
    } finally {
      running = false;
      if (queue.length) queueMicrotask(drain);
      else resolveIdleWaiters();
    }
  }

  function enqueuePatch(patch) {
    return new Promise((resolve, reject) => {
      const tail = queue.at(-1);
      if (tail?.kind === 'patch') {
        tail.patch = mergeLatestPatch(tail.patch, patch || {});
        tail.waiters.push({ resolve, reject });
      } else {
        queue.push({
          kind: 'patch',
          patch: mergeLatestPatch({}, patch || {}),
          waiters: [{ resolve, reject }]
        });
      }
      void drain();
    });
  }

  function enqueueCommand(command) {
    if (typeof command !== 'function') throw new TypeError('command must be a function.');
    return new Promise((resolve, reject) => {
      queue.push({ kind: 'command', command, resolve, reject });
      void drain();
    });
  }

  function enqueueLatestCommand(key, command) {
    if (!key) throw new TypeError('latest command key is required.');
    if (typeof command !== 'function') throw new TypeError('command must be a function.');
    const normalizedKey = String(key);
    return new Promise((resolve, reject) => {
      const tail = queue.at(-1);
      if (tail?.kind === 'latest-command' && tail.key === normalizedKey) {
        tail.command = command;
        tail.waiters.push({ resolve, reject });
      } else {
        queue.push({
          kind: 'latest-command',
          key: normalizedKey,
          command,
          waiters: [{ resolve, reject }]
        });
      }
      void drain();
    });
  }

  function flush() {
    if (!running && queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.push(resolve));
  }

  return Object.freeze({ enqueuePatch, enqueueCommand, enqueueLatestCommand, flush });
}
