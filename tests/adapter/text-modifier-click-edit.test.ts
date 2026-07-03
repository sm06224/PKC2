/** @vitest-environment happy-dom */
/**
 * 2026-07-03 user request:TEXT エントリも textlog と同じく
 * modifier+click(Alt / Ctrl / ⌘)で編集モードへ。さらに「突いた要素の
 * 直下から編集開始」— view render の data-pkc-source-line anchor から
 * clicked line を逆引きし、caret をその行に置く。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

const T = '2026-07-03T00:00:00Z';
const BODY = ['# Intro', 'intro body', '', '# Plan', 'plan body', '', '## Sub', 'sub body'].join('\n');
const FM_BODY = ['---', 'tags: [x]', '---', '# Head', 'body text'].join('\n');

let root: HTMLElement;
let cleanup: (() => void) | null = null;

function makeContainer(body: string): Container {
  return {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Doc', body, archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function setup(body: string = BODY) {
  const container = makeContainer(body);
  const dispatcher = createDispatcher();
  dispatcher.onState((s) => render(s, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
  return dispatcher;
}

function modClick(el: Element, mod: 'ctrlKey' | 'altKey' | 'metaKey'): void {
  el.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    [mod]: true,
    clientX: 10,
    clientY: 10,
  }));
}

function caretLine(ta: HTMLTextAreaElement): number {
  const pos = ta.selectionStart ?? 0;
  let line = 0;
  for (let i = 0; i < pos; i++) if (ta.value.charCodeAt(i) === 10) line++;
  return line;
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  root.remove();
});

describe('text entry modifier+click → edit at clicked line', () => {
  it('Ctrl+click on a rendered heading enters editing with caret at its source line', () => {
    const dispatcher = setup();
    // view render は source-line anchor 付き(detail-presenter)。
    const plan = root.querySelector<HTMLElement>(
      '[data-pkc-region="center"] [data-pkc-source-line="3"]',
    );
    expect(plan, 'anchored element for line 3 (# Plan)').not.toBeNull();

    modClick(plan!, 'ctrlKey');

    const st = dispatcher.getState();
    expect(st.phase).toBe('editing');
    expect(st.editingLid).toBe('e1');
    const ta = root.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    expect(ta).not.toBeNull();
    expect(caretLine(ta!)).toBe(3);
  });

  it('Alt+click and ⌘+click work identically (cross-platform modifiers)', () => {
    for (const mod of ['altKey', 'metaKey'] as const) {
      const dispatcher = setup();
      const sub = root.querySelector<HTMLElement>(
        '[data-pkc-region="center"] [data-pkc-source-line="6"]',
      );
      expect(sub, `anchored element for line 6 (## Sub), mod=${mod}`).not.toBeNull();
      modClick(sub!, mod);
      expect(dispatcher.getState().phase, mod).toBe('editing');
      const ta = root.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
      expect(caretLine(ta!), mod).toBe(6);
      cleanup?.();
      cleanup = null;
      root.innerHTML = '';
    }
  });

  it('plain click (no modifier) does NOT enter editing', () => {
    const dispatcher = setup();
    const el = root.querySelector<HTMLElement>(
      '[data-pkc-region="center"] [data-pkc-source-line="3"]',
    )!;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().phase).toBe('ready');
  });

  it('modifier+click on a link inside the body is NOT hijacked', () => {
    const dispatcher = setup('# H\n[link](https://example.com)');
    const a = root.querySelector<HTMLElement>('[data-pkc-region="center"] .pkc-view-body a');
    expect(a).not.toBeNull();
    modClick(a!, 'ctrlKey');
    expect(dispatcher.getState().phase).toBe('ready');
  });

  it('readonly mode is NOT hijacked', () => {
    const container = makeContainer(BODY);
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container, readonly: true });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    const el = root.querySelector<HTMLElement>(
      '[data-pkc-region="center"] [data-pkc-source-line="3"]',
    );
    if (!el) return; // readonly render may differ — nothing to hijack anyway
    modClick(el, 'ctrlKey');
    expect(dispatcher.getState().phase).toBe('ready');
  });

  it('frontmatter offset: anchor lines are stripped-body-relative, caret lands on the full-body line', () => {
    const dispatcher = setup(FM_BODY);
    // stripped body = '# Head\nbody text' → anchor line 0 = '# Head'
    // full body では frontmatter 3 行(---, tags, ---)の後 = line 3。
    const head = root.querySelector<HTMLElement>(
      '[data-pkc-region="center"] [data-pkc-source-line="0"]',
    );
    expect(head, 'anchored # Head at stripped line 0').not.toBeNull();
    modClick(head!, 'ctrlKey');
    expect(dispatcher.getState().phase).toBe('editing');
    const ta = root.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    expect(ta!.value).toBe(FM_BODY);
    expect(caretLine(ta!)).toBe(3);
  });
});
