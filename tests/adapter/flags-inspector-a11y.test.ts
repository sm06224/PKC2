/** @vitest-environment happy-dom */
/**
 * flags-inspector のアクセシビリティ推奨掲示 wiring テスト。
 * dark テーマ(WCAG 未達ペアあり)+ balance OFF(既定)で、inspector に
 * 推奨セクションが出て balance flag への誘導が掲示されることを観測する。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderFlagsInspector } from '@adapter/ui/flags-inspector';

const DARK_CSS = `#pkc-root{
  --c-bg:#0d0f0a; --c-surface:#111510; --c-hover:#162010;
  --c-fg:#c8d8b0; --c-muted:#5a6e4a; --c-toc-secondary:#9ab37e;
  --c-accent:#33ff66; --c-danger:#ff4444; --c-warn:#ffaa22;
  --c-info:#3b82f6; --c-success:#33ff66;
}`;

beforeEach(() => {
  document.head.innerHTML = `<style>${DARK_CSS}</style>`;
  document.body.innerHTML = '';
  const root = document.createElement('div');
  root.id = 'pkc-root';
  root.setAttribute('data-pkc-theme', 'dark');
  document.body.appendChild(root);
});

describe('flags-inspector a11y recommendations', () => {
  it('dark + balance OFF → 推奨セクションが掲示され balance flag を誘導', () => {
    const overlay = renderFlagsInspector();
    const section = overlay.querySelector('[data-pkc-region="a11y-recommendations"]');
    expect(section).not.toBeNull();
    // balance-off の提案(flag chip)が含まれる
    const text = section!.textContent ?? '';
    expect(text).toContain('theme.wcag_balance_app');
    expect(text).toContain('未達');
    // warn/suggest があるので open 展開されている
    expect((section as HTMLDetailsElement).hasAttribute('open')).toBe(true);
  });

  it('推奨セクションは flag 行より前(body 先頭)に出る', () => {
    const overlay = renderFlagsInspector();
    const body = overlay.querySelector('[data-pkc-region="flags-inspector-body"]')!;
    const section = body.querySelector('[data-pkc-region="a11y-recommendations"]');
    expect(section).not.toBeNull();
    // body の最初の子が推奨セクション
    expect(body.firstElementChild).toBe(section);
  });
});
