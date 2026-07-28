# PKC2 デスクトップ版(単一実行ファイル)

`desktop/pkc2-host.ts` を Bun でコンパイルした単一実行ファイル。**xz 圧縮**で置いてある
(生 exe は 62〜114MB あり、git に入れると rebuild のたびに同じだけ増えて履歴から消せない)。

| ファイル | 展開後 | 対象 |
|---|---|---|
| `pkc2-desktop-windows-x64.exe.xz` | 114MB | Windows x64 |
| `pkc2-desktop-darwin-arm64.xz` | 62MB | macOS Apple Silicon |
| `pkc2-desktop-linux-x64.xz` | 98MB | Linux x64 |

## 使い方

```bash
# macOS / Linux
xz -d pkc2-desktop-linux-x64.xz
chmod +x pkc2-desktop-linux-x64
./pkc2-desktop-linux-x64
```

Windows は 7-Zip 等で展開して `.exe` を実行。

起動すると 127.0.0.1 の空きポートで待ち受け、**既定のブラウザが自動で開く**。

| 環境変数 | 既定 | 意味 |
|---|---|---|
| `PKC2_DB` | `~/.pkc2/pkc2.db` | sqlite の実ファイル |
| `PKC2_PORT` | 空きポート | 待ち受けポート |

`--no-webview` を付けるとブラウザを開かず URL だけ出す(ヘッドレス / harness 用)。
終了は Ctrl+C(SIGINT / SIGTERM で `db.close()` してから落ちる)。

## 何が違うのか(ブラウザ版との差)

- **storage の正本が host の実ファイル DB** になる。ブラウザ版(OPFS/IDB)とは
  **別のデータ**で、移行導線は無い
- native sqlite なので WAL / mmap が効き、`db.close()` が即座に OS へメモリを返す
- schema と RPC 語彙は**ブラウザ版と同一**(fork していない)

## 正直な注意

1. **署名していない**。Windows は SmartScreen、macOS は Gatekeeper に止められる
   (macOS: `xattr -d com.apple.quarantine pkc2-desktop-darwin-arm64`)
2. **Windows / macOS 版は起動確認をしていない**(クロスビルドのみ。CI が実行を
   検証しているのは Linux 版)
3. **Chromium の固定費は減らない**。webview バインディングが未検証のため exe は
   「HTTP で配って既定ブラウザを開く」形で、engine は user のブラウザのまま。
   詳細は `docs/development/single-exe-bun-webview-2026-07-27.md` §2

## 作り直し方

```bash
npm run build              # dist/pkc2.html(exe に埋め込む)
npm run build:desktop:all  # 3 OS 分
cd dist && xz -T0 -9e -k -f pkc2-desktop-*   # 圧縮して dist/desktop/ へ
```

CI(`.github/workflows/desktop-build.yml`)でも作られ、Actions の Artifacts から
**圧縮なしで**落とせる。
