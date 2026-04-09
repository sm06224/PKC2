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
- view-pane HTML も一緒に再描画する場合の `pkc-entry-rerender` 内部
  メッセージ定義
- 複数タブ（マルチインスタンス）間の同一 lid 競合解決

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
