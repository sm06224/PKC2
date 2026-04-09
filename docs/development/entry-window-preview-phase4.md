# entry-window preview Phase 4 — MIME-aware inline preview

## 目的

ダブルクリックで開く別ブラウザウィンドウ（entry-window）から
attachment エントリを開いたとき、Phase 3 までは
「Preview is available in the main window」と案内するだけの
行き止まり表示だった。

Phase 4 はこの行き止まりを解消し、MIME カテゴリに応じた
*インラインプレビュー + Open / Download アクション*、および
Light mode / データ欠落 / 未対応 MIME の各理由を明示する
フォールバックを提供する。併せて text / textlog エントリの
`![](asset:…)` 画像埋め込みと `[](asset:…)` 非画像チップも
別窓で解決された状態で表示されるように親→子のデータフローを
拡張する。

## スコープ

### In scope

- `EntryWindowAssetContext` 型による親→子アセットデータ受け渡し
- MIME カテゴリ別プレビューシェル（image / pdf / video / audio /
  html / svg / none）
- 子ウィンドウ側での base64 → Blob/DataURI/srcdoc 展開と
  Open in new tab / Download アクション
- 「Light export」「データ欠落」「ファイルなし」「未対応 MIME」の
  明示フォールバックメッセージ
- text / textlog 用の `resolvedBody` 受け渡しによる
  画像埋め込み・非画像チップの別窓内レンダリング
- 子→親 `pkc-entry-download-asset` postMessage による
  非画像チップのダウンロード委譲
- Blob URL ライフサイクル（`unload` 時に `revokeObjectURL`）
- テストとドキュメント

### Out of scope（意図的に次フェーズへ）

- edit モードの Preview タブでの asset reference 解決
  *（Resolved — see `edit-preview-asset-resolution.md`.）*
- PDF ビューワー内ナビゲーションや注釈
- video/audio のサムネイル生成・タイムライン取得
- HTML / SVG のサンドボックス許可 UI（常にエントリの
  `sandbox_allow` を読み出して適用）
- 大容量ファイル向けストリーミング・遅延読み込み
- 親⇔子の双方向ライブ同期（現状は open 時スナップショットのみ
  で、子の view-pane 内容は親で編集されても自動更新しない）
- 非 attachment / 非 text アーキタイプでの asset chip 解決
  （folder / generic / opaque / form / todo は対象外）

## 親→子データフロー

```
main window (親)
  └─ action-binder.ts: handleDblClickAction
       ├─ buildEntryWindowAssetContext(entry, state)
       │    ├─ attachment → { attachmentData, sandboxAllow }
       │    ├─ text/textlog → { resolvedBody }
       │    └─ other → undefined
       └─ openEntryWindow(entry, readonly, onSave, lightSource,
                           assetContext, onDownloadAsset)
              ├─ window.open('')
              ├─ document.write(buildWindowHtml(entry, readonly,
              │                                 lightSource, assetContext))
              └─ addEventListener('message', handleMessage)
                   ├─ 'pkc-entry-save'           → onSave(…)
                   └─ 'pkc-entry-download-asset' → onDownloadAsset(assetKey)

entry window (子)
  ├─ view-pane: renderedBody (renderViewBody で archetype 分岐済み)
  ├─ <script>:  pkcAttachmentData / pkcAttachmentMime / pkcSandboxAllow
  │    ├─ bootAttachmentPreview()
  │    │    ├─ image → <img>.src = data:<mime>;base64,…
  │    │    ├─ pdf   → <iframe>.src = blob URL (tracked)
  │    │    ├─ video → <video>.src = blob URL (tracked)
  │    │    ├─ audio → <audio>.src = blob URL (tracked)
  │    │    └─ html/svg → <iframe sandbox="allow-same-origin …">.srcdoc = UTF-8
  │    ├─ click delegation
  │    │    ├─ a[href^="#asset-"] → postMessage('pkc-entry-download-asset')
  │    │    └─ [data-pkc-ew-action] → open-attachment / download-attachment
  │    └─ unload → revokeObjectURL(pkcActiveBlobUrls[i])
```

### `EntryWindowAssetContext` の形

```ts
export interface EntryWindowAssetContext {
  attachmentData?: string;      // base64（attachment 用）
  sandboxAllow?: string[];      // HTML/SVG iframe 用
  resolvedBody?: string;        // text/textlog 用の事前解決済みマークダウン
}
```

すべて optional。どれかが欠けていれば「そのケースは明示的に
データなし」として子ウィンドウがフォールバックを描画する。

- **attachment**: `container.assets[att.asset_key]` → `attachmentData`。
  Light export や asset 削除で解決できなければ `attachmentData`
  は undefined のまま。`sandbox_allow` はエントリ本体から読み出し。
- **text / textlog**: 本体に asset reference が含まれる場合のみ
  `resolveAssetReferences(entry.body, {assets, mimeByKey, nameByKey})`
  を呼んで `resolvedBody` を埋める。ない場合は `undefined` を返し、
  子は `entry.body` をそのまま markdown-it にかける。
- **他**: `undefined`。子は Phase 3 以前の挙動にフォールバック。

## MIME マトリクス

`classifyPreviewType(mime)` は
`src/adapter/ui/attachment-presenter.ts` で定義されており、
Phase 4 でも再利用する。`isSvg(mime)` は SVG を検知して
`html` カテゴリとは別の `svg` ディスパッチ値を添える。

| MIME カテゴリ | 判定関数 | 子側の描画方法 | Open in new tab ボタン |
|---|---|---|---|
| image | `isPreviewableImage` → png/jpeg/gif/webp/bmp/ico | `<img>.src = data:<mime>;base64,…` | 表示 (🖼) |
| pdf   | `isPdf` → `application/pdf` | `<iframe>.src = blob URL` | 表示 (📄) |
| video | `^video/` | `<video controls>.src = blob URL` | 表示 (🎬) |
| audio | `^audio/` | `<audio controls>.src = blob URL` | 非表示 |
| html  | `isHtml` → `text/html` | `<iframe sandbox="allow-same-origin ${sandboxAllow}">.srcdoc = UTF-8` | 非表示 |
| svg   | `isSvg` → `image/svg+xml` | html と同じ sandbox 経路 | 非表示 |
| none  | 上記以外 | `<div>No inline preview for this file type.</div>` | 非表示 |

`data-pkc-ew-preview-type` 属性は SVG だけ `"svg"`、それ以外は
`classifyPreviewType` の返値と一致する。子スクリプトは
この属性を読んで分岐するだけで MIME 再解析は行わない。

### Download ボタン

MIME カテゴリによらず、データが利用可能なら常に
`📥 Download` ボタンを出す。子側で base64 → Blob → `<a download>`
を合成し、その場で revoke する。親の既存 `downloadAttachment`
経路は走らない（子ウィンドウのコンテキストで完結する）。

## フォールバックと安全性

### フォールバック文言

| 条件 | 表示 |
|---|---|
| `att.name` が空 | `No file attached.` (`pkc-ew-empty`) |
| Light export で bytes なし | `This is a Light export — attachment file data is not included. Re-export without Light mode to preview or download this file.` |
| asset_key あり & bytes なし | `File data is not available in this container. The asset may have been removed.` |
| asset_key なし & bytes なし | `File data is not available.` |
| 未対応 MIME (data あり) | info card + `No inline preview for this file type.` + Download |

すべて `.pkc-ew-preview-reason`（破線ボーダー）または
`.pkc-ew-preview-none`（イタリック muted）で描画。

### 安全性

- **raw HTML 禁止**: view-pane の markdown 経路は Phase 2 の
  `html: false` ハードニングが継続。Phase 4 で追加したのは
  `renderPreviewShell` が返す固定テンプレートのみで、ユーザ
  入力は全て `escapeForHtml` / `escapeForAttr` / `escapeForScript`
  を通る。
- **`javascript:` / `data:text/html` 不可**: プレビュー DOM は
  ハードコード済みの `<img>` / `<iframe>` / `<video>` / `<audio>`
  と `data:<mime>;base64,…` 固定テンプレートのみ。`mime` は
  親側の attachment body から取り、レンダリング直前まで属性として
  埋め込まれる（実行はしない）。
- **SVG サンドボックス維持**: SVG は `data-pkc-ew-preview-type="svg"`
  で html 経路に流され、`<iframe sandbox="allow-same-origin …">`
  で描画する。決して `<img src="data:image/svg+xml,…">` にはしない。
- **HTML `srcdoc` + allow-same-origin**: 単一ファイル HTML を
  原点つきで表示するため `srcdoc` 採用。`allow-same-origin` を
  ベースラインとし、エントリが宣言した `sandbox_allow` を追加する。
  `allow-scripts` を含めるかはエントリ側の宣言次第。
- **Blob URL ライフサイクル**: PDF / video / audio は
  `pkcActiveBlobUrls` に push し、`unload` 時に全件 revoke。
  `openAttachmentInNewTab` と `downloadAttachmentFromChild` が
  生成する一時 URL は `setTimeout(…, 500)` で即時 revoke。
- **非画像チップのダウンロード経路**: 子の `postMessage` →
  親の `handleMessage` → `downloadAttachmentByAssetKey` →
  既存 `downloadAttachment`。新しいダウンロード経路を作らず、
  Blob URL の生成・revoke は従来通り。
- **クロスオリジン防御**: 子→親 `postMessage` は `window.opener`
  経由のみ。親側は `e.source !== child` で自身が開いた子以外の
  メッセージを無視する。

## 非画像チップの扱い（text / textlog 本体内）

Task 2 の `resolveAssetReferences` は `[label](asset:key)` を
`[📄 label](#asset-<key>)` に書き換える。Phase 4 ではこの書き換え
を親側で済ませて `resolvedBody` として子に渡すため、子の
markdown-it は `#asset-<key>` フラグメントリンクを生成するだけで
済む（子側で `asset:` スキームを解釈する必要がない）。

### チップクリック → 親でのダウンロード

```js
document.addEventListener('click', function(e) {
  var chip = e.target.closest('a[href^="#asset-"]');
  if (chip) {
    e.preventDefault();
    var key = chip.getAttribute('href').slice('#asset-'.length);
    window.opener.postMessage(
      { type: 'pkc-entry-download-asset', assetKey: key },
      '*'
    );
  }
});
```

親側は `openEntryWindow(…, onDownloadAsset)` として渡された
コールバック経由で `downloadAttachmentByAssetKey(key, dispatcher)`
を呼び、`container.entries` を走査して該当する attachment エントリ
を見つけて `downloadAttachment(lid, dispatcher)` に委譲する。

結果、別窓と main window のどちらからチップを押しても
同一の Blob URL ライフサイクル・ファイル名・revoke タイミングに
なる。新しいダウンロード経路は存在しない。

### チップ CSS

`.pkc-md-rendered a[href^="#asset-"]` の属性セレクタで pill
スタイルを当てる。markdown-it が生成する `<a>` にクラスを
刺す手段はないため、selector の重複を厭わず子ウィンドウの
`<style>` にも同じ規則を入れている（親の `base.css` と対で
管理する）。

## レイヤリング

```
features/markdown/asset-resolver.ts   — resolveAssetReferences / hasAssetReferences
adapter/ui/entry-window.ts            — openEntryWindow + buildWindowHtml
                                         + renderAttachmentCard + renderPreviewShell
adapter/ui/action-binder.ts           — buildEntryWindowAssetContext
                                         + downloadAttachmentByAssetKey 再利用
adapter/ui/attachment-presenter.ts    — classifyPreviewType / isSvg 再利用
```

- `core` は無変更。
- `features/markdown/asset-resolver.ts` は Task 2 で確立した
  ピュア関数群をそのまま呼ぶだけ。
- adapter が DOM / postMessage / Blob URL の全責任を負う。
  子ウィンドウの `<script>` は `document.write` で組み立てた
  文字列リテラルの中にのみ存在し、TypeScript としては出力しない。

## テスト

### `tests/adapter/entry-window.test.ts`（+22 件 / 既存 1 件更新）

**Phase 4 — attachment preview**（14 件）
- image / pdf / video / audio の各スロット DOM 生成
- image が base64 を `<script>` 側に埋め込んでいること
- PDF プレビューに「Open in new tab」ボタンが出ること
- HTML プレビューが `allow-same-origin` を含む sandbox を要求すること
- SVG プレビューが `<img>` を生成せず html 経路を通ること
- 未対応 MIME が info card + Download + `No inline preview` を描画すること
- Light モード + bytes なし → 専用 reason / action row 非表示
- asset_key あり bytes なし → `not available` reason
- 空の attachment (`name` 空) → `pkc-ew-empty` 表示
- `assetContext` 省略時は Phase-3 以前の info card にフォールバック
- 旧来の body-data 形式でも context なしではプレビュー不可（info card のみ）
- `javascript:` / `data:text/html` が HTML に含まれないこと

**Phase 4 — text body asset resolution via resolvedBody**（3 件）
- `resolvedBody` が与えられたとき子は `entry.body` より
  そちらを優先すること
- resolvedBody 内の `#asset-<key>` フラグメントリンクが
  そのまま DOM に出ること
- `resolvedBody` が未指定のときは従来どおり `entry.body` に
  フォールバックすること

**Phase 4 — chip click and action-bar interception**（3 件）
- 子 `<script>` に `a[href^="#asset-"]` 用の `postMessage` 経路が
  含まれること
- `[data-pkc-ew-action]` 用の委譲ハンドラが含まれること
- `unload` で Blob URL を revoke する後片付けが含まれること

**Phase 4 — parent message handling**（2 件）
- `pkc-entry-download-asset` メッセージが `onDownloadAsset`
  コールバックに配線されること
- `onDownloadAsset` 未指定時はメッセージを無視すること

**既存テストの更新**（1 件）
- `"shows download note"` →
  `"no longer shows the Phase 3 'Preview is available in the main window' dead end"` に差し替え。
  Phase 3 の行き止まり文言が消えたことをピン留めする negative assertion。

### テストヘルパ

- `openAndCapture(entry, { readonly, lightSource, assetContext, onDownloadAsset })`
  — `vi.spyOn(window, 'open')` で `document.write` を傍受し、
  書き込まれた HTML 文字列を返す。Phase 4 で `assetContext` /
  `onDownloadAsset` 引数を追加した。
- `extractBodyView(html)` — `<div id="view-pane">` から
  `<div id="edit-pane"` 直前までを切り出し、子 `<script>` 内の
  文字列リテラル（`data-pkc-ew-preview-type` や
  `data-pkc-ew-action` を含む）を assertion 対象から除外する
  ためのスライサー。これがないと `expect(html).not.toContain(...)`
  が script 内の正規文字列に引っかかって偽陽性を起こす。

## 既知の制限

1. **edit モードの Preview タブ**: edit 中に Source/Preview を
   切り替えると、Preview 側は textarea の「生の」マークダウンを
   そのまま `renderMd` に渡すだけ。`![](asset:…)` や
   `[](asset:…)` は解決されず、そのままの文字列として描画される。
   初期表示（view モード）のみ resolvedBody を使う設計になって
   いるのはこのため。editor 側で編集中のリアルタイム解決は
   将来スコープ。
2. **巨大 attachment**: base64 本体を `<script>` リテラルに
   `JSON.stringify` で埋め込むため、数十 MB を越える attachment は
   `document.write` のコストが高い。Phase 4 は「普通の
   スクリーンショット・短い PDF・短い動画」を想定。巨大ファイルは
   main window の attachment エントリから扱ってもらう運用。
3. **ライブ同期なし**: entry-window を開いた瞬間のスナップショット
   を base64 文字列として埋め込むので、親側で attachment を
   再エクスポート・再取り込みしても子ウィンドウ内のプレビューは
   自動更新しない。子を閉じて開き直す必要がある。
4. **非画像チップは text / textlog 専用**: `resolveAssetReferences`
   は text / textlog のみを対象にしている。folder / generic /
   opaque / todo / form の本体に `[…](asset:…)` が含まれていても
   書き換えは走らず、子ウィンドウでは `asset:` スキームのままの
   link として出るため、クリックしても何も起きない（ただし
   `SAFE_URL_RE` の allowlist に含まれないので markdown-it が
   リンク自体を破棄する挙動になる）。対応は将来スコープ。
5. **sandbox の allow フラグ**: `sandbox_allow` は attachment 本体
   に書かれた宣言をそのまま子に渡すだけで、UI からの再設定や
   「サンドボックス警告」のようなモーダルは出さない。`allow-scripts`
   が含まれる場合の既知リスクは `attachment-preview-strategy.md`
   を参照。
6. **親ウィンドウ非 focused のフォーカス挙動**: 既存の
   `openWindows` Map で重複開きを検知したとき `existing.focus()`
   するだけで、子側にアセットコンテキストの差分更新を流し込む
   経路はない。最新のコンテキストで開き直すには一旦子を閉じて
   から main window でダブルクリックし直す必要がある。

## 将来スコープ

1. **edit モードでのライブ解決** — Preview タブを押したとき
   親側に `pkc-entry-preview-resolve` を投げて最新の resolvedBody
   を受け取るか、features/markdown を子ウィンドウにも埋め込むか。
2. **PDF.js などの本格ビューワー統合** — 現状は `<iframe>.src`
   に blob URL を渡すだけなのでブラウザネイティブのビューワー
   依存。ページめくり・検索・注釈は別レイヤ。
3. **audio / video のタイムライン対応** — 動画の冒頭サムネや
   chaptered metadata を表示。
4. **親⇔子ライブ同期** — 親で attachment が更新されたら子の
   プレビューを diff 更新する双方向チャネル。`openWindows` に
   対して broadcast する形。
5. **大容量ファイルのストリーミング** — 親→子の `postMessage`
   経由で base64 を分割送信 → 子で `Blob` を逐次構築。
6. **非画像チップの全アーキタイプ対応** — generic / opaque /
   form / todo 本体の markdown 互換テキストにもチップ解決を
   適用する。
7. **アセットピッカー統合** — 別窓の edit モードからも
   `/asset` スラッシュコマンドを打てるようにする。

## 不変条件（依然維持）

- **5 層構造** — resolver は features、preview shell と
  postMessage 経路は adapter。`core` は無変更。
- **core に browser API を入れない** — Phase 4 も例外なし。
- **コンテナが唯一の真実** — 子ウィンドウは open 時スナップショット
  を持つだけで、container 自体は親の dispatcher が排他的に管理。
- **`html: false` ハードニング** — markdown-it 側は無変更。
- **`SAFE_URL_RE` allowlist** — 変更なし。`#asset-…` は既に
  Phase 2 で admit 済み。
- **新規 archetype / 新規 UserAction / schema 変更なし** —
  `EntryWindowAssetContext` は adapter 内部の DTO にすぎない。

## ハード制限（今回も維持）

- マークダウン本体への raw HTML は不可。
- 子ウィンドウ内の `<script>` は固定文字列リテラルだけで
  構成し、ユーザ入力は `JSON.stringify` / HTML エスケープで
  必ず数値・文字列・属性として埋め込む。
- クロスオリジンフェッチなし。すべての asset バイトは
  container の中にある。
