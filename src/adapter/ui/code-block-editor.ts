/**
 * コードブロックのその場編集 — code-edit-lite-design-2026-07 §4
 * (user 裁定 2026-07-25、S1 限定)。
 *
 * S1 center pane の code block に ✎ を後注入(adapter 層 DOM 注入 —
 * features 層 markup に足すと S2/S4 で死にボタンになるため。設計 §1)。
 * click は action-binder 経由で本 module のダイアログを開く。
 *
 * シードは entry body **原文**の行 slice(fence-edit.ts)。保存は
 * `QUICK_UPDATE_ENTRY`(ready 限定・revision snapshot 付き = undo 可能)。
 * 開いてから保存までに本文が変わっていたら中止する(stale guard —
 * 黙って上書きしない)。
 */

import type { Dispatcher } from '../state/dispatcher';
import { mountCodeEditLite } from './code-edit-lite';
import { showToast } from './toast';
import { parseFrontmatter } from '../../features/markdown/frontmatter';
import { parseRenderableFence } from '../../features/markdown/markdown-render';
import {
  sliceFenceAt,
  replaceFenceInner,
  frontmatterLineOffset,
  type FenceSlice,
} from '../../features/markdown/fence-edit';

const REGION = 'code-block-editor';
const EDIT_BTN_CLASS = 'pkc-md-edit-btn';

/**
 * S1 center pane の post-render enhance: source-line を持つ code block に
 * ✎ ボタンを注入する(冪等)。markdown table(kind=table)は対象外。
 * readonly 時の非表示は CSS(`#pkc-root[data-pkc-readonly="true"]`)側。
 */
export function injectCodeBlockEditButtons(root: HTMLElement): void {
  const blocks = root.querySelectorAll<HTMLElement>(
    '.pkc-md-block[data-pkc-md-block-kind="code"][data-pkc-source-line]',
  );
  for (const block of blocks) {
    if (block.querySelector(`:scope > .${EDIT_BTN_CLASS}`)) continue;
    const doc = block.ownerDocument ?? document;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = `pkc-md-copy-btn ${EDIT_BTN_CLASS}`;
    btn.setAttribute('data-pkc-action', 'edit-code-block');
    btn.setAttribute('aria-label', '編集');
    btn.title = 'このコードブロックを編集';
    btn.textContent = '✎';
    const copy = block.querySelector(':scope > .pkc-md-copy-btn');
    if (copy) copy.after(btn);
    else block.prepend(btn);
  }
}

/** fence info から編集用の言語を推定(標準規約 suffix は base lang に落とす)。 */
function langForEdit(info: string): string {
  const parsed = parseRenderableFence(info);
  if (parsed) return parsed.lang;
  return info.split(/\s+/)[0] ?? '';
}

/**
 * ✎ click 起点でダイアログを開く。前提が崩れている場合(選択 entry 不明 /
 * text 以外 / 行情報なし / fence を特定できない)は toast で中止する。
 */
export function openCodeBlockEditor(dispatcher: Dispatcher, blockEl: HTMLElement): void {
  const st = dispatcher.getState();
  if (st.phase !== 'ready') {
    showToast({ message: '編集モード中はコードブロック編集を使えません(本文エディタで直接編集してください)', kind: 'warn' });
    return;
  }
  const lid = st.selectedLid;
  const entry = lid ? st.container?.entries.find((e) => e.lid === lid) : undefined;
  if (!entry || entry.archetype !== 'text') {
    showToast({ message: 'この表示ではコードブロック編集を使えません', kind: 'warn' });
    return;
  }
  const lineAttr = blockEl.getAttribute('data-pkc-source-line');
  const endAttr = blockEl.getAttribute('data-pkc-source-end');
  if (lineAttr === null || endAttr === null) {
    showToast({ message: 'このブロックは行情報が無いため編集できません', kind: 'warn' });
    return;
  }
  // anchor 行は frontmatter strip 済み基準 → 全文行へ換算(既存前例:
  // modifier+click 編集の action-binder 換算と同じ)。
  const fm = frontmatterLineOffset(entry.body, parseFrontmatter(entry.body).body);
  const blockStart = parseInt(lineAttr, 10) + fm;
  const blockEndEx = parseInt(endAttr, 10) + fm;
  const slice = sliceFenceAt(entry.body, blockStart, blockEndEx);
  if (!slice) {
    showToast({ message: 'コードブロックを本文から特定できませんでした', kind: 'error' });
    return;
  }

  document.querySelector(`[data-pkc-region="${REGION}"]`)?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'pkc-flags-json-overlay pkc-code-block-edit-overlay';
  overlay.setAttribute('data-pkc-region', REGION);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'コードブロック編集');

  const card = document.createElement('div');
  card.className = 'pkc-flags-json-card';
  const heading = document.createElement('div');
  heading.className = 'pkc-flags-json-heading';
  heading.textContent = `✎ コードブロック編集(\`\`\`${slice.info || 'plain'} ・ ${blockStart + 1}〜${blockEndEx} 行)`;
  card.appendChild(heading);

  const close = (): void => overlay.remove();

  mountCodeEditLite(card, {
    value: slice.inner,
    lang: langForEdit(slice.info),
    commitLabel: '保存',
    onCommit: (text) => {
      commitFenceEdit(dispatcher, lid!, blockStart, blockEndEx, slice, text);
      close();
    },
    onCancel: close,
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  overlay.querySelector<HTMLTextAreaElement>('.pkc-code-edit-input')?.focus();
}

function commitFenceEdit(
  dispatcher: Dispatcher,
  lid: string,
  blockStart: number,
  blockEndEx: number,
  opened: FenceSlice,
  text: string,
): void {
  const st = dispatcher.getState();
  const entry = st.container?.entries.find((e) => e.lid === lid);
  if (!entry || st.phase !== 'ready') {
    showToast({ message: '保存できませんでした(対象が見つからないか、編集モード中です)', kind: 'error' });
    return;
  }
  // stale guard: 開いた時点と同じ fence がまだそこにあるか。
  const cur = sliceFenceAt(entry.body, blockStart, blockEndEx);
  if (!cur || cur.inner !== opened.inner || cur.info !== opened.info) {
    showToast({ message: '本文が変更されていたため保存を中止しました(ブロックを開き直してください)', kind: 'error' });
    return;
  }
  const newBody = replaceFenceInner(entry.body, cur, text);
  dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: newBody });
  showToast({ message: 'コードブロックを保存しました(履歴に 1 版追加)', kind: 'info' });
}
