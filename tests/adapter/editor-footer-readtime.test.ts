/**
 * @vitest-environment happy-dom
 *
 * pgc-127 wave-δ #3(MASTER.md §7 text):editor footer wordcount に read
 * time 推定を追加(reading-time 互換)。
 *
 * Hybrid 計算:`max(英語 wpm 換算、CJK char cpm 換算)` を読み時間とする
 *   - 英語:200 words / minute
 *   - 日本語(CJK):600 chars / minute
 * 混在 doc も妥当に計算できる。
 *
 * Test 範囲:
 *   - estimateReadTimeMinutes / formatReadTime の pure feature 関数
 *   - editor footer に "~N min read" / "<1 min" が出る
 *   - live update に追従
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  estimateReadTimeMinutes,
  formatReadTime,
  WORDCOUNT_LIVE_DEBOUNCE_MS,
} from '@adapter/ui/editor-footer-wordcount';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(body: string): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry', body, archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [], revisions: [], assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.editor_footer_wordcount_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-127 estimateReadTimeMinutes / formatReadTime(pure)', () => {
  it('空 body → 0', () => {
    expect(estimateReadTimeMinutes('')).toBe(0);
  });

  it('英語 200 words ≈ 1 min', () => {
    const body = Array(200).fill('word').join(' ');
    expect(estimateReadTimeMinutes(body)).toBeCloseTo(1, 1);
  });

  it('英語 600 words ≈ 3 min', () => {
    const body = Array(600).fill('word').join(' ');
    expect(estimateReadTimeMinutes(body)).toBeCloseTo(3, 1);
  });

  it('日本語 600 chars ≈ 1 min', () => {
    const body = '日'.repeat(600);
    expect(estimateReadTimeMinutes(body)).toBeCloseTo(1, 1);
  });

  it('混在 doc(英語 100 words + 日本語 300 chars):大きい方が採用される', () => {
    const eng = Array(100).fill('word').join(' '); // 0.5 min
    const jp = '日'.repeat(300); // 0.5 min
    const body = eng + jp;
    const m = estimateReadTimeMinutes(body);
    // 英語 100 words = 0.5 min、日本語 300 chars = 0.5 min、max = 0.5
    expect(m).toBeCloseTo(0.5, 1);
  });

  it('formatReadTime(0)→ "<1 min"', () => {
    expect(formatReadTime(0)).toBe('<1 min');
  });

  it('formatReadTime(0.4)→ "<1 min"(round に <1)', () => {
    expect(formatReadTime(0.4)).toBe('<1 min');
  });

  it('formatReadTime(1)→ "~1 min read"', () => {
    expect(formatReadTime(1)).toBe('~1 min read');
  });

  it('formatReadTime(3.4)→ "~3 min read"', () => {
    expect(formatReadTime(3.4)).toBe('~3 min read');
  });
});

describe('pgc-127 read time が editor footer に表示', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (teardown) { teardown(); teardown = null; }
    setFlag(false);
  });

  function bootEditing(c: Container): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function metrics(): HTMLElement | null {
    return root.querySelector('.pkc-editor-footer-metrics');
  }
  function bodyTextarea(): HTMLTextAreaElement | null {
    return root.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
  }

  it('flag ON + 空 body:footer に "<1 min" が出る', () => {
    setFlag(true);
    bootEditing(makeContainer(''));
    expect(metrics()?.textContent).toContain('<1 min');
  });

  it('flag ON + 200 words の英語 body:"~1 min read"', () => {
    setFlag(true);
    const body = Array(200).fill('word').join(' ');
    bootEditing(makeContainer(body));
    expect(metrics()?.textContent).toContain('~1 min read');
  });

  it('flag ON + 600 chars の日本語 body:"~1 min read"', () => {
    setFlag(true);
    const body = '日'.repeat(600);
    bootEditing(makeContainer(body));
    expect(metrics()?.textContent).toContain('~1 min read');
  });

  it('flag ON + data-pkc-read-minutes attribute も同時設定', () => {
    setFlag(true);
    const body = Array(400).fill('word').join(' '); // 2 min
    bootEditing(makeContainer(body));
    const m = metrics();
    const minutes = parseFloat(m?.getAttribute('data-pkc-read-minutes') ?? '0');
    expect(minutes).toBeCloseTo(2, 1);
  });

  it('flag ON + live update で read time が追従', () => {
    // live wordcount は debounce 経由になったので fake timer で flush。
    vi.useFakeTimers();
    try {
      setFlag(true);
      bootEditing(makeContainer('short'));
      expect(metrics()?.textContent).toContain('<1 min');
      // 1000 words 入力 → 5 min
      const long = Array(1000).fill('word').join(' ');
      const ta = bodyTextarea()!;
      ta.value = long;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      vi.advanceTimersByTime(WORDCOUNT_LIVE_DEBOUNCE_MS);
      expect(metrics()?.textContent).toContain('~5 min read');
    } finally {
      vi.useRealTimers();
    }
  });
});
