import type { Dispatchable } from '../../core/action';
import type { DomainEvent } from '../../core/action/domain-event';
import { reduce, createInitialState } from './app-state';
import type { AppState, ReduceResult } from './app-state';

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
    const result = reduce(state, action);
    state = result.state;

    if (state !== prev) {
      for (const listener of stateListeners) {
        listener(state, prev);
      }
    }

    for (const event of result.events) {
      for (const listener of eventListeners) {
        listener(event);
      }
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
