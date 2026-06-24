/**
 * @vitest-environment happy-dom
 *
 * 章フォーカス編集(section edit)— text entry の h1–h3 を 1 節だけ focused
 * editor で開いて書き換える(差し挟みの編集版)。user direction(2026-06-24):
 * 「章の既存本文を開いて丸ごと書き換える focused エディタ」。
 *
 * - append area の挿入先 selector で章を選び「✎ 章を編集」→ focused editor
 *   (その章の本文だけを textarea に load)
 * - 保存で当該節へ splice(他の章・前文は不変)、`sectionEdit` 解除、通常 view へ
 * - 取消 / Esc で破棄、Ctrl+Enter / Ctrl+S で保存
 * - 章未選択(本文末尾)では editor を開かない / SELECT_ENTRY で state 解除
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

const T = '2026-06-24T00:00:00Z';
const BODY = ['# Intro', 'intro body', '# Plan', 'plan body', '## Sub', 'sub body'].join('\n');

let root: HTMLElement;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    root.remove();
  };
});

function setup(textBody: string = BODY) {
  const container: Container = {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Doc', body: textBody, archetype: 'text', created_at: T, updated_at: T },
      { lid: 'e2', title: 'Other', body: 'other', archetype: 'text', created_at: T, updated_at: T },
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

type D = ReturnType<typeof setup>;
const sel = () =>
  root.querySelector<HTMLSelectElement>('[data-pkc-field="text-append-target"][data-pkc-lid="e1"]')!;
const beginBtn = () =>
  root.querySelector<HTMLButtonElement>('[data-pkc-action="begin-section-edit"][data-pkc-lid="e1"]')!;
const sectionTa = () =>
  root.querySelector<HTMLTextAreaElement>('[data-pkc-field="section-edit-text"][data-pkc-lid="e1"]');
const bodyOf = (d: D, lid = 'e1') => d.getState().container!.entries.find((e) => e.lid === lid)!.body;

/** 章 index を選んで「✎ 章を編集」を押し、focused editor の textarea を返す。 */
function openSection(index: number): HTMLTextAreaElement {
  sel().value = String(index);
  beginBtn().click();
  return sectionTa()!;
}

describe('章フォーカス編集 begin', () => {
  it('章を選んで「✎ 章を編集」で focused editor が開く(その章だけ load)', () => {
    const d = setup();
    const ta = openSection(0);
    expect(d.getState().sectionEdit).toEqual({ lid: 'e1', index: 0 });
    expect(ta).toBeTruthy();
    expect(ta.value).toBe('# Intro\nintro body');
    // focused:通常 view の追記エリアは出ない
    expect(root.querySelector('[data-pkc-region="text-append"]')).toBeFalsy();
    expect(root.querySelector('[data-pkc-region="section-editor"]')).toBeTruthy();
  });

  it('入れ子の章(h2)も範囲どおり load される', () => {
    setup();
    const ta = openSection(2); // ## Sub
    expect(ta.value).toBe('## Sub\nsub body');
  });

  it('見出しが無い text には「章を編集」ボタンを出さない', () => {
    setup('just text, no headings');
    expect(root.querySelector('[data-pkc-action="begin-section-edit"]')).toBeFalsy();
  });

  it('挿入先が「本文末尾」(章未選択)なら editor を開かない', () => {
    const d = setup();
    sel().value = '';
    beginBtn().click();
    expect(d.getState().sectionEdit).toBeFalsy();
    expect(sectionTa()).toBeFalsy();
  });
});

describe('章フォーカス編集 commit / cancel', () => {
  it('保存で当該節だけ差し替え(他の章・前文は不変)、state 解除して通常 view へ', () => {
    const d = setup();
    const ta = openSection(0);
    ta.value = '# Intro\nintro body\nADDED';
    root.querySelector<HTMLButtonElement>('[data-pkc-action="commit-section-edit"][data-pkc-lid="e1"]')!.click();
    expect(bodyOf(d)).toBe(
      ['# Intro', 'intro body', 'ADDED', '# Plan', 'plan body', '## Sub', 'sub body'].join('\n'),
    );
    expect(d.getState().sectionEdit).toBeFalsy();
    expect(root.querySelector('[data-pkc-region="text-append"]')).toBeTruthy();
  });

  it('保存は title を変えず revision を残す', () => {
    const d = setup();
    const before = d.getState().container!.revisions.length;
    const ta = openSection(1);
    ta.value = '# Plan\nrewritten';
    root.querySelector<HTMLButtonElement>('[data-pkc-action="commit-section-edit"][data-pkc-lid="e1"]')!.click();
    const e1 = d.getState().container!.entries.find((e) => e.lid === 'e1')!;
    expect(e1.title).toBe('Doc');
    expect(bodyOf(d)).toBe(['# Intro', 'intro body', '# Plan', 'rewritten'].join('\n'));
    expect(d.getState().container!.revisions.length).toBe(before + 1);
  });

  it('取消で破棄(本文不変・state 解除)', () => {
    const d = setup();
    const ta = openSection(1);
    ta.value = 'CHANGED';
    root.querySelector<HTMLButtonElement>('[data-pkc-action="cancel-section-edit"]')!.click();
    expect(d.getState().sectionEdit).toBeFalsy();
    expect(bodyOf(d)).toBe(BODY);
  });

  it('Ctrl+Enter で保存', () => {
    const d = setup();
    const ta = openSection(2);
    ta.value = '## Sub\nNEW';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(bodyOf(d)).toBe(['# Intro', 'intro body', '# Plan', 'plan body', '## Sub', 'NEW'].join('\n'));
    expect(d.getState().sectionEdit).toBeFalsy();
  });

  it('Esc で取消', () => {
    const d = setup();
    const ta = openSection(0);
    ta.value = 'x';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(d.getState().sectionEdit).toBeFalsy();
    expect(bodyOf(d)).toBe(BODY);
  });
});

describe('章フォーカス編集 state lifecycle', () => {
  it('別 entry へ移動すると sectionEdit は解除される', () => {
    const d = setup();
    openSection(0);
    expect(d.getState().sectionEdit).toBeTruthy();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    expect(d.getState().sectionEdit).toBeFalsy();
  });

  it('full edit(BEGIN_EDIT)へ移ると sectionEdit は解除される', () => {
    const d = setup();
    openSection(0);
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    expect(d.getState().sectionEdit).toBeFalsy();
  });
});
