/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { renderFormatPanel } from '@adapter/ui/format-panel';

describe('pgc-178 button format toolbar migration(audit step 4)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('case 1: 全 operation button に pkc-button-base + pkc-button-size-toolbar class が付く(audit step 4 adopt)', () => {
    const panel = renderFormatPanel('text');
    document.body.appendChild(panel);
    // operation button は data-pkc-format-label を持つ
    const opBtns = panel.querySelectorAll<HTMLButtonElement>('button[data-pkc-format-label]');
    expect(opBtns.length).toBeGreaterThan(0);
    for (const btn of Array.from(opBtns)) {
      expect(btn.classList.contains('pkc-button-base')).toBe(true);
      expect(btn.classList.contains('pkc-button-size-toolbar')).toBe(true);
      expect(btn.classList.contains('pkc-format-panel-btn')).toBe(true); // 既存維持
    }
  });

  it('case 2: picker trigger(summary)に base helper + size-toolbar class', () => {
    const panel = renderFormatPanel('text');
    const triggers = panel.querySelectorAll<HTMLElement>('summary.pkc-format-panel-picker-trigger');
    expect(triggers.length).toBeGreaterThan(0);
    for (const t of Array.from(triggers)) {
      expect(t.classList.contains('pkc-button-base')).toBe(true);
      expect(t.classList.contains('pkc-button-size-toolbar')).toBe(true);
      expect(t.classList.contains('pkc-format-panel-btn')).toBe(true);
      expect(t.classList.contains('pkc-format-panel-picker-trigger')).toBe(true);
    }
  });

  it('case 3: picker option button(data-pkc-picker-value)に base helper + size-toolbar class', () => {
    const panel = renderFormatPanel('text');
    const opts = panel.querySelectorAll<HTMLButtonElement>('button[data-pkc-picker-value]');
    expect(opts.length).toBeGreaterThan(0);
    for (const btn of Array.from(opts)) {
      expect(btn.classList.contains('pkc-button-base')).toBe(true);
      expect(btn.classList.contains('pkc-button-size-toolbar')).toBe(true);
      expect(btn.classList.contains('pkc-format-panel-btn')).toBe(true);
    }
  });

  it('case 4: launcher button(data-pkc-launcher)に base helper + size-toolbar class', () => {
    const panel = renderFormatPanel('text');
    const launchers = panel.querySelectorAll<HTMLButtonElement>('button[data-pkc-launcher]');
    expect(launchers.length).toBeGreaterThan(0);
    for (const btn of Array.from(launchers)) {
      expect(btn.classList.contains('pkc-button-base')).toBe(true);
      expect(btn.classList.contains('pkc-button-size-toolbar')).toBe(true);
      expect(btn.classList.contains('pkc-format-panel-btn')).toBe(true);
    }
  });

  it('case 5: class order 安定性(base helper 先頭、format-panel-btn 後ろ = specificity 順)', () => {
    const panel = renderFormatPanel('text');
    const btn = panel.querySelector<HTMLButtonElement>('button[data-pkc-format-label]');
    const classes = Array.from(btn?.classList ?? []);
    expect(classes[0]).toBe('pkc-button-base');
    expect(classes[1]).toBe('pkc-button-size-toolbar');
    expect(classes).toContain('pkc-format-panel-btn');
  });

  it('case 6: archetype 別 launcher が出ても class が同一(format toolbar 全 button が unified base)', () => {
    // text archetype と todo archetype で launcher の出方が変わる(search group が text 限定)
    const textPanel = renderFormatPanel('text');
    const todoPanel = renderFormatPanel('todo');
    const allBtnsText = textPanel.querySelectorAll<HTMLButtonElement>('button.pkc-format-panel-btn');
    const allBtnsTodo = todoPanel.querySelectorAll<HTMLButtonElement>('button.pkc-format-panel-btn');
    expect(allBtnsText.length).toBeGreaterThan(allBtnsTodo.length); // text の方が多い(search launcher)
    for (const btn of Array.from(allBtnsText)) {
      expect(btn.classList.contains('pkc-button-base')).toBe(true);
      expect(btn.classList.contains('pkc-button-size-toolbar')).toBe(true);
    }
    for (const btn of Array.from(allBtnsTodo)) {
      expect(btn.classList.contains('pkc-button-base')).toBe(true);
      expect(btn.classList.contains('pkc-button-size-toolbar')).toBe(true);
    }
  });

  it('case 7: panel 全体で format-panel-btn 系 element が ~40 件 ある(audit doc の見積もり validation)', () => {
    const panel = renderFormatPanel('text');
    // button (op + picker option + launcher) + summary (picker trigger)
    const btns = panel.querySelectorAll<HTMLElement>('.pkc-format-panel-btn');
    // audit doc は ~40 件と見積もり、実機は op 29 + picker option 多数(font-size 5 + family 3 + color 6 + bg 6 = 20)+ picker trigger 4 + launcher 数件 = 50+ 程度
    expect(btns.length).toBeGreaterThanOrEqual(30);
    // 全 element に base + size-toolbar 適用
    for (const el of Array.from(btns)) {
      expect(el.classList.contains('pkc-button-base')).toBe(true);
      expect(el.classList.contains('pkc-button-size-toolbar')).toBe(true);
    }
  });
});
