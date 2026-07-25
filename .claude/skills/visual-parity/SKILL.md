---
name: visual-parity
description: >
  PKC2 の visual parity smoke test(Playwright 実ブラウザ検証)を書く・直す・実行するための
  ワークフロー。CLAUDE.md の規律により、視覚を持つ feature(click / hover / drag / overlay /
  popover / DnD / タイル / メニュー / トグル)を追加・変更する PR は parity test を最低 1 件
  持たなければならない。UI に見た目や操作の変化がある実装を始めた時点でこのスキルを読むこと —
  「tests/smoke/ にテストを足す」「Playwright」「スクリーンショット」「実機クリック」「smoke が
  落ちた」という文脈でも必ず使う。vitest / happy-dom の pass は生成の正しさしか保証しない
  (生成 ≠ 描画)ため、視覚機能はこのスキルの手順で実ブラウザ検証する。
---

# PKC2 Visual Parity Test ワークフロー

方法論の正本は `docs/development/visual-state-parity-testing.md`(なぜ parity test が
必要か・テストピラミッド)。本スキルはその**実務手順**: 動くテンプレート、seed パターン、
実行コマンド、そしてこのリポジトリで実際に踏んだ落とし穴を扱う。

## 何を証明するテストか

vitest + happy-dom は「正しい DOM を生成した」ことしか示さない。ユーザーの体験は
「**指定座標に実際に見えていて、実マウス・実キーボードで操作でき、結果が画面に出る**」。
parity test はそこを埋める:

1. `elementFromPoint(x, y)` — 期待要素がその座標で**最前面に見えている**(overflow /
   z-index / opacity で隠れていない)ことを確認
2. `page.mouse.click(x, y)` / `page.keyboard.type()` — locator API ではなく
   **OS イベント経由**で操作
3. 結果を **画面の観測点**(表示要素・テキスト・件数)で assert
4. `page.screenshot()` を `test-results/<spec名>.png` に残す(人間が後で見る証拠)

シナリオは feature につき最低 1 件・少数厚めに。網羅は vitest 側の仕事。

## 実行コマンド

smoke は **dist をビルドして serve する**(`scripts/smoke-serve.cjs` が
`dist/pkc2.html` を配る)。**src を変更したら必ず build してから実行**:

```bash
npm run build:bundle && npm run build:release
PKC_PRE_INSTALLED_CHROMIUM=/opt/pw-browsers/chromium \
  npx playwright test --config=tests/smoke/playwright.config.ts <spec名の一部>
```

- `PKC_PRE_INSTALLED_CHROMIUM` はこの開発環境(Claude Code リモート)で**必須**
  (Playwright の chromium 自動 DL が network 制限で 403 になるため、pre-install 版を
  executablePath で使う)。CI では不要(env 未設定で通常経路)。
- 全 smoke: `npm run test:smoke`(時間がかかる。通常は対象 spec だけ絞る)
- spec 作成・修正後は `npm run typecheck` も回す(**vitest / playwright は型検査しない**)

## Spec テンプレート

`tests/smoke/<feature>-parity.spec.ts` に置く。骨格:

```ts
/**
 * #<issue> — <feature> の visual parity。
 * <何を実ブラウザで証明するか 1-2 行>
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

test('parity: <シナリオ名>', async ({ page }) => {
  // ページ内例外の混入をテスト失敗として観測する(描画は無事に見えても
  // 裏で throw していた、を見逃さない)。最後に空 assert する。
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/pkc2.html');
  await bootReady(page);          // boot 待ちは必ずこの helper(下記の落とし穴参照)

  // ...seed(下記パターン)...

  // 操作対象の到達可能性を elementFromPoint で確認
  const target = page.locator('<data-pkc-* selector>');
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error('target has no bounding box');
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document.elementFromPoint(x, y)?.closest('<selector>') !== null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe(true);

  // 実マウスで操作 → 画面の観測点で結果 assert
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('<結果の観測点>')).toBeVisible();

  await page.screenshot({ path: 'test-results/<spec名>.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
```

selector は **`data-pkc-*` 属性のみ**(CSS class は minify / リファクタで壊れる。
これは repo 全体の規約)。

## Seed パターン(3 種)

### A. UI 経由(entry 数件で足りる時の最短)

```ts
await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-phase', 'editing');
await page.locator('[data-pkc-field="title"]').first().fill('Probe');
await page.locator('[data-pkc-action="commit-edit"]').first().click();
await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-phase', 'ready');
```

### B. IDB 直接 seed(特定の container 構造・relation・asset が要る時)

dist の埋め込み container は boot source に**ならない**(空 container で立ち上がる)ので、
複雑な fixture は IndexedDB に直接入れて reload する。**初回 boot 完了後に seed し、
`page.goto` し直して再度 `bootReady`** が確実な順序:

```ts
async function seed(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = '2026-01-01T00:00:00.000Z';
    const cont = {
      meta: { container_id: 'myfix', title: 't', created_at: now, updated_at: now, schema_version: 1 },
      entries: [/* lid / title / archetype / body / created_at / updated_at */],
      relations: [/* id / kind:'structural' / from / to / created_at / updated_at */],
      revisions: [], assets: { k1: btoa('<h1>x</h1>') },
    };
    await new Promise<void>((res, rej) => {
      // version は指定しない(既存バージョンで開く)。storage v3 で
      // DB_VERSION が 3 になり、`open('pkc2', 2)` 直書きは VersionError。
      const req = indexedDB.open('pkc2');
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        // asset は per-record: key は `${container_id}:${asset_key}`
        tx.objectStore('assets').put(btoa('<h1>x</h1>'), 'myfix:k1');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
}

// 呼び出し順序(この順でないと初回 boot の保存が seed を上書きすることがある):
await page.goto('/pkc2.html');
await bootReady(page);
await page.waitForTimeout(800);   // 初回 boot の書き込み静定を待つ
await seed(page);
await page.goto('/pkc2.html');    // 再 boot で seed を読む
await bootReady(page);
```

asset を使わないなら transaction は `['containers']` のみで良い。

**asset の seed key は storage v3 で `${container_id}:${asset_key}`(per-record)**。
`assets` objectStore に生 key(`k1`)で put すると `store.loadAsset(cid, 'k1')` は
`cid:k1` を探して見つけられず、lazy 添付が永久に非常駐 =「読み込み中」で
弾かれ続ける(2026-07-25 に添付編集 parity で踏んだ)。seed では必ず
`tx.objectStore('assets').put(base64, \`${cid}:${key}\`)` とする。古い spec に
生 key の残骸があるので流用時は注意。

### C. flag seed(既定 OFF の機能・モード切替が要る時)

flag は container の `__flags__` システム entry から読まれる。seed の entries に
次を含めるだけで boot 時からその flag が効く:

```ts
{
  lid: '__flags__', title: 'Flags', archetype: 'system-flags',
  body: JSON.stringify({
    format: 'pkc2-system-flags', version: 1,
    values: { 'sidebar.mode': 'tree', 'shell.tabs_enabled': true },
  }),
  created_at: now, updated_at: now,
}
```

代表例: sidebar の既定は filer モードなので、**tree 構造(folder 開閉)を試すなら
`'sidebar.mode': 'tree'` の seed が必要**。URL `?pkc-flag=key=1` でも切替可能だが、
seed に入れる方が spec が自己完結する。

## 落とし穴(全て実際に踏んだもの)

- **boot 待ちに `shell.waitFor()` / `#pkc-root` 待ちを使わない** — HTML load 段階で
  通過してしまい CI 高負荷時に flake 化する。必ず `bootReady(page)`。reload /
  goto のたびに再度呼ぶ。
- **`locator.click()` は auto-scroll する** — スクロール位置(scrollTop)を assert する
  テストでは座標が壊れる。JS dispatch(`page.$eval(sel, el => el.click())`)か
  `page.mouse.click(x, y)` を使い、scroll 依存の assert より前に scroll を確定させる。
- **空 region は `toBeVisible()` にならない** — 中身ゼロの strip / list は zero-height で
  "not visible" 扱い。存在確認は `toHaveCount(1)` を使う。
- **座標 assert の前に `boundingBox()` の null チェック** — detach 直後は null が返る。
- **`data-pkc-date` のような属性は複数要素にマッチしうる**(cell と cell 内ボタンの両方に
  付くなど)。`.pkc-<部品> [data-pkc-…]` のように部品 class で scope するか、既存 spec の
  selector を先に確認する。
- **PR CI では Tier-B が `skipped` と出る = 正常**。新 spec は Tier-B(main push +
  毎晩 schedule)で回る。PR blocking にしたい時だけ
  `tests/smoke/playwright.config.ts` の `TIER_A_SPECS` に追加(原則増やさない —
  Tier-A は critical path 10 spec の予算)。
- **同時に 2 つの playwright 実行をしない** — port 4173 の serve を共有していて
  起動が race する。
- **copy / 書き出し系は clipboard の中身まで assert する** —
  `context.grantPermissions(['clipboard-read', 'clipboard-write'])` →
  `navigator.clipboard.readText()`(text/plain)/ `clipboard.read()` +
  `item.getType('text/html')`(rich)。DOM の存在 assert だけでは
  「貼り付け先で壊れている」を見逃す(2026-07-24: csv copy が表 → 生 CSV に
  劣化 + UI 装飾 `#` `↕⌕` 混入を、この方法で初めて検出)。
- **別窓(popup / entry-window)は `context.waitForEvent('page')` で受けて
  popup.mouse / popup.evaluate で操作**。注意: sidebar 右クリック →
  `ctx-open-window` は**編集ウィンドウ**として開く(dblclick 相当)。初期の
  可視 pane は `#body-preview` で、`#body-view` は隠れている — view 側を
  検証するなら `#btn-cancel` click で view mode へ戻してから。
- **DOM の実形状が分からない時の probe 手法**: 期待値に `'SHOW_ME'` 等を
  入れた `toEqual` で fail させ、diff に実物(children の tag/class 列挙等)を
  吐かせて観察する。`console.log` は test runner の出力で流れやすい。
- **FSA / フォルダ系の E2E**: `showDirectoryPicker` を OPFS ディレクトリに
  stub(`navigator.storage.getDirectory()` → `getDirectoryHandle(name,
  {create:true})`)すると、書き込みは実 FSA 経路のまま headless で回せる。
  OPFS は reload を跨いで永続するので、navigation 後の検証にも使える
  (storage-dead E2E / fallback-gate parity の定型)。reload を挟む poll は
  `.catch(() => -1)` で context 破棄を吸収して再 poll。

## 既存 spec を先に 1 つ読む

新しいシナリオは大抵、既存 spec のどれかに近い。まず近いものを 1 つ読んで流用する:

| やりたいこと | 参考 spec |
|---|---|
| 右クリック menu → 項目 click | `launcher-tile-context-menu-parity.spec.ts` |
| ダイアログ / popover へ実入力 | `inline-dialog-parity.spec.ts` |
| flag seed + tree sidebar 操作 | `tree-row-memo-parity.spec.ts` |
| 設定メニューのトグル | `shell-menu-tabs-toggle-parity.spec.ts` |
| view 切替 + セル座標 hit | `calendar-parity.spec.ts` |
| DnD | `kanban-dnd-parity.spec.ts` / `launcher-tile-dnd-parity.spec.ts` |
| スクロール位置・高さ | `textlog-height-memo-parity.spec.ts` |

## 完了チェック

- [ ] `npm run build:bundle && npm run build:release` 後に対象 spec がローカル green
- [ ] `npm run typecheck` clean(spec の型エラーは CI まで発見されない)
- [ ] screenshot を `test-results/` に出している
- [ ] selector は `data-pkc-*` のみ
- [ ] 到達可能性(elementFromPoint)と実操作(page.mouse / keyboard)の両方がある
