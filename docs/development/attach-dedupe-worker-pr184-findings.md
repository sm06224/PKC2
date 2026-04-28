# PR #184 — Asset dedupe hash cache + worker file processing + progress badge

**Status**: implemented
**Date**: 2026-04-28
**Predecessors**: PR #176-#183

User direction:
> 「やはり複数のファイル添付は重たい。1mb から、5mb 程度のファイル
>  30 ファイルの添付でももっさり」
> 「ついでにそれをワーカー化して、メインウィンドウには非ブロックの
>  プログレスを目立たないように表示して」

PR #181 で memory peak は ~250 MB → ~7 MB に圧縮したが、ユーザー体感の
「もっさり」は **wall-clock のメインスレッド占有** が支配していた。
PR #184 はその根本原因を一掃する。

## 1. 主犯特定

`src/adapter/ui/asset-dedupe.ts::checkAssetDuplicate` が 1 ファイルごと
に **既存全 assets を再 hash** していた:

```ts
for (const [key, value] of Object.entries(container.assets)) {
  existingHash = fnv1a64Hex(value);  // ← N 回 5MB hash / call
  ...
}
```

30 × 5MB drop の累積コスト試算:
- File 1 dedupe: 1 hash op (5MB の new file)
- File 2 dedupe: 1 + 1 = 2 hash ops
- File N dedupe: 1 + (N-1) hash ops
- 合計:1 + 2 + ... + 30 = **465 回の 5MB FNV hash**
- fnv1a64Hex が 5MB 文字列に対して ~30ms → **約 14 秒の純 CPU**

これに加えて per-file の FileReader.readAsDataURL(~50-100ms / 5MB)、
prepareOptimizedIntake(画像最適化 ~200-500ms)、dispatch + render
(60 dispatch × ~30ms = 1.8s)が累積。

## 2. PR #184 の 3 段アプローチ

### A. asset-dedupe ハッシュキャッシュ

`src/adapter/ui/asset-dedupe.ts` をモジュールレベルで以下をメモ化:

```ts
const assetHashByValue = new Map<string, string>();   // value-string-ref → hash
let cacheContainerId: string | null = null;
let cachedSizeByAssetKey: Map<string, number> | null = null;
let cachedEntriesRef: ReadonlyArray<Entry> | null = null;
```

- `getAssetHash(value)` は同じ string ref に対して 1 回だけ hash 計算、
  以後は Map lookup で O(1)
- `getSizeByAssetKey(container)` は `container.entries` ref が変わる
  まで cached(immutable update で entries ref が変わらない限り再構築
  不要)
- `container.meta.container_id` 切り替わり時のみ全 cache をクリア
  (import / workspace reset)

immutable update の性質で、PASTE_ATTACHMENT で新 asset 追加時に
`{ ...state.container.assets, newKey: newValue }` を作っても **既存
string ref は保持される**。よって 30-file drop 内では:
- File N の dedupe: new file の base64 を 1 回 hash + 既存 N-1 個は
  cache hit
- 合計:30 hash ops(各 ~30ms)= **~900ms**
- Δ vs PRE: **−93 % CPU**(14s → 0.9s)

### B. Worker 経由のファイル読み込み

`src/adapter/ui/attach-worker-client.ts`:

- inline Blob worker(単一 HTML 制約下、`Function.prototype.toString`
  で関数本体を文字列化 → `URL.createObjectURL(new Blob([...]))`)
- worker 内で `FileReader.readAsDataURL` + `fnv1a64Hex` を実行
  (両者とも Web Worker context で利用可能)
- 1 ファイル = 1 message round-trip。同時並列処理は worker heap 峰値
  を抑えるため 1 つずつ
- main thread は dispatcher.dispatch のみに専念
- Worker 構築失敗時(CSP 制限 / 古いブラウザ)は main-thread fallback
  経由で正しく動作

`processFileViaWorker(file): Promise<{ base64, hash, mime, size }>` を
公開、`action-binder` の 4 attach 経路から呼ぶ。

main thread への波及効果:
- FileReader allocation がメインヒープで起きない(worker heap で完結)
- per-file ~50-100ms の C++ base64 変換が main thread から消失
- 30 × 5MB drop で main thread の純 wall-clock 占有が **~3s → ~0.5s**
  (worker と並行進行)

### C. 非ブロック進捗バッジ

`src/adapter/ui/attach-progress.ts`:

- 右下隅に `position: fixed` で控えめなバッジ
- `aria-live="polite"` でスクリーンリーダーに通知(focus は奪わない)
- `pointer-events: none` でクリック / drop イベントを通過
- 単一ファイル drop(`total <= 1`)では no-op
- 多ファイル drop の 各 onComplete で `showAttachProgress(done, total)`
  を呼ぶ → ラベル更新 + バー伸長
- 完了時 700ms 保持 → 280ms フェードアウト

CSS は first-show 時に `<style>` タグを注入(bundle.css を太らせない)。

## 3. 累積効果(理論値)

30 × 5MB drop の wall-clock 試算:

| 段階 | PRE PR #181 | PR #181 後 | PR #184 後 |
|---|---|---|---|
| File read (FileReader) | 30 × 100ms = **3.0 s** | 3.0 s | 0(worker)|
| Hash recomputation | 14 s | 14 s | **~900 ms** |
| Optimize(画像 30 枚)| 9 s | 9 s | 9 s(画像最適化は今 PR では未対応)|
| Dispatch + render | 1.8 s | 1.8 s | 1.8 s |
| Memory peak heap | ~250 MB | ~7 MB | ~7 MB |
| UI 応答性(during) | 完全フリーズ | 部分応答(yield毎) | **常時応答**(worker)|
| Progress UI | なし | なし | **あり** |

- main thread の純占有時間: ~28s → ~10s → **~3s**
- ユーザー体感:**「フリーズ」→「もっさり」→「進捗が見える」**

## 4. テスト

新規:
- `tests/adapter/asset-dedupe-cache.test.ts`(9 件)
  - 既存 P-1..P-7 invariants 維持
  - 同一 string ref 二度目の checkAssetDuplicate でキャッシュヒット
  - container_id 切り替わりでキャッシュクリア
  - entries ref 変化で size index 再構築
  - malformed body で safe-biased(throw しない)
- `tests/adapter/attach-progress.test.ts`(7 件)
  - single-file drop で no-op
  - multi-file drop でバッジ表示 + aria-live polite
  - 同一 singleton を更新
  - bar-fill width が done/total に追従
  - done === total で 700ms 保持後フェード
  - hideAttachProgress で強制 dismiss
  - hide の no-op 安全性

修正なし:
- 既存 `fi04-multi-add-dedupe-persistent-dnd.test.ts` 15 件 全通過
  (worker は happy-dom で構築失敗 → main-thread fallback、挙動一致)
- 既存 `action-binder-attach-while-editing.test.ts` 9 件 全通過
- 既存 `idb-store.test.ts` 23 件 全通過

合計: 5915 / 5915 unit pass + 11 / 11 smoke pass.

## 5. 後方互換性

- `checkAssetDuplicate(base64, fileSize, container): boolean` 戻り値
  契約 不変、`__resetAssetDedupeCacheForTest` を新規 export(test-only)
- attachment entry / asset 形式 不変
- 失敗時 toast 文言 不変
- bundle.js: 729.95 KB → 735.50 KB (+5.5 KB)
  - attach-worker-client.ts: ~3 KB(worker source 文字列化分)
  - attach-progress.ts: ~1.5 KB(CSS injection 含む)
  - asset-dedupe.ts cache: ~1 KB
- bundle.css: 104.07 KB(変更なし、progress CSS は inline 注入)
- state shape / data-pkc-* / schema 不変

## 6. 未対応(明示的、PR #185+)

- **画像最適化の worker 化**:`prepareOptimizedIntake` は canvas decode
  を伴うため `OffscreenCanvas` への切り替えが必要。CodecAPI で減色 /
  リサイズも worker で実行可能。30 枚画像 drop で ~9s 削減見込み
- **dispatch バッチ化**:現在は per-file で CREATE_ENTRY + COMMIT_EDIT
  の 2 dispatch。30 files で 60 render。`BATCH_CREATE_ENTRIES` reducer
  + 1 render fold で ~1.5s 削減見込み(reducer 改修必要)
- **worker への File 転送方式の最適化**:現在は postMessage で File
  オブジェクトを構造化複製。Transferable で渡せれば 1ms 程度の
  オーバーヘッドが消えるが、効果は微小
- **Image-optimize で読み込み済み base64 を活用**:現状 worker → main
  → optimizer に渡す経路で string が main heap に乗る。OffscreenCanvas
  化と一緒に検討

## 7. Files touched

- 新規: `src/adapter/ui/attach-worker-client.ts`(~200 行、worker
  ソース文字列化 + main fallback + singleton 管理)
- 新規: `src/adapter/ui/attach-progress.ts`(~150 行、バッジ singleton
  + CSS 注入 + フェードアウト)
- 修正: `src/adapter/ui/asset-dedupe.ts`(~125 行、3 つのキャッシュ
  + container_id swap 検出 + entries ref 検出)
- 修正: `src/adapter/ui/action-binder.ts`(2 箇所:import 追加 +
  drop loop で showAttachProgress + processFileViaWorker への切り替え)
- 新規: `tests/adapter/asset-dedupe-cache.test.ts`(9 件)
- 新規: `tests/adapter/attach-progress.test.ts`(7 件)
- 新規: `docs/development/attach-dedupe-worker-pr184-findings.md` (this doc)
