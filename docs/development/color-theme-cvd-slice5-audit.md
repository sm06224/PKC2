# Color Slice 5 — Theme / CVD audit

## 1. Purpose / Status

**docs-only audit、実装ゼロ**。Color wave Slice 1-4(#170 等で end-to-end 化済 = palette / Saved Search / Entry schema / picker / sidebar marker / parser / filter / round-trip)の **残課題**(theme HEX 値の per-container override / CVD-simulation tooling)を、いきなり実装に進む前に洗う。Known limitations(`build/about-entry-builder.ts:169` / `CHANGELOG_v2.1.1.md` §144)で「将来 slice で再評価」と告知済みの 2 項目に決着を付ける。

- **Status**: 推奨 **Option B + E**(CSS token 整理 + dev-only CVD guard 軽量導入)。本 PR は **docs-only**、実装は別 wave。
- **触らない**: schema / version / About / CHANGELOG / per-container theme override / Color picker UI 改修 / `color:<id>` parser / filter / Card / clickable-image / ImportExport / palette ID 変更。

参照(読む順):

1. `docs/spec/color-palette-v1.md`(Slice 1、palette 8 ID 確定)
2. `docs/spec/color-tag-data-model-v1-minimum-scope.md`(Entry schema / round-trip / unknown ID 保持)
3. `docs/development/color-tag-ui-appstate-audit.md`、`color-tag-filter-slice4-design.md`(Slice 3 / 4 設計)
4. `src/features/color/color-palette.ts`(8 ID closed list + type guard + palette order)
5. `src/features/color/wcag-contrast.ts`(WCAG 2.x relative luminance + grade)
6. `src/styles/base.css` L957-985(`--pkc-color-tag-*` 8 token + `.pkc-color-*` 8 binding rule)

## 2. 現在の color 実装と CSS 色値 棚卸し

### 2.1 token 構造(現状)

```css
/* base.css:957-966 — :root のみ、dark/light で切替なし */
--pkc-color-tag-red:    #ef4444;
--pkc-color-tag-orange: #f97316;
--pkc-color-tag-yellow: #eab308;
--pkc-color-tag-green:  #22c55e;
--pkc-color-tag-blue:   #3b82f6;
--pkc-color-tag-purple: #a855f7;
--pkc-color-tag-pink:   #ec4899;
--pkc-color-tag-gray:   #6b7280;
```

```css
/* base.css:978-985 — palette ID → hue token */
.pkc-color-red    { --pkc-color-tag-current: var(--pkc-color-tag-red); }
... (8 行)
```

```css
/* base.css:968 — 唯一の visible 用途: 3px sidebar bar */
.pkc-entry-color-bar { border-left: 3px solid var(--pkc-color-tag-current, transparent); }
```

picker swatch / dot は `var(--pkc-color-tag-current)` を background として使用。

### 2.2 責務分離(現状)

- **palette ID**(`'red' | 'orange' | ...`、closed 8 個): `core` / `features/color/color-palette.ts` に固定、schema / Saved Search / parser / filter / picker でこの ID のみ流通(round-trip preservation)
- **theme HEX 値**(`#ef4444` 等): `src/styles/base.css` の `--pkc-color-tag-*` token のみが知る、JS / schema からは見えない
- **theme mode**(dark / light / system): 既存 `--c-bg` / `--c-fg` / `--c-accent` 等は `:root` / `@media (prefers-color-scheme: light)` / `#pkc-root[data-pkc-theme="light"]` で 3-way 分岐、**ただし `--pkc-color-tag-*` 8 token は `:root` のみで dark/light 共通の単一値**

### 2.3 既存 a11y インフラ

- `src/features/color/wcag-contrast.ts` に `contrastRatio` / `wcagGrade` / `formatContrastRatio` の pure helper(43 行、no DOM)、外部 caller は **Color picker** で current hue の contrast 表示にのみ使われている可能性
- `tests/styles/toc-readability.test.ts` 等 で WCAG 関連の static CSS 検証あり、Color tag 専用の a11y test は無い

## 3. WCAG / CVD empirical 評価(2026-04-25 probe)

`contrastRatio()` を 8 hue × {dark `#0d0f0a` / light `#f0ebe0`} で計算した結果:

| hue | hex | vs dark | vs light |
|---|---|---|---|
| red | `#ef4444` | 5.1:1 **AA** | 3.2:1 **Fail (text)** |
| orange | `#f97316` | 6.9:1 **AA** | 2.4:1 **Fail** |
| yellow | `#eab308` | 10.0:1 **AAA** | 1.6:1 **Fail** |
| green | `#22c55e` | 8.5:1 **AAA** | 1.9:1 **Fail** |
| blue | `#3b82f6` | 5.2:1 **AA** | 3.1:1 **Fail (text)** |
| purple | `#a855f7` | 4.9:1 **AA** | 3.3:1 **Fail (text)** |
| pink | `#ec4899` | 5.5:1 **AA** | 3.0:1 **Fail (text)** |
| gray | `#6b7280` | 4.0:1 **Fail** | 4.1:1 **Fail** |

**重要発見**:
- **dark テーマ**: 7/8 が text-contrast AA(gray のみ 4.0:1 fail)
- **light テーマ**: **全 8 色が text-contrast AA fail**(1.6 - 4.1:1)
- ただし v1 の visible 用途は **3px sidebar bar(WCAG 1.4.11 non-text contrast = 3:1)**:
  - dark: 全 8 ✓(最低 4.0:1)
  - **light: orange (2.4) / yellow (1.6) / green (1.9) の 3 hue が 3:1 fail**

### 3.1 CVD(色覚多様性)観点

WCAG ratio は **luminance 差** を測るので CVD 適合性とは直交。CVD risk の代理として **隣接 hue の luminance 差** を参照:

| 隣接 pair | contrast |
|---|---|
| red ↔ orange | 1.3:1(低) |
| orange ↔ yellow | 1.5:1 |
| yellow ↔ green | 1.2:1(低) |
| green ↔ blue | 1.6:1 |
| blue ↔ purple | 1.1:1(低) |
| purple ↔ pink | 1.1:1(低) |

**deuteranopia / protanopia**(赤緑色覚多様性、約 8% の男性)では red↔orange / yellow↔green が混同しやすい。**tritanopia**(青黄、稀)では blue↔purple↔pink が混同。**v1 8 色は luminance 軸でも色相軸でも CVD 安全と言いきれない** ━ ただし **「色だけに意味を持たせない」原則** を spec / manual で強調することで運用回避する設計が現行(`color-palette-v1.md` §5 で明文化済み)。

## 4. Option A〜E 比較

| Option | 内容 | 利点 | 不利点 | 採否 |
|---|---|---|---|---|
| **A** docs only | 現状の色値維持、manual / spec で「色だけに意味を持たせない」を再強調、CVD は外部検証 | 実装ゼロ、リスク最小 | light テーマで 3 hue が 3:1 fail という実害が放置 | △ 不十分 |
| **B** CSS token 整理 | `--pkc-color-tag-*` を `:root` / light / dark で **3-way 分岐**(既存 `--c-bg` 等と同じ pattern)、light テーマで orange/yellow/green を darken して 3:1 確保。JS / schema / palette ID は無修正 | a11y を実害ベースで改善、bundle.css 微増(+~0.4 KB)、palette ID 不変で互換性 100% | 全 hue を再調整しない限り完全 AA は無理(light で text 用途は元々 v1 想定外) | ✅ **採用** |
| **C** light/dark/HC token split | 上 + `forced-colors` / `prefers-contrast: high` の 3 段階 | OS-level a11y 設定に追従、bundle.css +~1.2 KB | high-contrast の testing matrix が広がる、現 v1 で OS 設定を追従するユーザーは限定的 | ⏳ defer(Slice 5.1) |
| **D** per-container theme override | container or `__settings__` に `color_overrides?: Record<ColorTagId, hex>` を持たせ UI で編集 | 完全 customisable | schema bump / picker UI 改修 / import-export 影響 / spec 改訂、v1 として過剰 | ❌ defer to v2 |
| **E** dev-only CVD guard | `tests/styles/color-tag-contrast.test.ts` を新規追加、`wcag-contrast.ts` で 8 hue × {dark, light} の contrast を計測、`.pkc-entry-color-bar` の 3:1 floor を pin。runtime 影響ゼロ | 色値変更時の regression 防止、bundle に入らない | 完全 CVD simulation ではない、protanopia/deuteranopia 行列までは入れない | ✅ **採用**(B と同時) |

## 5. 推奨案 — Option B + E

### 5.1 Slice 5.0(本 audit 後の最初の実装 PR、別 wave)

- **B 部分**: `src/styles/base.css` の `--pkc-color-tag-*` 8 token を `:root` / `@media (prefers-color-scheme: light)` / `#pkc-root[data-pkc-theme="light"]` の 3-way に分岐、**light theme では orange/yellow/green を darken** して 3px bar の 3:1 floor を確保(red/blue/purple/pink/gray は light でも 3:1 を満たすので不変、dark theme は現状維持 7/8 AA + gray を僅かに lighten で 3:1 floor へ揃える余地)
- **E 部分**: `tests/styles/color-tag-contrast.test.ts` を新規追加、palette × theme の matrix で 3:1 floor pin、token 変更時のセーフネット
- bundle.css 想定差分: +0.3〜0.5 KB(`@media` block + light/dark 各 8 行)、headroom 2.85 KB なので余裕あり
- schema / version / About / CHANGELOG / Known limitations 文言は **触らず**(v1.x additive、機能変更なし)

### 5.2 Slice 5.1 以降(defer)

- **C**: `forced-colors: active` / `prefers-contrast: high` を別 wave で評価
- **D**: per-container override は v2 schema bump とセットで、Color wave とは別軸(設定 UX 寄り)
- 完全 CVD simulation(protanopia/deuteranopia/tritanopia 行列適用)は **runtime には入れない**(bundle 圧迫 + UX 過剰)、必要なら dev-only fixture / 外部 tool

### 5.3 Known limitations の更新計画

Slice 5.0 着地時に `build/about-entry-builder.ts:169` / `CHANGELOG_v2.1.1.md` §144 の文言を「**theme HEX 値は dark/light で分岐済み + 3:1 floor を満たす(2026-XX-XX、Slice 5.0)**、per-container override は v2 future」に短縮 ━ Known limitations を完全削除はしない(per-container override / CVD simulation の defer を継続記述)。

## 6. 評価軸 まとめ

| 軸 | A | B | C | D | E |
|---|---|---|---|---|---|
| ユーザー価値 | 低 | 中(light 環境で見やすい) | 中 | 高だが過剰 | 低(dev) |
| a11y 価値 | 低 | 中(3:1 floor 達成) | 高 | 中 | 中(regression guard) |
| implementation risk | ゼロ | 低 | 中 | 高(schema bump) | 低 |
| CSS budget impact | ゼロ | +0.3〜0.5 KB | +1.2 KB | +0.5 KB(picker 改修)| ゼロ |
| schema impact | ゼロ | ゼロ | ゼロ | **bump 必要** | ゼロ |
| import/export impact | ゼロ | ゼロ | ゼロ | **format 改修** | ゼロ |
| harbor philosophy(外で覚えた色が破綻するか)| ✅ | ✅(同 ID 保持) | ✅ | ⚠️ override が外で読めない | ✅ |
| future compatibility | △ | ✅ | ✅ | △(v2 bump) | ✅ |

## 7. 次の最小 follow-up(別 PR、本 audit 範囲外)

1. **Slice 5.0 実装 PR**: B + E を 1 本に。`base.css` の 3-way token 分岐 + `tests/styles/color-tag-contrast.test.ts` 新規 + `--pkc-color-tag-*` 値の light theme 調整(orange/yellow/green を主)+ bundle / release rebuild + Known limitations 文言短縮。tests / typecheck / lint / build 全部通すこと
2. **Slice 5.1 defer**: `prefers-contrast: high` 対応(必要性は user フィードバック後)
3. **v2 候補**: per-container override + CVD simulation tooling は v2 schema bump wave で再評価

## 8. Out of scope / Non-goals

- 実装(`base.css` の token 分岐 / 新 tests / bundle rebuild)
- schema bump / version bump
- per-container theme override
- Color picker UI 改修
- `color:<id>` parser / filter / Saved Search の挙動変更
- Card / clickable-image / ImportExport
- About / CHANGELOG / Known limitations 文言の現時点での更新(Slice 5.0 着地時に短縮)
- runtime CVD simulation(D / 完全行列適用は bundle 過剰)

## 9. References

- `./INDEX.md` #169(spec accept)/ #170-#176(Color Slice 1-4)/ #178(Card Slice 4)/ #179-#181(Import-Export / clickable-image)
- `docs/spec/color-palette-v1.md`(palette 8 ID closed)
- `docs/spec/color-tag-data-model-v1-minimum-scope.md`(round-trip / unknown ID 保持)
- `src/features/color/color-palette.ts`(76 行、closed list + type guard)
- `src/features/color/wcag-contrast.ts`(43 行、pure WCAG calc)
- `src/styles/base.css` L957-985(8 token + 8 binding rule、`--pkc-color-tag-current` semantic alias)
- `src/styles/base.css` L78-129(既存 light/dark theme override pattern が手本)
- `build/about-entry-builder.ts:169` / `docs/release/CHANGELOG_v2.1.1.md` §144(Known limitations 文言)

---

**Status**: docs-first audit(2026-04-25)。Option B + E を Slice 5.0 として推奨、別 PR で実装着地予定。本 audit は実装に進む前の **航路図確定** が役割で、`SAFE_URL_RE` / asset-resolver / palette ID / schema / version いずれも touched なし。
