/**
 * Quick Open overlay(vscode-grade-overhaul-2026-05 MASTER.md §4.2、wave-α
 * PR pgc-81 POC、wave-α' PR pgc-183〜185 で 5 mode 完備)。
 *
 * VSCode / Obsidian / Notion 流の **universal fuzzy launcher**。`Ctrl+P`
 * 1 つで 5 種の検索 mode を切替、Enter で execute。`Ctrl+P` は browser
 * print を上書きする ── PKC2 では entry navigation の方が圧倒的に高頻度
 * 動作。
 *
 * Mode prefix(5 mode 完備、pgc-183/184/185 で本格化):
 * - **何もなし** → entry search(全 entry を title fuzzy + recency tie-break)
 * - **`>`** → command(Command Palette と同じ commands を delegate)
 * - **`:`** → heading(現 entry の H1〜H3 見出しへ jump、pgc-183)
 * - **`#`** → tag(container 全 tag を frequency 順、Enter で TOGGLE_TAG_FILTER、pgc-184)
 * - **`@`** → recent(navHistory 末尾を新しい順 + 重複除去、pgc-185)
 *
 * 全 7 mode 完備(pgc-192 で `?` help、pgc-194 で `!` debug 着地):
 * - **`?`** → help(全 keymap binding 一覧、Enter で execute、pgc-192)
 * - **`!`** → debug(Flags Inspector を delegate-open、pgc-194)
 *
 * Tier 0 flag `shell.quick_open_enabled`(default OFF)で gate。
 *
 * Recent 出力:`state.navHistory`(`AppState` に既存)の末尾 5 件を popularity
 * top に並べる(query 空のとき)。query 非空時は score-desc sort + recent
 * tie-break。`@` mode は navHistory を直接出す(entry mode の query 空時
 * と同等だが mode 切替で明示的に意図表現)。
 */

import type { Entry } from '../../core/model/record';
import type { Dispatcher } from '../state/dispatcher';
import { fuzzyMatchSingle, rankCommands } from '../../features/command/fuzzy';
import { shellQuickOpenEnabled } from './shell-flags';
import { getCommandMetas, executeCommand } from './command-palette';
import { extractHeadingsFromMarkdown, type TocHeading } from '../../features/markdown/markdown-toc';
import { getKeyBindings } from './keymap-binder';
import type { KeyChord, KeyBinding } from '../../features/keymap/types';

// pgc-192 wave-α' #15(v3 統合 master G2 nav 統一、Quick Open `?` mode):
// 1 つの chord を「Ctrl+B」 / 「Alt+ArrowLeft」 形式の人間可読文字列に整形。
function formatChord(chord: KeyChord): string {
  const parts: string[] = [];
  if (chord.ctrl) parts.push('Ctrl');
  if (chord.shift) parts.push('Shift');
  if (chord.alt) parts.push('Alt');
  if (chord.meta) parts.push('Cmd');
  // key は lowercase 化済み ── 表示用に capitalize(1 char) or as-is(複数 char)
  const k = chord.key;
  parts.push(k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1));
  return parts.join('+');
}

// pgc-192:chord sequence(`[Ctrl+K, Ctrl+S]` 等)を空白区切り文字列に整形。
export function formatKeybindSequence(seq: readonly KeyChord[]): string {
  return seq.map(formatChord).join(' ');
}

interface RankedHeading {
  readonly heading: TocHeading;
  readonly score: number;
}

// pgc-183 wave-α' #6(v3 統合 master G2 nav 統一、wave-α POC §0 で「後続
// PR で本格化」 と既知):Quick Open `:` mode を heading-jump に格上げ。
// 現 entry(text / textlog)の見出しを抽出 + fuzzy match、Enter で
// `scroll-to-heading` 同等の `#<slug>` scrollIntoView へ繋ぐ。
// pgc-183:Quick Open heading mode で選択された heading slug を center pane
// に scroll する helper。action-binder の `scroll-to-heading` handler と
// 同経路(action-binder.ts:1247)── center pane 起点で `#<slug>` を探し、
// 見つからなければ document 全体から fallback。
function scrollToHeadingBySlug(slug: string): void {
  if (typeof document === 'undefined') return;
  const center = document.querySelector('[data-pkc-region="center"]')
    ?? document.querySelector('.pkc-center');
  const target =
    (center?.querySelector(`#${CSS.escape(slug)}`) as HTMLElement | null)
    ?? document.getElementById(slug);
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function rankHeadings(query: string, headings: readonly TocHeading[]): RankedHeading[] {
  if (!query) {
    return headings.map((h) => ({ heading: h, score: 1 }));
  }
  const out: RankedHeading[] = [];
  for (const h of headings) {
    const tr = fuzzyMatchSingle(query, h.text);
    const sr = fuzzyMatchSingle(query, h.slug);
    const score = Math.max(tr.score, sr.score);
    if (score <= 0) continue;
    out.push({ heading: h, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

interface TagCount {
  readonly tag: string;
  readonly count: number;
}

interface RankedTag {
  readonly tag: string;
  readonly count: number;
  readonly score: number;
}

// pgc-184 wave-α' #7(v3 統合 master G2 nav 統一、Quick Open `#` mode):
// container 全 entry から tag を集計し、count desc + fuzzy match で並べる。
// 同じ tag が複数 entry にあれば 1 件にまとめて count を加算。
export function collectTagCounts(entries: readonly Entry[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    for (const t of e.tags ?? []) {
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function rankTags(query: string, tagCounts: readonly TagCount[]): RankedTag[] {
  if (!query) {
    // empty query は count desc(collectTagCounts の出力をそのまま)
    return tagCounts.map((tc) => ({ ...tc, score: 1 }));
  }
  const out: RankedTag[] = [];
  for (const tc of tagCounts) {
    const r = fuzzyMatchSingle(query, tc.tag);
    if (r.score <= 0) continue;
    // score + count の log を足す ── 同 fuzzy score なら popular tag 優先
    out.push({ ...tc, score: r.score + Math.log(tc.count + 1) * 0.1 });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

interface RankedEntry {
  readonly entry: Entry;
  readonly score: number;
}

let mountedRoot: HTMLElement | null = null;
let mountedCleanup: (() => void) | null = null;

export function isQuickOpenOpen(): boolean {
  if (!mountedRoot) return false;
  if (typeof document !== 'undefined' && !document.contains(mountedRoot)) {
    mountedRoot = null;
    mountedCleanup = null;
    return false;
  }
  return true;
}

export function resetQuickOpenOverlay(): void {
  if (mountedRoot && mountedRoot.parentNode) mountedRoot.remove();
  mountedRoot = null;
  mountedCleanup = null;
}

/**
 * Entry を fuzzy match。title を主に、archetype + lid を補助で。
 * recent(navHistory 末尾)に近いほど tie-break で上位。
 */
export function rankEntries(
  query: string,
  entries: readonly Entry[],
  recentLids: readonly string[],
): RankedEntry[] {
  // recent lid → recency index(末尾が最大値 = 最近)
  const recencyMap = new Map<string, number>();
  recentLids.forEach((lid, i) => {
    recencyMap.set(lid, i);
  });

  if (!query) {
    // query 空 ── 全 entry を recency 降順 + ARCHIVED / opaque は除外。
    const visible = entries.filter((e) => e.archetype !== 'opaque');
    return visible
      .map((e) => ({
        entry: e,
        score: 1 + (recencyMap.get(e.lid) ?? -1),
      }))
      .sort((a, b) => b.score - a.score);
  }

  const out: RankedEntry[] = [];
  for (const e of entries) {
    if (e.archetype === 'opaque') continue;
    // title が主 ── lid / archetype の最大 score を取る
    const titleR = fuzzyMatchSingle(query, e.title || '(untitled)');
    const lidR = fuzzyMatchSingle(query, e.lid);
    const archR = fuzzyMatchSingle(query, e.archetype);
    let score = Math.max(titleR.score, lidR.score, archR.score);
    if (score <= 0) continue;
    // recency tie-break:0.1 per recency rank
    score += (recencyMap.get(e.lid) ?? -1) * 0.1;
    out.push({ entry: e, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

const ARCHETYPE_ICON: Record<string, string> = {
  text: '📝',
  textlog: '📋',
  todo: '☑',
  attachment: '📎',
  folder: '📁',
  form: '📝',
  generic: '📄',
  opaque: '⚫',
};

/**
 * Quick Open overlay を mount する。flag OFF または既に開いている場合は
 * no-op。host に append、Escape / backdrop click で unmount。
 */
export function openQuickOpen(
  host: HTMLElement,
  dispatcher: Dispatcher,
): () => void {
  if (!shellQuickOpenEnabled()) return () => undefined;
  if (isQuickOpenOpen() && mountedRoot) {
    const input = mountedRoot.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]');
    input?.focus();
    return mountedCleanup ?? (() => undefined);
  }

  const overlay = document.createElement('div');
  overlay.className = 'pkc-quick-open-overlay';
  overlay.setAttribute('data-pkc-region', 'quick-open');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Quick Open');

  const backdrop = document.createElement('div');
  backdrop.className = 'pkc-quick-open-backdrop';
  overlay.appendChild(backdrop);

  const card = document.createElement('div');
  card.className = 'pkc-quick-open-card';
  overlay.appendChild(card);

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'pkc-quick-open-input';
  input.setAttribute('data-pkc-field', 'quick-open-query');
  input.setAttribute('placeholder', 'エントリ検索(> command、: heading、# tag、@ recent)…');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('aria-label', 'Quick Open query');
  card.appendChild(input);

  const modeHint = document.createElement('div');
  modeHint.className = 'pkc-quick-open-mode-hint';
  modeHint.setAttribute('data-pkc-region', 'quick-open-mode');
  card.appendChild(modeHint);

  const list = document.createElement('ul');
  list.className = 'pkc-quick-open-list';
  list.setAttribute('data-pkc-region', 'quick-open-list');
  list.setAttribute('role', 'listbox');
  card.appendChild(list);

  const empty = document.createElement('div');
  empty.className = 'pkc-quick-open-empty';
  empty.textContent = '(該当エントリなし)';
  empty.style.display = 'none';
  card.appendChild(empty);

  const footer = document.createElement('div');
  footer.className = 'pkc-quick-open-footer';
  footer.innerHTML =
    '<kbd>↑↓</kbd> 移動 · <kbd>Enter</kbd> 開く · <kbd>Ctrl+Enter</kbd> 別窓 · <kbd>Esc</kbd> 閉じる · <kbd>&gt; : # @</kbd> mode 切替';
  card.appendChild(footer);

  host.appendChild(overlay);
  mountedRoot = overlay;

  let activeIndex = 0;
  let mode: 'entry' | 'command' | 'heading' | 'tag' | 'recent' | 'help' | 'debug' = 'entry';
  let entryItems: RankedEntry[] = [];
  let commandItems: ReturnType<typeof rankCommands> = [];
  let headingItems: RankedHeading[] = [];
  let tagItems: RankedTag[] = [];
  let recentItems: RankedEntry[] = [];
  let helpItems: Array<{ binding: KeyBinding; title: string; chordText: string }> = [];
  // pgc-194:debug mode は単一 entry(Flags Inspector を開く)。state 不要。

  function detectMode(q: string): { mode: 'entry' | 'command' | 'heading' | 'tag' | 'recent' | 'help' | 'debug'; effective: string; hint: string } {
    if (q.startsWith('>')) {
      return { mode: 'command', effective: q.slice(1).trim(), hint: '🛠 Command mode' };
    }
    if (q.startsWith(':')) {
      return { mode: 'heading', effective: q.slice(1).trim(), hint: '📑 Heading mode(現 entry の見出し)' };
    }
    if (q.startsWith('#')) {
      return { mode: 'tag', effective: q.slice(1).trim(), hint: '🏷 Tag mode(container 全 tag を frequency 順)' };
    }
    if (q.startsWith('@')) {
      return { mode: 'recent', effective: q.slice(1).trim(), hint: '📜 Recent mode(navHistory 末尾を新しい順)' };
    }
    if (q.startsWith('?')) {
      return { mode: 'help', effective: q.slice(1).trim(), hint: '❓ Help mode(全 keymap binding を一覧、Enter で発火)' };
    }
    if (q.startsWith('!')) {
      return { mode: 'debug', effective: q.slice(1).trim(), hint: '🔧 Debug mode(Flags Inspector を開く)' };
    }
    return { mode: 'entry', effective: q, hint: '' };
  }

  function renderList(query: string): void {
    const { mode: m, effective, hint } = detectMode(query);
    mode = m;
    if (hint) {
      modeHint.textContent = hint;
      modeHint.style.display = '';
    } else {
      modeHint.style.display = 'none';
      modeHint.textContent = '';
    }
    list.textContent = '';
    activeIndex = 0;

    if (m === 'debug') {
      // pgc-194:debug mode は単一 row「Open Flags Inspector」 のみ。Enter で
      // executeCommand('app.flags')(既存 command palette 経路再利用)、
      // 拡張余地として後で「dump state」 / 「performance trace」 等を
      // 追加可能。effective query は filter なし(常に 1 件)。
      empty.style.display = 'none';
      list.style.display = '';
      const li = document.createElement('li');
      li.className = 'pkc-quick-open-item pkc-quick-open-item-active';
      li.setAttribute('data-pkc-cmd-id', 'app.flags');
      li.setAttribute('data-pkc-quick-mode', 'debug');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'true');
      const icon = document.createElement('span');
      icon.className = 'pkc-quick-open-item-icon';
      icon.textContent = '🔧';
      li.appendChild(icon);
      const title = document.createElement('span');
      title.className = 'pkc-quick-open-item-title';
      title.textContent = 'Flags Inspector を開く / Open Flags Inspector';
      li.appendChild(title);
      const meta = document.createElement('span');
      meta.className = 'pkc-quick-open-item-meta';
      meta.textContent = 'F12';
      li.appendChild(meta);
      list.appendChild(li);
      return;
    }

    if (m === 'help') {
      // pgc-192:keymap registry に登録されている全 binding を一覧。各 row に
      // chord 表記(`Ctrl+B` / `Alt+1` / `Ctrl+K H`)+ command title(getCommandMetas
      // から lookup)を表示。effective query があれば chord 文字列 + title で
      // fuzzy filter。Enter で対応 command を execute。空 list は empty state。
      const metas = getCommandMetas();
      const metaById = new Map(metas.map((cm) => [cm.id, cm]));
      const bindings = getKeyBindings();
      const all = bindings.map((b) => {
        const chordText = formatKeybindSequence(b.sequence);
        const cm = metaById.get(b.commandId);
        const title = cm ? `${cm.titleJa} / ${cm.titleEn}` : b.commandId;
        return { binding: b, title, chordText };
      });
      // empty query は all、それ以外は fuzzy filter(chord text または title)
      if (!effective) {
        helpItems = all;
      } else {
        helpItems = [];
        for (const item of all) {
          const tr = fuzzyMatchSingle(effective, item.title);
          const cr = fuzzyMatchSingle(effective, item.chordText);
          const score = Math.max(tr.score, cr.score);
          if (score <= 0) continue;
          helpItems.push(item);
        }
      }
      if (helpItems.length === 0) {
        empty.style.display = '';
        list.style.display = 'none';
        return;
      }
      empty.style.display = 'none';
      list.style.display = '';
      const visible = helpItems.slice(0, 50);
      for (let i = 0; i < visible.length; i++) {
        const r = visible[i]!;
        const li = document.createElement('li');
        li.className = 'pkc-quick-open-item';
        li.setAttribute('data-pkc-cmd-id', r.binding.commandId);
        li.setAttribute('data-pkc-quick-mode', 'help');
        li.setAttribute('role', 'option');
        if (i === 0) {
          li.classList.add('pkc-quick-open-item-active');
          li.setAttribute('aria-selected', 'true');
        }
        const icon = document.createElement('span');
        icon.className = 'pkc-quick-open-item-icon';
        icon.textContent = '⌨';
        li.appendChild(icon);
        const title = document.createElement('span');
        title.className = 'pkc-quick-open-item-title';
        title.textContent = r.title;
        li.appendChild(title);
        const meta = document.createElement('span');
        meta.className = 'pkc-quick-open-item-meta';
        meta.textContent = r.chordText;
        li.appendChild(meta);
        list.appendChild(li);
      }
      return;
    }

    if (m === 'recent') {
      // pgc-185:state.navHistory(SELECT_ENTRY 履歴の末尾 N 件)を新しい順に
      // 並べる。query があれば fuzzy match で更に絞り込む。空 history は
      // empty state。navHistory の末尾 = 最近 select した entry。
      const state = dispatcher.getState();
      const history = state.navHistory ?? [];
      const entries = state.container?.entries ?? [];
      const entryByLid = new Map(entries.map((e) => [e.lid, e]));
      // 新しい順 = navHistory reverse、重複は新しい方を残す
      const seen = new Set<string>();
      const candidates: Entry[] = [];
      for (let i = history.length - 1; i >= 0; i--) {
        const lid = history[i]!;
        if (seen.has(lid)) continue;
        seen.add(lid);
        const e = entryByLid.get(lid);
        if (e && e.archetype !== 'opaque') candidates.push(e);
      }
      // empty effective query は全件、それ以外は fuzzy filter
      if (!effective) {
        recentItems = candidates.map((e, idx) => ({ entry: e, score: candidates.length - idx }));
      } else {
        recentItems = [];
        for (let idx = 0; idx < candidates.length; idx++) {
          const e = candidates[idx]!;
          const tr = fuzzyMatchSingle(effective, e.title || '(untitled)');
          if (tr.score <= 0) continue;
          // recency 補正:新しい候補ほど tie-break で上位
          recentItems.push({ entry: e, score: tr.score + (candidates.length - idx) * 0.05 });
        }
        recentItems.sort((a, b) => b.score - a.score);
      }
      if (recentItems.length === 0) {
        empty.style.display = '';
        list.style.display = 'none';
        return;
      }
      empty.style.display = 'none';
      list.style.display = '';
      const visible = recentItems.slice(0, 50);
      for (let i = 0; i < visible.length; i++) {
        const r = visible[i]!;
        const li = document.createElement('li');
        li.className = 'pkc-quick-open-item';
        li.setAttribute('data-pkc-quick-lid', r.entry.lid);
        li.setAttribute('data-pkc-quick-mode', 'recent');
        li.setAttribute('data-pkc-archetype', r.entry.archetype);
        li.setAttribute('role', 'option');
        if (i === 0) {
          li.classList.add('pkc-quick-open-item-active');
          li.setAttribute('aria-selected', 'true');
        }
        const icon = document.createElement('span');
        icon.className = 'pkc-quick-open-item-icon';
        icon.textContent = ARCHETYPE_ICON[r.entry.archetype] ?? '📄';
        li.appendChild(icon);
        const title = document.createElement('span');
        title.className = 'pkc-quick-open-item-title';
        title.textContent = r.entry.title || '(untitled)';
        li.appendChild(title);
        const meta = document.createElement('span');
        meta.className = 'pkc-quick-open-item-meta';
        meta.textContent = `#${i + 1}`; // 履歴 index 表示(1 = 一番最近)
        li.appendChild(meta);
        list.appendChild(li);
      }
      return;
    }

    if (m === 'tag') {
      // pgc-184:container 全 entry から tag を集計し、count desc + fuzzy
      // で並べる。0 件は empty state。
      const state = dispatcher.getState();
      const entries = state.container?.entries ?? [];
      const tagCounts = collectTagCounts(entries);
      tagItems = rankTags(effective, tagCounts);
      if (tagItems.length === 0) {
        empty.style.display = '';
        list.style.display = 'none';
        return;
      }
      empty.style.display = 'none';
      list.style.display = '';
      const visible = tagItems.slice(0, 50);
      for (let i = 0; i < visible.length; i++) {
        const r = visible[i]!;
        const li = document.createElement('li');
        li.className = 'pkc-quick-open-item';
        li.setAttribute('data-pkc-quick-tag', r.tag);
        li.setAttribute('data-pkc-quick-mode', 'tag');
        li.setAttribute('role', 'option');
        if (i === 0) {
          li.classList.add('pkc-quick-open-item-active');
          li.setAttribute('aria-selected', 'true');
        }
        const icon = document.createElement('span');
        icon.className = 'pkc-quick-open-item-icon';
        icon.textContent = '🏷';
        li.appendChild(icon);
        const title = document.createElement('span');
        title.className = 'pkc-quick-open-item-title';
        title.textContent = r.tag;
        li.appendChild(title);
        const meta = document.createElement('span');
        meta.className = 'pkc-quick-open-item-meta';
        meta.textContent = `${r.count} entry`;
        li.appendChild(meta);
        list.appendChild(li);
      }
      return;
    }

    if (m === 'heading') {
      // pgc-183:現 entry の見出しを fuzzy match。selectedLid が無い / text/
      // textlog 以外 / heading 0 件のときは empty state(明示メッセージ無し
      // = pkc-quick-open-empty の "(該当エントリなし)" を再利用、汎用 UX)。
      const state = dispatcher.getState();
      const lid = state.selectedLid;
      const entry = lid ? state.container?.entries.find((e) => e.lid === lid) : undefined;
      const isMarkdown = entry && (entry.archetype === 'text' || entry.archetype === 'textlog');
      const headings = isMarkdown ? extractHeadingsFromMarkdown(entry.body || '') : [];
      headingItems = rankHeadings(effective, headings);
      if (headingItems.length === 0) {
        empty.style.display = '';
        list.style.display = 'none';
        return;
      }
      empty.style.display = 'none';
      list.style.display = '';
      const visible = headingItems.slice(0, 50);
      for (let i = 0; i < visible.length; i++) {
        const r = visible[i]!;
        const li = document.createElement('li');
        li.className = 'pkc-quick-open-item';
        li.setAttribute('data-pkc-heading-slug', r.heading.slug);
        li.setAttribute('data-pkc-quick-mode', 'heading');
        li.setAttribute('role', 'option');
        if (i === 0) {
          li.classList.add('pkc-quick-open-item-active');
          li.setAttribute('aria-selected', 'true');
        }
        const icon = document.createElement('span');
        icon.className = 'pkc-quick-open-item-icon';
        // heading level に応じた icon(H1=📚 / H2=📖 / H3+=📑)
        icon.textContent = r.heading.level <= 1 ? '📚' : r.heading.level === 2 ? '📖' : '📑';
        li.appendChild(icon);
        const title = document.createElement('span');
        title.className = 'pkc-quick-open-item-title';
        title.textContent = r.heading.text;
        li.appendChild(title);
        const meta = document.createElement('span');
        meta.className = 'pkc-quick-open-item-meta';
        meta.textContent = `H${r.heading.level}`;
        li.appendChild(meta);
        list.appendChild(li);
      }
      return;
    }

    if (m === 'command') {
      const metas = getCommandMetas();
      commandItems = rankCommands(effective, metas);
      if (commandItems.length === 0) {
        empty.style.display = '';
        list.style.display = 'none';
        return;
      }
      empty.style.display = 'none';
      list.style.display = '';
      const visible = commandItems.slice(0, 50);
      for (let i = 0; i < visible.length; i++) {
        const r = visible[i]!;
        const li = document.createElement('li');
        li.className = 'pkc-quick-open-item';
        li.setAttribute('data-pkc-cmd-id', r.meta.id);
        li.setAttribute('data-pkc-quick-mode', 'command');
        li.setAttribute('role', 'option');
        if (i === 0) {
          li.classList.add('pkc-quick-open-item-active');
          li.setAttribute('aria-selected', 'true');
        }
        const icon = document.createElement('span');
        icon.className = 'pkc-quick-open-item-icon';
        icon.textContent = '🛠';
        li.appendChild(icon);
        const title = document.createElement('span');
        title.className = 'pkc-quick-open-item-title';
        title.textContent = `${r.meta.titleJa} / ${r.meta.titleEn}`;
        li.appendChild(title);
        const cat = document.createElement('span');
        cat.className = 'pkc-quick-open-item-meta';
        cat.textContent = r.meta.category;
        li.appendChild(cat);
        list.appendChild(li);
      }
      return;
    }

    // entry mode
    const state = dispatcher.getState();
    const entries = state.container?.entries ?? [];
    const recentLids = state.navHistory ?? [];
    entryItems = rankEntries(effective, entries, recentLids);
    if (entryItems.length === 0) {
      empty.style.display = '';
      list.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    list.style.display = '';
    const visible = entryItems.slice(0, 50);
    for (let i = 0; i < visible.length; i++) {
      const r = visible[i]!;
      const li = document.createElement('li');
      li.className = 'pkc-quick-open-item';
      li.setAttribute('data-pkc-quick-lid', r.entry.lid);
      li.setAttribute('data-pkc-quick-mode', 'entry');
      li.setAttribute('data-pkc-archetype', r.entry.archetype);
      li.setAttribute('role', 'option');
      if (i === 0) {
        li.classList.add('pkc-quick-open-item-active');
        li.setAttribute('aria-selected', 'true');
      }
      const icon = document.createElement('span');
      icon.className = 'pkc-quick-open-item-icon';
      icon.textContent = ARCHETYPE_ICON[r.entry.archetype] ?? '📄';
      li.appendChild(icon);
      const title = document.createElement('span');
      title.className = 'pkc-quick-open-item-title';
      title.textContent = r.entry.title || '(untitled)';
      li.appendChild(title);
      const meta = document.createElement('span');
      meta.className = 'pkc-quick-open-item-meta';
      meta.textContent = r.entry.archetype;
      li.appendChild(meta);
      list.appendChild(li);
    }
  }

  function setActive(next: number): void {
    const len = mode === 'command'
      ? Math.min(commandItems.length, 50)
      : mode === 'heading'
      ? Math.min(headingItems.length, 50)
      : mode === 'tag'
      ? Math.min(tagItems.length, 50)
      : mode === 'recent'
      ? Math.min(recentItems.length, 50)
      : mode === 'help'
      ? Math.min(helpItems.length, 50)
      : mode === 'debug'
      ? 1 // single row(Flags Inspector)
      : Math.min(entryItems.length, 50);
    if (len === 0) return;
    activeIndex = (next + len) % len;
    const all = list.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item');
    all.forEach((li, i) => {
      if (i === activeIndex) {
        li.classList.add('pkc-quick-open-item-active');
        li.setAttribute('aria-selected', 'true');
        li.scrollIntoView({ block: 'nearest' });
      } else {
        li.classList.remove('pkc-quick-open-item-active');
        li.removeAttribute('aria-selected');
      }
    });
  }

  function execActive(opts: { modifier: 'none' | 'ctrl' | 'shift' }): void {
    if (mode === 'command') {
      const r = commandItems[Math.min(activeIndex, commandItems.length - 1)];
      if (!r) return;
      const id = r.meta.id;
      cleanup();
      executeCommand(id);
      return;
    }
    if (mode === 'heading') {
      const r = headingItems[Math.min(activeIndex, headingItems.length - 1)];
      if (!r) return;
      const slug = r.heading.slug;
      cleanup();
      // scroll-to-heading の action handler と同経路 ── center pane の
      // `#<slug>` element へ scrollIntoView。
      scrollToHeadingBySlug(slug);
      return;
    }
    if (mode === 'tag') {
      const r = tagItems[Math.min(activeIndex, tagItems.length - 1)];
      if (!r) return;
      const tag = r.tag;
      cleanup();
      // tag filter を toggle で追加 ── sidebar に「この tag のみ」 filter
      // が掛かる(既存 TOGGLE_TAG_FILTER reducer 経路)。
      dispatcher.dispatch({ type: 'TOGGLE_TAG_FILTER', tag });
      return;
    }
    if (mode === 'recent') {
      const r = recentItems[Math.min(activeIndex, recentItems.length - 1)];
      if (!r) return;
      const lid = r.entry.lid;
      cleanup();
      if (opts.modifier === 'ctrl') {
        const btn = document.querySelector<HTMLElement>('[data-pkc-action="ctx-open-window"]');
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
        if (btn) btn.click();
      } else {
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
      }
      return;
    }
    if (mode === 'help') {
      const r = helpItems[Math.min(activeIndex, helpItems.length - 1)];
      if (!r) return;
      const id = r.binding.commandId;
      cleanup();
      executeCommand(id);
      return;
    }
    if (mode === 'debug') {
      cleanup();
      executeCommand('app.flags');
      return;
    }
    const r = entryItems[Math.min(activeIndex, entryItems.length - 1)];
    if (!r) return;
    const lid = r.entry.lid;
    cleanup();
    if (opts.modifier === 'ctrl') {
      // 別窓 editor で開く ── context menu の ctx-open-window button を click
      const btn = document.querySelector<HTMLElement>('[data-pkc-action="ctx-open-window"]');
      if (btn) {
        // 該当 lid を SELECT してから click(handler が現 selectedLid を使う)
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
        btn.click();
      } else {
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
      }
      return;
    }
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
  }

  function handleKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      execActive({ modifier: e.ctrlKey || e.metaKey ? 'ctrl' : e.shiftKey ? 'shift' : 'none' });
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(activeIndex + 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(activeIndex - 1);
      return;
    }
    if (e.key === 'Home' && !e.shiftKey) {
      e.preventDefault();
      setActive(0);
      return;
    }
    if (e.key === 'End' && !e.shiftKey) {
      e.preventDefault();
      const len = mode === 'command'
        ? Math.min(commandItems.length, 50)
        : mode === 'heading'
        ? Math.min(headingItems.length, 50)
        : mode === 'tag'
        ? Math.min(tagItems.length, 50)
        : mode === 'recent'
        ? Math.min(recentItems.length, 50)
        : mode === 'help'
        ? Math.min(helpItems.length, 50)
        : mode === 'debug'
        ? 1
        : Math.min(entryItems.length, 50);
      setActive(len - 1);
      return;
    }
  }

  function handleInput(): void {
    renderList(input.value);
  }

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === backdrop) {
      e.preventDefault();
      cleanup();
    }
  }

  function handleListClick(e: MouseEvent): void {
    if (!(e.target instanceof Element)) return;
    const li = e.target.closest<HTMLLIElement>('.pkc-quick-open-item');
    if (!li) return;
    const m = li.getAttribute('data-pkc-quick-mode');
    if (m === 'command') {
      const id = li.getAttribute('data-pkc-cmd-id');
      cleanup();
      if (id) executeCommand(id);
    } else if (m === 'heading') {
      const slug = li.getAttribute('data-pkc-heading-slug');
      cleanup();
      if (slug) scrollToHeadingBySlug(slug);
    } else if (m === 'tag') {
      const tag = li.getAttribute('data-pkc-quick-tag');
      cleanup();
      if (tag) dispatcher.dispatch({ type: 'TOGGLE_TAG_FILTER', tag });
    } else if (m === 'help' || m === 'debug') {
      const id = li.getAttribute('data-pkc-cmd-id');
      cleanup();
      if (id) executeCommand(id);
    } else {
      const lid = li.getAttribute('data-pkc-quick-lid');
      cleanup();
      if (lid) {
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl) {
          const btn = document.querySelector<HTMLElement>('[data-pkc-action="ctx-open-window"]');
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
          if (btn) btn.click();
        } else {
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
        }
      }
    }
  }

  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', handleKey);
  backdrop.addEventListener('click', handleBackdropClick);
  list.addEventListener('click', handleListClick);

  renderList('');
  input.focus();

  function cleanup(): void {
    if (mountedRoot !== overlay) return;
    input.removeEventListener('input', handleInput);
    input.removeEventListener('keydown', handleKey);
    backdrop.removeEventListener('click', handleBackdropClick);
    list.removeEventListener('click', handleListClick);
    overlay.remove();
    mountedRoot = null;
    mountedCleanup = null;
  }

  mountedCleanup = cleanup;
  return cleanup;
}

export function toggleQuickOpen(host: HTMLElement, dispatcher: Dispatcher): void {
  if (mountedRoot) {
    mountedCleanup?.();
    return;
  }
  openQuickOpen(host, dispatcher);
}
