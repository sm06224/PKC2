/**
 * お知らせカードは **プレーンテキスト**で描かれる(2026-07-28、実際に踏んだ)。
 *
 * ## 何が起きていたか
 *
 * `startup-notice.ts` の描画は
 *   heading.textContent = `📢 ${latest.title}`;
 *   li.textContent = item;
 * である。つまり markdown は一切解釈されない。にもかかわらず
 * `STARTUP_NOTICES` の本文は `**強調**` で書かれており、user の画面には
 * **アスタリスクがそのまま出ていた**(直近数リリースぶん)。
 *
 * PR 運用規律(CLAUDE.md「user-facing 変更はお知らせに掲載」)のせいで
 * この文面は毎リリース増える。書く人は markdown のつもりで書くので、
 * 放っておくと必ず再発する。
 *
 * ## 直し方の選択
 *
 * カード側で inline markdown を解釈する案もあったが、それは**機能追加**に
 * なる(プライム・ディレクティブ「機能を足さない」)。表示は素のテキストで
 * 十分読めるので、**記法を書かない**ことを規約にして pin する。
 */
import { describe, expect, it } from 'vitest';
import { STARTUP_NOTICES } from '@adapter/ui/startup-notice';

describe('お知らせ文面に markdown 記法を書かない', () => {
  it('title / items に `**` が無い(textContent なので literal に見える)', () => {
    const offenders: string[] = [];
    for (const notice of STARTUP_NOTICES) {
      if (notice.title.includes('**')) offenders.push(`${notice.id} title`);
      notice.items.forEach((item, i) => {
        if (item.includes('**')) offenders.push(`${notice.id} items[${i}]`);
      });
    }
    expect(
      offenders,
      'お知らせカードは textContent で描くので `**` はそのまま画面に出る。'
        + '強調したいときは記法ではなく語順・句読点で示すこと:\n'
        + offenders.join('\n'),
    ).toEqual([]);
  });

  it('先頭 entry(実際に表示されるもの)が title と items を持つ', () => {
    const latest = STARTUP_NOTICES[0];
    expect(latest, 'お知らせが 1 件も無い').toBeDefined();
    expect(latest!.title.length, 'title が空').toBeGreaterThan(0);
    expect(latest!.items.length, 'items が空').toBeGreaterThan(0);
  });
});
