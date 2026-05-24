// Inspector AI tab content(MASTER.md §6.3、pgc-147 wave-γ #24)。
//
// pgc-109 で scaffold した Inspector の AI tab(placeholder "Coming soon"
// のみ)を **local-only suggestion panel** に置換 ── pgc-145 で起こした
// `inspector-ai-tab-roadmap-2026-05.md` §3 Phase 1 の A 群 1(frontmatter
// suggestion)を着地。
//
// pure features 層の `frontmatter-suggester` を呼んで提案を取得、
// 各 proposal に apply / dismiss button を出す。LLM 接続なし、
// browser API は本 adapter 側のみ。
//
// flag `shell.inspector_ai_local_enabled` ON 時に renderer.ts から
// 本 helper を call、`data-pkc-region="inspector-ai-suggestions"` で
// meta-pane-inspector の visibleRegions に組込む。

import type { Entry } from '../../core/model/record';
import type { Container } from '../../core/model/container';
import {
  suggestFrontmatter,
  type FrontmatterSuggestion,
} from '../../features/ai/frontmatter-suggester';
import {
  detectAbandonedWarning,
  type AbandonedWarning,
} from '../../features/ai/abandoned-warning';

// dismiss 状態は module-local。reload で消える(localStorage 化は後続 PR、
// privacy 観点で session 限定の方が安全)。`<lid>:<suggestion-id>` を key
// に持って、entry を跨いで suppress が混ざらないようにする。
const dismissedSuggestions = new Set<string>();

export function resetInspectorAiState(): void {
  dismissedSuggestions.clear();
}

export function dismissSuggestion(lid: string, suggestionId: string): void {
  dismissedSuggestions.add(`${lid}:${suggestionId}`);
}

export function isSuggestionDismissed(lid: string, suggestionId: string): boolean {
  return dismissedSuggestions.has(`${lid}:${suggestionId}`);
}

export function buildInspectorAiSection(
  entry: Entry,
  container?: Container | null,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'pkc-inspector-ai';
  section.setAttribute('data-pkc-region', 'inspector-ai-suggestions');

  const heading = document.createElement('div');
  heading.className = 'pkc-inspector-ai-heading';
  heading.textContent = '🧠 AI 提案(local-only)';
  section.appendChild(heading);

  const note = document.createElement('div');
  note.className = 'pkc-inspector-ai-note';
  note.textContent
    = '本文から推測した frontmatter 候補 + 使われていない entry 警告です。LLM 接続なし、計算は端末内のみ。';
  section.appendChild(note);

  // pgc-148:abandoned entry warning(roadmap §2.2 A 群 4)。container
  // 渡されたときのみ判定、updated_at が古く + relation 0 + link reference
  // 0 件の entry に「使われていない候補」 warning を表示。dismiss のみ
  // 提供(archive は archetype 別で複雑、後続 PR)。
  const warning
    = container && !isSuggestionDismissed(entry.lid, `abandoned:${entry.lid}`)
      ? detectAbandonedWarning(entry, container)
      : null;
  if (warning) {
    section.appendChild(renderAbandonedWarning(entry.lid, warning));
  }

  const raw = suggestFrontmatter(entry);
  const suggestions = raw.filter((s) => !isSuggestionDismissed(entry.lid, s.id));

  if (suggestions.length === 0 && !warning) {
    const empty = document.createElement('div');
    empty.className = 'pkc-inspector-ai-empty';
    empty.textContent = raw.length === 0
      ? '提案できる項目はありません(本文に H1 / #tag を加えるか、frontmatter を埋めると候補が出ます)'
      : 'すべての提案を dismiss しました(Inspector AI を閉じて再表示で復帰)';
    section.appendChild(empty);
    return section;
  }

  if (suggestions.length > 0) {
    const list = document.createElement('ul');
    list.className = 'pkc-inspector-ai-list';
    for (const s of suggestions) {
      list.appendChild(renderSuggestion(entry.lid, s));
    }
    section.appendChild(list);
  }

  return section;
}

function renderAbandonedWarning(lid: string, w: AbandonedWarning): HTMLElement {
  const div = document.createElement('div');
  div.className = 'pkc-inspector-ai-warning';
  div.setAttribute('data-pkc-warning-kind', 'abandoned');
  div.setAttribute('data-pkc-suggestion-id', w.id);

  const header = document.createElement('div');
  header.className = 'pkc-inspector-ai-warning-header';
  const icon = document.createElement('span');
  icon.className = 'pkc-inspector-ai-warning-icon';
  icon.textContent = '⚠️';
  header.appendChild(icon);
  const title = document.createElement('span');
  title.className = 'pkc-inspector-ai-warning-title';
  title.textContent = 'Abandoned entry';
  header.appendChild(title);
  div.appendChild(header);

  const detail = document.createElement('div');
  detail.className = 'pkc-inspector-ai-warning-detail';
  detail.textContent = w.reason;
  div.appendChild(detail);

  const dismiss = document.createElement('button');
  dismiss.className = 'pkc-inspector-ai-dismiss';
  dismiss.setAttribute('data-pkc-action', 'dismiss-ai-suggestion');
  dismiss.setAttribute('data-pkc-suggestion-id', w.id);
  dismiss.setAttribute('data-pkc-suggestion-lid', lid);
  dismiss.textContent = 'Dismiss';
  dismiss.title = 'この警告を当面非表示にします(reload で復帰)';
  div.appendChild(dismiss);

  return div;
}

function renderSuggestion(lid: string, s: FrontmatterSuggestion): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'pkc-inspector-ai-suggestion';
  li.setAttribute('data-pkc-suggestion-id', s.id);
  li.setAttribute('data-pkc-confidence', s.confidence);

  const header = document.createElement('div');
  header.className = 'pkc-inspector-ai-suggestion-header';
  const keyChip = document.createElement('span');
  keyChip.className = 'pkc-inspector-ai-key';
  keyChip.textContent = s.key;
  header.appendChild(keyChip);
  const confChip = document.createElement('span');
  confChip.className = 'pkc-inspector-ai-confidence';
  confChip.setAttribute('data-pkc-confidence-level', s.confidence);
  confChip.textContent = confidenceLabel(s.confidence);
  header.appendChild(confChip);
  li.appendChild(header);

  const value = document.createElement('div');
  value.className = 'pkc-inspector-ai-value';
  value.textContent = Array.isArray(s.value) ? s.value.map((v) => `#${v}`).join(' ') : s.value;
  li.appendChild(value);

  const reason = document.createElement('div');
  reason.className = 'pkc-inspector-ai-reason';
  reason.textContent = s.reason;
  li.appendChild(reason);

  const actions = document.createElement('div');
  actions.className = 'pkc-inspector-ai-actions';

  const applyBtn = document.createElement('button');
  applyBtn.className = 'pkc-inspector-ai-apply';
  applyBtn.setAttribute('data-pkc-action', 'apply-ai-suggestion');
  applyBtn.setAttribute('data-pkc-suggestion-id', s.id);
  applyBtn.setAttribute('data-pkc-suggestion-key', s.key);
  applyBtn.setAttribute(
    'data-pkc-suggestion-value',
    Array.isArray(s.value) ? s.value.join(',') : s.value,
  );
  applyBtn.setAttribute('data-pkc-suggestion-kind', Array.isArray(s.value) ? 'array' : 'scalar');
  applyBtn.setAttribute('data-pkc-suggestion-lid', lid);
  applyBtn.textContent = 'Apply';
  applyBtn.title = `${s.key} を frontmatter に書き込みます`;
  actions.appendChild(applyBtn);

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'pkc-inspector-ai-dismiss';
  dismissBtn.setAttribute('data-pkc-action', 'dismiss-ai-suggestion');
  dismissBtn.setAttribute('data-pkc-suggestion-id', s.id);
  dismissBtn.setAttribute('data-pkc-suggestion-lid', lid);
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.title = 'この提案を当面非表示にします(reload で復帰)';
  actions.appendChild(dismissBtn);

  li.appendChild(actions);
  return li;
}

function confidenceLabel(c: FrontmatterSuggestion['confidence']): string {
  switch (c) {
    case 'high': return '★★★';
    case 'medium': return '★★';
    case 'low': return '★';
  }
}
