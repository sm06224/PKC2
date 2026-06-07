# Bundle 5MB 引き算 audit(L1 #767)

> 2026-06-07。方針正本 [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md) §6 L1 の deliverable。
> #760 rollup の bundle.js を **機能 / dep 単位に分解**し、「何を削れば何 KB 戻るか」を確定する。subtract(L2 [#763](https://github.com/sm06224/pkc2/issues/763) / [#769](https://github.com/sm06224/pkc2/issues/769))の意思決定材料。

## 計測手段

`build/scripts/bundle-audit.mjs`(`npm run audit:bundle`)。esbuild の **metafile**(`bytesInOutput` = 各 input が minified output に寄与する実バイト数)で input → 機能バケットへ集計する。

- 本番ビルドは Vite + terser(2-pass / toplevel mangle)。esbuild は `format:'iife'` で dynamic import を inline する = 本番 `inlineDynamicImports:true` と同じ**単一 bundle 構成**を再現する。
- 絶対値は terser と ~3% 程度ずれる(下記)。だが**機能間の相対寄与(=何を削れば効くか)は正確**で、subtract 判断には十分。
- CSS は本番では bundle.js に入らない(`cssCodeSplit:false` → bundle.css)。本監査は **JS サイズのみ**。

| | esbuild 実測 | Vite 本番 dist | 差 |
|---|---|---|---|
| main(baseline) | 1901.7 KB | 1873.8 KB | +1.5% |
| #760 rollup | 5515.7 KB | 5360.9 KB | +2.9% |

## §1 現状サマリ

- **現 main(着地済の baseline)= 約 1874 KB**。dist は #760 前の状態。
- **#760 rollup = 約 5361 KB(2.86×)**。"もっさり" の主因。`inlineDynamicImports:true` で全 dynamic import が bundle.js に inline 化され、parse/eval が単一 bundle で走る。
- **#760 は bundle の 76% が third-party dep**(baseline は 46%)。アプリの 3/4 が外部ライブラリ。

## §2 baseline(現 main 1902 KB)の内訳

| バケット | KB | % | 区分 |
|---|---|---|---|
| `src:adapter/ui` | 645.2 | 33.9 | app(renderer / action-binder / presenter)|
| `dep:docx` | 361.3 | 19.0 | Word export |
| `dep:pptxgenjs` | 268.7 | 14.1 | PPT export |
| `dep:jszip` | 95.5 | 5.0 | docx/pptx の zip 生成(transitive)|
| `src:features/ast` | 78.8 | 4.1 | export pipeline + IR + parse |
| `dep:entities` | 75.6 | 4.0 | markdown-it の HTML entity 表(transitive)|
| `src:features/markdown` | 60.6 | 3.2 | markdown render |
| `src:adapter/platform` | 50.9 | 2.7 | IndexedDB / 圧縮 / export-import |
| `dep:markdown-it` | 49.0 | 2.6 | markdown parser |
| `src:adapter/state` | 48.4 | 2.5 | reducer / dispatcher |

- deps 合計 **876.5 KB(46.1%)** / app 合計 **1023.7 KB(53.8%)**。
- **baseline の時点で Word/PPT export(docx+pptx+jszip)= 725.5 KB = bundle の 38%**。これらは `export-docx.ts` / `export-pptx.ts` から `await import()` される動的 import だが、`inlineDynamicImports:true` で bundle.js に inline 化されており **export を一度も使わなくても parse コストを常時負担**している。

## §3 #760 rollup(5516 KB)の内訳 — mermaid 生態系が過半

| バケット | KB | % |
|---|---|---|
| `dep:mermaid` | 1268.6 | 23.0 |
| `src:adapter/ui` | 885.6 | 16.1 |
| `dep:@mermaid-js/parser` | 603.6 | 10.9 |
| `dep:cytoscape` | 437.0 | 7.9 |
| `dep:docx` | 363.4 | 6.6 |
| `dep:pptxgenjs` | 268.9 | 4.9 |
| `dep:katex` | 266.1 | 4.8 |
| `dep:chart.js` | 180.5 | 3.3 |
| `dep:layout-base` | 108.7 | 2.0 |
| `dep:jszip` | 95.7 | 1.7 |
| `src:features/spreadsheet` | 26.6 | 0.5 |

### ecosystem 単位の集計

| ecosystem | main | #760 | delta |
|---|---|---|---|
| **mermaid 生態系(~55 pkg)** | 0 | **3125.3** | **+3125.3** |
| chart.js(+@kurkle/color) | 0 | 188.0 | +188.0 |
| Word/PPT export(docx+pptx+jszip)| 725.5 | 728.0 | +2.5 |
| markdown-it core | 150.9 | 151.4 | +0.5 |
| **TOTAL bundle** | **1901.7** | **5515.7** | **+3614.0** |
| └ deps | 876.5 | 4192.7 | +3316.2 |
| └ app(src)| 1023.7 | 1318.8 | +295.1 |

> **mermaid 単体(+依存 55 個)= #760 bundle の 56.7%(3.1MB)**。markdown 内のダイアグラム描画のためだけに、cytoscape / katex / d3 全スイート / dagre / roughjs / marked / dompurify / dayjs / lodash-es 等を引き込む。これが +3.6MB の正体。app コード(src)の増分は +295 KB に過ぎず、**肥大はほぼ全て dep**。

mermaid 生態系の主な内訳:`mermaid`(1269)/ `@mermaid-js/parser`(604)/ `cytoscape`(437)/ `katex`(266)/ `layout-base`(109)/ `cose-base`(64)/ `lodash-es`(40)/ `marked`(40)/ `dagre-d3-es`(33)/ `roughjs`(27)/ `dompurify`(27)/ d3-* 一式(~120)/ `@upsetjs/venn.js`(19)/ `dayjs`(18) ほか。

## §4 subtract 優先度マトリクス(体感影響 × KB × リスク)

| # | 機能 / dep | 戻る KB | 削除時の体感影響 | リスク | 推奨 |
|---|---|---|---|---|---|
| 1 | **mermaid ダイアグラム描画** | **~3125** | 低(ノート内ダイアグラムはニッチ) | 低〜中(markdown render 経路に隔離) | **DROP**(core から外す)or **L3 #772 PKC-Extensions に退避(遅延ロード)**。単独最大レバー。bundle 5516→~2390 KB |
| 2 | **chart.js** | ~188 | 低〜中 | 低 | **DROP / lazy**。spreadsheet(#755–758、凍結)に紐付く。#769 keep/drop と連動 |
| 3 | **Word/PPT export(docx+pptx+jszip)** | ~725 | 低(export は稀な明示操作) | 低〜中(機能維持・ロード方式のみ変更) | **真の遅延化**(inline せず初回 export 時ロード)or **#772 へ退避**。baseline 最大レバー(現 main でも 38%)|
| 4 | `src:adapter/ui`(645→886) | — | — | — | **subtract 対象外**(core UI)。full re-render 局所化 [#768](https://github.com/sm06224/pkc2/issues/768) の perf 対象。+240KB 増分は markdown v4 / spreadsheet presenter |
| 5 | `dep:entities`(75.6) | ~75 | 低 | 中(markdown render の正当性) | 低優先。markdown-it core の一部、原則 keep |

### 削減シナリオ(積み上げ)

| シナリオ | bundle | 対 #760 |
|---|---|---|
| #760 現状 | 5516 KB | — |
| + mermaid DROP | ~2390 KB | −3126 |
| + chart.js DROP | ~2202 KB | −3314 |
| + export を真の遅延化(parse 経路から除外)| ~1477 KB | −4039 |

> **天井**: 重量級オプショナル renderer(mermaid / chart.js / docx-pptx export)を core から外す/遅延化すると、core bundle は **~1477 KB**(現 main baseline すら下回る)まで戻せる。これは North Star [#764](https://github.com/sm06224/pkc2/issues/764) / [#772 PKC-Extensions](https://github.com/sm06224/pkc2/issues/772)(「コアを薄く、多機能を extension に退避」)を**定量的に裏付ける**。

## §5 L2 / L3 への feed

- **[#769](https://github.com/sm06224/pkc2/issues/769) keep/drop 仕分け**: mermaid = DROP 第一候補(3.1MB)。chart.js = DROP(spreadsheet 連動)。spreadsheet 本体の app コードは 26.6KB と小さく、削減効果は同梱 chart.js 側にある。
- **[#763](https://github.com/sm06224/pkc2/issues/763) subtract epic**: 最大レバーは mermaid。次いで export の遅延化(baseline にも効く)。
- **[#772](https://github.com/sm06224/pkc2/issues/772) PKC-Extensions host(設計)**: 退避第一候補 = mermaid / chart.js / docx-pptx export。本監査がその KB と境界(全て `await import()` 済の動的 import 点 = `action-binder.ts` の export、markdown render 内の diagram 経路)を提供する。Extension host の最初の住人。
- **構造的注記**: `vite.config.ts` の `inlineDynamicImports:true` が「動的 import なのに parse コストは常時」という状態を作っている。単一 HTML invariant(invariant 3)を保ったまま遅延化するには、別 chunk を文字列として HTML に inline しつつ**初回利用まで eval しない**機構が要る(#772 の設計論点)。

## §6 再計測手順

```bash
npm run audit:bundle            # 現ツリーの bundle を機能/dep 単位で表示
npm run audit:bundle -- --json  # JSON 出力(ecosystem 集計などの後処理用)
```

#760 のような別ブランチを測る場合は worktree を作り、不足する runtime dep(`mermaid` / `chart.js` 等)を `npm install --no-save` してから `node <worktree>/build/scripts/bundle-audit.mjs` を実行する。
