# Attachment Preview Strategy + Architecture Exception 定義

## 1. 背景

PKC2 の attachment エントリは、ファイルデータを base64 エンコードして
`container.assets` に格納し、単一 HTML 内で完結する設計を持つ。

プレビュー機能は **既に全 MIME 分類で実装済み** である。
本ドキュメントは、その既存実装を Architecture Exception として明文化し、
改善方針と実装段階を固定するために作成された。

### 既存実装の所在

| 対象 | ファイル | 行（概算） |
|------|----------|------------|
| MIME 分類 | `attachment-presenter.ts` | `classifyPreviewType()` L142-149 |
| プレビュー描画 | `action-binder.ts` | `populatePreviewElement()` L1047-1141 |
| Blob URL 生成 | `action-binder.ts` | `createBlobUrl()` L1034-1042 |
| ダウンロード | `action-binder.ts` | `downloadAttachment()` L990-1004 |
| データ解決 | `action-binder.ts` | `resolveAttachmentData()` L970-988 |
| Sandbox 制御 UI | `renderer.ts` | L1270-1305 |
| 別窓ボタン | `action-binder.ts` | `createOpenButton()` L1143-1152 |
| Detached Panel | `renderer.ts` | `renderDetachedAttachment()` L1807-1844 |

---

## 2. 対象 MIME 分類

`classifyPreviewType()` による現在の分類:

| 分類 | MIME パターン | プレビュー方式 |
|------|--------------|---------------|
| `image` | `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/bmp`, `image/x-icon` | Data URI → `<img>` |
| `pdf` | `application/pdf` | Blob URL → `<object>` + 別窓ボタン |
| `video` | `video/*` | Blob URL → `<video controls>` |
| `audio` | `audio/*` | Blob URL → `<audio controls>` |
| `html` | `text/html`, `application/xhtml+xml`, **`image/svg+xml`** | Blob URL → sandboxed `<iframe>` + 別窓ボタン |
| `none` | その他すべて | ダウンロードのみ |

> **Phase 1 適用済み**: SVG (`image/svg+xml`) は `image` ではなく `html` に分類されるようになった。
> SVG は `<script>`, `<foreignObject>`, イベントハンドラ等の active content を含みうるため、
> sandboxed iframe 経由の表示が必須。詳細は後述「SVG セキュリティ強化」節を参照。

### 判定関数

- `isPreviewableImage(mime)` — 6 種の安全な画像形式（SVG を除く）
- `isSvg(mime)` — `image/svg+xml`（sandbox 経路に誘導）
- `isPdf(mime)` — application/pdf
- `isHtml(mime)` — text/html, application/xhtml+xml

> video / audio の判定は `classifyPreviewType` 内で prefix match (`/^video\//` / `/^audio\//`) として inline 実装されている。個別 helper は持たない。

---

## 3. Preview / Download / Sandbox の責務分離

### 現在の責務配置

```
                      ┌──────────────────────────────────┐
                      │   attachment-presenter.ts         │
                      │   (adapter/ui)                    │
                      │                                   │
                      │   - parseAttachmentBody()         │
                      │   - classifyPreviewType()         │
                      │   - renderBody(): DOM 構造生成     │
                      │     (プレビュー枠は空の div)       │
                      │   - renderEditorBody(): 編集UI    │
                      └───────────────┬──────────────────┘
                                      │
                        render 後に呼び出し
                                      ▼
                      ┌──────────────────────────────────┐
                      │   action-binder.ts                │
                      │   (adapter/ui)                    │
                      │                                   │
                      │   - resolveAttachmentData()       │
                      │     base64 データの解決             │
                      │   - createBlobUrl()               │
                      │     atob → Uint8Array → Blob URL  │
                      │   - populatePreviewElement()      │
                      │     MIME 別 DOM 要素生成           │
                      │   - downloadAttachment()          │
                      │     Blob URL → <a>.click()        │
                      │   - createOpenButton()            │
                      │     window.open(blobUrl)          │
                      └───────────────┬──────────────────┘
                                      │
                        sandbox 制御 checkbox
                                      ▼
                      ┌──────────────────────────────────┐
                      │   renderer.ts                     │
                      │   (adapter/ui)                    │
                      │                                   │
                      │   - Sandbox Policy UI             │
                      │     チェックボックス群 in meta pane │
                      │   - Detached Panel                │
                      │     フローティングウィンドウ        │
                      └──────────────────────────────────┘
```

### 方針

- **presenter**: 構造（何を表示するか）を決定。DOM 枠を生成。データ変換担当。
- **binder**: ブラウザ API 呼び出し（Blob, URL.createObjectURL, window.open）。プレビュー実体を描画。
- **renderer**: レイアウトと sandbox 制御 UI の配置。

この分離は正しく、変更不要。

---

## 4. Architecture Exception 定義

### 4.1 なぜ通常レイヤーで完結しないか

PKC2 の 5 層構造（core ← features ← adapter）は純粋なデータフローを想定しているが、
attachment プレビューは以下のブラウザ固有境界を跨ぐ:

1. **Binary ↔ DOM 境界**: base64 → Blob → URL.createObjectURL → ネイティブ描画
2. **Sandbox 境界**: `<iframe sandbox>` による別オリジン相当の隔離
3. **Window 境界**: `window.open()` による別ウィンドウ描画
4. **メモリ管理境界**: Blob URL のライフサイクル管理（生成 / revoke）

これらは adapter 層内で完結するが、**adapter 層の通常パターン（state → render → bind）からは逸脱**している。
具体的には、render 後に binder が DOM を非同期に書き換える「post-render population」パターンが必要になる。

### 4.2 Browser / Native Boundary の所在

| 境界 | 発生箇所 | 制御者 |
|------|----------|--------|
| base64 → Blob 変換 | `createBlobUrl()` | action-binder |
| Blob URL → ブラウザ描画エンジン | `<img src>`, `<object data>`, `<video><source src>`, `<iframe src>` | ブラウザ（制御不可） |
| Sandbox 隔離 | `<iframe sandbox>` | ブラウザ（属性で制御） |
| 別窓開閉 | `window.open(blobUrl, '_blank', 'noopener')` | ブラウザ |
| Blob URL 寿命 | `URL.revokeObjectURL()` | action-binder |

### 4.3 Privileged Bridge の位置づけ

以下を **Privileged Bridge** と定義する:

```
┌─ PKC2 Internal ─────────────────────────────────────┐
│                                                      │
│  Container.assets[key]  (base64 string)              │
│         │                                            │
│         ▼                                            │
│  resolveAttachmentData()  ← Data Resolution Bridge   │
│         │                                            │
│         ▼                                            │
│  createBlobUrl()          ← Blob Bridge              │
│         │                                            │
│         ├── <img src="data:...">    (Data URI)       │
│         ├── <object data="blob:"> (PDF)              │
│         ├── <video src="blob:">   (Media)            │
│         └── <iframe src="blob:">  (HTML Sandbox)     │
│                │                                     │
│                ▼                                     │
│  ┌─ Sandbox Bridge ──────────────────────────────┐   │
│  │ iframe.sandbox = "allow-same-origin ..."      │   │
│  │ + user toggles (renderer.ts Sandbox Policy)   │   │
│  └───────────────────────────────────────────────┘   │
│                                                      │
│  ┌─ Window Bridge ───────────────────────────────┐   │
│  │ window.open(blobUrl, '_blank', 'noopener')    │   │
│  └───────────────────────────────────────────────┘   │
│                                                      │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌─ Browser Native ─────────────────────────────────────┐
│  PDF renderer, video decoder, image decoder,         │
│  HTML renderer (sandboxed)                           │
└──────────────────────────────────────────────────────┘
```

### 4.4 Security Risk

| リスク | 現状の緩和策 | 残存リスク |
|--------|-------------|-----------|
| HTML XSS（悪意ある HTML ファイル） | iframe sandbox + allow-same-origin baseline | sandbox escape (ブラウザ脆弱性依存) |
| Sandbox 権限の過剰付与 | ユーザー opt-in (checkbox) + readonly 時 disabled | ユーザーが全許可する可能性 |
| Blob URL 漏洩 | **Phase 2 で修正済み**: render 前に `cleanupBlobUrls()` で revoke + preview 差替時にも revoke | なし（通常操作では leak しない） |
| 別窓からの parent 参照 | `noopener` 指定 | なし（十分） |
| SVG 内スクリプト | **Phase 1 で修正済み**: sandboxed iframe 経由 | sandbox escape（ブラウザ脆弱性依存） |
| 大容量ファイルのメモリ溢れ | guardrails.ts の soft/heavy 警告 | 強制制限なし（警告のみ） |

### 4.5 将来の撤去 / 縮退可能性

- **Blob Bridge**: Web ブラウザが存在する限り必須。撤去不可。
- **Sandbox Bridge**: HTML プレビューを廃止すれば撤去可能。ただし価値が高いため残す方針。
- **Window Bridge**: PDF/HTML の別窓を廃止しインライン表示のみにすれば撤去可能。ただし UX 悪化。
- **Post-render population パターン**: Virtual DOM や reactive framework を導入すれば解消可能。現時点では採用しない。

---

## 5. Security Boundary の整理

### 信頼境界モデル

```
信頼レベル:

HIGH    Container データ（ユーザーが自分で作成/インポート）
 │
 │      ↓ parseAttachmentBody() — 入力バリデーション
 │
MEDIUM  Attachment メタデータ（name, mime, size）
 │
 │      ↓ resolveAttachmentData() — 存在確認
 │
LOW     Attachment バイナリデータ（base64 → Blob）
 │
 │      ↓ sandbox / noopener
 │
UNTRUST ブラウザ描画エンジンに委ねる内容
```

### 防御方針

1. **Image**: Data URI 使用。DOM 外に漏れない。SVG は将来的に sandbox 検討。
2. **PDF**: Blob URL + `<object>`。ブラウザの PDF ビューアに委任。
3. **Video/Audio**: Blob URL + ネイティブコントロール。攻撃面は小さい。
4. **HTML**: Blob URL + sandboxed iframe。**最も危険**。ユーザー opt-in で権限追加。
5. **別窓**: `noopener` で parent 参照を遮断。

---

## 6. 実装段階案

既存実装は全MIME分類をカバーしているが、以下の改善が段階的に可能:

### Phase 1: SVG セキュリティ強化（小） ✅ 完了
- SVG を data URI ではなく sandboxed iframe で表示
- `isPreviewableImage()` から SVG を除外し `classifyPreviewType()` で `html` に分類
- `isSvg()` ヘルパー追加、renderer の sandbox 制御 UI を SVG にも適用
- **理由**: SVG 内の `<script>` タグが Data URI 経由では実行可能だった

#### SVG セキュリティ強化の詳細

**なぜ SVG を危険側に分類するか**:
SVG は XML ベースのベクター画像フォーマットだが、以下の active content を含みうる:
- `<script>` タグ（JavaScript 実行）
- `<foreignObject>` タグ（任意 HTML 埋め込み）
- `on*` イベントハンドラ属性（クリック時スクリプト実行）
- `<a xlink:href>` / `<use href>` による外部リソース参照

Data URI (`data:image/svg+xml;base64,...`) で `<img>` に表示した場合でも、
ブラウザは SVG 内の一部スクリプトを実行しうる（ブラウザ実装依存）。

**image との扱いの違い**:
- PNG/JPEG/GIF/WebP/BMP/ICO: バイナリ画像。active content なし。Data URI で安全。
- SVG: XML テキスト。active content あり。sandbox 経由で隔離が必要。

**sandbox bridge に寄せた理由**:
HTML sandbox bridge（AE-002）は既に存在し、sandbox_allow 制御 UI も実装済みのため、
SVG 専用のセキュリティ機構を新設するよりも既存インフラの再利用が合理的。

**sanitize を採用しなかった理由**:
SVG sanitize は実装が複雑で、ホワイトリストの漏れが脆弱性に直結する。
sandbox isolation はブラウザの保証に依拠するため、実装コストとリスクの両面で優位。

### Phase 2: Blob URL ライフサイクル管理（小〜中） ✅ 完了
- プレビュー用 Blob URL を追跡し、エントリ切替時に revoke
- メモリリーク防止
- `data-pkc-blob-url` 属性を使った追跡は既に存在するため、revoke ロジック追加のみ

#### Blob URL ライフサイクル管理の詳細

**生成箇所**:
- `action-binder.ts` の `createBlobUrl()` — PDF/video/audio/HTML/SVG プレビュー用
- ダウンロード用は `downloadAttachment()` で 100ms 後に即 revoke（問題なし）

**なぜ leak していたか**:
`render()` が `root.innerHTML = ''` で DOM を全置換するため、
`data-pkc-blob-url` を持つ要素が DOM から外れるが Blob URL は revoke されなかった。
エントリを切り替えるたびに新しい Blob URL が生成・蓄積されていた。

**修正内容**:
1. `cleanupBlobUrls(root)` — render 前に呼び出し、DOM 内の全 `[data-pkc-blob-url]` を revoke
2. `populatePreviewElement()` 内 — preview 差替前に古い Blob URL を revoke
3. `main.ts` — render 直前に `cleanupBlobUrls()` を呼び出し

**revoke タイミング**:
| タイミング | 対応 |
|-----------|------|
| エントリ切替（render 前） | `cleanupBlobUrls()` で全 revoke |
| 同一要素の preview 差替 | `populatePreviewElement()` 内で前の URL を revoke |
| ダウンロード | `downloadAttachment()` で 100ms 後に revoke（既存） |

**preview UX 改善との関係**:
Phase 3 以降のズーム/フルスクリーン等は Blob URL の再生成が必要になるが、
cleanup → re-populate のパターンは変わらないため、本修正は前提として機能する。

### Phase 3: Preview UX Improvement Foundation（小〜中） ✅ 完了
- 情報整理と導線整理に焦点。高度ズーム/フルスクリーンは対象外。
- preview mode badge、fallback メッセージ、action 導線の一貫化

#### Preview UX 改善の詳細

**preview mode badge**:
MIME 分類に応じた human-readable ラベルを attachment card のメタ行に表示。
- image → "Inline" / pdf → "PDF Viewer" / video → "Video" / audio → "Audio"
- html/svg → "Sandbox" / unknown → "No Preview"
- `previewModeLabel()` ヘルパー関数 + `data-pkc-region="preview-mode"` 属性

**fallback message (No Preview)**:
`previewType === 'none'` かつデータありの場合、
"Preview is not available for this file type — use Download to save the file."
を `data-pkc-region="no-preview"` で表示。
Light export（data stripped）や空 attachment では非表示。

**action 導線の一貫化（Open in New Window）**:
| MIME 分類 | 以前 | Phase 3 後 |
|-----------|------|-----------|
| image | なし | 🖼 Open Image in New Window |
| PDF | あり（📄） | 変更なし |
| video | なし | 🎬 Open Video in New Window |
| audio | なし（controls で十分） | 変更なし |
| HTML/SVG | あり（🌐） | 変更なし |

image の "Open in New Window" は `createLazyOpenButton()` を使用。
画像は Data URI でインライン表示するため、クリック時に Blob URL を生成→開く→500ms 後 revoke。

**まだやっていないこと**:
- 高度ズーム / pan / rotate（image viewer 完成版）
- フルスクリーン
- 動画の音量記憶
- PDF のページ表示
- entry-window での preview 実装

**次の Phase 4 への接続**:
Phase 3 で action 導線の基盤が整ったため、entry-window 内での preview 実装に移行可能。
window 境界の追加（Blob URL の渡し方）が主要課題。

### Phase 4: entry-window でのプレビュー対応（中）
- 現在 entry-window は attachment を info card で表示
- entry-window 内でのプレビュー描画は window 境界の追加が必要
- `window.opener.pkcRenderMarkdown()` パターンに準じた bridge が必要

### Phase 5: sandbox デフォルトポリシー（小）
- HTML プレビューのデフォルト sandbox ポリシーを UI で選択可能にする
- Container レベルの設定として meta に格納

### 優先順位

```
Phase 1 (SVG) ✅ 完了
Phase 2 (Blob lifecycle) ✅ 完了
Phase 3 (UX Foundation) ✅ 完了
Phase 4 (entry-window) ← 機能拡張
Phase 5 (default policy) ← 設定拡張
```

---

## 7. ユーザー利用手順想定

### 現在の操作フロー

1. attachment エントリを作成
2. Edit → ファイル選択 → Save
3. Detail View にプレビューが表示される
   - 画像: inline 表示
   - PDF: inline `<object>` + 「Open PDF in New Window」ボタン
   - 動画/音声: inline controls
   - HTML: sandboxed iframe + 「Open HTML in New Window」ボタン
4. Meta Pane の Sandbox Policy でHTMLの権限を制御（HTML のみ）
5. Download ボタンでファイル保存
6. Detached Panel で別フレーム表示

### Light Mode での制限

- プレビュー不可（データなし）
- Download 不可
- "Data not included (Light export)" メッセージ表示
- Light badge でモード表示

---

## 8. 非対応範囲

以下は意図的に対象外とする:

| 項目 | 理由 |
|------|------|
| サーバーサイドプレビュー | PKC2 は単一 HTML。サーバーなし |
| DRM 付きメディア | Blob URL では再生不可 |
| 3D モデル (glTF, OBJ) | ブラウザネイティブサポート外 |
| Office ドキュメント (docx, xlsx) | ブラウザネイティブサポート外 |
| 暗号化コンテンツ | Container は平文前提 |
| CDN / 外部 URL 参照 | 単一 HTML 制約 |
| 複数ファイルの ZIP プレビュー | 個別エントリとして扱う |

---

## 付録: Exception Registry

今後 Architecture Exception が追加される場合、以下のフォーマットで記録する:

```
Exception ID: AE-001
Name: Attachment Preview Blob Bridge
Location: action-binder.ts (populatePreviewElement, createBlobUrl)
Type: Browser API Bridge
Boundary: adapter internal → Browser Native
Risk: LOW (Blob URL, ネイティブ描画)
Mitigations: revoke (download), noopener (別窓)
Removable: NO (ブラウザ必須機能)
```

```
Exception ID: AE-002
Name: HTML Sandbox Bridge
Location: action-binder.ts (populatePreviewElement, html case)
Type: Security Sandbox
Boundary: adapter internal → sandboxed iframe
Risk: MEDIUM (sandbox escape, ユーザー権限追加)
Mitigations: default allow-same-origin only, user opt-in, readonly disabled
Removable: YES (HTML プレビュー廃止で撤去可能)
```

```
Exception ID: AE-003
Name: Preview Window Bridge
Location: action-binder.ts (createOpenButton)
Type: Window Boundary
Boundary: adapter internal → detached browser window
Risk: LOW (noopener)
Mitigations: noopener flag
Removable: YES (別窓機能廃止で撤去可能)
```
