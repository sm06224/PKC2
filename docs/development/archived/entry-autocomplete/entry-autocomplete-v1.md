# Entry-ref Autocomplete v1 — spec + dev note

**Status**: implementation — 2026-04-19.
**Scope**: text archetype の編集中に `(entry:<query>` をタイプしたとき、候補 entry を選んで `entry:<lid>` を挿入できる軽量な popup を追加する。

## 1. Terminology（用語整理）

PKC2 には **"エントリへの参照" 周辺で互いに似た概念** がすでに複数存在する。本 PR では下表の語を厳密に使い分ける。必要に応じて将来 rename / unify する可能性があるため **暫定** と明記する。

| 用語 | 意味（本 PR 時点） | 実装場所 | v1 でここでの使用 |
|------|-------------------|----------|-------------------|
| **entry-ref** | markdown 本文中の `entry:<lid>[#fragment]` 形式の URL スキーム全般。`ParsedEntryRef` としてコード化済。 | `src/features/entry-ref/entry-ref.ts` | 挿入される文字列 `entry:<lid>` のこと |
| **internal entry link** | markdown リンク構文で entry-ref を使って張った内部リンク `[label](entry:lid)` | renderer / markdown-it plugin | 本 PR が作成支援する対象 |
| **relations-based backlinks** | `container.relations[]` を逆引きして得られる inbound relation の peer 一覧 | Backlinks Panel v1 (`renderer.ts:3077-3091`) | **本 PR で触らない** |
| **link-index / markdown-reference-based backlinks** | body から `entry:<lid>` 参照を抽出して逆引きした結果 | `src/features/link-index/` + meta pane "Backlinks" group | **本 PR で触らない** |
| **entry-ref autocomplete** | 本 PR の機能名。`(entry:<query>` を検出して候補 popup を出す補助 UI | `src/adapter/ui/entry-ref-autocomplete.ts` (新規) | 本 PR で定義 |

### 既知の衝突・ambiguity

- **"backlinks" という語は 2 種類の意味で並立**（PR #53 で明文化済み）。本 PR は どちらにも触らないが、spec doc 同士で相互参照する。
- **"entry link" / "entry ref" / "internal link"** の 3 語は現状で使い分けされていない（主に書き手の気分）。v1 時点で上表のように固定する。将来的に統合する可能性あり。
- **autocomplete 自体の呼称**: `asset-autocomplete` に倣い `entry-ref-autocomplete` とする。"entry autocomplete" とも呼ばれうるが本 PR ではこちらの名称を採用。

### 将来の rename 可能性

- relations-based backlinks / link-index backlinks を統合する "Unified Backlinks" (PR #53 spec doc で v2+ 候補として列挙済) が導入される場合、"Backlinks" という裸の語の扱いが変わる。その際、本 PR の "entry-ref autocomplete" は影響を受けない（別レイヤー）。
- `(entry:` トリガは canonical な markdown 構文の一部なので長期的に安定。`[[`（wiki-style）サポートが将来追加されても、本 PR のトリガは維持できる。

## 2. UX / 動作仕様

### トリガ
- text archetype の編集 textarea（`data-pkc-field="body"`）でのみ発火
- caret が `(entry:<query>` の末尾にあるとき popup を開く
  - `<query>` は `[A-Za-z0-9_-]*`（空文字列 OK、つまり `(entry:` 直後でも開く）
  - `(` の直前は任意（markdown link `[text](entry:)` の URL 括弧内で必ず `(` が来る）
- asset-autocomplete と **完全同型のトリガ設計**（既存 UX と一貫性）

### 候補ソース
- `getUserEntries(container.entries)` を使用 → `system-*` archetype を除外
- 編集中の entry 自身は候補から除外（自己参照は v1 では抑止、将来フラグ化可能）
- todo の archived 状態は archetype に影響しないので含まれる（archived todo も entry として参照可能、これは現行 entry-ref 仕様と整合）

### フィルタ
- 空クエリ → 全候補（先頭から表示）
- 非空クエリ → case-insensitive substring match を `title` と `lid` の両方に適用
- 件数上限: v1 は設けない（実運用で問題が出たら上限追加）

### 候補表示
- title（空なら `(untitled)`）を主ラベル
- lid を右側に小さく表示
- archetype icon も小さく表示（視認性向上、renderer の既存 map を流用）
- 選択中 row に `data-pkc-selected="true"` を付与

### キーボード
- ArrowDown / ArrowUp: 選択 row 移動（circular）
- Enter / Tab: 確定 → `entry:<lid>` を挿入してクローズ
- Escape: クローズのみ
- 他のキー: そのまま textarea に流す（タイプ継続で絞り込み）

### 挿入仕様
- `<query>` 部分のみを `<lid>` に置換
- `(entry:` と後続の `)` は触らない（典型的には `[text](entry:)` の内側）
- caret は挿入 lid の末尾に配置（`)` の直前に留まる）

## 3. 実装構成

| 層 | ファイル | 役割 |
|----|---------|------|
| features | `src/features/entry-ref/entry-ref-autocomplete.ts`（新規） | pure helper: `findEntryCompletionContext`, `filterEntryCandidates`（DOM なし） |
| adapter/ui | `src/adapter/ui/entry-ref-autocomplete.ts`（新規） | 起動 / 更新 / 閉じる / キーボード / 挿入。DOM 直操作 |
| adapter/ui | `src/adapter/ui/action-binder.ts`（編集） | `handleInput` と `handleKeydown` へフックを追加、click-outside でクローズ、unmount でクローズ |
| styles | `src/styles/base.css`（編集） | popup の最小スタイル |
| tests | `tests/features/entry-ref/entry-ref-autocomplete.test.ts`（新規） | pure helper のテスト |
| tests | `tests/adapter/entry-ref-autocomplete.test.ts`（新規） | DOM integration 最小スモーク |
| docs | `docs/development/entry-autocomplete-v1.md`（本文書） | spec / terminology |

**5 層規律**: OK。pure helper を features に置き、adapter が DOM を担う。core には触らない。

## 4. テスト観点

### pure helper
- `findEntryCompletionContext`
  - 非 context で `null`
  - `(entry:` 直後で `{ queryStart, query: '' }`
  - `(entry:foo` で `{ queryStart, query: 'foo' }`
  - `(entry:foo` の foo の途中 caret で query が部分一致
  - `http://entry:foo` のような偽陽性を返さない（`(` が必要）
  - `(entry:foo-bar_baz` のような valid lid 文字を許容
  - `(entry:foo!` の `!` で終端
- `filterEntryCandidates`
  - 空クエリ → 全候補
  - substring / case-insensitive
  - title / lid 両方にマッチ
  - 現在 entry の除外（呼び出し側の責務として別途）
  - system entry の除外（呼び出し側の責務）

### DOM integration（happy-dom）
- textarea に `(entry:` をタイプ → `[data-pkc-region="entry-ref-autocomplete"]` が出る
- ArrowDown → 選択が 2 件目に移る
- Enter → `(entry:<lid>` に展開される、popup は消える
- Escape → popup は消え、textarea の値は変わらない
- click outside → popup が消える
- current entry が候補に含まれない
- system entry が候補に含まれない

## 5. 非スコープ（v2+ 候補）

- `[[` wiki-style トリガ（label 自動挿入つき）
- fragment（`#log/`, `#day/`, etc.）の補完
- ファジー検索 / スコアリング
- textlog / todo editor での発火
- 候補のサムネイル表示（attachment, image）
- エージェント・複数選択
- 最近使った entry を優先表示
- 現 entry を含めるフラグ

## 6. ロールバック / 互換性

- pure helper + 新規 adapter モジュール + action-binder へのフック追加 + CSS の 4 箇所変更
- データスキーマ / 既存 entry-ref 仕様 / COMMIT_EDIT 動作は不変
- `git revert` で完全復元可能
- 既存 asset-autocomplete / slash-menu と相互排他ではない（トリガパターンが重ならない）が、同時オープンは避けるようガードを設ける

## 7. 関連文書

- `docs/development/backlinks-panel-v1.md` — relations-based backlinks の v1 仕様と terminology の前例
- `src/features/entry-ref/entry-ref.ts` — `entry:` スキームの canonical パーサ
- `src/features/markdown/markdown-render.ts:108-130` — `entry:` リンクの描画（action-binder との連携）
- `src/adapter/ui/asset-autocomplete.ts` — 同型の先行実装（本 PR が参考にした構造）
