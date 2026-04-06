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
 * - Conforms to the MessageHandler signature for registry integration
 *
 * This module does NOT:
 * - Implement correlation_id (future concern)
 * - Implement capability negotiation
 * - Handle rate limiting or payload size limits
 */

import type { HandlerContext, MessageHandler } from './message-handler';
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
 * MessageHandler for export:request.
 * Registered via createHandlerRegistry().register('export:request', exportRequestHandler).
 */
export const exportRequestHandler: MessageHandler = (ctx: HandlerContext): boolean => {
  // Note: embedded check is now enforced by the capability guard (capability.ts)
  // before messages reach handlers. No need to duplicate here.

  if (!ctx.container) {
    console.warn('[PKC2] export:request ignored: no container loaded');
    return false;
  }

  const payload = (ctx.envelope.payload ?? {}) as Partial<ExportRequestPayload>;
  const html = buildExportHtml(ctx.container);
  const filename = generateExportFilename(ctx.container, payload.filename);

  const resultPayload: ExportResultPayload = {
    html,
    filename,
    size: html.length,
  };

  ctx.sender.send(
    ctx.sourceWindow,
    'export:result',
    resultPayload,
    ctx.envelope.source_id,
  );

  return true;
};
