/**
 * Message Handler Registry: generalised routing layer for PKC-Message.
 *
 * Each MessageType can have at most one registered handler.
 * The bridge calls `routeMessage()` for every validated, non-ping envelope.
 * If a handler is registered for that type it is invoked with a HandlerContext;
 * otherwise the message is logged and ignored.
 *
 * Design:
 * - Handlers live in adapter/transport/ (never in core/).
 * - Handlers may call dispatcher.dispatch() to issue SystemCommands.
 * - Handlers receive a read-only context — they do not own the dispatcher.
 * - The registry is a plain Map, created per bridge instance (not global).
 *
 * This module does NOT:
 * - Implement correlation_id or capability negotiation
 * - Validate envelope structure (bridge + envelope.ts do that)
 * - Decide which handlers to register (main.ts bootstrap does that)
 */

import type { MessageEnvelope, MessageType } from '../../core/model/message';
import type { Container } from '../../core/model/container';
import type { Dispatcher } from '../state/dispatcher';
import type { MessageSender } from './message-bridge';

// ── Context passed to every handler ────────────────────────

export interface HandlerContext {
  /** The validated envelope. */
  envelope: MessageEnvelope;
  /** The window that sent the message (for response targeting). */
  sourceWindow: Window;
  /** Origin of the sender. */
  origin: string;
  /** Current container snapshot (may be null during init). */
  container: Container | null;
  /** Whether this PKC instance is embedded in an iframe. */
  embedded: boolean;
  /** Dispatcher for issuing SystemCommands. */
  dispatcher: Dispatcher;
  /** Sender for replying to the source window. */
  sender: MessageSender;
}

// ── Handler function signature ────────────────────────

/**
 * A message handler processes one MessageType.
 * Returns true if the message was handled, false if rejected/skipped.
 */
export type MessageHandler = (ctx: HandlerContext) => boolean;

// ── Registry ────────────────────────

export interface MessageHandlerRegistry {
  /** Register a handler for a specific message type. */
  register(type: MessageType, handler: MessageHandler): void;
  /** Route an incoming message to its handler. Returns true if handled. */
  route(ctx: HandlerContext): boolean;
  /** Check if a handler is registered for a type. */
  has(type: MessageType): boolean;
}

/**
 * Create a new handler registry.
 * Each bridge instance should have its own registry.
 */
export function createHandlerRegistry(): MessageHandlerRegistry {
  const handlers = new Map<MessageType, MessageHandler>();

  return {
    register(type: MessageType, handler: MessageHandler): void {
      if (handlers.has(type)) {
        console.warn(`[PKC2] Handler for "${type}" overwritten`);
      }
      handlers.set(type, handler);
    },

    route(ctx: HandlerContext): boolean {
      const handler = handlers.get(ctx.envelope.type);
      if (!handler) {
        console.warn(`[PKC2] No handler for message type "${ctx.envelope.type}"`);
        return false;
      }
      return handler(ctx);
    },

    has(type: MessageType): boolean {
      return handlers.has(type);
    },
  };
}
