/**
 * AST debug overlay — PR-2JJ(2026-05-12 hotfix、PR #432 stack)。
 *
 * `?pkc-debug=ast` URL flag が有効なときに、currently selected entry の
 * body を parse した AST / Pandoc JSON を fixed-position panel で
 * 可視化し、clipboard へコピーできる導線を提供する。
 *
 * Phase 3 PR-2GG(#427)で `window.PKC.ast` JS API を公開したが、
 * DevTools を開かないと使えなかった件への UI helper。reform-2026-05
 * §6 「DevTools console を開かずに使える UI 補助」要件に対応。
 *
 * 上位規約:`docs/development/debug-via-url-flag-protocol.md`(URL flag による
 * feature ごとの debug 導線統一)。本 overlay は `data-pkc-debug="true"` を
 * 持ち、screenshot regression / production console から切り分け可能。
 *
 * 開閉:
 *   - `?pkc-debug=ast` URL flag → boot 時に install
 *   - × button → overlay を hide(URL flag を外せば次 boot で出ない)
 *   - dispatcher.onState で selected entry 変化を購読、自動 re-render
 */

import type { Dispatcher } from '../state/dispatcher';
import type { AppState } from '../state/app-state';
import { getAstApi } from '../public-ast-api';
import { isDebugEnabled } from '../../runtime/debug-flags';

type Format = 'ast' | 'pandoc' | 'html' | 'canonical';

let currentFormat: Format = 'ast';

/**
 * Boot path に install。`?pkc-debug=ast` が無ければ no-op。dispatcher の
 * state listener を登録、selected entry 変化を購読して overlay を更新する。
 */
export function mountAstDebugOverlay(dispatcher: Dispatcher): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!isDebugEnabled('ast') && !isDebugEnabled('*')) return;

  const overlay = createOverlay();
  document.body.appendChild(overlay);

  // 初期 render は、SYS_INIT_COMPLETE 後に届く state で自動的に走る。
  const unsubscribe = dispatcher.onState((state) => {
    refreshOverlay(overlay, state);
  });

  // overlay を user が × で閉じたとき unsubscribe する。
  overlay.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target) return;
    const action = target.getAttribute('data-pkc-action');
    if (action === 'close-ast-debug') {
      overlay.remove();
      unsubscribe();
    } else if (action === 'set-ast-format') {
      const fmt = target.getAttribute('data-pkc-format') as Format | null;
      if (fmt) {
        currentFormat = fmt;
        refreshOverlay(overlay, dispatcher.getState());
      }
    } else if (action === 'copy-ast') {
      void copyCurrentToClipboard(overlay, dispatcher.getState());
    }
  });
}

function createOverlay(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'pkc-ast-debug-overlay';
  root.setAttribute('data-pkc-region', 'ast-debug-overlay');
  root.setAttribute('data-pkc-debug', 'true');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'AST debug overlay');

  const header = document.createElement('header');
  header.className = 'pkc-ast-debug-header';
  const title = document.createElement('h3');
  title.className = 'pkc-ast-debug-title';
  title.textContent = '🐞 AST';
  header.appendChild(title);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pkc-ast-debug-close';
  close.setAttribute('data-pkc-action', 'close-ast-debug');
  close.setAttribute('aria-label', 'Close AST debug overlay');
  close.textContent = '✕';
  header.appendChild(close);
  root.appendChild(header);

  const actions = document.createElement('div');
  actions.className = 'pkc-ast-debug-actions';
  for (const [fmt, label] of [
    ['ast', 'AST'],
    ['canonical', 'Canonical'],
    ['pandoc', 'Pandoc'],
    ['html', 'HTML'],
  ] as const) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pkc-ast-debug-action';
    btn.setAttribute('data-pkc-action', 'set-ast-format');
    btn.setAttribute('data-pkc-format', fmt);
    btn.textContent = label;
    actions.appendChild(btn);
  }
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'pkc-ast-debug-action';
  copy.setAttribute('data-pkc-action', 'copy-ast');
  copy.textContent = '📋 Copy';
  actions.appendChild(copy);
  root.appendChild(actions);

  const body = document.createElement('pre');
  body.className = 'pkc-ast-debug-body';
  body.setAttribute('data-pkc-region', 'ast-debug-body');
  root.appendChild(body);

  const status = document.createElement('div');
  status.className = 'pkc-ast-debug-status';
  status.setAttribute('data-pkc-region', 'ast-debug-status');
  status.textContent = 'No entry selected';
  root.appendChild(status);

  return root;
}

function refreshOverlay(overlay: HTMLElement, state: AppState): void {
  const body = overlay.querySelector<HTMLElement>('[data-pkc-region="ast-debug-body"]');
  const status = overlay.querySelector<HTMLElement>('[data-pkc-region="ast-debug-status"]');
  if (!body || !status) return;

  const entry = findSelectedEntry(state);
  if (!entry) {
    body.textContent = '';
    status.textContent = 'No entry selected';
    return;
  }

  const sourceText = entryBodyAsText(entry.body);
  const truncated = sourceText.length > 200_000;
  const text = truncated ? sourceText.slice(0, 200_000) : sourceText;

  try {
    const api = getAstApi();
    const ast = api.parseMarkdown(text);
    let out: string;
    switch (currentFormat) {
      case 'ast':
        out = JSON.stringify(ast, null, 2);
        break;
      case 'canonical':
        out = JSON.stringify(api.canonicalize(ast), null, 2);
        break;
      case 'pandoc':
        out = JSON.stringify(api.toPandocJson(ast), null, 2);
        break;
      case 'html':
        out = api.renderHtml(ast);
        break;
    }
    body.textContent = out;
    status.textContent = `lid=${entry.lid} fmt=${currentFormat}` +
      (truncated ? ' (truncated to 200KB)' : '');
  } catch (e) {
    body.textContent = '';
    status.textContent = `Parse error: ${(e as Error).message ?? String(e)}`;
  }
}

function findSelectedEntry(state: AppState): { lid: string; body: unknown } | null {
  if (!state.container || !state.selectedLid) return null;
  const entry = state.container.entries.find((e) => e.lid === state.selectedLid);
  if (!entry) return null;
  return { lid: entry.lid, body: entry.body };
}

function entryBodyAsText(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body == null) return '';
  // Non-text archetypes(todo / form / attachment / folder)は JSON 文字列。
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

async function copyCurrentToClipboard(overlay: HTMLElement, state: AppState): Promise<void> {
  const body = overlay.querySelector<HTMLElement>('[data-pkc-region="ast-debug-body"]');
  const status = overlay.querySelector<HTMLElement>('[data-pkc-region="ast-debug-status"]');
  if (!body || !status) return;
  const text = body.textContent ?? '';
  if (!text) {
    status.textContent = 'Nothing to copy';
    return;
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      status.textContent = `Copied ${text.length} chars (fmt=${currentFormat})`;
    } else {
      throw new Error('clipboard API unavailable');
    }
  } catch (e) {
    status.textContent = `Copy failed: ${(e as Error).message ?? String(e)}`;
  }
  // unused param suppression
  void state;
}
