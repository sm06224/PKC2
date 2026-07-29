/**
 * C3/C4 の before(main)/ after(dev)比較コンタクトシート。
 *
 * 🔴 **全行「変わらないこと」が PASS**。この branch の変更は(opt-in の
 *   ラスタ表示も含めて)**見た目を変えないことが設計目標**なので、
 *   閾値は全行 2% に揃える。**FAIL を消すために閾値を緩めない** ──
 *   実測 2 件の FAIL は説明を付けて残す(②=スクロール位置の対応、
 *   ⑥=アンチエイリアス)。
 *
 * ⚠ **同一 md5 の重複を検出する**(playwright-visual skill)。demo には
 *   pass/fail が無いので、操作が届かず同じ画面を撮り直しただけでも
 *   「撮れた」ように見える。before 側の md5 が全部同じなら撮影が失敗している。
 */
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { diffImagesInBrowser, writeVisualReport, type VisualRow } from './_lib/visual-report';

const BEFORE = 'test-results/compare/before';
const AFTER = 'test-results/compare/after';
const OUT = 'test-results/compare/c3c4-before-after.html';

interface Item {
  readonly file: string;
  readonly label: string;
  readonly description: string;
  readonly tolerance: number;
  readonly expectChange?: boolean;
}

const ITEMS: Item[] = [
  {
    file: '01-long-body-top',
    label: '① 長い本文\n先頭画面',
    tolerance: 0.02,
    description:
      '40 節の長い本文を開いた直後。dev では center pane を**見えている範囲だけ**描き、'
      + 'スクロールに合わせて描き足す(`center.block_window` 既定 ON)。'
      + '**狙いは見た目を変えないこと** ── 差分が小さいほど良い。',
  },
  {
    file: '02-long-body-scrolled',
    label: '② 長い本文\nスクロール後',
    tolerance: 0.02,
    description:
      '同じ本文を scrollTop=2,400px にした状態。**唯一の実差分**(46.3%)。'
      + 'ただし**描画そのものは 1 ピクセルも変わっていない** ── 字体・配色・'
      + 'レイアウトは同一で、違うのは「2,400px がどの節を指すか」だけ'
      + '(main は見出し 11〜14、dev は 13〜16)。窓化は未測定ブロックの高さを'
      + '**推定**で積むので、実測が入るまでスクロールバーの目盛りが実物とずれる。'
      + 'スクロールし進めば実測に置き換わって収束する。'
      + '⚠ 影響するのは「scrollTop を数値で指定して復元する」経路のみ。',
  },
  {
    file: '03-heading-folded',
    label: '③ 見出しの\n折りたたみ',
    tolerance: 0.02,
    description:
      '先頭の見出しを畳んだ状態。dev では畳み状態が窓の描き替えを生き延びる(C3-d)。'
      + 'main は窓化しないので元から畳んだまま。**同じ絵になるのが正しい**。',
  },
  {
    file: '04-sidebar',
    label: '④ サイドバー\n300 件',
    tolerance: 0.02,
    description:
      '300 件のエントリを持つサイドバー。dev では行を窓化している'
      + '(`sidebar.virtual_list` 既定 ON)。**見た目は不変**が要件。',
  },
  {
    file: '05-mermaid-default',
    label: '⑤ mermaid\n既定',
    tolerance: 0.02,
    description:
      'mermaid の図(既定)。dev でもラスタ表示は opt-in なので **SVG のまま**。'
      + '差分が出たら意図しない変化。',
  },
  {
    file: '06-mermaid-raster',
    label: '⑥ mermaid\nラスタ ON',
    tolerance: 0.02,
    description:
      '`?pkc-flag=center.mermaid_raster=true`(既定 OFF の opt-in)。main にこの flag は'
      + '無いので URL は無視され、before は SVG のまま。after は viewport に収まる図なので'
      + 'PNG の `<img>` に置き換わる。**目視では判別できない**(節・矢印・配色・寸法とも同一)が、'
      + '画素では 8.1% 異なる ── 文字と線の**アンチエイリアス**が、レイアウトエンジンの描画から'
      + '画像デコーダの描画へ変わるため。閾値は他の行と同じ 2% に揃えてあるので FAIL 表示になるが、'
      + '**これは想定内の差**である(閾値を緩めて PASS にする細工はしない)。',
  },
];

function b64(dir: string, file: string): string | null {
  const p = `${dir}/${file}.png`;
  if (!existsSync(p)) return null;
  return readFileSync(p).toString('base64');
}

test('report: C3/C4 before/after コンタクトシート', async ({ page }) => {
  test.setTimeout(120_000);
  const rows: VisualRow[] = [];
  const beforeHashes = new Map<string, string>();
  const missing: string[] = [];

  for (const item of ITEMS) {
    const a = b64(BEFORE, item.file);
    const b = b64(AFTER, item.file);
    if (!a || !b) { missing.push(item.file); continue; }
    beforeHashes.set(item.file, createHash('md5').update(a).digest('hex'));
    const diff = await diffImagesInBrowser(page, a, b);
    rows.push({
      label: item.label,
      description: item.description,
      baselineB64: a,
      candidateB64: b,
      diff,
      tolerance: item.tolerance,
      expectChange: item.expectChange,
    });
  }

  expect(missing, `撮れていないショットがある: ${missing.join(', ')}`).toEqual([]);

  // 🔴 撮影が空振りしていないか ── before 側が全部同じ絵なら操作が届いていない。
  const uniq = new Set(beforeHashes.values());
  expect(
    uniq.size,
    `before のショットが重複している(操作が届いていない疑い): ${[...beforeHashes.keys()].join(', ')}`,
  ).toBeGreaterThan(1);

  const { pass, fail } = writeVisualReport(rows, OUT, {
    title: 'PKC2 — main と dev/storage-sqlite の見た目比較(C3 窓化 / C4 描画キャッシュ / C6-a ラスタ)',
    viewport: '1920×1080',
  });
  // eslint-disable-next-line no-console
  console.log(`\n■ コンタクトシート: ${OUT}  PASS ${pass} / FAIL ${fail}\n`);
});
