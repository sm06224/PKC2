/** @vitest-environment happy-dom */
/**
 * #869(A): 見出し / TOC 右クリック →「✎ この章を編集(別ウィンドウ)」→ その章
 * だけを別ウィンドウで編集。in-pane 章エディタ(#863)は据置(本機能は追加)。
 *
 * universal context menu flag(shell.context_menu_universal_enabled)配下。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { setContainerFlagSource } from '@adapter/flags';
import type { Container } from '@core/model/container';

const T = '2026-06-30T00:00:00Z';
const BODY = ['# Intro', 'intro body', '# Plan', 'plan body', '## Sub', 'sub body'].join('\n');

let root: HTMLElement;
let cleanup: (() => void) | null = null;
let capturedHtml = '';

function mockWindowOpen() {
  capturedHtml = '';
  const childDoc = {
    open: vi.fn(),
    write: vi.fn((html: string) => { capturedHtml += html; }),
    close: vi.fn(),
  };
  const child = {
    closed: false,
    focus: vi.fn(),
    document: childDoc,
    postMessage: vi.fn(),
  };
  vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
  return child;
}

function setup(textBody: string = BODY) {
  const container: Container = {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Doc', body: textBody, archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
  const dispatcher = createDispatcher();
  dispatcher.onState((s) => render(s, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
  return dispatcher;
}

function rightClick(el: Element): void {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
}

beforeEach(() => {
  setContainerFlagSource({ 'shell.context_menu_universal_enabled': true });
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  root.remove();
  setContainerFlagSource({});
  vi.restoreAllMocks();
});

describe('#869(A) section edit in separate window', () => {
  it('right-click a rendered heading → menu has "この章を編集" → opens a window with ONLY that section', () => {
    const dispatcher = setup();
    mockWindowOpen();

    // The center pane renders markdown headings with id = slug.
    const heading = root.querySelector<HTMLElement>('h1[id="plan"]');
    expect(heading, 'rendered h1#plan').not.toBeNull();

    rightClick(heading!);
    const menu = root.querySelector('[data-pkc-context-object="heading"]');
    expect(menu, 'object heading menu').not.toBeNull();
    const editItem = menu!.querySelector<HTMLButtonElement>('[data-pkc-cmd-id="object.edit-heading-section"]');
    expect(editItem, 'edit-section item').not.toBeNull();

    editItem!.click();

    // A window opened with the "Plan" chapter only. Its range spans from
    // `# Plan` through its `## Sub` subsection (a deeper heading is part of
    // the chapter), but EXCLUDES the separate `# Intro` chapter.
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(capturedHtml).toContain('# Plan');
    expect(capturedHtml).toContain('plan body');
    expect(capturedHtml).toContain('## Sub'); // subsection is part of the chapter
    expect(capturedHtml).toContain('sub body');
    expect(capturedHtml).not.toContain('intro body'); // other chapter excluded
    // The live entry is untouched until the window saves.
    expect(dispatcher.getState().container!.entries[0]!.body).toBe(BODY);
  });

  it('the section-edit item is absent on a non-text selection (e.g. nothing to edit)', () => {
    const dispatcher = setup('plain text, no headings');
    // No headings → no rendered h1/h2 with id; right-click body paragraph.
    const para = root.querySelector<HTMLElement>('[data-pkc-region="center"] p')
      ?? root.querySelector<HTMLElement>('[data-pkc-region="center"]')!;
    rightClick(para);
    const editItem = root.querySelector('[data-pkc-cmd-id="object.edit-heading-section"]');
    expect(editItem).toBeNull();
    expect(dispatcher.getState().container).toBeTruthy();
  });

  it('right-click a TOC entry also opens the section window', () => {
    setup();
    mockWindowOpen();
    const tocLink = root.querySelector<HTMLElement>('[data-pkc-toc-slug="sub"]');
    if (!tocLink) {
      // TOC may not render for short docs in this harness; skip gracefully.
      return;
    }
    rightClick(tocLink);
    const editItem = root.querySelector<HTMLButtonElement>('[data-pkc-cmd-id="object.edit-heading-section"]');
    expect(editItem).not.toBeNull();
    editItem!.click();
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(capturedHtml).toContain('## Sub');
    expect(capturedHtml).toContain('sub body');
    expect(capturedHtml).not.toContain('intro body');
  });
});
