/**
 * TEXTLOG → TEXT 変換中の進捗 modal(user bug 2026-05-27「凄まじく重い…遂行は絶対」)。
 *
 * Web Worker での変換中、user に「処理中」 を可視化 + cancel 動線を提供する。
 * 0..1 の progress を bar で表示、cancel button で abort signal を発火。
 *
 * Singleton(1 度に 1 modal)、DOM mount は app root。
 */

const REGION = 'textlog-conversion-progress';
let currentOverlay: HTMLElement | null = null;
let currentBar: HTMLElement | null = null;
let currentLabel: HTMLElement | null = null;

export interface ProgressModalData {
  /** 進捗 modal のタイトル context 用、元 textlog の title。 */
  sourceTitle: string;
  /** cancel button click 時に呼ばれる(AbortController.abort()想定)。 */
  onCancel: () => void;
}

/**
 * 進捗 modal を開く。既に他 modal が開いていれば閉じてから開く。
 * 戻り値:DOM mount 成功なら true、document 不在(unit test 等)なら false。
 */
export function openTextlogConversionProgress(
  root: HTMLElement,
  data: ProgressModalData,
): boolean {
  closeTextlogConversionProgress();

  if (typeof document === 'undefined') return false;

  const overlay = document.createElement('div');
  overlay.className = 'pkc-textlog-conversion-overlay';
  overlay.setAttribute('data-pkc-region', REGION);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'TEXT への変換中');

  const panel = document.createElement('div');
  panel.className = 'pkc-textlog-conversion-panel';

  const heading = document.createElement('h3');
  heading.className = 'pkc-textlog-conversion-heading';
  heading.textContent = `${data.sourceTitle || '(untitled)'} を TEXT に変換中…`;
  panel.appendChild(heading);

  const subtitle = document.createElement('p');
  subtitle.className = 'pkc-textlog-conversion-subtitle';
  subtitle.textContent = '選択した log を新規 TEXT entry にまとめています。';
  panel.appendChild(subtitle);

  const barWrap = document.createElement('div');
  barWrap.className = 'pkc-textlog-conversion-bar-wrap';
  barWrap.setAttribute('role', 'progressbar');
  barWrap.setAttribute('aria-valuemin', '0');
  barWrap.setAttribute('aria-valuemax', '100');
  barWrap.setAttribute('aria-valuenow', '0');

  const bar = document.createElement('div');
  bar.className = 'pkc-textlog-conversion-bar';
  bar.style.width = '0%';
  barWrap.appendChild(bar);
  panel.appendChild(barWrap);

  const label = document.createElement('div');
  label.className = 'pkc-textlog-conversion-label';
  label.textContent = '0%';
  panel.appendChild(label);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'pkc-textlog-conversion-buttons';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pkc-btn pkc-textlog-conversion-cancel';
  cancelBtn.setAttribute('type', 'button');
  cancelBtn.textContent = 'キャンセル';
  cancelBtn.addEventListener('click', () => {
    data.onCancel();
    closeTextlogConversionProgress();
  });
  buttonRow.appendChild(cancelBtn);
  panel.appendChild(buttonRow);

  overlay.appendChild(panel);
  root.appendChild(overlay);

  currentOverlay = overlay;
  currentBar = bar;
  currentLabel = label;
  return true;
}

/**
 * 進捗を更新(0..1)。modal が開いていなければ no-op。
 */
export function updateTextlogConversionProgress(value: number): void {
  if (!currentOverlay || !currentBar || !currentLabel) return;
  const clamped = Math.max(0, Math.min(1, value));
  const pct = Math.round(clamped * 100);
  currentBar.style.width = `${pct}%`;
  currentLabel.textContent = `${pct}%`;
  currentOverlay.querySelector('[role="progressbar"]')?.setAttribute('aria-valuenow', String(pct));
}

/**
 * 進捗 modal を閉じる(no-op safe)。done / error / cancel いずれの完了経路でも呼ぶ。
 */
export function closeTextlogConversionProgress(): void {
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
    currentBar = null;
    currentLabel = null;
  }
}
