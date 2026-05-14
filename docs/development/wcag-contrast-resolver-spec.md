# WCAG コントラスト探索 spec — Phase 3 PR-2T

**Status**: 設計確定(2026-05-12)
**実装 PR**: PR-2T
**user 要望**: 2026-05-10「書式指定した時、フォント色と背景色が著しく可読を損なう時がある、WCAG を算出して同系色で視認性を探索して欲しい。ただし、同じ文書内で同じ組み合わせの色の組み合わせなら、同じ見た目になるようにする。なお、Flags で設定通りの色とするか WCAG 探索をするかの設定変更ができるようにすること」

---

## 1. 問題

AI(ChatGPT / Claude / Gemini)が生成する markdown で `==[color]text==` / `:span:[…]{class=…}` / `<span style="color:…">` 等で色指定が入る。が、user 環境(dark mode / light mode / 高コントラスト設定)で **背景色 × 前景色のコントラストが 4.5:1(WCAG AA)に達しない** ケースがある。

特に発生しやすい組合せ:
- light mode で薄い黄色 hl(`==[#ffff99]…==`)+ 黒文字 → 一見問題ないが、light mode の `--c-bg=#fff` 由来の影響で実コントラスト 3.2:1
- dark mode で `==[blue]…==` + 黒文字(mark の default text color)→ コントラスト 1.5:1(ほぼ読めない)
- AI が `:span:[text]{class=warn}` で warn class を指定、warn は orange 系 → light mode で 2.8:1

ユーザー報告(2026-05-10):「書式指定した時、フォント色と背景色が著しく可読を損なう」

---

## 2. 設計

### 2.1 WCAG コントラスト算出

WCAG 2.1 §1.4.3 の式:

```
contrast = (L_lighter + 0.05) / (L_darker + 0.05)
```

ただし `L` は relative luminance(sRGB):

```ts
function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const sc = c / 255;
    return sc <= 0.03928 ? sc / 12.92 : Math.pow((sc + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(parseColor(fg));
  const l2 = relativeLuminance(parseColor(bg));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
```

**目標値**:
- AA(normal text)= 4.5:1
- AA(large text、18pt 以上 or 14pt bold)= 3:1
- AAA(normal)= 7:1(default は AA)

### 2.2 同系色 shift algorithm

`fg` を保ったまま `bg` を lighten/darken する(逆も可):

```ts
function shiftToContrast(
  fg: string,
  bg: string,
  targetRatio: number,  // default 4.5
): { fg: string; bg: string; applied: boolean }
```

algorithm:
1. 現在の contrast を計算
2. 目標未達なら、bg と fg の relative luminance を比較
3. luminance が低い方(= 暗い方)を `darken()` 関数で更に暗くする(HSL の L を 0 寄りに shift)
4. 逆に luminance 高い方を `lighten()` で更に明るくする
5. **deterministic**:同じ入力 → 同じ出力(hash / cache 不要、純関数)
6. AAA(7:1)未達でも、max iterations(20 step)で打ち切り、適用可能な最大コントラストを返す

HSL shift:

```ts
function darken(rgb: RGB, amount: number): RGB {
  const hsl = rgbToHsl(rgb);
  hsl.l = Math.max(0, hsl.l - amount);
  return hslToRgb(hsl);
}
```

### 2.3 同じ組合せ → 同じ見た目(deterministic memoization)

user direction「同じ文書内で同じ組み合わせの色の組み合わせなら、同じ見た目になる」を満たすため:

- algorithm が deterministic(同じ入力 → 同じ出力)であれば、メモ化不要で自然と満たす
- ただし perf 上、`Map<string, ShiftResult>` で memoize(`${fg}|${bg}|${target}` をキー)

### 2.4 適用 scope

WCAG resolver は **inline style に色指定が入っている要素のみ** に適用。CSS class 経由は CSS variable + computed style から取得して resolve。

具体的:
1. `<mark style="background-color: ...;">` — PR-2L で `==[color]text==` 由来
2. `<span style="background-color: ...; color: ...">` — PR-2L `:span:[text]{class=warn}` 由来
3. `<span class="warn">` 等 CSS class — `getComputedStyle()` で取得して resolve

renderer 側で post-process pass:

```ts
function applyWcagResolver(html: string, opts: { targetRatio: number }): string
```

DOM 内の inline color 持ち要素を走査、不足分を shift。

### 2.5 Flag

Tier 0 flag(`defineFlag`):

```ts
defineFlag('theme.wcag_auto_shift', 'boolean', true, {
  category: 'theme',
  desc: '色組み合わせが WCAG AA に満たない場合、同系色 shift で自動補正',
});

defineFlag('theme.wcag_target_ratio', 'number', 4.5, {
  category: 'theme',
  desc: 'WCAG コントラスト目標値(4.5=AA、7=AAA)',
  range: [3, 21],
});
```

- default ON(`true`):AA 自動達成
- OFF:user / AI 設定通り
- ratio は default 4.5(AA)、AAA を求めるなら 7 に上げる

URL 切替も `?pkc-flag=theme.wcag_auto_shift=false` で即時 toggle。

---

## 3. 実装規模

| ファイル | 内容 | 規模 |
|---------|-----|------|
| `src/features/theme/wcag-contrast.ts`(NEW) | algorithm(getContrastRatio / shiftToContrast / parseColor / rgbToHsl / hslToRgb)| ~200 行 |
| `src/features/markdown/markdown-render.ts` | postProcess pass で WCAG resolver 呼び出し | ~30 行追加 |
| `src/core/flags-registry.ts` | 2 flag 追加 | ~10 行 |
| tests | unit + smoke + visual parity | ~200 行 |

合計 ~500 行、bundle.js +~3 KB 想定。

---

## 4. visual parity test

`tests/smoke/wcag-contrast-resolver-parity.spec.ts`(NEW):

1. fixture:`==[#ffff99]Light text==` を light mode で render
2. flag OFF → 元の色そのまま、computed contrast 3.2 を assert
3. flag ON → shift 後、computed contrast ≥ 4.5 を assert
4. 同 fixture 2 回 render → 同じ shift 後 color を assert(deterministic)
5. dark mode で同じ fixture → 別の shift 結果(背景が dark なので fg を darken の代わりに lighten)
6. screenshot で visual evidence

---

## 5. 開放問題

| OQ | 内容 |
|----|-----|
| OQ-WCAG-1 | mermaid graph 内の色も対象にするか?(iframe sandbox なので別経路、currently no)|
| OQ-WCAG-2 | `html-render` fence iframe 内の色も対象?(同様 no、iframe scope 外)|
| OQ-WCAG-3 | AAA(7:1)を default にする option?(現状 AA 4.5 default、Flag で AAA 設定可能)|

---

## 6. 関連 doc

- Flags Protocol v1:`docs/spec/flags-protocol-v1-minimum-scope.md`
- PR-2L 寛容 parse(色指定が出てくる原因):`docs/spec/markdown-dialect-for-ai-authors-v2.md` §1.6
- 領域 9 CSS architecture audit(theme.scale 連動可能):`docs/development/css-architecture-audit-2026-05.md`
