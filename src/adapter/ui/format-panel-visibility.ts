// Format panel default-hidden + toggle button(MASTER.md §6.4、
// pgc-110 wave-γ #11)。
//
// `shellFormatPanelDefaultHiddenEnabled` flag ON 時に renderer から call。
// editor 上部に「🎨 Format」 toggle button を出し、click で format panel
// 表示を flip する。state は module-local(render 越境せず color picker /
// activity bar と同流儀)、デフォルト hidden。
//
// 本 PR は scope 最小化のため keyboard shortcut(Ctrl+R)/ selection
// floating inline toolbar は実装しない ── それぞれ別 PR で。

let formatPanelVisible = false;

export function isFormatPanelVisible(): boolean {
  return formatPanelVisible;
}

export function setFormatPanelVisible(v: boolean): void {
  formatPanelVisible = v;
}

export function toggleFormatPanelVisible(): void {
  formatPanelVisible = !formatPanelVisible;
}

export function resetFormatPanelVisibility(): void {
  formatPanelVisible = false;
}

export function buildFormatPanelToggleButton(): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'pkc-format-panel-toggle';
  btn.setAttribute('data-pkc-action', 'toggle-format-panel');
  btn.setAttribute('aria-pressed', String(formatPanelVisible));
  if (formatPanelVisible) {
    btn.setAttribute('data-pkc-active', 'true');
    btn.setAttribute('title', 'Hide format panel');
    btn.textContent = '🎨 Format ▾';
  } else {
    btn.setAttribute('title', 'Show format panel');
    btn.textContent = '🎨 Format ▸';
  }
  return btn;
}
