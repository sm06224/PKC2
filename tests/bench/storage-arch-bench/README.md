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

headless 自動実行(このリポジトリの playwright を利用。**persistent プロファイルで
実ディスクを踏む** — ephemeral context は incognito 相当で storage がメモリバックに
なり実 I/O を測れない、という計測バグを 2026-07-22 に修正済):

```bash
TOTAL_MB=300 node tests/bench/storage-arch-bench/run-arch-bench.mjs
```

テキスト/履歴プレーンの**実デバイス書込バイト**比較(per-record vs チャンクパック
vs パック + gzip ストリーミング圧縮。/proc/diskstats を使うため Linux 前提):

```bash
node tests/bench/storage-arch-bench/io-bench.mjs
```

**syscall 計測**(AV/EDR フック渋滞の予測指標。strace が必要、Linux 前提):

```bash
# 回数(strace -c 集計)
CONFIGS=A,B,C,D,E TOTAL_MB=100 node tests/bench/storage-arch-bench/run-syscall-bench.mjs
# 頻度・フェーズ帰属・レイテンシ分布(strace -ttt -T + worker フェーズマーカー)
CONFIGS=A,B,C,D,E TOTAL_MB=100 node tests/bench/storage-arch-bench/run-syscall-profile.mjs
```

ベンチ HTML は `?autorun=1&config=X&size=Y` で単一構成を外部駆動できる。

## 計測結果(2026-07-22、Chromium headless / NVMe、実ディスク)

`docs/development/storage-v3-redesign-2026-07.md` の Appendix A を参照。要約:

- **E(IDB + Blob)が読み(0.8ms)と cold start(16ms)で最速**。投入・追記は
  B/C/D と同水準(C packfile が一括書きで最速)
- A(現行)は実ディスクで cold 11 秒/300MB・追記 6.6 秒
- **セグメントログ(1MB パック + gzip ストリーミング圧縮)で実ディスク書込 1/4.9**
  (io-bench、110MB revision ストリーム: 77.6MB → 15.8MB)
