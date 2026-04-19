/**
 * Optimization confirmation modal.
 *
 * Surfaced after the optimizer has successfully produced a smaller
 * blob but no remembered preference covers the current surface.
 * See behavior contract §4-2 / §4-3.
 *
 * All actionable elements carry data-pkc-action / data-pkc-optimize
 * attributes so tests and action-binder-style event delegation can
 * drive the UI without relying on class names.
 */

export interface OptimizeConfirmParams {
  filename: string;
  originalSize: number;
  optimizedSize: number;
  originalDimensions: { width: number; height: number };
  optimizedDimensions: { width: number; height: number };
  resized: boolean;
}

export type OptimizeConfirmAction = 'optimize' | 'decline';

export interface OptimizeConfirmResult {
  action: OptimizeConfirmAction;
  keepOriginal: boolean;
  remember: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function percentReduction(original: number, optimized: number): number {
  if (original <= 0) return 0;
  return Math.max(0, Math.round(((original - optimized) / original) * 100));
}

export function showOptimizeConfirm(params: OptimizeConfirmParams): Promise<OptimizeConfirmResult> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-pkc-region', 'optimize-confirm');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:10000',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:rgba(0,0,0,0.45)',
    ].join(';');

    const dialog = document.createElement('div');
    dialog.style.cssText = [
      'background:var(--c-bg,#fff)',
      'color:var(--c-fg,#000)',
      'border:1px solid var(--c-border,#ccc)',
      'border-radius:8px',
      'box-shadow:0 6px 24px rgba(0,0,0,0.2)',
      'padding:20px',
      'min-width:360px',
      'max-width:480px',
      'font-family:system-ui,sans-serif',
      'font-size:14px',
    ].join(';');

    const title = document.createElement('h2');
    title.textContent = '画像を最適化しますか？';
    title.style.cssText = 'margin:0 0 12px 0;font-size:16px;';
    dialog.appendChild(title);

    const filenameEl = document.createElement('div');
    filenameEl.setAttribute('data-pkc-optimize', 'filename');
    filenameEl.textContent = params.filename;
    filenameEl.style.cssText = 'font-family:monospace;color:var(--c-muted,#666);margin-bottom:8px;word-break:break-all;';
    dialog.appendChild(filenameEl);

    const sizeCompare = document.createElement('div');
    sizeCompare.setAttribute('data-pkc-optimize', 'size-compare');
    sizeCompare.textContent = `${formatSize(params.originalSize)} → ${formatSize(params.optimizedSize)}（${percentReduction(params.originalSize, params.optimizedSize)}% 削減）`;
    sizeCompare.style.cssText = 'font-weight:600;margin-bottom:4px;';
    dialog.appendChild(sizeCompare);

    if (params.resized) {
      const dimCompare = document.createElement('div');
      dimCompare.setAttribute('data-pkc-optimize', 'dimension-compare');
      dimCompare.textContent = `${params.originalDimensions.width}×${params.originalDimensions.height} → ${params.optimizedDimensions.width}×${params.optimizedDimensions.height}`;
      dimCompare.style.cssText = 'color:var(--c-muted,#666);margin-bottom:12px;';
      dialog.appendChild(dimCompare);
    }

    const keepOriginalLabel = document.createElement('label');
    keepOriginalLabel.style.cssText = 'display:flex;align-items:center;gap:8px;margin:12px 0;cursor:pointer;';
    const keepOriginalInput = document.createElement('input');
    keepOriginalInput.type = 'checkbox';
    keepOriginalInput.setAttribute('data-pkc-optimize', 'keep-original');
    keepOriginalLabel.appendChild(keepOriginalInput);
    const keepOriginalText = document.createElement('span');
    keepOriginalText.textContent = `原画も保持する（+${formatSize(params.originalSize)}）`;
    keepOriginalLabel.appendChild(keepOriginalText);
    dialog.appendChild(keepOriginalLabel);

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display:flex;gap:8px;margin-top:16px;';

    const optimizeBtn = document.createElement('button');
    optimizeBtn.type = 'button';
    optimizeBtn.setAttribute('data-pkc-action', 'confirm-optimize');
    optimizeBtn.textContent = '最適化して保存';
    optimizeBtn.style.cssText = 'flex:1;padding:8px 12px;border:1px solid var(--c-accent,#06c);background:var(--c-accent,#06c);color:#fff;border-radius:4px;cursor:pointer;';
    buttonRow.appendChild(optimizeBtn);

    const declineBtn = document.createElement('button');
    declineBtn.type = 'button';
    declineBtn.setAttribute('data-pkc-action', 'decline-optimize');
    declineBtn.textContent = 'そのまま保存';
    declineBtn.style.cssText = 'flex:1;padding:8px 12px;border:1px solid var(--c-border,#ccc);background:var(--c-bg,#fff);color:var(--c-fg,#000);border-radius:4px;cursor:pointer;';
    buttonRow.appendChild(declineBtn);

    dialog.appendChild(buttonRow);

    const rememberLabel = document.createElement('label');
    rememberLabel.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer;color:var(--c-muted,#666);';
    const rememberInput = document.createElement('input');
    rememberInput.type = 'checkbox';
    rememberInput.setAttribute('data-pkc-optimize', 'remember-choice');
    rememberLabel.appendChild(rememberInput);
    const rememberText = document.createElement('span');
    rememberText.textContent = '今後も同じ設定を使う';
    rememberLabel.appendChild(rememberText);
    dialog.appendChild(rememberLabel);

    const warning = document.createElement('div');
    warning.setAttribute('data-pkc-optimize', 'lossy-warning');
    warning.textContent = '※ 非可逆変換です。最適化後の画像は元に戻せません。原画を保持したい場合は上のチェックを入れてください。';
    warning.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px solid var(--c-border,#ddd);color:var(--c-muted,#666);font-size:12px;line-height:1.4;';
    dialog.appendChild(warning);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    let resolved = false;
    const finish = (result: OptimizeConfirmResult): void => {
      if (resolved) return;
      resolved = true;
      overlay.remove();
      resolve(result);
    };

    optimizeBtn.addEventListener('click', () => {
      finish({
        action: 'optimize',
        keepOriginal: keepOriginalInput.checked,
        remember: rememberInput.checked,
      });
    });

    declineBtn.addEventListener('click', () => {
      finish({
        action: 'decline',
        keepOriginal: keepOriginalInput.checked,
        remember: rememberInput.checked,
      });
    });

    // Focus the primary action so keyboard users can confirm immediately.
    queueMicrotask(() => optimizeBtn.focus());
  });
}
