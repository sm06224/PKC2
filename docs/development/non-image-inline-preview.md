# Non-image Inline Preview

## 1. 概要

TEXT / TEXTLOG の rendered markdown 内に出現する非画像 asset reference
(`[label](asset:key)`) を、MIME type に応じて **inline preview** として
展開する機能。

現行動作: `[label](asset:key)` → chip (`📄 label`) → click で download
目標動作: PDF / audio / video の chip を inline player / viewer に置き換え

---

## 2. 対象と非対象

### A. 対象 MIME

| MIME | 要素 | preload | 備考 |
|------|------|---------|------|
| `application/pdf` | `<object type="application/pdf">` | N/A | ブラウザ内蔵 PDF viewer に委譲 |
| `audio/*` (`mp3, mpeg, ogg, wav, webm`) | `<audio controls>` | `none` | 軽量。autoplay 禁止 |
| `video/*` (`mp4, webm, ogg`) | `<video controls>` | `none` | サイズ制約あり。autoplay 禁止 |

### B. 対象外 MIME

| MIME | 理由 | 現行経路 |
|------|------|---------|
| `text/html` | 既存 sandbox 経路 (attachment presenter) で対応済み | attachment detail view |
| `image/svg+xml` | 既存 safe render (sandbox) で対応済み | attachment detail view |
| `image/*` (png, jpeg, gif 等) | 既存 data URI embed で対応済み | `![alt](asset:key)` → inline |
| その他バイナリ | preview 不可能 | chip + download |

---

## 3. Rendering Policy（描画ポリシー）

### 3.1 PDF

```
要素:       <object type="application/pdf" data="{blobUrl}">
sandbox:    不要 (object は script 実行不可)
fallback:   <p>PDF preview not available in this browser.</p>
download:   chip を保持 (preview 下に download リンク)
サイズ:     高さ 400px 固定、幅 100%
```

**理由**: `<object>` はブラウザの built-in PDF viewer に委譲する。
`<iframe>` と異なり sandbox 属性を持たないが、PDF viewer は独立した
sandbox 環境で動作するため script injection のリスクはない。
attachment presenter の既存実装と同一パターン。

### 3.2 Audio

```
要素:       <audio controls preload="none">
                <source src="{blobUrl}" type="{mime}">
            </audio>
autoplay:   禁止 (controls 属性のみ)
preload:    none (明示的に再生開始するまでデコードしない)
サイズ:     ブラウザデフォルト (幅 100%, 高さ auto)
```

**理由**: `preload="none"` は attachment preview の `"metadata"` より
保守的。body 内に複数 audio が存在しうるため、全件の metadata 読み込みを
避ける。ユーザが再生ボタンを押した時点で初めてデコードが始まる。

### 3.3 Video

```
要素:       <video controls preload="none">
                <source src="{blobUrl}" type="{mime}">
            </video>
autoplay:   禁止
preload:    none (body 内に複数 video がありうるため)
サイズ:     max-width: 100%, max-height: 360px
```

**理由**: audio と同一方針。`preload="none"` で初期コストを最小化。
`max-height` で body 内の video が画面を占拠することを防ぐ。

### 3.4 chip の扱い

- **audio / video**: chip link を **非表示** にする（削除はしない）。preview 失敗時に chip を再表示するため
- **PDF**: chip link を **非表示にしない**。`<object>` の fallback 検出が不安定なブラウザが多く、PDF viewer が動作しない場合に空白だけが残るリスクがある。chip を常時表示することで download 経路を保証する

---

## 4. Security Policy

### 4.1 データソース

- **blob URL のみ使用**。外部 URL は一切使わない
- blob URL の元データは `container.assets[key]` (base64)
- 外部ネットワークへのリクエストは発生しない

### 4.2 要素ごとのセキュリティ特性

| 要素 | script 実行 | navigation | 外部リクエスト |
|------|------------|------------|---------------|
| `<object type="application/pdf">` | 不可 | 不可 (PDF viewer 内) | 不可 |
| `<audio>` | 不可 | 不可 | blob URL のみ |
| `<video>` | 不可 | 不可 | blob URL のみ |

### 4.3 iframe を使わない理由

PDF には `<iframe>` ではなく `<object>` を使う。理由:
- `<object>` は `type` 属性で MIME を明示でき、ブラウザの PDF plugin に直接委譲
- `<iframe>` + sandbox では PDF viewer の動作が制限される可能性がある
- attachment presenter の既存実装が `<object>` を採用しており、一貫性を維持
- CSP / blob origin の問題を回避

### 4.4 sandbox は不要

audio / video / PDF (object) のいずれも、ユーザ提供の HTML/JS を
実行するリスクがないため、sandbox 属性は不要。
HTML/SVG preview は本 issue のスコープ外 (既存 attachment sandbox 経路を使用)。

---

## 5. Blob Lifecycle（リソース管理）

### 5.1 生成タイミング

```
render cycle
  ↓
render(state, root)          ← DOM を構築 (chip リンクが <a href="#asset-key"> として存在)
  ↓
populateInlineAssetPreviews(root, dispatcher)   ← 新関数。chip を走査し、
                                                   対象 MIME なら blob URL を生成して
                                                   preview 要素に置き換え
```

attachment preview と同一タイミング。main.ts の `onState` コールバック内で
`populateAttachmentPreviews()` の直後に呼ぶ。

### 5.2 解放タイミング

| トリガ | 処理 |
|--------|------|
| 次の render cycle | `cleanupBlobUrls(root)` が `render()` の前に呼ばれ、`data-pkc-blob-url` を持つ全要素の blob URL を revoke |
| entry 切り替え | render cycle が発火 → 上記と同一 |
| view mode 切り替え | render cycle が発火 → 上記と同一 |
| binder teardown | `cleanupBlobUrls` は binder 外で呼ばれるため影響なし |

### 5.3 既存 cleanupBlobUrls との互換

`cleanupBlobUrls()` は `[data-pkc-blob-url]` セレクタで全件 revoke する。
新規の inline preview 要素にも同一属性を付与するため、**既存の cleanup で
自動的にカバーされる**。追加のライフサイクル管理は不要。

### 5.4 再 render 時の扱い

```
state 更新 (例: QUICK_UPDATE_ENTRY)
  ↓
cleanupBlobUrls(root)    ← 旧 blob URL を全件 revoke
  ↓
render(state, root)      ← DOM を再構築 (chip リンクが再生成)
  ↓
populateInlineAssetPreviews()  ← chip を再走査、新 blob URL を生成
```

**N+1 問題**: body に N 件の非画像 asset 参照があると、毎 render で N 件の
blob URL を生成→revoke するサイクルが回る。ただし render は state 変更時のみ
発生するため、連続的な再生成はない。

### 5.5 複数 preview の考慮

body 内に複数の audio/video/PDF 参照がある場合、それぞれ独立した blob URL を
生成する。`preload="none"` により、ユーザが再生/閲覧するまでデコードは発生しない。

---

## 6. UX Fallback

### 6.1 Preview 失敗時

| 状況 | 動作 |
|------|------|
| asset key が container.assets に存在しない | chip のまま (preview 展開しない) |
| MIME が対象外 | chip のまま |
| PDF viewer 非対応ブラウザ | `<object>` 内の fallback テキスト表示。ただし多くのブラウザは `<object>` fallback を表示せず空白になるため、**chip を非表示にしない** (chip と preview を並列配置し、PDF viewer が動作すれば chip は冗長だが表示に支障なし) |
| codec 非対応 (audio/video) | ブラウザのデフォルトエラー表示 |
| base64 デコード失敗 | chip のまま (try-catch で保護) |

### 6.2 非対応 MIME

`classifyPreviewType()` が `'none'` を返す MIME → chip を維持、preview 展開しない。

### 6.3 Light export (assets 無し)

Light export では `container.assets` が空のため、asset key は解決できない。
chip は表示されるが、click で download できず、preview も展開されない。
既存の非画像 chip と同一の挙動。

---

## 7. 操作シーケンス

### 7.1 Preview が開く

```
1. entry を select → render cycle
2. render() が body の markdown を HTML 化 → chip リンク生成
3. populateInlineAssetPreviews() が chip を走査
4. 対象 MIME の chip を見つける
5. container.assets[key] から base64 データを取得
6. blob URL を生成
7. chip の隣に preview 要素を挿入、chip を非表示
```

### 7.2 Entry 切り替え

```
1. 別 entry を select → state 更新
2. cleanupBlobUrls(root) → 全 blob URL revoke
3. render(state, root) → 新 entry の body を表示
4. populateInlineAssetPreviews() → 新 entry の chip を走査・展開
```

### 7.3 View mode 切り替え (detail → calendar → kanban)

```
1. SET_VIEW_MODE dispatch → state 更新
2. cleanupBlobUrls(root) → 全 blob URL revoke
3. render(state, root) → 新 view mode を表示
   (calendar/kanban では body は表示されない → chip なし → preview なし)
```

### 7.4 Edit mode 開始

```
1. BEGIN_EDIT dispatch → phase が 'editing' に
2. cleanupBlobUrls(root) → 全 blob URL revoke
3. render(state, root) → editor UI を表示
   (editor は markdown source をテキストで表示 → chip なし → preview なし)
4. edit preview pane には renderMarkdown 結果が入るが、
   populateInlineAssetPreviews は edit preview 内は対象外とする
```

---

## 8. 実装方針（未実装）

### 案 A: `populatePreviewElement()` を直接使用

chip リンクの DOM を走査し、`populatePreviewElement()` を呼ぶ。

**メリット**:
- 既存関数の再利用で diff が小さい
- PDF/video/audio の rendering ロジックが attachment 側と完全一致

**デメリット**:
- `populatePreviewElement()` は attachment preview 向けに設計されている
  (imgClass パラメータ、"Open in New Window" ボタン等)
- body 内の inline preview には不要な要素が含まれる
- sandboxAllow パラメータが body 内 preview には不要

### 案 B: 新関数 `populateInlineAssetPreviews()` を分離

chip リンク専用の post-render 関数を新設。内部で `createBlobUrl()` を
再利用するが、DOM 構築は body 内 preview に最適化。

**メリット**:
- body 内の inline preview に最適化できる (不要な Open ボタンなし)
- `populatePreviewElement()` を変更せずに済む
- attachment preview との責務分離が明確

**デメリット**:
- PDF/video/audio の DOM 構築が一部重複する
- `createBlobUrl()` は action-binder.ts 内の private 関数のため、
  同ファイル内に置くか export が必要

### 推奨: 案 B

**理由**:
1. attachment preview と body inline preview は UX 要件が異なる
   (Open ボタン、sandbox 制御、サイズ制約)
2. `populatePreviewElement()` を body 用に改造すると attachment 側に
   regression リスクが生じる
3. `createBlobUrl()` と `cleanupBlobUrls()` は再利用、DOM 構築だけ分離
4. 呼び出しパターンは `populateAttachmentPreviews()` と同一
   (main.ts の onState 内で render 後に呼ぶ)

---

## 9. リスク整理

### 9.1 メモリリーク

| リスク | 対策 |
|--------|------|
| blob URL revoke 忘れ | `data-pkc-blob-url` 属性 + 既存 `cleanupBlobUrls()` で統一管理。新規コードも同一パターンを踏襲 |
| body 内に大量の asset 参照 | `preload="none"` で decode を遅延。blob URL 自体は軽量 (URL string のみ) |
| render cycle ごとの再生成 | 現行 attachment preview と同一。state 変更時のみ発生するため頻度は低い |

### 9.2 CSP / Sandbox

| リスク | 対策 |
|--------|------|
| blob: URL の CSP 制約 | PKC2 の標準配布 (ローカル HTML) では CSP meta tag はなく blob: URL は使用可能。ただし配信環境の HTTP header CSP で `blob:` や `media-src` / `object-src` が制限される場合は inline preview が機能しない。その場合は **chip fallback に戻る** (preview 要素の生成自体をスキップするか、生成失敗時に chip を維持) |
| PDF 内の JavaScript | ブラウザ PDF viewer は独立 sandbox。`<object>` は script 実行不可 |
| audio/video の外部参照 | blob: URL はローカルデータのみ。外部リクエスト不可 |

### 9.3 ブラウザ差異

| リスク | 影響 | 対策 |
|--------|------|------|
| PDF viewer 非搭載 (一部モバイル) | `<object>` fallback テキストが表示 | chip の download fallback を維持 |
| codec 非対応 (Ogg 等) | audio/video が再生不可 | ブラウザデフォルトのエラー表示に委譲 |
| blob: URL の上限 (極端に大きいファイル) | 生成失敗 | try-catch で chip fallback |

### 9.4 大容量ファイル

| リスク | 対策 |
|--------|------|
| 大きな動画の base64→Blob 変換 | `atob()` + `Uint8Array` は同期的。数 MB 程度なら問題なし |
| 100MB+ のファイル | 既存の asset サイズガード (guardrails.ts: 5MB heavy warning) で upload 時に抑止 |
| 複数大容量ファイルの同時 preview | `preload="none"` で decode を遅延。blob URL 自体はメモリ消費小 |

---

## 10. テスト戦略

### 10.1 happy-dom でテスト可能

| テスト対象 | 方法 |
|-----------|------|
| chip リンクの検出ロジック | DOM に `<a href="#asset-key">` を配置 → 関数がそれを見つけるか |
| MIME 分類 → preview 判定 | `classifyPreviewType()` の既存テスト + 新 MIME の追加 |
| blob URL 属性の付与 | preview 要素に `data-pkc-blob-url` が設定されるか |
| fallback: 対象外 MIME は chip のまま | preview 要素が生成されないことを確認 |
| fallback: asset key 不在は chip のまま | container.assets に key がない場合 |
| cleanupBlobUrls が新要素もカバー | `data-pkc-blob-url` があれば revoke されるか |

### 10.2 happy-dom でテスト不可

| テスト対象 | 理由 | 代替検証 |
|-----------|------|---------|
| PDF の実際の表示 | happy-dom に PDF plugin なし | ブラウザ手動検証 |
| audio/video の再生 | happy-dom に MediaSource なし | ブラウザ手動検証 |
| blob URL の実際の resolve | happy-dom の `URL.createObjectURL` が stub | ブラウザ手動検証 |
| preload="none" の効果 | ネットワーク/decode 挙動はブラウザ依存 | ブラウザ手動検証 |
| 大容量ファイルのメモリ影響 | happy-dom はメモリ制約をシミュレートしない | 実機テスト |

### 10.3 テスト方針

- **DOM 構造テスト** (happy-dom): preview 要素の生成・属性・fallback を自動テスト
- **統合テスト** (happy-dom): render → populate → cleanup のライフサイクルを自動テスト
- **ブラウザ検証** (手動): 実際の PDF/audio/video の表示・再生を目視確認

---

## 11. Intentionally not done

- HTML / SVG の inline preview (既存 sandbox 経路を使用)
- streaming (Progressive download)
- audio/video の高度な再生制御 (再生位置記憶、速度変更等)
- **audio/video の再生状態保持**: re-render 時に blob URL が revoke → 再生成されるため、再生位置・再生中状態は失われる。state 変更が発生するたびに preview は初期状態にリセットされる。再生状態の保持は blob lifecycle と構造的に両立しないため、意図的にスコープ外とする
- drag & drop による asset upload
- inline preview の折り畳み/展開 UI
- edit mode preview pane での inline preview
- entry window 内での inline preview
- 非対応 MIME への preview プラグイン拡張

---

## 12. 5 層構造の適合

| 層 | 変更 |
|---|---|
| core | 変更なし |
| features | 変更なし (`classifyPreviewType` は adapter 層にある) |
| adapter/ui | `action-binder.ts` に `populateInlineAssetPreviews()` 追加 |
| adapter/ui | CSS に inline preview のサイズ制約追加 |
| runtime | 変更なし |
| main.ts | `populateInlineAssetPreviews()` の呼び出し追加 |

層間の依存は adapter 内で完結。features 層への変更なし。

---

## 13. 次ステップ

1. 本仕様の承認
2. `populateInlineAssetPreviews()` の実装
3. CSS (サイズ制約、chip 非表示)
4. main.ts への呼び出し追加
5. テスト (DOM 構造 + lifecycle)
6. ブラウザ手動検証
7. INDEX.md 更新
