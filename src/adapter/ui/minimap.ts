/**
 * #903(user 要望 2026-07-12)— center pane ミニマップの描画 + 配線。
 *
 * 抽象化バー描画(features/minimap/minimap-model)を `.pkc-center` 右端に
 * absolute 配置し、viewport indicator + クリック / ドラッグでスクロールを
 * 提供する。flag `shell.minimap_enabled`(既定 OFF)で完全 no-op。
 *
 * 呼び出し契約:main.ts が **render 後に毎回** `syncMinimap(root)` を呼ぶ
 * (applyWcagResolverNow と同じ疎結合 pattern)。バー再構築は render 時のみ、
 * scroll 中は viewport indicator の位置更新だけ(rAF throttle)。
 */

import { buildMinimapModel } from '../../features/minimap/minimap-model';
import { shellMinimapEnabled } from './shell-flags';

const REGION = 'minimap';

interface MinimapWiring {
  scroller: HTMLElement;
  onScroll: () => void;
}
/** center ごとの scroll listener を張り替えるための記録(重複 attach 防止)。 */
const wired = new WeakMap<HTMLElement, MinimapWiring>();

function removeMinimap(center: HTMLElement): void {
  const existing = center.querySelector<HTMLElement>(`[data-pkc-region="${REGION}"]`);
  if (existing) existing.remove();
  const w = wired.get(center);
  if (w) {
    w.scroller.removeEventListener('scroll', w.onScroll);
    wired.delete(center);
  }
}

/** viewport indicator の位置を現 scroll 位置に合わせる。 */
function updateViewport(map: HTMLElement, scroller: HTMLElement): void {
  const indicator = map.querySelector<HTMLElement>('.pkc-minimap-viewport');
  if (!indicator) return;
  const contentHeight = Math.max(1, scroller.scrollHeight);
  const topPct = (scroller.scrollTop / contentHeight) * 100;
  const heightPct = (scroller.clientHeight / contentHeight) * 100;
  indicator.style.top = `${topPct}%`;
  indicator.style.height = `${Math.min(100, heightPct)}%`;
}

/** map 上の y 座標(px)→ scroller の scrollTop へ写像(クリック点が viewport 中央)。 */
function scrollToMapY(map: HTMLElement, scroller: HTMLElement, clientY: number): void {
  const rect = map.getBoundingClientRect();
  const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  const target = ratio * scroller.scrollHeight - scroller.clientHeight / 2;
  scroller.scrollTop = Math.max(0, Math.min(target, scroller.scrollHeight - scroller.clientHeight));
}

/**
 * flag ON なら center pane のミニマップを(再)構築、OFF なら撤去。
 * render 後に毎回呼ばれる前提(冪等)。
 */
export function syncMinimap(root: HTMLElement): void {
  const center = root.querySelector<HTMLElement>('.pkc-center');
  if (!center) return;
  const scroller = center.querySelector<HTMLElement>('.pkc-center-content');
  if (!shellMinimapEnabled() || !scroller) {
    removeMinimap(center);
    return;
  }

  // render で center / scroller が作り直されるため、常に作り直す(冪等・軽量:
  // バー数は block 数オーダー)。scroll listener も張り替える。
  removeMinimap(center);

  const model = buildMinimapModel(scroller);
  const map = document.createElement('aside');
  map.className = 'pkc-minimap';
  map.setAttribute('data-pkc-region', REGION);
  map.setAttribute('aria-hidden', 'true'); // 補助 UI(スクリーンリーダーには本文が正)

  for (const b of model.blocks) {
    const bar = document.createElement('div');
    bar.className = 'pkc-minimap-bar';
    bar.setAttribute('data-pkc-minimap-kind', b.kind);
    if (b.level !== undefined) bar.setAttribute('data-pkc-minimap-level', String(b.level));
    bar.style.top = `${(b.top / model.contentHeight) * 100}%`;
    bar.style.height = `${Math.max(0.4, (b.height / model.contentHeight) * 100)}%`;
    map.appendChild(bar);
  }

  const indicator = document.createElement('div');
  indicator.className = 'pkc-minimap-viewport';
  map.appendChild(indicator);

  // クリック / ドラッグ → スクロール
  let dragging = false;
  map.addEventListener('pointerdown', (e) => {
    dragging = true;
    map.setPointerCapture?.(e.pointerId);
    scrollToMapY(map, scroller, e.clientY);
    e.preventDefault();
  });
  map.addEventListener('pointermove', (e) => {
    if (dragging) scrollToMapY(map, scroller, e.clientY);
  });
  const endDrag = (): void => { dragging = false; };
  map.addEventListener('pointerup', endDrag);
  map.addEventListener('pointercancel', endDrag);
  // pointer events が無い環境(古い WebView / test)向けの click fallback
  map.addEventListener('click', (e) => { scrollToMapY(map, scroller, e.clientY); });

  // scroll → viewport indicator(rAF throttle)
  let rafPending = false;
  const onScroll = (): void => {
    if (rafPending) return;
    rafPending = true;
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (fn: () => void): number => { fn(); return 0; };
    raf(() => {
      rafPending = false;
      updateViewport(map, scroller);
    });
  };
  scroller.addEventListener('scroll', onScroll);
  wired.set(center, { scroller, onScroll });

  center.appendChild(map);
  updateViewport(map, scroller);
}
