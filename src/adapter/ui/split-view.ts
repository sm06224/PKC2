/**
 * Split View(vscode-grade-overhaul-2026-05 MASTER.md §4.3 / §5.5、
 * wave-α PR pgc-89 POC)。
 *
 * VSCode 流の split editor を最小実装。center pane の **右半分** に secondary
 * read-only viewer を mount し、現在 active な entry を並列表示する。
 *
 * POC scope:
 *   - 1 つの **secondary pane**(右側)のみ ── 真の multi-pane(N panes、
 *     各々独立 tab list)は後続 PR
 *   - secondary pane は read-only render(primary pane の active entry を
 *     そのまま表示)── primary との independent navigation は後続 PR
 *   - orientation:`'right'`(horizontal split)のみ。`'bottom'`(vertical
 *     split)は後続
 *   - close button で secondary pane を閉じる
 *
 * Tier 0 flag `shell.split_view_enabled`(default OFF)で gate ── OFF で
 * 完全 no-op(従来 1-pane 表示)。
 *
 * **user 哲学(U-16)との対応**:「別窓 + main の多動線歓迎、main を
 * render 窓として使いたい」を内部 in-window 経路で実現 ── 外部 popup 別窓を
 * 開かなくても、同じ window 内で「左 = 編集 / 右 = render preview」 を
 * 並べられる。気持ち良さ重視(U-16):toggle 1 ボタンで開閉可能。
 *
 * **canvas+wasm 前駆(U-18)**:secondary pane の render path は primary
 * と独立した DOM 構造を持つので、canvas 化 Phase δ で renderer を差し替え
 * る際に primary / secondary を別 renderer に振り分ける足場になる。
 */

import type { AppState } from '../state/app-state';
import { renderMarkdown, hasMarkdownSyntax } from '../../features/markdown/markdown-render';
import { parseFrontmatter, extractVars } from '../../features/markdown/frontmatter';
import { shellSplitViewEnabled } from './shell-flags';

let splitOpen = false;
let splitOrientation: 'right' | 'bottom' = 'right';

export function isSplitViewOpen(): boolean {
  return splitOpen;
}

export function getSplitOrientation(): 'right' | 'bottom' {
  return splitOrientation;
}

/**
 * split view を toggle する。flag OFF なら force OFF で no-op。
 * 戻り値:新状態(open / closed)。
 */
export function toggleSplitView(orientation: 'right' | 'bottom' = 'right'): boolean {
  if (!shellSplitViewEnabled()) {
    splitOpen = false;
    return false;
  }
  if (splitOpen && splitOrientation === orientation) {
    splitOpen = false;
  } else {
    splitOpen = true;
    splitOrientation = orientation;
  }
  return splitOpen;
}

export function closeSplitView(): void {
  splitOpen = false;
}

/** test 用 ── 強制リセット。 */
export function resetSplitViewState(): void {
  splitOpen = false;
  splitOrientation = 'right';
}

/**
 * Secondary pane(split で出る side panel)の DOM を build する。caller
 * (renderer)が **flag ON かつ splitOpen 時に** center 横 / 下に append。
 *
 * 現状は active entry を read-only markdown render するだけの minimal viewer。
 * 後続:
 *   - independent tab list
 *   - editor modeの secondary split
 *   - vertical split layout
 *   - 3+ pane の grid layout
 */
export function buildSplitViewElement(state: AppState): HTMLElement {
  const pane = document.createElement('aside');
  pane.className = `pkc-split-view pkc-split-${splitOrientation}`;
  pane.setAttribute('data-pkc-region', 'split-view');
  pane.setAttribute('data-pkc-split-orientation', splitOrientation);

  // ヘッダ:title + 「× Close」 button
  const header = document.createElement('div');
  header.className = 'pkc-split-view-header';
  const title = document.createElement('span');
  title.className = 'pkc-split-view-title';
  title.textContent = '🔍 Split View(read-only)';
  header.appendChild(title);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pkc-split-view-close';
  close.setAttribute('data-pkc-action', 'toggle-split-view');
  close.setAttribute('aria-label', 'Close split view');
  close.textContent = '×';
  header.appendChild(close);
  pane.appendChild(header);

  // body:現 active entry の read-only render
  const body = document.createElement('div');
  body.className = 'pkc-split-view-body pkc-md-rendered';
  pane.appendChild(body);

  const container = state.container;
  const lid = state.selectedLid;
  const entry = container && lid
    ? container.entries.find((e) => e.lid === lid)
    : null;
  if (!entry) {
    body.innerHTML = '<em style="color: var(--c-muted)">(no entry selected)</em>';
    return pane;
  }
  if (!entry.body) {
    body.innerHTML = '<em style="color: var(--c-muted)">(empty)</em>';
    return pane;
  }
  // text / textlog 等 markdown 系 archetype のみ詳細 render。それ以外は
  // 簡易 plain text fallback(POC scope、後続 PR で archetype 別 render path
  // を統合)。
  const containerId = container?.meta?.container_id ?? '';
  const source = entry.body;
  if (hasMarkdownSyntax(source)) {
    const vars = extractVars(source);
    const stripped = parseFrontmatter(source).body;
    body.innerHTML = renderMarkdown(stripped, {
      currentContainerId: containerId,
      vars,
    });
  } else {
    const pre = document.createElement('pre');
    pre.className = 'pkc-view-body';
    pre.textContent = source;
    body.innerHTML = '';
    body.appendChild(pre);
  }
  return pane;
}

/**
 * primary content と split pane の grid container を build する helper。
 * renderer が flag ON 時に center pane の中身を 2 半に分けたい時に使う。
 */
export function wrapWithSplitGrid(
  primaryContent: HTMLElement,
  state: AppState,
): HTMLElement {
  if (!splitOpen || !shellSplitViewEnabled()) return primaryContent;
  const grid = document.createElement('div');
  grid.className = `pkc-split-grid pkc-split-grid-${splitOrientation}`;
  grid.setAttribute('data-pkc-region', 'split-grid');
  const primaryWrap = document.createElement('div');
  primaryWrap.className = 'pkc-split-primary';
  primaryWrap.appendChild(primaryContent);
  grid.appendChild(primaryWrap);
  grid.appendChild(buildSplitViewElement(state));
  return grid;
}
