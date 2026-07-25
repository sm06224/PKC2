/**
 * Region-aware context menu(vscode-grade-overhaul-2026-05 MASTER.md §4.7、
 * wave-α PR pgc-83 POC)。
 *
 * 既存 `renderContextMenu(lid, ...)` は **entry-bound**(右クリックした
 * 対象が specific element を指している必要がある)。本 module は **region
 * background**(center pane の空白部 / sidebar の空白部 / meta pane / header)
 * での右クリック時に出す **region-aware menu** を組む。
 *
 * 投資調査(2026-05-23、pgc-79 audit §1.5)で「center / sidebar / header
 * どこを右クリックしても context menu が出ない」 と判明。本 PR がそれを
 * **universal な「常に何かしら出る」 state** に転換する第一歩。
 *
 * Tier 0 flag `shell.context_menu_universal_enabled`(default OFF)で gate。
 * flag OFF で本 module は呼ばれず、従来挙動(specific element のみ menu)。
 *
 * Architecture:
 * - 本 file は **adapter 層**(DOM 構築 + Command Palette executeCommand を
 *   呼ぶ)。region 判定は caller(`action-binder.ts handleContextMenu`)が
 *   `closest('[data-pkc-region]')` で行い、`renderRegionContextMenu(region,
 *   x, y, opts)` に渡す。
 * - Item の handler は **command id を指す**(command-palette registry に
 *   登録されたものだけ)── これにより本 menu と Command Palette が同じ
 *   command set を共有、user 体験の一貫性を保つ。
 * - menu 自体は既存 `.pkc-context-menu` class を再利用(CSS 統一)。
 */

import { executeCommand } from './command-palette';

export type ContextMenuRegion =
  | 'center'
  | 'sidebar'
  | 'meta'
  | 'header'
  | 'unknown';

export interface RegionContextMenuItem {
  readonly label: string;
  readonly commandId: string;
  readonly separator?: boolean;
}

/**
 * region 別の menu item set(POC ── 後続 PR で各 region に object-aware
 * item を追加していく)。
 */
function itemsForRegion(region: ContextMenuRegion): RegionContextMenuItem[] {
  // 全 region 共通の base set ── 「いつでも呼べる」 universal action
  const universal: RegionContextMenuItem[] = [
    { label: '🎛 Command Palette', commandId: 'app.shortcuts' },
  ];

  switch (region) {
    case 'center':
      return [
        { label: '📝 新規 TEXT エントリ', commandId: 'entry.create.text' },
        { label: '📋 新規 TEXTLOG エントリ', commandId: 'entry.create.textlog' },
        { label: '☑ 新規 TODO エントリ', commandId: 'entry.create.todo' },
        { label: 'sep', commandId: '', separator: true },
        // 「📊 グラフビュー」(view.graph)は削除済 ── graph view 自体が
        // 廃止されているのに menu 項目だけ残っており、押しても
        // `executeCommand` が silent no-op を返すだけだった(視覚監査
        // 2026-07-25 で発覚)。dead command は
        // tests/adapter/command-id-integrity.test.ts が構造的に禁止する。
        { label: '📁 ファイラービュー', commandId: 'view.filer' },
        { label: '📅 カレンダービュー', commandId: 'view.calendar' },
        { label: 'sep', commandId: '', separator: true },
        ...universal,
      ];
    case 'sidebar':
      return [
        { label: '📝 新規 TEXT エントリ', commandId: 'entry.create.text' },
        { label: '📋 新規 TEXTLOG エントリ', commandId: 'entry.create.textlog' },
        { label: '☑ 新規 TODO エントリ', commandId: 'entry.create.todo' },
        { label: '📁 新規 フォルダ', commandId: 'entry.create.folder' },
        { label: 'sep', commandId: '', separator: true },
        ...universal,
      ];
    case 'meta':
      return [
        { label: '🔍 別ウィンドウで参照', commandId: 'shell.open-menu' },
        { label: 'sep', commandId: '', separator: true },
        ...universal,
      ];
    case 'header':
      return [
        { label: '⚙ 設定メニューを開く', commandId: 'shell.open-menu' },
        { label: 'ℹ About PKC2', commandId: 'app.about' },
        { label: '⌨ キーボードショートカット', commandId: 'app.shortcuts' },
        { label: 'sep', commandId: '', separator: true },
        { label: '↕ サイドバーを開閉', commandId: 'shell.toggle-sidebar' },
        { label: '↔ メタペインを開閉', commandId: 'shell.toggle-meta' },
        { label: '🌗 フォーカスモード', commandId: 'shell.toggle-focus-mode' },
      ];
    default:
      // 'unknown':document の任意位置 ── universal のみ
      return [
        { label: '📝 新規 TEXT エントリ', commandId: 'entry.create.text' },
        ...universal,
      ];
  }
}

/**
 * Region-aware context menu DOM を生成する。caller は (a) 既存 menu を
 * dismiss、(b) この element を `root` に append、(c) `clampMenuToViewport`
 * で viewport 内に納める ── という既存 flow に乗る。
 */
export function renderRegionContextMenu(
  region: ContextMenuRegion,
  x: number,
  y: number,
): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'pkc-context-menu';
  menu.setAttribute('data-pkc-region', 'context-menu');
  menu.setAttribute('data-pkc-context-region', region);
  menu.style.position = 'absolute';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.zIndex = '999';

  const items = itemsForRegion(region);
  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'pkc-context-menu-separator';
      menu.appendChild(sep);
      continue;
    }
    const btn = document.createElement('button');
    btn.className = 'pkc-context-menu-item';
    btn.setAttribute('type', 'button');
    btn.setAttribute('data-pkc-cmd-id', item.commandId);
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      menu.remove();
      executeCommand(item.commandId);
    });
    menu.appendChild(btn);
  }
  return menu;
}

/**
 * 右クリック target から最も近い `[data-pkc-region]` を辿り、region 種別を
 * 返す。closest が見つからなければ `'unknown'`(全 region と無関係な
 * place で右クリックした場合の最低保証)。
 */
export function detectContextMenuRegion(target: Element | null): ContextMenuRegion {
  if (!target) return 'unknown';
  const regionEl = target.closest<HTMLElement>('[data-pkc-region]');
  if (!regionEl) return 'unknown';
  const r = regionEl.getAttribute('data-pkc-region') ?? '';
  // 既知の region への mapping(prefix match も含む)
  if (r === 'center' || r.startsWith('center-')) return 'center';
  if (r === 'sidebar' || r.startsWith('sidebar') || r.startsWith('filer-')) return 'sidebar';
  if (r === 'meta' || r.startsWith('meta-')) return 'meta';
  if (r === 'header' || r.startsWith('header-') || r === 'topbar') return 'header';
  // detail / view-mode 系は center 扱い
  if (r.includes('view') || r.includes('detail')) return 'center';
  return 'unknown';
}
