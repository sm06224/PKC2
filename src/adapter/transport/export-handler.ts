/**
 * Export message handler: processes export:request messages
 * and responds with export:result containing the HTML string.
 *
 * This handler is used when PKC2 is embedded in a parent page.
 * The parent sends export:request via postMessage, and this handler
 * builds the export HTML and sends it back as export:result.
 *
 * Design decisions:
 * - Only processes export:request when embedded === true
 * - Does NOT trigger Blob download (that's for standalone export)
 * - Does NOT transition AppPhase to 'exporting' (no UI blocking)
 * - Returns the HTML string in the payload for the parent to handle
 *
 * This module does NOT:
 * - Implement correlation_id (future concern)
 * - Implement capability negotiation
 * - Handle rate limiting or payload size limits
 */

import type { MessageEnvelope } from '../../core/model/message';
import type { Container } from '../../core/model/container';
import type { MessageSender } from './message-bridge';
import { buildExportHtml, generateExportFilename } from '../platform/exporter';

export interface ExportRequestPayload {
  /** Optional filename override (without extension). */
  filename?: string;
}

export interface ExportResultPayload {
  /** The full HTML string of the exported container. */
  html: string;
  /** Generated filename. */
  filename: string;
  /** Size in bytes of the HTML string. */
  size: number;
}

/**
 * Handle an incoming export:request message.
 *
 * @param envelope - The validated MessageEnvelope with type 'export:request'
 * @param container - Current container state to export
 * @param sender - MessageSender for sending the response
 * @param sourceWindow - The window that sent the request (for response targeting)
 * @param embedded - Whether this instance is embedded
 * @returns true if handled, false if rejected
 */
export function handleExportRequest(
  envelope: MessageEnvelope,
  container: Container,
  sender: MessageSender,
  sourceWindow: Window,
  embedded: boolean,
): boolean {
  if (!embedded) {
    console.warn('[PKC2] export:request ignored: not embedded');
    return false;
  }

  const payload = (envelope.payload ?? {}) as Partial<ExportRequestPayload>;
  const html = buildExportHtml(container);
  const filename = generateExportFilename(container, payload.filename);

  const resultPayload: ExportResultPayload = {
    html,
    filename,
    size: html.length,
  };

  sender.send(
    sourceWindow,
    'export:result',
    resultPayload,
    envelope.source_id,
  );

  return true;
}
