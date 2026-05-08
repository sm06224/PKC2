/**
 * Slash Command Menu — minimal input assistance for free-text areas.
 *
 * Scope:
 * - Targets validation-free textareas (body, todo-description)
 * - Triggered by `/` at line start or after whitespace
 * - Renders a small popover with command candidates
 * - Replaces the `/` trigger with the chosen command's text
 *
 * This is adapter-layer: it touches DOM and imports from features.
 */

import {
  formatDate,
  formatTime,
  formatDateTime,
  formatISO8601,
} from '../../features/datetime/datetime-format';
import { getActiveUserTemplates } from '../../features/templates/template-flag';
import { getCaretViewportCoords } from './caret-position';

// ── Command definitions ──

/**
 * Context passed to `onSelect` callbacks.
 * Lets a command hand off to a separate UI (e.g., the asset picker) that
 * needs to know the textarea, replacement range, and render root.
 */
export interface SlashCommandContext {
  textarea: HTMLTextAreaElement;
  /** Start of the `/command` range (inclusive). */
  replaceStart: number;
  /** End of the `/command` range (exclusive; current caret position). */
  replaceEnd: number;
  /** Render parent — the `#pkc-root` element. */
  root: HTMLElement;
}

export interface SlashCommand {
  id: string;
  label: string;
  /**
   * Text to insert (replaces the `/` trigger). May be a function for dynamic
   * values. Ignored when `onSelect` is set.
   */
  insert?: string | (() => string);
  /**
   * Where to land the caret relative to the start of the inserted
   * text. Used for wrap-style commands (`/bold` → `****` with caret
   * between the two `**`). When undefined, caret goes to the end of
   * the insertion (default behaviour).
   */
  cursorOffset?: number;
  /**
   * Custom handler invoked instead of text insertion. The handler is
   * responsible for closing the slash menu (or not) and performing any
   * follow-up UI. When set, `insert` is ignored.
   */
  onSelect?: (ctx: SlashCommandContext) => void;
}

/**
 * Asset picker callback registered by the action-binder.
 * The slash command `/asset` calls this instead of inserting text.
 * Kept as an injected callback so slash-menu does not import from the
 * action-binder (which would form a cycle).
 */
let assetPickerCallback: ((ctx: SlashCommandContext) => void) | null = null;

export function registerAssetPickerCallback(
  cb: ((ctx: SlashCommandContext) => void) | null,
): void {
  assetPickerCallback = cb;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // ── Date / time ──
  { id: 'date', label: '/date — yyyy/MM/dd', insert: () => formatDate() },
  { id: 'time', label: '/time — HH:mm:ss', insert: () => formatTime() },
  { id: 'datetime', label: '/datetime — yyyy/MM/dd HH:mm:ss', insert: () => formatDateTime() },
  { id: 'iso', label: '/iso — ISO 8601', insert: () => formatISO8601() },

  // ── Heading levels ──
  { id: 'h1', label: '/h1 — # Heading 1', insert: '# ' },
  { id: 'h2', label: '/h2 — ## Heading 2', insert: '## ' },
  { id: 'h3', label: '/h3 — ### Heading 3', insert: '### ' },

  // ── Block elements ──
  { id: 'list', label: '/list — - Bullet list', insert: '- ' },
  { id: 'todo', label: '/todo — - [ ] Task', insert: '- [ ] ' },
  { id: 'done', label: '/done — - [x] Done task', insert: '- [x] ' },
  { id: 'quote', label: '/quote — > Quote', insert: '> ' },
  { id: 'hr', label: '/hr — Horizontal rule', insert: '\n---\n' },
  { id: 'code', label: '/code — ``` Code block', insert: '```\n\n```', cursorOffset: 4 },
  {
    id: 'table',
    label: '/table — | Header | scaffold',
    insert: '| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n',
  },

  // ── Inline marks (caret lands BETWEEN the wrapping markers so the
  //    user can immediately type the content). ──
  { id: 'bold', label: '/bold — **bold**', insert: '****', cursorOffset: 2 },
  { id: 'italic', label: '/italic — *italic*', insert: '**', cursorOffset: 1 },
  { id: 'strike', label: '/strike — ~~strikethrough~~', insert: '~~~~', cursorOffset: 2 },
  { id: 'inlinecode', label: '/inlinecode — `inline code`', insert: '``', cursorOffset: 1 },

  // ── Links / media ──
  { id: 'link', label: '/link — [text](url)', insert: '[text](url)' },
  { id: 'img', label: '/img — ![alt](src)', insert: '![alt](src)' },
  {
    id: 'asset',
    label: '/asset — Insert image asset',
    onSelect: (ctx) => {
      if (assetPickerCallback) assetPickerCallback(ctx);
    },
  },

  // ── Frontmatter templates(`/pkcfm*`、2026-05-08 YAML natural extension wave)──
  //
  // user direction:`/pkcXXXX` 系 snippet にコメント付き frontmatter テンプレ
  // を登録、自然な YAML を覚えなくても穴埋めで書ける入り口に。各テンプレは
  // 標準 YAML(nested mapping / 配列 / block scalar `|`)+ 行頭/行末 `#` コメント
  // で「どこに何を書けばよいか」を内蔵。parser の対応範囲(natural YAML 規約)
  // と 1 対 1 で対応。
  {
    id: 'pkcfm',
    label: '/pkcfm — frontmatter 基本テンプレ(comment 付き)',
    insert:
      '---\n' +
      '# PKC2 frontmatter — `kind` で entry の種別を宣言、その他は任意キー\n' +
      'kind: note          # book / paper / video / album / film / note 等(filer の subset 振り分けに使う)\n' +
      'title: タイトル      # entry title と独立、frontmatter 専用の正式名(任意)\n' +
      'tags: [tag1, tag2]  # 配列はインライン記法 `[a, b]` か block 記法(- a 改行 - b)\n' +
      '---\n\n',
  },
  {
    id: 'pkcvars',
    label: '/pkcvars — `{{vars.x}}` 展開用テンプレ(nested object 形式)',
    insert:
      '---\n' +
      '# vars block は本文中 `{{vars.<key>}}` で展開される。AI に「vars だけ書き換えて宛先別 variant を作って」と指示できる\n' +
      'vars:\n' +
      '  project: ALPHA-7        # 本文中で `{{vars.project}}` と書くと展開される\n' +
      '  audience: 経営層         # 同名 key を変えるだけで variant 量産\n' +
      '  summary: "1 行で要約"    # quoted string 内の `#` は comment 扱いされない\n' +
      '---\n\n',
  },
  {
    id: 'pkcfmbook',
    label: '/pkcfmbook — book(蔵書)用 frontmatter テンプレ',
    insert:
      '---\n' +
      '# 蔵書 entry — filer の book base に拾われる(kind: book 必須)\n' +
      'kind: book\n' +
      'title: 書名\n' +
      'author: 著者名      # 単一なら scalar、複数なら配列に\n' +
      'year: 2026          # 出版年(integer)\n' +
      'publisher: 出版社\n' +
      'isbn: "978-..."     # quoted で hyphen / 数字混在を string 確保\n' +
      'tags: [tag1]\n' +
      'rating: 4           # 0-5 の integer(任意)\n' +
      '---\n\n',
  },
  {
    id: 'pkcfmpaper',
    label: '/pkcfmpaper — 論文 / 引用 frontmatter テンプレ',
    insert:
      '---\n' +
      '# 論文 entry — citation metadata(authors は array of object も可)\n' +
      'kind: paper\n' +
      'title: 論文タイトル\n' +
      'authors:\n' +
      '  - { family: Smith, given: J. }   # array of object の inline 記法\n' +
      '  - { family: Tanaka, given: A. }\n' +
      'year: 2026\n' +
      'journal: Journal Name\n' +
      'doi: "10.1234/example"\n' +
      'keywords: [keyword1, keyword2]\n' +
      'abstract: |        # block scalar `|` で改行を保持、複数行抄録に\n' +
      '  本論文では …\n' +
      '  …について論じる。\n' +
      '---\n\n',
  },
  {
    id: 'pkcfmvideo',
    label: '/pkcfmvideo — video / YouTube frontmatter テンプレ',
    insert:
      '---\n' +
      '# video entry — filer の video base に拾われる\n' +
      'kind: video\n' +
      'title: 動画タイトル\n' +
      'channel: チャンネル名\n' +
      'published_at: 2026-05-08\n' +
      'duration: "12:34"   # quoted で `:` を含む文字列 確保\n' +
      'tags: [tag1]\n' +
      '---\n\n',
  },
  {
    id: 'pkcfmpage',
    label: '/pkcfmpage — page layout(orient / margins)テンプレ',
    insert:
      '---\n' +
      '# print export 向け page layout(nested mapping、深度 ≤ 4)\n' +
      'page:\n' +
      '  orient: portrait        # portrait / landscape\n' +
      '  margins:\n' +
      '    top: 1cm              # 単位込み string\n' +
      '    bottom: 1cm\n' +
      '    left: 2cm\n' +
      '    right: 2cm\n' +
      '---\n\n',
  },
  {
    id: 'pkcfmnote',
    label: '/pkcfmnote — 自由 note + 複数行 description テンプレ',
    insert:
      '---\n' +
      '# 自由 note — block scalar で長文 description を frontmatter に置く例\n' +
      'kind: note\n' +
      'title: メモ\n' +
      'description: |          # `|` literal:改行をそのまま保持\n' +
      '  ここに複数行の説明を書く。\n' +
      '  YAML 標準の literal block で、自然に書ける。\n' +
      'summary: >              # `>` folded:改行を space に fold(1 段落 1 行扱い)\n' +
      '  この summary は 1 行に\n' +
      '  fold される(段落単位で折り畳み)。\n' +
      'tags: [memo]\n' +
      '---\n\n',
  },
];

/**
 * PR-BBB (2026-05-06):user 修正指示4「自前で手入力するためのテン
 * プレが必要。「/」コマンドにテンプレ挿入のコマンドを追加し、テン
 * プレを用意「/tmpXX」とし、XXは半角英数２文字、Flagsからjson形式
 * で編集可能とする」.
 *
 * `templates.entries` flag を parse して `/tmpXX` 形式の SlashCommand
 * を生成、static SLASH_COMMANDS の後ろに連結。flag の値が変わる
 * たびに `getAllSlashCommands()` が live で再評価されるので、
 * inspector で template を追加したら次回 `/` 起動から見える。
 */
function getAllSlashCommands(): SlashCommand[] {
  const templates = getActiveUserTemplates();
  if (templates.length === 0) return SLASH_COMMANDS;
  const tmplCommands: SlashCommand[] = templates.map((t) => {
    // Preview the first line (or up to 40 chars) for the menu label.
    const previewSrc = (t.body || '').replace(/\n+/g, ' ↵ ').trim();
    const preview = previewSrc.length > 40
      ? `${previewSrc.slice(0, 40)}…`
      : previewSrc || '(empty)';
    return {
      id: `tmp${t.key}`,
      label: `/tmp${t.key} — ${preview}`,
      insert: t.body,
    };
  });
  return [...SLASH_COMMANDS, ...tmplCommands];
}

// ── Trigger detection ──

/** Fields eligible for slash commands (validation-free textareas). */
const SLASH_ELIGIBLE_FIELDS = new Set([
  'body',
  'todo-description',
  'textlog-append-text',
  'textlog-entry-text',
]);

/**
 * Returns true if the given textarea is eligible for slash commands.
 */
export function isSlashEligible(el: HTMLTextAreaElement): boolean {
  const field = el.getAttribute('data-pkc-field');
  return field !== null && SLASH_ELIGIBLE_FIELDS.has(field);
}

/**
 * Returns true if slash menu should open based on current input state.
 * Condition: `/` at line start or after whitespace.
 */
export function shouldOpenSlashMenu(text: string, caretPos: number): boolean {
  // The `/` must be the character just typed (at caretPos - 1)
  if (caretPos < 1) return false;
  if (text[caretPos - 1] !== '/') return false;

  // Must be at line start or preceded by whitespace
  if (caretPos === 1) return true; // `/` is the first character
  const charBefore = text[caretPos - 2];
  return charBefore === '\n' || charBefore === ' ' || charBefore === '\t';
}

/**
 * Returns the start position of the `/` trigger for replacement.
 */
export function getSlashTriggerStart(text: string, caretPos: number): number {
  // Walk backward from caret to find the `/`
  let pos = caretPos - 1;
  while (pos >= 0 && text[pos] !== '/' && text[pos] !== '\n') {
    pos--;
  }
  return pos >= 0 && text[pos] === '/' ? pos : -1;
}

// ── Menu UI ──
//
// Per-root instance state.
//
// Originally the 6 pieces of slash-menu runtime state lived as
// module-level `let` variables, which meant the whole module behaved
// as a single global. That's fine for a single-mount app but risks
// cross-instance contamination if the same module is ever loaded
// against two different render roots (test harnesses, multi-mount
// embeds) and leaks the `activeMenu` / `activeTextarea` references
// across boundaries.
//
// The new model:
//   - State is an `ActiveSlashMenu` object scoped to a single root.
//   - Roots are tracked in a WeakMap — each root has its own state
//     and gets garbage-collected along with the root element.
//   - A single module-level `activeRoot` pointer identifies which
//     root's menu is currently visible. Only one menu may be visible
//     globally at a time, matching the pre-refactor behavior.
//   - `closeSlashMenu` closes only the currently-active menu, so a
//     dormant instance on another root is never stomped.
//
// Exported function signatures are unchanged. Internally every
// function looks up its state via `getActiveInstance()` or
// `getOrCreateInstance(root)`.

interface ActiveSlashMenu {
  /** Popover element. Null when the menu is closed for this root. */
  menu: HTMLElement | null;
  /** Textarea the menu is attached to for the current open. */
  textarea: HTMLTextAreaElement | null;
  /** Start position of the `/` trigger in the textarea. */
  slashPos: number;
  /** Currently highlighted item's index in `filteredCommands`. */
  selectedIndex: number;
  /** Commands passing the current filter query. */
  filteredCommands: SlashCommand[];
}

function createInstance(): ActiveSlashMenu {
  return {
    menu: null,
    textarea: null,
    slashPos: -1,
    selectedIndex: 0,
    filteredCommands: [],
  };
}

/** Per-root state map. Keyed by render root element. */
const instances = new WeakMap<HTMLElement, ActiveSlashMenu>();

/**
 * The root whose menu is currently open. At most one at a time — when
 * openSlashMenu is called against a different root, any menu on a
 * previously active root is first closed via `closeSlashMenu()`. This
 * preserves the pre-refactor "only one menu visible" guarantee.
 */
let activeRoot: HTMLElement | null = null;

function getOrCreateInstance(root: HTMLElement): ActiveSlashMenu {
  let inst = instances.get(root);
  if (!inst) {
    inst = createInstance();
    instances.set(root, inst);
  }
  return inst;
}

function getActiveInstance(): ActiveSlashMenu | null {
  if (!activeRoot) return null;
  return instances.get(activeRoot) ?? null;
}

export function isSlashMenuOpen(): boolean {
  const inst = getActiveInstance();
  return inst?.menu != null;
}

/**
 * Opens the slash menu near the given textarea.
 */
export function openSlashMenu(textarea: HTMLTextAreaElement, slashPos: number, root: HTMLElement): void {
  // Close any menu currently open (possibly on a different root).
  closeSlashMenu();

  const inst = getOrCreateInstance(root);
  inst.textarea = textarea;
  inst.slashPos = slashPos;
  inst.selectedIndex = 0;
  inst.filteredCommands = getAllSlashCommands();

  const menu = document.createElement('div');
  menu.className = 'pkc-slash-menu';
  menu.setAttribute('data-pkc-region', 'slash-menu');
  inst.menu = menu;
  activeRoot = root;

  renderMenuItems(inst);

  // Position near the caret.
  //
  // PR-FF (2026-05-06):textarea bounding rect 直下に出していたが、
  // 縦長 textarea で caret が中段にある場合 menu が遠くに離れる /
  // viewport 下端で `bottom + menu height` が clip される問題があった。
  //
  // PR-DDD (2026-05-06、user 修正指示5):**caret 座標直下** に出す。
  // mirror-div ベースの `getCaretViewportCoords` でキャレットの正確
  // な viewport 座標を計算、その直下に menu を `position: fixed` で
  // 配置。textarea がスクロールしても caret に追従。viewport 下端
  // 近くで menu が clip しないよう、空きが足りない時は caret の上に
  // フリップ表示する flip-up 経路も追加(後段の post-render measure)。
  const caret = getCaretViewportCoords(textarea);
  const taRect = textarea.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = `${Math.max(8, Math.min(caret.left, taRect.right - 200))}px`;
  menu.style.top = `${caret.top + caret.height + 4}px`;
  menu.style.zIndex = '1000';

  root.appendChild(menu);

  // PR-DDD (2026-05-06):mount 後に menu の高さを measure、viewport
  // 下端を超える場合は caret の上に flip して clip を回避。
  const win = root.ownerDocument?.defaultView ?? null;
  if (win) {
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.bottom > win.innerHeight - 4) {
      const flipTop = caret.top - menuRect.height - 4;
      menu.style.top = `${Math.max(4, flipTop)}px`;
    }
    // 右端 clip も同時に守る。
    if (menuRect.right > win.innerWidth - 4) {
      const flippedLeft = win.innerWidth - menuRect.width - 8;
      menu.style.left = `${Math.max(4, flippedLeft)}px`;
    }
  }
}

function renderMenuItems(inst: ActiveSlashMenu): void {
  if (!inst.menu) return;
  inst.menu.innerHTML = '';

  if (inst.filteredCommands.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'pkc-slash-menu-empty';
    empty.textContent = 'No matching commands';
    inst.menu.appendChild(empty);
    return;
  }

  for (let i = 0; i < inst.filteredCommands.length; i++) {
    const cmd = inst.filteredCommands[i]!;
    const item = document.createElement('div');
    item.className = 'pkc-slash-menu-item';
    if (i === inst.selectedIndex) item.setAttribute('data-pkc-selected', 'true');
    item.setAttribute('data-pkc-slash-id', cmd.id);
    item.textContent = cmd.label;
    const itemIndex = i;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent textarea blur
      executeCommand(inst, cmd);
    });
    item.addEventListener('mouseenter', () => {
      inst.selectedIndex = itemIndex;
      updateSelection(inst);
    });
    inst.menu.appendChild(item);
  }
}

function updateSelection(inst: ActiveSlashMenu): void {
  if (!inst.menu) return;
  const items = inst.menu.querySelectorAll<HTMLElement>('.pkc-slash-menu-item');
  for (let i = 0; i < items.length; i++) {
    if (i === inst.selectedIndex) {
      items[i]!.setAttribute('data-pkc-selected', 'true');
      // Keep the active item visible inside the scrolling menu —
      // `block: 'nearest'` scrolls only when the item is fully /
      // partially out of view, so keyboard navigation past either
      // edge always lands on something the user can see.
      items[i]!.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else {
      items[i]!.removeAttribute('data-pkc-selected');
    }
  }
}

/**
 * Subsequence (fuzzy) match: every character of `query` appears in
 * `text` in order, case-insensitive. Empty query matches everything.
 *
 * Examples:
 *   - `dt`   matches `datetime`(d…t)
 *   - `tdo`  matches `todo`(t-d-o)
 *   - `xyz`  doesn't match `link`
 *
 * Trades off ranking quality for code simplicity; if a power-user
 * scenario emerges where two commands match equally we can layer in
 * scoring (start-of-word boost, contiguous-run boost) without
 * changing the call sites.
 */
function fuzzyMatch(query: string, text: string): boolean {
  if (query.length === 0) return true;
  let qi = 0;
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) qi++;
  }
  return qi === query.length;
}

/**
 * Filters commands based on text typed after `/`.
 *
 * Two-tier match (case-insensitive):
 *   1. **Substring** match against `id` or `label` (cheap, what users
 *      typically type — `da` → `date` / `datetime`).
 *   2. **Subsequence (fuzzy)** match against `id` only (catches
 *      `dt` → `datetime`, `tdo` → `todo`). Restricted to `id` so the
 *      noisy long labels don't generate false positives.
 */
export function filterSlashMenu(query: string): void {
  const inst = getActiveInstance();
  if (!inst || !inst.menu) return;
  const q = query.toLowerCase();
  inst.filteredCommands = getAllSlashCommands().filter((cmd) => {
    const id = cmd.id.toLowerCase();
    const label = cmd.label.toLowerCase();
    if (id.includes(q) || label.includes(q)) return true;
    return fuzzyMatch(q, id);
  });
  inst.selectedIndex = 0;
  renderMenuItems(inst);
}

/**
 * Handles keyboard navigation within the slash menu.
 * Returns true if the event was consumed.
 */
export function handleSlashMenuKeydown(e: KeyboardEvent): boolean {
  const inst = getActiveInstance();
  if (!inst || !inst.menu || inst.filteredCommands.length === 0) {
    if (e.key === 'Escape') {
      closeSlashMenu();
      return true;
    }
    return false;
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      inst.selectedIndex = (inst.selectedIndex + 1) % inst.filteredCommands.length;
      updateSelection(inst);
      return true;
    case 'ArrowUp':
      e.preventDefault();
      inst.selectedIndex = (inst.selectedIndex - 1 + inst.filteredCommands.length) % inst.filteredCommands.length;
      updateSelection(inst);
      return true;
    case 'Enter':
    case 'Tab':
      e.preventDefault();
      executeCommand(inst, inst.filteredCommands[inst.selectedIndex]!);
      return true;
    case 'Escape':
      e.preventDefault();
      closeSlashMenu();
      return true;
    default:
      return false;
  }
}

function executeCommand(inst: ActiveSlashMenu, cmd: SlashCommand): void {
  if (!inst.textarea || inst.slashPos < 0) return;

  const textarea = inst.textarea;
  const caretPos = textarea.selectionStart ?? textarea.value.length;
  const slashPos = inst.slashPos;
  // Preserve the root reference locally because closeSlashMenu clears
  // the active instance below and `activeRoot` goes to null.
  const root = activeRoot;

  // Commands with a custom handler (e.g. /asset) hand off to another UI.
  // Close the slash menu first, then invoke the callback. We preserve the
  // textarea reference locally since closeSlashMenu clears instance state.
  if (cmd.onSelect) {
    const ctx: SlashCommandContext = {
      textarea,
      replaceStart: slashPos,
      replaceEnd: caretPos,
      root: root ?? textarea.ownerDocument.body,
    };
    closeSlashMenu();
    cmd.onSelect(ctx);
    return;
  }

  const insert = cmd.insert;
  if (insert === undefined) {
    closeSlashMenu();
    return;
  }
  const text = typeof insert === 'function' ? insert() : insert;

  // Replace from slashPos to current caret (includes `/` and any typed filter)
  const before = textarea.value.slice(0, slashPos);
  const after = textarea.value.slice(caretPos);
  textarea.value = before + text + after;

  // Caret placement: by default land at the end of the insertion;
  // commands with a `cursorOffset` set the caret at that offset
  // relative to the insertion start (used by /bold, /italic, /code,
  // /inlinecode etc. to drop the caret between wrapping markers).
  const offset = cmd.cursorOffset ?? text.length;
  const newPos = slashPos + offset;
  textarea.selectionStart = textarea.selectionEnd = newPos;

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();

  closeSlashMenu();
}

/**
 * Closes the slash menu if open.
 *
 * Only the currently-active instance is closed. Per-root instances
 * that are not currently visible (because their menu was never opened
 * or was closed earlier) are left alone — their state is already
 * idle, and touching them would be a no-op anyway.
 */
export function closeSlashMenu(): void {
  const inst = getActiveInstance();
  if (inst) {
    if (inst.menu) {
      inst.menu.remove();
      inst.menu = null;
    }
    inst.textarea = null;
    inst.slashPos = -1;
    inst.selectedIndex = 0;
    inst.filteredCommands = [];
  }
  activeRoot = null;
}
