# PR #195 — iPhone textarea/input zoom suppression

**Status**: implemented
**Date**: 2026-04-28
**Roadmap**: 領域 2(iPhone textarea zoom 抑制)— 順 1
**Predecessors**: docs PR #194 で計画

User direction:
> iPhoneでテキストエリア選択時などに拡大縮小されて、俯瞰性が崩れる。
> なんとかならないか?

## 1. 問題

iOS Safari は input / textarea をフォーカスしたとき、その要素の
**computed font-size が 16 px 未満**だと自動的にビューポートを zoom-in
して文字サイズを 16 px 以上に見せようとする。zoom した後はユーザーが
手で pinch-out しない限り元の倍率に戻らないため、以後の俯瞰性が
壊れる。

PKC2 の編集 UI は font-size を 0.7-0.9 rem (= 11-14 px) で揃えている
ため、iPhone でほぼ全ての編集面でこの zoom が発生していた。

## 2. 修正(改訂版 2026-04-28)

第 1 案(font-size 16 px のみ)が **イマイチ** とのフィードバックを
受けて、ユーザー方針として「**哲学優先で WCAG を一度無視する**」判断:

### a. viewport meta:`maximum-scale=1, user-scalable=no` を追加

`build/shell.html`(release-build の埋め込み HTML)+ `index.html`
(dev mode):

```html
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
```

これでフォーカス時の auto-zoom も、ユーザー手動の pinch-zoom も、
**両方** ブロックされる。俯瞰性の維持が最優先という判断。

### b. font-size 16 px ルール(belt-and-suspenders として残す)

`src/styles/base.css` の既存 `@media (pointer: coarse)` ブロックに
編集面の font-size 16 px 強制ルールを追加:

```css
@media (pointer: coarse) {
  ...
  textarea,
  input[type="text"],
  input[type="search"],
  input[type="email"],
  input[type="url"],
  input[type="tel"],
  input[type="password"],
  input[type="number"],
  input[type="date"],
  input[type="datetime-local"],
  input[type="time"],
  input[type="month"],
  input[type="week"],
  input:not([type]),
  [contenteditable="true"] {
    font-size: 16px;
  }
}
```

選択肢の検討:

| 案 | 採用 | 理由 |
|---|---|---|
| viewport meta `maximum-scale=1, user-scalable=no` | **○(改訂版)** | 俯瞰性最優先、ユーザー方針で WCAG を一旦無視 |
| input / textarea のみ font-size 16 px(touch時)| ○(belt-and-suspenders) | 副作用最小、desktop は不変。viewport meta が外された場合の保険 |
| 全 root font-size 引き上げ | × | 全 layout への波及大 |

`pointer: coarse` メディアクエリを使うことで:
- iPhone / iPad / Android touch:有効
- Desktop(マウス):従来 font-size 維持(編集面の文字サイズ感
  そのまま)

## 3. カバー範囲

- `textarea` 全般 — TEXT body editor、TEXTLOG append、todo description、
  textlog cell edit、saved-search filter 等
- `input[type=...]` 編集系 — search input、title input、palette filter、
  todo date、URL / email 系
- `input:not([type])` — type 属性なしの input(default は text 扱い)
- `[contenteditable="true"]` — 将来的な rich-text 編集面のため
- buttons / range / radio / checkbox は除外(zoom 発火しない)

## 4. 後方互換性

- desktop(`pointer: fine`)では完全に従来と同じ font-size
- iPhone / iPad の touch 操作で:
  - textarea のフォントは少し大きく見える(0.85 rem ≈ 13.6 px → 16 px)
  - 入力時の zoom が発生しない → 俯瞰性維持
- bundle.css: 104.43 KB → 104.50 KB (+0.07 KB)
- bundle.js 不変

## 5. テスト

- 5966 / 5966 unit pass(CSS のみ変更、ロジック影響なし)
- 11 / 11 smoke pass
- Playwright smoke は desktop chromium で動作確認のみ — iPhone 実機
  での zoom 抑制は WebKit / iOS でのみ発火するため smoke では検証
  できない

実機検証方針:
- iOS Safari で textarea / search input にタップ → 拡大が起きないこと
- ピンチズーム自体も無効化(viewport meta `user-scalable=no`)。
  accessibility より俯瞰性を優先するユーザー判断。リバートしたい時は
  viewport meta から `maximum-scale=1.0,user-scalable=no` を削れば
  font-size 16 px ルールが belt-and-suspenders として残る

## 6. roadmap 残り

`docs/development/feature-requests-2026-04-28-roadmap.md` の実装順:
- 順 1 ✓ iPhone textarea zoom 抑制(本 PR)
- 順 2: コピーボタン拡充(表 / コードブロック)
- 順 3: 戻る進む / Alt+←/→
- 順 4: .md / .txt → text/textlog 変換提案
- 順 5: 編集支援 indent / brackets / list
- 順 6: コマンドパレット scrollIntoView 修正
- 順 7-11: 残り領域

## 7. Files touched

- 修正: `src/styles/base.css`(`@media (pointer: coarse)` ブロックに
  編集面 font-size 16 px ルール追加、~25 行)
- 新規: `docs/development/iphone-zoom-suppress-pr195-findings.md` (this doc)
