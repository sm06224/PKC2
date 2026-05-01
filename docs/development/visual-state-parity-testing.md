# Visual / State Parity Testing(描画と状態を一致させる検証手法)

**Status**: 設計 draft(2026-05-01)
**Owner**: PR #206 仕切り直しの一部、reform-2026-05
**前提**: 私がこれまで「テスト pass = 動く」と扱っていた認識を改める。**生成 ≠ 描画**、**programmatic click ≠ 実機 click**。public 化された CI 予算を使って、ピクセル / 実 OS イベント / マルチブラウザを取り込む。

## 1. 何を変えるか

### 旧来の検証(これだけだと不足)

| Layer | 検証内容 | 例 |
|---|---|---|
| 単体(vitest + happy-dom) | 純関数の入出力 | `caretSourceLine(ta)` が 5 を返す |
| renderer DOM 生成 | `renderMarkdown` が anchor 属性を持つ HTML を吐く | `[data-pkc-source-line="3"]` がある |
| Playwright `locator.click()` | programmatic に DOM 要素を click → state 観察 | preview の anchor を click → `selectionStart` 変わる |

これらは**生成・mutation の正しさ**を見ているだけで、ユーザーの「視覚的に見えていて、自分の指で触れる」を保証しない。

### 加える検証(parity テスト)

> **状態 (`AppState`) を作る → render する → 実 viewport で「あるはずの要素が指定座標で見えていてクリック可能」を assert → 実 OS マウス座標 click → 結果 state を観察 → screenshot を artifact として残す。**

要点:

- **`elementFromPoint(x, y)`** で、ある座標に**実際に表示されている element** が期待のものか確認する(`overflow: hidden` / `z-index` で隠れていないか含む)
- **`page.mouse.click(x, y)`** で OS event を経由した click を発火する(`locator.click()` ではなく)
- **screenshot** を CI artifact に必ず残す(差分 = 必ずしも fail にしない、人間が後で見れる証拠)
- **Multi-browser**: `chromium` / `firefox` / `webkit` の 3 種で重要シナリオを並列実行

## 2. テストレイヤーピラミッド(改訂)

```
            ┌────────────────────────────┐
            │ E2E parity (multi-browser, │   ← 新規。少数・厚い
            │  real coords + OS click)   │
            └────────────────────────────┘
          ┌────────────────────────────────┐
          │ Playwright smoke (programmatic)│   ← 既存。boot / 主要遷移
          └────────────────────────────────┘
        ┌──────────────────────────────────────┐
        │ Renderer DOM tests (happy-dom + vitest)│   ← 既存。data-pkc-* 契約
        └──────────────────────────────────────┘
      ┌──────────────────────────────────────────┐
      │ Unit tests (vitest, pure functions only) │   ← 既存。多数・薄い
      └──────────────────────────────────────────┘
```

新規の最上層 = "parity test" は以下の特徴を持つ:

- 数を最小にする(維持コスト高)
- ただし feature ごとに**最低 1 シナリオ必須**(下記 §6 のルール)
- 失敗時は screenshot + DOM dump + Report JSON(debug-via-url-flag-protocol.md 参照)を artifact に出す

## 3. Parity test の標準パターン

### 3.1 流れ

```
seed AppState
  ↓
goto pkc2.html (or test harness URL)
  ↓
hydrate state via deterministic path (page.evaluate or pre-baked container)
  ↓
wait for render frame (rAF + microtask drain)
  ↓
[parity assertion]
  expected = computeFromState(...)         // ex: caret line N → expected anchor element
  actual   = page.evaluate(elementFromPoint(x, y))
  assert actual.matches(expected.selector)
  ↓
[real interaction]
  page.mouse.click(x, y)                   // not locator.click()
  ↓
wait for next idle frame
  ↓
[result assertion]
  state' = page.evaluate(getInternalStateProbe())
  assert state'.selectedX === expected'
  ↓
artifact:
  page.screenshot({ path: 'parity-{name}-{browser}.png' })
  page.evaluate(dispatchDebugReport)        // Report JSON も artifact に保存
```

### 3.2 ヘルパ(新規予定 `tests/parity/_helpers.ts`)

```ts
export async function seedContainer(page, container: Container): Promise<void>
export async function readState<T>(page, fn: (s: AppState) => T): Promise<T>
export async function elementAt(page, x: number, y: number): Promise<{
  selector: string; rect: DOMRect; text: string;
}>
export async function realClick(page, x: number, y: number): Promise<void>
export async function dumpReport(page): Promise<DebugReport>
```

`seedContainer` は IndexedDB 直書き or `?seed=...` URL flag(後者の方が後で便利)。

## 4. 「画面上の座標 = state からの推定」を assert する

例: source-preview-sync の caret 同期

```ts
// 1. seed entry with multi-block markdown
await seedContainer(page, makeContainerWithEntry({ body: SAMPLE }));
await page.goto('/pkc2.html?lid=test-1&edit=1&pkc-debug=sync');

// 2. set caret to line 5
await page.evaluate(() => {
  const ta = document.querySelector('textarea[data-pkc-field="body"]');
  ta.focus();
  ta.setSelectionRange(LINE_5_OFFSET, LINE_5_OFFSET);
  ta.dispatchEvent(new Event('selectionchange'));
});
await page.waitForTimeout(50); // rAF debounce

// 3. parity: viewport 上で line 5 の anchor 要素はどこに見えているか
const previewRect = await page.locator('[data-pkc-region="text-edit-preview"]').boundingBox();
const activeRect  = await page.locator('[data-pkc-active-source]').boundingBox();
expect(activeRect).not.toBeNull();
// 期待: active block の top が preview の見える 25-75 % 帯にいる
const yInPane = (activeRect.y - previewRect.y) / previewRect.height;
expect(yInPane).toBeGreaterThanOrEqual(0.10);
expect(yInPane).toBeLessThanOrEqual(0.90);

// 4. parity: 視認できる位置に source line attr が一致しているか
const elAtCenter = await elementAt(page, activeRect.x + 5, activeRect.y + activeRect.height / 2);
expect(elAtCenter.selector).toMatch(/\[data-pkc-source-line="5"/);

// 5. screenshot artifact
await page.screenshot({ path: 'artifacts/parity-sync-line5.png' });
```

このシナリオが green になって**初めて**「state.caret が 5 のとき、ユーザーは line 5 の anchor を画面上の妥当な位置に視認できる」と言える。

### 逆方向(preview 実 click → state 観察)

```ts
// 6. anchor の中央を実 OS click
await realClick(page, activeRect.x + activeRect.width / 2, activeRect.y + activeRect.height / 2);
await page.waitForTimeout(50);

// 7. state assertion
const newCaret = await readState(page, (_s) => {
  const ta = document.querySelector('textarea[data-pkc-field="body"]');
  return ta.selectionStart;
});
expect(newCaret).toBe(LINE_5_OFFSET);
```

`page.mouse.click()` を経由するため、`pointerdown` / `mousedown` / `mouseup` / `click` / `pointerup` の順で本物の event tree が起動する。`locator.click()` よりズレが見つかりやすい。

## 5. Multi-browser matrix

repo public 化に伴い CI 予算を使い切る方針。

### Playwright 設定(予定)

```ts
// playwright.config.ts (parity 用に分離)
projects: [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'firefox',  use: devices['Desktop Firefox'] },
  { name: 'webkit',   use: devices['Desktop Safari'] },
  { name: 'mobile-safari', use: devices['iPhone 14'] },
  { name: 'mobile-chrome', use: devices['Pixel 7'] },
]
```

### 適用方針

- **smoke**: chromium のみ(boot / sanity)
- **parity**: chromium + firefox + webkit を必須、mobile は重要 feature のみ(sync は対象、kanban は desktop のみで OK 等)
- **screenshot artifact**: 全 browser 分を CI に保存。視覚 regression を**自動 fail にしない**(false positive 多発するため)。人間が PR レビューで横並びに見る用。

### 失敗時の artifact

- `page.screenshot()`(failure 時)
- `page.video()` retain on failure
- Report JSON(debug-via-url-flag-protocol.md §5)を `console.log` で吐いて artifact に
- DOM snapshot(scoped to relevant region)

これで CI が落ちたとき、こちらは「何を見ていたか / ユーザー視点で何が見えていたか / state がどうだったか」をすべて手元で再現できる。

## 6. Feature ごとに最低 1 件のルール

ユーザーが視覚的に触れる feature は、**最低 1 つ parity test を持つこと**。

### 必須 feature(着手済 / 既知のもの)

| Feature | parity 必須シナリオ |
|---|---|
| split-editor preview sync(本 reform 起点) | caret 移動 → preview 上での anchor 視認位置 / 逆 click → caret 移動 |
| kanban DnD | drag 中の hover ターゲット = 期待 status 列 / drop → state 反映 |
| calendar | 今日 marker が今日 cell に visible / archived hide トグル |
| sidebar swipe-to-delete | 閾値手前 / 越え後の状態と最終 state |
| split editor 同期トグル | OFF 時に overlay 全消え / ON 時に overlay 復帰 |

### 必須でない(後でよい)

- 純粋な見栄え・theming(色変えただけのもの)
- ボタン挙動が単純な action dispatch のみ(unit / smoke で十分)

## 7. CI ワークフロー(予定)

`.github/workflows/parity.yml`(新規):

- trigger: pull_request, push to main
- jobs:
  - `parity-chromium`(default、PR ごと必須)
  - `parity-firefox`(PR ごと必須)
  - `parity-webkit`(PR ごと必須、public 化後に有効化)
  - `parity-mobile`(nightly のみ、PR では skip 可)
- artifact:
  - `parity-{browser}-screenshots/` フォルダ
  - `parity-{browser}-videos/`
  - `parity-{browser}-report-dumps.json`

## 8. ルール(merge 判定)

CLAUDE.md / pr-review-checklist.md の「8. Merge 判断の報告」を補強:

> 視覚を持つ feature の PR では、**parity test が green** であることを確認するまで「ユーザー側で merge 判断してよい状態です」と報告しない。Playwright の programmatic click smoke だけでは不足。

## 9. 段階導入

| 段階 | 範囲 | 完了基準 |
|---|---|---|
| α | `tests/parity/_helpers.ts` + `playwright.config.parity.ts` + chromium だけで 1 件動作 | sample test green、artifact 収集が動く |
| β | firefox / webkit を CI matrix 追加 | 3 browser で同 sample green |
| γ | source-preview-sync を最初の adopter として §4 を実装 | PR #206 の機能を red-first で再構築開始可能 |
| δ | kanban / calendar / sidebar の必須シナリオを追加 | 既存リリース済み feature の安全網が整う |

## 10. 非ゴール

- すべての E2E を parity 化(維持コスト)
- pixel-perfect な visual regression(ノイズ多すぎる)
- production telemetry(本 doc は test 観点)
