# CSS / UI Debt Audit — 2026-04-25

## 1. Purpose / Status

**docs + minimal-fix** wave。PR #138(CSS budget headroom maintenance、94 → 96 KB / dedupe で headroom 2.94 KB 確保)以降の Color / Card / Import-Export 連続 wave で増えた UI class / tooltip / placeholder / filter chip 等の **小さな debt を棚卸し** し、安全に直せるものだけ最小修正する。Color Slice 5(theme / CVD)や Card widget UI に進む前の足場固め。

- **Status**: 着地。本 audit + 1 件の vocab fix(`guardrails.ts`)を 1 PR で landing。
- **触らない**: 機能追加 / 大規模 CSS 再設計 / visual redesign / Color Slice 5 / Card widget UI / clickable-image 実装 / Import / Export 挙動変更 / schema / version / About / CHANGELOG / budget 引き上げ。

参照:

- `./INDEX.md` #138(CSS budget headroom maintenance)/ #178(Card Slice 4)/ #179(Import-Export vocab cleanup)/ #180-#181(clickable-image audit + spec alignment)
- `src/styles/base.css`(6123 行、519 unique rule classes)
- `build/check-bundle-size.cjs`(現在の budget: bundle.css 96 KB / bundle.js 1536 KB)

## 2. 観点別 audit 結果

### 2.1 CSS 重複 / 未使用 class

**survey 方法**: `grep -oE "^\.pkc-[a-z0-9-]+" base.css | sort -u` → 519 unique rule class、各 class を `src/` / `tests/` / `build/` で literal grep。

**結果**:

| 候補 | 実態 |
|---|---|
| `.pkc-color-{red,orange,yellow,green,blue,purple,pink,gray}` 8 件 | grep では unused に見えるが **template literal `pkc-color-${entry.color_tag}`(`renderer.ts:2524`)で動的参照**、palette 8 ID と CSS 8 行(`base.css:978-985`)が完全一致 ━ false positive、削除しない |
| `.pkc-textlog-list` | base.css に **rule 定義なし**(L5051 のコメントブロックで「old flat `.pkc-textlog-list` を `.pkc-textlog-document` に置き換えた」と歴史記録のみ)━ CSS バイトを消費していない、コメントは migration 履歴として残置 |
| `.pkc-transclusion-broken` | 同上、L5653 のコメントで「Slice 2 で `.pkc-embed-blocked` に統一」と歴史記録のみ ━ 残置 |

**結論**: 削除候補ゼロ。Color の 8 hue × 1 行は Slice 4 で確定した最小定義、これ以上削れない。

### 2.2 selector 多重定義(false-positive 確認)

selector の prefix で `uniq -c | sort -rn` した結果、`.pkc-md-rendered`(49 回)/ `.pkc-textlog-text`(10 回)/ `.pkc-about-table`(8 回)等が上位だが、いずれも `:hover` / `:focus-visible` / `[data-pkc-X="..."]` 等の **状態違いで分岐した同 class への異なる rule** で、CSS としては正常パターン。重複削除の余地なし。

### 2.3 UI naming consistency

**vocabulary cleanup wave(PR #140、#179)後の取りこぼし**: `src/adapter/ui/guardrails.ts` の 2 件のユーザー向け warning text が **未だ "ZIP Package"** を使っていた:

```
L52: "ZIP Package export is recommended for large attachments."
L158: "ZIP Package export preserves files as raw binary..."
```

これは attachment soft-warning(1 MB 以上)と container-level zip recommendation で、**ユーザーに見える UI 文字列**。B-wave で UI / manual / 用語集を `Backup ZIP` 呼称に統一済みなので、ここも合わせるべき。

**修正**: 2 行とも `ZIP Package` → `Backup ZIP` に置換(`guardrails.ts:52` / `guardrails.ts:158`)。tests には影響なし(grep で確認、`ZIP Package` を pin する test なし)。

### 2.4 button title vs visible label / aria-label

renderer.ts の 121 件の `createElement('button')` を grep。Card placeholder(`role="link"`、`tabindex=0`)は visible text "@card" のみで `aria-label` 未指定 ━ 視覚的には @card という marker label として機能、screen reader で読まれる。ただし target を伴う情報量が無いため改善余地あり。**ただし backlog**(下記 §3.2)。

明らかな空 `aria-label` / 旧用語 `aria-label` は検出されず。

### 2.5 data-pkc-* contract

主要 `data-pkc-*` attribute(`data-pkc-action` / `data-pkc-card-target` / `data-pkc-color-tag` / `data-pkc-region` / 他)は spec(`pkc-link-unification-v0.md` §5.7.5、`card-embed-presentation-v0.md`)/ tests / src で一貫。orphan attribute(set-only never read)は本 audit の grep スパンでは検出されず ━ より深い verification は別 wave で。

### 2.6 a11y / focus-visible coverage

`base.css` 内の `:focus-visible` rule は 20 箇所。Card placeholder(`#139`)、TOC link、entry-tag-input、btn / btn-primary / btn-danger / btn-small、textlog-edit-btn、storage-profile-row-button 等の主要 interactive 要素に存在。明らかな抜けは検出されず。

## 3. 修正 / 非修正の振り分け

### 3.1 本 PR で修正した小 debt

| # | ファイル | 内容 | 影響 |
|---|---|---|---|
| 1 | `src/adapter/ui/guardrails.ts:52` | warning text `ZIP Package` → `Backup ZIP`(soft attachment warning) | user 向け文言の vocab 整合、tests 未 pin、bundle.js 微減 |
| 2 | `src/adapter/ui/guardrails.ts:158` | recommendation text `ZIP Package` → `Backup ZIP`(zipRecommendation) | 同上 |

### 3.2 本 PR では触らない backlog(将来 wave 候補)

- **Card placeholder の `aria-label` 追加**: 現在 visible text "@card" のみ。screen reader 体験向上のため `aria-label="Card link to ${target}"` 等を加える余地あり。Card widget UI(Slice 5+)で widget chrome と一緒に再設計するのが自然。
- **CSS comment 内の歴史 class 名整理**: `.pkc-textlog-list` / `.pkc-transclusion-broken` 等の「old X を Y に置き換えた」コメントは migration 経緯として有用、削除しない。重複しすぎたら別 wave で再評価。
- **`base.css` の 6123 行を機能別に分割**: 大規模再設計、本 wave のスコープ外。
- **data-pkc-* の orphan / unused attribute の網羅 audit**: 静的解析ベースの grep ではカバーしきれない、コードリーディングが必要。別 maintenance wave で。

## 4. 変更ファイル一覧

- `src/adapter/ui/guardrails.ts`(2 箇所の vocab fix)
- `docs/development/css-ui-debt-audit-2026-04-25.md`(NEW、本 audit)
- `docs/development/INDEX.md`(#182 + Last updated)
- `dist/bundle.{js,css}`(rebuild)
- `dist/pkc2.html`(rebuild)

## 5. CSS budget / size impact

- bundle.css: 不変見込み(touched なし)
- bundle.js: `ZIP Package` → `Backup ZIP` の 4 文字差 × 2 箇所 = +8 byte 程度の微増、誤差レベル
- `node build/check-bundle-size.cjs` の bundle.css / bundle.js OK 継続

## 6. Out of scope / Non-goals

- 新機能実装 / Color Slice 5 / Card widget UI / clickable-image 実装 / Import-Export 挙動変更
- schema / version / About / CHANGELOG
- budget 引き上げ(現状 96 KB headroom 2.94 KB を維持)
- 大規模 CSS 再設計 / visual redesign
- E. Color Slice 5 への着手

## 7. References

- `./INDEX.md` #138 / #178 / #179 / #180 / #181
- `src/styles/base.css`(6123 行、519 unique rule classes、`:focus-visible` 20 箇所)
- `src/adapter/ui/guardrails.ts`(soft warning + zipRecommendation)
- `src/features/color/color-palette.ts`(8 palette ID、CSS rule 8 行と一致)
- `build/check-bundle-size.cjs`(96 KB / 1536 KB budget)

---

**Status**: docs-first audit + 2 行の vocab fix(2026-04-25)。今後の Color Slice 5 / Card widget UI 着手前の小掃除として完了。次の audit は budget が再度逼迫した時、または別 wave で UI debt が新たに浮上した時に判断。
