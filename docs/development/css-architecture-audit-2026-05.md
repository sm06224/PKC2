# CSS architecture audit(2026-05)— 領域 9 redesign wave 起点

**Date**: 2026-05-04
**Trigger**: Flags wave(PR-γ wave 2 = PR #240)着地後、`feature-requests-2026-04-28-roadmap.md` §領域 9 で予約していた CSS architecture redesign wave の最初の deliverable
**Scope**: `src/styles/base.css`(7591 行 / 767 unique class / 43 declared CSS variable)1 ファイルの構造棚卸しと改革候補抽出。実装変更ゼロ、後続 5+ PR の wave 起点。
**User direction(2026-05-03 chat)**:

> css は流用最適化できないんですか? 透過的な css 運用ができているかは別 PR で実施願います / 透過的、構造的な CSS ができるなら、実行時にデータタイプや画面タイプに合わせて自動生成するのも視野に入れて大胆な改革を検討してください

3 段階の問いを 1 つずつ data に基づいて答える形で本書を構成。

---

## 1. base.css 全体像

| 観点 | 値 |
|---|---|
| 行数 | 7591 |
| top-level class(`^\.[a-z]…`) | 767 unique |
| 宣言済み CSS variable(`--c-*` / `--pkc-*` / `--font-*` / `--radius*`) | 43 |
| variable 参照 occurrence | 964 |
| inline 数値値(rem/em/px)occurrence | ≈ 1700+(下表参照) |

base.css 1 ファイルに集約されているのは PKC2 の「single-HTML 哲学」と整合(1 production = `dist/pkc2.html` 1 ファイル)。ただし内部構造が flat なため重複・近似 pattern の早期検出と段階的 axis 化が effort に見合う規模に達している。

---

## 2. Class inventory(category 別、prefix-based)

767 class を top-2 prefix(`pkc-X-Y...`)で集計した分布:

| count | prefix | 主用途 |
|---:|---|---|
| 44 | `pkc-textlog-*` | TEXTLOG presenter / hydrator / day-section / TOC |
| 40 | `pkc-entry-*` | Entry list row / hover / selection / drag |
| 30 | `pkc-calendar-*` | Calendar view / cell / month-nav |
| 28 | `pkc-attachment-*` | Attachment thumb / sandbox / preview |
| 27 | `pkc-about-*` | About entry render |
| 26 | `pkc-todo-*` | Todo body / status-toggle |
| 26 | `pkc-text-*` | TEXT body markdown render |
| 24 | `pkc-storage-*` | Storage Profile overlay |
| 24 | `pkc-kanban-*` | Kanban view / column / card |
| 23 | `pkc-color-*` | Color tag chip / picker |
| 22 | `pkc-shell-*` | Shell menu overlay |
| 19 | `pkc-flags-*` | Flags inspector overlay(本 wave 直前で着地) |
| 18 | `pkc-asset-*` | Asset attachment metadata |
| 17 | `pkc-relation-*` | Relation lane / kind editor |
| 17 | `pkc-flag-*` | Per-flag row inside inspector(`-flags-*` と分離) |
| 17 | `pkc-btn*` | 共通ボタン system(後述、重複源) |
| 14 | `pkc-toc-*` | TEXTLOG TOC |
| 12 | `pkc-toast-*` | Toast notifications |
| 10〜 | folder / form / sandbox / restore / idb / drop / shortcut / references / recent / md / import / action / ... | 機能別 |

### 2.1 観察

- **Archetype-specific が多い(textlog 44 / todo 26 / text 26 / kanban 24)** → 各 archetype が独立した CSS namespace を持つ、再利用率が低い
- **Overlay が領域横断で重複(11 件)** → backdrop + panel pattern が後述 §4.1 でほぼコピペ
- **共通 button が 17 class** → primary / danger / clear / small / ghost 等の variant が `.pkc-btn` を base にせずに full 再定義している箇所多数(§4.2)

---

## 3. CSS variable inventory

### 3.1 宣言済み軸

```text
Color (--c-*):
  --c-bg / --c-fg / --c-text / --c-text-dim / --c-body-text
  --c-accent / --c-accent-dim / --c-accent-fg
  --c-border / --c-hover / --c-surface
  --c-danger / --c-warn / --c-warn-fg / --c-info / --c-info-fg / --c-success
  --c-muted / --c-toc-secondary
  --c-range-active-bg / --c-kanban-drag-over-bg
  --c-tok-attr / --c-tok-builtin / --c-tok-comment / --c-tok-del / --c-tok-hunk
  --c-tok-ins / --c-tok-keyword / --c-tok-meta / --c-tok-number / --c-tok-string
  --c-tok-tag / --c-tok-type / --c-tok-variable

Color tag palette (--pkc-color-tag-*):
  blue / gray / green / orange / pink / purple / red / yellow

Font (--font-*):
  --font-sans / --font-mono / --font-body

Radius (--radius*):
  --radius-sm: 1px / --radius: 2px / --radius-lg: 4px

合計: 43 declared, 964 references
```

### 3.2 欠落している軸

bench なしで明らかに欠落している軸:

#### Spacing scale(完全欠落)

inline 数値 occurrence 上位:

| value | count |
|---|---:|
| `1px`(border) | 220 |
| `0.5rem` | 127 |
| `0.75rem` | 96 |
| `0.25rem` | 79 |
| `0.35rem` | 75 |
| `0.4rem` | 69 |
| `0.7rem` | 58 |
| `2px` | 56 |
| `0.3rem` | 52 |
| `0.8rem` | 44 |
| `0.6rem` | 42 |
| `0.2rem` / `0.15rem` | 41 each |
| `1rem` / `0.85rem` | 40 each |
| `0.65rem` | 29 |
| `0.1rem` | 28 |
| `4px` | 23 |
| `0.05rem` | 22 |
| `6px` | 17 |

**計 17 種以上の異なる spacing 値が手書きで散乱**。同じ役割(button padding / chip padding / overlay margin)で違う値が使われている可能性大。`--space-1...6` の token system がない。

#### Font-size scale(完全欠落)

`font-size:` の RHS 値:

| value | count |
|---|---:|
| `0.7rem` | 53 |
| `0.75rem` | 47 |
| `0.8rem` | 42 |
| `0.85rem` | 40 |
| `0.65rem` | 29 |
| `0.6rem` | 21 |
| `0.9rem` | 14 |
| `0.95rem` | 14 |
| `1rem` | 7 |
| `1.1rem` | 6 |
| `0.9em` | 6 |
| `0.85em` | 4 |
| `0.72rem` | 4 |
| その他細目 | ~10 |

**12+ 種の font-size が変数化されずに散在**。`--font-size-{xs,sm,base,md,lg,xl}` の scale が不在。

#### Radius scale(部分欠落)

declared: `--radius-sm: 1px / --radius: 2px / --radius-lg: 4px`(3 段階)

実使用の inline 値: `2px / 3px / 4px / 5px / 6px / 8px / 12px / 50% / 999px` — 既存 3 tokens を bypass する 6+ raw values が混在。`50%`(circle)/ `999px`(pill)は意味が違うので別 token(`--radius-circle` / `--radius-pill`)が必要。

### 3.3 観察

- **Color axis は十分整備されている**(33 tokens、light / dark / scanline 3 theme で完全に variable 駆動 → theme switch が CSS-only で動く既存 success case)
- **Color tag palette も完全 variable**(8 colors × 4 modulation で 32 tokens 想定の最大射程)
- **Spacing / font-size / radius が手書きで bypass される現状**で「透過構造化」「runtime 自動生成」を目指すのは前提が揃っていない

---

## 4. Duplicate / near-duplicate pattern 検出

### 4.1 Overlay backdrop + panel pattern(11 件、最大の重複源)

「**画面を暗くする backdrop + 中央寄せ panel**」の同じ構造を 11 class が個別に再定義している。grep + 比較した実例:

```css
/* shell-menu */
.pkc-shell-menu-overlay {
  position: fixed; inset: 0; z-index: 20000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(2px);
}
.pkc-shell-menu-card { background: var(--c-surface); border: 1px solid var(--c-accent); border-radius: var(--radius-lg); box-shadow: 0 0 20px rgba(51,255,102,0.1); ... }

/* shortcut-help */
.pkc-shortcut-overlay { /* same 9 lines */ }
.pkc-shortcut-card    { /* same 4 lines */ }

/* storage-profile */
.pkc-storage-profile-overlay { /* same 9 lines, only z-index=20010 */ }
.pkc-storage-profile-card    { /* same 4 lines + max-height:80vh, overflow-y:auto */ }

/* flags-inspector(structurally split into overlay+backdrop+panel) */
.pkc-flags-inspector-overlay  { /* 4 lines: position+inset+z-index+flexbox */ }
.pkc-flags-inspector-backdrop { /* 4 lines: position+inset+bg+blur */ }
.pkc-flags-inspector-panel    { /* same 4 lines as -card */ }

/* textlog-preview / text-replace / text-to-textlog / link-migration / ... */
```

** 構造が同じなのに名前空間ごとにコピペ** されており、新しい overlay を追加するたびに 13 lines を再定義している。reform の余地最大。

### 4.2 Button variants(`.pkc-btn-*`)

```css
.pkc-btn { padding:.2rem .5rem; font-size:.75rem; border:1px solid var(--c-border); border-radius:var(--radius); background:var(--c-bg); color:var(--c-fg); cursor:pointer; font-family:var(--font-sans); }
.pkc-btn-primary { padding:.2rem .5rem; font-size:.75rem; border:1px solid var(--c-accent); border-radius:var(--radius); background:var(--c-accent); color:var(--c-accent-fg); cursor:pointer; font-family:var(--font-sans); }
.pkc-btn-danger  { padding:.2rem .5rem; font-size:.75rem; ... background:var(--c-danger); color:#fff; ... }
```

`-primary` / `-danger` は base の 6/9 declarations を **そのままコピー**している。差分は `border` / `background` / `color` の 3 行のみ。`@extend` 相当が無いため重複して書かれている。

`.pkc-btn-create` / `.pkc-btn-clear` / `.pkc-btn-small` も同じ pattern で増え続けている。

### 4.3 Chip / badge pattern

`.pkc-color-chip*` / `.pkc-tag-chip*` / `.pkc-archetype-badge` / `.pkc-task-badge` / `.pkc-todo-status-badge` 等が個別にrounded background + small padding + small font を再定義している。共通の chip 抽象が欠落。

### 4.4 全体所感

base.css の **20-30%(~1500-2300 行)程度は cross-namespace の重複** と推定(粗い目算、本書 §6 で wave 内 PR で正確に measure する)。重複の origin は archetype / feature 単位で wave-by-wave に css を増やしてきた歴史で、cross-cutting な base layer を抽出する作業を skip してきた結果。

---

## 5. Runtime auto-generation 評価

User direction の 3 段階目「**実行時にデータタイプや画面タイプに合わせて自動生成**」の feasibility 評価。

### 5.1 単一 HTML 哲学との整合

PKC2 は CSS-in-JS 禁止(bundle 増 + initial paint 遅延 + 単一 HTML 内で `<style>` ブロック分散)。代わりに次の 2 経路で runtime 自動生成が可能:

#### 経路 A: CSS variable cascade(推奨、低 cost)

```ts
document.documentElement.style.setProperty('--space-base', '0.5rem');
```

- cost: ほぼ 0(設定 1 回で `var(--space-base)` 経由の全 rule が即時 cascade)
- 適用対象: 数値 axis(spacing scale factor / radius scale factor / font-size factor)、color theme
- 実例: 既存の `applySystemSettings(root, settings, state)` が `--c-accent` を runtime に書き換えている = この経路は既に動いている

#### 経路 B: `document.styleSheets[0].insertRule`(中 cost)

```ts
sheet.insertRule('.pkc-archetype-badge[data-archetype="text"] { color: #00f; }', 0);
```

- cost: rule 追加毎に layout invalidate(数 ms / rule、再 paint 1 frame)
- 適用対象: 「container per palette」「device-class per layout」等、variable では表現困難な struct 変更
- 実例: PKC2 ではまだ未使用

### 5.2 defineFlag → CSS variable pipeline 設計

Flags wave の defineFlag が CSS-runtime と直結する design path:

```ts
// 1. Flag declaration (existing pattern)
const themeSpacingScale = defineFlag<number>('theme.spacing_scale', 1.0, {
  range: [0.7, 1.5], category: 'ui', tier: 0,
});

// 2. Boot + on FLAGS_CHANGED handler
function applyThemeFlags(): void {
  document.documentElement.style.setProperty(
    '--theme-spacing-multiplier',
    String(themeSpacingScale()),
  );
}

// 3. CSS uses calc(base * multiplier)
.pkc-btn { padding: calc(var(--space-base) * var(--theme-spacing-multiplier)); }
```

inspector で `theme.spacing_scale` を 1.2 に edit → `--theme-spacing-multiplier` 即時更新 → `var()` cascade で全 button が 1.2× に膨らむ。**rebuild 不要、reload 不要、Phase 8 順序性テストの application 例として理想的**。

### 5.3 device-class adaptive(中期目標)

`pointer:coarse` / `(max-width: 640px)` のような media query で `:root { --space-base: 0.4rem; }` を override すると、「mobile では密度高め」が CSS-only で実現。defineFlag overlay と組み合わせると user-tunable も追加可。

### 5.4 結論

CSS-in-JS なしでも、**spacing / radius / font-size を multiplier 軸に変換**すれば runtime 自動生成は十分可能。欠落していた 3 axis を導入することが prerequisite。

---

## 6. Phased migration plan(wave 全体像)

本 audit を起点に、5+ PR で段階的に reform。各 PR は独立 mergeable、bundle.css size budget(112 KB)を超えない範囲で。

### Phase 1 — Token introduction(2-3 PR)

- **Phase 1a ✅(2026-05-04 着地、PR #242)**:`--space-{0..7}` 8 段階を `:root` に宣言、最頻出 4 値を spacing context 限定で migrate:
  - `0.25rem` → `var(--space-2)`(79 occurrence)
  - `0.5rem` → `var(--space-3)`(125 occurrence)
  - `0.75rem` → `var(--space-4)`(48 occurrence)
  - `1rem` → `var(--space-5)`(54 occurrence)
  - 計 306 occurrence migrate、279 行変更
  - migration scope は `padding/margin/gap/inset/top/right/bottom/left/border-spacing` 系プロパティ行のみ(font-size 等の同値は触らず)
  - bundle.css 115.66 KB → 116.08 KB(+0.4 KB、各 `var(--space-X)` が 6 → 14 chars / 重複削減は Phase 2 で吸収)
  - 旧 `tests/styles/textlog-viewer.test.ts` の 2 件 hardcoded match を `var(--space-3)` に追従
  - `0.35rem` (75) / `0.4rem` (69) / `0.3rem` (52) / `0.2rem` (41) / `0.15rem` (41) などの outlier は scale に乗らない → Phase 1a-tail で別 PR にて round + clean-up
- **Phase 1b**:`--font-size-{xs,sm,base,md,lg,xl}` を導入、6 段階に丸め。inline font-size を migrate
- **Phase 1c**:`--radius-{sm,md,lg,pill,circle}` に拡張、3 → 5 段階に整理

各 sub-PR の test plan:
- Visual regression(main / dark / scanline 3 theme で screenshot 比較、Playwright)
- Phase 8 順序性テスト:scale flag を runtime edit → 全 spacing が同期して変わる(後述 Phase 3 で実装)

### Phase 2 — Pattern abstraction(2 PR)

- **Phase 2a**: `.pkc-overlay-base` + `.pkc-panel-base` を抽出。11 個の overlay/panel に共通宣言を寄せる(11 × ~13 行 → 1 × 13 行 + 11 × 0-3 行 override = 推定 ~110 行削減)
- **Phase 2b**: `.pkc-btn` を utility-first に再構成、`-primary` / `-danger` / `-clear` を background+border のみの variant に縮小(推定 ~80 行削減)

### Phase 3 — Runtime adaptive axes(2 PR)

- **Phase 3a**: `theme.spacing_scale` / `theme.font_scale` / `theme.radius_scale` を defineFlag に追加(Tier 0)、boot + FLAGS_CHANGED で `--theme-*-multiplier` を `:root` に cascade。CSS rules を `calc(var(--space-X) * var(--theme-spacing-multiplier))` に切り替え
- **Phase 3b**: `pointer:coarse` / `(max-width)` で `--theme-*-multiplier` の default を device-class 別に override(mobile では 0.9、desktop では 1.0 など)

### Phase 4 — Per-archetype palette(オプション、要 user 議論)

定型 chip / badge を `[data-archetype="X"]` 単位で背景色軸を切り替えるなど。`document.styleSheets[0].insertRule` 経路の試金石。

### 各 Phase 完了条件

- bundle.css <= 112 KB(現 ~115 KB の budget 内)
- Visual regression 0(全 theme × 全 viewport で screenshot 一致)
- 既存 parity test 全件 green
- Phase 8 順序性テスト:scale flag mutation → consumer behavior 変化を end-to-end 確認

---

## 7. Bundle size 制約

現状 `dist/bundle.css ≈ 115 KB`、budget は `build/check-bundle-size.cjs` で **112 KB**(over)。重複削減 wave なので **最終的に bundle.css は減る** 見込み。各 PR で size 推移を CHANGELOG に記録。

---

## 8. Out of scope(本 audit では扱わない)

- archetype-specific CSS の中身(`.pkc-textlog-*` 44 / `.pkc-todo-*` 26 等の機能別 layout)— 各 archetype の責任範囲、cross-cutting に変えない
- Tailwind 等 utility-first framework の導入 — bundle 増 + 単一 HTML 哲学と衝突
- CSS-in-JS — 同上 + initial paint 遅延
- Sass / Less / PostCSS plugin — build 時で解決される(現状の `build:bundle` で動的軸は提供されない)変換のため runtime adaptive 目標と直交

---

## 9. 次の action(本 PR 着地後)

1. **本 doc を user review** → Phase 順序 / scope の同意 → Phase 1a 着手
2. Phase 1a に着手:`--space-*` 8 段階導入 + 最頻出 5 値の migrate(~250 occurrence、別 PR)
3. 各 Phase 完了時に本 doc に「結果」段落追記、最終 wave クローズ時に Phase 6 doctrine で本 doc を archive(=「完了 audit」)

---

## 10. 関連 doc

- 起点 user direction: `feature-requests-2026-04-28-roadmap.md` §領域 9
- Flags wave(prerequisite): `docs/development/const-discipline-2026-05.md` / `docs/spec/flags-protocol-v1-minimum-scope.md`
- Phase 8 順序性テスト doctrine(Phase 3 で適用): `docs/development/pr-review-checklist.md` §2.11
- 既存の theme system(成功事例、color axis):`src/styles/base.css` の `:root` / `[data-pkc-theme="dark"]` / `[data-pkc-theme="scanline"]` block
- Doc archival(本 doc の lifecycle): `docs/development/doc-archival-discipline.md`
