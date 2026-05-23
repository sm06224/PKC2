// Editor footer wordcount(MASTER.md §7 text、pgc-125 wave-δ #1)。
//
// `shell.editor_footer_wordcount_enabled` flag ON 時に renderer から call。
// text / textlog 編集中の editor 末尾に compact metrics row を append:
//
//   📊  N chars · M words · L lines
//
// Inspector Style tab(pgc-118)が meta pane で読み取り専用 metrics を見せる
// のに対し、本 footer は **editor 内で完結する目線移動最小の動線** ──
// Notion / Bear / Typora 流の wordcount footer。
//
// 注:本 PR は static render のみ(textarea 入力に追従しない)。live update
// は後続 PR で textarea input event を hook して実装。

import type { Entry } from '../../core/model/record';

export function buildEditorFooterWordcount(entry: Entry): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'pkc-editor-footer-wordcount';
  footer.setAttribute('data-pkc-region', 'editor-footer-wordcount');
  footer.setAttribute('aria-label', 'Editor metrics');

  const icon = document.createElement('span');
  icon.className = 'pkc-editor-footer-icon';
  icon.textContent = '📊';
  footer.appendChild(icon);

  const body = entry.body ?? '';
  const charCount = body.length;
  const lineCount = body === '' ? 0 : body.split('\n').length;
  const wordCount = body.trim() === '' ? 0 : body.trim().split(/\s+/).length;

  const metrics = document.createElement('span');
  metrics.className = 'pkc-editor-footer-metrics';
  metrics.setAttribute('data-pkc-char-count', String(charCount));
  metrics.setAttribute('data-pkc-word-count', String(wordCount));
  metrics.setAttribute('data-pkc-line-count', String(lineCount));
  metrics.textContent = `${charCount} chars · ${wordCount} words · ${lineCount} lines`;
  footer.appendChild(metrics);

  return footer;
}
