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
}

export function mountPersistence(
  dispatcher: Dispatcher,
  options: PersistenceOptions,
): () => void {
  const { store, debounceMs = DEBOUNCE_MS, onError } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving = false;

  function scheduleSave(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      doSave();
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

  function handleEvent(event: DomainEvent): void {
    if (SAVE_TRIGGERS.has(event.type)) {
      scheduleSave();
    }
  }

  const unsubEvent = dispatcher.onEvent(handleEvent);

  // Cleanup
  return () => {
    unsubEvent();
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/**
 * Load Container from store, with fallback.
 *
 * Boot priority:
 * 1. IDB default container → SYS_INIT_COMPLETE
 * 2. pkc-data element → SYS_INIT_COMPLETE
 * 3. Empty container → SYS_INIT_COMPLETE
 * 4. All failed → SYS_INIT_ERROR
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
