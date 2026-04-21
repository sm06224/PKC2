# PKC2 UI Usability Audit — Issue #45

> **⚠️ historical audit（2026-04-21 時点）**
>
> 本文書は **Issue #45（2026-04-07）の凍結 UI usability audit** であり、**現在の UX 状態を示す正本ではない**。
> 本文書以降、#46 / #47 / #49 等で主要 UI blocker が解消された後、Tier 1/2/3 / P0 / H-7 pane state persistence /
> A-2 text split edit / A-3 TOC / A-4 search UX 完成 / P1 Recent Entries / P2 Breadcrumb / P3 rename freshness /
> P4 Saved Searches 等により UX は大きく前進している。
>
> - **現状の handover（canonical）**: `HANDOVER_FINAL.md`
> - **recent wave（2026-04-18〜21）の入口**: `00_index.md` §第5群 末尾 / `../development/INDEX.md` §COMPLETED / `USER_REQUEST_LEDGER.md §1.1`
>
> 本文書は audit の手法と 2026-04-07 時点の指摘を記録する history として保全する。以後 audit の再実施は別文書で行う。

**実施日**: 2026-04-07
**対象**: Pre-Release v0.1.0（Issue #44 完了時点）
**目的**: PKC2 を「日常利用できる知識コンテナ」にするために、UI 実用性の現実を監査する

---

## 分類凡例

| 分類 | 意味 |
|------|------|
| **未実装** | モデルや仕様に存在するが、UI が一切ない |
| **バグ** | 実装されているが正しく動作しない |
| **UX不足** | 動作するが、日常利用に耐えないレベル |
| **仕様上あるが見えない** | 機能はあるが、ユーザーが発見・操作できない |

---

## 1. エントリ編集の監査

### 1.1 Text (Note)

| 項目 | 状態 | 分類 |
|------|------|------|
| 作成 | `+ Note` ボタンで作成可能 | OK |
| 表示 | `<pre>` で body 表示。monospace, pre-wrap | OK |
| 編集開始 | Edit ボタンクリック → AppPhase が editing に遷移 | OK |
| タイトル編集 | `<input>` に表示、編集可能 | OK |
| 本文編集 | `<textarea rows=10>` に表示、編集可能 | **UX不足** |
| 保存 | Save ボタン or Ctrl+S | OK |
| キャンセル | Cancel ボタン or Escape | OK |

**UX不足の詳細**:
- textarea が `rows=10` 固定。長文を書くと非常に狭い
- resize: vertical は CSS にあるが、表示時は `<pre>` なのでプレビューがない
- Markdown 等のフォーマットなし（plain text のみ）— これは仕様として許容
- 編集中にタイトルにフォーカスが当たらない（autofocus なし）
- ダブルクリックで編集開始できない（Edit ボタンのみ）

### 1.2 Todo

| 項目 | 状態 | 分類 |
|------|------|------|
| 作成 | `+ Todo` ボタンで作成可能 | OK |
| 表示 | `[x]` / `[ ]` ボタン + description | OK |
| ステータス切替 | View モードでクリック → toggle（QUICK_UPDATE_ENTRY） | OK |
| 編集 | status select + description textarea | OK |
| 保存 | collectBody が正しく JSON serialize | OK |

**UX不足の詳細**:
- View モードの `[x]`/`[ ]` がボタンだが、見た目がテキストで clickable に見えない
- description が空のとき、表示が何もなく寂しい
- Todo リストとしてのまとめ表示がない（個別エントリとして散在する）

### 1.3 Form

| 項目 | 状態 | 分類 |
|------|------|------|
| 作成 | `+ Form` ボタンで作成可能 | OK |
| 表示 | Name / Note / Checked の3フィールド表示 | OK |
| 編集 | input + textarea + checkbox | OK |
| 保存 | collectBody が正しく JSON serialize | OK |

**UX不足の詳細**:
- 固定3フィールド（name, note, checked）のみ。動的フィールド追加不可
- これは 19_pre_release.md で「意図的に未実装」と明記済み — 許容
- 3フィールドの用途が曖昧（何のためのフォームなのか不明）
- ラベルが英語固定（Name, Note, Checked）

### 1.4 Attachment (File)

| 項目 | 状態 | 分類 |
|------|------|------|
| 作成 | `+ File` ボタンで作成可能 | OK |
| 表示 | File name / Type / Size 表示 | OK |
| 編集 | File input + hidden fields for metadata | OK |
| ファイル選択 | FileReader で base64 読み込み → hidden field に格納 | OK |
| サイズ警告 | 1MB soft / 5MB heavy の guardrail | OK |
| asset 分離 | body はメタのみ、data は container.assets へ | OK |
| 保存 | collectBody + collectAssetData | OK |

**UX不足の詳細**:
- ファイルのプレビューが一切ない（画像でもテキストでも）
- ダウンロードリンクがない（添付されたファイルを取り出す手段がない）
- 複数ファイル添付不可（仕様として明記済み）
- ドラッグ&ドロップ非対応（仕様として明記済み）

### 1.5 共通の編集 UX 問題

| 問題 | 分類 | 深刻度 |
|------|------|--------|
| **全画面再描画**: 状態変更のたびに `root.innerHTML = ''` で DOM 全置換。編集中のカーソル位置・スクロール位置が失われる | **バグ** | **Critical** |
| **Create → 即 Edit にならない**: エントリ作成後、手動で Select → Edit が必要 | **UX不足** | High |
| **編集中に他のエントリを選択できない**: phase が `editing` の間、header の create ボタンが消える（ready のみ表示） | **仕様上あるが見えない** | Medium |
| **Delete に確認がない**: Delete ボタンをクリックすると即座に削除 | **UX不足** | High |
| **Undo がない**: 削除もテキスト編集も undo 不可。revision からの restore のみ | **UX不足** | Medium |

---

## 2. フォルダ / Structural Navigation の監査

### 2.1 データモデル

- `RelationKind = 'structural'` が定義されている（relation.ts:5）
- `structural` は "folder membership" とコメントされている
- Relation の create UI で `structural` kind を選択可能

### 2.2 UI

| 項目 | 状態 | 分類 |
|------|------|------|
| フォルダ作成 | **未実装** — フォルダ専用のエントリ型がない | **未実装** |
| ツリー表示 | **未実装** — サイドバーはフラットリスト | **未実装** |
| 階層ナビゲーション | **未実装** — パンくずもツリーもない | **未実装** |
| structural relation 作成 | UI はある（Add Relation → Structural kind 選択） | **仕様上あるが見えない** |
| structural relation の表示 | Outbound/Inbound として表示されるが、フォルダ的な解釈はない | **仕様上あるが見えない** |

### 2.3 評価

**フォルダ機能は事実上存在しない**。
structural relation というデータモデルは存在するが、それをフォルダとして解釈・表示する UI が一切ない。
ユーザーが手動で structural relation を作成しても、サイドバーのフラットリストに変化はなく、
detail view の「Outbound/Inbound」セクションに表示されるだけ。

これは「未実装」であり、日常利用のためにはサイドバーでの階層表示が最低限必要。
ただし、これは大きな実装であり、Issue #45 のスコープ外。

---

## 3. CSS / レイアウト監査

### 3.1 全体構造

```
pkc-shell (flex column, 100vh)
├── pkc-header (flex row, wrapping)
│   ├── title, phase badge, create buttons
│   └── export-import-panel (width:100%, flex wrap)
├── pkc-main (flex row, flex:1)
│   ├── pkc-sidebar (240px fixed)
│   │   ├── search, filter, sort
│   │   └── entry list
│   └── pkc-detail (flex:1)
│       └── view or editor
└── event-log (fixed, bottom-right)
```

### 3.2 問題点

| 問題 | 分類 | 深刻度 |
|------|------|--------|
| **Header が巨大**: create ボタン4個 + export panel（3セクション）が全部 header に入っている。export panel は `width:100%` でヘッダー高さの大部分を占める | **UX不足** | **Critical** |
| **レスポンシブ対応なし**: sidebar 240px 固定。狭い画面では detail が潰れる | **UX不足** | High |
| **サイドバーの filter/sort が場所を取りすぎ**: 8個の archetype filter ボタン + sort select 2個がすべて表示。エントリリストの開始位置が画面下部に押される | **UX不足** | High |
| **View title row にスタイルがない**: `.pkc-view-title-row` に CSS がない（flex 等未設定）。タイトルと archetype label が block で重なる | **UX不足** | Medium |
| **Editor title row にスタイルがない**: `.pkc-editor-title-row` に CSS がない | **UX不足** | Medium |
| **Tags/Relations にスタイルがほぼない**: `.pkc-tags`, `.pkc-tag-chip`, `.pkc-relation-*` に CSS がない | **UX不足** | Medium |
| **Search input にスタイルがない**: `.pkc-search-input`, `.pkc-search-row` に CSS がない | **UX不足** | Medium |
| **Filter ボタンにスタイルがない**: `.pkc-filter-btn`, `.pkc-archetype-filter` に CSS がない | **UX不足** | Medium |
| **Sort select にスタイルがない**: `.pkc-sort-select`, `.pkc-sort-controls` に CSS がない | **UX不足** | Low |
| **Form/Todo presenter にスタイルがない**: `.pkc-todo-*`, `.pkc-form-*` に CSS がない | **UX不足** | Medium |
| **Attachment presenter にスタイルがない**: `.pkc-attachment-*` に CSS がない | **UX不足** | Medium |
| **Dark mode なし**: CSS variables は定義されているが light のみ | 仕様範囲外 | — |

### 3.3 CSS 行数

現在の `base.css` は **342行**。必要な最低限に対して大幅に不足している。
概算で 200–300行の追加が必要（レスポンシブ、タグ、リレーション、フィルター、presenter、editor 改善）。

---

## 4. 実用上の Blocker 一覧・優先順位

### Critical（公開前に必須）

| # | 問題 | 分類 | 影響 |
|---|------|------|------|
| **C1** | Header が巨大で本体が見えない | UX不足 | 初見で「壊れている」と思われる |
| **C2** | DOM 全置換による編集体験の破壊 | バグ | テキスト入力中にカーソルが飛ぶ。最も深刻な体験問題 |
| **C3** | CSS がスケルトン状態 | UX不足 | filter/tags/relations/editor が unstyled で見た目が崩壊 |

### High（日常利用に必要）

| # | 問題 | 分類 | 影響 |
|---|------|------|------|
| **H1** | Create → 即 Edit フロー | UX不足 | 3クリック必要（Create → Select → Edit） |
| **H2** | Delete に確認なし | UX不足 | 誤削除リスク |
| **H3** | レスポンシブ対応なし | UX不足 | モバイル/タブレットで使用不可 |
| **H4** | 添付ファイルのダウンロード手段なし | UX不足 | ファイルを入れても取り出せない |
| **H5** | Todo の checkbox が見えない | UX不足 | `[x]` テキストがクリッカブルに見えない |

### Medium（品質向上）

| # | 問題 | 分類 | 影響 |
|---|------|------|------|
| **M1** | フォルダ / 階層ナビ未実装 | ✅ **#49 解決** | folder archetype + sidebar tree + breadcrumb + Move to Folder |
| **M2** | Editor autofocus なし | UX不足 | 微妙な操作感の悪さ |
| **M3** | ダブルクリックで編集開始不可 | UX不足 | 自然な操作ができない |
| **M4** | 画像プレビューなし | 未実装 | 添付画像が見えない |

---

## 5. 次にやるべき Issue の推薦

### 推薦: Issue #46 — CSS 整備 + Header レイアウト改善

**理由**: C1 と C3 を同時に解決できる。コードロジックの変更が最小限で、視覚的インパクトが最大。

**スコープ**:
1. Export panel を header から分離（detail 横または collapsible panel へ）
2. Sidebar の filter/sort を compact 化
3. 全未スタイル要素に最低限の CSS を追加
4. View/Editor の title row を flex 化
5. Tags/Relations のチップスタイル
6. Search input のスタイル
7. レスポンシブ breakpoint 1つ（768px 以下でサイドバー非表示 or collapse）

**やらないこと**:
- DOM 全置換の修正（C2）— これはアーキテクチャ変更であり別 Issue
- フォルダ実装（M1）— 大きすぎる
- Presenter の機能追加 — 見た目だけ改善

### その後の推薦順

| 順序 | Issue | 対象 |
|------|-------|------|
| #47 | 編集フロー改善 | C2（差分更新）+ H1（即 Edit）+ H2（削除確認） |
| #48 | Attachment UX | H4（ダウンロード）+ M4（画像プレビュー） |
| #49 | フォルダ基盤 | M1（structural relation → tree navigation） |

---

## 6. 全体評価

PKC2 の保存・可搬・構造化の基盤は堅牢。702テスト全パス、型安全、5層アーキテクチャが健全に機能している。

しかし **UI は「動くプロトタイプ」段階**であり、日常利用に必要な CSS とインタラクション設計が大幅に不足している。
特に以下の3点が、「使える」と「使えない」の境界線:

1. **Header の肥大化** — 画面の 1/3 以上を占め、本体コンテンツが圧迫される
2. **DOM 全置換** — 編集体験を根本的に破壊する（カーソル位置喪失）
3. **CSS スケルトン状態** — 342行で 40+ のクラスが unstyled

公開自体は可能だが、「使ってみてください」と言える状態にするには **最低限 Issue #46（CSS + レイアウト）の完了が必要**。

---

## 7. Issue #46 対応結果（追記）

Issue #46 で C1（Header 肥大化）と C3（CSS スケルトン状態）を解消した。

### 対応内容

| 対象 | 変更 |
|------|------|
| **Header** | Export/Import panel を `<details><summary>` で折りたたみ化。デフォルト閉じ。create ボタンを `pkc-create-actions` div でグループ化・コンパクト化 |
| **CSS** | 342行 → 約600行。40+ の未整備クラスすべてに最低限のスタイルを追加 |

### CSS 整備した主要クラス群

- **Sidebar**: search-row, search-input, archetype-filter, filter-btn, sort-controls, sort-select, tag-filter-indicator, result-count, restore-candidates
- **View**: view-title-row, archetype-label
- **Editor**: editor-title-row（flex 化）、editor-body（focus スタイル、min-height）
- **Tags**: tags, tag-chip, tag-label, tag-remove, tag-add, tag-select
- **Relations**: relation-group, relation-heading, relation-list, relation-item, relation-peer, relation-kind, relation-create, relation-create-row, relation-select
- **Revision**: revision-info, revision-heading, revision-latest, revision-preview
- **Presenters**: todo-view, todo-status, todo-editor, form-view, form-field, form-editor, attachment-view, attachment-field, attachment-editor, attachment-current
- **Import**: import-confirm, import-warning, import-summary, import-row
- **Pending offers**: pending-offers, pending-item

### 残課題

| # | 問題 | 状態 |
|---|------|------|
| **C2** | DOM 全置換問題 | **軽減済み** — Issue #47 で scroll/focus 復元を実装。本格解決は将来 Issue |
| **H1** | Create → 即 Edit フロー | **対応済み** — Issue #47 で CREATE_ENTRY が自動で editing に遷移 |
| **H2** | Delete 確認なし | **対応済み** — Issue #47 で confirm() ダイアログ追加 |
| **H3** | レスポンシブ対応 | **未対応** — Desktop 前提で今回はスキップ |
| **M1** | フォルダ / 階層ナビ | **対応済み** — Issue #49 で folder archetype + tree + breadcrumb + move-to-folder |

---

## 検証結果

| 項目 | 結果 |
|------|------|
| TypeScript typecheck | Clean（エラーなし） |
| テスト | 702 passed, 0 failed |
| Build | 成功（CSS 4.73 KB → 15.57 KB、全体 85.5 KB） |
