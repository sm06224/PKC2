# Image Intake Optimization v1 — Paste Phase 1 Audit

Status: COMPLETE 2026-04-19
Audited commit: `87270fa` (implementation) → `audit-fix` (this commit)
Contract: `docs/spec/image-intake-optimization-v1-behavior-contract.md` rev.1.1

---

## 1. 監査観点

| # | 観点 | 判定 |
|---|------|------|
| A1 | contract rev.1.1 との整合 | **PASS** |
| A2 | Phase 1 scope 逸脱の有無 | **PASS** |
| A3 | dual save / provenance / back-compat | **PASS** |
| A4 | Canvas failure / unsupported / sensitive fallback | **PASS** |
| A5 | remembered preference の保存先 | **PASS with note** |
| A6 | confirm UI の focus / lifecycle / shell 競合 | **FIXED** (3 defects) |
| A7 | existing paste pipeline regression | **PASS** |
| A8 | type hygiene / architecture hygiene | **PASS** |

---

## 2. 詳細

### A1. contract rev.1.1 との整合

decision flow §2-1 の 8 ステップに対し、`paste-optimization.ts` が 1:1 で対応する。

| contract step | 実装 | 整合 |
|---------------|------|------|
| [1] File 読み込み | action-binder.ts FileReader.onload | ✓ |
| [2] 候補分類 | classifyIntakeCandidate (classifier.ts) | ✓ |
| [3] 閾値判定 | file.size < threshold (paste-optimization.ts L119) | ✓ |
| [4] 透過検出 | hasAlphaChannel → pass-through (L124-130) | ✓ |
| [5] 最適化実行 | optimizeImage (optimizer.ts) | ✓ |
| [6] サイズガード | optimizedSize >= file.size → pass-through (L142) | ✓ |
| [7] 確認 UI / preference | getPreference → silent / showOptimizeConfirm | ✓ |
| [8] 保存実行 | PastePayload → dispatch PASTE_ATTACHMENT | ✓ |

tunable defaults は config.ts に集約。contract §2-5 の要求（単一 config ファイル集約）に適合。

D-IIO1..D-IIO7 の各決裁との整合:
- D-IIO1 (lossy 許容 + 確認前提): lossy は confirm UI 後にのみ実行 ✓
- D-IIO2 (default = optimized only, original = opt-in): keepOriginal デフォルト OFF ✓
- D-IIO3 (paste/drop/attach 対象, import 外): paste のみ変更 ✓
- D-IIO4 (static raster only): classifier が GIF/SVG を unsupported として除外 ✓
- D-IIO5 (silent lossy 禁止, pass-through 許容): pref 未設定時は confirm UI 必須 ✓
- D-IIO6 (threshold 分離): OPTIMIZATION_THRESHOLD と SIZE_WARN_SOFT は独立 ✓
- D-IIO7 (FI-03 並行): FI-03 のコードに変更なし ✓

### A2. Phase 1 scope 逸脱の有無

- drag & drop path (`handleFileDrop` / `handleEditorFileDrop` / `processFileAttachmentWithDedupe`): **未変更** ✓
- file attach path (`processFileAttachment`): **未変更** ✓
- import path: **未変更** ✓
- standalone paste path (L3589-3604, textarea 外): **未変更** — Phase 1 は inline paste のみ対象。standalone paste は既存の `processFileAttachment` を呼ぶため Phase 2 で attach surface と同時に対処

### A3. dual save / provenance / back-compat

- PASTE_ATTACHMENT action 型: optional フィールド追加のみ。undefined 時は既存と同一 ✓
- reducer: `optimizationMeta` / `originalAssetData` が undefined の場合、既存の bodyMeta 構造と同一（テスト R3 で検証） ✓
- `__original` suffix: `mergeAssets` に渡す key が `${assetKey}__original` で、既存の `att-*` key 空間と衝突しない ✓
- provenance body shape: `optimized.original_asset_key` は `originalAssetData` がある場合のみ付与（テスト R4 で検証） ✓
- export: `serializePkcData` は container.assets 全体を serialize するため `__original` 付き key も含まれる ✓
- import: `importFromHtml` は container.assets を一括 decompress するため `__original` 付き key も受け入れる ✓
- 古い PKC2 での import: `body.optimized` フィールドは単純に無視される（unknown field は JSON parse で保持） ✓

### A4. Canvas failure / unsupported / sensitive fallback

| ケース | 実装 | テスト |
|--------|------|--------|
| Canvas 失敗 (optimizeImage → null) | passThrough + warn toast | paste-optimization.test.ts "Canvas failure" ✓ |
| unsupported (GIF) | classifyIntakeCandidate → 'unsupported' → passThrough | "unsupported format (GIF)" ✓ |
| 透過 PNG | hasAlphaChannel → true → passThrough + info toast | "transparent PNG" ✓ |
| サイズガード (optimized ≥ original) | passThrough + info toast | "size-guard" ✓ |
| prepareOptimizedPaste 自体が throw | action-binder.ts catch → fallback payload | 実装あり（テストなし — 追加推奨） |

### A5. remembered preference の保存先

**判定: PASS with note**

localStorage は contract §4-1-2 で明示的に指定されている保存先であり、Phase 1 として正当。

ただし設計ノートとして以下を記録する:

1. **PKC2 の container は IDB に永続化される**。localStorage は container とは独立したライフサイクルを持つ。ブラウザの「サイトデータクリア」で両方消えるが、container の export/import では localStorage は含まれない。つまり preference は portable ではない。これは contract §4-4 の意図（「ブラウザの localStorage クリアでリセット可能」）と一致するため defect ではないが、将来の設定統合（container.meta への格納 or 専用設定 entry）を検討する余地がある。

2. **surface 別分離は正しい**。contract §4-1-1 C2 要件（paste の設定を attach に流用しない）に適合。

3. **localStorage 不可時の fallback は正しい**（quota / privacy mode → catch → 次回 confirm UI 表示）。

### A6. confirm UI の focus / lifecycle / shell 競合

**修正前の defects (3 件)**:

| # | defect | severity | 修正 |
|---|--------|----------|------|
| D1 | z-index: 10000 → base.css tier policy では 20000+ が interactive overlay の正しい tier | **medium** | z-index を 20000 に変更 |
| D2 | Escape key handler 未実装 — 他の PKC2 dialog (text-replace-dialog, asset-picker 等) は Escape で閉じる | **medium** | Escape → decline として処理。document capture phase で登録、close 時に removeEventListener |
| D3 | focus trap 未実装 — Tab で背面にフォーカスが抜ける | **low** | overlay の keydown で Tab を trap。dialog 内の button/input 間を循環 |

3 件とも本 audit commit で修正済み。

**競合検証**:
- shell menu (z-index: 20000): 同一 tier。shell menu が開いているときに paste → confirm UI が出るケースは、editing phase 中に paste が起きる場合。editing phase では shell menu は通常閉じているため実用上競合しない。
- toast stack (z-index: 25000): toast は confirm UI の上に出る。これは正しい（toast は常に最前面であるべき）。
- context menu (z-index: 20000): confirm UI 表示中に right-click → context menu が同一 tier。overlay の background が click を遮るため通常は到達しない。

### A7. existing paste pipeline regression

- 全 4493 テスト pass（regression 0）
- 既存 paste テスト 4 件（text-only skip / editing phase skip / 画像 paste / attach while editing）: 全通過
- standalone paste path (textarea 外): 変更なし、processFileAttachment にそのまま委譲

### A8. type hygiene / architecture hygiene

- **5 層分離**: classifier / config / preference は features 層（pure、browser API なし）。optimizer / preference-store / confirm-ui / paste-optimization は adapter 層。✓
- **import 方向**: features ← adapter。core → features の import なし。✓
- **data-pkc-* selector**: confirm UI は `data-pkc-region="optimize-confirm"`, `data-pkc-action="confirm-optimize"` / `"decline-optimize"`, `data-pkc-optimize="*"` を使用。CSS class に依存しない。✓
- **型安全性**: PASTE_ATTACHMENT action 型は optional fields。既存の dispatch sites で型エラーなし。✓
- **tsc --noEmit**: clean ✓
- **eslint**: clean ✓

---

## 3. 発見した問題と対処

| # | 問題 | 分類 | 対処 |
|---|------|------|------|
| D1 | confirm UI z-index 10000 → 20000 | defect (medium) | 修正済み |
| D2 | Escape key handler 未実装 | defect (medium) | 修正済み |
| D3 | focus trap 未実装 | defect (low) | 修正済み |
| N1 | localStorage preference は container 外で portable ではない | note (future) | 現 contract に適合。将来の設定統合候補として記録 |
| N2 | standalone paste path (textarea 外) は Phase 1 未対象 | note (scope) | Phase 2 で attach surface と同時に対処 |

---

## 4. Invariant 検証

| invariant | 検証方法 | 結果 |
|-----------|---------|------|
| I-BC1 (既存データ不変) | reducer テストで既存 asset が不変 | ✓ |
| I-BC2 (lossy は同意後のみ) | preference 未設定時に confirm UI が出ることをテストで検証 | ✓ |
| I-BC3 (pass-through 完全無加工) | 閾値未満テストで base64 一致を検証 | ✓ |
| I-BC4 (変換透明性) | reducer テストで body.optimized フィールド存在を検証 | ✓ |
| I-BC5 (原画保持 opt-in) | デフォルトで __original 不作成をテストで検証 | ✓ |
| I-BC6 (export/import 不変) | exporter/importer のコード精読で確認 | ✓ |
| I-BC7 (asset 参照整合性) | asset:key 参照は最適化版を指す（contract §3-4 通り） | ✓ |
| I-BC8 (regression なし) | 4493 テスト全通過 | ✓ |
| I-BC9 (Canvas 失敗 fallback) | テストで null → 原画保存を検証 | ✓ |
| I-BC10 (FI-03 不侵入) | diff に markdown-render.ts / textlog-presenter.ts の変更なし | ✓ |
| I-BC11 (閾値未満 no-lossy) | テストで 200KB PNG → 無加工保存を検証 | ✓ |
| I-BC12 (設定記憶は opt-in) | remember-choice デフォルト OFF（confirm-ui.ts L130） | ✓ |

---

## 5. 結論

Phase 1 paste 実装は contract rev.1.1 に整合し、既存パイプラインへの regression なし。発見した 3 件の concrete defect（z-index / Escape / focus trap）は本 audit で修正済み。localStorage preference は現 contract の指定通りであり defect ではないが、将来の設定統合候補として記録。

Phase 2（DnD / attach 展開）に進めてよい状態。
