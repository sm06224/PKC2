/**
 * 視覚監査 before / after の比較レポート生成。
 *
 * `audit-compare-capture.spec.ts` が 2 回走って作った
 * `test-results/compare/{before,after}/*.png` を読み、ブラウザ内 canvas の
 * absdiff で比較して「比較基準 / 比較対象 / 比較結果 / 説明 / 判定」の
 * **自己完結 HTML**(base64 埋め込み・外部参照ゼロ)を書き出す。
 *
 * ⚠ 判定の向きが通常の regression テストと **逆**。ここでは
 * 「差分が出ていること = 修正が効いていること」なので、`minChange` を
 * 下回った(= 変わっていない)行を FAIL にする。
 *
 * 実行:
 *   PKC_SHOT_DIR=test-results/compare/before npx playwright test --config=… audit-compare-capture
 *   (dist を修正前 build に差し替えてから)
 *   PKC_SHOT_DIR=test-results/compare/after  npx playwright test --config=… audit-compare-capture
 *   npx playwright test --config=tests/smoke/playwright.demo.config.ts audit-compare-report
 */
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { diffImagesInBrowser, writeVisualReport, type VisualRow } from './_lib/visual-report';

const BEFORE = 'test-results/compare/before';
const AFTER = 'test-results/compare/after';
const OUT = 'test-results/compare/visual-audit-before-after.html';

interface Item {
  readonly file: string;
  readonly label: string;
  readonly description: string;
  /** これ未満の差分しか出ていなければ「修正が効いていない」= FAIL。 */
  readonly minChange: number;
}

const ITEMS: Item[] = [
  {
    file: '01-about-showcase',
    label: 'A1\nAbout',
    minChange: 0.005,
    description:
      '空コンテナ初回起動の中央ペイン。修正前は `:::details summary="…"` が方言として発火せず、'
      + '記法と `:::` が本文にそのまま出ていた。あわせて、記法説明の {{vars.x}} に赤い「未定義変数」'
      + 'マーカーが出ており、inline code が改行を跨いで docs/release/ CHANGELOG_v*.md と'
      + '途中に空白が入っていた。修正後は本物の折りたたみ（▶）になり、警告マーカーも空白も消えている。',
  },
  {
    file: '02-empty-sidebar',
    label: 'B2\n空状態',
    minChange: 0.005,
    description:
      '空コンテナのサイドバー。修正前は "No entries yet. Use the + buttons above to create one, '
      + 'or drop a file into the center pane." と "Drop files here" が英語。修正後は日本語に統一。',
  },
  {
    file: '03-untitled-filer',
    label: 'A3\n空タイトル',
    minChange: 0.005,
    description:
      'タイトルが空のエントリを含むファイラー表示。修正前は名前列だけが '
      + '`title || lid` で fallback しており、内部 ID（lid）が user 向け画面に漏れていた。'
      + '他の表示経路は (untitled) を使っており表記も割れていた。修正後は '
      + 'ファイラー / パンくず / サムネイル / インベントリ / フォルダ選択など 14 箇所を統一。'
      + 'ファイル名生成と検索の haystack は「表示ではない」ので意図的に lid のまま。',
  },
  {
    file: '04-long-title-breadcrumb',
    label: 'A6\nパンくず',
    minChange: 0.005,
    description:
      '200 文字超のタイトルのパンくず。修正前は max-width も ellipsis も無く、'
      + '横スクロールに逃げていた（スクロールバーが出ない環境では省略されていること自体が'
      + '分からない）。修正後は 14rem で「…」省略、全文は tooltip で読める。',
  },
  {
    file: '05-broken-spreadsheet',
    label: 'A5\n壊れたシート',
    minChange: 0.005,
    description:
      '読み取れない body を持つスプレッドシート。修正前は意図的に空のシートと'
      + '**完全に同じ**空グリッドに見え、1 セル触って保存すると元データが空で上書きされていた。'
      + '修正後は警告を表示し、明示的に「空のシートで作り直す」を押さない限り元データを保持する。',
  },
  {
    file: '06-missing-attachment',
    label: 'A4\n欠落添付',
    minChange: 0.005,
    description:
      'asset の実体が保存領域に無い添付。修正前は「⏳ ファイル読み込み中…」のまま'
      + '永久に止まり、重いのか壊れたのか区別できなかった（失敗表示もタイムアウトも無し）。'
      + '修正後は store 照会で不在が確定した時点で「⚠ ファイルの中身が見つかりません」に切り替わる。'
      + 'ダウンロードは保存領域を直読みするので復旧の逃げ道として残している。',
  },
  {
    file: '07-meta-pane',
    label: 'B2\nメタペイン',
    minChange: 0.01,
    description:
      'リレーション 40 本のハブのメタペイン。修正前は Tags / Categorical / Folder / REFERENCES / '
      + 'Outgoing relations / Backlinks / Add Relation / Structural が英語で、日本語 UI と混在していた。'
      + '修正後は タグ / 分類 / フォルダ / 参照と関連 / 関連 / 被参照 / 関連を追加 / 配置(structural)。'
      + 'relation kind の値そのもの（機能契約）は不変。',
  },
  {
    file: '08-sidebar-tree',
    label: 'B1+B2\nツリー',
    minChange: 0.005,
    description:
      '10 段の深いフォルダを含むツリー。修正前は階層上限（4）を超えた中身が黙って消え、'
      + 'しかも子件数を (0) と表示していた。修正後は実件数 +「…N」で打ち切りを明示する'
      + '（上限は据え置き、中身はファイラー・検索から辿れる）。あわせて検索欄・最近・絞り込み・'
      + '操作ヒントが日本語に。',
  },
  {
    file: '09-attachment-card',
    label: 'B2\n添付カード',
    minChange: 0.005,
    description:
      '長大ファイル名の添付カード。修正前は Rename / Download / No Preview / '
      + '"Preview is not available for this file type — use Download to save the file." が英語で、'
      + '同じ行の「✎ 編集」「TEXT に変換」と混在していた。修正後は 名前を変更 / ダウンロード / '
      + 'プレビュー不可 に統一（Copy link はマニュアルに章見出しごとある定着語なので据え置き）。',
  },
  {
    file: '10-spreadsheet-cells',
    label: 'B3\n長文セル',
    minChange: 0.005,
    description:
      'スプレッドシートの長文セル。修正前は固定幅 96px の中で pre-wrap だったため'
      + '日本語が 5〜6 文字ごとに折り返し、行高が数十倍に伸びていた'
      + '（text-overflow: ellipsis は指定済みだったが nowrap でないと発火しない）。'
      + '修正後は Excel と同じ 1 行クリップ + 「…」省略。全文は tooltip、'
      + '編集中はクリックしたセルだけ開く。印刷・HTML 書き出しでは折り返しに戻す。',
  },
  {
    file: '11-text-attachment-preview',
    label: 'B4\nテキスト添付',
    minChange: 0.005,
    description:
      'text 系添付（.json / .txt / .log など）。修正前は「✎ 編集」はできるのに'
      + '「プレビューできません」と表示される不整合だった（#1005 で編集を入れた時点で'
      + '整合が崩れていた）。修正後は編集導線と同じ述語で判定し、iframe ではなく'
      + '<pre> で中身を表示する。子ウィンドウ（entry-window）でも同じ。',
  },
];

test('report: 視覚監査 before/after の比較 HTML を生成', async ({ page }) => {
  // canvas を使うだけなので about:blank で足りる
  await page.goto('about:blank');

  const rows: VisualRow[] = [];
  const missing: string[] = [];
  for (const item of ITEMS) {
    const b = `${BEFORE}/${item.file}.png`;
    const a = `${AFTER}/${item.file}.png`;
    if (!existsSync(b) || !existsSync(a)) {
      missing.push(item.file);
      continue;
    }
    const baselineB64 = readFileSync(b).toString('base64');
    const candidateB64 = readFileSync(a).toString('base64');
    const diff = await diffImagesInBrowser(page, baselineB64, candidateB64);
    rows.push({
      label: item.label,
      description: item.description,
      baselineB64,
      candidateB64,
      diff,
      // 「差分が出ていること」= 修正が効いていること、を合格とする。
      tolerance: item.minChange,
      expectChange: true,
    });
  }
  expect(missing, `撮影漏れ: ${missing.join(', ')}`).toEqual([]);

  mkdirSync('test-results/compare', { recursive: true });
  const { pass, fail } = writeVisualReport(rows, OUT, {
    title: 'PKC2 視覚監査 2026-07-25 — 修正前 / 修正後の比較',
    viewport: '1920×1080（Full HD）・意地悪データ 222 エントリ・関心領域を crop',
  });

  // eslint-disable-next-line no-console
  console.log(`[compare-report] ${OUT} PASS=${pass} FAIL=${fail}`);
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(`  ${r.label.replace('\n', ' ')}: 差分 ${(r.diff.mismatchRatio * 100).toFixed(2)}%`);
  }
  // 全項目で「修正前と絵が変わっている」ことを要求する。
  expect(fail, '修正が画面に出ていない項目がある').toBe(0);
});
