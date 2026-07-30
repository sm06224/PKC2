/**
 * smoke spec が IDB の schema version を**べた書き**していないことを pin する
 * (2026-07-28、実際に踏んだ腐りの再発防止)。
 *
 * ## 何が起きたか
 *
 * 44 個の smoke spec が seed のために
 *   `indexedDB.open('pkc2', 2)`
 * と version をべた書きしていた。ところが製品側の `DB_VERSION` は
 * `5ca6c7cd`(revisions セグメントログ)で **2 → 3** に上がっている。
 * spec は `page.goto()` → `bootReady()` の**後**に seed するので、
 * その時点で DB は既に v3 で開かれており、v2 で開き直すと
 *   `VersionError: The requested version (2) is less than the existing version (3)`
 * になる。
 *
 * 結果、**Tier-B smoke の 53 test が一律で落ちたまま**になっていた。
 * Tier-B は PR ゲートに含まれない(main push と毎晩の schedule のみ)ので、
 * 赤いまま数日誰にも気づかれず、**安全網として機能していなかった**。
 * 別件(サイドバー窓化)の全 smoke を回して初めて露見した。
 *
 * ## 直し方
 *
 * version を省略して `indexedDB.open('pkc2')` にする。省略時は
 * **既存の version でそのまま開く**ので、製品側が何度上げても追随する。
 * spec は必ず boot 後に seed する(page.evaluate は origin 付きの
 * document を要求するので goto が先行する)から、DB 未作成のケースは無い。
 *
 * ## この pin が守るもの
 *
 * 「version をべた書きしない」だけ。数字を上げて回るのではなく、
 * **数字を持たない**ことを規約にする。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TESTS_ROOT = resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|mts|mjs|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

describe('smoke spec は IDB の version をべた書きしない', () => {
  it("indexedDB.open('pkc2', <N>) が 1 件も無い", () => {
    const offenders: string[] = [];
    for (const file of walk(TESTS_ROOT)) {
      if (file.endsWith('smoke-idb-version-pin.test.ts')) continue;
      const src = readFileSync(file, 'utf8');
      // `indexedDB.open('pkc2', 2)` / `"pkc2", 3` 等。version 省略形は許す。
      const m = src.match(/indexedDB\.open\(\s*['"]pkc2['"]\s*,\s*\d+\s*\)/g);
      if (m) offenders.push(`${file.slice(TESTS_ROOT.length + 1)}: ${m.length} 件`);
    }
    expect(
      offenders,
      'IDB の version をべた書きすると、製品側が上げた瞬間に VersionError で\n' +
        "一斉に落ちる(2026-07-28 に 53 test が数日赤いままだった)。\n" +
        "version を省略した indexedDB.open('pkc2') を使うこと:\n" +
        offenders.join('\n'),
    ).toEqual([]);
  });
});
