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
  - bundle.css raw 113.26 → 116.08 KB(+2.82 KB、binary 1024)/ gzip 17.74 → 17.96 KB(+0.22 KB)。実測 +2884 bytes は予測値(`var(--space-X)` 14 chars - `0.5rem` 6 chars = +8 chars × 306 occurrence + `--space-*` 8 行宣言 ~440 bytes ≈ +2.88 KB)とほぼ一致。重複削減は Phase 2(overlay base + button utility-first)で吸収予定
  - 旧 `tests/styles/textlog-viewer.test.ts` の 2 件 hardcoded match を `var(--space-3)` に追従
  - `0.35rem` (75) / `0.4rem` (69) / `0.3rem` (52) / `0.2rem` (41) / `0.15rem` (41) などの outlier は scale に乗らない → Phase 1a-tail で別 PR にて round + clean-up
- **Phase 1a-tail ✅(2026-05-04 着地、PR #243、stacked on #242)**:half-step token 2 つを追加して outlier 5 値を migrate:
  - **新規 token**:`--space-1-5: 0.1875rem` (3px) / `--space-2-5: 0.375rem` (6px)
  - `0.15rem` → `var(--space-1-5)`(2.4 → 3px、+0.6px)
  - `0.2rem` → `var(--space-1-5)`(3.2 → 3px、-0.2px)
  - `0.3rem` → `var(--space-2-5)`(4.8 → 6px、+1.2px、最大 shift)
  - `0.35rem` → `var(--space-2-5)`(5.6 → 6px、+0.4px)
  - `0.4rem` → `var(--space-2-5)`(6.4 → 6px、-0.4px)
  - 計 272 occurrence migrate(255 行 Python script + 1 multi-property single-line manual = 256 行変更)
  - 残 6 occurrence は font-size: 0.35rem 等の非 spacing context、token 化対象外で正常
  - bundle.css raw 116.08 → 118.98 KB(+2.91 KB、binary 1024)、累計 main からは +5.72 KB
  - **budget headroom 警告**:bundle.css 99.2% / 120 KB、Phase 1b(font-size scale ~+1.9 KB 想定)を入れる前に **Phase 2(overlay base + button utility-first)で重複削減** して budget 回復が必要
- **Phase 1b ✅(2026-05-04 着地、PR #248)**:font-size scale 軸導入。
  - **9-token scale**:`--fs-{2xs, xs, sm, base, md, lg, xl, 2xl, 3xl}` を `:root` 宣言、0.6rem〜1rem 範囲をカバー
  - **短 prefix `--fs-*`** を採用(audit 当初の `--font-size-*` から budget 制約で変更):`var(--fs-base)` 14 chars vs `0.75rem` 7 chars
  - **安全な regex** で migrate(Phase 1a の word-boundary bug reflection):`font-size:\s*VALUE\s*[;}!]` anchor で value boundary 厳密化、partial match 不能
  - 計 **265 occurrence migrate** — 0.6rem(21)/ 0.65rem(29)/ 0.7rem(53)/ 0.75rem(45)/ 0.8rem(42)/ 0.85rem(40)/ 0.9rem(14)/ 0.95rem(14)/ 1rem(7)
  - bundle.css 119,861 → 121,857 bytes(**+1,996 bytes / +1.95 KB**、binary 117.05 → 119.00 KB / 120 KB、97.5% → 99.2%)
  - **累計 main 起点 +5.74 KB**(token 化総和 vs dedup)。Phase 1c は軽量、Phase 3 は CSS var pipeline で同等 byte 維持予定
  - `tests/styles/textlog-viewer.test.ts` の 1 件 hardcoded `0.95rem` matcher を `var(--fs-2xl)` に追従、`src/adapter/ui/entry-window.ts` の inline font-size は別 string で migrate scope 外、test 不変
  - unit 6259 / 6259、smoke 39 / 39 pass
- **Phase 1c ✅(2026-05-04 着地、PR #249)**:radius scale 拡張 3 → 5 token。
  - **新規 token**:`--radius-md: 3px` / `--radius-pill: 999px` / `--radius-circle: 50%`
  - 既存 `--radius-sm/--radius/--radius-lg` は不変
  - **安全な regex** で migrate(Phase 1a の word-boundary bug reflection、Phase 1b と同 anchor pattern):`border-radius:\s*VALUE\s*[;}!]`
  - 計 **11 occurrence migrate** — 3px (3) → `var(--radius-md)`、999px (1) → `var(--radius-pill)`、50% (7) → `var(--radius-circle)`
  - bundle.css 121,857 → 122,087 bytes(**+230 bytes / +0.22 KB**、binary 119.00 → 119.23 KB / 120 KB、99.2% → 99.4%)
  - **outlier inline 値** 5px (1) / 6px (1) / 8px (2) / 12px (1) は本 PR では touch せず、将来 PR で `--radius-xl` の検討余地として残置(計 5 sites)
  - **累計 main 起点 +5.96 KB**
  - unit 6259 / 6259、smoke 39 / 39 pass、visual regression なし

各 sub-PR の test plan:
- Visual regression(main / dark / scanline 3 theme で screenshot 比較、Playwright)
- Phase 8 順序性テスト:scale flag を runtime edit → 全 spacing が同期して変わる(後述 Phase 3 で実装)

### Phase 2 — Pattern abstraction(2 PR)

- **Phase 2a ✅(2026-05-04 着地、PR #244)**:overlay backdrop + panel pattern を 2 family に分離して dedup:
  - **Family A**(accent panel + hostile blur backdrop):shell menu / shortcut help / storage profile / flags inspector — 4 panel が `bg/border/radius/glow shadow` の同じ 4 declaration を持っていたものを 1 selector list に hoist。3 overlay (shell-menu / shortcut / storage-profile) の hostile backdrop (`rgba(0,0,0,.6) + blur(2px)`) も同様に hoist
  - **Family B**(neutral panel + light backdrop):textlog-preview / text-to-textlog / text-replace — 3 panel が 9 declaration をフルコピーしていたものを 1 selector list に hoist。light backdrop も別 list で dedup
  - 7 overlay の共通 5 declaration(`position: fixed; inset: 0; display: flex; align-items: center; justify-content: center`)を 1 selector list に hoist
  - 各 per-class rule は z-index / max-width / max-height / padding 等の固有部分のみに縮小
  - bundle.css 121838 → 120794 bytes(**-1044 bytes / -1.02 KB raw**、binary 118.98 → 117.96 KB / 120 KB(99.2% → 98.3%、headroom +1 KB 回復))
  - **net positive**:Phase 1a + 1a-tail + 2a 累計で +5.72 - 1.02 = +4.7 KB(token 化の overhead が dedup で部分的に吸収)。Phase 2b(button utility-first)で更に削減予定
  - unit 6259 / 6259、smoke 39 / 39 pass、visual regression なし(theme switching / flags inspector / iPhone shell すべて green)
- **Phase 2b ✅(2026-05-04 着地、PR #246)**:`.pkc-btn` family を utility-first に再構成。
  - **共通 chrome**(border / radius / bg / color / cursor / font-family / base transition)を `.pkc-btn, .pkc-btn-small` selector list に hoist
  - **default-size のみの property**(padding / font-size / white-space / border-color transition)は `.pkc-btn` に分離
  - **shared interaction**(`:hover` / `:focus-visible`)を共通 selector list に hoist
  - **semantic variants**(`.pkc-btn-primary` / `.pkc-btn-danger`)を「diff のみ」rule に縮小:primary は border / bg / color / font-weight / shadow / transition、danger は border-color / color のみ + hover の fill 動作 + focus-visible の color override
  - **`.pkc-btn-clear`** は icon-style で family と意味的に異なるため独立 block 維持(別箇所に重複していた rule を統合 → 1 箇所のみに)
  - bundle.css 120,766 → 119,861 bytes(**-905 bytes / -0.88 KB**)、binary 117.94 → 117.05 KB(98.3% → 97.5%、headroom +1 KB 回復)
  - `tests/styles/overlay-focus-visible.test.ts` の 2 件 regex を「selector list 内」「shorthand or longhand color override」も許容するよう更新(visual contract 不変、形式柔軟化)
  - unit 6259 / 6259、smoke 39 / 39 pass

### Phase 3 — Runtime adaptive axes(2 PR)

- **Phase 3a ✅(2026-05-04 着地、PR #250)**:scale flag → CSS var multiplier pipeline。
  - **新規 flag**:`theme.scale`(Tier 0、range 0.5〜2.0、default 1.0、category ui)
  - **新規 module**:`src/adapter/ui/theme-scale.ts` — defineFlag + `applyThemeScale()` function
  - **CSS pipeline**:`:root { font-size: calc(16px * var(--theme-scale, 1)) }` を base.css 先頭に追加。`var()` の fallback `1` で JS init 前の resting state も保証
  - **wiring**:(1) renderer.ts `applySystemSettings` で applyThemeScale を呼出(全 render path)、(2) main.ts FLAGS_CHANGED handler に追加(setContainerFlagSource の直後で priming race を回避)、(3) main.ts boot path の setContainerFlagSource 直後にも追加(初回 render の one-frame flash 防止)
  - **影響範囲**:rem-based 全 token(`--space-*` / `--fs-*` 計 21 token)が連動 scale。radius scale (px-based) は対象外、Phase 3b で別 flag (`theme.radius_scale`) 検討
  - **Phase 8 順序性 parity test**:`tests/smoke/theme-scale-parity.spec.ts`(NEW)で end-to-end 確認 — inspector で theme.scale=1.5 編集 → root font-size 16px → 24px、panel padding 16px → 24px、reset で 16px に snap back
  - **inspector parity test 更新**:flag count 20 → 21、numeric flag bulk-edit test に「halve 結果が currentVal と同じなら +1」fallback 追加(theme.scale default=1.0 で halving が no-op になる edge case)
  - bundle.css 122,087 → 122,138 bytes(+51 bytes)、bundle.js +0.4 KB(theme-scale.ts module)、計 ~+0.45 KB
  - **累計 main 起点 +6.41 KB**
  - unit 6259 / 6259、smoke 40 / 40 pass

- **Phase 3b ✅(2026-05-04 着地、PR #251)**:device-class adaptive media query で `--theme-scale-default` を override。
  - **2 層 cascade 設計**:`--theme-scale-default`(device-class、media query で設定)+ `--theme-scale`(user override、JS で設定)。`:root { font-size: calc(16px * var(--theme-scale, var(--theme-scale-default, 1))) }` で fallback chain
  - **device class breakpoints**:`pointer:coarse and max-width:640px` → 0.9(mobile)、`pointer:coarse and 641px-1024px` → 0.95(tablet)、それ以外 → 1.0(desktop)
  - **applyThemeScale 改修**:flag source = `default` (1.0、URL/Container 上書きなし) なら `--theme-scale` を removeProperty して device default に委譲。source が `url` / `container` なら setProperty で user override を効かせる。`getRegisteredFlags()` から source を取得して分岐
  - **invariant**:explicit user input は device default に勝つ。mobile 端末で user が `theme.scale=1.0` を明示設定すると、device default 0.9 を上書きして 1.0 になる(opt-out 経路)
  - **Phase 8 順序性 parity test 拡張**:`tests/smoke/theme-scale-parity.spec.ts` に test 2 件目を追加 — mobile viewport (375×812 + pointer:coarse) で baseline `--theme-scale-default=0.9 / root=14.4px` を確認、explicit `theme.scale=1.0` edit 後に root=16px(device default 0.9 を override)を確認
  - bundle.css 122,138 → 122,368 bytes(+230 bytes)、media query 2 ブロック分
  - **累計 main 起点 +6.66 KB**(bundle.js 含む)
  - unit 6259 / 6259、smoke 41 / 41 pass

### Phase 4 — Per-archetype palette(⏸ deferred、2026-05-05 user 議論で寝かせ判定)

**Status**: deferred(将来 use case が出現した時に再 open)
**Decision date**: 2026-05-05
**Decision context**:user 確認で「**Phase 4 の use case は私が拡大解釈したもの**」と認定。元 user direction 「**実行時にデータタイプや画面タイプに合わせて自動生成**」は概念として「データタイプ」軸を含むものの、具体的な意味は user が定義しておらず、私(Claude)が「archetype ごとの palette 切替 via `insertRule`」と勝手に具体化した経緯。Phase 1+2+3 で user 要望は実質充足、Phase 4 は YAGNI と判断して寝かせる方針確定。

#### 当初構想(参考、再 open 時の起点)

定型 chip / badge を `[data-archetype="X"]` 単位で背景色軸を切り替えるなど。`document.styleSheets[0].insertRule` 経路の試金石(audit §5.1 経路 B)。

```ts
// 例:archetype 別 chip 背景を runtime に切替(参考実装、未実装)
function applyArchetypePalette(palette: Record<ArchetypeId, string>): void {
  const sheet = document.styleSheets[0];
  for (const [archetype, bg] of Object.entries(palette)) {
    sheet.insertRule(
      `.pkc-archetype-badge[data-pkc-archetype="${archetype}"] { background: ${bg}; }`,
      sheet.cssRules.length,
    );
  }
}
```

#### Use case 例(再 open trigger)

以下のいずれかの **具体要件が user から提示された場合**、本 Phase を再 open する:

1. **container ごとに独立 palette を持たせて export 同伴で共有したい**
   - 例:Container A は「terminal green」、Container B は「sepia warm」など、複数の theme を文書ごとに保持
   - 既存 `--c-accent` の単純切替では足りず、archetype 単位の selector 構造を差し替えたい場合
2. **PKC-extension(将来構想、領域 10-5)から palette を programmatic 注入したい**
   - extension が Word / PPT export 時に「target アプリの palette」を JS API 経由で push、PKC2 内 view も同期させる
3. **archetype ごとに selector 構造そのものを差し替えたい**
   - 例:`textlog` archetype だけ「margin / border-radius / shadow が default と異なる layout」を runtime 適用
   - CSS variable では表現困難な struct-level の差分を扱う場合
4. **user / device 単位で複数 theme を並走させたい**
   - 例:work / personal で異なる palette、accessibility profile(高コントラスト / 色覚多様性対応)で別 palette
5. **spec として palette を export / import したい**
   - 「palette spec doc を 1 ファイルとして書き出して、別 PKC instance に import」のような workflow

これらが具体化されたら、本 audit doc を再 open し、Phase 4 を spec audit から起こす(YAGNI 原則:具体要件なしには着手しない)。

#### 寝かせる理由(2026-05-05 確定)

1. **元 user direction の主旨は Phase 1+2+3 で充足済み**(token / dedup / runtime adaptive すべて完了)
2. **「データタイプに合わせて自動生成」の具体定義が未定義** → 必要性証明が先、実装は後
3. **既存 `--pkc-color-tag-*`(8 colors × 4 modulation)+ `--c-*` semantic tokens** で archetype-specific 色変更は 80% カバー可能。残 20% は use case 出現次第で `--pkc-archetype-{X}-bg` 等の追加 CSS variable で対応可
4. **`insertRule` 経路の複雑度 vs ROI が悪い**:
   - source の grep 可能性低下(rule が JS 内に存在)
   - theme switching との cascade priority 整理が必要
   - test contract(`tests/styles/*.test.ts` の base.css grep)が壊れる
   - bundle 影響 + Phase 8 順序性 parity test の追加実装

#### 再 open 時の参照点

- 本 audit doc §5.1 経路 B + §6 Phase 4(本節)
- `tests/smoke/theme-scale-parity.spec.ts` の Phase 8 parity 構造を踏襲
- `docs/planning/USER_REQUEST_LEDGER.md` §3.6 deferred items 表(2026-05-05 追加予定)

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

## 9.5 Lessons learned(2026-05-05 wave 完了後追記)

CSS wave 9 で 2 件の hotfix(PR #245 / #252)を要した。今後の CSS migration / dedup 作業で同じ落とし穴を避けるため、教訓を本 doc に固定する。

### 9.5.1 CSS migration regex は **value boundary** を厳密に anchor する

**事象**(PR #245):Phase 1a の Python migration script が `\b1rem\b` regex を使い、`0.1rem` 中の `1rem` 部分にもマッチして `0.var(--space-5)` という invalid CSS を 28 sites 生成。Browser は invalid declaration を silent ignore するため、smoke / unit が click landing しか見ていなかった結果、padding が消失した button が live で 24 時間以上残存。

**root cause**:`\b` は word/non-word boundary に基づく。CSS value `0.1rem` は `0`(word)→ `.`(non-word)→ `1`(word)で `.` の前後に `\b` が立つため、`\b1rem\b` が `1rem` 部分にヒット。

**教訓** — CSS value migration の regex は以下を **構造的に** 担保する:

```python
# 不可:word boundary だけでは partial substring が match
re.compile(r'\b1rem\b')

# 可:declaration LHS を anchor + value を RHS 全体として要求
re.compile(
  r'(font-size:\s*)(VALUE_ALT)(\s*(?:;|!important|\}|$))',
  re.MULTILINE,
)
```

key は:
1. **start anchor**:property name(`font-size:`、`border-radius:`、`padding:` 等)を必須前置
2. **value alternation**:置換対象 value を完全列挙(部分マッチ阻止)
3. **end anchor**:`;` / `!important` / `}` / 行末を後続 lookbehind / 隣接マッチで強制 → value が「declaration の RHS 全体」であることを保証

Phase 1b(font-size)/ Phase 1c(radius)はこの pattern を踏襲して 0 incident。Phase 1a(spacing)は本 pattern 確立前で被害発生 → 本書の固定教訓化。

### 9.5.2 variant rule を「diff-only」に縮小する時は **JS 側 standalone usage を全件 audit** する

**事象**(PR #252):Phase 2b で `.pkc-btn-danger` を「diff のみ」(border-color + color)に縮小 → `class="pkc-btn pkc-btn-danger"` 形式の併用前提化したが、`renderer.ts` の **2 sites**(delete-entry button / import confirm button)が **standalone** で `class="pkc-btn-danger"` だけを emit していたため、padding / font-size declaration を失って UA default まで collapse(user 報告:「Delete だけ小さくなる」)。

**root cause**:CSS dedup は variant rule から「base に既にある property」を削るが、JS 側の class 生成 site が base class を併用しているとは限らない。`.pkc-btn-primary` は完全に `'pkc-btn pkc-btn-primary'` の形で使われていたため問題なかったが、`.pkc-btn-danger` は混在していた。

**教訓** — variant rule を縮小する PR では:

1. **`grep -rEh "createElement\('button',\s*'pkc-btn-(VARIANT)" src/`** を全 variant に対し実行
2. standalone(`pkc-btn-VARIANT` 単独)usage を全件列挙
3. いずれかが standalone なら以下のいずれかで対応:
   - (a) JS 側を `'pkc-btn pkc-btn-VARIANT'` に統一(canonical utility-first pattern)
   - (b) variant rule に必要な base property を残置(dedup を諦める)
   - (c) variant を selector list `.pkc-btn, .pkc-btn-VARIANT` に追加して base 側で chrome を share
4. PR description に「standalone usage audit 結果」を必ず記載

smoke が click landing しか見ない構造のため、こうした visual collapse は automated test で検知されにくい。**Phase 8 順序性 doctrine の拡張案**:variant 縮小 PR では「button size の computed pixel が UA default を超えて feature-aware の値を持つ」を Playwright で assert する parity test を追加する余地あり(future enhancement)。

### 9.5.3 単一 PR で「token 導入 + dedup」を混ぜない

Phase 1(token introduction)は **bundle 増**、Phase 2(dedup)は **bundle 減**。両者を同 PR でやると net delta が混乱して headroom 議論が困難になる(実際 Phase 1a-tail で headroom が 1 KB 切る寸前まで肥大化した経験あり)。**1 PR = 単一の delta 方向** を原則とするのが今後の wave 設計の指針。

---

## 10. 関連 doc

- 起点 user direction: `feature-requests-2026-04-28-roadmap.md` §領域 9
- Flags wave(prerequisite): `docs/development/const-discipline-2026-05.md` / `docs/spec/flags-protocol-v1-minimum-scope.md`
- Phase 8 順序性テスト doctrine(Phase 3 で適用): `docs/development/pr-review-checklist.md` §2.11
- 既存の theme system(成功事例、color axis):`src/styles/base.css` の `:root` / `[data-pkc-theme="dark"]` / `[data-pkc-theme="scanline"]` block
- Doc archival(本 doc の lifecycle): `docs/development/doc-archival-discipline.md`
