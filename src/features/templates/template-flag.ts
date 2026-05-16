/**
 * User template flag (PR-BBB, 2026-05-06).
 *
 * User 修正指示4:「自前で手入力するためのテンプレが必要。「/」コ
 * マンドにテンプレ挿入のコマンドを追加し、テンプレを用意「/tmpXX」
 * とし、XXは半角英数２文字、Flagsからjson形式で編集可能とする」
 *
 * Stores user templates in a single Tier 1 string flag whose value is
 * a JSON object: `{ "ab": "template body...", "cd": "another..." }`.
 * The key MUST be exactly 2 alphanumeric characters [a-z0-9] —
 * anything else is silently dropped at parse time.
 *
 * Slash menu picks these up dynamically and surfaces them as `/tmpAB`
 * commands. Insertion replaces `/tmpAB` with the template body.
 */

import { defineFlag } from '../../core/flags';

const FLAG_CATEGORY = 'templates';

const DEFAULT_TEMPLATES_JSON = JSON.stringify(
  {
    // Built-in starter set so the feature is discoverable on first run.
    // User can override / add more via the Flags inspector.
    //
    // ── 軽量 memo / 振り返り ─────────────────
    mt: '## メモ\n\n- [ ] \n',
    rt: '## 振り返り\n\n良かったこと:\n\n改善点:\n',
    //
    // ── 公式 4 種(PR-CCC、video / audio / novel / book)─────
    // frontmatter は v1.1 capture profile と同じ shape にして、手入力
    // entry も bookmarklet 経由自動入力 entry も同等に扱える(filer Auto
    // / hero thumbnail / graph kind 整合)。
    vd: '---\nkind: video\nprovider: \nurl: \nthumbnail: \nduration_sec: \n---\n\n# \n\n## 概要\n\n## 視聴メモ\n\n- [00:00] \n',
    au: '---\nkind: audio\nprovider: \nurl: \nthumbnail: \nduration_sec: \nauthor: \n---\n\n# \n\n## 概要\n\n## 視聴メモ\n\n',
    nv: '---\nkind: novel\nprovider: \nurl: \nthumbnail: \nauthor: \n---\n\n# \n\n## あらすじ\n\n## 感想\n\n',
    bk: '---\nkind: book\nprovider: \nurl: \nthumbnail: \nauthor: \nisbn: \npages: \n---\n\n# \n\n## 概要\n\n## 読書メモ\n\n',
    //
    // ── レイアウト系 8 種(PR-W10、Wave X P4)────────────
    // Wave X(PR-W6〜W9)で確立した docx / pptx 出力の各種 layout に
    // 対応した markdown skeleton。テンプレートは H1/H2/H3 階層 + 表 +
    // task list 等を **章節項 auto-numbering 前提**(`# はじめに` のように
    // prefix なし、export 時に `第1章 はじめに` を自動付与)で構成。
    rp: '---\ntitle: \nauthor: \ndate: \n---\n\n# 序論\n\n## 背景\n\n本文を書いてください。\n\n## 目的\n\n本文を書いてください。\n\n# 本論\n\n## 手法\n\n本文を書いてください。\n\n### 詳細\n\n本文を書いてください。\n\n## 結果\n\n本文を書いてください。\n\n# 結論\n\n本文を書いてください。\n',
    pn: '---\ntitle: \nauthor: \n---\n\n# 導入\n\n## サブタイトル\n\n本文を書いてください。\n\n### 課題と目的\n\n- 課題 1\n- 課題 2\n- 課題 3\n\n# 本論\n\n### 概要\n\n本文を書いてください。\n\n### データ\n\n| 項目 | 値 |\n| --- | --- |\n|  |  |\n|  |  |\n\n### 詳細\n\n- ポイント 1\n- ポイント 2\n- ポイント 3\n\n# まとめ\n\n### 振り返りと次のステップ\n\n- 振り返り\n- 次のステップ\n',
    tc: '### 比較表\n\n| 観点 | A 案 | B 案 | C 案 |\n| --- | --- | --- | --- |\n| コスト |  |  |  |\n| 期間 |  |  |  |\n| リスク |  |  |  |\n| メリット |  |  |  |\n| デメリット |  |  |  |\n',
    mn: '---\ndate: \nattendees: \n---\n\n# 議事録\n\n## アジェンダ\n\n1. \n2. \n3. \n\n## 議題と決定事項\n\n### 議題 1\n\n本文を書いてください。\n\n**決定事項**:\n\n- [ ] \n\n### 議題 2\n\n本文を書いてください。\n\n**決定事項**:\n\n- [ ] \n\n## 宿題と担当者\n\n- [ ] **担当者**:期日:\n- [ ] **担当者**:期日:\n\n## 次回\n\n日時:\n場所:\n',
    ln: '---\nsubject: \ndate: \n---\n\n# 講義タイトル\n\n## 要点\n\n- ポイント 1\n- ポイント 2\n- ポイント 3\n\n## 詳細\n\n### トピック 1\n\n本文を書いてください。\n\n### トピック 2\n\n本文を書いてください。\n\n## 練習問題\n\n1. \n2. \n3. \n\n## 参考\n\n- \n',
    cp: '# 比較対照\n\n## 観点 1\n\n**A 案**:本文を書いてください。\n\n**B 案**:本文を書いてください。\n\n## 観点 2\n\n**A 案**:本文を書いてください。\n\n**B 案**:本文を書いてください。\n\n## 結論\n\n| 観点 | A 案 | B 案 |\n| --- | --- | --- |\n| 観点 1 |  |  |\n| 観点 2 |  |  |\n| 総合 |  |  |\n',
    co: '---\nlayout: a4-2col\ntitle: \nauthor: \n---\n\n# 章タイトル\n\n本文段落 1。本文段落 1。本文段落 1。本文段落 1。本文段落 1。本文段落 1。本文段落 1。\n\n本文段落 2。本文段落 2。本文段落 2。本文段落 2。本文段落 2。本文段落 2。本文段落 2。\n\n## 節タイトル\n\n本文を書いてください。本文を書いてください。本文を書いてください。本文を書いてください。本文を書いてください。\n\n本文を書いてください。本文を書いてください。本文を書いてください。本文を書いてください。本文を書いてください。\n',
    jl: '---\ndate: \nmood: \n---\n\n# 日報\n\n## 今日のハイライト\n\n- \n- \n\n## 良かったこと\n\n- \n\n## 改善したいこと\n\n- \n\n## 明日の予定\n\n- [ ] \n- [ ] \n- [ ] \n',
  },
  null,
  2,
);

/**
 * Tier 1 flag — user-mutable JSON map of `{ XX: "body" }`. Inspector
 * surfaces it as a single multi-line string (JSON), validation happens
 * at parse time(下の `parseUserTemplates`)。
 */
export const userTemplatesJson = defineFlag<string>(
  'templates.entries',
  DEFAULT_TEMPLATES_JSON,
  {
    category: FLAG_CATEGORY,
    description:
      'スラッシュコマンド `/tmpXX` のテンプレ集。JSON 形式 `{"ab":"template body","cd":"..."}`。XX は半角英数 2 文字。',
    tier: 1,
  },
);

export interface UserTemplate {
  /** 2-char alphanumeric id (lowercased). Used to assemble the slash command id (`tmp${key}`). */
  readonly key: string;
  /** Template body to insert verbatim (verbatim — no further interpolation in v1). */
  readonly body: string;
}

const KEY_RE = /^[a-z0-9]{2}$/;

/**
 * Parse the templates JSON into a structured array. Invalid keys / non-
 * string bodies / non-JSON input are silently dropped — the flag
 * inspector accepts free-form strings, so we never throw at the user.
 */
export function parseUserTemplates(json: string): UserTemplate[] {
  if (!json || typeof json !== 'string') return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out: UserTemplate[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (!KEY_RE.test(key)) continue;
    if (typeof v !== 'string') continue;
    out.push({ key, body: v });
  }
  // Stable order: alphabetic by key.
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

/**
 * Convenience: read the live flag value and parse. Used by the slash
 * menu opener.
 */
export function getActiveUserTemplates(): UserTemplate[] {
  return parseUserTemplates(userTemplatesJson());
}
