# 単一 exe 版(Bun + webview)── 設計 doc(実装しない・user 裁定待ち)

> 「chrome 系の天使の取り分が大きいのは変わらん。だから、Bun による webview を
>  使用した単一 exe 版も併せてリリースしたい」(user 指示 2026-07-27)
> 「私はその基盤部分が一番でかいと言ってる」(同)

## 0. TL;DR(先に結論)

1. 本 doc は**設計 doc であり実装計画ではない**(プライム・ディレクティブの許可作業⑥)
2. 🔴 **期待に対する正直な答え**: **Windows では engine の固定費は減らない。**
   WebView2 は Chromium そのもので、Microsoft 公式が「each control launches
   multiple browser engine processes」と明記している。exe が変えるのは
   **「Chromium を誰が配るか」であって「Chromium が常駐するか」ではない**
3. 減るのは **user のブラウザが *その上に* 積んでいる分**(他タブ・拡張・
   予備 renderer)── これは実在するが、**PKC2 側の計測には現れない**
   (計器はいつも新規プロファイル・拡張なしで測っているため)
4. macOS(WKWebView)だけは engine が別系統で原理的に得がありうるが**未検証**、
   公開実測(Tauri #5889)はむしろ逆を示している。Linux は WebKitGTK 6 依存で
   現状 exe が起動すらしない
5. **一方で、exe には別種の実測できる利得がある**(§3)── native sqlite の
   実効能力と asset の真のゼロコピー。ここは wasm 版では原理的に届かない

⚠ これは「効果が小さいからやらない」ではない(user 指示③に照らして棄却理由に
しない)。主張は **「期待している効果が、期待している場所に無い」** である。

## 1. 「基盤 0.8GB」の検算(2026-07-27 実測)

計器: `tests/bench/base-cost-breakdown.mjs`(headless chromium / プロセス種別)

| 局面 | 総 RSS | 内訳 |
|---|---|---|
| **【A】about:blank のみ** | **0.66 GB** | browser 親 170MB / renderer 162MB(**2 プロセス**)/ zygote 125MB(2)/ NetworkService 97MB / gpu 77MB / StorageService 49MB |
| 【B】PKC2(空)を開いた後 | 0.89 GB | renderer 358MB(3 プロセス、+195MB)/ 他は +2〜18MB |

**読み方(ここを間違えると全部が崩れる)**:

1. 🔴 **A は既に「UI もタブも拡張も無い状態」の床** ── つまり **exe が与えるものと
   ほぼ同じ状態**である。exe にしても renderer / GPU / network / storage は要る。
   zygote は Linux 固有の fork 元で、webview でも同等物が要る
2. ⚠ **VmRSS 合計は共有ページを二重計上する**(chromium は 6 プロセスで
   バイナリを共有)。PSS で測ると 197〜282 MiB のレンジになる。
   **倍率や削減量を VmRSS 合計から書いてはならない**
3. ⚠ 自前の計器 2 本が PKC2 増分で **220MB vs 134-136MiB** と食い違っている。
   手法を固める前に費用対効果を語らない(2026-07 に 6 回反省した型)

## 2. 得られないもの / 得られるもの

**得られないもの(期待との差)**

| 期待 | 事実 |
|---|---|
| Chromium の固定費が消える | ❌ Windows は WebView2 = Chromium。engine の床は動かない |
| メモリが劇的に減る | ❌ 上記の A(0.66GB)はほぼそのまま必要 |
| Linux で軽くなる | ⚠ WebKitGTK は別系統だが、**現環境では WebKitGTK 6 が無く exe が起動しない**。実測できていない |
| macOS で軽くなる | ⚠ 原理的にはありうる。ただし公開実測は逆。**未検証** |

**得られるもの(実測裏付けあり)**

| 利得 | 実測 |
|---|---|
| **native sqlite の実効能力** | `PRAGMA mmap_size` が実際に効く(SAHPool は常に 0)/ WAL が使える / **`db.close()` で RSS 308.1 → 97.5MB と即座に OS へ返る**(wasm 版は worker terminate という重い手段が要る ── L1 で実装した) |
| **worker 常駐制約の消滅** | `createSyncAccessHandle` の worker 専用制約が原理的に無い。多重タブ lock も無い |
| **asset の真のゼロコピー** | `Bun.file()` ハンドルは **+0.6MB**、対して BLOB SELECT は **+105MB**(100MB asset)。user 指示「ゼロコピー」に最も忠実な形 |
| COOP/COEP をホストが付けられる | `crossOriginIsolated` が成立 = SAB 前提の最適化が解禁 |
| schema と RPC がそのまま動く | §4(実証済み) |

## 3. storage ── schema / RPC の流用(spike で実証済み)

`desktop/pkc2-host.ts`(2026-07-27 実装)で確認した:

- **`sqlite-schema.ts`(DDL / 行マッパ / 参照 diff)は 1 行も変えずに `bun:sqlite` で動いた** ──
  往復・additive フィールド(tags / entry_order)の extra 列往復・COUNT・参照 diff まで一致
- **`sqlite-rpc.ts` の op 語彙も無改造で実装できた** ── init / saveFull / applyOps /
  loadContainer(`skipRevisions` = P4a の deferred boot)/ revCounts / getDefaultCid を
  実測で往復。**worker の postMessage を HTTP POST に差し替えただけ**
- 単一実行ファイル: Linux 103.6MB(埋め込み HTML 4.07MB)/ host RSS 51.6MB(DB open 時 57.7MB)

🔴 **schema を exe 用に fork しない**。正本が 2 つになると Invariant 5(双方向互換)が
二重に破れる。spike は「無改造で動く」ことを実証したのであって、写しを作ってよいという
意味ではない。

## 4. 単一 HTML 哲学との関係 ── 2 案

| | 案 A: exe はシェルのみ | 案 B: ホスト DB 経路 |
|---|---|---|
| HTML | **1 バイトも変えない** | 2 本目の SqliteRpc client(IPC)+ ホスト検出を積む |
| storage | 従来どおり IDB/OPFS(ホストの sqlite は**一切使われない**) | ホストの bun:sqlite が正本 |
| storage 系の利得 | **ゼロ** | §2 の全部 |
| 単一 HTML への追加 | 無し | **経路が 1 本増える** |

⚠ 「同じ HTML が動く」と「同じ HTML がホスト DB を使う」は**別の話**。
無改造で webview に載せると前者にしかならない。

## 5. プライム・ディレクティブとの衝突(自分から先に書く)

単一 exe は現行方針で最大級の「足す」── 新ホスト / 新 IPC 層 / 2 本目の RPC client /
クロスビルド CI / 署名 / 更新導線 / asset 参照方式の変更が一度に増える。

既存の逆向き記述:
- `pkc2-vision-modern-emacs-2026-05.md:10`「Electron 不要」が 3 大差別化要因の 1 つ
- 同 :46-47 が Logseq/Obsidian の短所として Electron を挙げる
- `pkc-application-scope-vision.md:44-66`「single HTML product は不変(配布容易性)」
  「独自 runtime / engine 化(browser native を維持)」を最小スコープ外に置く

🔴 **「perf 施策だから許可作業②に入る」という論法で通そうとしないこと** ──
メモリの実効果が L1/L2/L3 側にある以上、その論法は事実にも反する。
これは**配布形態の追加**であり、user 裁定事項である。

## 6. 配布・保守コスト

- exe サイズ: Windows 114.2MiB / Linux 98.8MiB / macOS 62.5MiB
  (`--minify --bytecode` では減らない ── 実測でむしろ増えた)
- ⚠ **これは size budget の話ではない**。budget は bundle.js/css の tripwire
- CI: クロスビルド matrix / 署名(Windows Authenticode・macOS notarization)の
  **法人適格性の壁**があり、費用の問題に矮小化できない
- 更新導線: 単一 HTML は「新しいファイルを開くだけ」だったが、exe は更新機構が要る

## 7. 未確定 ── user 裁定が要る点

| # | 問い | 種別 |
|---|---|---|
| 1 | Invariant 3「Single HTML product」を**二製品化**してよいか。それとも PKC-extension 側へ外だしするか。設計 doc 止まりにするか | 不変条件 |
| 2 | exe 版の storage 正本はホスト DB(案 B)かブラウザ storage(案 A)か。同じ user が両方使ったときのデータ分岐をどう扱うか | 不変条件 |
| 3 | 対象 OS はどれか(Windows は engine 的に得が無い / macOS は未検証 / Linux は現状起動しない) | 方針 |
| 4 | 🔑 **主目的はどちらか** ── 「Chromium の engine 固定費を減らす」のか、「user のブラウザと同居しない」のか。**後者なら exe は有効**だが、それは user の環境に属するコストで PKC2 の計測には現れない | 期待の確認 |
| 5 | AGPL-3.0 とランタイム同梱の扱い | 法務 |

## 8. 最小の実証(spike)── ゲート方式

**S1(決定的・これだけで方向が決まる)**: 実機 webview で `dist/pkc2.html` を開き、
**継続使用(編集セッション)のメモリ**を測る。対照は同一マシンの
「新規プロファイル・拡張なしの Chrome にタブ 1 枚」。
指標は Windows = Private Working Set / macOS・Linux = PSS と USS の両方
(**RSS 合計は使わない**)。
⚠ user 指示⑤「boot 直後とか測ってない?意味ないからね」── boot 窓だけの計測は禁止。

**ゲート**: S1 が Windows で有意差を出さなければ、Windows 版の「メモリ」根拠は消える
(配布形態としての是非へ縮退)。

**S2(前提の検算)**: PSS/USS で【A】を測り直す(VmRSS 合計の二重計上を排除)。

現時点の spike: `desktop/pkc2-host.ts`(実装済み・schema と RPC の流用を実証)。
webview バインディングは本環境に WebKitGTK が無く未検証。

## 9. 参照

- 計器: `tests/bench/base-cost-breakdown.mjs` / `renderer-memory-breakdown.mjs`
- spike: `desktop/pkc2-host.ts`
- storage 設計: `storage-wasm-sqlite-design-2026-07.md`(§8-4 に allocator 内訳)
- 計測規律: `.claude/skills/perf-measurement/SKILL.md`
