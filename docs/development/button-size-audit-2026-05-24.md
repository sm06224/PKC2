# Button size & visual consistency audit(2026-05-24、pgc-169)

**Status**:audit doc(docs-only、actions は後続 PR)
**Purpose**:user 指摘(2026-05-24)「**ボタンサイズがバラバラ**」 への対応
step 1。PKC2 shell 内の button class 群を inventory + 各 class の高さ /
padding / font-size を整理、**共通 base + variant override** で size 揃え
を実現する設計案を提示。

---

## §1 button class inventory(`pkc-btn-*` family)

### §1.1 base class

| class | 用途 | 現状 size |
|---|---|---|
| `.pkc-btn` | 全 button の base | padding `var(--space-1-5) var(--space-2-5)` + font-size `var(--fs-sm)` |

### §1.2 variant class(全 9 件)

| class | 用途 | 現状 size override | 一貫性 |
|---|---|---|---|
| `.pkc-btn-primary` | primary action(Save 等) | base 継承(明示 override 無し)| ✓ |
| `.pkc-btn-danger` | delete / 危険 action | base + padding override なし、色だけ変更 | ✓ |
| `.pkc-btn-clear` | テキストのみ(transparent border)| 軽量 visual | ✓ |
| `.pkc-btn-small` | コンパクト button | padding `var(--space-1) var(--space-2)` + font-size `var(--fs-xs)`(-1 size)| 意図的小 |
| `.pkc-btn-create` | header `+ Text` / `+ Log` 等 archetype create | base + 専用色 | ✓ |
| `.pkc-btn-new` | header `+ New` picker(pgc-99)| base + font-weight 600 | ✓ |
| `.pkc-btn-toggle-sync` | Split View source/preview sync toggle | base + opacity state | ✓ |

base + variant は **大半 OK**。

---

## §2 non-`.pkc-btn` family button(user 指摘の対象)

`.pkc-btn` を継承しない、独立 sizing の button が **20+ 件** 散在。
ここが user 体感「**ボタンサイズバラバラ**」 の主因。

| class | 用途 | padding | font-size | min-h | 統一案 |
|---|---|---|---|---|---|
| `.pkc-header-nav-btn` | header back/forward | inline css | base | 24px(pgc-160 で追加) | `.pkc-btn-icon` 派生 |
| `.pkc-header-path-nav-btn` | breadcrumb back/forward | `var(--space-0-5) var(--space-1-5)` | base | 24px(pgc-160) | 同上 |
| `.pkc-view-mode-btn` | view-mode tab(6 件) | `var(--space-1-5) var(--space-2-5)` | base | min-width 4rem(pgc-161) | tab 系専用、別 category |
| `.pkc-meta-inspector-tab` | Inspector tab(5 件) | 小 padding | sm | 〜 | 同 tab 系 |
| `.pkc-activity-bar-tab` | Activity Bar tab(6 件) | square icon button | 大 icon | 36-44px square | tab 系専用 |
| `.pkc-format-toolbar-btn` | format panel button(~40 件) | 小 padding | xs/sm | 〜 | toolbar 系専用 |
| `.pkc-shell-menu-link` | shell menu 内 link | padding +sm | base | 〜 | link 系 |
| `.pkc-textlog-importance-toggle` | textlog ⭐ toggle(pgc-157/163)| `var(--space-1) var(--space-2)` | xs | label flex | switch 系(toggle UI) |
| `.pkc-inspector-ai-dismiss` | Inspector dismiss button(pgc-147+)| 小 padding | xs | 〜 | dismiss 系 |
| `.pkc-todo-status` | todo status checkbox button | 〜 | 〜 | 〜 | checkbox 系 |
| `.pkc-new-picker-row` | `+ New` popover row | full width | base | 〜 | popover item 系 |
| その他 ~10 件 | 各 archetype の inline button | 各々 | 各々 | 〜 | 個別 |

---

## §3 統一案:5 size category + base helper

ボタンを **意味別 5 category** に分け、各 category の base CSS で size 統一:

| category | 用途 | 推奨 min-height | font-size | padding | 代表 class |
|---|---|---|---|---|---|
| **action**(主要 button)| Save / Cancel / Export 等の 1 click action | 32px | `--fs-sm` | `--space-1-5 --space-2-5` | `.pkc-btn`(既存)|
| **icon**(icon-only button)| header nav / toolbar icon | 24px | `--fs-base` | `--space-0-5 --space-1-5` | `.pkc-header-path-nav-btn`(pgc-160)|
| **tab**(tab strip 内 tab)| view-mode / Inspector / Activity tab | 32px | `--fs-base` | `--space-1 --space-2` + min-width | `.pkc-view-mode-btn`(pgc-161)|
| **toggle**(switch UI)| importance / theme / flag toggle | 24px(label height)| `--fs-xs` | `--space-1 --space-2` + checkbox 14px | `.pkc-textlog-importance-toggle`(pgc-163)|
| **dismiss**(secondary action)| Inspector dismiss / placeholder hint button | 22px | `--fs-xs` | `--space-0-5 --space-1-5` | `.pkc-inspector-ai-dismiss` |

### §3.1 base helper class 導入案

```css
/* 共通 base(全 button 系で継承)*/
.pkc-button-base {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-family: var(--font-base);
  white-space: nowrap;
  transition: background 80ms ease-out, color 80ms ease-out, border-color 80ms ease-out;
}
.pkc-button-base:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 1px;
}
.pkc-button-base:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* size category */
.pkc-button-size-action { min-height: 32px; font-size: var(--fs-sm); padding: var(--space-1-5) var(--space-2-5); }
.pkc-button-size-icon { min-height: 24px; font-size: var(--fs-base); padding: var(--space-0-5) var(--space-1-5); min-width: 28px; }
.pkc-button-size-tab { min-height: 32px; font-size: var(--fs-base); padding: var(--space-1) var(--space-2); min-width: 4rem; }
.pkc-button-size-toggle { min-height: 24px; font-size: var(--fs-xs); padding: var(--space-1) var(--space-2); }
.pkc-button-size-dismiss { min-height: 22px; font-size: var(--fs-xs); padding: var(--space-0-5) var(--space-1-5); }
```

各 button class は `pkc-button-base pkc-button-size-<category>` を追加して
size を継承、独自 visual(色 / icon)だけ override する form に整理。

---

## §4 migration plan(段階導入、6+ PR)

| step | 内容 | scope | 状況 |
|---|---|---|---|
| 1 | `pkc-button-base` + 5 size category CSS を base.css に追加 | scope 小、既存 CSS 不変 | **pgc-171 着地** ✅ |
| 2 | header nav(`.pkc-header-nav-btn` / `.pkc-header-path-nav-btn`)を `pkc-button-base pkc-button-size-icon` に migration | scope 小 | **pgc-171 着地**(step 1+2 結合) ✅ |
| 3 | view-mode / Inspector / Activity tab を `pkc-button-size-tab` に migration | scope 中 | **pgc-172 着地**(view-mode + Inspector のみ。Activity Bar は square icon button で別 category 必要、後続) ✅ partial |
| 4 | format toolbar 全 button を `pkc-button-size-toggle` or 専用 size に migration | scope 大 | TODO(後続 PR、format toolbar が `pkc-format-toolbar-btn` で ~40 件、変更影響大)|
| 5 | Inspector dismiss / placeholder hint button を `pkc-button-size-dismiss` に | scope 小 | **pgc-173 着地**(Inspector Hints 8 dismiss button) ✅ |
| 6 | 既存 `.pkc-btn` 系の inline override を削除、`pkc-button-size-action` 継承に統一 | scope 中 | TODO ── `.pkc-btn` 実 padding は `space-3`(audit `space-2-5` と微妙差)、`.pkc-button-size-action` を `.pkc-btn` 実態に合わせて 修正 → adopt が前提 |

各 step は **Tier 0 flag 不要**(visual のみ、機能変化なし)、ただし
**visual regression test(Playwright)** を各 step で 1 件追加推奨。

### §4.1 step 3 で先送りした「Activity Bar square icon button」

Activity Bar tab は **square icon button**(36-44px × 36-44px、icon-only)で
horizontal text tab(min-width 4rem)とは別 size 必要。新 category
`pkc-button-size-square-tab`(36px × 36px、min-width = min-height)を
audit §3.1 に **追加して step 3-bis** として後続 PR で着地。

### §4.2 step 6 で発覚した audit と実態の差

`.pkc-btn` の現状実装:
```css
.pkc-btn { padding: var(--space-1-5) var(--space-3); font-size: var(--fs-base); ... }
```

audit §3.1 で定義した `pkc-button-size-action`:
```css
.pkc-button-size-action { min-height: 32px; font-size: var(--fs-sm); padding: var(--space-1-5) var(--space-2-5); }
```

**padding が `space-3` vs `space-2-5`**、**font-size が `base` vs `sm`** で微妙差。
step 6 で `.pkc-btn` を `pkc-button-size-action` に統一する場合、**audit 値を
`.pkc-btn` 実態に合わせるべき**(visual baseline 保証のため)。または、両者の
trade-off を user 確認後に決定。本 step 6 は **user 確認待ち**。

---

## §5 次 step

1. **user 確認**:本 audit doc を user に共有、5 category 分類 + base helper
   方針への同意取得
2. user 承認後、step 1 の base CSS を別 PR(`pgc-X-button-base-helper`)
   で追加
3. step 2〜6 を順次 stack
4. 全 step 完了後、本 doc を `archived/` に移動(doc-archival-discipline)

---

## §6 history

| date | event |
|---|---|
| 2026-05-24 | 本 doc 起こし(pgc-169、handoff user bug #4「ボタンサイズバラバラ」 step 1)|
| 2026-05-24 | **step 1+2 着地**(pgc-171):`pkc-button-base` + 5 size category 導入 + header nav 4 件 adopt |
| 2026-05-24 | **step 3 partial 着地**(pgc-172):view-mode tab 6 件 + Inspector tab 5 件 adopt(Activity Bar square icon は step 3-bis に分離)|
| 2026-05-24 | **step 5 着地**(pgc-173):Inspector Hints 8 dismiss button adopt |
| 2026-05-24 | 本 doc 4-rounds-1 update(pgc-174):step 1/2/3 partial/5 着地反映 + step 3-bis(square icon)分離 + step 6 user 確認事項(audit vs `.pkc-btn` 実態差)明文化 |
