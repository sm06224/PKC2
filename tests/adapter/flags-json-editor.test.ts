/** @vitest-environment happy-dom */
/**
 * flags JSON 一括編集ダイアログ(flags-json-editor.ts)の contract。
 * 開閉 / seed / validate 連動 / SET_FLAG・RESET_FLAG diff 適用。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { defineFlag, __resetRegistry } from '@core/flags';
import { __resetUrlCache } from '@adapter/flags';
import { openFlagsJsonEditor } from '@adapter/ui/flags-json-editor';
import { createDispatcher } from '@adapter/state/dispatcher';
import { resolveFlagsPayload } from '@core/model/system-flags-payload';
import type { Container } from '@core/model/container';

const T = '2026-07-25T00:00:00Z';

function makeContainer(flagsBody?: string): Container {
  const entries = [];
  if (flagsBody !== undefined) {
    entries.push({
      lid: '__flags__',
      title: 'Flags',
      body: flagsBody,
      archetype: 'opaque' as const,
      created_at: T,
      updated_at: T,
    });
  }
  return {
    meta: { container_id: 'c-fje', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  } as unknown as Container;
}

function flagsBody(values: Record<string, number | string | boolean>): string {
  return JSON.stringify({ format: 'pkc2-system-flags', version: 1, values });
}

function overlay(): HTMLElement | null {
  return document.querySelector('[data-pkc-region="flags-json-editor"]');
}

function ta(): HTMLTextAreaElement {
  return overlay()!.querySelector<HTMLTextAreaElement>('.pkc-code-edit-input')!;
}

function setText(v: string): void {
  const t = ta();
  t.value = v;
  t.dispatchEvent(new Event('input', { bubbles: true }));
}

function commitBtn(): HTMLButtonElement {
  return overlay()!.querySelector<HTMLButtonElement>('[data-pkc-action="code-edit-commit"]')!;
}

beforeEach(() => {
  document.body.innerHTML = '';
  __resetRegistry();
  __resetUrlCache();
  defineFlag<boolean>('t.bool', false, { category: 'test' });
  defineFlag<number>('t.num', 10, { category: 'test', range: [1, 60] });
});

describe('flags JSON 一括編集ダイアログ', () => {
  it('open: container の values が sort 済み pretty JSON で seed される', () => {
    const d = createDispatcher();
    d.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: makeContainer(flagsBody({ 't.num': 20, 't.bool': true })),
    });
    openFlagsJsonEditor(d);
    expect(overlay()).not.toBeNull();
    expect(ta().value).toBe('{\n  "t.bool": true,\n  "t.num": 20\n}\n');
  });

  it('適用: 差分だけ SET_FLAG / RESET_FLAG され、__flags__ に反映・overlay が閉じる', () => {
    const d = createDispatcher();
    d.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: makeContainer(flagsBody({ 't.bool': true, 't.num': 20 })),
    });
    openFlagsJsonEditor(d);
    // t.bool を消し(= 既定へ戻す)、t.num を変更
    setText('{ "t.num": 30 }');
    expect(commitBtn().disabled).toBe(false);
    commitBtn().click();

    const body = d.getState().container!.entries.find((e) => e.lid === '__flags__')!.body;
    expect(resolveFlagsPayload(body).values).toEqual({ 't.num': 30 });
    expect(overlay()).toBeNull();
  });

  it('__flags__ が無い container でも空 {} から編集を始められる', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    openFlagsJsonEditor(d);
    expect(ta().value).toBe('{}\n');
    setText('{ "t.bool": true }');
    commitBtn().click();
    const body = d.getState().container!.entries.find((e) => e.lid === '__flags__')!.body;
    expect(resolveFlagsPayload(body).values).toEqual({ 't.bool': true });
  });

  it('不正 JSON / 範囲外は適用不可、未知 key は warning で適用可', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    openFlagsJsonEditor(d);
    setText('{ broken');
    expect(commitBtn().disabled).toBe(true);
    setText('{ "t.num": 999 }');
    expect(commitBtn().disabled).toBe(true);
    setText('{ "gone.flag": 1 }');
    expect(commitBtn().disabled).toBe(false);
    const warn = overlay()!.querySelector('.pkc-code-edit-error--warning');
    expect(warn?.textContent).toContain('gone.flag');
  });

  it('キャンセル / backdrop click で何も dispatch せず閉じる', () => {
    const d = createDispatcher();
    d.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: makeContainer(flagsBody({ 't.bool': true })),
    });
    openFlagsJsonEditor(d);
    setText('{ }');
    overlay()!
      .querySelector<HTMLButtonElement>('[data-pkc-action="code-edit-cancel"]')!
      .click();
    expect(overlay()).toBeNull();
    const body = d.getState().container!.entries.find((e) => e.lid === '__flags__')!.body;
    expect(resolveFlagsPayload(body).values).toEqual({ 't.bool': true });

    openFlagsJsonEditor(d);
    overlay()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay()).toBeNull();
  });

  it('冪等: 二重 open は張り替え(overlay は常に 1 つ)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    openFlagsJsonEditor(d);
    openFlagsJsonEditor(d);
    expect(document.querySelectorAll('[data-pkc-region="flags-json-editor"]')).toHaveLength(1);
  });
});
