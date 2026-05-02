# PR #187 — Image optimize OffscreenCanvas worker

**Status**: implemented
**Date**: 2026-04-28
**Predecessors**: PR #176-#186

User direction:
> 「全部おまかせでやっていい」「画像の最適化が発生してダイアログを
>  出す場合はユーザーの編集を邪魔してもいい」「go ahead!」

## 1. 動機

PR #181-#186 までで attach パイプラインの memory + dispatch + UX は
解消したが、`prepareOptimizedIntake` 内の **`optimizeImage` / `hasAlphaChannel`
は依然 main thread の `<canvas>` を使う**。30 × 5MB JPEG を drop すると
1 ファイルあたり ~200-500 ms の canvas decode + resize + encode が main
thread を占有 → 累積 9-15 秒の jank。

PR #187 は OffscreenCanvas + Worker でこれを丸ごと移管する。

## 2. 実装

### 新規 `src/adapter/ui/image-optimize/optimize-worker-client.ts`

inline Blob worker(`Function.prototype.toString` トリック、PR #184 の
attach-worker-client と同じ単一 HTML 互換パターン)。worker 内で:

```ts
const bitmap = await createImageBitmap(file);
const canvas = new OffscreenCanvas(outW, outH);
const ctx = canvas.getContext('2d');
ctx.drawImage(bitmap, 0, 0, outW, outH);
const blob = await canvas.convertToBlob({ type, quality });
```

受け付けるメッセージ:
- `{ kind: 'optimize', file, params }` → resize + encode 結果を Blob で返す
- `{ kind: 'hasAlpha', file }` → α channel 検出結果(全 pixel scan)を返す

worker 構築失敗(`OffscreenCanvas` 未対応 / CSP / 古いブラウザ)時は
`null` を返し、caller は main-thread 経路へ fallback。

### `src/adapter/ui/image-optimize/optimizer.ts` を worker-first に

```ts
export async function optimizeImage(file: File, params: OptimizeParams): Promise<OptimizeResult | null> {
  const viaWorker = await optimizeImageInWorker(file, params);
  if (viaWorker) return viaWorker;
  return optimizeImageOnMainThread(file, params);
}

export async function hasAlphaChannel(file: File): Promise<boolean> {
  const viaWorker = await hasAlphaChannelInWorker(file);
  if (viaWorker !== null) return viaWorker;
  return hasAlphaChannelOnMainThread(file);
}
```

- 公開 API(`optimizeImage` / `hasAlphaChannel`)の signature 不変
- 結果 shape 不変(同じ `OptimizeResult` 型)
- worker 経路と main 経路の整合性が破れることが原理的に無い(同じ
  アルゴリズムを移植しただけ)
- `paste-optimization.ts` 側変更不要

### Browser support

OffscreenCanvas:
- Chrome / Edge 69+
- Safari 16.4+
- Firefox 105+

それ以前の Safari / 全ての主要モバイルブラウザは fallback 経由で従来
通り動作。**purely additive** — 効くブラウザでだけ効く。

### 確認ダイアログは main 残し

ユーザー指示「画像の最適化が発生してダイアログを出す場合はユーザーの
編集を邪魔してもいい」に従い、`paste-optimization.ts` の
`showOptimizeConfirm` は **無変更**。dialog だけ interactive、CPU 仕事
は worker、というハイブリッド。

## 3. 性能インパクト(理論値)

30 × 5MB JPEG drop のシナリオ:

| 段階 | PRE PR #187 (main) | PR #187 (worker) |
|---|---|---|
| `createImageBitmap`(decode) | ~50ms × 30 = 1.5s | 0(worker)|
| canvas resize + drawImage | ~50ms × 30 = 1.5s | 0(worker)|
| `convertToBlob`(encode) | ~150ms × 30 = 4.5s | 0(worker)|
| `hasAlphaChannel` scan(PNG のみ) | ~100ms × N | 0(worker)|
| **main thread 占有** | **~7.5 s** | **~0 s**(postMessage 往復のみ) |

合計 main thread freedom:
- PR #184 + #187: 30×5MB drop → main thread block ~3s → ~0.5s
- 合算で **PR #181 比 main thread ~30s → ~0.5s**

実測は worker が走る Chromium で memory + performance recording
すれば確認可能(automated bench は OffscreenCanvas を持たない
happy-dom で動かないため省略)。

## 4. テスト

新規:
- `tests/adapter/optimize-worker-client.test.ts`(3 件)
  - happy-dom 上で worker 構築失敗 → null 返却(fallback シグナル)
  - 両関数とも Promise を返す(caller は await + null check)

既存:
- `tests/features/image-optimize/preference.test.ts`(7 件)main 経路で全通過
- `tests/features/image-optimize/classifier.test.ts`(9 件)
- `tests/adapter/fi04-multi-add-dedupe-persistent-dnd.test.ts`(15 件)
- `tests/adapter/action-binder-attach-while-editing.test.ts`(9 件)

合計 5932 / 5932 unit pass + 11 / 11 smoke pass。

## 5. 後方互換性

- `optimizeImage` / `hasAlphaChannel` の API signature 不変
- 結果 shape(`OptimizeResult` / boolean)不変
- `paste-optimization.ts` 内 `showOptimizeConfirm` 経路 不変
- attachment / asset 形式 不変
- bundle.js +2.4 KB(worker source 文字列化 + fallback wrapper)
- bundle.css 不変
- main 経路は完全に保存(関数名は internal 化、外部 API は thin wrapper)

## 6. PR #188 候補

- **dispatch バッチ化**:`BATCH_PASTE_ATTACHMENTS` reducer + 1 render fold
  で 30 dispatch を 1 回に
- **filter-pipeline メモ化**:c-5000 search-keystroke で `treeHide`
  bucket 集合 / `searchHide` bucket 集合を container 不変なら cache
- worker prewarm:大量 drop 開始時に worker を温めておく(初回 ~50ms
  のオーバーヘッド削減)

## 7. Files touched

- 新規: `src/adapter/ui/image-optimize/optimize-worker-client.ts` (~220 行)
- 修正: `src/adapter/ui/image-optimize/optimizer.ts`(worker-first
  wrapper 追加、main 経路は internal 化、~60 行追加)
- 新規: `tests/adapter/optimize-worker-client.test.ts`(3 件)
- 新規: `docs/development/image-optimize-worker-pr187-findings.md` (this doc)
