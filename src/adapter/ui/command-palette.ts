/**
 * Command Palette overlay(vscode-grade-overhaul-2026-05 MASTER.md §4.1、
 * wave-α PR pgc-80 POC)。
 *
 * VSCode 流の universal command launcher。`Ctrl+Shift+P` / `F1` で開き、
 * fuzzy search で全 command を起動。
 *
 * 本 file が:
 * - **registry**(in-module Map):command の id → meta + handler
 * - **overlay mount/unmount**:input + list + active highlight + 実 OS
 *   keyboard event 処理
 *
 * Tier 0 flag `shell.command_palette_enabled`(default OFF、`shell-flags.ts`)
 * で gate。flag OFF で `Ctrl+Shift+P` / `F1` 押下しても本 overlay は開かない
 * (完全 no-op、CI 上の既存挙動は影響なし)。
 *
 * **架空 spec ではなく POC**:本 PR は registry / overlay / 基本 keyboard nav
 * までを落とす。実際の command set 充実、別 surface への wiring、theme
 * 統合、shortcut 上書き、Quick Open は後続(pgc-81 以降)。
 *
 * Architectural exception:`document.write` を使わない通常 DOM manipulation
 * のみ。canvas+wasm 移行(Phase ε)では本 module は **削除 or rewrite** 対象
 * (canvas 描画への前駆)。
 */

import type { CommandMeta } from '../../features/command/types';
import { validateCommandMeta } from '../../features/command/types';
import { rankCommands, type RankedCommand } from '../../features/command/fuzzy';
import { shellCommandPaletteEnabled } from './shell-flags';
import { showToast } from './toast';

/**
 * #951(user 報告 2026-07-22「コマンドパレットの機能がほとんど機能
 * しなかった」): 全 command の過半が「flag OFF の機能」「編集中限定」
 * 「選択必須」のいずれかで、条件を満たさないとき **console.warn だけの
 * silent no-op** だった。availability 機構を導入し、
 *   - 実行時: 使えない理由を toast で明示(黙って何もしない、を廃止)
 *   - 一覧時: 使えない command はグレー表示 + 理由を右側に表示し、
 *     使える command を先に並べる
 * 「実行できない」ではなく「なぜ実行できないか・どうすれば使えるか」を
 * 返すのが契約。
 */
export type CommandAvailability = () => string | null;

interface RegisteredCommand {
  readonly meta: CommandMeta;
  readonly handler: () => void;
  /** null = 実行可能、string = 使えない理由(user 向け文言)。 */
  readonly availability?: CommandAvailability;
}

/** In-module registry。test 用に exposeReset 可能。 */
const registry = new Map<string, RegisteredCommand>();

/**
 * Command を登録する。重複 / invalid な meta は warning でスキップ
 * (テスト用に throw する mode はあえて持たない ── main.ts での bulk 登録
 * が一部失敗しても他の command は動作する方が user 体感が高い)。
 */
export function registerCommand(
  meta: CommandMeta,
  handler: () => void,
  availability?: CommandAvailability,
): boolean {
  const err = validateCommandMeta(meta, new Set(registry.keys()));
  if (err) {
    if (typeof console !== 'undefined') {
      console.warn(`[command-palette] registerCommand skipped: ${err}`);
    }
    return false;
  }
  registry.set(meta.id, { meta, handler, availability });
  return true;
}

/**
 * command の現在の可用性。null = 実行可能、string = 使えない理由。
 * 未登録 id も null(executeCommand 側が false を返す)。
 */
export function getCommandAvailability(id: string): string | null {
  const r = registry.get(id);
  if (!r?.availability) return null;
  try {
    return r.availability();
  } catch {
    return null; // availability 判定自体の失敗で command を殺さない
  }
}

export function unregisterCommand(id: string): boolean {
  return registry.delete(id);
}

export function getCommandMetas(): readonly CommandMeta[] {
  return [...registry.values()].map((r) => r.meta);
}

export function getCommandCount(): number {
  return registry.size;
}

/**
 * id 指定で command を実行する。registry に無い id なら no-op + false 返却。
 * 本 helper は overlay 外(他 surface)からも叩ける、`window.pkcExecuteCommand`
 * の bridge を後続で追加する余地あり(pgc-82 keyboard registry が利用)。
 */
export function executeCommand(id: string): boolean {
  const r = registry.get(id);
  if (!r) return false;
  // #951: 使えない command は黙って no-op せず、理由を toast で返す。
  const reason = getCommandAvailability(id);
  if (reason) {
    showToast({ message: reason, kind: 'warn' });
    return false;
  }
  try {
    r.handler();
  } catch (e) {
    if (typeof console !== 'undefined') {
      console.error(`[command-palette] handler "${id}" threw:`, e);
    }
    return false;
  }
  return true;
}

/** test 用 ── 登録を全消去。 */
export function resetCommandRegistry(): void {
  registry.clear();
}

/** test 用 ── overlay state を強制リセット(stale DOM 防衛)。 */
export function resetCommandPaletteOverlay(): void {
  if (mountedRoot && mountedRoot.parentNode) {
    mountedRoot.remove();
  }
  mountedRoot = null;
  mountedCleanup = null;
}

// ─── overlay mount / unmount ─────────────────────────────────────

let mountedRoot: HTMLElement | null = null;
let mountedCleanup: (() => void) | null = null;

export function isCommandPaletteOpen(): boolean {
  // mountedRoot が DOM から切り離されていれば mounted ではない扱いに。
  // 通常 unmount path で `mountedRoot = null` するが、外部から overlay を
  // 親 element ごと remove された / test の `document.body.innerHTML = ''`
  // で素朴 detach されたケースを救う(defensive)。
  if (!mountedRoot) return false;
  if (typeof document !== 'undefined' && !document.contains(mountedRoot)) {
    mountedRoot = null;
    mountedCleanup = null;
    return false;
  }
  return true;
}

/**
 * Command Palette overlay を mount する。flag OFF または既に開いている場合
 * は no-op。host element の中に append、Escape / backdrop click で unmount。
 *
 * 戻り値:閉じるための cleanup 関数(複数回呼んでも OK、idempotent)。
 *
 * 内部状態は **module-local**。複数 host で同時 mount できないが、PKC2 は
 * single-document アプリなので問題ない(別窓 entry-window は独自 inline
 * script なので本 module を使わない)。
 */
export function openCommandPalette(host: HTMLElement): () => void {
  if (!shellCommandPaletteEnabled()) {
    return () => undefined;
  }
  // isCommandPaletteOpen() が stale state を片付けてくれる
  if (isCommandPaletteOpen() && mountedRoot) {
    // 既に開いている ── input に focus を戻すだけ
    const input = mountedRoot.querySelector<HTMLInputElement>('[data-pkc-field="cmd-query"]');
    input?.focus();
    return mountedCleanup ?? (() => undefined);
  }

  const overlay = document.createElement('div');
  overlay.className = 'pkc-command-palette-overlay';
  overlay.setAttribute('data-pkc-region', 'command-palette');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Command Palette');

  const backdrop = document.createElement('div');
  backdrop.className = 'pkc-command-palette-backdrop';
  overlay.appendChild(backdrop);

  const card = document.createElement('div');
  card.className = 'pkc-command-palette-card';
  overlay.appendChild(card);

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'pkc-command-palette-input';
  input.setAttribute('data-pkc-field', 'cmd-query');
  input.setAttribute('placeholder', 'コマンド… / Command …');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('aria-label', 'Command query');
  card.appendChild(input);

  const list = document.createElement('ul');
  list.className = 'pkc-command-palette-list';
  list.setAttribute('data-pkc-region', 'command-palette-list');
  list.setAttribute('role', 'listbox');
  card.appendChild(list);

  const empty = document.createElement('div');
  empty.className = 'pkc-command-palette-empty';
  empty.textContent = '(該当 command なし)';
  empty.style.display = 'none';
  card.appendChild(empty);

  host.appendChild(overlay);
  mountedRoot = overlay;

  // ─── state ───
  let activeIndex = 0;
  let currentItems: RankedCommand[] = [];

  function renderList(query: string): void {
    const metas = getCommandMetas();
    const ranked = rankCommands(query, metas);
    // #951: 使える command を先に、使えない command は後ろへ(rank 内の
    // 相対順は維持)。理由は item 上にも表示するため一度だけ評価する。
    const reasons = new Map<string, string | null>();
    for (const r of ranked) reasons.set(r.meta.id, getCommandAvailability(r.meta.id));
    currentItems = [
      ...ranked.filter((r) => reasons.get(r.meta.id) === null),
      ...ranked.filter((r) => reasons.get(r.meta.id) !== null),
    ];
    list.textContent = '';
    if (currentItems.length === 0) {
      empty.style.display = '';
      list.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    list.style.display = '';
    // 上限 ── 50 件 visible(scroll は後続改修で対応、まず list の長さで gate)
    const visible = currentItems.slice(0, 50);
    for (let i = 0; i < visible.length; i++) {
      const r = visible[i]!;
      const reason = reasons.get(r.meta.id) ?? null;
      const li = document.createElement('li');
      li.className = 'pkc-command-palette-item';
      li.setAttribute('role', 'option');
      li.setAttribute('data-pkc-cmd-id', r.meta.id);
      li.setAttribute('data-pkc-cmd-category', r.meta.category);
      if (reason) {
        li.classList.add('pkc-command-palette-item-disabled');
        li.setAttribute('data-pkc-cmd-disabled', 'true');
        li.setAttribute('title', reason);
      }
      if (i === activeIndex) {
        li.setAttribute('aria-selected', 'true');
        li.classList.add('pkc-command-palette-item-active');
      }
      // title + category(small)+ keybind(right)
      const titleSpan = document.createElement('span');
      titleSpan.className = 'pkc-command-palette-item-title';
      titleSpan.textContent = `${r.meta.titleJa} / ${r.meta.titleEn}`;
      li.appendChild(titleSpan);

      const catSpan = document.createElement('span');
      catSpan.className = 'pkc-command-palette-item-cat';
      catSpan.textContent = r.meta.category;
      li.appendChild(catSpan);

      if (reason) {
        // 使えない理由を右側に小さく表示(click / Enter でも toast で案内)
        const reasonSpan = document.createElement('span');
        reasonSpan.className = 'pkc-command-palette-item-reason';
        reasonSpan.textContent = reason;
        li.appendChild(reasonSpan);
      } else if (r.meta.keybind) {
        const kbd = document.createElement('kbd');
        kbd.className = 'pkc-command-palette-item-kbd';
        kbd.textContent = r.meta.keybind;
        li.appendChild(kbd);
      }
      list.appendChild(li);
    }
  }

  function setActive(next: number): void {
    if (currentItems.length === 0) return;
    activeIndex = (next + currentItems.length) % currentItems.length;
    // re-render(simple、small list なので OK ── 50 item 上限)
    renderList(input.value);
    // scrollIntoView(active item)
    const activeLi = list.querySelector<HTMLLIElement>('.pkc-command-palette-item-active');
    activeLi?.scrollIntoView({ block: 'nearest' });
  }

  function execActive(): void {
    if (currentItems.length === 0) return;
    const item = currentItems[Math.min(activeIndex, currentItems.length - 1)];
    if (!item) return;
    const id = item.meta.id;
    // unmount 先(handler が overlay を再 trigger できるように)
    cleanup();
    executeCommand(id);
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
      execActive();
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
      setActive(currentItems.length - 1);
      return;
    }
  }

  function handleInput(): void {
    activeIndex = 0;
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
    const li = e.target.closest<HTMLLIElement>('[data-pkc-cmd-id]');
    if (!li) return;
    const id = li.getAttribute('data-pkc-cmd-id');
    if (!id) return;
    cleanup();
    executeCommand(id);
  }

  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', handleKey);
  backdrop.addEventListener('click', handleBackdropClick);
  list.addEventListener('click', handleListClick);

  // initial render + focus
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

/**
 * Convenience:既に開いていれば閉じる、閉じていれば host に開く ── trigger
 * 1 個に対する toggle 動作。action-binder の `Ctrl+Shift+P` / `F1` 経路から
 * 呼ぶ。
 */
export function toggleCommandPalette(host: HTMLElement): void {
  if (mountedRoot) {
    mountedCleanup?.();
    return;
  }
  openCommandPalette(host);
}
