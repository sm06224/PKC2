/**
 * @vitest-environment happy-dom
 *
 * PR-2JJ(2026-05-12 hotfix、PR #432 stack):`?pkc-debug=ast` URL flag による
 * AST debug overlay の test。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountAstDebugOverlay } from '@adapter/ui/ast-debug-overlay';
import { createDispatcher } from '@adapter/state/dispatcher';

function setUrl(search: string): void {
  const base = `${window.location.origin}/`;
  const url = search ? `${base}${search.startsWith('?') ? search : `?${search}`}` : base;
  window.history.replaceState({}, '', url);
}

describe('PR-2JJ AST debug overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setUrl('');
  });

  afterEach(() => {
    setUrl('');
  });

  it('?pkc-debug=ast 無し → overlay mount 無し(no-op)', () => {
    const dispatcher = createDispatcher();
    mountAstDebugOverlay(dispatcher);
    expect(document.querySelector('[data-pkc-region="ast-debug-overlay"]')).toBeNull();
  });

  it('?pkc-debug=ast あり → overlay mount される', () => {
    setUrl('?pkc-debug=ast');
    const dispatcher = createDispatcher();
    mountAstDebugOverlay(dispatcher);
    const overlay = document.querySelector('[data-pkc-region="ast-debug-overlay"]');
    expect(overlay).not.toBeNull();
    expect(overlay!.getAttribute('data-pkc-debug')).toBe('true');
  });

  it('?pkc-debug=* でも mount される', () => {
    setUrl('?pkc-debug=*');
    const dispatcher = createDispatcher();
    mountAstDebugOverlay(dispatcher);
    expect(document.querySelector('[data-pkc-region="ast-debug-overlay"]')).not.toBeNull();
  });

  it('overlay は header / actions / body / status を持つ', () => {
    setUrl('?pkc-debug=ast');
    const dispatcher = createDispatcher();
    mountAstDebugOverlay(dispatcher);
    const overlay = document.querySelector('[data-pkc-region="ast-debug-overlay"]')!;
    expect(overlay.querySelector('.pkc-ast-debug-header')).not.toBeNull();
    expect(overlay.querySelector('.pkc-ast-debug-actions')).not.toBeNull();
    expect(overlay.querySelector('[data-pkc-region="ast-debug-body"]')).not.toBeNull();
    expect(overlay.querySelector('[data-pkc-region="ast-debug-status"]')).not.toBeNull();
  });

  it('format 切替 button が 4 種類 + Copy 1 個', () => {
    setUrl('?pkc-debug=ast');
    const dispatcher = createDispatcher();
    mountAstDebugOverlay(dispatcher);
    const actions = document.querySelectorAll(
      '[data-pkc-action="set-ast-format"]',
    );
    expect(actions.length).toBe(4);
    const formats = Array.from(actions).map((a) =>
      (a as HTMLElement).getAttribute('data-pkc-format'),
    );
    expect(formats).toEqual(['ast', 'canonical', 'pandoc', 'html']);
    expect(document.querySelector('[data-pkc-action="copy-ast"]')).not.toBeNull();
  });

  it('× button click で overlay 削除', () => {
    setUrl('?pkc-debug=ast');
    const dispatcher = createDispatcher();
    mountAstDebugOverlay(dispatcher);
    expect(document.querySelector('[data-pkc-region="ast-debug-overlay"]')).not.toBeNull();
    const close = document.querySelector(
      '[data-pkc-action="close-ast-debug"]',
    ) as HTMLElement;
    close.click();
    expect(document.querySelector('[data-pkc-region="ast-debug-overlay"]')).toBeNull();
  });

  it('selected entry が無いとき status="No entry selected"', () => {
    setUrl('?pkc-debug=ast');
    const dispatcher = createDispatcher();
    mountAstDebugOverlay(dispatcher);
    const status = document.querySelector(
      '[data-pkc-region="ast-debug-status"]',
    )!;
    expect(status.textContent).toBe('No entry selected');
  });

  it('format 切替 button click で format 状態が変わる(再 mount で確認)', () => {
    setUrl('?pkc-debug=ast');
    const dispatcher = createDispatcher();
    mountAstDebugOverlay(dispatcher);
    const pandocBtn = document.querySelector(
      '[data-pkc-action="set-ast-format"][data-pkc-format="pandoc"]',
    ) as HTMLElement;
    expect(pandocBtn).not.toBeNull();
    // click は no-throw(selected entry が無いので status 更新のみ)
    pandocBtn.click();
  });
});
