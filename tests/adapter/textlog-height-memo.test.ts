/** @vitest-environment happy-dom */
/**
 * #938 R3 — textlog placeholder の実高さ memo。
 *
 * 「スクロールがついてこない」残存原因(placeholder 固定 160px と実体高の
 * 差でジオメトリが跳ねる)への対策: hydrate 実測高さを記録し、以後の
 * placeholder はその高さで場所を確保する。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderLogArticlePlaceholder,
  recordHydratedHeight,
  getMemoizedHeight,
  resetHydratedHeightMemo,
} from '@adapter/ui/textlog-hydrator';
import type { LogArticle } from '@features/textlog/textlog-doc';

const log = (id: string): LogArticle => ({
  id, text: 'hello', createdAt: '2026-07-20T00:00:00Z', flags: [],
}) as unknown as LogArticle;

const fmt = (ts: string): string => ts;

beforeEach(() => {
  resetHydratedHeightMemo();
});

describe('placeholder の高さ確保(#938 R3)', () => {
  it('memo なし: 従来どおり text body に 160px の仮 min-height', () => {
    const ph = renderLogArticlePlaceholder('lid1', log('a'), fmt);
    const textEl = ph.querySelector<HTMLElement>('.pkc-textlog-text-pending')!;
    expect(textEl.style.minHeight).toBe('160px');
    expect(ph.style.minHeight).toBe('');
  });

  it('memo あり: article 側に実測 min-height、仮 160px は外れる', () => {
    recordHydratedHeight('lid1', 'a', 412);
    const ph = renderLogArticlePlaceholder('lid1', log('a'), fmt);
    expect(ph.style.minHeight).toBe('412px');
    expect(ph.getAttribute('data-pkc-height-memo')).toBe('412');
    const textEl = ph.querySelector<HTMLElement>('.pkc-textlog-text-pending')!;
    expect(textEl.style.minHeight).toBe('');
  });

  it('160px より短い実測値もそのまま使う(短い log の過大確保をやめる)', () => {
    recordHydratedHeight('lid1', 'a', 48);
    const ph = renderLogArticlePlaceholder('lid1', log('a'), fmt);
    expect(ph.style.minHeight).toBe('48px');
  });

  it('lid が違えば別 memo(同 logId でも混ざらない)', () => {
    recordHydratedHeight('lid1', 'a', 100);
    expect(getMemoizedHeight('lid2', 'a')).toBeNull();
  });

  it('0 以下は記録しない(未レイアウト guard)', () => {
    recordHydratedHeight('lid1', 'a', 0);
    recordHydratedHeight('lid1', 'b', -5);
    expect(getMemoizedHeight('lid1', 'a')).toBeNull();
    expect(getMemoizedHeight('lid1', 'b')).toBeNull();
  });

  it('再記録で上書き(log 編集後の再 hydrate で収束)', () => {
    recordHydratedHeight('lid1', 'a', 100);
    recordHydratedHeight('lid1', 'a', 240);
    expect(getMemoizedHeight('lid1', 'a')).toBe(240);
  });

  it('上限到達時は最古の記録から捨てる(概算 LRU)', () => {
    for (let i = 0; i < 8000; i++) recordHydratedHeight('lid1', `k${i}`, 10 + i);
    recordHydratedHeight('lid1', 'overflow', 999);
    expect(getMemoizedHeight('lid1', 'k0')).toBeNull(); // 最古が消えた
    expect(getMemoizedHeight('lid1', 'overflow')).toBe(999);
    expect(getMemoizedHeight('lid1', 'k7999')).toBe(10 + 7999);
  });
});
