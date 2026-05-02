# Entry-ref Autocomplete v1.1 — `[[` bracket trigger

**Status**: implementation — 2026-04-19.
**Scope**: v1 の `(entry:` トリガに加えて、wiki-style `[[` を **authoring-only トリガ** として追加する。既存の popup / filter / lifecycle を完全に再利用し、挿入形式のみ分岐する。

## 1. Design questions — explicit answers

### Q1. `[[...]]` の立ち位置（A or B）

**採用: A — `(entry:<lid>)` のショートカット（UX trigger）として扱う**

| 選択肢 | 内容 | 本 PR の判定 |
|--------|------|------------|
| **A. 入力補助（authoring-only）** | `[[` は入力中だけ出現し、確定で `[title](entry:lid)` に展開される。保存後の body に `[[...]]` は**残らない**。 | ✅ 採用 |
| B. First-class syntax | `[[title]]` を新しい markdown 構文として保持する。markdown-it plugin を新設して title→lid を解決。 | ❌ 不採用 |

#### A 採用の根拠（アーキテクチャ整合）

1. **canonical form の単一性**: PKC2 は `entry:<lid>` を唯一の entry-ref 正規表現として扱っている (`features/entry-ref/entry-ref.ts`)。B を選ぶと 2 系統並立になり、link-index / relations / backlinks の計算全てに影響する。
2. **lid の安定性**: title は変更可能、lid は不変。`[[title]]` が stored syntax だと title 変更でリンクが切れる（または再解決コストが乗る）。A なら挿入時点で lid に固定される。
3. **export / import の等価性**: 現行 JSON export は body を文字列として往復する。A なら body は既存 markdown のまま。B なら エクスポート先アプリで `[[...]]` の意味が失われる。
4. **markdown-it plugin の増設ゼロ**: A は既存 `entry:` plugin だけで動く。B は新 plugin 必要 + extract-entry-refs / link-index の両方を更新する必要がある。
5. **terminology 清潔度**: PR #53 / v1 で "entry-ref" と "internal entry link" を既に定義済。B を入れると "wiki link" という第 3 の用語が canonical surface に加わる。用語衝突の負債を追加しない。

要点: **`[[...]]` は文法ではなく、入力ジェスチャ**。

### Q2. 同名 title の扱い

- popup 行は v1 から継続で `title + lid` を併記（lid が disambiguator）
- 選択は lid ベース（row の `data-pkc-lid`）なので、title が重複しても混乱なし
- 空 title の場合は表示ラベルを `(untitled)`、挿入ラベルは `lid` にフォールバック（下記 Q3 参照）

### Q3. 挿入するのは title か lid か両方か

**挿入形式: `[${label}](entry:${lid})`** — label と lid の両方を入れる。

- `label = title` if `title` が非空、else `lid`
- **lid が navigation の真実**、title は人間向けラベル。両方入れることで、title が将来変わっても:
  - link 自体は lid で navigate し続ける（壊れない）
  - label は古くなる可能性があるが、renderer が解決時に現在の title を使う選択肢もある（v1 では label 文字列はそのまま残す — stored label 優先 = オーサーが最後に見た title を保存、という意味論）

補足: label 自動更新は renderer / markdown-it 側の未来の選択肢。本 PR ではスコープ外。

### Q4. `]]` auto-close

**採用: しない（ユーザーが `]]` を入力する必要もない）**

- 選択確定時: `[[<query>` を丸ごと `[label](entry:lid)` に置換する。`]]` は元々存在しないので close も不要。
- Escape / click-outside でキャンセル時: `[[<query>` はそのまま残る。auto-insert で `]]` を補わない（以下理由）:
  - ユーザーが `[[ ` を打ったつもりで脇見 Escape した可能性がある。`]]` を勝手に足すと余計な掃除作業を生む。
  - 入力の余地を残す: キャンセル後に `[[foo` を手動で `[[foo]]` にしたいケースも、そうでないケースもある。
  - IME / 他アプリの auto-pair と競合しない。

要するに: `]]` は PKC2 が自律的に挿入することはない。入力補助の対象ではなく、"存在しないもの" として扱う。

## 2. トリガ仕様

### 2 種類のトリガが共存

| トリガ | 検出 | 挿入対象 | 置換範囲 |
|--------|------|---------|---------|
| **`(entry:`**（v1、変更なし） | caret が `(entry:<query>` 末尾（`<query>` ∈ `[A-Za-z0-9_-]*`） | `<lid>` のみ | `<query>` 部分のみ |
| **`[[`**（v1.1 新規） | caret が `[[<query>` 末尾（`<query>` は `]` と `\n` を含まない任意の文字列） | `[label](entry:<lid>)` | `[[<query>` 全体 |

### 優先順位（同時発火はしない）

両方のトリガが caret 位置で同時に成立する文字列は構造上存在しない（`(entry:` は括弧、`[[` はブラケット、prefix が異なる）。action-binder では既存 `(entry:` を先に判定し、不成立なら `[[` を判定する。相互排他。

### `[[` 検出ルール

- caret から後方に最大 1 行内で探索（`\n` で中断 → 非 context）
- `]` に当たったら非 context（開かれていない trigger）
- `[[` を見つけたらそこがトリガ開始点、`bracketStart = position of first '['`
- `query = text.slice(bracketStart + 2, caretPos)`
- 空クエリ（`[[` 直後に caret）でも開く（最初の段階で全候補を見せる）

## 3. 実装構成

| 層 | ファイル | 変更内容 |
|----|---------|---------|
| features | `src/features/entry-ref/entry-ref-autocomplete.ts` | `findBracketCompletionContext(text, caretPos)` を追加 |
| adapter/ui | `src/adapter/ui/entry-ref-autocomplete.ts` | `open*` / 内部 state に `kind: 'entry-url' \| 'bracket'` 追加。`insertCandidate` を kind 分岐 |
| adapter/ui | `src/adapter/ui/action-binder.ts` | input hook に bracket 検出を追加、既存 `(entry:` の次に評価 |
| tests | `tests/features/entry-ref/entry-ref-autocomplete.test.ts` | bracket context 検出テスト追加 |
| tests | `tests/adapter/entry-ref-autocomplete.test.ts` | bracket 挿入テスト追加 |
| docs | `docs/development/entry-autocomplete-v1.1.md` | 本文書 |

v1 の spec doc (`entry-autocomplete-v1.md`) は手を付けない（本 v1.1 は addendum として独立させ、v1 の記述を再解釈しない）。

## 4. テスト観点（追加分）

### pure `findBracketCompletionContext`
- `[[` 直後の caret で `{ bracketStart, query: '' }` を返す
- `[[foo bar` で `{ bracketStart, query: 'foo bar' }`（空白を含む）
- `[foo` のような単一 `[` では `null`
- `][[foo` で先行 `]` がある場合は `null`（開いていないトリガ）
- 改行を跨ぐと `null`
- 連続 `[[[` の末尾 caret で最後の `[[` を拾う（`query: ''`）
- 素の text `plain text` で `null`
- 空テキスト / 不足長で `null`

### adapter
- `kind='bracket'` で open → `[[foo` を `[Alpha](entry:alpha-1)` に置換（title 入り）
- 空 title の entry は label に lid を使う（`[alpha-1](entry:alpha-1)`）
- caret は挿入後 `)` の直後
- popup UI は v1 と同じ（heading / list / item 構造共通）
- Escape で popup 閉じる、textarea に `]]` を追加しない

## 5. 用語整理

本 PR で **既存語の意味を変えない**。新語も追加しない。ただし **authoring-only トリガ** という位置づけを明示する。

| 語 | 位置づけ | 本 PR 時点の扱い |
|----|----------|-----------------|
| `entry:<lid>[#fragment]` = **entry-ref** | canonical URL scheme | 不変 |
| `[label](entry:lid)` = **internal entry link** | markdown 形式の canonical form | 不変、`[[` も最終的にこれに展開される |
| `[[...]]` = **bracket trigger**（本 PR） | **authoring-only UX、stored syntax ではない** | 新設、**暫定**（後述） |
| `relations-based backlinks` / `link-index backlinks` | PR #53 の 2 種 | 不変、本 PR は触らない |

### `[[...]]` の provisional 性

- 本 PR では **入力補助専用**、stored body には残らない、と定義する。
- 将来この設計が変わる可能性:
  - first-class syntax 化（Q1 の B 案）はアーキテクチャ上のコストが大きいので現状の想定外
  - label 更新のスマート化（renderer 側で現在 title を使う）は別議論
- 従って `[[...]]` という表記自体は **暫定** ではあるが、"UX trigger" という役割は安定。PKC2 の canonical form は `entry:<lid>` のまま。

## 6. 非スコープ（v2+ 候補）

- fragment autocomplete（`(entry:lid#` 後の補完）
- recent-first 並び（LRU を app-state に）
- textlog editor への展開（`textlog-entry-text` / `textlog-append-text`）
- label 自動更新（renderer が現在 title を使う）
- first-class `[[...]]` syntax（Q1 の B 案、複雑度大）

## 7. Rollback / 互換性

- 既存 `(entry:` トリガの動作は完全に不変（回帰なし）
- 新規 helper / kind 分岐の追加のみ、データモデル不変
- `git revert` で v1 に戻せる
