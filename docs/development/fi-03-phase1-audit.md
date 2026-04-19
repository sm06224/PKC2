# FI-03 TEXTLOG Image Perf — Phase 1 Post-Implementation Audit

Status: COMPLETE 2026-04-19
Audited commit: `06653e8` (Phase 1 push)
Contract: `docs/spec/textlog-image-perf-v1-behavior-contract.md` rev.1

---

## 1. 読んだファイル

| ファイル | 用途 |
|---------|------|
| `docs/spec/textlog-image-perf-v1-behavior-contract.md` | contract rev.1（§0-12 全章） |
| `src/adapter/ui/textlog-hydrator.ts` | Phase 1 新規モジュール（191 行） |
| `src/adapter/ui/textlog-presenter.ts` | `renderBody` staged 化 / `renderLogArticle` 参照 |
| `src/styles/base.css` | `.pkc-textlog-text-pending` 2 ルール |
| `tests/adapter/textlog-staged-render.test.ts` | Phase 1 テスト（19 件） |

## 2. 監査観点

| # | 観点 | 判定 |
|---|------|------|
| A1 | contract rev.1 との整合 | **PASS with note** |
| A2 | staged render / hydrate trigger / fallback の妥当性 | **PASS** |
| A3 | placeholder DOM shape と hydrate 後 DOM 同値性 | **PASS with note** |
| A4 | observer lifecycle / teardown の妥当性 | **PASS** |
| A5 | no-image / short log regression | **PASS** |
| A6 | size increase の妥当性 | **PASS** |
| A7 | architecture hygiene | **PASS** |
| A8 | Phase 1 scope 逸脱の有無 | **PASS** |

## 3. 監査結果サマリ

Phase 1 実装は contract rev.1 §2-5 / §9 の要件を忠実に再現しており、defect は検出されなかった。

- I-TIP1〜I-TIP9, I-TIP11〜I-TIP13: 全て準拠
- I-TIP10 (print/export bypass): Phase 2 にスコープされており、Phase 1 では未実装。contract §7 に記載された `beforeprint` hook / `forceHydrateAll` は Phase 2 deliverable として明示的に先送り
- テスト 19 件が staged render / fallback / DOM identity / hydrate failure isolation を網羅
- 既存テスト全 pass（4534 件）、regression なし

## 4. 発見した問題

### Concrete defect

なし。

### Observation（修正不要だが Phase 2 で考慮すべき点）

| # | 観点 | 詳細 | 影響度 |
|---|------|------|--------|
| O1 | I-TIP10 未実装 | `beforeprint` hook が Phase 1 に含まれていないため、print 時に placeholder が残る | **Phase 2 で解消予定** |
| O2 | selection mode checkbox の非対称 | placeholder header に selection checkbox が含まれない（contract §5-1「flag/timestamp/anchor」準拠であり contract 違反ではない）。selection mode 中に scroll 先の placeholder が checkbox なしで表示される | **軽微 — hydrate 後に checkbox 出現、UX 影響小** |
| O3 | T-TIP04 / T-TIP06 テスト未追加 | lookahead 動作（`requestIdleCallback` stub）と observer disconnect on re-render のテストが testability matrix にあるが Phase 1 テストに含まれていない | **Phase 2 で追加可** |

## 5. 作成/変更ファイル一覧

Phase 1 実装（commit `06653e8`）で変更されたファイル:

| ファイル | 変更種別 |
|---------|---------|
| `src/adapter/ui/textlog-hydrator.ts` | 新規（191 行） |
| `src/adapter/ui/textlog-presenter.ts` | 修正（import 追加 + `renderBody` staged 化 + module-level hydrator singleton） |
| `src/styles/base.css` | 修正（+14 行: `.pkc-textlog-text-pending` 2 ルール） |
| `tests/adapter/textlog-staged-render.test.ts` | 新規（313 行, 19 テスト） |
| `dist/bundle.js`, `dist/pkc2.html` | ビルド成果物 |

本 audit で作成したファイル:

| ファイル | 変更種別 |
|---------|---------|
| `docs/development/fi-03-phase1-audit.md` | 新規（本文書） |

## 6. contract / 実装との整合点

### D-TIP 判断の実装反映

| D-TIP | 内容 | 実装箇所 | 判定 |
|-------|------|---------|------|
| D-TIP1 | 初期 render 単位 = log article | `presenter.ts:166` `hydratedCount < INITIAL_RENDER_ARTICLE_COUNT` per log | PASS |
| D-TIP2 | 固定定数 `INITIAL_RENDER_ARTICLE_COUNT = 8` | `hydrator.ts:4` export const | PASS |
| D-TIP3 | IO 主体、`loading="lazy"` 不採用 | `hydrator.ts:134` `new IntersectionObserver(...)` | PASS |
| D-TIP4 | 固定高 placeholder（min-height 160px） | `hydrator.ts:76` + `base.css:4425` | PASS |
| D-TIP5 | 原文は `HydratorContext.log` 経由で保持 | `hydrator.ts:10-18` interface | PASS |
| D-TIP6 | edit→read でも staged 維持 | `renderBody` 再呼出し = 同一経路で staged | PASS（Phase 2 で追加最適化予定） |
| D-TIP7 | Playwright 自動ベンチ | Phase 1 scope 外、Phase 2 以降 | N/A |

### I-TIP 不変条件の検証

| I-TIP | 内容 | 検証方法 | 判定 |
|-------|------|---------|------|
| I-TIP1 | 画像消失禁止 | forceHydrateAll 後全 article 実体化確認（test） | PASS |
| I-TIP2 | 保存データ不変 | hydrator は read-only path のみ。write path に diff なし | PASS |
| I-TIP3 | `resolveAssetReferences` 出力同値 | 関数シグネチャ・実装変更なし。呼出しタイミングのみ staged | PASS |
| I-TIP4 | export 経路不変 | export は `container` から再構築、DOM 非依存 | PASS |
| I-TIP5 | 画像存在を見失わせない | placeholder header に timestamp / flag / anchor 描画（test T-TIP05） | PASS |
| I-TIP6 | 他 archetype 不変 | textlog-presenter のみ変更。他 presenter に diff なし | PASS |
| I-TIP7 | paste pipeline 不変 | `action-binder.ts` の paste/drop/attach 経路に diff なし | PASS |
| I-TIP8 | 既存テスト全通過 | 4534/4534 pass | PASS |
| I-TIP9 | hydrate 後 DOM 同値 | `renderLogArticle` をそのまま hydrate に再利用。id / data-pkc-* 一致確認（test） | PASS |
| I-TIP10 | print/export 全展開 | **Phase 2 未実装**（`beforeprint` hook なし） | **Phase 2** |
| I-TIP11 | 定数 v1 default | `INITIAL_RENDER_ARTICLE_COUNT = 8`, `LOOKAHEAD_ARTICLE_COUNT = 4` を定数 export | PASS |
| I-TIP12 | observer lifecycle | `cleanupActiveHydrator()` → `activeHydrator.disconnect()` on re-render | PASS |
| I-TIP13 | placeholder id 同一性 | `renderLogArticlePlaceholder` が同一 id / data-pkc-log-id / data-pkc-lid を設定（test） | PASS |

### contract §9 エラー / フォールバック

| §9 項目 | 実装 | 判定 |
|---------|------|------|
| §9-1 IO 非対応 | `typeof IntersectionObserver === 'undefined'` → `doForceHydrateAll()` 即時全展開 | PASS |
| §9-2 rIC 非対応 | `requestIdleCallback ?? requestAnimationFrame` フォールバック | PASS |
| §9-3 hydrate 例外 | `try/catch` + `console.warn` + placeholder 残存 | PASS |
| §9-4 空 TEXTLOG | `doc.sections.length === 0` → empty state（staged 化なし） | PASS |
| §9-5 log 数 ≤ k | 全 article 即時 hydrate、placeholder 0 件 | PASS |

## 7. 品質チェック結果

| チェック | 結果 |
|---------|------|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 4534/4534 PASS |
| `npm run build` | PASS |
| bundle size | 603.28 KB（Phase 1 commit 時点、+3.08 KB） |
| CSS size | 81.61 KB（+0.24 KB） |
| HTML size | 655.5 KB（+3.3 KB） |

Size increase はモジュール 1 件（191 行）+ CSS 2 ルール（14 行）に対して妥当。

### テストカバレッジ

Phase 1 テスト 19 件のカバレッジ:

| contract T-TIP | テスト有無 | 備考 |
|----------------|----------|------|
| T-TIP01 (画像消失禁止) | ✅ | forceHydrateAll 後の全 article 確認 |
| T-TIP02 (scroll 入場 hydrate) | ✅ | IO stub + isIntersecting=true |
| T-TIP03 (初期 render 上限) | ✅ | 20 件 → hydrated=8 件確認 |
| T-TIP04 (先読み hydrate) | ❌ | rIC stub テスト未実装 |
| T-TIP05 (placeholder header) | ✅ | timestamp / flag / anchor 存在確認 |
| T-TIP06 (IO teardown) | ❌ | disconnect on re-render テスト未実装 |
| T-TIP07 (他 archetype 非影響) | ✅ | 既存 presenter test 全 pass で担保 |
| T-TIP08 (paste 不変) | ✅ | `git diff` で action-binder.ts のpaste 経路に変更なし |
| T-TIP09 (DOM 同値) | ✅ | hydrate 前後の id / data-pkc-* 一致 |
| T-TIP10 (print bypass) | ❌ | Phase 2 |
| T-TIP11 (IO fallback) | ✅ | IO undefined → 全 hydrate |
| T-TIP12 (hydrate 例外隔離) | ✅ | forceHydrateAll + console.warn spy |
| T-TIP13 (placeholder id 同一) | ✅ | hydrate 前後の 3 attribute 一致 |
| T-TIP14 (edit→read staged) | ❌ | Phase 2 |
| T-TIP15 (baseline 計測) | ❌ | Playwright e2e、Phase 2 以降 |

Phase 1 で実装されたコードパスのうち、T-TIP04（lookahead）と T-TIP06（teardown）のみ unit test が不足。いずれも code path は存在し動作するが、stub ベースの明示的検証が無い。Phase 2 でテスト追加を推奨。

## 8. コミット有無

- Concrete defect: なし → production 変更なし
- 本 audit 文書（`docs/development/fi-03-phase1-audit.md`）のみ commit
- Phase 2 で対応すべき既知ギャップ:
  - I-TIP10: `beforeprint` / `matchMedia('print')` による forceHydrateAll
  - T-TIP04: lookahead テスト
  - T-TIP06: observer disconnect テスト
  - O2: selection mode checkbox の placeholder 側描画（任意）
