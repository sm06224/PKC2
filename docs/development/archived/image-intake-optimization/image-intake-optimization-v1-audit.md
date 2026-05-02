# Image Intake Optimization v1 — Full Audit

Status: COMPLETE 2026-04-19
Audited commit: `e015dea` (Phase 2 push) → `audit-fix` (this commit)
Contract: `docs/spec/image-intake-optimization-v1-behavior-contract.md` rev.1.1
Predecessor audits:
- `docs/development/image-intake-optimization-v1-paste-audit.md` (Phase 1)
- `docs/development/image-intake-optimization-v1-phase2-impl.md` (Phase 2 impl note)

---

## 1. 監査観点

| # | 観点 | 判定 |
|---|------|------|
| A1 | contract rev.1.1 との整合 | **PASS** |
| A2 | paste / drop / attach の 3 surface 一貫性 | **PASS** |
| A3 | surface 別 remembered preference 分離 | **PASS** |
| A4 | dual save / provenance / back-compat | **PASS** |
| A5 | Canvas failure / unsupported / sensitive fallback | **PASS** |
| A6 | confirm UI の lifecycle / focus / shell 競合 | **PASS** |
| A7 | FI-04 dedupe / FI-05 attach-while-editing / export/import 整合 | **PASS** |
| A8 | localStorage preference の妥当性と将来整合 | **PASS with note** |
| A9 | size increase の妥当性 | **PASS** |
| A10 | type / architecture hygiene | **FIXED** (2 stale comments) |

---

## 2. A1. contract rev.1.1 との整合

contract §2-1 の 8-step decision flow と実装の対応を全行トレース:

| step | contract 記述 | 実装位置 | 判定 |
|------|--------------|---------|------|
| [1] File/Blob 受領 | `action-binder.ts` paste/drop/attach 各 handler | handler ごとに File を生成 → base64 化して `prepareOptimizedIntake` へ | PASS |
| [2] classify | `classifyIntakeCandidate(file.type)` | `paste-optimization.ts:120` | PASS |
| [3] threshold 判定 | `< DEFAULT_OPTIMIZATION_THRESHOLD (512KB)` → passThrough | `paste-optimization.ts:126` | PASS |
| [4] alpha check (PNG) | `hasAlphaChannel` → 透過あれば passThrough + toast | `paste-optimization.ts:131-137` | PASS |
| [5] optimize | `optimizeImage(file, {quality,maxLongEdge,outputMime})` / 失敗時 passThrough + warn toast | `paste-optimization.ts:140-144` | PASS |
| [6] size guard | `optimizedSize >= file.size` なら passThrough + info toast | `paste-optimization.ts:149-155` | PASS |
| [7a] remembered pref | `getPreference(surface)` で silent optimize / silent decline | `paste-optimization.ts:161-178` | PASS |
| [7b] confirm UI | `showOptimizeConfirm(...)` / remember 時 `setPreference(surface,...)` | `paste-optimization.ts:181-205` | PASS |
| [8] dispatch | PASTE_ATTACHMENT (paste/editor-drop) / COMMIT_EDIT (sidebar-drop/attach) | `action-binder.ts` L3230+ / L3533+ / L4788+ / L4887+ | PASS |

D-IIO1..D-IIO7 invariant 対応:
- D-IIO1 (pipeline 入口集約): 全 surface が `prepareOptimizedIntake` を通過 ✓
- D-IIO2 (step 順序固定): classify → threshold → alpha → optimize → size-guard → remembered → confirm の順で固定 ✓
- D-IIO3 (size-guard 後に compare): `optimizedSize >= file.size` で pass-through ✓
- D-IIO4 (fallback 包摂): 失敗は必ず passThrough へ集約 ✓
- D-IIO5 (surface 独立): `getPreference(surface)` / `setPreference(surface,...)` で surface key を強制 ✓
- D-IIO6 (dual save schema 共通): `buildAttachmentBodyMeta` / `buildAttachmentAssets` で統一 ✓
- D-IIO7 (provenance only when actually optimized): `optimizationMeta` は step [7a]/[7b] optimize path でのみ付与 ✓

## 3. A2. 3 surface 一貫性

全 3 surface が共通 orchestrator を通る: surface × step matrix

| surface | entry 点 | base64 化 | orchestrator call | dispatch |
|---------|---------|----------|------------------|---------|
| paste (editing) | `handlePaste` onload | FileReader.readAsDataURL | `prepareOptimizedIntake(file, b64, 'paste', opts)` @ L3533+ | PASTE_ATTACHMENT |
| paste (standalone) | `handlePaste` standalone fallback | FileReader | `processFileAttachment(...,'attach')` @ L3609+ (attach surface に fallback) | CREATE_ENTRY + COMMIT_EDIT |
| drop (editor) | `processEditingFileDrop` | FileReader | `prepareOptimizedIntake(file, b64, 'drop', opts)` @ L3230+ | PASTE_ATTACHMENT |
| drop (sidebar) | `processFileAttachmentWithDedupe` | FileReader | `prepareOptimizedIntake(file, b64, 'drop', opts)` @ L4788+ | CREATE_ENTRY + COMMIT_EDIT |
| attach button | `processFileAttachment` | FileReader | `prepareOptimizedIntake(file, b64, 'attach', opts)` @ L4887+ | CREATE_ENTRY + COMMIT_EDIT |

共通化確認:
- IntakeSurface 引数は型で required なので surface 指定漏れは compile error
- FI-04 dedupe は post-optimization base64 に対して実行 (L4788+ WithDedupe path) → optimized bytes で重複検出
- 3 surface で同一 default params (quality 0.85 / maxLongEdge 2560 / threshold 512KB / outputMime webp)
- fallback (classifier non-candidate / <threshold / alpha / canvas fail / size-guard) は全て passThrough で元ファイルそのまま保存

## 4. A3. surface 別 preference 分離

localStorage key separation (§4-1-2):
- paste: `pkc2.imageOptimize.preference.paste`
- drop:  `pkc2.imageOptimize.preference.drop`
- attach: `pkc2.imageOptimize.preference.attach`

`preferenceStorageKey(surface)` がテンプレートで `${surface}` を埋めるため、surface 追加/誤用時は key collision しない構造。`get/setPreference(surface, ...)` がどちらも surface key を required 引数として受けるので cross-surface leak は起こり得ない。

D-IIO5 surface independence の test coverage:
- `tests/adapter/ui/image-optimize/paste-optimization.test.ts`:
  - "paste preference does not affect drop" (set paste=optimize → drop 実行で confirm UI 出る)
  - "drop preference does not affect attach" (set drop=decline → attach 実行で confirm UI 出る)
  - "attach preference does not affect paste" (set attach=optimize+keepOriginal → paste 実行で confirm UI 出る)
- いずれも `confirmImpl` mock が呼ばれることで分離を確認

contract §4-1-1 C2 "preference saved under one surface MUST NOT influence others" 完全遵守。

## 5. A4. dual save / provenance / back-compat

PASTE_ATTACHMENT (paste/editor-drop) と COMMIT_EDIT (sidebar-drop/attach) が **byte-identical な body JSON + asset map** を生成することを verify。

body JSON 構造 (共通):
```json
{
  "name": "...",
  "mime": "image/webp",
  "size": 12345,
  "asset_key": "att-...",
  "optimized": {
    "original_mime": "image/png",
    "original_size": 234567,
    "method": "canvas-webp-lossy",
    "quality": 0.85,
    "resized": true,
    "original_dimensions": { "width": 3840, "height": 2160 },
    "optimized_dimensions": { "width": 2560, "height": 1440 },
    "original_asset_key": "att-..._original"  // keep-original 時のみ
  }
}
```

asset map (共通):
- 必ず `{ [assetKey]: payload.assetData }`
- `keep-original` 時は `{ [assetKey]: optimizedBase64, [assetKey + '__original']: originalBase64 }`

実装:
- `buildAttachmentBodyMeta(fileName, assetKey, payload)` @ `paste-optimization.ts:213-240` が単一 source of truth
- PASTE_ATTACHMENT reducer (`app-state.ts:2072-2102`) は action field から直接 JSON を組み立てるが、key 名と shape は helper と 1:1 対応
- sidebar-drop/attach path は `buildAttachmentBodyMeta` で body を生成 → COMMIT_EDIT に渡す

back-compat:
- 既存 (pre-optimize) の attachment body は `optimized` field を持たない → reader は `body.optimized ?? undefined` で同等に扱える
- asset map は pre-optimize でも `{ [assetKey]: base64 }` 単一 entry → `__original` 追加だけで forward-compat 維持
- 既存 entry の reload / export / import は影響なし (I-BC11)

## 6. A5. fallback 階層

失敗の種類別に fallback 経路を verify:

| 失敗原因 | 実装位置 | ユーザ通知 | 保存内容 |
|---------|---------|----------|---------|
| classifier non-candidate (非 image / 未対応 mime) | `paste-optimization.ts:121-123` | toast なし (silent) | original そのまま |
| size < threshold (512KB 未満) | `paste-optimization.ts:126-128` | toast なし | original |
| PNG with alpha (透過) | `paste-optimization.ts:131-137` | info toast "透過画像のため最適化をスキップしました" | original |
| `createImageBitmap` 非対応/失敗 | `optimizer.ts:28-35` → null → `paste-optimization.ts:140-144` | warn toast "画像の最適化に失敗しました。元のまま保存します" | original |
| `canvas.getContext('2d')` 失敗 | `optimizer.ts:64-65` → null → 同上 | 同上 | original |
| `canvas.toBlob` 失敗 | `optimizer.ts:37-45` → null → 同上 | 同上 | original |
| size guard 発動 (optimized >= original) | `paste-optimization.ts:149-155` | info toast "この画像は既に十分小さいため、最適化をスキップしました" | original |
| confirm UI decline | `paste-optimization.ts:204-205` | なし | original |

階層構造: 不可能 → 不利益 → ユーザ意思 の順で段階的に fallback。いずれも `passThrough(file, originalBase64, file.size)` に集約され、dispatch 経路は optimize 成功時と同一 (ただし `optimizationMeta` なし)。

sensitive mime (`image/gif`, `image/svg+xml` 等): classifier で 'unsupported' になるため [2] で弾かれる → toast なしで original。GIF/SVG は可逆性担保のため意図的に optimize 対象外 (contract §2-3)。

## 7. A6. confirm UI lifecycle

`confirm-ui.ts` の振る舞い:
- DOM: `document.body` に append された overlay + panel 構造、`data-pkc-region="optimize-confirm"` でスコープ可能
- **z-index: 20000** (audit fix で明示) — shell overlay (10000 tier) / toast (15000 tier) より上
- Escape: `document.addEventListener('keydown', ..., { capture: true })` で capture phase ハンドリング → editor の Escape と競合しない
- focus trap: Tab / Shift+Tab で `focusable[]` 内を循環。外部への tab-out は防止
- 初期 focus: "最適化して保存" ボタン
- **cleanup**: resolve 前後で `document.removeEventListener` + `overlay.remove()` を finally で確実実行
- shell 競合: modal が open 中は body 直下 + 最上位 z-index なので Drawer / EditorSheet / toast と干渉せず

ライフサイクル確認:
- 単一インスタンス保証: 並行呼び出しは paste-optimization.ts 側の await によって直列化される
- Promise resolve 後は overlay 完全除去 → memory leak なし
- confirm UI 内 click 時: overlay click は dismissal 扱いせず (panel 内のみ button で resolve)

## 8. A7. FI-04 / FI-05 / export-import

**FI-04 (attachment dedupe):**
- `processFileAttachmentWithDedupe` (action-binder.ts:4788+) は optimize pipeline 通過 **後** の base64 で dedupe を判定
- informational toast のみ表示、添付動作は決してブロックしない (I-FI04-1)
- dedupe は optimized bytes で行うため、同じ画像でも異なる optimize 結果なら別 asset 扱い (現 v1 では通常同一結果だが、将来 quality 変更時に破綻しない)

**FI-05 (attach while editing):**
- paste / editor-drop は編集中の entry body に添付 → PASTE_ATTACHMENT で editing buffer を更新
- attach button / sidebar-drop は CREATE_ENTRY → COMMIT_EDIT で新規 entry 生成
- editing phase 中の attach は PASTE_ATTACHMENT 経路で既存 editing buffer をマージ (body の `attachments[]` 追記 + assets map 追加)

**export/import:**
- Container 全体 export: `container.assets` に `assetKey` / `assetKey__original` 両方含まれる → import 復元時に両方復元
- body JSON 内の `optimized.original_asset_key` は文字列参照のみ → export/import で壊れない
- 旧形式 (optimized field なし) の import: reducer / renderer は `body.optimized` 不在時は optimized 情報を無視、displayed asset は `asset_key` のみ参照 → forward-compat OK

## 9. A8. localStorage preference

localStorage schema (`preference-store.ts`):
```json
{
  "action": "optimize" | "decline",
  "keepOriginal": boolean,
  "version": 1
}
```

key: `pkc2.imageOptimize.preference.${surface}` — surface ごと独立 (§4-1-2)

妥当性:
- quota: 1 key あたり ~50 bytes × 3 surface = 150 bytes 以下 → localStorage quota に対して無視できる
- invalid JSON parse 時は `null` を返す (silent fallback) → 常に confirm UI が出る安全側動作
- version field: 将来 schema 変更時の migration trigger (現 v1 では version 1 固定、読み取りは version ≠ 1 を null 扱いする)

**Note (A8/N1): 将来整合 gap**
- 現状、localStorage を reset する **UI は未実装**
- contract §4-4 "remembered preference のクリア手段は v1 では localStorage 手動削除を許容" と明記されており仕様遵守
- 将来追加するなら Settings ペインに "Image intake preference" reset button を置く想定 (v1.x 余地)

C4 条件 (contract §4-1-1): localStorage disabled / privacy mode 環境では `getPreference` が null を返す → 毎回 confirm UI が出る。テスト `preference-store.test.ts` で try/catch カバー済み。

## 10. A9. size increase

bundle size 変遷 (dist/bundle.js minified):
| stage | size | Δ |
|-------|------|---|
| pre Phase 1 (baseline) | 589.8 KB | — |
| Phase 1 (paste surface) | ~596 KB | +~6 KB |
| audit fix (Phase 1 完了) | ~597 KB | +~1 KB |
| Phase 2 (drop + attach) | 600.2 KB | +~3 KB |
| **total** | **600.2 KB** | **+10.4 KB** |

単一 HTML (`dist/pkc2.html`) 変遷: 約 +~10 KB (bundle css 変化なし)

内訳:
- `src/features/image-optimize/*.ts`: classifier + config + preference = 約 2 KB minified
- `src/adapter/ui/image-optimize/optimizer.ts`: Canvas / alpha / blobToBase64 = 約 2.5 KB
- `src/adapter/ui/image-optimize/paste-optimization.ts`: orchestrator + helpers = 約 3 KB
- `src/adapter/ui/image-optimize/confirm-ui.ts`: dialog DOM + focus trap = 約 2 KB
- action-binder 統合 (3 surface 対応) + PASTE_ATTACHMENT reducer 拡張 + user-action 拡張 = 約 1 KB

妥当性判断:
- +10.4 KB / 600 KB = **+1.76%** の増加
- 画像最適化 (容量節約: 典型 2-10x 削減) と **永続ストレージ容量** が主目的 → bundle size tradeoff は十分正当化される
- 単一機能 (image intake pipeline 完全統合) の cost として、オーバーヘッドは許容範囲
- 他大型 feature (kanban view, calendar, export/import) と比較しても突出なし

## 11. A10. type / architecture hygiene

**type hygiene:**
- `IntakeSurface` は union literal type で cross-layer に共有 (features → adapter)
- `IntakePayload` / `OptimizationMeta` / `IntakeOptimizeOptions` は interface 定義、optional field は明示的 `?`
- `prepareOptimizedIntake` の戻り値 `Promise<IntakePayload>` → dispatch 側で field 有無を型で保証
- test hook (optimizerImpl / alphaCheckImpl / confirmImpl / toastImpl) は全て `typeof` 参照 → 実装と signature が drift しない
- `any` / `as unknown as X` 追加なし (existing blobToBase64 内の `as unknown as number[]` のみ、Uint8Array → Array variadic 用で既存コード)

**architecture hygiene:**
- 5-layer violation なし:
  - core: 触らず
  - features/image-optimize: pure types / constants / pure helpers のみ (browser API 不使用)
  - adapter/ui/image-optimize: Canvas/localStorage/DOM を local に閉じ込め
  - adapter/state/app-state.ts: PASTE_ATTACHMENT reducer 拡張のみ (action shape にそのまま従う)
- `paste-optimization.ts` が single entry point → surface 増加時も orchestrator に surface 引数追加のみで拡張可能
- confirm-ui.ts は独立モジュールで presenter 層に依存しない → ポータブル

**stale comments (FIXED):**
- `src/core/action/user-action.ts:312` の JSDoc "Phase 1, paste surface only" → "paste + editor-drop surfaces" に修正
- `src/adapter/state/app-state.ts:2078` のコメント "Phase 1, paste surface only" → "paste + editor-drop surfaces" に修正
- いずれも Phase 2 で editor-drop も PASTE_ATTACHMENT を使うようになったが comment が古い記述のまま残っていた minor defect

## 12. 発見した問題と対処

| # | severity | 場所 | 内容 | 対処 |
|---|---------|------|------|------|
| D1 | minor | `src/core/action/user-action.ts:312` | JSDoc "Phase 1, paste surface only" が Phase 2 で obsolete | コメントを "paste + editor-drop surfaces" に更新 |
| D2 | minor | `src/adapter/state/app-state.ts:2078` | inline comment が同じく obsolete | 同様に修正 |
| N1 | note | UI 全体 | remembered preference を reset する UI が未実装 | contract §4-4 で v1 は localStorage 手動削除を許容。v1.x で Settings reset button 検討 |

重大な defect なし (no PASS-fail observation)。A1〜A9 はいずれも PASS、A10 は stale comment fix 後に PASS。

## 13. Invariant verification

| invariant | 内容 | 判定 | 根拠 |
|-----------|------|------|------|
| I-BC1 | classifier / threshold / alpha / size-guard を経た上で optimize | PASS | paste-optimization.ts §2 step 順序 |
| I-BC2 | passThrough は必ず original の mime/size/base64 をそのまま保存 | PASS | `passThrough(file, originalBase64, file.size)` 3-surface 共通 |
| I-BC3 | optimized 出力は outputMime (webp) 固定 | PASS | `DEFAULT_OUTPUT_MIME = 'image/webp'` |
| I-BC4 | confirm UI の選択は remember=true のみ localStorage 保存 | PASS | paste-optimization.ts:190-192 条件分岐 |
| I-BC5 | surface preference は独立 | PASS | D-IIO5 / §4 A3 |
| I-BC6 | dual save の asset_key 命名規則 `{key}` + `{key}__original` | PASS | buildAttachmentAssets |
| I-BC7 | optimizationMeta は optimize 実行時のみ付与 | PASS | D-IIO7 / buildAttachmentBodyMeta 内の if |
| I-BC8 | confirm UI は modal 扱い (Escape / overlay / focus trap) | PASS | confirm-ui.ts |
| I-BC9 | Canvas 失敗は全て passThrough に集約 | PASS | optimizer.ts null 返却 / orchestrator fallback |
| I-BC10 | render 側への変更なし (既存 attachment 表示維持) | PASS | git diff で renderer.ts / detail-presenter.ts 変更なし |
| I-BC11 | back-compat (`optimized` 不在時) | PASS | body.optimized ?? undefined パターン |
| I-BC12 | export/import で `__original` asset 復元 | PASS | container.assets に両方含む / §8 A7 |
| D-IIO5 | surface ごと getPreference/setPreference 分離 | PASS | §4 A3 tests |

## 14. 結論

image-intake-optimization v1 は **監査合格**。

- contract rev.1.1 §2-1 の decision flow と実装が全 step 対応
- paste / drop / attach の 3 surface が同一 orchestrator を通り、surface ごとの preference が strict に分離
- dual save / provenance / back-compat は byte-identical な body/asset を保証する helper で担保
- Canvas 失敗 / unsupported / alpha / size-guard / decline は全て passThrough に集約され、元ファイルを非破壊保存
- confirm UI は z-index 20000 / Escape capture / focus trap / cleanup finally で lifecycle 健全
- bundle size 増加 +10.4 KB (+1.76%) は機能範囲に対し妥当
- stale comment 2 件を修正 (D1 / D2)
- remembered preference reset UI は v1 非対象 (contract §4-4 で localStorage 手動削除を許容、N1 として v1.x 余地)

次のアクション: 
- manual (`PKC2_MANUAL.html` / i18n 文字列) への反映は本 audit の scope 外。別タスクで追跡する。
- localStorage reset UI は v1.x 追加検討。
