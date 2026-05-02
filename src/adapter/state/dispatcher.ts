import type { Dispatchable } from '../../core/action';
import type { DomainEvent } from '../../core/action/domain-event';
import { reduce, createInitialState } from './app-state';
import type { AppState, ReduceResult } from './app-state';
import { start } from '../../runtime/profile';
import {
  extractStructuralFromAction,
  isContentModeEnabled,
  isRecordingEnabled,
  nextDispatchSeq,
  recordDebugEvent,
  recordInitialContainer,
  snapshotActionForContent,
} from '../../runtime/debug-flags';

/**
 * EventListener: subscribes to domain events emitted after state transitions.
 */
export type EventListener = (event: DomainEvent) => void;

/**
 * StateListener: subscribes to state changes.
 */
export type StateListener = (state: AppState, prev: AppState) => void;

/**
 * Dispatcher: the single coordination point for action → state → events.
 *
 * Responsibilities:
 * 1. Accept Dispatchable actions (UserAction | SystemCommand)
 * 2. Run the pure reducer to get (state', events[])
 * 3. Notify state listeners if state changed
 * 4. Notify event listeners for each emitted DomainEvent
 *
 * The dispatcher does NOT:
 * - Handle external MessageEnvelope (a message handler translates those
 *   into SystemCommands before dispatching)
 * - Perform side effects (listeners do that)
 * - Decide action validity (the reducer does that)
 */
export interface Dispatcher {
  dispatch(action: Dispatchable): ReduceResult;
  getState(): AppState;

  /**
   * Subscribe to state changes. Returns an unsubscribe function.
   *
   * Page-lifetime subscriptions (main.ts boot) may discard the return
   * value. Any shorter-lived caller must capture and call it on
   * teardown to prevent stale-listener contamination.
   */
  onState(listener: StateListener): () => void;

  /**
   * Subscribe to domain events. Returns an unsubscribe function.
   *
   * Same lifecycle contract as {@link onState}.
   */
  onEvent(listener: EventListener): () => void;
}

export function createDispatcher(): Dispatcher {
  let state = createInitialState();
  const stateListeners = new Set<StateListener>();
  const eventListeners = new Set<EventListener>();

  function dispatch(action: Dispatchable): ReduceResult {
    const prev = state;
    // Profile gate (PR #176): the action's `type` is short ASCII so
    // it doubles as the per-dispatch measure label.
    const endDispatch = start(`dispatch:${action.type}`);

    // Debug ring buffer (PR #211, stage β). Off when no debug feature
    // is active. Pre-record housekeeping: allocate the monotonic seq
    // before reduce so a content-mode snapshot can pin to it; capture
    // wall-clock start so durMs reflects reduce + listener flush.
    const recordingEnabled = isRecordingEnabled();
    const debugSeq = recordingEnabled ? nextDispatchSeq() : 0;
    const debugStart =
      recordingEnabled && typeof performance !== 'undefined'
        ? performance.now()
        : 0;
    // Replay seed: capture the first SYS_INIT_COMPLETE's container so
    // content-mode reports can ship (initialContainer, recent[]) for
    // local deterministic replay. Reducer-purity contract is pinned
    // by tests/core/replay-determinism.test.ts.
    if (
      action.type === 'SYS_INIT_COMPLETE' &&
      isContentModeEnabled()
    ) {
      recordInitialContainer(
        (action as { container?: unknown }).container ?? null,
      );
    }

    const endReduce = start(`dispatch:${action.type}:reduce`);
    const result = reduce(state, action);
    endReduce();
    state = result.state;

    if (state !== prev) {
      const endNotify = start(`dispatch:${action.type}:notify-state`);
      for (const listener of stateListeners) {
        listener(state, prev);
      }
      endNotify();
    }

    for (const event of result.events) {
      for (const listener of eventListeners) {
        listener(event);
      }
    }

    endDispatch();

    // Post-record: durMs measured across the whole dispatch span,
    // attached to the buffer entry. Structural cherry-pick keeps
    // privacy-by-construction; content mode adds the bounded snapshot.
    if (recordingEnabled) {
      const structural = extractStructuralFromAction(
        action as { type: string } & Record<string, unknown>,
      );
      const durMs =
        typeof performance !== 'undefined'
          ? Math.round((performance.now() - debugStart) * 100) / 100
          : 0;
      recordDebugEvent({
        kind: 'dispatch',
        seq: debugSeq,
        ts: new Date().toISOString(),
        type: structural.type,
        ...(structural.lid !== undefined ? { lid: structural.lid } : {}),
        durMs,
        ...(isContentModeEnabled()
          ? { content: snapshotActionForContent(action) }
          : {}),
      });
    }
    return result;
  }

  function getState(): AppState {
    return state;
  }

  function onState(listener: StateListener): () => void {
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  }

  function onEvent(listener: EventListener): () => void {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  }

  return { dispatch, getState, onState, onEvent };
}
