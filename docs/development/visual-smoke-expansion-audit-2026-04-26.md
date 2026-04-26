# Visual smoke expansion audit — 2026-04-26

## 1. Purpose / Status

**docs-only audit、実装ゼロ**。User の方針「テストを手厚くして、バグリリースを減らし、運用で見つかるのは要望だけになるように変えていきましょう」(2026-04-26)に対する最初の test-strategy wave。Playwright smoke を **どこまで拡充すべきか** を docs-first で固定する。

User 補足(2026-04-26):
> テスト環境は静的解析〜実ブラウザ出力まで可能、順序性も対応できている。今後は使い勝手の不具合がメインになるはず。

**触らない**: `tests/smoke/*.spec.ts` の追加 / 改修、`tests/smoke/playwright.config.ts` の改修、`smoke.yml` の改修、src / tests / dist いずれも。

## 2. 現状の smoke spec(2026-04-26 survey)

| spec | 行数 | カバー範囲 |
|---|---|---|
| `tests/smoke/app-launch.spec.ts` | 59 | 起動 → "Text" create button click → editing phase 遷移 + title input visible + console error なし |
| `tests/smoke/manual-launch.spec.ts` | 95 | manual.html 起動 → chapter title visible → `entry:manual-text-NN` link click → 別 chapter 遷移 + console error なし |

合計 **154 行 / 2 spec**。ローカル実行 ~6-8 秒、CI smoke job ~1.5 分(Playwright install 込み)。

**狙い**: 起動 + 主要操作 1 セットの "nothing exploded at boot" gate。視覚 / レイアウト / 個別機能は意図的に未カバー。

## 3. happy-dom で拾えない領域 → smoke で見るべき候補

`vitest + happy-dom` の限界(CSSOM が rudimentary、`getComputedStyle` 値や layout 計算が production browser と乖離):

| 領域 | happy-dom | 実 Chromium |
|---|---|---|
| element visible / hidden(`display: none` / `visibility`)| △ | ✅ |
| CSS variable resolution(`getComputedStyle().getPropertyValue('--c-fg')`)| ❌(値が空文字) | ✅ |
| flex / grid layout(`getBoundingClientRect`)| ❌(ほぼ 0) | ✅ |
| `text-overflow: ellipsis` の実発火 | ❌ | ✅ |
| font / icon glyph render | ❌ | ✅ |
| theme 切替後の token cascade(`@media` / `[data-pkc-theme]`)| △(media query が limited) | ✅ |
| pointer / hover state CSS | ❌ | ✅ |

これらが「使い勝手の不具合」として user に届く主経路。**Playwright smoke で拾える**。

## 4. 候補スコアリング

各候補を以下で評価:
- **User-visible 度**: 不具合が起きたら user が気付く度合い
- **happy-dom 限界 度**: 既存 vitest test で catch できない度合い
- **実装コスト**: spec を書く / 維持する負担
- **ROI**: 追加価値 / 維持コスト

| 候補 | User-visible | happy-dom 限界 | 実装コスト | ROI | 採否 |
|---|---|---|---|---|---|
| **A. Card widget chrome 4 状態**(Slice 5.0 + 5.1)| 高 | 高(layout / token / ellipsis) | 中(fixture 必要) | **高** | ✅ **採用** |
| **B. Theme 切替**(dark / light)+ Color tag bar contrast | 高 | 高(token cascade、`@media` / `[data-pkc-theme]`)| 低(theme button click → token 値確認) | **高** | ✅ **採用** |
| **C. Search input → filter 反映**(text + tag chip)| 中 | 中(filter logic は vitest で pin、実 input は smoke で実証)| 低 | 中 | ✅ **採用**(軽い) |
| D. Kanban view + drag-drop | 中 | 高(DnD は Playwright が強い)| 高(複数 entry fixture + drag 操作) | 中 | ⏳ defer(Slice 6 + 後) |
| E. Import preview UI(Replace / Merge radio)| 高 | 中 | 高(zip fixture 必要) | 中 | ⏳ defer(Import-Export Slice β 着地後) |
| F. Calendar view rendering | 低 | 中 | 中 | 低 | ⏳ defer |
| G. Editor save → re-render | 高 | 低(vitest で pin 済) | 低 | 低 | ❌(既存 test で十分) |
| H. Saved Search apply | 中 | 低 | 中 | 低 | ⏳ defer |

**今回は A / B / C の 3 件**(計 ~150 行追加見込み、合計 spec 数 2 → 5、smoke job 時間 +5〜10 秒見込み)。

## 5. 採用スコープ詳細

### A. Card widget chrome 4 状態(`tests/smoke/card-widget.spec.ts`、~70 行想定)

**目的**: Slice 5.0 + 5.1 で hydrator が出力する `.pkc-card-widget` 4 状態が production browser で正しく描画されることを pin。

**fixture 構成案**:
- 起動後に "Text" entry を作成
- editor で body に 4 種類の `@[card](...)` を書く:
  - `@[card](entry:<self-lid>)` → ok(self-referencing は問題ない、ループしない)
  - `@[card](entry:nonexistent)` → missing
  - `@[card](pkc://other-cid/entry/x)` → cross-container
  - `@[card](pkc://nope)` → malformed
- Save → rendered view に切替

**assertion**:
- 4 状態の `.pkc-card-widget[data-pkc-card-status="..."]` がそれぞれ visible
- ok 状態の `aria-label` に entry title を含む(Slice 5.0)
- excerpt slot の `text-overflow: ellipsis` が overflow 時に効いている(Slice 5.1)
- missing / cross-container / malformed が `aria-disabled="true"` で `tabindex="-1"`

**failure mode で catching したい例**:
- card-hydrator の DOM 構造が壊れる(class / data attribute の typo)
- chrome の CSS が `display` / `flex` 系で broken layout に
- excerpt の overflow が ellipsis されず長い text がはみ出す

### B. Theme 切替 + Color tag bar contrast(`tests/smoke/theme-switching.spec.ts`、~50 行想定)

**目的**: Color Slice 5.0 の dark / light 3-way token split が production browser で実際に切り替わり、3:1 floor を満たすことを pin。

**fixture 構成案**:
- 起動後に Settings → Theme を「Light」に切替(`data-pkc-theme="light"` が `#pkc-root` に立つ)
- Color tag つきの entry を作成(picker から色を 1 つ選ぶ)
- sidebar の `.pkc-entry-color-bar` が visible

**assertion**:
- `data-pkc-theme="light"` への transition が反映される
- light theme で `getComputedStyle().getPropertyValue('--pkc-color-tag-orange')` が `#c2410c`(darken 後の値)
- dark theme で同じ token が `#f97316`(従来値)
- sidebar bar の `border-left-color` が token と一致

**failure mode**:
- theme 切替時の token cascade が壊れる(@media と [data-pkc-theme] の干渉)
- Slice 5.0 の 4 hue darken が次の wave で revert される
- sidebar bar の class binding が壊れる

### C. Search input + filter chip(`tests/smoke/search-filter.spec.ts`、~30 行想定)

**目的**: search input への文字入力で sidebar entry tile が絞られることを pin。

**fixture 構成案**:
- 起動後に entry を 3 件作成(Title が異なる)
- search input に "Foo" を入力
- sidebar の visible entry tile が "Foo" を含む 1 件のみ

**assertion**:
- search 前: 3 件 visible
- search 後: 1 件 visible
- search clear → 3 件 visible に復帰
- IME composition / regex などの edge case は vitest 側で pin 済み(本 smoke では基本フローのみ)

**failure mode**:
- `parseSearchQuery` / `applyFilters` が renderer に正しく渡らない
- entry tile が hide でなく実 remove されてしまうレイアウト問題

## 6. Implementation plan(C-2 以降の各別 PR)

3 spec を **別々の PR** で着地、実装ゼロ → spec 追加 → ローカル smoke pass → push の順。

| PR | spec | 想定行数 | 想定 smoke 時間追加 |
|---|---|---|---|
| Plan 1-A | `card-widget.spec.ts` | ~70 行 | +3〜5 秒 |
| Plan 1-B | `theme-switching.spec.ts` | ~50 行 | +2〜3 秒 |
| Plan 1-C | `search-filter.spec.ts` | ~30 行 | +1〜2 秒 |

**1 PR ずつ着地** する理由:
- spec 失敗の原因切り分けが明確
- flake が出た時に rollback 単位が小さい
- 新ルール 8 項目自己監査が個別に回せる

各 spec PR は **docs-only / src 不変**。新ルール下で `npm run test:smoke` を pre-PR で必ず実行 → 追加した spec が pass することを確認 → push。

## 7. Out of scope

- **screenshot diff**(案 4 snapshot DOM regression と同じ理由で見送り、user 判断 2026-04-25): 環境依存でフレーキー、保守コスト高
- **cross-browser matrix**(Firefox / Safari): chromium のみで継続、PKC2 は単一 HTML で配布、main target は chromium 系
- **mobile viewport / responsive**: 現状 desktop UI しかない、対応は別 wave
- **performance benchmark / Lighthouse**: 別軸
- **video / trace retention**: failure 時の `playwright-report` artifact upload(`smoke.yml:75-83`)で十分
- **D Kanban DnD / E Import preview / F Calendar / H Saved Search / G Editor save**: 上の表で defer
- **`案 2 Coverage gate`**: 別 audit(本 PR の後)
- **`案 3 Bug-driven regression rule`**: 別 audit(本 PR の後)

## 8. 評価軸まとめ

| 軸 | 値 |
|---|---|
| ユーザー価値 | **高**(視覚バグの release 流出を smoke で先取り) |
| 中途半端さ解消 | 高(現状 154 行 + 2 spec → 304 行 + 5 spec、主要 visible 機能の 1 軸 coverage) |
| 実装リスク | 低(各 spec は独立、flake が出ても rollback 単位が小さい) |
| CI 時間 impact | smoke job +5〜10 秒(現 ~1.5 分 install + ~6-8 秒 spec → ~1.5 分 + 13-18 秒) |
| schema impact | ゼロ |
| harbor philosophy | ✅(港湾整備の典型、外で覚えた使い勝手の不具合を smoke で water-tight に) |
| 1 PR で閉じるか | 各 spec は単独 PR(計 3 PR)、本 audit は plan 確定だけ |

## 9. 次の最小 follow-up(本 audit 後)

1. **Plan 1-A 実装 PR**(`card-widget.spec.ts` 新規)
2. **Plan 1-B 実装 PR**(`theme-switching.spec.ts` 新規)
3. **Plan 1-C 実装 PR**(`search-filter.spec.ts` 新規)
4. **案 2 Coverage gate audit**(別 docs-first PR)
5. **案 3 Bug-driven regression rule audit**(別 docs-first PR)

Plan 1-A から順次着地、A の実装で fixture pattern が固まれば B / C は早く回せる見込み。

## 10. References

- `tests/smoke/app-launch.spec.ts` / `tests/smoke/manual-launch.spec.ts`(現 smoke spec)
- `tests/smoke/playwright.config.ts`(`scripts/smoke-serve.cjs` で `dist/` + `PKC2-Extensions/` を route)
- `.github/workflows/smoke.yml`(CI smoke job、現状 PR + main push のみ)
- `docs/development/pr-review-checklist.md` §3(pre-PR `npm run test:smoke` ルール、#187 + #189 で確立)
- `docs/development/card-widget-ui-v0-audit.md` §3 / §4(card chrome / 4 状態 / aria contract)
- `docs/development/color-theme-cvd-slice5-audit.md` §5(token 3-way split + 3:1 floor)
- `docs/spec/search-filter-semantics-v1.md`(search / filter pure logic、smoke 側は flow のみ)

---

**Status**: docs-only audit(2026-04-26)。Plan 1-A / B / C を別々の実装 PR で着地予定。本 audit は roadmap の正本、各 spec PR が本 audit を canonical reference として書かれる。
