/** @vitest-environment happy-dom */
/**
 * 2026-07-03 user 報告「システムと反対のテーマを選択すると mermaid が
 * 視認不能」:mermaid theme はアプリの明示テーマ(data-pkc-theme)を
 * 最優先し、auto(属性なし)のときだけ OS の prefers-color-scheme に
 * 従うこと。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectMermaidTheme, resetMermaidRendererState } from '@adapter/ui/mermaid-renderer';

let root: HTMLElement;

function mockOsScheme(dark: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark && query.includes('dark'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  (window as unknown as { matchMedia: unknown }).matchMedia =
    (globalThis as unknown as { matchMedia: unknown }).matchMedia;
}

beforeEach(() => {
  resetMermaidRendererState();
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  root.remove();
  vi.unstubAllGlobals();
  resetMermaidRendererState();
});

describe('detectMermaidTheme — app theme first, OS fallback', () => {
  it('app=dark beats OS=light (the reported mismatch)', () => {
    mockOsScheme(false); // OS light
    root.setAttribute('data-pkc-theme', 'dark');
    expect(detectMermaidTheme()).toBe('dark');
  });

  it('app=light beats OS=dark (reverse mismatch)', () => {
    mockOsScheme(true); // OS dark
    root.setAttribute('data-pkc-theme', 'light');
    expect(detectMermaidTheme()).toBe('default');
  });

  it('auto (no attribute) follows the OS scheme', () => {
    mockOsScheme(true);
    expect(detectMermaidTheme()).toBe('dark');
    mockOsScheme(false);
    expect(detectMermaidTheme()).toBe('default');
  });
});
