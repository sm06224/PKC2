# Test strategy audit (案 2 + 案 3)— 2026-05-03

**Status**: LIVE(audit complete、adoption は follow-up PR で別途 user 判断)
**Scope**: reform-2026-05 wave クローズ後の test-strategy 復帰 wave。**案 2 = Coverage gate**(自動 minimum 強制)と **案 3 = Bug-driven regression rule**(過去 bug fix からの抽象化)を 1 audit doc に統合。adoption は本書の結論を受けて user 判断 → 別 PR で着地。

---

## 1. 案 2 — Coverage gate audit

### 1.1 現状ベースライン(2026-05-03 計測)

`@vitest/coverage-v8` で `npx vitest run --coverage --coverage.provider=v8 --coverage.include='src/**/*.ts' --coverage.exclude='src/**/*.test.ts'` を実行(devDependency 未追加、ローカル一時 install で計測)。

| 軸 | All files | src/core/model | src/adapter/state | src/adapter/ui | src/features/* | src/runtime |
|---|---|---|---|---|---|---|
| Statements | **84.95%** | 95.74% | 96.24% | 84.54% | 90-100% | 70.88% |
| Branches | **84.90%** | 83.33% | 83.31% | 81.35% | 86-100% | 81.34% |
| Functions | **89.72%** | 95.83% | 100% | 86.75% | 100% | 69.38% |
| Lines | **84.95%** | 95.74% | 96.24% | 84.54% | 90-100% | 70.88% |

**観察**:
- core / features / state は **>90%**(strict slice 規律 + 単体 test 厚く着地)
- adapter/ui は **84.5%**(renderer / action-binder の DOM-heavy 分岐の網羅率)
- runtime は **70.88%**(`debug-flags.ts` / `profile.ts` / `meta-reader.ts` の environment-conditional fallback path が unreached)

### 1.2 適用方針(推奨)

**Adoption: YES**(別 PR で実施)。理由:
1. 現 baseline 84.95% は十分高い、retreat に対する gate として機能する
2. 数値 baseline を locked-in しないと「気づかぬうちに低下」リスク(Phase 1B で発見した CSS specificity bug 系の static check と相補)
3. v8 provider は Node 標準内蔵で external runtime コスト minimal

**Target**:
| Threshold | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Minimum (block PR) | **80%** | **78%** | **85%** | **80%** |
| Target (warn) | 85% | 84% | 90% | 85% |

**Minimum を 80% に設定する根拠**:
- Baseline 84.95% から 5pp の buffer(自然な churn 吸収)
- runtime layer 70% を考慮するとファイル単位 minimum は別途緩い基準
- 過剰に高い floor は「coverage 稼ぎの低価値 test」を誘発する反面教師(Goodhart's law)

**Per-file 個別緩和**(coverage.thresholds の per-file override):
- `src/runtime/profile.ts` / `meta-reader.ts`: 50%(environment-conditional fallback、稼動 path 限定)
- `src/runtime/index.ts`: 0%(boot-only、test runtime からは到達不可)

### 1.3 着地 PR の予定 scope

```ts
// vitest.config.ts に追加
coverage: {
  provider: 'v8',
  include: ['src/**/*.ts'],
  exclude: ['src/**/*.test.ts', 'src/main.ts'],
  thresholds: {
    statements: 80,
    branches: 78,
    functions: 85,
    lines: 80,
  },
  reporter: ['text-summary', 'json-summary'],
}
```

`.github/workflows/ci.yml` に新 step:
```yaml
- name: Test with coverage
  env:
    NODE_OPTIONS: --max-old-space-size=4096
  run: npm run test:coverage
```

`package.json` devDependency 追加: `@vitest/coverage-v8: ^3.0.0`(~10 MB)。CI 実行時間影響は instrumented build + report generate で **+30〜60 秒**(現 test step 130 秒 → 160-190 秒)。

**Per-file mode について**: 当初は `perFile: true` + 個別 override を予定していたが、adoption PR(2026-05-03 着地)で実測したところ:
- barrel `index.ts`(`src/core/index.ts` / `src/adapter/index.ts` / `src/runtime/index.ts`)は test が直接 path import するため 0%、enforcement 対象外
- `src/runtime/profile.ts` / `meta-reader.ts` 等の environment-conditional fallback も unit test では到達不可
- `src/adapter/ui/` の一部 modal / hydrator は branch coverage が局所的に閾値割れ

これらを exemption list で個別緩和すると brittle(branch / hydrator は将来 test 拡張で改善見込み)。**adoption PR では per-file を OFF とし、repo-wide minimum のみ強制**。per-file 厳格化は別 wave(test 拡張で local coverage が押し上がった時点で再評価)。

### 1.4 既知の制約

- **Visual / parity test は coverage に乗らない**: Playwright smoke は coverage instrumentation 対象外(別 process)。reform-2026-05 で導入した parity test 群(`tests/smoke/*-parity.spec.ts`)は依然として独自 gate として機能、coverage gate は **vitest 単体 test 範囲のみ**。
- **DOM 分岐は branch coverage の捉え漏れ多発**: happy-dom 環境の renderer test では `pointer:coarse` などの media query 分岐が untouched、これは parity test で別途 cover。coverage 数値は単体テスト網羅性の **下限保証** であり、UX 確実性の保証ではない(reform-2026-05 doctrine と整合)。
- **Coverage 偽装リスク**: 「test を書いて assertion 0」「実行はするが結果検証なし」など、coverage 数値だけ稼ぐ低価値 test が混入し得る。これは案 3 の regression rule で別軸の検査と組合せて防ぐ。

---

## 2. 案 3 — Bug-driven regression rule audit

### 2.1 サンプリング

`git log --oneline --no-merges main | grep -iE "fix\("` で直近 30 fix commit を抽出。reform-2026-05 直前の wave(2026-04-25 以降)を中心に、root cause / prevention 観点で 7 カテゴリに分類。

### 2.2 抽出 7 ルール

#### Rule R1 — CSS specificity override
**Anchor**: `5fc3274 fix(css): iphone-zoom-suppress belt-and-suspenders rule needs !important`
**根本原因**: `.pkc-editor-body { font-size: 0.8rem }` が後の `textarea { font-size: 16px }` を override、iPhone 16px floor が effectively 12.8px に。
**Prevention rule**:
- 環境分岐(`@media (pointer: coarse)`、dark theme、RTL)で base style を **強化** する CSS 追加時、該当 selector に対するより詳細な既存 override を grep
- environment-critical な値(touch target 44px / iOS zoom suppress 16px / WCAG contrast)は `!important` 許容、コメントで根拠を残す
- parity test で computed style を実測 assertion(`getComputedStyle(el).fontSize >= 16px`)

#### Rule R2 — visualViewport vs window viewport
**Anchor**: `0809087 fix(snippet-trigger): visualViewport offset → ADD instead of subtract`(PR #201 v6 — 4 PR で同 path を 6 回修正)
**根本原因**: iOS Safari で soft keyboard 表示時に visualViewport ≠ window. 通常 viewport coord で popover を配置すると keyboard 下に潜る。
**Prevention rule**:
- mobile UI で position:fixed の `top` / `bottom` を計算する際、`window.visualViewport?.offsetTop` を参照して相対補正
- iPhone shell(pointer:coarse + max-width:640px)を触る PR は `tests/smoke/iphone-*` の追加 / 修正必須
- 正符号 / 負符号の方向は **画面上で実機確認 not 想像で書かない**(PR #201 で 6 回直した教訓)

#### Rule R3 — Unbounded JSON.stringify
**Anchor**: `72f17a3 fix(debug): close every JSON.stringify path that can blow on big containers`
**根本原因**: 600 KiB+ asset を含む container を `JSON.stringify` すると "allocation size overflow" で uncatchable error
**Prevention rule**:
- container / 大 payload を stringify する箇所は **try/catch 必須**、size pre-scan(`safeMeasureJsonLength`)
- debug / report 系の payload は eager deep clone で参照漏れ防止
- 着地 stress test: 100 entry / 1000 entry / 600 KiB asset の synthetic container で実行

#### Rule R4 — Floating popover positioning
**Anchor**: `7b8f032 fix(layout): shell menu stays open under the color-input eyedropper` + Bug fix wave Item 3(2026-04-26)
**根本原因**:
- `position: absolute` + `top/left` 未指定 → parent flex container の static 位置に出る
- `<input type="color">` eyedropper が popover を mousedown で勝手に閉じる
**Prevention rule**:
- popover は `position: fixed` + `getBoundingClientRect()` で trigger に追従させる(`action-binder.ts:205-241` パターン)
- popover を閉じる handler は overlay と native picker の両方をフィルタ(eyedropper / `<input type=color>` の mousedown event をブロック)
- parity test で popover が trigger 直下に配置されることを `boundingBox` で確認

#### Rule R5 — Pointer mode / phase 分岐の網羅
**Anchor**: `e28fe2e fix(layout): tap-toggle PDR popovers + iPhone list ignores stored collapsed pref`
**根本原因**: `pointer:fine`(desktop)では hover で popover 開閉、`pointer:coarse`(touch)では hover 無いので tap-toggle が必要。同 phase / 同 entry でも viewport mode で挙動が分岐するが、開発時は一方しか確認していなかった。
**Prevention rule**:
- 触る feature が「click / hover / focus / scroll / tap」いずれかの user interaction を含むなら、**desktop + iPhone shell の両方で** parity test を 1 件ずつ
- `state.phase`(`ready` / `editing`)依存の挙動は両 phase の test、`@media (pointer: coarse)` 依存は両 mode の test
- 「desktop で動いた」「iPhone で動いた」の片側だけ確認は **不可**

#### Rule R6 — DOM/flex layout regression after refactor
**Anchor**: `910e111 fix(ui): force flex-start so More… / Data… button text actually hugs left`(段階修正 3 commit)
**根本原因**: button text の left-align が flex container の default `justify-content: stretch` で center 寄りに、複数の wrapper 階層に依存。
**Prevention rule**:
- action menu / button bar の layout 変更は parity test で **textContent + boundingBox** の両方を assert
- flex layout の `justify-content` / `align-items` は default に依存せず明示
- 視覚 regression は happy-dom では捉えられない、Playwright で実 OS event + DOM 検査

#### Rule R7 — Spec drift / invariant violation
**Anchor**: `6b9e080 fix(spec): root-level ASSETS/TODOS auto-create — incidentals never land at root unfiled`
**根本原因**: routing logic に「root に上がってきた entry を auto-bucket」の invariant が抜けていて、spec が記述する状態と実装が drift
**Prevention rule**:
- core / features 層で扱う invariant は専用 test ファイルで集約(`tests/core/invariants.test.ts` 等)
- Phase 4 spec audit(reform-2026-05 PR #1+#2 の 49 spec)は **半年に 1 度** 実行(rotation: orphan check の docs CI と同様)
- 新規 feature の spec doc は behavior contract + minimum scope の 2 doc を pair で起こす(canonical pattern、現在 14 pair 着地済)

### 2.3 統合 checklist(reform-2026-05 doctrine 上層に追加)

新規 feature PR は、`pr-review-checklist.md` §3 セルフチェックの **後** に下記 quick check を追加:

```
□ R1 CSS: 環境分岐 style 追加なら override grep + parity 数値 assert 済
□ R2 viewport: 座標計算するなら visualViewport 参照 + iPhone smoke 追加
□ R3 stringify: 大 payload を string 化する箇所は try/catch + stress test
□ R4 popover: position:fixed + getBoundingClientRect、eyedropper handler 隔離
□ R5 mode/phase: click/hover/focus/scroll/tap 含むなら desktop + iPhone 両 parity
□ R6 layout: button bar / menu 触るなら textContent + boundingBox assert
□ R7 spec: invariant に触るなら core 層 invariant test or 半年ごと spec audit
```

各項目は **必須でない** が、該当する場合は確認したことを PR body に明示。スキップする場合は理由を書く。

### 2.4 既知の制約

- **30 fix commit の sample size 限定**: より長期(50-100 commit)の survey で見つかる別 pattern(deps update / async race / memory leak など)は今回 cover していない。半年ごと再 audit。
- **R1-R7 は予防であって検出ではない**: 各ルールは「PR 起こす時に思い出す checkpoint」、自動 test ではない。Coverage gate(案 2)+ 既存 parity test 群と組合せて初めて regression を **構造的に** 抑える。
- **Goodhart's law 警戒**: rule 数を増やしすぎると checklist が読まれず checkpoint が空化。7 件は意図的な上限、追加は半年 audit で吸収。

---

## 3. 結論

### 案 2(Coverage gate)
- **推奨: ADOPT**(別 follow-up PR で着地、minimum 80% / target 85%)
- 着地 PR scope: vitest.config.ts thresholds / ci.yml 1 step / package.json devDep 追加
- 工数: 1 PR、~30 分、bundle 影響ゼロ、CI 時間 +30-60 秒

### 案 3(Regression rule)
- **推奨: 本書を canonical reference として `pr-review-checklist.md` から参照、半年ごと 30 fix commit を再 sample**
- 着地 PR scope: 本 audit doc が deliverable、`pr-review-checklist.md` §3 に R1-R7 quick check を追記、INDEX 登録

### 統合運用

reform-2026-05 で導入した:
- **Phase 5 docs CI gate**(orphan + dead-link)
- **Visual state parity testing**(real OS event)
- **Phase 4 spec audit pair**(behavior-contract + minimum-scope)

に、本 audit が:
- **Coverage gate**(数値 minimum で retreat block、案 2)
- **R1-R7 regression rules**(質的 prevention checklist、案 3)

を加えることで、「test pass = ship」を 5 軸(orphan / dead-link / coverage / parity / regression rule)で多重化する体制が完成。半年ごとの spec audit 再走 + 30 fix commit 再 sample で生命線を維持。

---

## 関連

- 上位 doctrine: [`debug-privacy-philosophy.md`](./debug-privacy-philosophy.md)、[`visual-state-parity-testing.md`](./visual-state-parity-testing.md)
- 運用: [`pr-review-checklist.md`](./pr-review-checklist.md) §3、[`doc-ci-automation.md`](./doc-ci-automation.md)
- Phase 5 history: [`archived/v1-audits/SUMMARY.md`](./archived/v1-audits/SUMMARY.md)
- Anchor commits の archive: 各 PR finding は `archived/pr-findings/` 配下
- INDEX canonical: [`INDEX.md`](./INDEX.md) §LIVE
