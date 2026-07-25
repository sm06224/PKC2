/**
 * 視覚監査用「意地悪」container 生成(playwright-visual / 全画面監査)。
 *
 * 目的: 全 archetype × 全 markdown 拡張記法 × 崩れやすい極端データ
 * (長大タイトル / 深い階層 / 大量 relation・tag / 巨大 table / 長 URL /
 * 絵文字・CJK・RTL 混在 / 空データ)を 1 つの container に詰め、
 * 各 view・各 flag 分岐でのレンダリング品質を実機で観察できるようにする。
 *
 * 出力: bench-fixtures/c-audit.json
 * 実行: npx tsx build/scripts/generate-audit-container.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../bench-fixtures/c-audit.json');

const T = '2026-07-25T00:00:00.000Z';
const CID = 'c-audit';

interface E {
  lid: string; title: string; archetype: string; body: string;
  created_at: string; updated_at: string;
}
interface R {
  id: string; kind: string; from: string; to: string;
  created_at: string; updated_at: string;
}

const entries: E[] = [];
const relations: R[] = [];
const assets: Record<string, string> = {};
let rid = 0;
const rel = (kind: string, from: string, to: string): void => {
  relations.push({ id: `r-${rid++}`, kind, from, to, created_at: T, updated_at: T });
};
const add = (lid: string, title: string, archetype: string, body: string): void => {
  entries.push({ lid, title, archetype, body, created_at: T, updated_at: T });
};

// ── 極端な文字列 ───────────────────────────────────
const LONG_TITLE =
  '非常に長いタイトルのテストです。折り返しや省略が正しく効くかを確認するために、'
  + 'あえて 200 文字を超える長さにしています。ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop'
  + 'qrstuvwxyz0123456789 さらに続きます。サイドバー・パンくず・タブ・メタペインで'
  + 'どう見えるかを一度に検証します。';
const NO_SPACE_LONG = 'あ'.repeat(120);
const URL_LONG = 'https://example.com/very/long/path/' + 'segment/'.repeat(20) + '?q=' + 'x'.repeat(120);
const EMOJI = '🎉🚀🐛✅⚠️🔥💾📎🗂️🧮 絵文字と CJK 漢字かなカナ ＡＢＣ 全角 ①②③ ｶﾅ';
const RTL = 'مرحبا بالعالم — RTL 混在テスト — שלום עולם';

// ── ルート構成 ────────────────────────────────────
add('root-readme', '📘 監査用コンテナ README', 'text', [
  '# 視覚監査用コンテナ',
  '',
  'このコンテナは **全 archetype × 全 markdown 記法 × 極端データ** を含みます。',
  '',
  '- 目的: 各 view / flag 分岐でのレンダリング崩れの発見',
  '- 生成: `build/scripts/generate-audit-container.ts`',
].join('\n'));

// 深いフォルダ階層(10 段)
let parent = '';
for (let d = 0; d < 10; d++) {
  const lid = `deep-${d}`;
  add(lid, `階層${d} — 深いフォルダ ${'▸'.repeat(d + 1)}`, 'folder', '');
  if (parent) rel('structural', parent, lid);
  parent = lid;
}
add('deep-leaf', `最深部のエントリ ${EMOJI}`, 'text', '深さ 10 のフォルダにあるエントリ。パンくずが折り返すか。');
rel('structural', parent, 'deep-leaf');

// 通常フォルダ + 大量子要素
add('fld-bulk', '📂 大量エントリ フォルダ(120 件)', 'folder', '');
for (let i = 0; i < 120; i++) {
  const lid = `bulk-${i}`;
  add(lid, `一括エントリ ${String(i).padStart(3, '0')} — ${i % 7 === 0 ? LONG_TITLE.slice(0, 80) : 'ふつうのタイトル'}`,
    'text', `本文 ${i}。\n\n段落その 2。`);
  rel('structural', 'fld-bulk', lid);
}

// ── 極端データ ────────────────────────────────────
add('x-long-title', LONG_TITLE, 'text', '長大タイトルのエントリ。サイドバー / パンくず / タブでの折返しを見る。');
add('x-nospace', NO_SPACE_LONG, 'text', `空白なし長文の折返し:\n\n${NO_SPACE_LONG}\n\n${'A'.repeat(200)}`);
add('x-url', 'URL が長いエントリ', 'text', `長い URL:\n\n${URL_LONG}\n\n[リンク表示](${URL_LONG})`);
add('x-emoji', `${EMOJI}`, 'text', `${EMOJI}\n\n${RTL}\n\n混在: abc あいう 🎉 ﾊﾝｶｸ ①`);
add('x-empty', '', 'text', '');
add('x-empty-body', 'タイトルのみ(本文なし)', 'text', '');

// 大量 tag / relation を持つハブ
add('hub', '🕸 大量リレーションのハブ', 'text', [
  '---',
  'tags: [監査, レンダリング, 崩れ検証, タグが多い, ' + Array.from({ length: 24 }, (_, i) => `tag${i}`).join(', ') + ']',
  '---',
  '',
  '# ハブエントリ',
  '',
  '多数の relation を持つ。メタペインの References セクションの見た目を検証。',
].join('\n'));
for (let i = 0; i < 40; i++) {
  const lid = `spoke-${i}`;
  add(lid, `スポーク ${i}`, 'text', `ハブから参照されるエントリ ${i}`);
  rel(i % 3 === 0 ? 'semantic' : i % 3 === 1 ? 'categorical' : 'temporal', 'hub', lid);
}

// ── markdown 拡張記法 総覧 ───────────────────────
add('md-kitchen-sink', '📝 Markdown 記法 総覧(レンダリング検証)', 'text', [
  '# 見出し 1',
  '## 見出し 2',
  '### 見出し 3',
  '',
  '通常段落。**太字** / *斜体* / ~~打消~~ / `inline code` / ==ハイライト== 。',
  '',
  '> 引用ブロック',
  '> 複数行の引用',
  '',
  '- リスト 1',
  '  - ネスト 1-1',
  '    - ネスト 1-1-1',
  '- リスト 2',
  '',
  '1. 番号 1',
  '2. 番号 2',
  '',
  '- [ ] 未完了タスク',
  '- [x] 完了タスク',
  '',
  '| 列A | 列B | 列C | 列D | 列E | 列F | 列G | 列H |',
  '|---|---|---|---|---|---|---|---|',
  ...Array.from({ length: 12 }, (_, i) =>
    `| 行${i} | ${'とても長いセル内容'.repeat(2)} | ${i} | ${EMOJI.slice(0, 6)} | x | y | z | w |`),
  '',
  '```js',
  '// 長い行のコードブロック(横スクロール検証)',
  'const veryLongVariableNameForOverflowTesting = { alpha: 1, beta: 2, gamma: 3, delta: 4, epsilon: 5, zeta: 6, eta: 7 };',
  ...Array.from({ length: 30 }, (_, i) => `console.log("line ${i}");`),
  '```',
  '',
  '```csv',
  'name,qty,note',
  'りんご,3,甘い',
  'ばなな,5,黄色',
  '```',
  '',
  '```mermaid',
  'flowchart TD',
  '  A[開始] --> B{分岐}',
  '  B -->|はい| C[処理1]',
  '  B -->|いいえ| D[処理2]',
  '  C --> E[終了]',
  '  D --> E',
  '```',
  '',
  '```html',
  '<div style="padding:8px;background:#eef;border-radius:6px">HTML レンダリング</div>',
  '```',
  '',
  '```xml-norender',
  '<root><child attr="v">text</child></root>',
  '```',
  '',
  '$E = mc^2$ の数式、脚注[^1]、[[ruby:漢字|かんじ]] のルビ。',
  '',
  '[^1]: 脚注の本文です。',
  '',
  '---',
  '',
  '![壊れた画像参照](asset:missing-key-xyz)',
  '',
  `[長いリンク](${URL_LONG})`,
].join('\n'));

// ── archetype 網羅 ───────────────────────────────
// todo(各 status / 期限切れ / アーカイブ)
const todoBody = (status: string, desc: string, date?: string, archived?: boolean): string =>
  JSON.stringify({ status, description: desc, ...(date ? { date } : {}), ...(archived ? { archived } : {}) });
add('todo-open', '未完了タスク(期限あり)', 'todo', todoBody('open', '**Markdown** を含む説明。\n\n- 手順1\n- 手順2', '2026-08-01'));
add('todo-done', '完了タスク', 'todo', todoBody('done', '完了済みの説明', '2026-07-01'));
add('todo-overdue', '期限切れタスク', 'todo', todoBody('open', '期限を過ぎている', '2026-01-01'));
add('todo-archived', 'アーカイブ済タスク', 'todo', todoBody('done', 'アーカイブ', '2026-06-01', true));
add('todo-longdesc', LONG_TITLE.slice(0, 60), 'todo', todoBody('open', LONG_TITLE + '\n\n' + NO_SPACE_LONG, '2026-09-15'));
for (let i = 0; i < 24; i++) {
  add(`todo-bulk-${i}`, `カンバン用タスク ${i}`, 'todo',
    todoBody(i % 3 === 0 ? 'done' : 'open', `説明 ${i}`, `2026-0${(i % 9) + 1}-1${i % 9}`));
}

// textlog
add('log-1', '📋 テキストログ(複数エントリ)', 'textlog', JSON.stringify({
  entries: Array.from({ length: 15 }, (_, i) => ({
    id: `l${i}`,
    text: i % 4 === 0
      ? `# ログ見出し ${i}\n\n**Markdown** を含むログ。\n\n\`\`\`js\nconsole.log(${i});\n\`\`\``
      : i % 4 === 1 ? `${EMOJI} 絵文字ログ ${i}` : `通常のログ本文 ${i}。${'長い行。'.repeat(10)}`,
    createdAt: `2026-07-${String((i % 25) + 1).padStart(2, '0')}T10:00:00Z`,
    flags: [],
  })),
}));
add('log-empty', '空のテキストログ', 'textlog', JSON.stringify({ entries: [] }));

// attachment(テキスト系 / 画像 / 壊れた参照 / legacy data)
const jsonAsset = Buffer.from('{\n  "name": "audit",\n  "nested": { "a": [1,2,3] }\n}\n', 'utf-8').toString('base64');
assets['ast-json'] = jsonAsset;
add('att-json', 'settings.json', 'attachment',
  JSON.stringify({ name: 'settings.json', mime: 'application/json', asset_key: 'ast-json', size: 60 }));
const svgAsset = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#4aa3ff"/><text x="10" y="35" fill="#fff">SVG</text></svg>',
  'utf-8').toString('base64');
assets['ast-svg'] = svgAsset;
add('att-svg', 'diagram.svg', 'attachment',
  JSON.stringify({ name: 'diagram.svg', mime: 'image/svg+xml', asset_key: 'ast-svg', size: 160 }));
// 1x1 PNG
assets['ast-png'] = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
add('att-png', 'tiny.png', 'attachment',
  JSON.stringify({ name: 'tiny.png', mime: 'image/png', asset_key: 'ast-png', size: 70 }));
add('att-broken', '壊れた添付(asset 欠落)', 'attachment',
  JSON.stringify({ name: 'missing.bin', mime: 'application/octet-stream', asset_key: 'ast-does-not-exist', size: 1024 }));
add('att-longname', `${LONG_TITLE.slice(0, 90)}.txt`, 'attachment',
  JSON.stringify({ name: `${LONG_TITLE.slice(0, 90)}.txt`, mime: 'text/plain', asset_key: 'ast-json', size: 60 }));

// form / generic / opaque / spreadsheet
add('form-1', 'フォーム(form archetype)', 'form',
  JSON.stringify({ fields: [{ label: '名前', value: '' }, { label: 'メモ', value: 'あ'.repeat(80) }] }));
add('generic-1', 'ジェネリック', 'generic', '{ "任意": "データ" }');
add('opaque-1', 'オペーク(不透明データ)', 'opaque', 'BINARY-LIKE-CONTENT-');
// spreadsheet の body は `{ rows: string[][] }`(features/spreadsheet の
// parseSpreadsheetBody 契約)。ヘッダ行 + データ行 + 長文セル + 数式。
add('sheet-1', '🧮 スプレッドシート', 'spreadsheet', JSON.stringify({
  rows: [
    ['項目', '数量', '単価', '小計', '備考'],
    ...Array.from({ length: 14 }, (_, i) => [
      i % 4 === 0 ? `とても長い項目名${i}`.repeat(3) : `品目 ${i}`,
      String(i + 1),
      String((i + 1) * 120),
      `=B${i + 2}*C${i + 2}`,
      i % 3 === 0 ? `${EMOJI.slice(0, 8)} 備考 ${i}` : '',
    ]),
  ],
}));
add('sheet-broken', 'スプレッドシート(不正 body)', 'spreadsheet', '{ "cells": { "A1": "x" } }');

// ルート直下に主要エントリをぶら下げる(tree の見た目確認)
for (const lid of ['root-readme', 'md-kitchen-sink', 'hub', 'x-long-title', 'x-emoji', 'log-1', 'sheet-1']) {
  // ルート直下なので structural 親は付けない
  void lid;
}

const container = {
  meta: {
    container_id: CID,
    title: '視覚監査用コンテナ(意地悪データ)',
    created_at: T,
    updated_at: T,
    schema_version: 1,
    generator: 'generate-audit-container',
  },
  entries,
  relations,
  revisions: [],
  assets,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(container), 'utf-8');
// eslint-disable-next-line no-console
console.log(
  `[audit-fixture] ${OUT}\n  entries=${entries.length} relations=${relations.length} assets=${Object.keys(assets).length}`,
);
