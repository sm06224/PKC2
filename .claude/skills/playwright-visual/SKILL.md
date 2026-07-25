---
name: playwright-visual
description: >
  PKC2 の Playwright ベース視覚テストを 2 モードで回すワークフロー。
  (A)「user に見せる」デモ = 実操作の見た目スクショを撮って SendUserFile で提示、
  (B)「Claude が確認する」検証 = elementFromPoint + 実 OS event で assert する parity。
  「動いてるか見せて」「スクショで見せて」「デモを撮って」「視覚確認して」「実機で
  触って見せて」という文脈で使う。ブラウザバージョンのズレ(playwright bump で
  要求 chromium が変わる / playwright install が proxy 403)で落ちないよう、
  実バイナリを解決してから実行する環境整備込み。既存の visual-parity skill
  (parity の書き方・seed パターン・落とし穴)と併用する。
---

# PKC2 Playwright 視覚テスト(demo / verify 2 モード)

視覚テストには目的の違う 2 モードがある。両方 Playwright + 実ブラウザだが、
**成果物が違う**:

| モード | 目的 | 成果物 | 置き場所 |
|---|---|---|---|
| **A. demo(見せる)** | user に「動いてる状態」を見せる | スクショ → SendUserFile | `tests/smoke/_demo/*.spec.ts` |
| **B. verify(確かめる)** | Claude が回帰を検出する | assert(pass/fail)+ 証跡 png | `tests/smoke/*-parity.spec.ts` |

verify の書き方・seed・落とし穴は **`visual-parity` skill が正本**。本 skill は
「2 モードの回し方」と「**ブラウザ環境をズレさせない**」を扱う。

## 0. まず環境を固める(バージョンズレ対策)

Playwright は自身のバージョンに紐付いた chromium ビルド番号
(`chromium-NNNN`)を要求する。`@playwright/test` を bump するとこの番号が
変わり、この開発環境では `playwright install` が proxy 403 で失敗するため、
**要求ビルドが未インストールだと起動不能**になる。

対策 = **Playwright のバージョン紐付き解決を使わず、実在バイナリを直接
`executablePath` に渡す**。resolver がそれを 1 行で用意する:

```bash
# 実バイナリを解決して PKC_PRE_INSTALLED_CHROMIUM / SKIP_DOWNLOAD を export
eval "$(node scripts/resolve-pw-chromium.cjs --export)"
echo "$PKC_PRE_INSTALLED_CHROMIUM"   # 例: /opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

`resolve-pw-chromium.cjs` の優先順位:
1. 既存 `PKC_PRE_INSTALLED_CHROMIUM`(明示指定)
2. `/opt/pw-browsers/chromium`(この環境の安定シンボリックリンク)
3. `PLAYWRIGHT_BROWSERS_PATH` 配下で**最も新しい** `chromium-NNNN`
4. どれも無ければ空(config は env 無しで Playwright 既定に落ちる)

demo / verify の config はどちらも `PKC_PRE_INSTALLED_CHROMIUM` を
`launchOptions.executablePath` に張るので、**先に export しておけば version が
ズレても実在バイナリで起動する**。`playwright install` は絶対に叩かない
(proxy 403、かつ不要)。CDP protocol は多少の版差なら互換なので、
click / type / screenshot / elementFromPoint は動く。

> bump 後に「Executable doesn't exist at …chromium-<新番号>…」が出たら、
> それは version 紐付き解決に落ちている合図。`eval "$(… --export)"` を
> 実行し忘れているか、resolver が拾えていない。`node
> scripts/resolve-pw-chromium.cjs`(パス出力)で実在を確認する。

## A. demo モード(user に見せる)

### 手順

1. **src を変えたら必ず build**(demo も dist を serve する):
   `npm run build`(または `build:bundle && build:release`)
2. デモ spec を `tests/smoke/_demo/<feature>-demo.spec.ts` に置く
   (testDir を `_demo` に絞った専用 config で、通常 smoke と混ざらない)
3. 実行:
   ```bash
   eval "$(node scripts/resolve-pw-chromium.cjs --export)"
   npx playwright test --config=tests/smoke/playwright.demo.config.ts
   # npm script でも可: npm run test:demo
   ```
4. スクショは `test-results/demo/<n>-<label>.png` に出す
5. **Claude 自身が Read で全部検品してから** SendUserFile で提示
   (`display: "render"`、実操作の証跡だと分かる caption を付ける)

### demo spec の骨格

```ts
import { test, type Page } from '@playwright/test';
import { bootReady } from '../_helpers/boot-ready';   // _demo は 1 つ深いので ../

const SHOT = 'test-results/demo';

test('demo: <feature> の実操作', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html');
  await bootReady(page);
  // …実操作(実キーボード = page.keyboard.type、実マウス = page.mouse.click)…
  await page.locator('<dialog/region>').screenshot({ path: `${SHOT}/1-<label>.png` });
});
```

- **要素单位でスクショ**(`locator.screenshot`)すると余白が締まって見やすい。
  全体の文脈も要るなら `page.screenshot` を併用
- **正常系だけでなく異常系も撮る**(検証エラー・空状態・エラー表示)。
  user は「ちゃんと弾かれるか」を見たい
- 実入力は `page.keyboard.type` を使う(locator.fill でなく)。副作用
  (自動補完・バリデーション)まで込みの見た目になる

### 提示の作法(会話ルール)

- **Claude が先に Read で全画像を検品**。崩れ・空・想定外を見つけたら
  実装バグとして直す(下記の「demo が炙り出した実バグ」参照)
- SendUserFile は `status: "normal"`(user のリクエストへの返信)、
  `display: "render"`、崩れ無しを確認した画像だけ
- diff や DOM ではなく**画像で**見せる(CLAUDE.md 会話ルール)

## B. verify モード(Claude が確かめる)

`visual-parity` skill の手順で `*-parity.spec.ts` を書く。要点だけ再掲:

- `elementFromPoint(x,y)` で到達可能性 → `page.mouse.click(x,y)` で実 OS
  操作 → **画面の観測点**で assert → `test-results/<spec>.png` に証跡
- 実行は demo と同じ環境固め:
  ```bash
  eval "$(node scripts/resolve-pw-chromium.cjs --export)"
  npx playwright test --config=tests/smoke/playwright.config.ts <spec名の一部>
  ```
- 視覚機能 PR は verify を最低 1 件持つ(CLAUDE.md 規律)。demo は
  **verify の代わりにならない**(pass/fail が無い)。両輪で回す

## demo が炙り出した実バグ(この手法の価値)

demo スクショの検品は verify が拾わない「生成 OK だが**見えない**」バグを
炙り出す。実例(2026-07-25):CodeEditLite の検証エラーが DOM には
入っているのに、`errorsBox.style.display = ''` にしていたため CSS 既定
`.pkc-code-edit-errors { display: none }` が勝って**画面に出ていなかった**。
unit(textContent を見る)も parity(エラー box の可視性を見ていない)も
素通りし、**demo スクショの目視で初めて発覚**した。

教訓:
- **`style.display = ''` は危険**。CSS 側に `display: none` があると「既定へ
  戻す」= 消える。表示したいときは明示値(`'block'` / `'flex'`)を入れる
- demo で異常系(エラー・空・警告)を必ず撮る。正常系だけだと「見えない
  エラー」を見逃す
- 見つけた可視性バグは **unit に computed/inline display の assert を足して**
  回帰 pin する(textContent だけの assert は不十分)

## 完了チェック

- [ ] `eval "$(node scripts/resolve-pw-chromium.cjs --export)"` を実行してから走らせた
- [ ] src 変更後に `npm run build` してある(demo / verify とも dist を serve)
- [ ] demo: スクショを Claude が Read で全部検品 → 崩れ無しだけ SendUserFile
- [ ] demo で異常系(エラー / 空 / 警告)も撮った
- [ ] verify: elementFromPoint + 実 OS event + 画面観測点の assert がある
- [ ] 見つけた可視性バグは unit に display assert で回帰 pin した
