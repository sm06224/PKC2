# Entry-ref Autocomplete v1.4 — Fragment Completion

**Status**: implementation — 2026-04-20.
**Scope**: `(entry:<lid>#<query>` を検出して、対象 entry に応じた fragment 候補 (`log/<logId>`, `day/<dateKey>`) を popup で提示する。v1 は textlog archetype のみ。挿入フォーマットは既存 `entry:<lid>#<fragment>` スキームに準拠。

## 1. Explicit design answers

### Q1. 対応する fragment 種別（v1）

| fragment 種別 | 形式 | 対応 archetype | v1 |
|--------------|------|---------------|----|
| `log/<logId>` | specific log entry | textlog | **✅** |
| `day/<dateKey>` | date bucket | textlog | **✅** |
| `log/<logId>/<slug>` | log 内 heading | textlog | ❌（v1.5+） |
| top-level `#<slug>` | text entry heading | text / generic | ❌（parser 拡張必要、v1.5+） |
| `log/<from>..<to>` | range | textlog | ❌（v2+） |
| `#<legacy>` | legacy id | textlog | ❌（round-trip のみ、補完対象外） |

**判断根拠**:
- log + day だけで daily log への deep link という主要 UX をカバー可能
- log 内 heading は per-log slug counter の重複処理が複雑（render 時と autocomplete 時で再現する必要あり）
- top-level text heading は `ParsedEntryRef` に該当 kind がなく、navigation も未対応。まず parser 拡張が必要で v1 スコープ外

### Q2. 候補の生成方式
- **runtime 計算、index なし**。autocomplete 発火時に対象 lid の entry を `container.entries.find()` で取得し、archetype が textlog なら `parseTextlogBody(entry.body)` してログ配列を直接スキャン
- 候補列挙は pure helper `collectFragmentCandidates(entry)` に閉じ込める
- 候補数は textlog のログ件数に比例。典型的には数十〜数百程度、1000 を超えても O(n) でフィルタ可能

### Q3. archetype ごとの対応範囲

| archetype | fragment 対応 |
|-----------|--------------|
| `textlog` | log + day（v1 full） |
| `text` / `generic` / `system-about` / `system-settings` | なし（popup は empty state） |
| `todo` / `form` / `attachment` / `folder` / `opaque` | なし（同上） |

text archetype の heading fragment は v1.5+ 課題。現スキームに top-level heading 形式がないため、parser 拡張が先行。

### Q4. 候補ゼロ時のフォールバック
- popup は**開く**（ユーザーに「fragment が存在しないこと」が伝わるように）
- empty state 表示: `"No fragments."`
- Escape / 他キーで自然に閉じる
- 既存 entry autocomplete の empty state と同形

### Q5. Terminology

新しい用語 / 既存用語との関係:

| 用語 | 意味 | 位置づけ |
|------|------|----------|
| **entry-ref** | `entry:<lid>[#fragment]` URL scheme 全体（v1 既定） | **不変** |
| **internal entry link** | `[label](entry:lid#frag)` markdown form | **不変** |
| **fragment** | entry-ref の `#...` 部分。`log/<id>`, `day/<key>` など | 既存（ParsedEntryRef 由来） |
| **fragment completion** | 本 PR の機能名 | 新設、**暫定**（後述） |
| **log fragment / day fragment** | fragment 種別名 | 新設、**暫定** |
| **heading anchor** / **heading slug** | markdown 内 `#`-prefixed heading のスラッグ | 既存 (markdown-toc.ts) |
| **relations-based backlinks** / **link-index backlinks** | PR #53 の 2 種 | 本 PR は触らない |

"fragment" は既に ParsedEntryRef で使われており canonical。"fragment completion" は本 PR の機能名として暫定。将来 rename なら "fragment picker" / "deep-link picker" あり得るが v1 は現名を使用。

**log fragment** / **day fragment** の 2 語は本 PR で導入した分類用語。今後 `log/<id>/<slug>` を heading fragment として追加する時に併用予定（用語衝突なし）。

## 2. UX / 動作仕様

### トリガ
- text archetype / textlog / todo-description など既存 slash-eligible textarea
- caret が `(entry:<lid>#<query>` の末尾にあるとき popup を開く
  - `<lid>` は既に挿入済の valid lid（`[A-Za-z0-9_-]+`）
  - `<query>` は fragment valid chars `[A-Za-z0-9_\-/]`（空でも OK、`#` 直後で発火）
  - `(` の直前がある必要あり（既存 entry-url trigger と同様）

### 競合しない precedence
- 既存 `(entry:<query>` トリガとは**構造的に排他**: こちらは `#` が介在する
- action-binder では評価順: `findEntryCompletionContext` → 該当しなければ `findFragmentCompletionContext` → 次に `findBracketCompletionContext`

### 候補ソース
- action-binder が context から得た `lid` を使い `container.entries.find(e => e.lid === lid)` で対象 entry を取得
- `collectFragmentCandidates(entry)` で candidate 配列を生成
- lid が未存在 / archetype が未対応 → 空配列 → popup は empty state で開く

### 候補表示
- 1 行 = 1 fragment。行内に:
  - **kind badge**: `log` / `day`（kind 別 CSS で色分け）
  - **primary label**: ログなら `makeLogLabel`（`HH:mm:ss  first line…`）、day なら `YYYY-MM-DD`
  - **fragment string**: 右側に小さく `log/<id>` / `day/<key>`
- 選択中 row に `data-pkc-selected="true"`

### キーボード
既存 entry autocomplete と**完全同一**: ArrowDown/Up / Enter / Tab / Escape + mousedown。

### 挿入仕様
- `<query>` 部分のみを fragment identifier に置換
- 例: `[x](entry:my-log#lo` → 選択 → `[x](entry:my-log#log/abc123`
- `entry:<lid>#` と後続の `)` は保護
- caret は挿入末尾

## 3. 実装構成

| 層 | ファイル | 変更 |
|----|---------|------|
| features | `src/features/entry-ref/fragment-completion.ts`（新規） | `findFragmentCompletionContext`, `FragmentCandidate`, `collectFragmentCandidates`, `filterFragmentCandidates` |
| adapter/ui | `src/adapter/ui/entry-ref-autocomplete.ts` | popup に `fragment` mode 追加: state 分岐, render / insert / filter を mode-aware に |
| adapter/ui | `src/adapter/ui/action-binder.ts` | fragment context 検出 + candidate 生成 + popup open |
| styles | `src/styles/base.css` | kind badge + fragment row の小スタイル |
| tests | `tests/features/entry-ref/fragment-completion.test.ts`（新規） | pure helper テスト |
| tests | `tests/adapter/entry-ref-autocomplete.test.ts` | fragment mode の popup テスト追加 |
| docs | 本文書 | spec |

**5 層規律**: 維持。pure helper は features、DOM は adapter。core 不変。
**既存 API**: 破壊変更なし。`openEntryRefAutocomplete` の既存シグネチャ / 挙動は維持。`openFragmentAutocomplete` を新規追加する形で拡張。

### 候補データ構造
```ts
export interface FragmentCandidate {
  kind: 'log' | 'day';
  /** 挿入される fragment 識別子（`log/<id>`, `day/<key>`）。`#` は含まない。 */
  fragment: string;
  /** popup 表示用の primary label。 */
  label: string;
  /** 追加情報（任意）。 */
  sub?: string;
}
```

### 並び順
- logs を**新しい順**（reverse chronological）で先に出す
- day を**新しい順**で後ろに出す
- 理由: 直近の log に deep link する用途が圧倒的に多い。日付は boundary であり従属的

recent-first 並び（v1.3）は **fragment には適用しない**（lid 単位のメモリを fragment 単位に拡張すると複雑化）。v2+ 候補。

## 4. テスト観点

### pure helper
- `findFragmentCompletionContext`
  - `(entry:foo#|` → `{ lid: 'foo', queryStart, query: '' }`
  - `(entry:foo#log/ab|` → `query: 'log/ab'`
  - `(entry:foo|` （`#` なし）→ `null`
  - `entry:foo#bar` （先行 `(` なし）→ `null`
  - `(entry:#bar` （空 lid）→ `null`
  - `(entry:foo#log bar` （空白）→ `null`
  - caret 位置不足 → `null`
- `collectFragmentCandidates`
  - text archetype → `[]`
  - textlog with 3 logs across 2 days → 3 logs + 2 days, 順序正しい
  - textlog 空 → `[]`
  - 存在しない logId / 不正な createdAt の混入 → 安全に処理
- `filterFragmentCandidates`
  - 空クエリ → 全返却
  - `log` → log 系のみ
  - `day` → day 系のみ
  - case-insensitive

### adapter (DOM)
- fragment mode で popup が開く / `data-pkc-region="entry-ref-autocomplete"` が付く
- 候補行に `data-pkc-fragment-kind` attribute
- Enter で挿入、`<query>` 部分のみ置換される
- Escape で閉じる、textarea 不変
- 候補ゼロでも popup は開き empty state 表示

### integration (任意)
- text 編集中 `(entry:tl-1#` を入力 → popup が textlog の log を列挙
- `(entry:my-text#` (archetype=text) → empty state

## 5. 非スコープ（v1.5+ 候補）

- **log 内 heading fragment** (`log/<id>/<slug>`) — per-log slug counter の共有が必要
- **text / generic archetype top-level heading** — `ParsedEntryRef` に新 kind 追加 + navigation 対応が必要
- **range fragment** (`log/<a>..<b>`) — 選択 UI が必要
- **recent-first for fragments** — fragment 単位の LRU
- **fragment autocomplete inside `[[...]]`** — wiki trigger では通常 `entry:` に展開するので fragment 補完は reopen 後に必要。v1 は reopen 後の `(entry:...#` で動作
- **cross-entry heading popup** — text 内 heading 推奨ポップアップ

## 6. Rollback / 互換性

- 既存 entry-url / bracket autocomplete の動作は完全に不変
- 新規 pure helper + adapter mode 追加のみ、データスキーマ不変
- `entry:<lid>#<fragment>` は既に canonical — 挿入フォーマットは既存 navigation と整合
- `git revert` で完全復元可能

## 7. 関連文書 / コード

- `src/features/entry-ref/entry-ref.ts` — canonical parser（ParsedEntryRef kinds）
- `src/features/textlog/textlog-body.ts` — TextlogBody スキーマ
- `src/features/textlog/textlog-doc.ts:toLocalDateKey` — day key 生成
- `src/features/markdown/markdown-toc.ts:makeLogLabel` — log preview label
- `src/adapter/ui/action-binder.ts` — navigate-entry-ref ハンドラ（fragment 先の解決）
- `docs/development/entry-autocomplete-v1.md` / `-v1.1.md` / `-v1.2-textlog.md` / `-v1.3-recent-first.md` — ancestor specs
