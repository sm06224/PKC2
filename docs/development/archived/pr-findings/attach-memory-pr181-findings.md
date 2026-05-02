# PR #181 — Multi-file attach memory mgmt

**Status**: implemented
**Date**: 2026-04-28
**Predecessors**: PR #176 / #177 / #178 / #179 / #180

User direction:
> 「複数ファイルの添付時にリソース解放をこまめに行い、メモリ不足にならないようにして」

## 1. 問題

attach パイプラインの 4 サイト(drop, edit-drop, paste, dedupe-drop)
全てで以下の memory-heavy パターンが繰り返されていた:

```ts
reader.readAsArrayBuffer(file);           // N bytes (ArrayBuffer)
reader.onload = async () => {
  const buf = reader.result as ArrayBuffer;
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);  // 2N bytes (V8 UTF-16)
  }
  const base64 = btoa(binary);            // ~1.33N bytes
  const payload = await prepareOptimizedIntake(file, base64, ...);
  // payload.assetData = ~1.33N
  // payload.originalAssetData = ~1.33N (kept for revert)
  ...
};
```

N-byte ファイル 1 個あたりの transient JS heap 峰値:**4-5N**
(ArrayBuffer + Uint8Array view + binary string + base64 + payload)

10 × 5 MB の burst drop なら 200-300 MB が GC 前に滞留。Android /
iOS の memory-tight な端末では hard-OOM の射程に入る。

加えて **逐次処理に間隔がない** — 1 ファイル目の base64 / payload が
GC される前に 2 ファイル目の `readAsArrayBuffer` が走り、heap が
線形に積み上がる。

## 2. 修正

### a. `readAsArrayBuffer` → `readAsDataURL`

新ヘルパー `src/adapter/ui/file-to-base64.ts`:

```ts
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      const comma = url.indexOf(',');
      resolve(comma >= 0 ? url.slice(comma + 1) : url);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
```

`readAsDataURL` はブラウザ C++ 側で base64 化を行うため、JS 側で
ArrayBuffer / binary string / btoa の中間アロケーションが消える。

| 工程 | 旧 | 新 |
|---|---|---|
| ArrayBuffer | N bytes | (なし) |
| binary string | 2N bytes | (なし) |
| btoa 中間 | (V8 内部) | (なし、C++) |
| 結果 base64 | ~1.33N bytes | ~1.33N bytes |
| **transient peak** | **~4-5N** | **~1.33N** |

→ **1 ファイルあたり ~3-4× の memory peak 削減**。

`prepareOptimizedIntake(file, base64, surface)` は `file` と `base64`
の両方を受け取り、optimization 経路では `file` を直接 canvas にロード
するため `base64` 抜きの ArrayBuffer は不要。pass-through 経路は
`base64` のみ使う。**API 変更なし**で乗せ換え可能。

### b. ファイル間の idle yield

```ts
// processEditingFileDrop / processNext
if (fileIndex < files.length) {
  await yieldToEventLoop();
}
```

```ts
// drop zone outer loop
processFileAttachmentWithDedupe(files[index]!, ..., () => {
  if (index + 1 < files.length) {
    void yieldToEventLoop().then(() => processNext(index + 1));
  } else {
    processNext(index + 1);
  }
});
```

`yieldToEventLoop = () => new Promise(r => setTimeout(r, 0))` で次の
macrotask まで譲る。

- **GC 機会**:前ファイルのスコープが抜けてから次の FileReader が
  走るため V8 が間に GC を走らせやすい
- **UI レスポンシブ**:ブラウザがフレーム描画 / 入力処理を挟める
- **背景タブ動作**:`requestAnimationFrame` だと背景タブで停止するが
  `setTimeout(0)` は走り続ける(burst drop 直後に Cmd-Tab するユーザ
  ケースで停滞しない)

→ 10 ファイル burst の **heap 峰値が「N ファイル分」から「1 ファイル分」**
に下がる(理論上)。

### c. 影響を受けたサイト

`src/adapter/ui/action-binder.ts` の 4 関数を統一形に:

| 関数 | 役割 |
|---|---|
| `processEditingFileDrop` | 編集中 textarea へのファイル drop |
| paste handler (5266+) | 編集中 textarea へのクリップボードペースト |
| `processFileAttachmentWithDedupe` | sidebar / DnD zone への drop(dedupe 通知付き)|
| `processFileAttachment` | 上記の dedupe なし版 |

全 4 サイトで `new FileReader() + readAsArrayBuffer + onload async +
binary loop + btoa` パターンを `await fileToBase64(file)` に置換。
コードベース内の手書き btoa loop が完全消滅。

## 3. テスト

### 新規

`tests/adapter/file-to-base64.test.ts` (5 件)
- 'hi' → 'aGk=' 成功ケース
- バイナリ JPEG SOI(0xFF 0xD8 0xFF)→ '/9j/' 成功
- 空ファイル → '' 成功
- FileReader.error → Promise rejection
- yieldToEventLoop が次 macrotask で resolve

### 修正

`tests/adapter/fi04-multi-add-dedupe-persistent-dnd.test.ts` の
`MockFileReader` を `readAsDataURL` 対応に拡張(`readAsArrayBuffer`
も残してデュアル互換、callCount で先頭エラー / 後続成功は不変)。

### 既存全通過

5894 / 5894 unit + 11 / 11 smoke。`action-binder-attach-while-editing.test.ts`
9 件は happy-dom の native `FileReader` を介して新パスを実走しても
全 pass。

## 4. ベンチ

このパスは bench シナリオに無い(bench は drop イベントを直接発火
しないため)。memory peak の前後比較は理論上の見積:

| シナリオ | PRE peak heap | NEW peak heap |
|---|---|---|
| 1 × 5 MB ファイル drop | ~25 MB | ~7 MB |
| 10 × 5 MB ファイル burst drop | ~250 MB | ~7 MB(yield 経由 GC 済)|
| 10 × 10 MB の混在 paste 連打 | ~500 MB | ~13 MB |

実測は browser DevTools Performance Memory タブで PR 後に手動
確認(automated bench に組み込むには Playwright の memory profiling
hook が必要、PR #182 以降の課題)。

## 5. 後方互換性

- public API 変更なし
- attachment entry の body / asset 形式変更なし
- 失敗時 toast / error メッセージは現行と同一(`Failed to read "...":`)
- bundle.js: 729.39 KB → 729.47 KB (+0.08 KB)
- bundle.css: 103.96 KB(変更なし)

## 6. 未対応(意図)

- **per-file 即時 IDB asset save**:現在は dispatcher.dispatch が
  PASTE_ATTACHMENT を発行 → reducer が container.assets に展開 →
  persistence の debounced save(300ms)で IDB に書き出し、という流れ。
  10 ファイル burst では debounce 期間中 base64 が container.assets
  上に保持される(これは意図 — undo / revert が成立する前提)。
  即時 IDB write は state shape を破る(container.assets が source of
  truth でなくなる)ので慎重。PR #182 で「container 大規模化時の save
  チャンク化」と一緒に再検討。
- **OPFS への asset 直書き**:OPFS 移行(PR #180 で土台あり)後に
  検討。File API → OPFS のストリーミング書き込みは `writable.write()`
  が転送ストリームを受け取るので、base64 を経ずに書ける。ただし
  attachment entry の body は base64 を保持する歴史互換が必要なので
  完全な無変換にはならない。

## 7. Files touched

- 新規: `src/adapter/ui/file-to-base64.ts` (~70 lines)
- 修正: `src/adapter/ui/action-binder.ts`
  (4 サイトの reader 機構を helper に置換、idle yield 追加、import 追加)
- 修正: `tests/adapter/fi04-multi-add-dedupe-persistent-dnd.test.ts`
  (MockFileReader を readAsDataURL 対応)
- 新規: `tests/adapter/file-to-base64.test.ts` (5 tests)
- 新規: `docs/development/attach-memory-pr181-findings.md` (this doc)

## 8. PR #182 候補

PR #181 完了後の優先度:

1. **`findSubLocationHits` skip**(PR #182 候補) — c-1000 search-keystroke
   145 ms / keystroke の残りを分解する小ネタ。bench 数値 +
   sub-instrumentation も同 PR
2. **Worker offload(PR #183 候補)** — 派生 index を main thread から
   外す
3. **Container entries chunking** — OPFS 移行と一緒に
