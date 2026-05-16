# PKC Hint mechanism 設計(2026-05-16、未実装、wave Z 後の候補)

## 0. status

- **設計のみ保存**(user 指示「設計のみとして保存しておいて」、2026-05-16)
- 着手 wave 未定、PR-W24(寛容 parse 完成)後の選択肢として記録
- canonical refs:`docs/spec/markdown-dialect-for-ai-authors-v2.md`(notation spec)/ `docs/development/notation-redesign-2026-05/06-code-block-ecosystem.md`(code block renderer 設計、本 hint 機構の主要 driver)
- 関連実装(本 doc が統合候補とする散在):`src/features/ast/export-docx.ts` の `case 'var'` 未定義警告 / `case 'blank'` cap 警告 / `case 'footnote-ref'` orphan fallback / `src/features/ast/decompose-pkc.ts` の `:::role{` malformed parse fallback

## 1. motivation

PKC2 内で「PKC が parse / render 中に気づいた事象を user に伝える」必要がある case が複数:

| パターン | 現状 |
|---|---|
| 未定義変数 `{{vars.X}}` | `[未定義: vars.X]` italic + red(docx)/ class fallback(HTML)|
| `_N` over cap(N>50) | `[blank-line cap: 100 → 50]` visible text injection |
| orphan footnote `[^x]`(def 無し) | literal `[^x]` superscript fallback(意味的に dangling)|
| malformed `:::quote{...`(`}` 閉じ忘れ) | 寛容 parse、attrs drop、UI 表示なし |
| dangling auto-ref `[@fig-undefined]` | `@fig-undefined` literal text |
| **render-available code block**(未実装) | `` ```csv `` / `` ```tree `` 等 lang 認識時 user に「render しますか?」誘導 |
| (将来)broken link / 削除済 entry-link / 古い asset 参照 / 非対応 markdown 拡張記法 検出 | 未実装 |

全部 **バラバラ実装**(text injection / silent / placeholder)で:
- visual / interaction が統一されていない
- user が opt-out できない(常に visible)
- AST に hint 情報が persist しないため round-trip / render 比較で扱いづらい

## 2. design:`AstHint` 共通 schema

```typescript
// 配置:src/core/ast/hints.ts(新規、core layer)
export interface AstHint {
  /** 一意 id(`'undefined-var'` / `'render-available'` / `'orphan-footnote'` 等、enum-like string)。 */
  id: string;
  /** severity:`'info'` 情報 / `'suggestion'` 提案 / `'warning'` 警告 / `'error'` エラー。 */
  severity: 'info' | 'suggestion' | 'warning' | 'error';
  /** human-readable JA message(短く、`「...」`)。 */
  message: string;
  /** どの位置 / どの AST node に紐付くか。renderer が DOM の anchor として使う。 */
  anchor: {
    /** source markdown 行番号(1-based、optional)。 */
    line?: number;
    /** AST node の id(`fig-X` / `vars.Y` 等、ある場合)。 */
    nodeId?: string;
    /** parent block kind(`paragraph` / `code-block` / `figure` 等、UI overlay 位置決め用)。 */
    parentKind?: string;
  };
  /** optional、user が click で取れる action のリスト。 */
  actions?: HintAction[];
}

export interface HintAction {
  label: string;                       // 「表として render」「定義に jump」「無視」
  kind: 'apply-attr' | 'apply-block-attr' | 'navigate' | 'dismiss-once' | 'dismiss-forever' | 'custom';
  /** action 種別ごとの payload。 */
  payload?: Record<string, unknown>;   // e.g., { attr: 'render' } / { target: 'fig-X' } / { type: 'csv' }
}
```

`AstDocument` に既存の `warnings?: readonly PkcWarning[]` を `hints?: readonly AstHint[]` に拡張 / 統合(migration policy:既存 `PkcWarning` は `AstHint` に変換するアダプタを 1 度走らせて自動 migrate)。

## 3. 統一 UI 表示

### 3.1 inline marker(軽い影響)

severity = `info` / `suggestion` / `warning` で **inline marker**(`<span class="pkc-hint pkc-hint-<severity>" data-pkc-hint-id="X">message</span>`)。

CSS:
```css
.pkc-hint              { display: inline-flex; align-items: center; gap: 2px; cursor: help; }
.pkc-hint-info         { color: #3B82F6; font-style: italic; }
.pkc-hint-suggestion   { color: #10B981; border-bottom: 1px dashed #10B981; }
.pkc-hint-warning      { color: #FB923C; border-bottom: 1px dotted #FB923C; }
.pkc-hint-error        { color: #DC2626; border-bottom: 2px dotted #DC2626; }
.pkc-hint::before      { content: attr(data-pkc-hint-icon); font-size: 0.8em; opacity: 0.7; }
```

icon mapping(data-pkc-hint-icon attr):
- info → `ℹ️`
- suggestion → `💡`
- warning → `⚠️`
- error → `🛑`

### 3.2 overlay button(重い影響、action 付き)

severity = `suggestion` で actions あり、または **parent が block-level**(code-block / figure / paragraph 等)の hint は **overlay button** で表示:

```
┌─[csv]────────[💡 表として render ▶]─[✕]─┐
│ name,age                                  │
│ Alice,30                                  │
└───────────────────────────────────────────┘
```

action click 動線:
1. `apply-attr` → AST 経由で `{render}` 等を source MD に挿入、`QUICK_UPDATE_ENTRY` dispatch
2. `navigate` → `selectedLid` を切替(entry-ref / footnote def jump)
3. `dismiss-once` → session UI で hide
4. `dismiss-forever` → entry の dismissed-hint list に id 保存

### 3.3 tooltip(全 hint で hover)

hover で full message + actions tooltip(`title` attr または custom popover)。tooltip 内 actions は keyboard navigable(Tab / Enter)。

## 4. opt-out 4 階層

default ON(全 hint 表示)、user が必要に応じて 4 段階で抑制:

| Tier | 場所 | 効果範囲 | 永続性 |
|---|---|---|---|
| **1. Per-instance dismiss-once** | 各 hint の `[✕]` button | その 1 件のみ | session(reload で復活)|
| **2. Per-instance dismiss-forever** | `[✕]` 長押し or 右クリック menu「もう表示しない」 | 同 entry 内の同 id hint 全件 | entry の `meta.dismissedHints: string[]` に追加 |
| **3. Per-doc opt-out** | frontmatter `pkc-hints: off`(全 disable)or `pkc-hints: { disable: [render-available, orphan-footnote] }`(id 指定)| doc 全 hint or 特定 id | frontmatter persist |
| **4. Global opt-out** | settings UI「PKC hint 表示」toggle / id 別 disable list | user 全体 | `system.pkc.hints.*` flag(Tier 0 設定)|

優先順位:**1 > 2 > 3 > 4**(per-instance が最優先、global が default)。

## 5. 既存散在 hint の `AstHint` 移行 mapping

| 既存 | id | severity | message 例 | actions |
|---|---|---|---|---|
| `{{vars.X}}` 未定義 | `undefined-var` | warning | `「vars.X が未定義」` | `[navigate: frontmatter vars 定義]`, `[dismiss]` |
| `_N` over cap | `blank-line-cap` | info | `「blank-line cap 100 → 50」` | `[dismiss]` |
| orphan `[^x]` | `orphan-footnote` | warning | `「footnote 定義 [^x]: が無い」` | `[navigate: 末尾]`, `[dismiss]` |
| malformed `:::role{...` | `malformed-block-attrs` | warning | `「:::quote{author=... の } が無い、attrs drop」` | `[dismiss]` |
| dangling `[@fig-X]` | `dangling-ref` | warning | `「fig-X の定義が無い」` | `[navigate: figure 一覧]`, `[dismiss]` |
| render-available code block(新) | `render-available` | suggestion | `「{lang} は render 可能」` | `[apply-attr: render]`, `[dismiss-forever]` |
| broken link `[](non-existent)` | `broken-link` | warning | `「link 先 entry が見つからない」` | `[navigate]`, `[dismiss]` |
| 削除済 entry-link | `deleted-entry-link` | error | `「参照先 entry は削除済」` | `[navigate: revision]`, `[dismiss]` |
| 古い asset 参照 | `stale-asset` | info | `「asset の更新を検出」` | `[refresh]`, `[dismiss]` |
| 非対応 markdown 拡張 | `unsupported-syntax` | warning | `「未対応の `:::xxx` 記法」` | `[dismiss]` |

## 6. 実装 phase plan(未着手、wave Z 後)

| Phase | scope | PR 数 | LOC 目安 |
|---|---|---|---|
| **1**(基盤)| `AstHint` schema + 統一 emit/render path + 既存 4 件(undef var / cap / orphan footnote / malformed)を `AstHint` に統合 | 1 | ~250 |
| **2**(code block)| `render-available` hint 実装 + `{render}` apply-attr action + 既存 `csv` / `html-render` の auto-fire 廃止 → opt-in 化(backward compat 移行 期間あり)| 1 | ~150 |
| **3**(opt-out UI)| dismiss button(once / forever)+ frontmatter `pkc-hints` parser + settings UI(`system.pkc.hints.*` flag)| 1 | ~200 |
| **4**(残 hint 統合)| dangling-ref / broken-link / deleted-entry-link / stale-asset / unsupported-syntax | 2-3 | ~300 |
| **5**(code block renderer 群)| Phase A-G の各 renderer(`tree` / `dbschema` / `json` / `query` / `cards` / `mermaid` / `mindmap` / `flow` / `seq` / `hexdump` / `diff` / `palette` / `quiz` 等、各 renderer は `render-available` hint を emit)| 15 | ~3000 |

**累計 20+ PR**。phase 1-3 で基盤確立、phase 4-5 で 既存 + 拡張 を載せる。

## 7. doctrine 追記候補(`CLAUDE.md` / `pr-review-checklist.md`)

```md
## PKC Hint doctrine(PR-W?+ 制定候補)

PKC が parse / render 中に「気づいた」事象(未定義変数、orphan ref、render-available code block、malformed parse 等)は **必ず `AstHint` で emit**、統一 UI(`pkc-hint` class、severity 別 visual)で表示。bare literal fallback(`[未定義: X]` / `[cap: N → M]` 等)は **廃止**、すべて `AstHint` 経由に統一。

Opt-out は **4 階層**(session dismiss / entry-permanent dismiss / per-doc frontmatter / global settings)で user が自由に抑制可能、default ON(全 hint 表示、機能発見性最大化)。

本 doctrine に違反する PR(新規 bare literal warning / hard-coded HTML hint 等)は merge 不可。
```

## 8. 設計上の判断保留事項

- **PkcHint vs AstHint 名称**:既存 `PkcWarning` との衝突回避で `AstHint` を選択(`'warning'` は severity の 1 つ)、ただし type alias `PkcWarning = AstHint` で backward compat 維持の可能性あり
- **dismissed-hint storage 場所**:entry の `meta.dismissedHints` vs `revisions` vs `container.uiState` 別 store(後者は schema 拡張不要だが reload で復活)— 設計時に再評価
- **hint ID namespace**:`pkc:<id>` prefix vs bare ID(`undefined-var` etc.)— 拡張のためには prefix(PkcExtension v2 で user-defined hint を許す布石)
- **inline marker と overlay button の境界**:`severity === 'suggestion' && parentKind === 'block'` でなく、もっと explicit な `display: 'inline' | 'overlay'` field を `AstHint` に持たせる検討
- **`render-available` hint の trigger**:fence の lang が registered renderer リストに含まれる場合のみ vs 全 fence(後者は GFM 互換性で危険)— 前者で確定推奨

## 9. 関連 spec / doc

- `docs/spec/markdown-dialect-for-ai-authors-v2.md`(notation 全 catalog)
- `docs/development/notation-redesign-2026-05/06-code-block-ecosystem.md`(code block renderer registry 設計、本 hint 機構の主要 driver)
- `docs/development/full-pkc-fixture-audit-2026-05-16.md`(Wave Z 計画、PR-W34+ で本機構を含めるか別 wave かを決定)
- `docs/release/CHANGELOG_v2.3.0.md`(W18 footnote / W24 寛容 parse で AstHint 前段の散在実装を確立)
