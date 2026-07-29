/** @vitest-environment happy-dom */
/**
 * C4(2026-07-28):**presenter を通した**描画結果キャッシュの pin。
 *
 * `center-block-cache.test.ts` はキャッシュ単体を見る。ここで見るのは
 * **配線**である ── key に `source` を渡し忘れている / flag OFF なのに
 * 使ってしまう、といった配線の誤りは単体 test では出ない。
 *
 * ## 見るもの
 *
 * 1. flag OFF なら**キャッシュを触らない**(既定 user の経路が変わらない)
 * 2. flag ON でも**出力は OFF と 1 バイトも変わらない**
 * 3. 🔴 本文を編集したら**描画が追従する**(古い描画を映さない)
 * 4. frontmatter だけ変えても追従する(`vars` / 見出し番号は key の一部)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setFlagSource } from '@core/flags';
import { getPresenter } from '@adapter/ui/detail-presenter';
import {
  invalidateRenderCache,
  renderCacheStats,
  resetRenderCacheStats,
} from '@adapter/ui/center-block-cache';
import type { Entry } from '@core/model/record';

const T = '2026-07-28T00:00:00Z';

function entry(body: string, lid = 'e1'): Entry {
  return { lid, title: 'T', archetype: 'text', body, created_at: T, updated_at: T } as Entry;
}

/**
 * 🔴 cache は**窓化経路にだけ**効く(実測で単独では買えないため)。
 * よって両方 ON にし、本文も閾値(40 ブロック)を超える量にする。
 */
function setFlags(on: boolean): void {
  setFlagSource('url', (name) => (
    (name === 'center.render_cache' || name === 'center.block_window') ? on : undefined
  ));
}

function render(e: Entry): HTMLElement {
  return getPresenter('text').renderBody(e);
}

/**
 * happy-dom には layout が無いので窓化は成立せず、`registerCenterBlockHost` の
 * **保険**(rAF で全ブロックへ戻す)が走る。出力を比べるときはそれを待つ。
 */
async function renderFull(e: Entry): Promise<string> {
  const el = render(e);
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  return el.innerHTML;
}

/** 閾値を超える本文を作る(1 節 = 6 ブロック)。 */
function heavyBody(extra = ''): string {
  let out = '';
  for (let i = 0; i < 12; i += 1) {
    out += `## 見出し ${i}\n\n段落 **強調** ${i}。\n\n| A |\n|---|\n| ${i} |\n\n`
      + `\`\`\`js\nconst x = ${i};\n\`\`\`\n\n- a${i}\n- b${i}\n\n> 引用 ${i}\n\n`;
  }
  return out + extra;
}

beforeEach(() => {
  invalidateRenderCache();
  resetRenderCacheStats();
  setFlagSource('url', () => undefined);
});
afterEach(() => {
  setFlagSource('url', () => undefined);
  invalidateRenderCache();
});

describe('C4 配線: flag OFF では触らない', () => {
  it('既定ではキャッシュに 1 件も入らない', () => {
    render(entry(heavyBody()));
    render(entry(heavyBody()));
    expect(renderCacheStats(), 'flag OFF なのにキャッシュが動いている')
      .toMatchObject({ entries: 0, hits: 0, misses: 0 });
  });

  it('🔴 cache だけ ON でも触らない(窓化と併用したときだけ効く)', () => {
    setFlagSource('url', (name) => (name === 'center.render_cache' ? true : undefined));
    render(entry(heavyBody()));
    render(entry(heavyBody()));
    expect(
      renderCacheStats(),
      '窓化していない経路で cache が動いている(実測では買えていない経路)',
    ).toMatchObject({ entries: 0, hits: 0, misses: 0 });
  });
});

describe('C4 配線: 窓化 + cache', () => {
  it('出力が flag OFF と完全一致する', async () => {
    const off = await renderFull(entry(heavyBody()));
    setFlags(true);
    const on = await renderFull(entry(heavyBody()));
    expect(on, 'キャッシュ経路で DOM が変わった').toBe(off);
  });

  it('2 回目は再利用する', () => {
    setFlags(true);
    render(entry(heavyBody()));
    render(entry(heavyBody()));
    expect(renderCacheStats()).toMatchObject({ hits: 1, misses: 1 });
  });

  it('🔴 本文を編集したら描画が追従する', async () => {
    setFlags(true);
    const before = await renderFull(entry(heavyBody()));
    const after = await renderFull(entry(heavyBody('\n\n追記した段落。\n')));
    expect(after, '編集したのに古い描画を映している').not.toBe(before);
    expect(after).toContain('追記した段落');
  });

  it('🔴 frontmatter だけ変えても追従する(vars / 見出し番号は出力に効く)', async () => {
    setFlags(true);
    const plain = await renderFull(entry(`${heavyBody()}\n{{vars.x}} です。\n`));
    const withVar = await renderFull(
      entry(`---\nvars:\n  x: ほげ\n---\n${heavyBody()}\n{{vars.x}} です。\n`),
    );
    expect(withVar, 'frontmatter の変化が描画に出ていない').not.toBe(plain);
    expect(withVar).toContain('ほげ');
  });

  it('別 entry の描画が混ざらない', async () => {
    setFlags(true);
    const a = await renderFull(entry(heavyBody('\n\nAAA。\n'), 'e1'));
    const b = await renderFull(entry(heavyBody('\n\nBBB。\n'), 'e2'));
    expect(a).toContain('AAA');
    expect(b).toContain('BBB');
    expect(a).not.toContain('BBB');
    expect(
      await renderFull(entry(heavyBody('\n\nAAA。\n'), 'e1')),
      'lid をまたいで混ざった',
    ).toBe(a);
  });
});
