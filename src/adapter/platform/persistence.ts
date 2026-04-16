import type { Dispatcher } from '../state/dispatcher';
import type { ContainerStore } from './idb-store';
import type { DomainEvent, DomainEventType } from '../../core/action/domain-event';

/**
 * Persistence: wires DomainEvent → ContainerStore.save().
 *
 * Design:
 * - Subscribes to dispatcher.onEvent
 * - Saves the current Container when a mutation event fires
 * - Debounces saves to avoid excessive IDB writes
 * - Does NOT modify state or dispatch actions
 * - Save errors are logged, not thrown (non-blocking)
 *
 * The persistence layer does NOT:
 * - Touch core types
 * - Dispatch actions (it's a passive listener)
 * - Save runtime state (phase, selectedLid, etc.)
 * - Define its own events (no SAVE_SUCCEEDED/FAILED in DomainEvent)
 *
 * ── Debounce safety note ────────────────────────────────────────────
 *
 * The scheduled save reads the CURRENT state via
 * `dispatcher.getState()` at flush time, NOT at schedule time. So the
 * pattern
 *
 *     dispatch(QUICK_UPDATE_ENTRY);
 *     dispatch(SELECT_ENTRY);   // no save trigger
 *     // …debounce fires 300 ms later…
 *
 * does NOT produce a stale save: by the time `doSave()` runs, the
 * state already reflects both actions. There is no closure-captured
 * state snapshot to go stale.
 *
 * What can still go wrong is that the tab closes *before* the 300 ms
 * timer fires, in which case the pending change is lost. `flushPending`
 * + the `pagehide` handler below is the real hardening for that case.
 */

/** Events that indicate a Container mutation requiring save. */
const SAVE_TRIGGERS: ReadonlySet<DomainEventType> = new Set([
  'ENTRY_CREATED',
  'ENTRY_UPDATED',
  'ENTRY_DELETED',
  'ENTRY_RESTORED',
  'RELATION_CREATED',
  'RELATION_DELETED',
  'CONTAINER_LOADED',
  'CONTAINER_IMPORTED',
]);

const DEBOUNCE_MS = 300;

export interface PersistenceOptions {
  store: ContainerStore;
  debounceMs?: number;
  onError?: (error: unknown) => void;
  /**
   * When set, `mountPersistence` will attach a `pagehide` listener on
   * this target to call `flushPending()` automatically when the tab is
   * backgrounded or closed. Tests pass `null` to opt out; main.ts
   * passes `window`.
   *
   * Defaults to `window` in browser environments — see
   * `mountPersistence` for the resolution logic.
   */
  unloadTarget?: EventTarget | null;
}

/**
 * Handle returned by `mountPersistence`. `dispose` tears down the
 * subscription and cancels any pending timer. `flushPending` cancels
 * the debounce and runs a save immediately using the latest
 * `dispatcher.getState()` — callable at any time, safe to call when
 * there is nothing pending (it becomes a no-op).
 */
export interface PersistenceHandle {
  dispose(): void;
  flushPending(): Promise<void>;
}

export function mountPersistence(
  dispatcher: Dispatcher,
  options: PersistenceOptions,
): PersistenceHandle {
  const { store, debounceMs = DEBOUNCE_MS, onError } = options;
  const unloadTarget = options.unloadTarget === undefined
    ? (typeof window !== 'undefined' ? window : null)
    : options.unloadTarget;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving = false;

  function scheduleSave(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void doSave();
    }, debounceMs);
  }

  async function doSave(): Promise<void> {
    if (saving) {
      // Already saving, reschedule
      scheduleSave();
      return;
    }

    const currentState = dispatcher.getState();
    const container = currentState.container;
    if (!container) return;

    // Skip saving when container came from a Light export (no assets).
    // Saving it would overwrite IDB with asset-stripped data.
    if (currentState.lightSource) return;

    // Skip saving when container was booted from embedded pkc-data.
    // Boot-source policy (2026-04-16): opening an exported HTML must
    // not expand the embedded container into IndexedDB — the embedded
    // copy is a view-only snapshot. Persistence resumes only after
    // an explicit Import (CONFIRM_IMPORT / SYS_IMPORT_COMPLETE /
    // CONFIRM_MERGE_IMPORT / REHYDRATE), which clears the flag. See
    // `docs/development/boot-container-source-policy-revision.md`.
    if (currentState.viewOnlySource) return;

    saving = true;
    try {
      await store.save(container);
    } catch (err) {
      console.warn('[PKC2] Save failed:', err);
      onError?.(err);
    } finally {
      saving = false;
    }
  }

  /**
   * Flush any pending debounced save immediately. Cancels the running
   * timer and runs `doSave()` synchronously from the caller's view
   * (the returned promise resolves once the IDB put completes).
   *
   * No-op when there is nothing pending AND no save in flight.
   * When a save is already in flight, the inner `doSave` reschedules —
   * so callers must await the returned promise and accept that some
   * very-close-together writes may land in the *next* save batch.
   */
  async function flushPending(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    await doSave();
  }

  function handleEvent(event: DomainEvent): void {
    if (SAVE_TRIGGERS.has(event.type)) {
      scheduleSave();
    }
  }

  const unsubEvent = dispatcher.onEvent(handleEvent);

  // Install pagehide handler so pending saves are attempted on tab
  // close / navigation away. `pagehide` is preferred over `unload`
  // because modern browsers (esp. mobile) do not fire `unload`
  // reliably, and bfcache-friendly pages observe `pagehide` instead.
  const pagehideHandler = (): void => {
    // Fire-and-forget: the browser will not wait for the promise, so
    // the best we can do is kick off the IDB write synchronously. If
    // IDB isn't fast enough to complete before the tab dies, the
    // in-flight put is still useful — it survives into the next
    // session so long as the transaction committed.
    void flushPending();
  };
  if (unloadTarget) {
    unloadTarget.addEventListener('pagehide', pagehideHandler);
  }

  // Cleanup
  function dispose(): void {
    unsubEvent();
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (unloadTarget) {
      unloadTarget.removeEventListener('pagehide', pagehideHandler);
    }
  }

  return { dispose, flushPending };
}

/**
 * Load Container from the IDB store, with a null fallback.
 *
 * This function is intentionally **IDB-only**: it does not decide the
 * overall boot priority. The boot priority (pkc-data > IDB > empty)
 * lives in `chooseBootSource()` in `pkc-data-source.ts` and the top-
 * level orchestration in `main.ts`. Callers pass the result of this
 * function to `chooseBootSource` as the `idbContainer` argument.
 */
export async function loadFromStore(
  store: ContainerStore,
): Promise<{ source: 'idb' | 'none'; container: import('../../core/model/container').Container | null }> {
  try {
    const container = await store.loadDefault();
    if (container) {
      return { source: 'idb', container };
    }
  } catch (err) {
    console.warn('[PKC2] IDB load failed, falling back to pkc-data:', err);
  }
  return { source: 'none', container: null };
}
