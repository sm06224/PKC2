# storage-arch-bench — ストレージアーキテクチャ実測ハーネス(#967)

storage v3 の方式選定に使った実測ベンチ。**実機(自分のマシン・自分のディスク)でも
そのまま実行できる**スタンドアロン HTML です。5 構成を Web Worker 上で計測します:

| 構成 | 内容 |
|---|---|
| A | 現行: 単一 JSON + base64(OPFS 1 ファイル) |
| B | OPFS 個別ファイル(1 asset = 1 ファイル、SyncAccessHandle) |
| C | OPFS packfile + offset(単一 pack + 範囲読み) |
| D | SQLite WASM(公式 @sqlite.org/sqlite-wasm、OPFS SAHPool、BLOB 列)※ |
| E | IDB + Blob(v3 採用案) |

計測: 投入(全書込)/ コールドスタート / 1 件読み(~2MB → ObjectURL)/
10 件連続読み / 追記 10 件(1-5MB)。ワークロードは 100KB〜5MB の seeded asset で
総量 100/300/500MB を選択。

## 実機での実行方法

OPFS は secure context が必要なので、ローカル HTTP サーバ経由で開く:

```bash
cd tests/bench/storage-arch-bench
npx serve .           # または python3 -m http.server 8000
# → http://localhost:3000/storage-arch-bench.html を開いて「計測開始」
```

※ D(SQLite WASM)を動かす場合のみ、同ディレクトリに
`npm install @sqlite.org/sqlite-wasm` で `node_modules/` を用意する
(無ければ D は「module load failed」として skip され、他は動く)。

headless 自動実行(このリポジトリの playwright を利用):

```bash
TOTAL_MB=300 node tests/bench/storage-arch-bench/run-arch-bench.mjs
```

## 計測結果(2026-07-22、Chromium headless / NVMe)

`docs/development/storage-v3-redesign-2026-07.md` の実測 appendix を参照。
要約: **E(IDB + Blob)が全項目・全規模で最速**(300MB: 投入 0.66s / cold 8ms /
1 件読み 0.5ms / 追記 10 件 51ms)。A(現行)は 300MB で cold 3.3s・追記 5.1s、
他構成と同居するとメモリ圧で worker クラッシュも観測(user 実環境の OOM の再現)。
