/**
 * #905(user 要望 2026-07-12)— 構成コマンド適用 modal。
 *
 * ワークフロー(v1、手動ラウンドトリップ):
 *   「📋 現在の構成をコピー」→ AI に貼って整理プランを依頼 → 返ってきた
 *   コマンド列(mv / mkdir / rename)を textarea に貼る → **dry-run プレビュー**
 *   を確認 → 適用(APPLY_STRUCTURE_OPS を 1 dispatch)。
 *
 * 実装形態:context-menu と同じ **imperative overlay**(renderer 経由の
 * state-driven ではない)。palette command から open、close で全 listener ごと
 * DOM を破棄する自己完結型。plan(検証)は features/structure/structure-dsl の
 * pure function に委譲し、本 module は DOM 組み立てと配線のみ。
 */

import type { Dispatcher } from '../state/dispatcher';
import {
  exportStructureText,
  parseStructureCommands,
  planStructureOps,
} from '../../features/structure/structure-dsl';
import { showToast } from './toast';

const OVERLAY_REGION = 'structure-plan-overlay';

export function isStructurePlanModalOpen(): boolean {
  return document.querySelector(`[data-pkc-region="${OVERLAY_REGION}"]`) !== null;
}

export function closeStructurePlanModal(): void {
  document.querySelector(`[data-pkc-region="${OVERLAY_REGION}"]`)?.remove();
}

/** 現在の構成テキストを clipboard へ(palette「構成をコピー」からも使う)。 */
export function copyStructureExport(dispatcher: Dispatcher): boolean {
  const container = dispatcher.getState().container;
  if (!container) return false;
  const text = exportStructureText(container);
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {/* non-fatal */});
  }
  showToast({ message: '構成テキストをコピーしました(AI に貼って整理プランを依頼できます)', kind: 'info' });
  return true;
}

export function openStructurePlanModal(dispatcher: Dispatcher): void {
  if (isStructurePlanModalOpen()) return;
  const state = dispatcher.getState();
  if (!state.container || state.readonly) {
    showToast({ message: '構成コマンドは編集可能なコンテナでのみ使えます', kind: 'warn' });
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'pkc-structure-plan-overlay';
  overlay.setAttribute('data-pkc-region', OVERLAY_REGION);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', '構成コマンドの適用');

  const panel = document.createElement('div');
  panel.className = 'pkc-structure-plan-panel';
  panel.setAttribute('data-pkc-region', 'structure-plan-panel');

  const title = document.createElement('h2');
  title.className = 'pkc-structure-plan-title';
  title.textContent = '🗂 構成コマンドの適用(AI 整理プラン)';
  panel.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'pkc-structure-plan-hint';
  hint.textContent =
    '「構成をコピー」で現在のツリーを AI に渡し、返ってきたコマンド列(mv / mkdir / rename)を下に貼り付けてください。適用前に必ずプレビューで確認できます。';
  panel.appendChild(hint);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'pkc-structure-plan-copy';
  copyBtn.setAttribute('data-pkc-action', 'structure-plan-copy-export');
  copyBtn.textContent = '📋 現在の構成をコピー(AI 整理用)';
  copyBtn.addEventListener('click', () => { copyStructureExport(dispatcher); });
  panel.appendChild(copyBtn);

  const input = document.createElement('textarea');
  input.className = 'pkc-structure-plan-input';
  input.setAttribute('data-pkc-region', 'structure-plan-input');
  input.setAttribute('placeholder', '# 例:\nmkdir "アーカイブ" as @arc\nmv lid-123 @arc\nrename lid-456 "新しいタイトル"');
  input.rows = 8;
  panel.appendChild(input);

  const preview = document.createElement('div');
  preview.className = 'pkc-structure-plan-preview';
  preview.setAttribute('data-pkc-region', 'structure-plan-preview');
  panel.appendChild(preview);

  const btnRow = document.createElement('div');
  btnRow.className = 'pkc-structure-plan-buttons';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'pkc-structure-plan-cancel';
  cancelBtn.setAttribute('data-pkc-action', 'structure-plan-cancel');
  cancelBtn.textContent = 'キャンセル';
  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'pkc-structure-plan-apply';
  applyBtn.setAttribute('data-pkc-action', 'structure-plan-apply');
  applyBtn.textContent = '適用';
  applyBtn.disabled = true;
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(applyBtn);
  panel.appendChild(btnRow);

  overlay.appendChild(panel);

  /** 入力を parse + plan して preview を更新、適用可否を判定。 */
  const refresh = (): void => {
    const container = dispatcher.getState().container;
    preview.textContent = '';
    if (!container) { applyBtn.disabled = true; return; }
    const parsed = parseStructureCommands(input.value);
    const plan = planStructureOps(container, parsed.ops);
    const errors = [...parsed.errors, ...plan.errors];
    for (const err of errors) {
      const li = document.createElement('div');
      li.className = 'pkc-structure-plan-error';
      li.textContent = `⛔ ${err}`;
      preview.appendChild(li);
    }
    for (const line of plan.preview) {
      const li = document.createElement('div');
      li.className = 'pkc-structure-plan-line';
      li.textContent = line;
      preview.appendChild(li);
    }
    if (parsed.ops.length === 0 && errors.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pkc-structure-plan-empty';
      empty.textContent = '(コマンドを貼り付けるとここに適用内容のプレビューが出ます)';
      preview.appendChild(empty);
    }
    applyBtn.disabled = errors.length > 0 || parsed.ops.length === 0;
  };
  input.addEventListener('input', refresh);
  refresh();

  const close = (): void => {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  };
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKeydown);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(); // backdrop click
  });

  applyBtn.addEventListener('click', () => {
    const container = dispatcher.getState().container;
    if (!container) return;
    const parsed = parseStructureCommands(input.value);
    const plan = planStructureOps(container, parsed.ops);
    if (parsed.errors.length > 0 || plan.errors.length > 0 || parsed.ops.length === 0) return;
    dispatcher.dispatch({ type: 'APPLY_STRUCTURE_OPS', ops: parsed.ops });
    close();
    showToast({ message: `構成コマンドを適用しました(${parsed.ops.length} 件)`, kind: 'info' });
  });

  const root = document.querySelector<HTMLElement>('#pkc-root') ?? document.body;
  root.appendChild(overlay);
  input.focus();
}
