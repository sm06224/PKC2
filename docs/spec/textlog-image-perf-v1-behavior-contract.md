# TEXTLOG 複数画像パフォーマンス v1 — Behavior Contract

Status: 実装済み(v2.1.0 以前に landing、v2.1.1 時点で稼働中、TEXTLOG 段階的表示 / staged render が動作中)。本書は behavior contract / historical design record として保持。実装の現物は `tests/adapter/textlog-staged-render.test.ts` / `tests/adapter/textlog-staged-render-phase2.test.ts` と textlog presenter 系。
Pipeline position: behavior contract
Predecessor: `docs/spec/textlog-image-perf-v1-minimum-scope.md` rev.2.1
Spike result note: `docs/development/archived/fi-audits/fi-03-spike-native-lazy-result.md`
Sibling: `docs/spec/image-intake-optimization-v1-behavior-contract.md` rev.1.1

## Revision history

- **rev.1 (2026-04-19)**: 初版。minimum scope rev.2.1 で固定された D-TIP1〜D-TIP7 と I-TIP1〜I-TIP10 を contract 粒度へ昇格。staged render / staged asset resolve / placeholder を v1 本命として確定。

---

## 0. 位置づけ

minimum scope rev.2.1 で以下の判断が固定された。本文書はそれらを **前提事実** として扱い、behavior の具体定義に進む。

| ID | 内容 |
|----|------|
| **D-TIP1** | 初期 render 範囲の基本単位は **log article**（`renderLogArticle` の単位） |
| **D-TIP2** | 初期 render 件数は **固定値**。contract で `INITIAL_RENDER_ARTICLE_COUNT` 定数として定義 |
| **D-TIP3** | hydrate trigger は **IntersectionObserver 主体**。`loading="lazy"` は採用しない |
| **D-TIP4** | placeholder は **aspect-ratio / min-height による固定高ボックス**。spinner を出さない |
| **D-TIP5** | 後段 article の markdown 原文は **全件メモリ保持**（`container.entries[n].body` 経由で既に存在） |
| **D-TIP6** | edit→read 切替時も **staged を維持** |
| **D-TIP7** | baseline 計測は **Playwright 自動ベンチ** |

minimum scope の §5 で列挙された I-TIP1〜I-TIP10 は本 contract の §8 で code-level 精度に昇格する。

本文書は **docs-only**、実装しない。

## 1. Scope

### 1-1. 対象 surface

| Surface | 対象 | 介入ポイント（コード） |
|---------|------|---------------------|
| TEXTLOG read view 初期 render | **対象** | `src/adapter/ui/textlog-presenter.ts` `renderBody` |
| 個別 log article の構築 | **対象** | 同 `renderLogArticle` |
| asset 解決 | **対象** | `src/features/markdown/asset-resolver.ts` `resolveAssetReferences`（呼び出しタイミングを staged 化。関数シグネチャは不変） |
| edit → read 復帰 re-render | **対象** | `renderBody` 再呼出し経路 |
| print / export | **対象（bypass 側）** | §7 で全展開を強制 |
| TEXTLOG 以外の archetype | **非対象** | I-TIP6 |
| paste / drop / attach 経路 | **非対象** | I-TIP7（FI-08 / image-intake-optimization が所管） |
| `<img loading="lazy">` / `decoding="async"` | **非対象** | spike で棄却（minimum scope §3-2） |
| Blob URL 化 / Web Worker / virtualization | **非対象（v1.x 候補）** | §12 |

### 1-2. 対象コードポイント

behavior 変更が入る場所を列挙する。これ以外には触れない。

| ファイル | 関数 | 変更の性質 |
|---------|------|---------|
| `src/adapter/ui/textlog-presenter.ts` | `renderBody` | 初期 render を先頭 k 件に限定し、残りを placeholder article として emit |
| `src/adapter/ui/textlog-presenter.ts` | `renderLogArticle` | 未 hydrate 用の placeholder 分岐を追加（既存 path は保持） |
| 新規モジュール | `src/adapter/ui/textlog-hydrator.ts`（想定） | IntersectionObserver の管理・hydrate trigger・teardown |
| `src/features/markdown/asset-resolver.ts` | `resolveAssetReferences` | **シグネチャ不変**。呼び出しタイミングだけ staged 側から制御 |

### 1-3. 非対象（contract で扱わない）

- 画像圧縮 / 再エンコード（image-intake-optimization FI が所管）
- body 文字列 / `container.assets` への書き込み（I-TIP2）
- `resolveAssetReferences` の **出力形式** 変更（I-TIP3）
- TEXT / TODO / form / attachment の表示（I-TIP6）
- virtualization（DOM ごと生成 / 破棄する仕組み）
- scroll 位置復元を保証する追加の永続化
- user-visible な設定（件数 k や placeholder 高の UI 調整）

## 2. Staged render — 初期レンダリングの境界

### 2-1. 初期 render 単位（D-TIP1）

初期 render の最小単位は **log article** とする。`renderLogArticle` の呼び出し境界と一致する。

- day-section（`<section class="pkc-textlog-day">`）単位ではない。1 日に画像が集中した場合に粒度が粗すぎる
- 固定件数 N 単位でもない。day-section の境界を跨ぐと heading の存在タイミングが不定になる
- article 単位であれば、`<section>` が空（= その日の全 article が未 hydrate）な状況は起こらない。day heading は常に初期 DOM に含まれる

### 2-2. 初期 render 件数（D-TIP2）

v1 default を以下で固定する。

```ts
export const INITIAL_RENDER_ARTICLE_COUNT = 8;
```

根拠:

- minimum scope §7 の中規模（10 枚）シナリオで、直近 day-section + 前後の article が収まる典型値
- 1-3 MB × 8 枚 = 8〜24 MB の前段処理量。rev.2.1 の実運用サイズ前提で、fresh render が main thread で 1 秒程度に収まる目安
- 後段の hydrate trigger（§4）が scroll に追従できる余裕を残す

数値は v1 default（fixed eternal ではない）。audit 段階で baseline 計測（§11）に照らして再調整可能。

### 2-3. 擬似コード（renderBody の staged 化）

```ts
function renderBody(entry, assets, mimeByKey, nameByKey, entries): HTMLElement {
  const container = createTextlogContainer(entry);
  container.appendChild(renderSelectionToolbar(...));
  container.appendChild(renderAppendArea(entry));

  const doc = buildTextlogDoc(entry, { order: 'desc' });
  if (doc.sections.length === 0) return appendEmptyState(container);

  const docEl = document.createElement('div');
  docEl.className = 'pkc-textlog-document';
  docEl.setAttribute('data-pkc-region', 'textlog-document');

  // Flatten article visit order (viewer's display order = desc).
  const articlesInOrder = flattenArticles(doc.sections);
  const initialCount = Math.min(articlesInOrder.length, INITIAL_RENDER_ARTICLE_COUNT);
  const hydratedIds = new Set<string>();

  for (const section of doc.sections) {
    const sectionEl = buildSectionHeader(section); // always emitted
    for (const log of section.logs) {
      const articleEl = shouldHydrateNow(log, articlesInOrder, initialCount, hydratedIds)
        ? renderLogArticle(entry.lid, log, assets, mimeByKey, nameByKey, entries, selecting)
        : renderLogArticlePlaceholder(entry.lid, log);
      if (articleEl.dataset.pkcHydrated !== 'false') {
        hydratedIds.add(log.id);
      }
      sectionEl.appendChild(articleEl);
    }
    docEl.appendChild(sectionEl);
  }

  container.appendChild(docEl);

  // One hydrator instance per renderBody invocation. Teardown on
  // next renderBody via WeakMap-style or element-attached cleanup.
  attachHydrator(docEl, {
    entry, assets, mimeByKey, nameByKey, entries, selecting,
  });

  return container;
}
```

- 初期 render 対象: `hydratedIds.size ≤ INITIAL_RENDER_ARTICLE_COUNT` を満たすまで先頭から順に実体化
- 後段: `renderLogArticlePlaceholder(lid, log)` が軽量 article（data-pkc-hydrated="false"）を emit（§5）
- `attachHydrator` は docEl に IntersectionObserver を設定し、入場時に placeholder を実体に差替える（§4）

## 3. Staged asset resolve — 画像解決タイミング

### 3-1. 呼出しタイミングの staged 化

`resolveAssetReferences(source, { assets, mimeByKey, nameByKey })` の **関数シグネチャと出力は不変**（I-TIP3）。変わるのは「いつ呼ぶか」だけ。

| 状態 | `resolveAssetReferences` 呼出し | markdown parse | DOM 挿入 |
|------|-------------------------------|---------------|---------|
| 初期 render 対象 article（先頭 k 件） | **即時** | 即時 | 即時 |
| 未 hydrate article | **呼ばない** | 呼ばない | placeholder のみ DOM に存在 |
| hydrate trigger 発火後 | **その時点で呼ぶ** | 直後に呼ぶ | placeholder を実体に差替 |

### 3-2. 原文の保持方針（D-TIP5）

後段 article の markdown 原文（`log.bodySource`）は、DOM ではなく **hydrator が保持する LogArticle 参照経由**で到達できる。`container.entries[n].body` が既にメモリ上に存在するため、追加のストレージは不要。

```ts
interface HydratorContext {
  lid: string;
  log: LogArticle;              // 原文 + id + flags
  assets: Record<string, string> | undefined;
  mimeByKey: Record<string, string> | undefined;
  nameByKey: Record<string, string> | undefined;
  entries: Entry[] | undefined;
  selecting: boolean;
}
```

このコンテキストを各 placeholder に紐付けて保持する（WeakMap もしくは element dataset ＋ hydrator 内 Map）。

### 3-3. 擬似コード（hydrate 実体化）

```ts
function hydrateArticle(placeholder: HTMLElement, ctx: HydratorContext): void {
  if (placeholder.dataset.pkcHydrated === 'true') return;

  const real = renderLogArticle(
    ctx.lid, ctx.log, ctx.assets, ctx.mimeByKey, ctx.nameByKey,
    ctx.entries, ctx.selecting,
  );
  real.dataset.pkcHydrated = 'true';
  // Preserve element identity surface (data-pkc-log-id / data-pkc-lid)
  // so outer event delegation, selection state, and anchor links
  // continue to resolve the article unchanged.
  placeholder.replaceWith(real);
}
```

- `renderLogArticle` 内部の `resolveAssetReferences` 呼び出しはこの段で初めて走る
- I-TIP9（最終状態は一括処理と同一）は `renderLogArticle` の既存 path をそのまま再利用することで保証される
- 差替え後は placeholder を IntersectionObserver から unobserve（§4-4）

## 4. Hydrate trigger — 後段 article の実体化契機

### 4-1. 採用方式（D-TIP3）

**IntersectionObserver 1 本を主軸**とする。`loading="lazy"` は採用しない（spike で悪化確認済み）。scroll event の直接 hook もしない（IO 比で非効率）。

補助として、初期 render 完了後に rAF / `requestIdleCallback` で **先頭 k+1 〜 k+M 件を先読み hydrate**（M は後述）する。これによりユーザが少しスクロールしただけで placeholder が見える jank を抑える。

### 4-2. IntersectionObserver 設定

```ts
const observer = new IntersectionObserver(onIntersect, {
  root: null,                // viewport 基準
  rootMargin: '400px 0px',   // 画面外 400px 手前で先行 hydrate
  threshold: 0,              // 1 px でも交差したら発火
});
```

- `root: null` は `renderBody` の呼び出し元が scroll container を DOM 祖先に持つことを前提とする（PKC2 main-pane がそれ）。scroll container を直接渡す設計は v1.x 余地
- `rootMargin: '400px 0px'` は 1 article 1〜2 件分ほど手前を先読み境界とする。audit 段階で再調整可能
- `threshold: 0` は placeholder が 1 px でも入ったら hydrate、の軽量条件

### 4-3. rAF / requestIdleCallback による先読み hydrate

```ts
const LOOKAHEAD_ARTICLE_COUNT = 4;

function attachHydrator(docEl, ctxMap) {
  const placeholders = docEl.querySelectorAll('[data-pkc-hydrated="false"]');
  const observer = buildObserver(ctxMap);
  for (const ph of placeholders) observer.observe(ph);

  // Pre-warm: hydrate the next LOOKAHEAD_ARTICLE_COUNT placeholders
  // after the initial render paints. Spread across rAF ticks so the
  // main thread can breathe between articles.
  scheduleLookahead(placeholders, ctxMap, LOOKAHEAD_ARTICLE_COUNT);
}

function scheduleLookahead(placeholders, ctxMap, count) {
  let i = 0;
  function tick() {
    if (i >= count || i >= placeholders.length) return;
    const ph = placeholders[i++];
    hydrateArticle(ph, ctxMap.get(ph.dataset.pkcLogId));
    (window.requestIdleCallback ?? requestAnimationFrame)(tick);
  }
  (window.requestIdleCallback ?? requestAnimationFrame)(tick);
}
```

- `requestIdleCallback` 非対応環境（Safari など）は rAF へフォールバック
- 1 tick につき 1 article を hydrate。main thread の空き時間を食い過ぎない
- `LOOKAHEAD_ARTICLE_COUNT = 4` は default。audit で調整

### 4-4. Teardown

`renderBody` は viewer re-render のたびに新しい DOM を返す（既存実装）。古い docEl に紐付いた IntersectionObserver は **差替え時点で解放する必要がある**。

- `attachHydrator` が作成した observer は docEl の `data-pkc-hydrator-cleanup` にクロージャ関数として記録
- renderer 側の cleanup hook で観察解除する（実装 slice で拡張点を固定。contract としては「古い docEl がアンマウントされる時点で observer が disconnect される」ことを保証する）
- WeakRef 的な救済はしない（明示的に disconnect）

## 5. Placeholder — 未 hydrate article の視覚表現

### 5-1. DOM 構造

未 hydrate article は **実体 article と同じ外殻タグ + 同じ data-* 属性** を持つ。event delegation / selection / anchor link が hydrate 前後で切れないための不変条件。

```html
<article class="pkc-textlog-log pkc-textlog-log-pending"
         id="log-<id>"
         data-pkc-log-id="<id>"
         data-pkc-lid="<entry lid>"
         data-pkc-hydrated="false">
  <header class="pkc-textlog-log-header">
    <!-- flag btn / timestamp / anchor btn はそのまま描画する -->
  </header>
  <div class="pkc-textlog-text pkc-textlog-text-pending"
       data-pkc-region="textlog-text-placeholder"
       aria-hidden="true"></div>
</article>
```

- **外殻 article**: class に `pkc-textlog-log-pending` を追加。`id` / `data-pkc-log-id` / `data-pkc-lid` は実体と同値
- **header**: flag ボタン・timestamp・anchor ボタンは初期段階から描画（軽量）。ユーザはスクロールせずとも「どの時刻のログが存在するか」が見える
- **text body**: `div.pkc-textlog-text-pending` を空で emit。`aria-hidden="true"` で screen reader からは隠す
- `data-pkc-hydrated="false"` が hydrate 済み判定の唯一の source of truth

### 5-2. CSS（v1 default）

placeholder の高さと見た目は **CSS のみで表現**（JS による動的高さ推定はしない）。

```css
.pkc-textlog-log-pending .pkc-textlog-text-pending {
  /* Reserve vertical space so hydrate-time shifts don't jolt
     users scrolling above. 160px ≒ 1 screenshot article の
     typical height + α (v1 default). */
  min-height: 160px;
  background: repeating-linear-gradient(
    45deg,
    var(--c-placeholder-bg, rgba(128,128,128,0.04)) 0 8px,
    transparent 8px 16px
  );
  border-radius: 4px;
}

.pkc-textlog-log-pending .pkc-textlog-text-pending::after {
  content: '⏳';
  display: block;
  text-align: center;
  opacity: 0.35;
  padding: 0.5em;
}
```

- 固定 `min-height`: scroll 位置のジャンプを抑える。文字主体の article で 160px が大きすぎるケースはあるが、v1 では一律とする（audit で per-log 高さ推定に置き換え可否を再評価）
- aspect-ratio による高さ推定は画像数・寸法が未知のため不可（原文 markdown からの画像数カウントは v1 の scope 外）
- アニメーションなし（spinner を出さない — I-TIP5 の要件は「存在が分かる」であって「waiting UI」ではない）

### 5-3. 画像存在の視覚化（I-TIP5）

- header 行（flag / timestamp / anchor）は placeholder でも表示される → 「このログはある」が視覚的に分かる
- body placeholder は斜めストライプ + ⏳ で「まだ実体化していない」が分かる
- hydrate 完了後は `pkc-textlog-log-pending` クラスが外れ、通常の article 表示に置き換わる

## 6. Edit → read 切替と re-render

### 6-1. 方針（D-TIP6）

edit → read 復帰時の `renderBody` 再呼び出しでも **staged 化を維持**する。minimum scope §1-4 で触れられた「save 後の再 render が重い」問題を救う。

| phase | renderBody 呼び出し | staged 化 |
|-------|-----------------|---------|
| 初期表示（エントリ選択） | あり | **する** |
| edit 突入（BEGIN_EDIT） | `renderEditorBody` に切替 | N/A（edit は元々軽い） |
| edit commit（save） | 再び `renderBody` | **する** |
| edit cancel | 再び `renderBody` | **する** |
| selection mode 切替 | `renderBody` 再構築 | **する** |

### 6-2. scroll 位置の扱い

edit → read 復帰時、新しい docEl では **先頭 k 件のみ hydrate 済**で、残りは placeholder。復帰直後の scrollTop は renderer 層が復元する（既存挙動）ため、scroll 位置が placeholder 領域であっても IntersectionObserver が即座に発火して該当 article を hydrate する。

- `rootMargin: '400px'`（§4-2）により、scrollTop 付近の article は 1 tick 以内に hydrate される
- 先読み（§4-3）も復帰時に再度走るため、scrollTop 周辺 ± 数件は短期間で実体化する
- I-TIP1 違反は起きない（「入場した article は必ず hydrate される」ことが保証される）

### 6-3. 編集対象 article 自身の扱い

edit 対象 log article は、`renderEditorBody` → textarea 描画経路で既に **asset 解決対象外**（minimum scope §1-4）。commit 後の read 復帰時は、初期 render 件数の範囲に入っていれば即 hydrate、範囲外なら placeholder → hydrate trigger 待ち。

## 7. Print / export bypass

### 7-1. 原則（I-TIP10）

print / export 時は staged 処理を **bypass** し、**全 article を同期的に hydrate** する。静的出力物（PDF / export HTML）に placeholder が残っていたら違反。

### 7-2. Trigger

以下のいずれかが観測された時点で **強制全 hydrate** を走らせる:

| Trigger | 実装手段 |
|---------|---------|
| `window.matchMedia('print').matches` | print preview 起動時に docEl 上の placeholder を全走査し hydrate |
| `beforeprint` event | 同上。`addEventListener('beforeprint', forceHydrateAll)` |
| export 経路（HTML Full / selected-only） | export builder（`src/adapter/platform/export-*.ts` 系）が serializer を呼ぶ前に docEl の存在を確認し、staged 状態の DOM を直接 serialize しない。export は `container.entries[n].body` + `container.assets` から再構築するため **そもそも staged DOM を通らない**（I-TIP4 は別経路で担保） |

### 7-3. 擬似コード

```ts
function forceHydrateAll(docEl: HTMLElement, ctxMap: Map<string, HydratorContext>): void {
  const placeholders = docEl.querySelectorAll<HTMLElement>(
    '[data-pkc-hydrated="false"]',
  );
  for (const ph of placeholders) {
    const ctx = ctxMap.get(ph.dataset.pkcLogId!);
    if (ctx) hydrateArticle(ph, ctx);
  }
}

// renderBody 内で beforeprint hook を設定
window.addEventListener('beforeprint', () => forceHydrateAll(docEl, ctxMap), { once: false });
```

`once: false` は複数回の print にも対応するため。teardown 時に removeEventListener する。

### 7-4. export 経路の非依存性

HTML export / ZIP export は DOM を直接 serialize しない。`container` を `.body` 文字列から再構築するため、**staged DOM の状態に依存しない**。I-TIP4 は export builder 側の既存実装で既に担保されており、本 contract は追加の保護を入れない。

ただし **DOM snapshot 的な挙動**（例: `document.documentElement.outerHTML` を丸ごと保存する将来機能）が入る場合は I-TIP10 に反するため、その時点で本 contract を再訪する。

## 8. 不変条件（I-TIP1〜I-TIP10）

minimum scope §5 で列挙された不変条件を contract 粒度に昇格する。

| # | 不変条件 | 違反条件（contract level） | 確認手段 |
|---|---------|-----------------------|---------|
| **I-TIP1** | 画像消失禁止 | placeholder に入場した article が hydrate されない / 実体化後の `<img src>` が欠ける | Testability §10 の T-TIP01 / T-TIP02 |
| **I-TIP2** | 保存データを変更しない | `container.entries[n].body` / `container.assets` への write が発生する | `I-TIP2` is a structural invariant: staged 化は read path のみ。write path を触らない |
| **I-TIP3** | `resolveAssetReferences` 出力の同値性 | staged 化前後で同一入力 → 同一出力が壊れる | 既存 unit test（asset-resolver.test.ts）全通過 |
| **I-TIP4** | export 経路を壊さない | export された HTML / ZIP で画像が欠落する / placeholder が残る | 既存 export test 全通過 + print snapshot |
| **I-TIP5** | 画像存在を見失わせない | placeholder に header（flag / timestamp / anchor）が描画されず、空白になる | T-TIP05（renderer test） |
| **I-TIP6** | TEXTLOG 以外を変えない | TEXT / TODO / form / attachment の presenter 呼び出しが変化する | 既存 presenter 系 test 全通過 |
| **I-TIP7** | paste pipeline 不変 | `action-binder.ts` の paste / drop / attach 経路の staged 側への依存が入る | `git diff` で action-binder.ts の変更が無いこと |
| **I-TIP8** | 既存テスト全通過 | 1 件でも regression | CI（`npm test`） |
| **I-TIP9** | hydrate 完了後の DOM 同値性 | article 順序 / image 数 / data-* attributes / inner structure が一括処理と異なる | T-TIP09（snapshot comparison） |
| **I-TIP10** | print / export 時は全展開 | print 中に placeholder が残る / export HTML に placeholder 構造が流出する | §7 + T-TIP10 |

### 8-1. 新規追加の派生不変条件（D-TIP 由来）

| # | 内容 | 由来 |
|---|------|------|
| **I-TIP11** | `INITIAL_RENDER_ARTICLE_COUNT` と `LOOKAHEAD_ARTICLE_COUNT` は v1 default として定数で定義され、runtime 設定値を通さない | D-TIP2（audit 段階で調整可能） |
| **I-TIP12** | IntersectionObserver は `renderBody` 呼出しごとに新規作成され、古い docEl の観察はアンマウント時点で disconnect される | §4-4 |
| **I-TIP13** | placeholder article は実体 article と同一の `id` / `data-pkc-log-id` / `data-pkc-lid` を持つ | §5-1 |

## 9. エラー / フォールバック

### 9-1. IntersectionObserver 非対応

`typeof IntersectionObserver === 'undefined'` の環境では staged の trigger が立たない。フォールバック:

- **全 article を初期で hydrate する**（= staged を無効化）
- 警告は出さない（サイレントフォールバック）
- 実運用ブラウザ（Chrome / Firefox / Safari / Edge の近年バージョン）ではこの経路に入らない

```ts
function attachHydrator(docEl, ctxMap) {
  if (typeof IntersectionObserver === 'undefined') {
    forceHydrateAll(docEl, ctxMap);
    return;
  }
  // 通常経路
}
```

### 9-2. requestIdleCallback 非対応（Safari 等）

先読み hydrate（§4-3）は `requestAnimationFrame` へフォールバック。機能は変わらず、idle 検出の精度のみ低下する。

### 9-3. hydrate 中の例外

`renderLogArticle` / `resolveAssetReferences` / `renderMarkdown` のいずれかが throw した場合:

- 対象 placeholder は **そのまま残す**（差替えない）
- 次の IntersectionObserver 発火時 or 次の `renderBody` 呼び出し時に retry
- error は console.warn に集約（既存の markdown render error と同じ方針）
- I-TIP1 違反にはしない（「最終的に表示される」保証は scroll / retry で満たす）

### 9-4. 空 TEXTLOG / sections.length === 0

既存の empty state path を維持。staged 化は **sections が 1 件以上あるときのみ発動**する。

### 9-5. 初期 render 件数より log 数が少ない場合

`Math.min(articlesInOrder.length, INITIAL_RENDER_ARTICLE_COUNT)` で吸収。placeholder は 0 件になり、hydrator は observer を作成しない / 作成してもすぐ disconnect。

## 10. Testability matrix

| ID | 観点 | 種別 | 検証方法 |
|----|------|-----|---------|
| **T-TIP01** | 画像消失禁止（I-TIP1） | unit | 10 / 50 枚の TEXTLOG を renderBody → 全 placeholder を hydrate → `<img src>` 数が期待値と一致 |
| **T-TIP02** | scroll 入場で hydrate される | unit + happy-dom | IntersectionObserver を stub し、placeholder.dataset.pkcHydrated が "true" に変化することを確認 |
| **T-TIP03** | 初期 render 件数の上限 | unit | 20 件 TEXTLOG で初期 DOM 上の `[data-pkc-hydrated="true"]` 数が `INITIAL_RENDER_ARTICLE_COUNT` 以下 |
| **T-TIP04** | 先読み hydrate | unit | `requestIdleCallback` を stub → `LOOKAHEAD_ARTICLE_COUNT` 件が追加 hydrate される |
| **T-TIP05** | placeholder に header が出る（I-TIP5） | unit | placeholder に `.pkc-textlog-timestamp` / flag ボタン / anchor ボタンが存在 |
| **T-TIP06** | IO teardown（I-TIP12） | unit | 2 回目の renderBody 呼出しで 1 回目の observer が disconnect 済 |
| **T-TIP07** | TEXT / TODO 非影響（I-TIP6） | unit | 他 archetype の presenter test に変化なし |
| **T-TIP08** | paste / drop 経路不変（I-TIP7） | unit | `action-binder.ts` に diff が入らないことを PR review で担保（静的確認） |
| **T-TIP09** | hydrate 完了後の DOM 同値（I-TIP9） | unit | 一括 render の outerHTML と、staged 全 hydrate 後の outerHTML が同値（空白・data-pkc-hydrated 差分のみ除外） |
| **T-TIP10** | print bypass（I-TIP10） | unit | `beforeprint` 発火で forceHydrateAll が走り、placeholder が 0 件になる |
| **T-TIP11** | IntersectionObserver 非対応フォールバック | unit | IO を undefined に stub → 全 article が即 hydrate される |
| **T-TIP12** | hydrate 例外の隔離（§9-3） | unit | resolveAssetReferences を throw に差し替え → 該当 placeholder は残存し、他 article は通常経路で hydrate |
| **T-TIP13** | placeholder と実体の id 同一性（I-TIP13） | unit | hydrate 前後で `article.id` / `data-pkc-log-id` / `data-pkc-lid` が一致 |
| **T-TIP14** | edit → read 復帰で staged 維持（D-TIP6） | unit | BEGIN_EDIT → COMMIT_EDIT 後の renderBody で placeholder が存在する |
| **T-TIP15** | baseline 計測（D-TIP7） | e2e（Playwright） | 10 / 50 枚シナリオで初期 render 時間が閾値未満（§11） |

Happy-dom での IntersectionObserver 不足は既存の stub pattern（例: `tests/adapter/ui/scroll-container.test.ts` 系）と同じく `global.IntersectionObserver = class { observe(){} disconnect(){} unobserve(){} }` を注入する。

## 11. Baseline / acceptance threshold

### 11-1. 計測方式（D-TIP7）

Playwright + Chromium headless で e2e ベンチを実施。手動 DevTools 計測はベースライン参考にのみ使い、回帰検知の正として Playwright 結果を採用する。

### 11-2. 計測シナリオ（実データ必須）

rev.2.1 の教訓に従い、**200 KB fake BMP は使わない**。1-3 MB の実画像（または同等サイズの PNG）を使う。

| シナリオ | 画像数 | 画像サイズ | 目的 |
|---------|-------|----------|------|
| baseline-0 | 0 枚 | — | staged 経路のオーバーヘッド上限確認 |
| baseline-10 | 10 枚 | 1 MB 級 | 中規模の典型 |
| baseline-50 | 50 枚 | 1-3 MB 級 | 重量級 |
| baseline-mixed | 20 枚 + テキスト 100 行 | 1-3 MB 級 | 混在パターン |

### 11-3. 指標と閾値（v1 default）

「改善の定量基準」をここで固定する。audit 段階で妥当性を評価し、必要なら v1.x で再調整。

| 指標 | baseline-10 目標 | baseline-50 目標 |
|------|---------------|---------------|
| 初期 render 時間（`renderBody` 呼出し → 初期 k 件 DOM 挿入完了） | **< 300 ms** | **< 500 ms** |
| main thread long task 合計（初期 1 秒間） | **< 500 ms** | **< 800 ms** |
| viewport 内画像の decode 完了 | **< 800 ms** | **< 1200 ms** |
| scroll jank frame 数（5 秒スクロール中） | **0 件** | **< 5 件** |
| edit→read 復帰後の初期 render 時間 | **< 300 ms** | **< 500 ms** |

### 11-4. regression 判定

audit で以下のいずれかが満たされない場合、regression として扱い設計を戻す:

- baseline 対比で該当指標が悪化している
- I-TIP1〜I-TIP13 のいずれかで違反を観測
- 既存テストのうち 1 件でも fail

### 11-5. 計測の実施タイミング

| タイミング | 実施内容 |
|----------|---------|
| contract 確定直後（= 実装開始前） | 現行コードの baseline-0 / 10 / 50 / mixed を記録 |
| implementation 完了時 | 同シナリオで計測。§11-3 の閾値と照合 |
| audit | regression 判定。必要なら定数調整（`INITIAL_RENDER_ARTICLE_COUNT` 等） |

## 12. 非対象・v1.x 候補

### 12-1. 恒久棄却（再検討しない）

| 施策 | 棄却理由 |
|------|---------|
| `loading="lazy"` | spike 実測で悪化を確認済み（render time 2x）。data URI に対しては仕組みが効かない |

### 12-2. v1 非採用・v1.x 以降で再評価候補

| 施策 | 再評価条件 | 期待効果 | 判断時期 |
|------|---------|---------|---------|
| `decoding="async"` | staged render で前段コストが解消された後、**1-3 MB 実データで再測定**して decode コストが支配的なら採用 | 残存 decode コストの main thread 解放 | FI-03 audit |
| Blob URL 化（`URL.createObjectURL`） | hydrate trigger 時点で data URI → Blob URL 変換を挟む。DOM 内文字列長を短縮、image cache 有効化 | メモリ効率 / 巨大 DOM の軽量化 | FI-03 audit または v1.x |
| Web Worker による markdown parse | 初期 article の parse 自体が遅い場合 | main thread 解放 | v1.x |
| virtualization（article DOM 破棄 / 再生成） | 10000 件超の極端な TEXTLOG で scroll パフォーマンスが足りない場合 | 無限スクロール対応 | v2 相当（scope 外） |
| placeholder 高さの per-log 推定 | 文字主体 article と画像主体 article の高さ差が jank の原因になる場合 | scroll 位置の精度向上 | FI-03 audit |
| hydrate trigger の scroll container 明示指定 | PKC2 以外への流用時 | 再利用性 | v1.x |

### 12-3. 別 FI に分離済み

| 施策 | 担当 FI |
|------|-------|
| 画像圧縮 / 再エンコード | image-intake-optimization v1（完了） |
| paste 時 MIME 変換 / 原画保持 | 同上 |

### 12-4. 本 contract で扱わない

- scroll 位置復元ロジック（renderer 層の既存挙動に依存）
- asset の外部 CDN 化（single-HTML / offline-first に反する）
- 画像 LQIP（低品質プレビュー）

---

## References

### 親文書

- minimum scope: `docs/spec/textlog-image-perf-v1-minimum-scope.md` rev.2.1
- file issue: `docs/planning/file-issues/03_perf-textlog-image-lazy-rendering.md`
- spike result: `docs/development/archived/fi-audits/fi-03-spike-native-lazy-result.md`

### sibling / 補完

- 画像取り込み最適化 v1 contract: `docs/spec/image-intake-optimization-v1-behavior-contract.md` rev.1.1
- 画像取り込み最適化 v1 audit: `docs/development/archived/image-intake-optimization/image-intake-optimization-v1-audit.md`

### 実装対象コード

- `src/adapter/ui/textlog-presenter.ts` — `renderBody` / `renderLogArticle`
- `src/features/markdown/asset-resolver.ts` — `resolveAssetReferences`（呼び出しタイミング制御対象）
- `src/features/markdown/markdown-render.ts` — `renderMarkdown`（変更なし、staged render の配下）
- `src/adapter/ui/renderer.ts` — 全体 render loop（docEl アンマウント時の cleanup hook 拡張点）

### 新規モジュール想定

- `src/adapter/ui/textlog-hydrator.ts` — IntersectionObserver 管理・hydrate trigger・teardown
