// Inspector Style tab content(MASTER.md §6.3、pgc-118 wave-γ #18)。
//
// pgc-109 で scaffold した Inspector の Style tab(placeholder のみ)に
// **読み取り専用 style metrics**(archetype / 文字数 / 行数 / heading 数 /
// frontmatter style globals)を表示する section を入れる。
//
// 本格的な per-entry theme override(MASTER §6.3 Style tab の最終目標)は
// 後続 PR で。本 PR は user が「今 entry の構造 / size を一望できる」
// view-level metrics を入れて Style tab を機能化(Coming soon placeholder
// を脱却)。
//
// meta-pane-inspector.ts の Style tab `visibleRegions` に
// `inspector-style-metrics` を追加 + `renderMetaPaneImpl` 経路から本
// helper を call して flag ON 時に Style section を inject する。

import type { Entry } from '../../core/model/record';
import { extractHeadingsFromMarkdown } from '../../features/markdown/markdown-toc';
import { extractDocumentGlobals } from '../../features/markdown/document-globals';
import { parseTextlogBody } from '../../features/textlog/textlog-body';

export function buildInspectorStyleSection(entry: Entry): HTMLElement {
  const section = document.createElement('section');
  section.className = 'pkc-inspector-style';
  section.setAttribute('data-pkc-region', 'inspector-style-metrics');

  const heading = document.createElement('div');
  heading.className = 'pkc-inspector-style-heading';
  heading.textContent = '🎨 Style metrics';
  section.appendChild(heading);

  const dl = document.createElement('dl');
  dl.className = 'pkc-inspector-style-dl';

  // archetype + icon
  addRow(dl, 'Archetype', `${archetypeIcon(entry.archetype)} ${entry.archetype}`);

  // body metrics
  const body = entry.body ?? '';
  const titleLen = (entry.title ?? '').length;
  const bodyLen = body.length;
  const lineCount = body === '' ? 0 : body.split('\n').length;
  const wordCount = body.trim() === '' ? 0 : body.trim().split(/\s+/).length;

  addRow(dl, 'Title length', `${titleLen} chars`);
  addRow(dl, 'Body length', `${bodyLen} chars`);
  addRow(dl, 'Body lines', `${lineCount}`);
  addRow(dl, 'Body words', `${wordCount}`);

  // pgc-128 wave-δ #4(MASTER.md §7 textlog):textlog 専用 metrics ──
  // 全 log 件数 / 今日の log 件数 / 直近 log 時刻 / important flag 件数 を
  // 表示。markdown metrics(下)とは別 section にする(text と textlog の
  // 違いを user に明示)。
  if (entry.archetype === 'textlog') {
    try {
      const tl = parseTextlogBody(entry.body ?? '');
      const total = tl.entries.length;
      // 今日の log 件数(local timezone の今日)
      const today = formatLocalYmd(new Date());
      const todayCount = tl.entries.filter((e) => formatLocalYmd(new Date(e.createdAt)) === today).length;
      // 直近 log の時刻(createdAt 降順 sort せず、配列の最後を使う ──
      // 通常 append で末尾が最新だが、念のため max を取る)
      const latestIso = tl.entries.length === 0
        ? ''
        : tl.entries
            .map((e) => e.createdAt)
            .reduce((a, b) => (a > b ? a : b), '');
      const importantCount = tl.entries.filter((e) => e.flags.includes('important')).length;
      addRow(dl, 'Log entries', `${total} total`);
      addRow(dl, 'Today\'s logs', `${todayCount}`);
      addRow(dl, 'Latest log', latestIso ? formatIso(latestIso) : '—');
      if (importantCount > 0) {
        addRow(dl, 'Important flagged', `${importantCount} / ${total}`);
      }
    } catch {
      addRow(dl, 'Log entries', '(parse error)');
    }
  }

  // markdown-specific metrics(text / textlog 限定)
  if (entry.archetype === 'text' || entry.archetype === 'textlog') {
    try {
      const headings = extractHeadingsFromMarkdown(body);
      const byLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const h of headings) byLevel[h.level] = (byLevel[h.level] ?? 0) + 1;
      const levelStr = [1, 2, 3, 4, 5]
        .map((l) => `H${l}:${byLevel[l] ?? 0}`)
        .filter((s) => !s.endsWith(':0'))
        .join(' / ') || '(none)';
      addRow(dl, 'Headings', `${headings.length} total · ${levelStr}`);
    } catch {
      addRow(dl, 'Headings', '(parse error)');
    }

    // frontmatter document globals(writing / direction / align / layout)
    try {
      const globals = extractDocumentGlobals(body);
      const lines: string[] = [];
      if (globals.writing) lines.push(`writing: ${globals.writing}`);
      if (globals.direction) lines.push(`direction: ${globals.direction}`);
      if (globals.align) lines.push(`align: ${globals.align}`);
      if (globals.layout) lines.push(`layout: ${globals.layout}`);
      if (lines.length === 0) lines.push('(none — using defaults)');
      addRow(dl, 'Frontmatter style', lines.join(' · '));
      if (globals.warnings.length > 0) {
        addRow(dl, 'Style warnings', `${globals.warnings.length} (see frontmatter validation)`);
      }
    } catch {
      addRow(dl, 'Frontmatter style', '(parse error)');
    }
  }

  // timestamps(常に出す)
  addRow(dl, 'Created', formatIso(entry.created_at));
  addRow(dl, 'Updated', formatIso(entry.updated_at));

  section.appendChild(dl);

  const note = document.createElement('div');
  note.className = 'pkc-inspector-style-note';
  note.textContent = 'Per-entry theme override(色 / font / margin)は wave-γ 後続 PR で実装予定。';
  section.appendChild(note);

  return section;
}

function addRow(dl: HTMLElement, label: string, value: string): void {
  const dt = document.createElement('dt');
  dt.className = 'pkc-inspector-style-dt';
  dt.textContent = label;
  dl.appendChild(dt);
  const dd = document.createElement('dd');
  dd.className = 'pkc-inspector-style-dd';
  dd.textContent = value;
  dl.appendChild(dd);
}

function archetypeIcon(arch: string): string {
  switch (arch) {
    case 'text':       return '📝';
    case 'textlog':    return '📋';
    case 'todo':       return '☑';
    case 'attachment': return '📎';
    case 'folder':     return '📁';
    case 'form':       return '📋';
    default:           return '○';
  }
}

function formatIso(iso: string): string {
  if (!iso) return '—';
  return iso.slice(0, 19).replace('T', ' ');
}

/**
 * pgc-128:local timezone での yyyy-mm-dd 整形。`new Date().toISOString()`
 * は UTC 表記なので、user の「今日」と一致させるには local Date を直接読む。
 */
function formatLocalYmd(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
