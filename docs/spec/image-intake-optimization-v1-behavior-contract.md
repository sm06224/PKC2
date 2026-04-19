# 画像取り込み最適化 v1 — Behavior Contract

Status: DRAFT 2026-04-19
Pipeline position: behavior contract
Predecessor: `docs/spec/image-intake-optimization-v1-minimum-scope.md`
Sibling: `docs/spec/textlog-image-perf-v1-minimum-scope.md`（FI-03、別 issue）

---

## 0. 位置づけ

本文書は `image-intake-optimization-v1-minimum-scope.md` の behavior contract 昇格版である。minimum scope で整理された論点に対し、supervisor が以下の決裁を固定した：

| 決裁 ID | 内容 |
|---------|------|
| **D-IIO1** | v1 は非可逆最適化を含んでよい。ただし lossy 変換は user-visible な確認を前提とする |
| **D-IIO2** | デフォルトは「最適化画像のみ保存」。確認 UI で「原画も保持」を opt-in 可能にする |
| **D-IIO3** | clipboard paste / drag&drop / file attach を対象。import は対象外 |
| **D-IIO4** | v1 は静止 raster image のみ（PNG / JPEG / WebP / BMP）。animation / transparency-sensitive / non-raster は v1 本命外 |
| **D-IIO5** | lossy 最適化は確認 UI 必須。silent optimization 禁止。ただし閾値未満・対象外の silent pass-through は許容 |
| **D-IIO6** | warning threshold と optimization threshold は別概念として分離 |
| **D-IIO7** | 本 FI は FI-03 と並行で contract まで進めてよい |

本文書は上記決裁を **前提事実** として扱い、behavior の具体定義に進む。docs-only、実装しない

---

<!-- S1 -->
## 1. Scope

### 1-1. 対象 surface

| Surface | 対象 | 介入ポイント（コード） |
|---------|------|---------------------|
| **clipboard paste** | **対象** | `action-binder.ts` `handlePaste` → `FileReader.readAsArrayBuffer` 完了後、`btoa()` の **前** に最適化パイプラインを挿入 |
| **drag & drop** | **対象** | `handleFileDrop` / `handleEditorFileDrop` → `processFileAttachmentWithDedupe` / `processFileAttachment` の `reader.onload` 内、同上 |
| **file attach ボタン** | **対象** | `processFileAttachment` → 同上 |
| **import（HTML / ZIP）** | **対象外** | 既に他 container で保存されたデータ。再変換しない |
| **既存 `container.assets`** | **対象外** | I-IIO1: intake 以外で書き換えない |

### 1-2. 対象ファイル分類

| 分類 | MIME type | v1 対象 | 備考 |
|------|-----------|---------|------|
| **PNG（不透過）** | `image/png` | **最適化候補** | スクリーンショットの主要形式。alpha が全 255 なら不透過と見なす |
| **PNG（透過あり）** | `image/png` | **pass-through** | alpha channel を保持する必要あり。v1 では変換しない（v1.x 候補） |
| **JPEG** | `image/jpeg` | **最適化候補** | 写真。既に lossy だが re-encode で縮小可能 |
| **WebP（static）** | `image/webp` | **最適化候補** | Canvas 経由 re-encode。既に最適な場合はサイズ増加を防ぐガード（§2-6） |
| **WebP（animated）** | `image/webp` | **pass-through** | animation 検出は v1.x |
| **BMP** | `image/bmp` | **最適化候補** | 無圧縮。WebP 変換で大幅削減 |
| **GIF** | `image/gif` | **pass-through** | animation / palette-based。v1 では対象外 |
| **SVG** | `image/svg+xml` | **pass-through** | 非 raster。変換しない |
| **その他** | `*/*` | **pass-through** | 既存 attachment パスで無加工保存 |

### 1-3. 透過検出の扱い

PNG の透過有無は Canvas 描画後に pixel 走査で検出可能だが、v1 では **簡易判定** を採用する：

- **v1 方針**: PNG が intake された場合、Canvas に描画し WebP lossy で encode を試みる。結果 blob を生成した上で、元サイズとの比較で採用判定する（§2-6）。透過が必要なケースでは Canvas → WebP lossy で alpha が失われるため、**出力を比較した段階で判定する** のではなく、**事前に alpha channel を走査する**
- **alpha 走査**: Canvas の `getImageData()` で alpha channel（4n+3 byte）が全 255 か判定。O(width × height) だが decode 後の in-memory 操作で十分高速
- **alpha あり判定時**: pass-through（無加工保存）。確認 UI に「透過画像のため最適化をスキップしました」を表示

### 1-4. 対象外の明示

以下は本 behavior contract で **定義しない**：

- FI-03 の staged render / staged asset resolve
- OCR / EXIF 抽出 / メタデータ保存
- import 経路の画像最適化
- 動画・音声の最適化
- Web Worker / WebAssembly 圧縮
- カスタム quality スライダー UI
- batch 再最適化コマンド

---

<!-- S2 -->
## 2. Decision Flow

### 2-1. 全体フロー

```
intake detected (paste / drop / attach)
  │
  ├─ [1] File 読み込み: FileReader.readAsArrayBuffer(file)
  │
  ├─ [2] 候補分類: classifyIntakeCandidate(file.type, file.size)
  │     │
  │     ├─ result = 'not-image'    → [PASS-THROUGH] 既存パスで無加工保存
  │     ├─ result = 'unsupported'  → [PASS-THROUGH] GIF/SVG/animated 等、無加工保存
  │     └─ result = 'candidate'    → 次へ
  │
  ├─ [3] 閾値判定: file.size < OPTIMIZATION_THRESHOLD
  │     │
  │     ├─ true  → [PASS-THROUGH] 小さい画像は無加工保存（silent skip）
  │     └─ false → 次へ
  │
  ├─ [4] 透過検出（PNG のみ）: hasAlphaChannel(imageData)
  │     │
  │     ├─ true  → [PASS-THROUGH] 透過画像は v1 で変換しない
  │     └─ false → 次へ
  │
  ├─ [5] 最適化実行: optimizeImage(arrayBuffer, options)
  │     │  Canvas → drawImage → toBlob('image/webp', quality)
  │     │  + 長辺 resize（MAX_LONG_EDGE 超過時）
  │     │
  │     ├─ 失敗 → [FALLBACK] 無加工保存 + toast 通知
  │     └─ 成功 → 次へ
  │
  ├─ [6] サイズガード: optimizedSize >= originalSize
  │     │
  │     ├─ true  → [PASS-THROUGH] 最適化逆効果。原画で保存
  │     └─ false → 次へ
  │
  ├─ [7] 確認 UI 表示: showOptimizationConfirm(originalSize, optimizedSize, options)
  │     │
  │     │  ┌─────────────────────────────────────────────────┐
  │     │  │ 画像を最適化しますか？                            │
  │     │  │                                                 │
  │     │  │ 2.9 MB → 450 KB（84% 削減）                      │
  │     │  │                                                 │
  │     │  │ ☐ 原画も保持する                                 │
  │     │  │                                                 │
  │     │  │ [最適化して保存]  [そのまま保存]                    │
  │     │  │                                                 │
  │     │  │ ☐ 今後も同じ設定を使う                            │
  │     │  └─────────────────────────────────────────────────┘
  │     │
  │     ├─ 「最適化して保存」 → [8] 保存
  │     └─ 「そのまま保存」   → [PASS-THROUGH] 原画で無加工保存
  │
  └─ [8] 保存実行
        │
        ├─ 「原画も保持する」OFF → optimized のみ保存
        └─ 「原画も保持する」ON  → optimized + original を dual 保存
```

### 2-2. 各ステップの責務

| Step | 責務 | Pure / Side-effect |
|------|------|-------------------|
| [1] File 読み込み | 既存 FileReader 処理。変更なし | Side-effect（IO） |
| [2] 候補分類 | MIME type + size → 3 分類 | **Pure** |
| [3] 閾値判定 | size < threshold → skip | **Pure** |
| [4] 透過検出 | PNG の alpha 走査 | **Pure**（in-memory pixel 操作） |
| [5] 最適化実行 | Canvas resize + WebP encode | Side-effect（Canvas API） |
| [6] サイズガード | 最適化後 ≥ 元 → 棄却 | **Pure** |
| [7] 確認 UI | modal 表示 + ユーザ応答 | Side-effect（DOM） |
| [8] 保存実行 | dispatch PASTE_ATTACHMENT / COMMIT_EDIT | Side-effect（state） |

### 2-3. PASS-THROUGH パス

PASS-THROUGH は「既存の intake 経路をそのまま通す」ことを意味する。PASS-THROUGH に入った場合、**一切の変換を行わず**、既存の `btoa(binary) → dispatch` パスがそのまま動く。PASS-THROUGH は silent であり、確認 UI は表示しない（D-IIO5: silent pass-through 許容）。

### 2-4. 「今後も同じ設定を使う」の挙動

確認 UI のチェックボックス「今後も同じ設定を使う」が有効な場合：

- ユーザの選択（最適化する / しない + 原画保持 ON/OFF）を **ローカル設定** として保存
- 以降の intake では確認 UI をスキップし、保存された設定に従う
- 設定のリセット手段を用意する（§4-4）

これにより D-IIO5（lossy は確認必須）を「初回確認 + 設定化」で満たす。毎回確認は paste 運用で非現実的。

### 2-5. 最適化パラメータ

| パラメータ | v1 固定値 | 根拠 |
|-----------|----------|------|
| **出力フォーマット** | `image/webp` | lossless/lossy 両対応、透過保持（v1 では不透過のみ対象だが）、モダンブラウザ広範対応 |
| **quality** | `0.85` | WebP lossy quality 85。スクリーンショット（文字含む）で視認劣化が最小限、圧縮率 50-80% |
| **MAX_LONG_EDGE** | `2560` px | ウルトラワイド（3440×1440）を縮小対象にする。4K（3840×2160）も対象。Full HD（1920×1080）はそのまま |
| **OPTIMIZATION_THRESHOLD** | `512 * 1024`（512 KB） | 512 KB 未満の画像は最適化不要。小アイコン / UI 切り抜きを保護 |

### 2-6. サイズガードの意味

最適化後バイト数 ≥ 元バイト数の場合、変換は逆効果。例：

- 既に最適化済みの WebP を再 encode → サイズ増加
- 非常に小さい PNG → WebP header overhead で増加

この場合は **原画をそのまま保存** し、確認 UI は表示しない（そもそも提案する意味がない）。toast で「この画像は既に十分小さいため、最適化をスキップしました」を表示する

---

<!-- S3 -->
## 3. Data / Storage Contract

### 3-1. asset key 命名規則

| 保存対象 | asset key | 例 |
|---------|-----------|-----|
| **最適化版**（default） | `att-{timestamp}-{random6}` | `att-1713500000000-x7k9m2` |
| **原画**（opt-in 時） | `att-{timestamp}-{random6}__original` | `att-1713500000000-x7k9m2__original` |

- 最適化版の key は既存の命名規則をそのまま踏襲
- 原画の key は最適化版 key に `__original` suffix を付与。`__` はダブルアンダースコアで、既存の asset key 空間と衝突しない（既存 key は `att-` prefix + timestamp + random のみ）
- `__original` suffix は **予約語** とし、手動での asset key 生成で使用してはならない

### 3-2. attachment entry body の拡張

最適化が行われた場合、attachment entry の body JSON に provenance 情報を追加する：

```json
{
  "name": "screenshot-2026-04-19T10-30-00.webp",
  "mime": "image/webp",
  "size": 460800,
  "asset_key": "att-1713500000000-x7k9m2",
  "optimized": {
    "original_mime": "image/png",
    "original_size": 2900000,
    "method": "canvas-webp-lossy",
    "quality": 0.85,
    "resized": true,
    "original_dimensions": { "width": 3440, "height": 1440 },
    "optimized_dimensions": { "width": 2560, "height": 1073 },
    "original_asset_key": "att-1713500000000-x7k9m2__original"
  }
}
```

- `optimized` フィールドは最適化が行われた場合のみ存在
- `original_asset_key` は原画保持 opt-in 時のみ存在
- 無加工保存の場合、既存の body 構造がそのまま維持される（後方互換性）

### 3-3. Container.assets への格納

```typescript
// 最適化のみ保存の場合
mergeAssets(container, {
  [assetKey]: optimizedBase64,
});

// 原画も保持する場合
mergeAssets(container, {
  [assetKey]: optimizedBase64,
  [`${assetKey}__original`]: originalBase64,
});
```

- `container.assets` は `{ [key: string]: string }` のフラット構造
- 既存の型定義に変更は不要
- 原画保持時のストレージコストはユーザが opt-in で明示的に受け入れる

### 3-4. markdown 参照

body 内の画像参照は常に最適化版を指す：

```markdown
![screenshot-2026-04-19T10-30-00.webp](asset:att-1713500000000-x7k9m2)
```

- 原画への参照は body に自動挿入しない
- 原画は attachment detail view の UI 経由でアクセスする（§4-5）
- `asset:key` → `asset:key__original` の手動参照は可能だが v1 では UI サポートしない

### 3-5. export / import 互換性

| 機能 | 挙動 | 備考 |
|------|------|------|
| **Full HTML export** | 全 asset を含む（最適化版 + 原画） | 既存仕様どおり `container.assets` を全シリアライズ |
| **Light HTML export** | asset を除外 | 既存仕様どおり。最適化版も原画も除外 |
| **ZIP export** | 全 asset をバイナリで含む | `__original` suffix 付き key もそのまま含む |
| **import** | asset をそのまま受け入れ | import 経由の画像は再最適化しない（D-IIO3: import は対象外） |

- `__original` suffix は export/import でも透過的に通過する
- 古い PKC2 インスタンス（最適化機能なし）で import しても、`optimized` フィールドは無視されるだけで既存機能は壊れない（I-IIO5）

### 3-6. PASTE_ATTACHMENT reducer への影響

既存の `PASTE_ATTACHMENT` action 型を拡張する：

```typescript
type PasteAttachment = {
  type: 'PASTE_ATTACHMENT';
  name: string;
  mime: string;
  size: number;
  assetKey: string;
  assetData: string;
  contextLid: string;
  // v1 追加フィールド
  originalAssetData?: string;    // 原画保持時のみ
  optimizationMeta?: {           // 最適化実行時のみ
    original_mime: string;
    original_size: number;
    method: string;
    quality: number;
    resized: boolean;
    original_dimensions: { width: number; height: number };
    optimized_dimensions: { width: number; height: number };
  };
};
```

reducer 側では：

- `originalAssetData` が存在 → `mergeAssets` で `${assetKey}__original` に追加保存
- `optimizationMeta` が存在 → attachment body の `optimized` フィールドに格納
- 両方とも undefined → 既存の無加工パスと完全同一（後方互換）

---

<!-- S4 -->
## 4. UX Contract

### 4-1. 確認 UI の表示条件

確認 UI は以下の **全条件** を満たす場合にのみ表示する：

1. intake された画像が最適化候補である（§1-2: PNG 不透過 / JPEG / WebP static / BMP）
2. 画像サイズが OPTIMIZATION_THRESHOLD（512 KB）以上
3. 透過検出で alpha なしと判定された（PNG の場合）
4. 最適化実行後、結果サイズが元サイズ未満（サイズガード通過）
5. ユーザが「今後も同じ設定を使う」を **選択していない**、または設定をリセット済み

条件 5 が false（設定済み）の場合、保存された設定に従い silent に処理する。これは D-IIO5「silent pass-through 許容」の延長として、**ユーザが明示的に承認した設定** に基づく silent optimization を許容する。

### 4-2. 確認 UI 構成

```
┌──────────────────────────────────────────────────────────┐
│ 画像を最適化しますか？                                     │
│                                                          │
│ screenshot-2026-04-19.png                                │
│ 2.9 MB → 450 KB（84% 削減）                               │
│ 3440×1440 → 2560×1073                                    │
│                                                          │
│ ☐ 原画も保持する（+2.9 MB）                                │
│                                                          │
│ [最適化して保存]  [そのまま保存]                              │
│                                                          │
│ ☐ 今後も同じ設定を使う                                     │
│                                                          │
│ ※ 非可逆変換です。最適化後の画像は元に戻せません。             │
│   原画を保持したい場合は上のチェックを入れてください。          │
└──────────────────────────────────────────────────────────┘
```

### 4-3. UI 要素の定義

| 要素 | `data-pkc-*` selector | 挙動 |
|------|----------------------|------|
| ダイアログコンテナ | `data-pkc-region="optimize-confirm"` | modal。背景クリックで閉じない |
| ファイル名 | `data-pkc-optimize="filename"` | intake されたファイルの元名 |
| サイズ比較 | `data-pkc-optimize="size-compare"` | `{originalSize} → {optimizedSize}（{reductionPercent}% 削減）` |
| 解像度比較 | `data-pkc-optimize="dimension-compare"` | resize 実行時のみ表示 |
| 原画保持チェックボックス | `data-pkc-optimize="keep-original"` | デフォルト **OFF**（D-IIO2） |
| 最適化して保存ボタン | `data-pkc-action="confirm-optimize"` | 最適化版で保存（+ 原画保持なら dual） |
| そのまま保存ボタン | `data-pkc-action="decline-optimize"` | 無加工保存。既存パスと同一結果 |
| 設定記憶チェックボックス | `data-pkc-optimize="remember-choice"` | ON で次回から確認スキップ |
| 非可逆警告文 | `data-pkc-optimize="lossy-warning"` | 常時表示。i18n 対象 |

### 4-4. 設定のリセット

「今後も同じ設定を使う」で保存された設定は、以下の手段でリセットできる：

- **設定画面**（v1 では設定画面がまだ存在しない場合、以下で代替）
- **ブラウザの localStorage クリア**
- **次に表示される最適化確認ダイアログで「設定を変更する」リンク**（v1.x 候補）

v1 では localStorage に `pkc2.imageOptimize.preference` key で保存する：

```json
{
  "action": "optimize",
  "keepOriginal": false,
  "rememberedAt": "2026-04-19T10:30:00.000Z"
}
```

### 4-5. 原画アクセス経路

原画保持が有効な場合、attachment detail view に以下を表示する：

- 「最適化版を表示中（450 KB / WebP）」のバッジ
- 「原画を表示」リンク → `asset:key__original` を表示
- 「原画をダウンロード」リンク → ブラウザの download 機能で保存

v1 では attachment detail presenter に上記要素を追加する。textlog 内の inline 画像は常に最適化版を参照する。

### 4-6. toast 通知

| シナリオ | toast 種別 | メッセージ例 |
|---------|-----------|------------|
| 最適化実行（設定に基づく silent） | `info` | `画像を最適化しました: 2.9 MB → 450 KB` |
| pass-through（閾値未満） | なし | 通知不要 |
| pass-through（透過画像） | `info` | `透過画像のため最適化をスキップしました` |
| pass-through（サイズガード） | `info` | `この画像は既に十分小さいため、最適化をスキップしました` |
| 最適化失敗 | `warn` | `画像の最適化に失敗しました。元のまま保存します` |
| pass-through（GIF/SVG/対象外） | なし | 通知不要 |

### 4-7. surface 統一方針

D-IIO3 で clipboard paste / drag&drop / file attach を対象としたが、v1 では **三者の UX を統一** する：

- 同一の `classifyIntakeCandidate` → 同一の確認 UI → 同一の保存パス
- surface ごとの差別化は v1.x 以降で検討
- 根拠: 差別化は実装・テスト・ドキュメントの複雑度を上げ、v1 の delivery risk を増大させる

---

<!-- S5 -->
## 5. Threshold Contract

### 5-1. 二つの閾値の分離（D-IIO6）

| 閾値 | 概念 | v1 値 | 目的 |
|------|------|-------|------|
| **OPTIMIZATION_THRESHOLD** | 最適化パイプラインが起動するサイズ | `512 * 1024`（512 KB） | これ未満の画像は一切変換しない。小さい画像の保護 |
| **WARNING_THRESHOLD** | サイズ警告を表示するサイズ | 既存 `SIZE_WARN_SOFT`（1 MB） | 「大きいファイルです」の通知。最適化とは独立 |

### 5-2. 閾値の関係

```
0 ────── 512 KB ─────────── 1 MB ──────────── 5 MB ──── 250 MB
         │                   │                  │          │
         OPTIMIZATION_       WARNING_           HEAVY      REJECT
         THRESHOLD           THRESHOLD          WARNING    HARD
         │                   │                  │          │
         最適化提案開始       サイズ通知          強い警告    拒否
```

- `OPTIMIZATION_THRESHOLD < WARNING_THRESHOLD` の関係が成り立つ
- 512 KB〜1 MB の画像は最適化提案されるが、既存の warning は表示されない
- 1 MB 以上の画像は最適化提案 **かつ** warning 表示
- 最適化後のサイズに対して warning を再判定する（最適化後 1 MB 未満なら warning 不要）

### 5-3. 既存 guardrails.ts との関係

v1 では `guardrails.ts` の既存閾値（`SIZE_WARN_SOFT` / `SIZE_WARN_HEAVY` / `SIZE_REJECT_HARD`）を **変更しない**：

- 最適化パイプラインは guardrails の **上流** で動作する
- 最適化後のサイズが guardrails に渡される
- 最適化なし（decline / pass-through）の場合、既存の warning がそのまま発火

将来的に warning threshold の再設計が必要な場合は別 FI で扱う（D-IIO6 の延長）。

### 5-4. 閾値のチューニング余地

v1 の OPTIMIZATION_THRESHOLD = 512 KB は初期値であり、実運用フィードバックで調整する余地を持つ。ただし：

- 変更時は behavior contract の改定を伴う
- 閾値を下げすぎると小画像の不必要な変換が増える
- 閾値を上げすぎると 1 MB 帯のスクリーンショットを見逃す

### 5-5. silent path の no-lossy 保証

OPTIMIZATION_THRESHOLD 未満の画像は **一切の変換を受けない**。これは D-IIO5（silent lossy 禁止）の最も強い形での保証である。「小さいから勝手に最適化する」は禁止

---

<!-- S6 -->
## 6. Invariants

| # | 不変条件 | 検証方法 | 違反条件 |
|---|---------|---------|---------|
| **I-BC1** | **既存保存データ不変**。`container.assets` に既にある base64 は変換しない | テスト: 既存 asset を含む container に paste → 既存 asset が不変 | intake 以外で asset が書き換わったら違反 |
| **I-BC2** | **lossy 変換は明示同意後のみ**。確認 UI なし or 設定未記憶の状態で lossy 変換が走らない | テスト: preference 未設定 + 閾値超過 → 確認 UI が表示される | 確認プロセスなしに lossy 変換が実行されたら違反 |
| **I-BC3** | **pass-through は完全無加工**。PASS-THROUGH パスに入った画像は 1 byte も変換されない | テスト: 閾値未満画像 paste → `container.assets[key]` が入力 base64 と完全一致 | PASS-THROUGH パスで base64 が変化したら違反 |
| **I-BC4** | **変換透明性**。最適化実行時、attachment body に `optimized` メタデータが記録される | テスト: 最適化 paste → body JSON に `optimized` フィールドが存在 | 最適化が行われたのに provenance 記録がなければ違反 |
| **I-BC5** | **原画保持は opt-in**。デフォルトでは最適化版のみ保存。原画保持はユーザ操作が必要 | テスト: デフォルト設定 + 最適化確認 → `__original` asset が作られない | デフォルトで `__original` が作成されたら違反 |
| **I-BC6** | **export/import 不変**。`__original` suffix 付き asset を含む container の Full/ZIP export → import が round-trip する | テスト: dual save → export → import → 両 asset 存在 | export/import で asset が欠落 or 破損したら違反 |
| **I-BC7** | **asset 参照整合性**。body 内の `asset:key` 参照は常に有効な画像に解決される | テスト: 最適化 paste → `asset:key` が markdown render で画像表示 | `asset:key` の解決が失敗したら違反 |
| **I-BC8** | **既存機能 regression なし**。paste / drop / attach の既存テストが全通過 | テスト: 既存テストスイート実行 | 1 件でも regression したら違反 |
| **I-BC9** | **Canvas 失敗時 fallback**。Canvas API / toBlob が失敗しても intake は成功する（原画で保存） | テスト: Canvas.toBlob を mock で null 返却 → 原画保存 + warn toast | 最適化失敗で paste が失敗したら違反 |
| **I-BC10** | **FI-03 scope 不侵入**。read 側の render / presenter コードを変更しない | コードレビュー: diff に `markdown-render.ts` / `textlog-presenter.ts` の変更がないこと | render 側を変更したら違反 |
| **I-BC11** | **閾値未満 silent skip の no-lossy 保証**。OPTIMIZATION_THRESHOLD 未満の画像は変換を受けない | テスト: 511 KB PNG paste → 無加工保存 | 閾値未満で変換が走ったら違反 |
| **I-BC12** | **設定記憶は明示的**。「今後も同じ設定を使う」は opt-in であり、デフォルト OFF | テスト: 確認 UI 表示時に remember-choice が unchecked | デフォルトで記憶が有効だったら違反 |

---

<!-- S7 -->
## 7. Examples

### 7-1. 2.9 MB スクリーンショット — 最適化のみ保存

```
入力: Mac + ウルトラワイド、clipboard paste
      PNG 2.9 MB, 3440×1440, 不透過

フロー:
  [1] FileReader → ArrayBuffer (2.9 MB)
  [2] classifyIntakeCandidate('image/png', 2900000) → 'candidate'
  [3] 2900000 ≥ 512 KB → 閾値超過
  [4] alpha 走査 → 全ピクセル alpha=255 → 不透過
  [5] Canvas: 3440×1440 → 2560×1073 (MAX_LONG_EDGE 適用)
      toBlob('image/webp', 0.85) → 450 KB
  [6] 450 KB < 2900 KB → サイズガード通過
  [7] 確認 UI 表示:
      "2.9 MB → 450 KB（84% 削減）"
      "3440×1440 → 2560×1073"
      ☐ 原画も保持する
      ユーザ: [最適化して保存] クリック
  [8] dispatch PASTE_ATTACHMENT:
      assetData = optimizedBase64 (450 KB)
      originalAssetData = undefined
      optimizationMeta = { original_mime: 'image/png', ... }

結果:
  container.assets['att-xxx'] = WebP 450 KB
  attachment body.optimized = { original_size: 2900000, ... }
```

### 7-2. 2.9 MB スクリーンショット — 原画も保持

```
入力: 同上

フロー: 7-1 と同一だが [7] で:
  ☑ 原画も保持する
  ユーザ: [最適化して保存] クリック

結果:
  container.assets['att-xxx'] = WebP 450 KB
  container.assets['att-xxx__original'] = PNG 2.9 MB
  attachment body.optimized.original_asset_key = 'att-xxx__original'
```

### 7-3. 200 KB の小さな UI 切り抜き — pass-through

```
入力: 小さなアイコン切り抜き、clipboard paste
      PNG 200 KB, 320×240

フロー:
  [1] FileReader → ArrayBuffer (200 KB)
  [2] classifyIntakeCandidate('image/png', 200000) → 'candidate'
  [3] 200000 < 512 KB → 閾値未満
  → PASS-THROUGH: 既存パスで無加工保存

結果:
  container.assets['att-xxx'] = PNG 200 KB（入力そのまま）
  attachment body に optimized フィールドなし
  toast なし
```

### 7-4. 透過 PNG — pass-through

```
入力: 透過背景のロゴ画像、clipboard paste
      PNG 1.5 MB, 2000×1000, alpha チャンネルあり

フロー:
  [1] FileReader → ArrayBuffer (1.5 MB)
  [2] classifyIntakeCandidate('image/png', 1500000) → 'candidate'
  [3] 1500000 ≥ 512 KB → 閾値超過
  [4] alpha 走査 → alpha != 255 のピクセルあり → 透過
  → PASS-THROUGH: 無加工保存

結果:
  container.assets['att-xxx'] = PNG 1.5 MB（そのまま）
  toast: "透過画像のため最適化をスキップしました"
```

### 7-5. file attach で 5 MB JPEG 写真

```
入力: file attach ボタンで写真ファイルを選択
      JPEG 5 MB, 4032×3024

フロー:
  [1] FileReader → ArrayBuffer (5 MB)
  [2] classifyIntakeCandidate('image/jpeg', 5000000) → 'candidate'
  [3] 5000000 ≥ 512 KB → 閾値超過
  [4] JPEG → alpha 走査スキップ（JPEG は透過なし）
  [5] Canvas: 4032×3024 → 2560×1920 (MAX_LONG_EDGE 適用)
      toBlob('image/webp', 0.85) → 800 KB
  [6] 800 KB < 5000 KB → サイズガード通過
  [7] 確認 UI 表示:
      "5.0 MB → 800 KB（84% 削減）"
      ユーザ: [最適化して保存]
  [8] dispatch: processFileAttachment → COMMIT_EDIT with optimized data

結果:
  container.assets['att-xxx'] = WebP 800 KB
```

### 7-6. drag & drop で BMP ファイル

```
入力: drag & drop でスクリーンショット
      BMP 3.5 MB, 1920×1080, 無圧縮

フロー:
  [2] classifyIntakeCandidate('image/bmp', 3500000) → 'candidate'
  [3] 閾値超過 → [4] 透過なし → [5] Canvas → WebP → 200 KB
  [6] ガード通過 → [7] 確認 UI → [8] 保存

結果:
  container.assets['att-xxx'] = WebP 200 KB（94% 削減）
```

### 7-7. GIF アニメーション — pass-through

```
入力: clipboard paste
      GIF 800 KB, animated

フロー:
  [2] classifyIntakeCandidate('image/gif', 800000) → 'unsupported'
  → PASS-THROUGH: 無加工保存

結果:
  container.assets['att-xxx'] = GIF 800 KB（そのまま）
  toast なし
```

### 7-8. 設定記憶後の silent 最適化

```
前提: ユーザが過去に「最適化して保存」+「今後も同じ設定を使う」を選択済み
      localStorage: { action: "optimize", keepOriginal: false }

入力: clipboard paste
      PNG 2.0 MB, 2560×1440, 不透過

フロー:
  [1]→[4] 通常通り（candidate, 閾値超過, 不透過）
  [5] Canvas → WebP → 350 KB
  [6] サイズガード通過
  [7] 設定記憶あり → 確認 UI スキップ
  [8] 保存: optimized のみ

結果:
  container.assets['att-xxx'] = WebP 350 KB
  toast: "画像を最適化しました: 2.0 MB → 350 KB"
```

### 7-9. Canvas 変換失敗 — fallback

```
入力: clipboard paste
      PNG 2.0 MB（Canvas が toBlob で null を返すエッジケース）

フロー:
  [1]→[4] 通常
  [5] Canvas.toBlob → null (失敗)
  → FALLBACK: 原画で無加工保存

結果:
  container.assets['att-xxx'] = PNG 2.0 MB（そのまま）
  toast (warn): "画像の最適化に失敗しました。元のまま保存します"
```

---

<!-- S8 -->
## 8. Testability

### 8-1. Pure function テスト（unit）

| # | 対象関数 | テスト内容 | 環境 |
|---|---------|-----------|------|
| P1 | `classifyIntakeCandidate(mime, size)` | 各 MIME → 'candidate' / 'unsupported' / 'not-image' の分類 | Node（pure） |
| P2 | `classifyIntakeCandidate` | 境界値: `image/gif` → unsupported, `image/svg+xml` → unsupported | Node |
| P3 | `isAboveOptimizationThreshold(size)` | 512 KB 境界（511999 → false, 512000 → true, 0 → false） | Node |
| P4 | `buildOptimizationMeta(...)` | provenance JSON 構造の正当性 | Node |
| P5 | `buildAssetKeyOriginal(key)` | `att-xxx` → `att-xxx__original` | Node |
| P6 | `parseOptimizationMeta(body)` | body JSON → optimized フィールド抽出、未最適化 body → null | Node |
| P7 | `shouldSkipByAlpha(imageData)` | 全 255 → false、1 pixel alpha<255 → true | Node |

### 8-2. Reducer テスト（state）

| # | 対象 | テスト内容 | 環境 |
|---|------|-----------|------|
| R1 | `PASTE_ATTACHMENT` with `optimizationMeta` | body に `optimized` フィールドが含まれる | happy-dom |
| R2 | `PASTE_ATTACHMENT` with `originalAssetData` | `assets[key]` + `assets[key__original]` の 2 件が保存される | happy-dom |
| R3 | `PASTE_ATTACHMENT` without optimization fields | 既存挙動と完全一致（後方互換） | happy-dom |
| R4 | `PASTE_ATTACHMENT` + 原画保持 | attachment body の `original_asset_key` が正しい key を指す | happy-dom |
| R5 | `COMMIT_EDIT` with optimization fields | processFileAttachment 経由の保存で同様に動作 | happy-dom |

### 8-3. Integration テスト（UI + pipeline）

| # | 対象 | テスト内容 | 環境 |
|---|------|-----------|------|
| U1 | 確認 UI 表示 | 閾値超過 PNG paste → `data-pkc-region="optimize-confirm"` が DOM に存在 | happy-dom |
| U2 | 確認 UI: 最適化して保存 | ボタンクリック → optimized asset が container に保存 | happy-dom |
| U3 | 確認 UI: そのまま保存 | ボタンクリック → 原画がそのまま保存、`optimized` フィールドなし | happy-dom |
| U4 | 確認 UI: 原画保持チェック | チェック ON + 最適化 → dual save | happy-dom |
| U5 | 閾値未満 pass-through | 200 KB PNG → 確認 UI 非表示、原画保存 | happy-dom |
| U6 | GIF pass-through | GIF paste → 確認 UI 非表示、原画保存 | happy-dom |
| U7 | 設定記憶 | remember-choice ON → 次回 paste で確認 UI スキップ | happy-dom |
| U8 | Canvas 失敗 fallback | toBlob mock null → 原画保存 + warn toast | happy-dom |
| U9 | toast 通知 | silent 最適化時に info toast が表示される | happy-dom |
| U10 | サイズガード | 最適化後 ≥ 元 → pass-through、確認 UI 非表示 | happy-dom |

### 8-4. テスト対象外（v1）

- Playwright による実ブラウザ Canvas encode 品質テスト（v1.x）
- 異なるブラウザでの WebP 対応テスト（v1.x）
- パフォーマンスベンチマーク（FI-03 spike で方法論は確立済み、必要時に実施）

### 8-5. テスト合計

| カテゴリ | 件数 |
|---------|------|
| Pure function | 7 |
| Reducer | 5 |
| Integration (UI) | 10 |
| **合計** | **22** |

---

<!-- S9 -->
## 9. Future Split（v1.x / 後続）

### 9-1. v1.x 候補

| 施策 | v1 で見送った理由 | v1.x で取り組む条件 |
|------|-----------------|-------------------|
| **透過 PNG の最適化** | alpha 検出 + lossless WebP 変換の品質保証が v1 scope を超える | v1 の pipeline が安定後、lossless WebP encode で透過保持可能であることを spike で確認 |
| **animated WebP / GIF 対応** | animation 検出 + フレーム保持変換が複雑 | ユーザ需要が確認された場合 |
| **surface ごとの UX 差別化** | v1 は統一方針で complexity を抑制 | paste vs attach の体験差が実運用で問題になった場合 |
| **warning threshold 再設計** | guardrails.ts の semantics 変更は影響範囲が広い | 本 FI の intake 最適化が定着後、warning の役割を再定義 |
| **quality スライダー UI** | v1 は固定 quality 0.85 | パワーユーザ需要。設定画面実装後 |
| **Web Worker 化** | paste 中の main thread ブロックが v1 テストで問題にならなかった場合は不要 | 大画像（10 MB+）で体感ブロックが確認された場合 |
| **Blob URL 化**（FI-03 連携） | FI-03 の staged render と組み合わせで初めて意味が出る | FI-03 staged render 実装後 |
| **batch 再最適化** | I-BC1（既存データ不変）との緊張。ユーザ明示操作で限定的に許容する設計が必要 | 既存データの肥大化が実運用で問題になった場合 |

### 9-2. 明確に v2 以降

| 施策 | 理由 |
|------|------|
| **WebAssembly 圧縮（mozjpeg, libavif）** | single-HTML への wasm 同梱がバイナリサイズを肥大化。Canvas API の品質で十分な間は不要 |
| **AVIF 出力** | Canvas.toBlob の AVIF 対応がブラウザ横断で安定していない |
| **EXIF 保持 / 抽出** | 別テーマ。画像最適化とは直交する機能拡張 |
| **サーバーサイド圧縮** | PKC2 は single-HTML / offline-first。サーバー依存は原則外 |

### 9-3. FI-03 との連携ロードマップ

```
現在                      v1                         v1.x
  │                        │                           │
  ├─ FI-03: minimum scope  ├─ FI-03: staged render     ├─ Blob URL 化
  │   rev.2.1              │   behavior contract       │   + staged render
  │                        │                           │
  ├─ 本 FI: behavior       ├─ 本 FI: 実装              ├─ 透過 PNG 対応
  │   contract（本文書）    │   Canvas + 確認 UI        │   batch 再最適化
  │                        │                           │
  両 FI が揃うことで:                                     │
  - 新規画像: intake で縮小                               │
  - 既存画像: render で段階表示                            │
```

---

## References

- Predecessor minimum scope: `docs/spec/image-intake-optimization-v1-minimum-scope.md`
- Sibling FI-03 spec: `docs/spec/textlog-image-perf-v1-minimum-scope.md`（rev.2.1）
- Spike result note: `docs/development/fi-03-spike-native-lazy-result.md`
- `src/adapter/ui/action-binder.ts` — paste / drop / attach の intake 経路
- `src/adapter/ui/guardrails.ts` — 現行サイズ警告閾値
- `src/core/model/container.ts` — `Container.assets` 型定義
- `src/core/operations/container-ops.ts` — `mergeAssets()`
- `src/adapter/state/app-state.ts` — `PASTE_ATTACHMENT` reducer
