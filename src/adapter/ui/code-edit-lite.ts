/**
 * CodeEditLite — 依存ゼロの軽量コードエディタ部品
 * (code-edit-lite-design-2026-07 §2、user 裁定 2026-07-25)。
 *
 * 素の `<textarea>`(文字色 transparent + caret のみ)の背面に、既存
 * `code-highlight.ts` で色付けした `<pre><code>` を重ねる overlay 方式。
 * contenteditable は不採用(PKC1 で layout 崩壊により放棄した記録、
 * 設計 doc §1)。編集支援は features 層の純関数
 * (`features/editor/code-edit-helpers.ts`)に委譲し、本 module は
 * patch 適用(undo 保持の minimal splice)と DOM 配線だけを持つ。
 *
 * **Host 契約**(将来の Loop 的コンポーネント編集基盤への布石):
 * 呼び出し元(flags JSON 面 / fence その場編集 / テキスト添付編集 / 将来の
 * ブロック)は `CodeEditHost` を渡すだけで同じ編集体験を得る。書き戻しは
 * host の `onCommit` 責務(本 module は dispatcher / AppState に触れない)。
 *
 * cross-document 安全: 要素生成は `container.ownerDocument` 経由
 * (mermaid hydrator と同じ規約)。ただし click 配線は本 module が直接
 * addEventListener するため、action-binder の無い独立 document でも動く。
 */

import { highlightCode } from '../../features/markdown/code-highlight';
import {
  codeEditKeyPatch,
  wrapSelectionWithTagPatch,
  isMarkupLang,
  type CodeEditPatch,
} from '../../features/editor/code-edit-helpers';

export interface CodeEditError {
  /** 1-origin 行番号。行が特定できないエラーは null。 */
  readonly line: number | null;
  readonly message: string;
}

export interface CodeEditHost {
  /** シード値(呼び出し元が原文から用意する。DOM から拾わない — 設計 §1) */
  readonly value: string;
  /** highlight / 編集支援の言語(json / yaml / js / html / xml / css …) */
  readonly lang: string;
  /** 行番号つき検証。エラーが 1 件でもあると保存不可。省略時は常に valid */
  readonly validate?: (value: string) => CodeEditError[];
  readonly onCommit: (value: string) => void;
  readonly onCancel: () => void;
  /** 保存ボタンの label(既定「保存」) */
  readonly commitLabel?: string;
}

export interface CodeEditLiteHandle {
  readonly root: HTMLElement;
  readonly textarea: HTMLTextAreaElement;
  getValue(): string;
  /** 現在値の validate を再実行(host 側の外部要因変化用) */
  revalidate(): void;
  destroy(): void;
}

/** undo 履歴を保つ minimal splice(editor-key-helpers.applyMinimalEdit と同型)。 */
function applyPatch(ta: HTMLTextAreaElement, patch: CodeEditPatch): void {
  const old = ta.value;
  const next = patch.value;
  if (old !== next) {
    const minLen = Math.min(old.length, next.length);
    let p = 0;
    while (p < minLen && old.charCodeAt(p) === next.charCodeAt(p)) p++;
    let s = 0;
    while (
      s < minLen - p &&
      old.charCodeAt(old.length - 1 - s) === next.charCodeAt(next.length - 1 - s)
    ) {
      s++;
    }
    if (typeof ta.setRangeText === 'function') {
      ta.setRangeText(next.slice(p, next.length - s), p, old.length - s, 'preserve');
    } else {
      ta.value = next;
    }
  }
  ta.selectionStart = patch.selStart;
  ta.selectionEnd = patch.selEnd;
  // setRangeText は input を発火しない — overlay / validate 購読者へ通知
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

export function mountCodeEditLite(
  container: HTMLElement,
  host: CodeEditHost,
): CodeEditLiteHandle {
  const doc = container.ownerDocument ?? document;
  const el = (tag: string, className: string): HTMLElement => {
    const n = doc.createElement(tag);
    n.className = className;
    return n;
  };

  const root = el('div', 'pkc-code-edit');
  root.setAttribute('data-pkc-region', 'code-edit-lite');
  root.setAttribute('data-pkc-lang', host.lang);

  // ── 編集面(overlay)──
  const surface = el('div', 'pkc-code-edit-surface');
  const pre = el('pre', 'pkc-code-edit-highlight') as HTMLPreElement;
  pre.setAttribute('aria-hidden', 'true');
  const code = el('code', `language-${host.lang}`);
  pre.appendChild(code);
  const ta = doc.createElement('textarea') as HTMLTextAreaElement;
  ta.className = 'pkc-code-edit-input';
  ta.setAttribute('data-pkc-field', 'code-edit');
  ta.setAttribute('wrap', 'off'); // overlay と行が一致するよう soft wrap 禁止
  ta.spellcheck = false;
  ta.value = host.value;
  surface.appendChild(pre);
  surface.appendChild(ta);
  root.appendChild(surface);

  // ── エラー表示 ──
  const errorsBox = el('div', 'pkc-code-edit-errors');
  errorsBox.setAttribute('data-pkc-region', 'code-edit-errors');
  root.appendChild(errorsBox);

  // ── アクション行 ──
  const actions = el('div', 'pkc-code-edit-actions');
  let wrapInput: HTMLInputElement | null = null;
  if (isMarkupLang(host.lang)) {
    wrapInput = doc.createElement('input') as HTMLInputElement;
    wrapInput.type = 'text';
    wrapInput.className = 'pkc-code-edit-wrap-tag-name';
    wrapInput.value = 'div';
    wrapInput.setAttribute('aria-label', '囲むタグ名');
    wrapInput.title = '選択範囲を囲むタグ名';
    const wrapBtn = el('button', 'pkc-btn-small') as HTMLButtonElement;
    wrapBtn.type = 'button';
    wrapBtn.setAttribute('data-pkc-action', 'code-edit-wrap-tag');
    wrapBtn.textContent = '</> 囲む';
    wrapBtn.title = '選択範囲をタグで囲む(Alt+Shift+W)';
    wrapBtn.addEventListener('click', () => applyWrap());
    actions.appendChild(wrapInput);
    actions.appendChild(wrapBtn);
  }
  const spacer = el('span', 'pkc-code-edit-actions-spacer');
  actions.appendChild(spacer);
  const commitBtn = el('button', 'pkc-btn pkc-btn-create') as HTMLButtonElement;
  commitBtn.type = 'button';
  commitBtn.setAttribute('data-pkc-action', 'code-edit-commit');
  commitBtn.textContent = host.commitLabel ?? '保存';
  commitBtn.title = '保存(Ctrl+Enter)';
  const cancelBtn = el('button', 'pkc-btn-small') as HTMLButtonElement;
  cancelBtn.type = 'button';
  cancelBtn.setAttribute('data-pkc-action', 'code-edit-cancel');
  cancelBtn.textContent = 'キャンセル';
  cancelBtn.title = 'キャンセル(Esc)';
  actions.appendChild(commitBtn);
  actions.appendChild(cancelBtn);
  root.appendChild(actions);

  // ── 配線 ──
  const syncHighlight = (): void => {
    // 末尾に改行を足して最終空行の高さを overlay 側でも確保する
    code.innerHTML = highlightCode(ta.value + '\n', host.lang);
  };
  const renderErrors = (errors: CodeEditError[]): void => {
    errorsBox.textContent = '';
    for (const err of errors) {
      const row = el('div', 'pkc-code-edit-error');
      row.setAttribute('role', 'alert');
      row.textContent = err.line !== null ? `行 ${err.line}: ${err.message}` : err.message;
      errorsBox.appendChild(row);
    }
    errorsBox.style.display = errors.length ? '' : 'none';
  };
  const runValidate = (): void => {
    const errors = host.validate?.(ta.value) ?? [];
    renderErrors(errors);
    commitBtn.disabled = errors.length > 0;
  };
  const applyWrap = (): void => {
    const patch = wrapSelectionWithTagPatch(
      ta.value,
      ta.selectionStart ?? 0,
      ta.selectionEnd ?? 0,
      wrapInput?.value ?? 'div',
    );
    if (patch) {
      applyPatch(ta, patch);
      ta.focus();
    }
  };

  ta.addEventListener('input', () => {
    syncHighlight();
    runValidate();
  });
  ta.addEventListener('scroll', () => {
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  });
  ta.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.isComposing) return; // IME ガード(repo 慣行)
    if (e.key === 'Escape') {
      e.preventDefault();
      host.onCancel();
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!commitBtn.disabled) host.onCommit(ta.value);
      return;
    }
    if (e.altKey && e.shiftKey && (e.key === 'W' || e.key === 'w')) {
      if (isMarkupLang(host.lang)) {
        e.preventDefault();
        applyWrap();
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const patch = codeEditKeyPatch(
      ta.value,
      ta.selectionStart ?? 0,
      ta.selectionEnd ?? 0,
      e.key,
      e.shiftKey,
      host.lang,
    );
    if (patch) {
      e.preventDefault();
      applyPatch(ta, patch);
    }
  });
  commitBtn.addEventListener('click', () => {
    if (!commitBtn.disabled) host.onCommit(ta.value);
  });
  cancelBtn.addEventListener('click', () => host.onCancel());

  syncHighlight();
  runValidate();
  container.appendChild(root);

  return {
    root,
    textarea: ta,
    getValue: () => ta.value,
    revalidate: runValidate,
    destroy: () => root.remove(),
  };
}
