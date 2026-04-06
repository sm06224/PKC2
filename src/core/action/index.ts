export type { UserAction, UserActionType } from './user-action';
export type { SystemCommand, SystemCommandType } from './system-command';
export type { DomainEvent, DomainEventType } from './domain-event';

/**
 * Dispatchable: the union of all actions the reducer can accept.
 * UserAction (user-initiated) + SystemCommand (system-initiated).
 *
 * DomainEvent is NOT dispatchable — events are outputs, not inputs.
 * MessageEnvelope is NOT dispatchable — external messages go through
 * a separate message handler that may translate them into SystemCommands.
 */
import type { UserAction } from './user-action';
import type { SystemCommand } from './system-command';

export type Dispatchable = UserAction | SystemCommand;

/** Extract the type literal from any Dispatchable. */
export type DispatchableType = Dispatchable['type'];
