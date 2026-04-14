# Tier 3-3 再評価（選定のみ、実装禁止）

**Status**: decision doc（Tier 3-3 着手前の再評価）
**Date**: 2026-04-14
**Scope**: Tier 3-1 / 3-2 の完了を受けて、保留されていた 4 群
（B / C-3 / C-4 / E）を **今の実害 + 要求 + 熟度** で再評価し、
Tier 3-3 で取る 1 件を確定する。実装は伴わない。

---

## 1. 短い結論

**Tier 3-3 = C-4（lint baseline 解消）を採用する。**

理由を 1 行で:

> 既存 ESLint 設定が **CLAUDE.md の層規則と逆** になっており、CI で
> 91 件の error が continue-on-error で隠れている。この状態で次の
> 大型テーマ（B / C-3 / E）に進むと、新規コードの lint 違反と
> pre-existing なドリフト 91 件の区別が取れなくなる。

**順序の筋**:

1. まず lint を信頼できる状態にする（C-4）
2. そのあと需要観測 → 要求が強いテーマに進む（B / C-3 / E）

---

## 2. 現在地（Tier 3-1 / 3-2 で満たされたもの）

| 系統 | 状態 |
|-----|-----|
| 機能面 | v0.1.0 本体 + merge import Overlay MVP（Tier 3-1） |
| 配布 | `v*` tag push → GitHub Release 自動作成（Tier 3-2 D） |
| 回帰検知 — サイズ | `bundle.js` / `bundle.css` に raw-byte hard-fail budget（Tier 3-2 C-1） |
| 回帰検知 — 動作 | Playwright smoke 1 本（Tier 3-2 C-2） |
| 回帰検知 — 型 | `tsc --noEmit` が CI で blocking |
| 回帰検知 — ユニット | Vitest 122 files / 3607 tests が CI で blocking |
| 回帰検知 — **層違反** | **❌ 未成立** — lint は CI で continue-on-error のまま |

つまり現状、**「層違反が新規コミットで混入しても CI は止まらない」**
という 1 箇所の穴が残っている。他 5 系統はすべて塞がっている。

### 2.1 定量（2026-04-14 時点）

```
$ npm run lint
✖ 100 problems (91 errors, 9 warnings)

Breakdown:
- no-restricted-imports : 83 errors（全て "adapter/ must not import from features/"）
- no-unused-vars        :  6 errors（tests の `_lid` / `_t` / `_b` / `_a` / `_c` / `_u`）
- no-explicit-any       :  9 warnings（tests の `as any` キャスト）
```

**91 error のうち 83 = 91%** が「adapter/ が features/ から import して
いる」という単一ルートのエラー。これは CLAUDE.md の Architecture
§5-Layer Structure が明示する
「core ← features ← adapter」の **逆向き規則を lint が書いている**
ためで、**コードの方が正しく、config が間違っている**。

---

## 3. 候補 4 群の再評価（7 軸）

### 3.1 B. archetype 拡張

| 軸 | 評価 | 根拠 |
|---|-----|-----|
| ユーザー価値 | Low-Medium | complex / document-set / spreadsheet の要求が外部から来ていない |
| 実害 / 緊急性 | Low | 現行 text + markdown + attachment で代替できており、実害なし |
| 実装コスト | High | 新 presenter × 3 method + body-formats spec 追加 + editor UI + asset wiring |
| 仕様成熟度 | Low | `docs/development/data-model/*-archetype.md` は 80 行 draft、spec 化されていない |
| アーキ整合 | High | archetype 追加は元々 `ArchetypeId` + presenter registry で折り込み済み |
| 将来拡張性 | Medium | user demand 依存。spreadsheet なら価値は高いが attachment で回避可能 |
| **今やるべき度** | **Low** | spec-first で先に canonical 化が必要。要求も未観測 |

### 3.2 C-3. 広範 E2E

| 軸 | 評価 | 根拠 |
|---|-----|-----|
| ユーザー価値 | Low | ユーザーには見えない（開発者体験） |
| 実害 / 緊急性 | **Low** | **smoke baseline が実害を 1 件も拾っていない**。予防は必要だが、現段階では reactive で十分 |
| 実装コスト | Medium | Playwright flaky リスクに対処しながら 5-10 本追加 |
| 仕様成熟度 | N/A | spec 不要 |
| アーキ整合 | High | Tier 3-2 の smoke baseline の上に積むだけ |
| 将来拡張性 | Medium | 将来の大型 refactor 前にはあった方が良い |
| **今やるべき度** | **Low** | smoke が「何か壊れた」信号を一度も出していない段階で広範 E2E を先に組むのは premature |

### 3.3 C-4. lint baseline 解消

| 軸 | 評価 | 根拠 |
|---|-----|-----|
| ユーザー価値 | Low-Medium | 開発者体験寄りだが、**将来の大型 refactor 全てに効く** |
| 実害 / 緊急性 | **Medium** | 91 errors / 9 warnings が CI で沈黙している。continue-on-error は「lint が死んでいる」状態に近い |
| 実装コスト | **Low-Medium** | 91 error のうち 83 は config 書き換え 1 箇所で消える。残り 8 は `varsIgnorePattern` の 1 行追加 + `any` の精査で閉じる。1 セッション想定 |
| 仕様成熟度 | N/A | CLAUDE.md §Architecture が既に正本。config をそれに合わせるだけ |
| アーキ整合 | **High** | むしろ今の config は CLAUDE.md と不整合。直すと整合が回復する |
| 将来拡張性 | **Medium-High** | lint を blocking に戻せれば、B / C-3 / E の PR レビューで「新規違反 vs pre-existing drift」の区別が即時に可能になる |
| **今やるべき度** | **High** | 91% の error が 1 行の config 修正で消える。ここを放置して次の大型に行くのは「掃除しないまま家具を買う」 |

### 3.4 E 系（P2P / multi-window / i18n / multi-cid）

| 軸 | 評価 | 根拠 |
|---|-----|-----|
| ユーザー価値 | High (if impl) | P2P / multi-window は協調作業を開く |
| 実害 / 緊急性 | **Low** | 単独利用 + snapshot 共有 UX で overall 足りている |
| 実装コスト | **Very High** | Revision linear / single-cid の不変式を破壊する refactor |
| 仕様成熟度 | **Low** | `docs/vision/*` は構想段階、canonical spec 化されていない |
| アーキ整合 | **Low** | I-Merge1 / I-AutoGC1 / 5 層構造との tension が大 |
| 将来拡張性 | Very High | v1.x / v2.x の地平 |
| **今やるべき度** | **Very Low** | Tier 3 の粒度に収まらない。v1.x 計画時の別問題 |

---

## 4. 次にやる 1 件 — C-4（lint baseline 解消）

### 4.1 スコープ（実装は Tier 3-3 本番で）

1. `.eslintrc.cjs` の **L46-57** の adapter → features 禁止ルールを
   **撤去**（CLAUDE.md §Architecture の "adapter orchestrates
   features" に整合させる）
2. 置き換え: "**UI層から core への直接 import 禁止**" や "core の
   browser API 禁止" など、CLAUDE.md が本当に禁じているルールを
   明文化（後者は既に L22-42 にある — 前者の layer policy が今は
   事実上緩い）
3. `no-unused-vars` に `varsIgnorePattern: '^_'` を追加
   （現在は `argsIgnorePattern` だけで、test の `const _lid = ...`
   が 6 件 error 化している）
4. `no-explicit-any` の **warning 9 件** を精査して `as unknown`
   への置き換え or eslint-disable コメント（理由付き）で消す
5. `.github/workflows/ci.yml` の lint step の
   `continue-on-error: true` を **削除**（→ blocking 化）

### 4.2 想定範囲

- **production code への touch: 最小**（config 変更がメイン。もし
  CLAUDE.md に違反する実際の import が見つかれば ↓ で別 PR に切る）
- **test code への touch: 小**（`_lid` 等 6 箇所と `any` 9 箇所）
- **CI への touch: 1 行**（lint step の continue-on-error 削除）

### 4.3 成功条件

```
$ npm run lint
✔ 0 problems

$ GitHub Actions の CI
✔ lint step が緑で blocking に戻っている
```

### 4.4 終わったあとに得られるもの

- 「lint が壊れていない」を継続的に保証する 1 ビット
- **Tier 3-3 以降の大型 PR で "新規違反 / pre-existing drift" の
  区別が瞬時に取れる**
- Size budget（Tier 3-2）+ typecheck + test + lint の 4 系統すべて
  blocking になり、CI が本来の意味の "gate" になる

---

## 5. 今やらないものと昇格条件

### 5.1 B. archetype 拡張 — 今やらない

**理由**:
- 要求未観測、spec 未成熟、実装コストが大きい
- 代替（text + markdown / attachment）が機能している

**昇格条件**:
- 外部ユーザーから具体的な archetype 要求が出る
- または draft のうち 1 つが canonical spec 化される（Tier 3-3 で
  「docs-only で spec 化」を先行させる形なら可）

### 5.2 C-3. 広範 E2E — 今やらない

**理由**:
- smoke baseline を入れたばかりで、**それが拾えない regression が
  観測されていない**段階
- 広範 E2E は flaky リスクを持ち込む

**昇格条件**:
- smoke では拾えなかった merge import / bulk ops / export-import の
  regression が 1 件以上実害として報告される
- または大型 refactor（Option C staging, i18n, archetype 拡張
  複数）が着手される前の保険として

### 5.3 E 系（P2P / multi-window / i18n / multi-cid）— 今やらない

**理由**:
- Tier 3 の粒度に収まらない大型テーマ
- 不変式（Revision linear / single-cid）を破壊する refactor が前提
- 要求も実害も現時点で薄い

**昇格条件**:
- v1.x 計画のキックオフ段階で別プロジェクトとして仕切り直し
- i18n は「多言語ユーザーからの要求」が閾値

---

## 6. 次の実装者への申し送り

### 6.1 実装前に必ず確認

1. **`.eslintrc.cjs` L46-57** を読み、adapter → features 禁止ルール
   の **削除** が本当に合法か、CLAUDE.md §Architecture と突き合わせ
   て再確認する（答え: YES、但し自分の目で）
2. **`CLAUDE.md` §Architecture** に記された「core ← features ←
   adapter」方向を正本として採用する
3. `src/adapter/**/*.ts` → `src/features/**/*.ts` の import が **実際
   の実装で 83 箇所 / 多数ファイル** 走っていることを確認（= 現行
   コードは CLAUDE.md 通りで正しい。config が間違っている）
4. `src/features/**/*.ts` → `src/adapter/**/*.ts` の import が **0
   箇所** であることを確認（これは逆方向禁止で、ルールに追加する
   べき実害）

### 6.2 スコープから出すもの（Tier 3-3 でやらない）

- `any` 警告の根治: `any` を型付きに直すには reducer / 各 presenter
  への踏み込みが必要な箇所があり、lint 整流と混ざると PR が太る。
  **warning 9 件は "warning のままで残す" か "eslint-disable コメント
  で理由を明記して消す"** のどちらかに割り切る
- ESLint v9 flat config 移行: 大きな別問題。今回は `.eslintrc.cjs`
  のまま
- `@typescript-eslint/recommended` の strict 版への昇格: 新 error が
  増えて Tier 3-3 のスコープが膨張する

### 6.3 docs の先行更新

実装 PR の先頭 commit で **docs-only** として:

- `docs/planning/HANDOVER_FINAL.md §4.1` (Core 層の純粋性) の直下に
  "**layer policy の eslint enforcement は `.eslintrc.cjs` が
  担う**" の 1 行を追記
- 新規 `docs/development/lint-baseline-recovery.md` を作成して
  「なぜこの config 書き換えが安全か」を §1-3 でまとめる

### 6.4 作業順序（提案）

1. docs を先に（§6.3）
2. `.eslintrc.cjs` を CLAUDE.md 整合に書き換え
3. `npm run lint` で残 error が想定通りか確認
4. `varsIgnorePattern: '^_'` を追加 → test の 6 error が消える
5. `any` 警告 9 件を精査、`eslint-disable` で理由付きに置き換え
6. `ci.yml` の lint step から `continue-on-error: true` を削除
7. `npm run typecheck` / `npm test` / `npm run test:smoke` /
   `npm run size-budget` が全て緑のまま
8. HANDOVER_FINAL.md §18 に「18.10 Tier 3-3 完了」を追記

---

## 7. 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-14 | 初版。Tier 3-3 = C-4（lint baseline 解消）を採用 |
