import type { Dispatcher } from '../state/dispatcher';
import type { DomainEvent } from '../../core/action/domain-event';

/**
 * EventLog: minimal DomainEvent display for development.
 *
 * Subscribes to dispatcher.onEvent and shows the last N events
 * in a collapsible panel. This is a development aid, not a
 * production feature.
 */

const MAX_EVENTS = 20;

export function mountEventLog(container: HTMLElement, dispatcher: Dispatcher): () => void {
  const events: DomainEvent[] = [];

  const panel = document.createElement('details');
  panel.className = 'pkc-event-log';
  panel.setAttribute('data-pkc-region', 'event-log');

  const summary = document.createElement('summary');
  summary.textContent = 'Events (0)';
  panel.appendChild(summary);

  const list = document.createElement('ol');
  list.className = 'pkc-event-list';
  panel.appendChild(list);

  container.appendChild(panel);

  const unsub = dispatcher.onEvent((event) => {
    events.push(event);
    if (events.length > MAX_EVENTS) events.shift();

    summary.textContent = `Events (${events.length})`;
    renderEvents(list, events);
  });

  return () => {
    unsub();
    panel.remove();
  };
}

function renderEvents(list: HTMLOListElement, events: DomainEvent[]): void {
  list.innerHTML = '';
  for (const event of events) {
    const li = document.createElement('li');
    li.className = 'pkc-event-item';
    li.textContent = formatEvent(event);
    list.appendChild(li);
  }
}

function formatEvent(event: DomainEvent): string {
  const parts: string[] = [event.type];
  if ('lid' in event) parts.push(`lid=${event.lid}`);
  if ('id' in event) parts.push(`id=${event.id}`);
  if ('error' in event) parts.push(`error=${event.error}`);
  if ('container_id' in event) parts.push(`cid=${event.container_id}`);
  return parts.join(' ');
}
