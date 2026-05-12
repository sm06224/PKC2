# bold in `:::if{format=html}` 調査結果(reform-2026-05 Phase 3 PR-2U)

**Status**: 再現せず(2026-05-12 結論)
**実装 PR**: PR-2U
**fixture matrix**: `tests/smoke/phase3-2u-bold-in-if-comprehensive.spec.ts`(15 variant)

---

## user 報告(2026-05-10)

```markdown
:::if{format=html}
__※ 換算式:120,000 × 1.6 + 6,853 × 1 = 192,000 + 6,853 = **{{vars.sky_coins_after}}**
:::
```

「`**{{vars.sky_coins_after}}**` が太字 render されない」

---

## 調査

### Phase 2 期に実施した 6 variant test

`tests/smoke/bold-in-if-investigation.spec.ts`(2026-05-10、PR #410 で投資のみ、close)で
6 variant で全部 bold(`<strong>`、computed font-weight=700)render を確認。

### Phase 3 PR-2U で実施した 15 variant 拡張 matrix

| # | variant | result |
|---|---------|--------|
| V01 | 基本 bold in if-html | ✅ `<strong>太字テスト</strong>` weight=700 |
| V02 | vars 展開 + bold | ✅ `<strong>198,853</strong>` weight=700 |
| V03 | nested in section | ✅ `<strong>重要</strong>` weight=700 |
| V04 | nested in figure caption | ✅ `<strong>強調 caption</strong>` weight=700 |
| V05 | indent prefix(`__`)と組合せ | ✅ `<strong>192,000</strong>` weight=700 |
| V06 | align prefix(`\|>`)と組合せ | ✅ `<strong>右寄せ太字</strong>` weight=700 |
| V07 | heading 直後 | ✅ `<strong>太字見出し</strong>` weight=900(h2 cascade)|
| V08 | 文中 bold | ✅ |
| V09 | 連続複数 | ✅ 3 件全部 |
| V10 | 長い content | ✅ 40 文字 |
| V11 | 特殊文字(数字 / カンマ / 絵文字)| ✅ `1,234,567 個 🎉` |
| V12 | blank line を跨ぐ | ✅ commonmark 規則通り reject(literal 残し)|
| V13 | nested em(`***xxx***`)| ✅ |
| V14 | nested inline code(`**\`code\`**`)| ✅ |
| V15 | format=pdf mismatch(strong is hidden)| ✅ pdf-only block strip、html-only のみ visible |

**結果:全 15 variant pass、bold render 正常**(`computed font-weight ≥ 600`)。

---

## user 報告の原因仮説(再現できなかった理由)

| 仮説 | 内容 | 対応 |
|------|-----|-----|
| H1 | **bundle cache 問題** | PR-2L 着地前の dist を user 側が見ていた、GitHub Pages CDN cache / iOS Safari PWA cache。Phase 2 wave 期間中の頻繁 deploy で cache mismatch |
| H2 | **fixture 表記揺れ** | user 報告の `**X**` が実は `__X__`(alt syntax)で L-9 indent prefix `__` と衝突して emphasis 不発(L-9 matcher が `^\s*(?:__\|＿)(?!_)` で line 頭の `__` を indent prefix として消費)|
| H3 | **CSS context** | 親要素の `font-weight: 500` cascade で `<strong>` の `bolder` 計算値が 700 にならない…ただし PKC2 base.css に該当 cascade 無し |
| H4 | **vars 未定義** | `{{vars.x}}` が未定義 → `<span class="pkc-variable-undefined">` 化、ただし bold は外側 `<strong>` で残る(V02 test で確認済)|

最も可能性高は **H1(cache)** + 補助で **H2(`__X__` 取り違え)**。

---

## user 向け推奨アクション

1. **bundle を最新に refresh**:
   - About entry の Hard reload ボタン(PR #394、iOS Safari PWA 対応)
   - もしくは URL に `?cache-bust=20260512` 等の query を付ける
2. **fixture の確認**:`**X**` (asterisk 2 個)を使用していることを確認、`__X__`(underscore 2 個)を使うと L-9 indent prefix と衝突する
3. **CSS context 確認**:`?pkc-debug=hallucination` URL flag(PR-2K)を立てて debug 表示 / DevTools で `<strong>` の computed font-weight を確認

---

## PR-2U の deliverable

| アイテム | path |
|---------|------|
| 15 variant smoke matrix | `tests/smoke/phase3-2u-bold-in-if-comprehensive.spec.ts` |
| 本 finding doc(archived 配下、closed bug)| `docs/development/archived/pr-findings/bold-in-if-investigation-2026-05.md` |

本 PR は **再現が取れず、追加 fix なし**。test matrix で regression guard を整備、user 環境問題が判明したら別 PR で対応。

---

## 関連 PR

- PR #410(2026-05-10、投資のみ、closed):initial 6 variant test
- PR #404(PR-2J、multi-line content 受理):em-dot `^^X^^` 内 nested inline 関連
- PR #411(PR-2P、em-dot nested parse fix):asymmetric `*X**` tolerant 正規化

bold は **commonmark 標準** で実装、PKC2 独自実装は無いため、本 fixture matrix が green である限り regression なし。
