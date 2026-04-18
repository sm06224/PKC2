# FI-04 添付基盤 — v1 Minimum Scope

Status: DRAFT 2026-04-18  
Pipeline position: minimum scope  
Parent issue: `docs/planning/file-issues/04_attachment-foundation-multi-add-dedupe-persistent-dnd.md`

---

## 0. 位置づけ

FI-04 は「添付のインフラ」を補強する 3 本柱:

| 柱 | 問題 | v1 範囲 |
|----|------|---------|
| **G-1 multi-add** | non-editing DnD が 1 ファイルしか取り込めない | 複数ファイルを 1 drop で取り込む |
| **G-2 dedupe** | 同一ファイルを 2 回添付すると重複エントリができる | 重複を検知してユーザーに通知する |
| **G-3 常設 DnD** | センターペインを縦スクロールするとドロップゾーンが消える | サイドバー下部に常設ドロップゾーンを追加する |

FI-05（editing 時のリンク自動挿入）は完了済み。FI-04 はその「前工程」にあたる添付取り込み経路を強化するが、FI-05 の動作は一切変更しない。

---

## 1. Scope — やること / やらないこと

### v1 に含む

- **G-1**: `handleFileDrop`（non-editing DnD）を `files[0]` → 全ファイル処理に拡張
- **G-2**: 添付取り込み時に content hash（FNV-1a 64-bit）を計算し、既存 asset と比較。重複検知時にトースト通知を出す（インフォメーショナル）
- **G-3**: サイドバー下部に `data-pkc-region="file-drop-zone"` の常設エリアを追加。`handleFileDrop` の既存パスに乗せる

### v1 に含まない

- non-editing の「+ File」ボタン（`CREATE_ENTRY` dispach 経路）の multi-add 化 — 現在は editing フェーズへ遷移 + ファイル選択の 2 ステップ。UX は変わるが FI-04 の本丸ではなく独立テーマとして扱う
- Asset storage レベルの dedup（同一 hash の asset key 共有）— 共有参照によるリスクを v1 で持ち込まない
- 重複時の「再利用しますか」ダイアログ — インフォメーショナルトーストで十分
- 添付プレビュー / ギャラリ UI
- IDB key 構造の変更

---

## 2. UX フロー

### G-1: multi-add（non-editing DnD）

```
ユーザー: 複数ファイルをセンターペイン DnD または常設 DnD ゾーンへドロップ
↓
handleFileDrop (拡張後):
  for file of e.dataTransfer.files:
    dedupe チェック (G-2)
    processFileAttachment(file, contextFolder, dispatcher)
↓
結果: サイドバーに N 件の attachment エントリが出現
    （編集中の場合は editing DnD path が優先 — FI-05 変更なし）
```

editing DnD（`handleEditorFileDrop`）は変更しない。`handleFileDrop` はすでに `state.phase === 'ready'` のときのみ動くので競合しない。

### G-2: dedupe チェック

```
添付取り込み直前:
  hash = fnv1a64Hex(base64Data)
  size = file.size
  duplicate = container.assets の entries を走査し
    同 hash かつ同 size の asset key を見つけたら duplicate

duplicate がある場合:
  dispatcher.dispatch({ type: 'SHOW_TOAST', level: 'info',
    message: `「${file.name}」は既存の添付と同一内容です` })
  → 続けて processFileAttachment を実行（添付は必ず作成する）

duplicate がない場合:
  → 通常どおり processFileAttachment を実行
```

dedupe は「通知するだけ」。添付エントリの生成はどちらでも実行する（安全寄り）。

### G-3: 常設 DnD ゾーン（サイドバー下部）

- renderer がサイドバー末尾に `data-pkc-region="file-drop-zone"` 要素を常時レンダリング
- 既存 `handleFileDropOver` / `handleFileDropLeave` / `handleFileDrop` がそのまま機能する
- 表示: テキスト「Drop files here」+ 薄い点線枠（ready phase のみ active 表示）
- readonly / editing phase では `pointer-events: none` で非 active にする
- editing phase では center pane の `handleEditorFileDropOver` が優先されるため競合しない

---

## 3. Dedupe 戦略

### ハッシュアルゴリズム

`fnv1a64Hex`（`src/core/operations/hash.ts`）を流用。

入力: FileReader が生成した base64 文字列全体  
出力: 16 文字小文字 hex

FNV-1a 64-bit の衝突確率は 10^5 件で ~5e-10 。PKC2 の典型的な添付数（数十〜数百件）では実用上ゼロ。

### 照合条件

```
hash(新ファイルの base64) === hash(既存 asset value)
AND
file.size === 既存 attachment entry の body.size
```

両方一致した場合のみ "重複" と判定。size の一致チェックは FNV-1a に万一の衝突があっても誤通知を防ぐための belt-and-suspenders。

### 「安全寄り」の意味

- 重複と判定しても **添付を止めない**（誤検知コストより重複許容コストの方が安全）
- hash 計算は base64 全体に対して行うため同名別内容ファイルは重複と判定しない
- エラー時（FileReader 失敗など）は dedupe チェックをスキップして通常処理を続行

---

## 4. 不変条件（Invariants）

| # | 条件 |
|---|------|
| I-FI04-1 | 添付消失禁止 — dedupe 通知が出ても添付エントリは必ず作成される |
| I-FI04-2 | 意図しない上書き禁止 — 既存 asset key は変更しない。新規ファイルは常に新規 asset key を得る |
| I-FI04-3 | FI-05 非破壊 — `handleEditorFileDrop` / `triggerEditingFileAttach` / `processEditingFileDrop` は変更しない |
| I-FI04-4 | editing phase 隔離 — `handleFileDrop` は `state.phase === 'ready'` 限定のまま（editing では editing DnD path が動く）|
| I-FI04-5 | 常設 DnD の非破壊 — 既存 `data-pkc-region="file-drop-zone"` のレイアウト / イベント処理を壊さない |
| I-FI04-6 | hash 計算失敗は soft-fail — hash 計算例外は添付処理をブロックしない |

---

## 5. FI-05 との接続点

FI-05 は editing phase の添付+リンク挿入パイプラインを定義している。FI-04 の 3 つの変更はすべて「FI-05 が処理しない経路」か「FI-05 に委ねる前の前処理」に閉じている。

| FI-04 変更 | FI-05 との関係 |
|-----------|--------------|
| G-1: `handleFileDrop` multi-file | `state.phase === 'ready'` 専用。FI-05 が動く editing phase では実行されない |
| G-2: dedupe チェック | `processFileAttachment` の直前に挿入するインフォメーショナル処理。FI-05 の `processEditingFileDrop` は触らない |
| G-3: 常設 DnD ゾーン | `handleFileDrop` と同じイベントパスを共有。editing phase では center pane の editor DnD が優先されるため FI-05 に干渉しない |

常設 DnD ゾーンに editing phase 中にファイルをドロップした場合の挙動（FI-05 のリンク自動挿入が動くべきか）は v1 では対象外。サイドバー DnD は `state.phase === 'ready'` 限定とする。

---

## 6. 実装ファイル（想定）

| ファイル | 変更内容 |
|---------|---------|
| `src/adapter/ui/action-binder.ts` | `handleFileDrop` multi-file 対応、dedupe ヘルパー呼び出し追加 |
| `src/adapter/ui/renderer.ts` | サイドバー末尾に常設 DnD ゾーン要素を追加 |
| `src/adapter/ui/action-binder.ts` | dedupe 用の pure helper 関数（`detectAssetDuplicate`）を同ファイル内に追加 |
| `tests/adapter/fi04-multi-add-dedupe-persistent-dnd.test.ts` | 新規テストファイル |

`src/core/` への変更なし（hash helper は既存の `fnv1a64Hex` を import するのみ）。

---

## 7. テスト範囲（最小）

### G-1 multi-add

| # | ケース |
|---|--------|
| 1 | ready phase で 3 ファイルを drop → 3 件の attachment エントリが作成される |
| 2 | editing phase では `handleFileDrop` が発火しない（FI-05 パス regression）|

### G-2 dedupe

| # | ケース |
|---|--------|
| 3 | 同一 base64 + 同 size のファイルを 2 回添付 → 2 件目で info toast が出る |
| 4 | 同名・別内容のファイルを添付 → toast が出ない（誤検知なし）|
| 5 | 重複でも添付エントリは作成される |
| 6 | hash 計算エラー → toast なし・添付は正常に作成される |

### G-3 常設 DnD

| # | ケース |
|---|--------|
| 7 | サイドバー DnD ゾーンへ drop → attachment エントリが作成される |
| 8 | editing phase でサイドバー DnD ゾーンへ drop → `handleFileDrop` が発火しない |

### S-FI05 regression

| # | ケース |
|---|--------|
| 9 | editing 中の center pane DnD + リンク挿入 → FI-05 の既存動作が変わらない |

---

## 8. 非対象（Non-goal）

- 「+ File」ボタン（non-editing）の multi-add 化
- Asset storage dedup（asset key 共有）
- 重複時の選択式ダイアログ
- Batch Import の multi-file 拡張
- 添付プレビュー / inline media viewer
- IDB key / schema 変更
