/**
 * A small demo Container shown on first open so the graph has something to
 * draw before a real container is loaded (file) or pushed (host postMessage).
 */

import type { Container, Entry, Relation } from './types';

let seq = 0;
const ts = (daysAgo: number): string =>
  new Date(Date.UTC(2026, 5, 9) - daysAgo * 86_400_000).toISOString();

function entry(
  lid: string,
  title: string,
  archetype: Entry['archetype'],
  daysAgo: number,
  extra: Partial<Entry> = {},
): Entry {
  return {
    lid,
    title,
    body: '',
    archetype,
    created_at: ts(daysAgo + 5),
    updated_at: ts(daysAgo),
    ...extra,
  };
}

function rel(from: string, to: string, kind: Relation['kind']): Relation {
  seq += 1;
  return { id: `r${seq}`, from, to, kind, created_at: ts(0), updated_at: ts(0) };
}

export function makeDemoContainer(): Container {
  const entries: Entry[] = [
    entry('f-proj', 'Project PKC', 'folder', 40),
    entry('f-notes', 'Notes', 'folder', 38),
    entry('f-tasks', 'Tasks', 'folder', 36),
    entry('n-arch', 'Architecture', 'text', 30, { tags: ['design'], color_tag: 'blue' }),
    entry('n-graph', 'Graph extension', 'text', 6, { tags: ['design', 'graph'], color_tag: 'green' }),
    entry('n-transport', 'PKC-Message transport', 'text', 12, { tags: ['design'], color_tag: 'blue' }),
    entry('n-idea', 'Galaxy layout idea', 'textlog', 3, { tags: ['graph'] }),
    entry('t-port', 'Port graph-canvas', 'todo', 2, { tags: ['graph'] }),
    entry('t-wire', 'Wire transport', 'todo', 1, { tags: ['graph'] }),
    entry('t-docs', 'Write README', 'todo', 0),
    entry('a-diagram', 'system-diagram.png', 'attachment', 20, { color_tag: 'amber' }),
  ];

  const relations: Relation[] = [
    rel('f-proj', 'f-notes', 'structural'),
    rel('f-proj', 'f-tasks', 'structural'),
    rel('f-notes', 'n-arch', 'structural'),
    rel('f-notes', 'n-graph', 'structural'),
    rel('f-notes', 'n-transport', 'structural'),
    rel('f-notes', 'n-idea', 'structural'),
    rel('f-tasks', 't-port', 'structural'),
    rel('f-tasks', 't-wire', 'structural'),
    rel('f-tasks', 't-docs', 'structural'),
    rel('f-notes', 'a-diagram', 'structural'),
    rel('n-graph', 'n-transport', 'semantic'),
    rel('n-graph', 'n-arch', 'semantic'),
    rel('n-idea', 'n-graph', 'semantic'),
    rel('t-port', 'n-graph', 'semantic'),
    rel('t-wire', 'n-transport', 'semantic'),
    rel('a-diagram', 'n-arch', 'semantic'),
  ];

  return {
    meta: {
      container_id: 'demo',
      title: 'Graph Extension Demo',
      created_at: ts(45),
      updated_at: ts(0),
      schema_version: 1,
    },
    entries,
    relations,
    revisions: [],
    assets: {},
  };
}
