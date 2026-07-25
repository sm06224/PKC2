/** @vitest-environment happy-dom */
/**
 * コードブロックその場編集(code-block-editor.ts)の contract。
 * ✎ 注入 / ダイアログ seed(原文行 slice)/ QUICK_UPDATE_ENTRY 書き戻し /
 * stale guard / phase・archetype ガード。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  injectCodeBlockEditButtons,
  openCodeBlockEditor,
} from '@adapter/ui/code-block-editor';
import { renderMarkdown } from '@features/markdown/markdown-render';
import { parseFrontmatter } from '@features/markdown/frontmatter';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { Dispatcher } from '@adapter/state/dispatcher';

const T = '2026-07-25T00:00:00Z';
const BODY = ['# t', '', '```js', 'const a = 1;', '```', '', 'tail'].join('\n');

function makeContainer(body = BODY): Container {
  return {
    meta: { container_id: 'c-cbe', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'E1', body, archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  } as unknown as Container;
}

function readyDispatcher(body = BODY): Dispatcher {
  const d = createDispatcher();
  d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer(body) });
  d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
  return d;
}

/**
 * S1 相当の rendered block を DOM に作る。detail-presenter と同様に
 * **frontmatter を strip した body** を render する(source-line anchor が
 * strip 済み基準になり、code-block-editor の +fm 換算が実挙動と一致する)。
 */
function renderedBlock(body = BODY): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderMarkdown(parseFrontmatter(body).body, { sourceLineAnchors: true });
  document.body.appendChild(host);
  injectCodeBlockEditButtons(host);
  return host.querySelector<HTMLElement>('.pkc-md-block[data-pkc-md-block-kind="code"]')!;
}

function dialog(): HTMLElement | null {
  return document.querySelector('[data-pkc-region="code-block-editor"]');
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('injectCodeBlockEditButtons', () => {
  it('code block に ✎ を 1 つ注入(冪等)、table には注入しない', () => {
    const host = document.createElement('div');
    host.innerHTML = renderMarkdown('```js\nx\n```\n\n| a |\n|---|\n| 1 |', {
      sourceLineAnchors: true,
    });
    document.body.appendChild(host);
    injectCodeBlockEditButtons(host);
    injectCodeBlockEditButtons(host); // 冪等
    const codeBlock = host.querySelector('[data-pkc-md-block-kind="code"]')!;
    expect(codeBlock.querySelectorAll('.pkc-md-edit-btn')).toHaveLength(1);
    const tableBlock = host.querySelector('[data-pkc-md-block-kind="table"]')!;
    expect(tableBlock.querySelector('.pkc-md-edit-btn')).toBeNull();
  });
});

describe('openCodeBlockEditor', () => {
  it('原文の fence 中身が seed され、保存で QUICK_UPDATE_ENTRY(revision +1)', () => {
    const d = readyDispatcher();
    const block = renderedBlock();
    openCodeBlockEditor(d, block);
    expect(dialog()).not.toBeNull();
    const ta = dialog()!.querySelector<HTMLTextAreaElement>('.pkc-code-edit-input')!;
    expect(ta.value).toBe('const a = 1;');

    ta.value = 'const a = 42;';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    dialog()!
      .querySelector<HTMLButtonElement>('[data-pkc-action="code-edit-commit"]')!
      .click();

    const st = d.getState();
    const e1 = st.container!.entries.find((e) => e.lid === 'e1')!;
    expect(e1.body).toBe(['# t', '', '```js', 'const a = 42;', '```', '', 'tail'].join('\n'));
    expect(e1.title).toBe('E1'); // title 不変(QUICK_UPDATE_ENTRY contract)
    expect(st.container!.revisions.some((r) => r.entry_lid === 'e1')).toBe(true);
    expect(dialog()).toBeNull();
  });

  it('frontmatter 付き body でも正しい行を編集する(offset 換算)', () => {
    const body = ['---', 'title: x', '---', '```json', '{ "a": 1 }', '```'].join('\n');
    const d = readyDispatcher(body);
    const block = renderedBlock(body);
    openCodeBlockEditor(d, block);
    const ta = dialog()!.querySelector<HTMLTextAreaElement>('.pkc-code-edit-input')!;
    expect(ta.value).toBe('{ "a": 1 }');
    ta.value = '{ "a": 2 }';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    dialog()!
      .querySelector<HTMLButtonElement>('[data-pkc-action="code-edit-commit"]')!
      .click();
    expect(d.getState().container!.entries[0]!.body).toContain('{ "a": 2 }');
    expect(d.getState().container!.entries[0]!.body.startsWith('---\ntitle: x\n---')).toBe(true);
  });

  it('stale guard: 開いた後に本文が変わっていたら保存を中止する', () => {
    const d = readyDispatcher();
    const block = renderedBlock();
    openCodeBlockEditor(d, block);
    // 裏で本文が変わる(行ズレを伴う変更)
    d.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'totally different' });
    const ta = dialog()!.querySelector<HTMLTextAreaElement>('.pkc-code-edit-input')!;
    ta.value = 'const a = 9;';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    dialog()!
      .querySelector<HTMLButtonElement>('[data-pkc-action="code-edit-commit"]')!
      .click();
    expect(d.getState().container!.entries[0]!.body).toBe('totally different');
  });

  it('editing phase 中は開かない', () => {
    const d = readyDispatcher();
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    openCodeBlockEditor(d, renderedBlock());
    expect(dialog()).toBeNull();
  });

  it('キャンセルで何も変わらない', () => {
    const d = readyDispatcher();
    openCodeBlockEditor(d, renderedBlock());
    dialog()!
      .querySelector<HTMLButtonElement>('[data-pkc-action="code-edit-cancel"]')!
      .click();
    expect(dialog()).toBeNull();
    expect(d.getState().container!.entries[0]!.body).toBe(BODY);
  });
});
