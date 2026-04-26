import type { Dispatcher } from '../state/dispatcher';
import type { DomainEvent } from '../../core/action/domain-event';

/**
 * Event log: developer-aid stream of `DomainEvent`s.
 *
 * Earlier revisions mounted a fixed-position `<details>` tray in
 * the bottom-right corner of the viewport. End users have no use
 * for the panel and it occupied real estate, so the 2026-04-26
 * pass demoted the surface to `console.log` (`console.debug`).
 * Devs still get full event visibility through the browser console
 * with no UI cost.
 */

/**
 * Subscribe the dispatcher to the browser console. Returns the
 * unsubscribe function so the bootstrap caller can tear the
 * subscription down on hot-reload / teardown.
 */
export function wireEventLogToConsole(dispatcher: Dispatcher): () => void {
  return dispatcher.onEvent((event) => {
    // `debug` keeps the noise out of the default console filter
    // while still surfacing under the Verbose level.
    // eslint-disable-next-line no-console
    console.debug('[PKC2 event]', formatEvent(event), event);
  });
}

function formatEvent(event: DomainEvent): string {
  const parts: string[] = [event.type];
  if ('lid' in event) parts.push(`lid=${event.lid}`);
  if ('id' in event) parts.push(`id=${event.id}`);
  if ('error' in event) parts.push(`error=${event.error}`);
  if ('container_id' in event) parts.push(`cid=${event.container_id}`);
  if ('source' in event) parts.push(`source=${event.source}`);
  return parts.join(' ');
}
