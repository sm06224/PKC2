# Edit-mode Preview Asset Resolution

## 目的

entry-window 子ウィンドウの **編集モード Preview タブ** で、
`![alt](asset:key)` 画像埋め込みと `[label](asset:key)` 非画像チップが
解決されずに生 markdown のまま markdown-it に流れていた穴を塞ぐ。

Phase 4（`entry-window-preview-phase4.md`）は view-pane 側の
`resolvedBody` による初期レンダリングまでを整えたが、
**ユーザーが編集中に Preview タブへ切り替えたときの経路**は
親の `pkcRenderMarkdown()` を直接叩くだけで、resolver を通っていな
かった。このため

- 編集中に `![](asset:ast-xxx)` をタイプしても Preview で画像が出ない
- 非画像チップも生の `[label](asset:ast-xxx)` として表示される
- 保存→表示モードに戻ると突然解決される、という違和感が残る

という体験差があった。本 Issue はこのギャップを foundation レベルで
解消するのが目的。

## スコープ

### In scope

- entry-window 子ウィンドウの **Source ↔ Preview タブ切替** で、
  Preview タブ側が asset reference を解決するようにする
- `![alt](asset:key)` 画像埋め込み（Phase 1 resolver そのまま）
- `[label](asset:key)` 非画像チップ（Phase 2 resolver そのまま）
- `nameByKey` フォールバック、missing / unsupported マーカー、
  image-MIME 経由リンクの拒否など既存フォールバックを流用
- TEXT / TEXTLOG アーキタイプを対象
- 親スナップショット方式（Phase 4 と同じく window-open 時点）
- 子ウィンドウを閉じたときの context 解放
- 14 件のテスト追加
- ドキュメント

### Out of scope（意図的に次フェーズへ）

- メインウィンドウに Preview タブを新設すること
  （現状メインのエディタは textarea 単体、Preview タブは持たない）
- 編集中の親↔子ライブ同期（親で attachment を追加した瞬間に
  子の Preview へ反映する、など）
- folder / generic / opaque / form / todo への previewCtx 拡張
- picker / autocomplete との直接連携
- relation ベースのアセット解決
- 大容量 image の BLOB URL 化・メモリ最適化
- preview pane 再設計

## なぜ未解決だったのか

Phase 3 時点で子ウィンドウ側の `renderMd(text)` は次だった:

```js
function renderMd(text) {
  if (window.opener && typeof window.opener.pkcRenderMarkdown === 'function') {
    return window.opener.pkcRenderMarkdown(text);
  }
  // fallback escape
}
```

`pkcRenderMarkdown` は親側で:

```ts
(window as unknown as Record<string, unknown>).pkcRenderMarkdown = renderMarkdown;
```

と、stateless な `renderMarkdown` そのものを expose していたため、
「どの entry を開いているか」の情報がなく、そもそも resolver に必要な
`assets` / `mimeByKey` / `nameByKey` を渡しようがなかった。

Phase 4 では view-pane 用に親側で `resolvedBody` を作って子へ渡すことで
view の一貫性は確保したが、Preview タブは textarea の **現在値** を
使うため `resolvedBody`（open 時点の静的スナップショット）では代替
できず、別の経路が必要になる。

## どう解決したか

### 1. 親側に lid 付きヘルパを追加

`src/adapter/ui/entry-window.ts` に

```ts
const previewResolverContexts = new Map<string, AssetResolutionContext>();

function renderEntryPreview(lid: string, text: string): string {
  const ctx = previewResolverContexts.get(lid);
  if (ctx && text && hasAssetReferences(text)) {
    const resolved = resolveAssetReferences(text, ctx);
    return renderMarkdown(resolved);
  }
  return renderMarkdown(text ?? '');
}
(window as unknown as Record<string, unknown>).pkcRenderEntryPreview = renderEntryPreview;
```

を追加。`pkcRenderMarkdown` は互換のため残置し、`pkcRenderEntryPreview`
が新しい優先経路になる。

- context 未登録の lid → ただの `renderMarkdown` フォールバック
- text に asset ref なし → `hasAssetReferences` で即スキップ
- text に asset ref あり → resolver → markdown-it

という最小分岐のみで、既存 markdown renderer は一切触らない。

### 2. context の登録・解放を openEntryWindow に組み込む

`EntryWindowAssetContext` に `previewCtx?: AssetResolutionContext`
を追加し、`openEntryWindow` 内で:

```ts
if (assetContext?.previewCtx) {
  previewResolverContexts.set(entry.lid, assetContext.previewCtx);
}
```

でスナップショットを登録。`child.closed` を検知する close poll
に `previewResolverContexts.delete(entry.lid)` を追加して、
ウィンドウを閉じた瞬間に context を確実に解放する。

### 3. action-binder 側で previewCtx を構築

`src/adapter/ui/action-binder.ts` の `buildEntryWindowAssetContext`
は Phase 4 時点で `resolvedBody` のみ返していたが、ここを

```ts
const mimeByKey = collectAssetMimeMap(container);
const nameByKey = collectAssetNameMap(container);
const previewCtx = {
  assets: container.assets ?? {},
  mimeByKey,
  nameByKey,
};
const resolvedBody = entry.body && hasAssetReferences(entry.body)
  ? resolveAssetReferences(entry.body, previewCtx)
  : undefined;
return { resolvedBody, previewCtx };
```

に書き換え、**保存済み body に ref が無くても previewCtx は登録する**
ようにした。これはユーザーが編集中に新しい `![](asset:…)` を入力
するケースを正しく扱うために必要（body 側 resolver は saved body
の有無で skip できるが、Preview resolver はそうできない）。

### 4. 子スクリプト側 renderMd の優先経路を切替

`renderMd(text)` を次の順に変更:

1. `window.opener.pkcRenderEntryPreview(lid, text)` — 新経路
2. `window.opener.pkcRenderMarkdown(text)` — 旧経路（互換）
3. plain escape — cross-origin / closed 時のみ

子ウィンドウの `lid` は window-open 時に注入される `lid` 変数で
参照できるため追加の受け渡しは不要。

## 対象 archetype

| Archetype | 対応 | 備考 |
|---|---|---|
| text     | ✅ | 編集中の Preview タブで画像・チップとも解決 |
| textlog  | ✅ | textarea 直編集の表層で解決可能（後述の制限あり） |
| attachment | — | そもそも Preview タブを持たない（Phase 4 の info card + preview shell） |
| todo / form | — | 専用カード表示のため対象外 |
| folder / generic / opaque | — | 既存の markdown fallback のまま |

TEXTLOG については、entry-window 子ウィンドウの編集欄が
`body-edit` 単一 textarea である現状の制約から、**JSON 全体を
生 markdown として Preview する**形になる。ユーザーが本文の一部
として `[label](asset:ast-xxx)` を書けば、その部分は chip に解決
される。行単位エディタの Preview 化はスコープ外。

## フォールバックと安全性

新規コードは resolver と markdown-it の既存安全網をそのまま流用
するだけで、追加の安全処理は一切入れていない。

- `hasAssetReferences` で早期スキップ（タイプ途中の高頻度呼び出しで
  resolver 全体を走らせない）
- missing key → `*[missing asset: key]*`（sanitized key）
- MIME が allowlist 外 → `*[unsupported asset: key]*`
- `image/svg+xml` → `*[unsupported asset: key]*`（sandbox 維持）
- 画像 MIME にリンク形式 → `*[unsupported asset: key]*`
- `html: false` は不変
- `SAFE_URL_RE` は不変（`#asset-…` フラグメントは Phase 2 以前から許可）
- `javascript:` / `data:text/html` がレンダラ出力の href/src に
  入らないことを追加テストで pin

子スクリプト側の変更は `renderMd()` の分岐 1 個だけで、
外部通信（postMessage）・Blob URL ライフサイクル・DOM 構造には
触れていない。

## データフロー

```
parent window
  └─ action-binder.ts: handleDblClickAction
       └─ buildEntryWindowAssetContext(entry, state)
            └─ text / textlog → { resolvedBody?, previewCtx }
                                         │
  openEntryWindow(..., assetContext, ...) │
       ├─ previewResolverContexts.set(lid, previewCtx)  ← 登録
       ├─ window.open('')
       └─ close poll: previewResolverContexts.delete(lid)  ← 解放

child window (Source / Preview タブ)
  Preview → renderMd(textareaValue)
             └─ window.opener.pkcRenderEntryPreview(lid, text)
                  ├─ previewResolverContexts.get(lid)
                  ├─ hasAssetReferences(text)?
                  │    yes → resolveAssetReferences → renderMarkdown
                  │    no  → renderMarkdown(text)
                  └─ 戻り値 HTML を body-preview へ挿入
```

## 既知の制限

1. **スナップショット**: 親ウィンドウで新しい attachment を追加しても
   子ウィンドウを開き直さない限り `previewCtx` には反映されない。
   Phase 4 の `resolvedBody` と同じ設計で、一貫性のためにあえて live
   にしていない。
2. **TEXTLOG の行単位エディタ**: 子ウィンドウの編集は body 単一
   textarea なので、TEXTLOG の行単位 Preview は今回の対象外。
3. **メインウィンドウ**: メインのエディタにそもそも Preview タブが
   存在しないため、今回の対応はメインの編集体験には影響しない。
4. ~~複数ウィンドウの同一 lid 再 open~~ — **Resolved**（下記
   「重複 open 時の context refresh」節で解消済み）。
5. **`window.opener` 不可時**: cross-origin や親クローズ時は plain
   escape にフォールバック（既存挙動の維持）。

## テスト

`tests/adapter/entry-window.test.ts` の
`describe('Edit-preview asset resolution', …)` に 14 件追加:

- `pkcRenderEntryPreview` がグローバルに expose されている
- 子 `renderMd` が `pkcRenderEntryPreview(lid, text)` を優先
- 旧 `pkcRenderMarkdown` フォールバック経路が残っている
- context 未登録で plain markdown にフォールバック
- context 未登録で asset ref を解決しない（data URI / #asset- が出ない）
- context 登録で画像埋め込みが `data:image/png;base64,…` になる
- 非画像チップが `href="#asset-<key>"` + アイコンに化ける
- `nameByKey` フォールバック（空ラベル時のチップ表示）
- missing key で `*[missing asset: key]*` マーカー
- image/svg+xml で `*[unsupported asset: key]*` マーカー
- text に ref が無いときは resolver をスキップ
- 空文字 / undefined で throw しない
- `javascript:` / `data:text/html` が href/src に一切現れない、
  `<script>` が escape される
- 子ウィンドウ close 検知で context が解放される（再呼び出しで
  fallback に戻る）
- TEXTLOG でも同じ context が効く

## 次スコープ候補

1. **メインウィンドウの Source/Preview タブ導入**: 現状 textarea
   単体なので、メインでも編集中プレビューを出す案。
2. **非 text archetype への previewCtx 拡張**: generic / opaque
   など「textarea に markdown を書く可能性のある」アーキタイプにも
   同じ context を流す。
3. **ライブ同期**: 親で attachment 追加・削除が起きたとき、開いて
   いる子ウィンドウの `previewResolverContexts` を postMessage
   経由で更新する（現状は再 open 契機でしか refresh されない）。
4. **Autocomplete hover thumbnail**: 編集中の `asset:` オート補完
   ポップオーバーに resolver を通したサムネイル表示。

## 重複 open 時の context refresh

### 1. 変更点の要約

`openEntryWindow` の「既にこの lid を開いている場合は `focus()` して
早期 return する」パスに、`previewResolverContexts` の更新を 1 行だけ
差し込んだ。view-pane 側の HTML は最初の open 時に `document.write`
済みなので触らず、**編集 Preview 用 resolver の入力だけ**を新しい
スナップショットで差し替える。

### 2. 解決される問題

初期実装では、親ウィンドウ側で attachment を足してから同じ entry を
再 open しても、`openWindows.get(lid)` が既存の child を返した時点で
早期 return していたため、`previewResolverContexts` は **最初の
スナップショット** のまま据え置かれていた。結果として:

- 親で追加した新しい attachment が Preview タブで `*[missing asset: …]*`
  のままになる
- 逆に親で attachment を削除しても、Preview ではまだ古いデータで
  解決されてしまう
- 「一度閉じて再 open すればいい」という回避手順が必要になる

という違和感が残っていた。今回この経路を live に近い挙動にした。

### 3. スコープ

**In scope**

- `openEntryWindow` 重複 open 判定分岐内での
  `previewResolverContexts.set(entry.lid, assetContext.previewCtx)`
- caller が `previewCtx` を渡さなかった場合は **既存 context を保持**
  （clear しない "focus, don't downgrade" ポリシー）
- 新 child window を作らず、既存 child の `focus()` を維持
- テスト追加（後述）
- ドキュメント更新（本節 + 既知の制限項の移動）

**Out of scope**

- view-pane HTML の再描画（postMessage ラウンドトリップが必要なため
  別 Issue）
- 親 → 子への逆方向メッセージング（`pkc-entry-update-asset-context` 等）
- メインウィンドウの Preview タブ新設
- `folder` / `generic` / `opaque` / `form` / `todo` への previewCtx 拡張
- マルチインスタンス（複数タブ）間の同一 lid 競合

### 4. アプローチ

`src/adapter/ui/entry-window.ts` の冒頭（`openEntryWindow` 本体の
最初のブロック）:

```ts
const existing = openWindows.get(entry.lid);
if (existing && !existing.closed) {
  if (assetContext?.previewCtx) {
    previewResolverContexts.set(entry.lid, assetContext.previewCtx);
  }
  existing.focus();
  return;
}
```

設計上の三つのこだわり:

1. **責務の限定**: 重複 open 分岐が触るのは `previewResolverContexts`
   だけ。`openWindows`、`window.addEventListener('message', …)`、
   `pollClose`（`setInterval`）には一切触らない。既存のクローズ
   ポーラーが後で同じ lid を cleanup したときに、新しい context も
   まとめて `.delete()` されるので、ライフサイクルのズレは発生しない。
2. **スナップショット一貫性**: Phase 4 の `resolvedBody` および
   初期 open 時の `previewResolverContexts.set` と同じ「親が渡した
   瞬間の静的スナップショット」セマンティクスを維持する。live な
   親 → 子 push ではない。
3. **Downgrade しない**: `assetContext?.previewCtx` が undefined
   （= caller は focus 目的でしか呼んでいない）のときは既存エントリを
   **消さない**。保存→再 open の導線や、`EntryWindowAssetContext`
   を渡さない legacy caller が壊れないようにするための防御。

action-binder 側は変更なし。Phase 4 時点で `buildEntryWindowAssetContext`
が text/textlog について常に `previewCtx` を返すように修正済みのため、
二度目の dbl-click でも新鮮なスナップショットが自動的に供給される。

### 5. テスト

`tests/adapter/entry-window.test.ts` の
`describe('Duplicate-open context refresh', …)` に 9 件追加:

必須 7 件:

1. 初回 open で child が生成され、`previewCtx` が登録される
2. 重複 open 時に `window.open` は 2 度呼ばれず、`focus()` が走る
3. 重複 open で新しい `previewCtx` を渡すと
   `previewResolverContexts` が更新される（missing → data URI）
4. 更新後 `pkcRenderEntryPreview(lid, text)` が新 asset を解決する
5. close poll 経由で cleanup された後は、次の open が「重複」ではなく
   新規として扱われる（`window.open` が 2 回呼ばれる）
6. 一度も context を渡していない状態での重複 open は fallback を
   維持（resolver は走らない）
7. TEXTLOG archetype でも同じ refresh 経路が効く

任意 2 件:

- 重複 open 後の出力に `javascript:` / `data:text/html` が href/src と
  して現れない、`<script>` が escape される
- A → B → C 3 連続 refresh で、最後に asset を削除した C の状態が
  優先される（B で追加したものが C で missing に戻る）

`pkc-restricted-imports` lint と Phase 4 / Edit-preview テスト 82 件は
無変更で全通過。合計 91 件（+9）。

### 6. 次スコープ

本節の解決はスナップショット方式の枠内での改善であり、以下は引き続き
次スコープ候補として残る:

- 親で attachment を add/remove した **瞬間に** 子の
  `previewResolverContexts` を postMessage で push する live 同期
  （→ 次節「Live refresh foundation」で実装済み）
- view-pane HTML も一緒に再描画する場合の `pkc-entry-rerender` 内部
  メッセージ定義
- 複数タブ（マルチインスタンス）間の同一 lid 競合解決

---

## Live refresh foundation

### 1. 変更点の要約

親ウィンドウ側に `pushPreviewContextUpdate(lid, previewCtx)` を追加し、
同じ `previewCtx` の更新を **親マップと child window の両方** に
配信する単一エントリポイントを用意した。child 側は `message` listener
で `pkc-entry-update-preview-ctx` を受け取り、**local 変数
`childPreviewCtx`** に保存。`renderMd(text)` が
`window.opener.pkcRenderEntryPreview(lid, text, childPreviewCtx)` に
override 引数として渡すため、live 更新後に Preview タブを再描画した
時点で新 snapshot が反映される。

view-pane HTML は触らない。textarea の値も触らない。

### 2. なぜ再 open refresh だけでは不十分か

`Duplicate-open` 節で解消したのは **親が再 open を呼んだとき** の
snapshot 更新だけだった。つまりユーザーが子ウィンドウを開いたまま:

- 親側で attachment を追加・削除する
- それでも子の Preview タブは古い snapshot のまま

という状況は依然として再 open が唯一の回復手段だった。親が
attachment 追加・削除を検知した時点で child を能動的に更新する経路が
必要、というのが本節の動機。

### 3. live refresh の責務

**責務 (scope)**
- 親で変化した `previewCtx` を即時に child へ push
- 親マップ `previewResolverContexts` を単一ソースに近い状態に保つ
- child の Preview resolver 入力だけを差し替える

**責務外 (non-scope)**
- view-pane HTML の再描画（= `body-view` の再 `innerHTML`）
- Source textarea `body-edit` の value への介入
- 子 → 親 への逆同期
- save / conflict / download 系の既存プロトコルへの干渉
- マルチタブ（複数インスタンス）間の同期
- generic / opaque / form / todo archetype への拡張

「preview context live refresh」と「view rerender」を **別 Issue** と
して責務分離しているのがポイント。

### 4. なぜ view-pane rerender は out of scope か

view-pane HTML の再描画には、以下の追加機構が必要になる:

- child 側が「いま編集中かどうか」「Preview タブがアクティブかどうか」
  を ack する仕組み
- 親が `resolvedBody` を再計算して送り直す経路
- markdown renderer / asset resolver の child 側実行か、もしくは
  resolved HTML を送る protocol
- child 側編集中の dirty state との競合解決

これらはいずれも foundation の範囲を超えて entry-window の
state machine に踏み込むため、本節では **Preview タブのみ** に
制限した。view-pane rerender は次の独立 Issue として扱う。

### 5. textarea state には触らない

`pkc-entry-update-preview-ctx` の受信時にやることは次の 1 個だけ:

```js
childPreviewCtx = e.data.previewCtx || null;
```

`body-edit`（Source textarea）の `value` には一切代入しない。ユーザー
が編集中のテキストは完全に保護される。唯一の追加副作用は、**もし現在
Preview タブが表示されている** なら、その場で `body-preview` の
`innerHTML` だけを再生成して見えている表示を最新化することだけ
（`body-view` / `body-edit` は触らない）。

### 6. アプローチ

**親側**:

```ts
export const ENTRY_WINDOW_PREVIEW_CTX_UPDATE_MSG =
  'pkc-entry-update-preview-ctx';

export function pushPreviewContextUpdate(
  lid: string,
  previewCtx: AssetResolutionContext,
): boolean {
  previewResolverContexts.set(lid, previewCtx);
  const child = openWindows.get(lid);
  if (child && !child.closed) {
    child.postMessage(
      { type: ENTRY_WINDOW_PREVIEW_CTX_UPDATE_MSG, previewCtx },
      '*',
    );
    return true;
  }
  return false;
}
```

加えて `renderEntryPreview` に 3 番目の引数 `overrideCtx` を追加し、
override が指定されていればそれを優先。child の local snapshot を
parent helper に渡せるようにする:

```ts
function renderEntryPreview(
  lid: string,
  text: string,
  overrideCtx?: AssetResolutionContext | null,
): string {
  const ctx = overrideCtx ?? previewResolverContexts.get(lid);
  // ...
}
```

重複 open 分岐もこの helper 経由に切り替え、map の更新と child への
postMessage push を 1 関数にまとめた:

```ts
if (existing && !existing.closed) {
  if (assetContext?.previewCtx) {
    pushPreviewContextUpdate(entry.lid, assetContext.previewCtx);
  }
  existing.focus();
  return;
}
```

**子側**（inline script 内）:

```js
var childPreviewCtx = null;

function renderMd(text) {
  // ...
  return window.opener.pkcRenderEntryPreview(lid, text, childPreviewCtx);
  // ...
}

window.addEventListener('message', function (e) {
  // ...
  if (e.data && e.data.type === 'pkc-entry-update-preview-ctx') {
    childPreviewCtx = e.data.previewCtx || null;
    if (currentMode === 'edit' &&
        document.getElementById('body-preview').style.display !== 'none') {
      var src = document.getElementById('body-edit').value;
      document.getElementById('body-preview').innerHTML = renderMd(src);
    }
  }
});
```

### 7. データフロー

```
parent window
  attachment add/remove
    └─ (caller code) → pushPreviewContextUpdate(lid, freshCtx)
         ├─ previewResolverContexts.set(lid, freshCtx)
         └─ if (openWindows.get(lid) open)
              └─ child.postMessage({ type: 'pkc-entry-update-preview-ctx',
                                     previewCtx: freshCtx }, '*')

child window
  message listener
    └─ childPreviewCtx = e.data.previewCtx
    └─ (if Preview tab visible) body-preview.innerHTML = renderMd(...)

child window
  Preview tab switch / typing
    └─ renderMd(text)
         └─ window.opener.pkcRenderEntryPreview(lid, text, childPreviewCtx)
              ├─ ctx = childPreviewCtx ?? previewResolverContexts.get(lid)
              ├─ hasAssetReferences(text)?
              │    yes → resolveAssetReferences(text, ctx) → renderMarkdown
              │    no  → renderMarkdown(text)
              └─ 戻り値 HTML を body-preview へ挿入
```

### 8. テスト

`tests/adapter/entry-window.test.ts` の
`describe('Preview context live refresh foundation', …)` に 15 件追加:

必須 7 件:

1. `pushPreviewContextUpdate` が open child に
   `pkc-entry-update-preview-ctx` を送る
2. Preview タブ再描画で新 asset が解決される（overrideCtx 経路）
3. 削除相当の empty ctx push で `*[missing asset: …]*` に戻る
4. duplicate-open refresh と live refresh が両方 postMessage し、
   最後の更新が parent map に勝つ
5. Source textarea state が壊れない（`document.write` / `close` /
   `open` の呼び出し回数が初期 open 時と変わらない）
6. 一度も context を登録していないときの fallback を維持
7. push 後も `javascript:` / `data:text/html` / `<script>` が escape
   される

追加 8 件（foundation 品質のための補強）:

- `pushPreviewContextUpdate` と message type 定数が export されている
- child が open していない lid への push は `false` を返す
- 親マップは child がいなくても live push で更新される（seed 経路）
- `overrideCtx` 引数が parent map よりも優先される
- child HTML に `var childPreviewCtx = null;` 宣言がある
- child HTML の message listener が `pkc-entry-update-preview-ctx`
  を処理している
- child HTML の `renderMd` が `childPreviewCtx` を 3 番目の引数として
  渡している
- close poll 経由 cleanup 後の push は false を返し postMessage を
  送らない
- textlog archetype も同じ push / render 経路で動く

全テスト 1570 件 pass、typecheck clean、build 成功。entry-window.test
単体で 106 件（+15）。

### 9. 次スコープ

本 foundation は「Preview タブ resolver の入力を live で差し替える」
までを扱う。以下は次以降の独立 Issue として残る:

1. **Child view-pane rerender** — `body-view` の `innerHTML` を新しい
   `resolvedBody` で差し替える専用メッセージ型の追加。
2. **editor dirty state との競合解決** — child 側が編集中のときに親
   から送られてくる更新をどう扱うか（現状は Preview resolver 入力
   だけしか触らないので competence issue は発生しない）。
3. **autocomplete hover thumbnail** — `asset:` 補完ポップオーバーへの
   resolver 経由サムネイル表示。
4. **非 text archetype への拡張** — generic / opaque / folder など
   textarea で markdown を書ける archetype にも同じ context を流す。
5. **メインウィンドウの Source/Preview タブ導入** — 現状 textarea 単体。
6. **マルチタブ間の同一 lid 競合解決** — `window.opener` が異なる
   インスタンスで同じ entry を開いたときの調停。

---

## 維持する不変量

- 5 層構造：resolver は features、子ウィンドウ配信は adapter
- core は browser API を持たない
- `SAFE_URL_RE` / `html: false` / `SANDBOX_ATTRIBUTES` — 無変更
- Asset Reference Resolution / Non-image Asset Handling / Phase 4
  — 既存テスト無変更で全通過
- Asset Picker / Autocomplete / slash command — 無変更
- `MessageEnvelope` / `MessageBridge` — 無変更（今回も entry-window
  私的プロトコル側のみを触っている）
