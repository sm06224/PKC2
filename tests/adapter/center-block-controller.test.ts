/** @vitest-environment happy-dom */
/**
 * C3-c(2026-07-28):center pane のブロック窓化の**指揮**を pin する。
 *
 * ## 守るものは「速さ」ではなく「本文が消えないこと」
 *
 * 窓化の事故は例外も test failure も出ない型になる(本文の途中から先が
 * 出ない・スクロールしても続きが来ない)。サイドバー窓化(L3-S5)で
 * 実際に踏んだので、ここでは**壊れ方**を直接 pin する:
 *
 *   1. 指揮が来ない場所に置かれたら **全ブロック**へ戻る(保険)
 *   2. scroller が測れなければ窓化しない(= 全ブロック)
 *   3. spacer は `applyHeadingFold` の**後**に置かれ、top-level に居る
 *   4. `min-height` が全体の推定総高 ── 再描画中に scroll 範囲が潰れない
 *   5. scroll すると窓が動く
 */
import { describe, expect, it, vi } from 'vitest';
import {
  BLOCK_WINDOW_PAINTED,
  finalizeCenterBlockWindows,
  registerCenterBlockHost,
  revealCenterBlock,
} from '@adapter/ui/center-block-controller';
import { applyHeadingFold } from '@features/markdown/heading-fold';
import {
  CENTER_BLOCK_DEFAULT_ESTIMATE,
  CENTER_BLOCK_OVERSCAN,
} from '@adapter/ui/center-block-window';

const N = 200;

function blocks(count = N): string[] {
  return Array.from({ length: count }, (_, i) =>
    (i % 5 === 0 ? `<h2>見出し ${i}</h2>` : `<p>段落 ${i}</p>`),
  );
}

/** 本文の要素だけ数える(spacer は除く)。 */
function contentCount(host: HTMLElement): number {
  return host.querySelectorAll('h2, p').length;
}

function mount(opts: { scrollerHeight: number }): {
  root: HTMLElement;
  scroller: HTMLElement;
  host: HTMLElement;
} {
  const root = document.createElement('div');
  const scroller = document.createElement('div');
  scroller.className = 'pkc-center-content';
  const host = document.createElement('div');
  host.className = 'pkc-view-body pkc-md-rendered';
  scroller.appendChild(host);
  root.appendChild(scroller);
  document.body.appendChild(root);
  Object.defineProperty(scroller, 'clientHeight', {
    configurable: true,
    get: () => opts.scrollerHeight,
  });
  let scrollTop = 0;
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (v: number) => { scrollTop = v; },
  });
  return { root, scroller, host };
}

describe('C3-c: 窓化の指揮', () => {
  it('🔴 指揮が来なければ rAF で全ブロックへ戻る(本文が切れない)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    expect(contentCount(host), '初回窓が全件になっている(窓化の意味がない)').toBeLessThan(N);

    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    expect(contentCount(host), '保険が効かず本文が切れたまま').toBe(N);
    expect(host.hasAttribute('data-pkc-block-window')).toBe(false);
    expect(host.style.minHeight, '窓化をやめたのに床が残っている').toBe('');
  });

  it('🔴 scroller の高さが測れなければ窓化しない(happy-dom の既定)', () => {
    const root = document.createElement('div');
    const scroller = document.createElement('div');
    scroller.className = 'pkc-center-content';
    const host = document.createElement('div');
    scroller.appendChild(host);
    root.appendChild(scroller);
    document.body.appendChild(root);

    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    expect(contentCount(host), 'clientHeight 0 なのに窓化してしまった').toBe(N);
  });

  it('scroller が測れれば窓だけ入る', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);

    // 高さは全部未実測 → 推定 48px。480px 分 + overscan。
    const visible = Math.ceil(480 / CENTER_BLOCK_DEFAULT_ESTIMATE) + 1 + CENTER_BLOCK_OVERSCAN;
    expect(contentCount(host)).toBeLessThanOrEqual(visible + CENTER_BLOCK_OVERSCAN);
    expect(contentCount(host)).toBeGreaterThan(0);
    expect(host.getAttribute('data-pkc-block-window')).toBe('on');
  });

  it('🔴 spacer は fold の後 = top-level に居る', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);

    const top = host.firstElementChild as HTMLElement;
    const bottom = host.lastElementChild as HTMLElement;
    expect(top.getAttribute('data-pkc-block-spacer'), 'spacer が <details> へ吸い込まれた').toBe('top');
    expect(bottom.getAttribute('data-pkc-block-spacer')).toBe('bottom');
    // fold は効いている(= spacer より内側に <details> が居る)
    expect(host.querySelector('details.pkc-heading-fold'), 'fold が走っていない').not.toBeNull();
  });

  it('min-height が全ブロックの推定総高になる(scroll 範囲の床)', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    expect(host.style.minHeight).toBe(`${N * CENTER_BLOCK_DEFAULT_ESTIMATE}px`);
  });

  it('scroll すると窓が動く(下端の段落が入れ替わる)', () => {
    const { root, scroller, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    const before = host.textContent ?? '';

    scroller.scrollTop = N * CENTER_BLOCK_DEFAULT_ESTIMATE / 2;
    scroller.dispatchEvent(new Event('scroll'));
    const after = host.textContent ?? '';

    expect(after, 'scroll しても窓が動いていない').not.toBe(before);
    expect(after).toContain('段落 10');
    expect(before, '窓が動いたのに先頭が残っている').toContain('見出し 0');
    expect(after).not.toContain('見出し 0');
  });

  it('scroll listener は render をまたいで 1 本に保つ', () => {
    const { root, scroller, host } = mount({ scrollerHeight: 480 });
    const add = vi.spyOn(scroller, 'addEventListener');
    const remove = vi.spyOn(scroller, 'removeEventListener');
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);

    const added = add.mock.calls.filter((c) => c[0] === 'scroll').length;
    const removed = remove.mock.calls.filter((c) => c[0] === 'scroll').length;
    expect(added - removed, 'listener が積み上がっている').toBe(1);
  });
});

describe('C3-d: 畳んだ見出しが窓の描き替えを生き延びる', () => {
  /** 見出し + 段落 5 個 × N 節。閾値を越える量。 */
  function sectioned(sections = 30): string[] {
    const out: string[] = [];
    for (let s = 0; s < sections; s += 1) {
      out.push(`<h2>節 ${s}</h2>`);
      for (let i = 0; i < 5; i += 1) out.push(`<p>本文 ${s}-${i}</p>`);
    }
    return out;
  }

  /** 最初の <details> を畳んで toggle を発火(native と同じ形にする)。 */
  function collapseFirst(host: HTMLElement): HTMLDetailsElement {
    const d = host.querySelector('details.pkc-heading-fold') as HTMLDetailsElement;
    d.open = false;
    d.dispatchEvent(new Event('toggle')); // happy-dom は自動で飛ばさない
    return d;
  }

  it('🔴 畳んだ状態が scroll 後も残る(applyHeadingFold は毎回 open で作る)', () => {
    const { root, scroller, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, sectioned(), applyHeadingFold);
    finalizeCenterBlockWindows(root);

    collapseFirst(host);
    expect(
      (host.querySelector('details.pkc-heading-fold') as HTMLDetailsElement).open,
      '畳めていない(前提が崩れている)',
    ).toBe(false);

    // 少しスクロールして窓を描き替える
    scroller.scrollTop = 200;
    scroller.dispatchEvent(new Event('scroll'));

    const first = host.querySelector('details.pkc-heading-fold') as HTMLDetailsElement | null;
    if (first && first.querySelector('summary')?.textContent === '節 0') {
      expect(first.open, '窓の描き替えで畳みが開いた').toBe(false);
    }
  });

  it('🔴 畳んだセクションの中身は DOM に入れない(見えないものに払わない)', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, sectioned(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    const before = host.querySelectorAll('p').length;
    expect(before, '前提: 本文が入っていない').toBeGreaterThan(0);

    collapseFirst(host);
    expect(
      host.textContent,
      '畳んだセクションの本文がまだ DOM に居る',
    ).not.toContain('本文 0-0');
    expect(host.textContent, '見出し自身まで消えた').toContain('節 0');
  });

  it('🔴 畳むと総高が縮む(spacer が嘘をつかない)', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, sectioned(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    const before = parseFloat(host.style.minHeight);

    collapseFirst(host);
    const after = parseFloat(host.style.minHeight);
    expect(after, `畳んでも総高が変わらない(${before} → ${after})`).toBeLessThan(before);
  });

  it('開き直すと中身が戻る', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, sectioned(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    collapseFirst(host);
    expect(host.textContent).not.toContain('本文 0-0');

    // ⚠ 畳んだ時点で窓を描き替えているので、**その時掴んだ `<details>` は
    //   もう DOM に居ない**。user がクリックするのは描き直された後の要素。
    //   古い参照に対する toggle は(意図どおり)無視される。
    const fresh = [...host.querySelectorAll('details.pkc-heading-fold')]
      .find((d) => d.querySelector('summary')?.textContent === '節 0') as HTMLDetailsElement;
    expect(fresh, '畳んだ見出しが画面から消えている').toBeTruthy();
    fresh.open = true;
    fresh.dispatchEvent(new Event('toggle'));
    expect(host.textContent, '開き直しても本文が戻らない').toContain('本文 0-0');
  });

  it('復元の往復で無限に描き直さない(open を書き戻しても収束する)', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, sectioned(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    collapseFirst(host);
    // 復元由来の toggle をもう一度流しても、状態が同じなら何も起きない
    const before = host.innerHTML;
    const d = host.querySelector('details.pkc-heading-fold') as HTMLDetailsElement;
    d.dispatchEvent(new Event('toggle'));
    expect(host.innerHTML, '同じ状態の toggle で描き直している').toBe(before);
  });
});

describe('C3: 窓の描き替えは「render cycle でしか走らない後処理」を壊さない', () => {
  it('🔴 窓の外へ出る DOM の Blob URL を revoke する(スクロールで漏らさない)', () => {
    const { root, scroller, host } = mount({ scrollerHeight: 480 });
    const revoked: string[] = [];
    const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u) => { revoked.push(u); });
    try {
      registerCenterBlockHost(host, blocks(), applyHeadingFold);
      finalizeCenterBlockWindows(root);
      // inline プレビュー相当(main.ts の後処理が付ける印)を窓の中へ差し込む
      const victim = host.querySelector('p');
      victim?.setAttribute('data-pkc-blob-url', 'blob:fake-1');

      scroller.scrollTop = 4000;
      scroller.dispatchEvent(new Event('scroll'));
      expect(revoked, '窓の外へ出た Blob URL を返していない').toContain('blob:fake-1');
    } finally {
      spy.mockRestore();
    }
  });

  it('🔴 窓を描き替えたら painted event を飛ばす(後処理の回し直しの合図)', () => {
    const { root, scroller, host } = mount({ scrollerHeight: 480 });
    const seen: Event[] = [];
    root.addEventListener(BLOCK_WINDOW_PAINTED, (e) => seen.push(e));
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    const afterFinalize = seen.length;
    expect(afterFinalize, '確定時に飛んでいない').toBeGreaterThan(0);

    scroller.scrollTop = 4000;
    scroller.dispatchEvent(new Event('scroll'));
    expect(seen.length, 'スクロールで窓が動いたのに飛んでいない').toBeGreaterThan(afterFinalize);
  });

  it('attach 前(presenter の初回窓)は飛ばさない ── 誰も聞いていない', () => {
    const detached = document.createElement('div'); // document へ入れない
    const seen: Event[] = [];
    detached.addEventListener(BLOCK_WINDOW_PAINTED, (e) => seen.push(e));
    registerCenterBlockHost(detached, blocks(), applyHeadingFold);
    expect(seen.length, 'attach 前から飛ばしている').toBe(0);
  });

  it('全件へ戻すとき(保険)も painted event を飛ばす', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const seen: Event[] = [];
    host.addEventListener(BLOCK_WINDOW_PAINTED, (e) => seen.push(e));
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    expect(seen.length, '保険で全件へ戻したのに合図が無い').toBeGreaterThan(0);
  });
});

describe('C3-e: 窓の外の要素を出す(deep link の不発を防ぐ)', () => {
  /** 見出しに id を振った本文(deep link の対象)。 */
  function withIds(count = 200): string[] {
    return Array.from({ length: count }, (_, i) => (
      i % 5 === 0 ? `<h2 id="sec-${i}">見出し ${i}</h2>` : `<p id="p-${i}">段落 ${i}</p>`
    ));
  }

  it('🔴 窓の外の見出しは querySelector で見つからない(これが事故の正体)', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, withIds(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    expect(
      host.querySelector('#sec-150'),
      '前提: 窓化されていない(全部 DOM に居る)',
    ).toBeNull();
  });

  it('reveal すると DOM に載り、探し直せる', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, withIds(), applyHeadingFold);
    finalizeCenterBlockWindows(root);

    const ok = revealCenterBlock(root, (html) => html.includes('id="sec-150"'));
    expect(ok, 'reveal が false を返した').toBe(true);
    expect(host.querySelector('#sec-150'), 'reveal したのに DOM に居ない').not.toBeNull();
  });

  it('畳んだセクションの中でも開いて出す', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, withIds(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    // 先頭セクションを畳む
    const d = host.querySelector('details.pkc-heading-fold') as HTMLDetailsElement;
    d.open = false;
    d.dispatchEvent(new Event('toggle'));
    expect(host.querySelector('#p-1'), '前提: 畳めていない').toBeNull();

    expect(revealCenterBlock(root, (html) => html.includes('id="p-1"'))).toBe(true);
    expect(host.querySelector('#p-1'), '畳んだセクションの中を出せていない').not.toBeNull();
  });

  it('一致しなければ false(呼び出し側が誤判定しない)', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, withIds(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    expect(revealCenterBlock(root, () => false)).toBe(false);
  });

  it('窓化していない host では false(全部 DOM に居るので出す必要が無い)', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    expect(revealCenterBlock(root, () => true)).toBe(false);
  });
});

describe('C3-f: 実測を取り込んだら scrollTop を補正する(内容を固定する)', () => {
  /**
   * 窓の上には推定高で積まれたブロックがある。実測が入ると推定(中央値)が
   * 更新され、**同じ scrollTop なのに画面の内容がずれる**。
   * 実害は「狙って押したら別の要素が反応した」── 例外は出ない。
   */
  it('🔴 推定が実測に置き換わったぶん scrollTop がずれる', () => {
    const { root, scroller, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);

    // 窓の先頭が 0 でない位置まで動かす(offsets[start] が 0 だと補正は起きない)
    scroller.scrollTop = 100 * CENTER_BLOCK_DEFAULT_ESTIMATE;
    scroller.dispatchEvent(new Event('scroll'));
    const before = scroller.scrollTop;

    // ここから実測が返るようにする(既定の推定 48px より大きい 120px)
    const rect = (top: number, height: number): DOMRect => ({
      top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top,
      toJSON: () => ({}),
    } as DOMRect);
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: Element): DOMRect {
        if (this === scroller) return rect(0, 480);
        return rect(10, 120);
      });
    try {
      scroller.dispatchEvent(new Event('scroll'));
    } finally {
      spy.mockRestore();
    }

    expect(
      scroller.scrollTop,
      '実測を取り込んだのに scrollTop を補正していない(画面の内容がずれる)',
    ).not.toBe(before);
  });
});
