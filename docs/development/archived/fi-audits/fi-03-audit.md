# FI-03 TEXTLOG Image Perf v1 — Full Audit

Status: COMPLETE 2026-04-19
Audited commits: `06653e8` (Phase 1) → `0f279dd` (Phase 2)
Contract: `docs/spec/textlog-image-perf-v1-behavior-contract.md` rev.1
Predecessor: `docs/development/fi-03-phase1-audit.md`

---

## 1. 読んだファイル

| ファイル | 用途 |
|---------|------|
| `docs/spec/textlog-image-perf-v1-behavior-contract.md` | contract rev.1（§0-12 全章） |
| `docs/development/fi-03-phase1-audit.md` | Phase 1 audit（observation O1-O3 の回収確認） |
| `src/adapter/ui/textlog-hydrator.ts` | 新規モジュール最終版（222 行） |
| `src/adapter/ui/textlog-presenter.ts` | `renderBody` staged 化 + hydrator singleton |
| `src/adapter/ui/textlog-selection.ts` | selection forward cache（hydrator import 先） |
| `src/styles/base.css` | `.pkc-textlog-text-pending` 2 ルール |
| `tests/adapter/textlog-staged-render.test.ts` | Phase 1 テスト（19 件） |
| `tests/adapter/textlog-staged-render-phase2.test.ts` | Phase 2 テスト（8 件） |

## 2. 監査観点

| # | 観点 | 判定 |
|---|------|------|
| A1 | contract 全体との整合 | **PASS** |
| A2 | Phase 1 / Phase 2 の接続整合 | **PASS** |
| A3 | staged render / hydrate / fallback / beforeprint の妥当性 | **PASS** |
| A4 | placeholder DOM shape / DOM 同値性 | **PASS** |
| A5 | observer lifecycle / beforeprint lifecycle | **PASS** |
| A6 | no-image / short log / selection mode regression | **PASS** |
| A7 | size increase の妥当性 | **PASS** |
| A8 | architecture hygiene | **PASS** |
| A9 | scope 逸脱の有無 | **PASS** |

## 3. 監査結果サマリ

FI-03 v1 の全 deliverables（Phase 1 + Phase 2）は contract rev.1 §0-12 の要件を満たしている。

- **I-TIP1〜I-TIP13**: 全 13 件 PASS（Phase 1 audit で I-TIP10 が未実装だったが Phase 2 で解消）
- **D-TIP1〜D-TIP7**: 全 7 件の判断が実装に反映。D-TIP7（Playwright ベンチ）は v1 scope 外で未実施
- **Phase 1 audit observation O1-O3**: Phase 2 で全 3 件回収済み
  - O1 (I-TIP10): `beforeprint` → `forceHydrateAll` 実装
  - O2 (selection checkbox): placeholder に checkbox 追加
  - O3 (T-TIP04/T-TIP06): テスト追加
- **テスト**: Phase 1 の 19 件 + Phase 2 の 8 件 = 27 件が staged render の全 code path をカバー
- **Concrete defect**: なし
- **サイズ増**: bundle.js +3,815 bytes（FI-03 のみ）、CSS +240 bytes。新規モジュール 222 行に対して妥当

## 4. 発見した問題

### Concrete defect

なし。

### 残存 observation（v1.x 以降の参考情報）

| # | 観点 | 詳細 | 対応 |
|---|------|------|------|
| R1 | T-TIP15 (Playwright ベンチ) | baseline 計測は contract §11 で定義されているが v1 scope 外。定量的改善度は未測定 | v1.x 以降で必要に応じて計測 |
| R2 | placeholder 固定高 160px | 文字のみ article と画像 article で高さ差が大きく、scroll 位置にジャンプが生じうる | contract §12-2 に per-log 高さ推定を v1.x 候補として記載済み |
| R3 | IO non-support 経路の beforeprint | IO 非対応環境では全件即時 hydrate されるため beforeprint listener 自体が不要（現在は listener を付けない設計で正しい） | 設計意図として記録のみ |

## 5. 作成/変更ファイル一覧

### Phase 1（commit `06653e8`）

| ファイル | 変更種別 |
|---------|---------|
| `src/adapter/ui/textlog-hydrator.ts` | 新規（191 行） |
| `src/adapter/ui/textlog-presenter.ts` | 修正（import + `renderBody` staged 化 + singleton） |
| `src/styles/base.css` | 修正（+14 行: placeholder CSS 2 ルール） |
| `tests/adapter/textlog-staged-render.test.ts` | 新規（313 行, 19 テスト） |

### Phase 2（commit `0f279dd`）

| ファイル | 変更種別 |
|---------|---------|
| `src/adapter/ui/textlog-hydrator.ts` | 修正（+31 行: beforeprint + selection checkbox + isLogSelected import） |
| `src/adapter/ui/textlog-presenter.ts` | 修正（placeholder 呼出しに `selecting` 引数追加） |
| `tests/adapter/textlog-staged-render-phase2.test.ts` | 新規（267 行, 8 テスト） |

### Audit docs

| ファイル | 変更種別 |
|---------|---------|
| `docs/development/fi-03-phase1-audit.md` | 新規（commit `cab7063`） |
| `docs/development/fi-03-audit.md` | 新規（本文書） |

## 6. contract / 実装との整合点

### A1. D-TIP 判断の実装反映（最終）

| D-TIP | 内容 | 実装箇所 | 判定 |
|-------|------|---------|------|
| D-TIP1 | render 単位 = log article | `presenter.ts:166` per-log hydration loop | PASS |
| D-TIP2 | `INITIAL_RENDER_ARTICLE_COUNT = 8` | `hydrator.ts:5` export const | PASS |
| D-TIP3 | IO 主体、`loading="lazy"` 不採用 | `hydrator.ts:158` new IntersectionObserver | PASS |
| D-TIP4 | 固定高 160px | `hydrator.ts:96` + `base.css` | PASS |
| D-TIP5 | 原文保持 via HydratorContext | `hydrator.ts:11-19` | PASS |
| D-TIP6 | edit→read staged 維持 | `renderBody` 再呼出しで同一 staged path（T-TIP14 で検証） | PASS |
| D-TIP7 | Playwright ベンチ | v1 scope 外（R1） | N/A |

### A1. I-TIP 不変条件（最終）

| I-TIP | 内容 | 検証 | 判定 |
|-------|------|------|------|
| I-TIP1 | 画像消失禁止 | forceHydrateAll 後全実体化（T-TIP01 相当テスト） | PASS |
| I-TIP2 | 保存データ不変 | hydrator は read-only。write path に diff なし | PASS |
| I-TIP3 | resolveAssetReferences 出力同値 | シグネチャ不変。呼出しタイミングのみ staged | PASS |
| I-TIP4 | export 経路不変 | export は container から再構築（DOM 非依存） | PASS |
| I-TIP5 | 画像存在可視 | placeholder header に timestamp / flag / anchor / checkbox（T-TIP05） | PASS |
| I-TIP6 | 他 archetype 不変 | textlog-presenter のみ変更 | PASS |
| I-TIP7 | paste pipeline 不変 | action-binder の paste/drop/attach に diff なし | PASS |
| I-TIP8 | 既存テスト全通過 | 4542/4542 PASS | PASS |
| I-TIP9 | hydrate 後 DOM 同値 | renderLogArticle 再利用 + id / data-pkc-* 一致（T-TIP09/T-TIP13） | PASS |
| I-TIP10 | print/export 全展開 | beforeprint → forceHydrateAll（T-TIP10）。disconnect 時に removeEventListener | **PASS** |
| I-TIP11 | 定数 v1 default | INITIAL_RENDER_ARTICLE_COUNT=8, LOOKAHEAD_ARTICLE_COUNT=4 | PASS |
| I-TIP12 | observer lifecycle | cleanupActiveHydrator → disconnect on re-render（T-TIP06） | PASS |
| I-TIP13 | placeholder id 同一性 | id / data-pkc-log-id / data-pkc-lid が実体と同値（T-TIP13） | PASS |

### A2. Phase 1 audit observation 回収

| Observation | 状態 | Phase 2 での対応 |
|-------------|------|-----------------|
| O1: I-TIP10 未実装 | **解消** | `hydrator.ts:138-140,209-211` beforeprint handler |
| O2: selection checkbox 非対称 | **解消** | `hydrator.ts:46-66` selecting 引数 + checkbox 描画 |
| O3: T-TIP04/T-TIP06 テスト | **解消** | Phase 2 テストファイルに追加 |

### A3. contract §9 フォールバック（最終）

| §9 | 実装 | 判定 |
|----|------|------|
| §9-1 IO 非対応 → 全 hydrate | `hydrator.ts:153-156` | PASS |
| §9-2 rIC 非対応 → rAF | `hydrator.ts:200-204` | PASS |
| §9-3 hydrate 例外 → warn + 残存 | `hydrator.ts:107,115-117` | PASS |
| §9-4 空 TEXTLOG | `presenter.ts:125-139` empty state | PASS |
| §9-5 log ≤ k | 全即時 hydrate、placeholder 0 | PASS |

### A5. beforeprint lifecycle 検証

- `attachHydrator` 内で `window.addEventListener('beforeprint', handler)` を設定（L209-211）
- `disconnect()` 内で `window.removeEventListener('beforeprint', handler)` を解除（L216-218）
- `cleanupActiveHydrator()` → `disconnect()` が renderBody の先頭で呼ばれるため、古い handler は確実に解除
- IO 非対応経路では全件即時 hydrate 後のため listener を付与しない（正しい設計）
- `placeholders.length === 0` 時も listener なし（attach 不要、L134-136）

## 7. 品質チェック結果

| チェック | 結果 |
|---------|------|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 4542/4542 PASS |
| `npm run build` | PASS |

### サイズ増分析

| 成果物 | pre-FI-03 baseline | 最終 | FI-03 増分 | 比率 |
|--------|-------------------|------|-----------|------|
| bundle.js | 600,202 bytes | 604,550 bytes | **+3,815 bytes** | +0.64% |
| bundle.css | 81,373 bytes | 81,613 bytes | **+240 bytes** | +0.29% |
| pkc2.html | 684,889 bytes | 689,477 bytes | **+4,055 bytes** | +0.59% |

（注: bundle.js の差分 4,348 bytes のうち 533 bytes は同時期の filename-fix（`35b5a9a`）由来。FI-03 固有は 3,815 bytes）

#### サイズ増の内訳

- `textlog-hydrator.ts`（222 行）: IntersectionObserver 管理 + placeholder 生成 + beforeprint — **主要コスト**
- `textlog-presenter.ts` 修正: import + `renderBody` の staged 分岐 + singleton — 差分は小
- `base.css` 2 ルール: placeholder のストライプ背景 + ⏳ pseudoclass — 240 bytes

#### 価値対コスト評価

- 3,815 bytes で「50 枚画像 TEXTLOG の初期 render を先頭 8 件に限定」を達成
- main thread の初期負荷を `O(N)` → `O(k)` に削減（k=8 固定）
- 後段は IO + rIC で漸進的に hydrate
- single-HTML 制約下で追加の外部依存なし
- **結論**: 機能に対してサイズ増は妥当

### テストカバレッジ（最終）

| contract T-TIP | Phase | テスト | 検証方法 |
|----------------|-------|-------|---------|
| T-TIP01 | 1 | ✅ | forceHydrateAll 後全 article 確認 |
| T-TIP02 | 1 | ✅ | IO stub + isIntersecting=true |
| T-TIP03 | 1 | ✅ | 20 件 → hydrated=8 確認 |
| T-TIP04 | 2 | ✅ | rIC/rAF stub で callback drain |
| T-TIP05 | 1 | ✅ | placeholder header 要素存在確認 |
| T-TIP06 | 2 | ✅ | re-render で disconnect call count |
| T-TIP07 | 1 | ✅ | 既存 presenter test 全 pass |
| T-TIP08 | 1 | ✅ | action-binder.ts paste 経路 diff なし |
| T-TIP09 | 1 | ✅ | hydrate 前後の id / data-pkc-* 一致 |
| T-TIP10 | 2 | ✅ | beforeprint event → pending=0 |
| T-TIP11 | 1 | ✅ | IO undefined → 全 hydrate |
| T-TIP12 | 1 | ✅ | hydrate exception → warn + 残存 |
| T-TIP13 | 1 | ✅ | placeholder 3 attribute 一致 |
| T-TIP14 | 2 | ✅ | edit→read で hydrated=8 / pending=12 |
| T-TIP15 | — | ❌ | Playwright e2e（v1 scope 外） |

15 件中 14 件カバー。T-TIP15 は Playwright 依存のため v1.x 以降で実施

## 8. コミット有無

- Concrete defect: なし → production 変更なし
- 本 audit 文書（`docs/development/fi-03-audit.md`）のみ commit
- v1.x 以降の残存 observation:
  - R1: Playwright baseline 計測（T-TIP15）
  - R2: per-log 高さ推定による scroll ジャンプ抑制
  - R3: IO non-support 経路の beforeprint 非付与は正しい設計（記録のみ）
