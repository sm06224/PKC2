# Build-time assets(差し替えポイント)

`build/` 配下に置いた以下のファイルは `release-builder.ts` が build 時に
読み取って **dist/pkc2.html に data URI で inline** します。Single-HTML
deliverable のため外部参照不可、必ず inline。

## Favicon

優先順(最初に存在したもの 1 件のみ採用):

| 優先 | ファイル名 | MIME | 推奨用途 |
|----|---------|------|--------|
| 1 | `build/favicon.svg` | `image/svg+xml` | 最軽量 + crisp。modern browser で最良 |
| 2 | `build/favicon.png` | `image/png` | alpha 対応 + 互換性高い |
| 3 | `build/favicon.ico` | `image/x-icon` | legacy / Windows 向け fallback |

差し替え手順:
1. 上記いずれかのパスに新ファイルを置く(既存があれば上書き)
2. `npm run build` 再実行
3. dist/pkc2.html に inline 反映

不在時: `<link rel="icon">` 自体が出力されない(no-op)。

## Apple touch icon(iOS ホーム画面用、optional)

- `build/apple-touch-icon.png` に置くと `<link rel="apple-touch-icon">` を
  別途 inline。
- 推奨サイズ: 180×180 PXG with alpha。
- 不在時: iOS は favicon を fallback として使うので必須ではない。

## サイズ影響

ファイルは base64 化で **約 1.33 倍**に膨らんで HTML に埋め込まれる。
`npm run build:release` の出力に embed 済 KB が表示されるので参考に。
極端に大きい(数 100 KB)アイコンは bundle サイズ予算を圧迫するので注意。

## 実装場所

- shell template: `build/shell.html` の `{{FAVICON_LINK}}` placeholder
- 注入ロジック: `build/release-builder.ts` の `FAVICON_CANDIDATES`
  + `APPLE_TOUCH_ICON` 定数 + 該当 block
