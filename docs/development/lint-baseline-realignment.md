# Lint Baseline Realignment — Tier 3-3

**Status**: COMPLETED — Tier 3-3（2026-04-14）
**Scope**: CI 唯一の非 blocking gate だった ESLint を blocking に戻す。
本ドキュメントは **なぜ `.eslintrc.cjs` をこう書き換えたか** を未来の
自分に残すための短い記録。実装細目は `.eslintrc.cjs` 自体を読めば
足りる。

## 1. 何が問題だったか

Tier 1-1 で導入された `ci.yml` の lint step は `continue-on-error:
true` で **情報扱い** に置かれていた。その根拠は HANDOVER_FINAL.md
§6.8 に明記された:

> `src/adapter/ui/*.ts` で `no-restricted-imports` ルールが 80 件エラー
> 規則は「adapter が features を import してはならない」という文字通り
> 読みだが、実装上は合法（CLAUDE.md の層規則では `adapter → features`
> が正しい）。既存の lint 設定の方が厳しすぎる状態。

つまり **コードは CLAUDE.md 通りで正しく、config が逆向きに書かれ
ていた**。Tier 3-2 完了時点で実測 100 問題 / 91 errors / 9 warnings。
内訳:

- 83 × `no-restricted-imports` — すべて "adapter/ must not import
  from features/" — **config drift**
- 6 × `no-unused-vars` — tests の `const _lid = ...` 等、`_` prefix の
  unused local variable
- 9 × `no-explicit-any` warning — tests の `as any` キャスト
  （mock setup 用）

## 2. なぜ今このタイミングで直すのか

`docs/planning/TIER3_3_REEVALUATION.md` §1 の結論をそのまま再掲:

> 現在の CI で唯一 blocking になっていない品質ゲートが lint。
> しかも大半が コードの欠陥ではなく config drift。ここを直さずに
> 次の大型テーマへ進むと、以後の差分レビューがずっと濁る。

Tier 3-1 / 3-2 で他 5 系統（typecheck / vitest / size-budget / smoke
/ release）はすべて blocking 化されており、lint だけが残っていた。

## 3. 採用した設計

### 3.1 `.eslintrc.cjs` の変更（2 点）

1. **adapter → features 禁止ルールの撤去**
   - 旧: `src/adapter/**/*.ts` で features への import を禁止
   - 新: 撤去。CLAUDE.md §Architecture の "adapter orchestrates
     everything" と整合

2. **features → adapter 禁止ルールの追加**
   - 旧: 未設定（= 潜在 drift 余地）
   - 新: `src/features/**/*.ts` は adapter / runtime / browser global
     を禁止。CLAUDE.md "features imports from core only" を明文化
   - これは **本来守られている契約を lint で pin する** 変更で、
     実害のある既存コードは 0 件（確認済み）

### 3.2 `no-unused-vars` の整流

- 追加: `varsIgnorePattern: '^_'`
- 既存の `argsIgnorePattern: '^_'` と対称になる
- 影響: tests/core/container-ops.test.ts の 6 件 error が消える
- 意味: "`_` 接頭辞は意図的に使われない" という慣習を lint が尊重

### 3.3 `no-explicit-any` warning の扱い

- **根治しない**（`any` 自体の削減は Tier 3-3 のスコープ外）
- **止血のみ**: 各出現箇所に `// eslint-disable-next-line
  @typescript-eslint/no-explicit-any` と理由コメントを添える
- 影響箇所: 3 ファイル / 9 警告
  - `tests/adapter/action-binder-multi-select.test.ts` × 7
    （`evt.dataTransfer as any` — DataTransfer の mock 経路）
  - `tests/adapter/action-binder-range-highlight.test.ts` × 1
  - `tests/adapter/action-binder-sandbox-tasks.test.ts` × 1
- 理由コメントは「DataTransfer の mock」「DOM event ペイロードの
  テストスパイ」等、文脈が分かる 1 行

### 3.4 `ci.yml` の lint を blocking へ

- `continue-on-error: true` を削除
- Tier 1-1 のコメントも合わせて **"Tier 3-3 で解消済み"** を反映

## 4. 採用しなかった案

| 案 | 却下理由 |
|-----|---------|
| `any` を本格根治（型付け直し） | 型設計変更はスコープ超過。test の mock 経路に限定された warning なので止血で十分 |
| test 全域で `no-explicit-any` を off | 信号を消してしまう。`eslint-disable-next-line` は個別箇所の判断を残せる |
| ESLint v9 flat config に移行 | 別問題（version bump）。`.eslintrc.cjs` のまま |
| `@typescript-eslint/recommended` の strict 版 | 新規 error が増えて PR が膨張 |
| Prettier 導入 | 無関係。Tier 3-3 の責務外 |

## 5. 検証

- `npm run lint` が **0 problems** になる
- `npm run typecheck` / `npm test` / `npm run test:smoke` /
  `npm run size-budget` / `build:bundle` / `build:release` /
  `build:manual` すべて緑
- `.github/workflows/ci.yml` の lint step が blocking で緑

## 6. この変更で得られるもの

- lint が本来の「品質ゲート」として CI に立つ
- 次のテーマ（archetype 拡張 / 広範 E2E / 長期ビジョン）に進むとき、
  「新規の層違反」と「pre-existing drift」を区別する議論が不要になる
- HANDOVER_FINAL.md §6.8 の "pre-existing lint errors" 記述は
  **歴史的事実** に格下げ

## 7. 既知の制約

- **`any` 警告は消えていない**（eslint-disable で抑制しただけ）。
  根治は将来の type-design tier の仕事
- test fixtures で使える `as unknown as T` への置換は 9 箇所すべてで
  試したわけではない（mock 型が複雑すぎる箇所は disable に倒した）
- ESLint v8 のまま据え置き。v9 migration は別 tier

## 8. 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-14 | 初版（Tier 3-3 実装と同時） |
