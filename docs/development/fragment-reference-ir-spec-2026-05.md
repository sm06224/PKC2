# Fragment Reference IR — 探索 spec(2026-05-05、領域 10-6 ζ'' Phase 3c)

**Status**: 探索 / feasibility(user direction「まず可能性を探るところから」)、Phase 3 sub-track として進行
**Lineage**: 領域 10-6 ζ'' wave Phase 3a(URL/filetype classifier)→ Phase 3b(auto-fill)→ **Phase 3c(本 doc):fragment 参照 + 交換表現 IR + ユーザー converter / bookmarklet 整備**

User direction(2026-05-05、PR #265 / Phase 3a-r1 push 後):
> URLやassetにしたpdfのページ番号などでブックマークして開くリンクは作れますか?こらは検討してできそうなら実装したい。
> PDFの特定ページに対しての引用やコメントを記録するのに使えそうな機能があればなって思っただけ。
> これは、youtubeだと再生時間指定の#記法みたいなものかも。
> 小説を読もうだとnコードとページ番号かな?
> これはまず可能性を探るところからかも。
> できれば、中間表現や交換表現を定めてユーザーが自らそれらの表現に対してのコンバータスクリプトやブックマークレットを用意できるように整備しましょうか。

---

## 1. 動機 — なぜ fragment 参照なのか

PKC2 の filer view + book/video/novel-base subset が landed したことで、user は「閲覧体験 + 操作体験」を俯瞰できるようになった。次の自然な要求は **「ある資料の特定箇所」を指す参照を残せること**:

- **PDF の引用**:「Knuth 1973 の p. 245 の挿絵を参考に」
- **YouTube の特定タイミング**:「この説明の 02:13 から 02:45 がポイント」
- **小説のあるシーン**:「なろうの n7975cr の 28 話、終盤の独白」
- **Amazon の特定レビュー / 商品カテゴリ**:「この本の "中" 評価レビューが参考になる」

PKC2 はすでに **内部 fragment**(`entry:<lid>#log/<id>` 等、TEXTLOG / 章節節まで)を canonical 化しているが、**外部 URL / asset への fragment 参照** は存在しない。

---

## 2. 既存の native fragment 表現(調査)

各プロバイダが既に native に持っている fragment 表現:

| プロバイダ | URL fragment | 例 |
|---|---|---|
| YouTube | `?t=130` or `?t=2m10s` or `&start=130` / `#t=130` | `youtu.be/abc?t=130` |
| niconico | `?from=130` | `nicovideo.jp/watch/sm1?from=130` |
| Vimeo | `#t=2m10s` | `vimeo.com/123#t=2m10s` |
| Spotify | `?si=…&t=30` | track 内 fragment は API のみ |
| 小説家になろう | path-based pages | `ncode.syosetu.com/n7975cr/28/` |
| カクヨム | path-based episode | `kakuyomu.jp/works/<id>/episodes/<ep>` |
| 青空文庫 | HTML anchor `#xxx` | `aozora.gr.jp/cards/.../files/.html#sec03` |
| Wikipedia | `#section` / `#:~:text=` | text fragment(W3C) |
| arXiv / PDF | URL `#page=42` | PDF.js 等が解釈 |
| Web ページ | text fragment `#:~:text=…` | Chrome / Edge 標準 |
| Amazon | reviewerId / format / page query | 商品ページ自体に fragment 規約なし |

**観察**:
- **動画系は時間 fragment が概ね揃っている**(`t=` / `start=` / `from=`)
- **小説系は path-based**(URL 構造そのものが locator)
- **PDF は `#page=` が PDF.js / Adobe 共通**
- **任意 web ページは W3C text fragment**(`#:~:text=`)が最近の標準
- **Amazon 等 EC は fragment 規約が無い**(レビュー個別 ID 等は別 path)

→ **すべての対象を 1 つの統一 schema で表現** するなら、各 provider の native fragment を locator として採用 + PKC 側で意味的タグ(time / page / section / text-quote 等)を付与する形が現実的。

---

## 3. 設計案 — Canonical Fragment IR

### 3.1 中核 schema(JSON 直列化可能)

```ts
type CanonicalFragment = {
  /** 元リソースの URI(http/https/asset:KEY/entry:LID) */
  source: string;

  /** 種別タグ:provider が決めるのではなく、locator の意味で命名 */
  locator_kind:
    | 'time'        // 動画 / 音声の再生位置(seconds)
    | 'time-range'  // 開始 + 終了
    | 'page'        // PDF / ebook のページ
    | 'page-range'  // ページ範囲
    | 'episode'     // 連載小説のエピソード番号
    | 'section'     // HTML anchor / 章節
    | 'text-quote'  // W3C text fragment
    | 'asset-rect'  // 画像の rect (x,y,w,h)
    | 'log'         // 既存 PKC2 internal: entry:LID#log/ID
    | 'custom';     // user 拡張用

  /** locator 本体。kind ごとに異なる shape:
    * time:        { start_sec: number; end_sec?: number }
    * page:        { page: number; end_page?: number }
    * episode:     { episode: string | number; offset?: number }
    * section:     { anchor: string }
    * text-quote:  { exact: string; prefix?: string; suffix?: string }
    * asset-rect:  { x: number; y: number; w: number; h: number }
    * log:         { log_id: string }
    * custom:      Record<string, unknown>
    */
  locator: Record<string, unknown>;

  /** 元の URL に最も近い "open するための文字列"。例:
    *   YouTube → "https://youtu.be/abc?t=130"
    *   PDF asset → "asset:K#page=42"
    *   syosetu → "https://ncode.syosetu.com/n7975cr/28/"
    * 開く側はこれを優先利用、解釈不能なら source + locator から再構築。
    */
  open_uri?: string;

  /** 表示ラベル。user が override 可能、未指定なら provider が生成 */
  label?: string;

  /** メモ(引用や注釈)。fragment そのものの一部として保持 */
  comment?: string;
};
```

### 3.2 PKC2 内 markdown 表記

既存の `[label](asset:KEY)` / `[label](entry:LID)` / `[label](https://...)` を拡張せず、**fragment は URL 部分の中にだけ**収める設計が markdown 互換性が高い:

```
[Knuth 1973 p. 245](asset:knuth-vol1-pdf#page=245)
[02:13 のポイント](https://youtu.be/abc?t=133)
[28話 終盤](https://ncode.syosetu.com/n7975cr/28/#:~:text=独白)
[この一節](entry:lid-of-essay#section=intro)
```

→ markdown render 経路は **既存のまま**、parser 側で fragment を canonical IR に変換する converter を別途用意する。

### 3.3 Converter インターフェース(user 拡張点)

```ts
export interface FragmentConverter {
  /** どの URI を扱うか。host / scheme / asset MIME などで判定。 */
  match(input: string, ctx?: { mime?: string }): boolean;

  /** URI string → canonical fragment IR */
  toCanonical(input: string): CanonicalFragment | null;

  /** canonical fragment IR → 開ける URI string */
  fromCanonical(c: CanonicalFragment): string | null;

  /** 表示用ラベル生成(label 未指定時) */
  formatLabel?(c: CanonicalFragment): string;
}
```

PKC2 標準 converter を `src/features/fragment/converters/` に置き、user は **bookmarklet** や **container 設定** で自前 converter を登録できる仕組みを準備する。

### 3.4 Bookmarklet との連携

User direction(Phase 3a-r1):
> 今後、それらのサイトをスナップショット的に取り込むためのブックマークレットも計画

Bookmarklet が出力する snapshot JSON 形式を、本 IR を含む形にしておくと統一できる:

```json
{
  "format": "pkc2-fragment-snapshot",
  "version": 1,
  "fragment": {
    "source": "https://youtu.be/abc",
    "locator_kind": "time",
    "locator": { "start_sec": 133 },
    "open_uri": "https://youtu.be/abc?t=133",
    "label": "02:13 のポイント"
  },
  "selection": {
    "title": "ページタイトル",
    "snippet": "選択していたテキスト"
  },
  "captured_at": "2026-05-05T12:34:56Z"
}
```

PKC2 側に「Snapshot 受入」モーダルを実装し、上記 JSON を貼り付けると新規 entry が frontmatter + body 付きで生成される。Bookmarklet 自体は user(または PKC コミュニティ)が provider 別に用意できる。

---

## 4. 実装段階(Phase 3c sub-phases)

| Phase | 内容 | サイズ |
|---|---|---|
| **3c-A** | fragment-reference-ir spec 起こし(本 doc) + open-questions 整理 | 小 |
| **3c-B** | features 層に `CanonicalFragment` 型 + 標準 converter 4 件(youtube / vimeo / niconico / pdf-page / syosetu / text-fragment)+ unit tests | 中 |
| **3c-C** | markdown link parser を fragment-aware にして、entry detail で「fragment 付き link を開く」UI(YouTube は時間付き、PDF は page 付き jump) | 中 |
| **3c-D** | meta pane / filer card に「fragment ラベル」表示(user が即座に「これはどこの何ページか」確認可能) | 小 |
| **3c-E** | Snapshot モーダル + フォーマット仕様確定 + sample bookmarklet 1〜2 件 | 中 |
| **3c-F** | user-defined converter プラグイン仕組み(container 設定で converter を登録できる) | 大、deferred 候補 |

→ **3c-A〜D は現実的に実装可能**、3c-E は Phase 3 wave 内、3c-F は Phase 5 後に独立 wave を切る。

---

## 5. Open Questions(user 議論待ち)

| Q | 内容 | options |
|---|---|---|
| **Q1** | fragment IR の存在場所:markdown body 内 link or 独立 metadata field | (a) link URL に native fragment を埋める / (b) entry に `fragments[]` フィールドを additive に追加 — **推奨 (a)**、既存 markdown 経路と互換、(b) は IR が肥大 |
| **Q2** | PDF の page 指定はどう開くか | (a) PDF.js 同梱(数百 KB)/ (b) browser ネイティブ PDF viewer(`asset:K#page=N`)/ (c) ダウンロード後 user が手動 — **推奨 (b)**、Chrome/Safari/Edge は ネイティブ対応 |
| **Q3** | text-quote(W3C `#:~:text=`)対応 | (a) 標準採用 / (b) 独自記法 — **推奨 (a)**、Chrome/Edge ネイティブ |
| **Q4** | converter の register 仕組み | (a) build-time 固定 / (b) container 内 `__fragment_converters__` 設定 / (c) bookmarklet 経由で動的 inject — **推奨 (a) で標準 converter、(b) で user 拡張、(c) は将来** |
| **Q5** | Bookmarklet の配布 | (a) PKC2 同梱 doc に bookmarklet コード掲載、user が自分で bookmark 登録 / (b) 専用配信ページ / (c) Browser extension — **推奨 (a)**、最小依存 |
| **Q6** | 既存 internal fragment(`#log/ID`)との統合 | locator_kind: 'log' として吸収、新 IR でも parse 可能に — Phase 3c-B で確定 |
| **Q7** | wave 着手順序 | filer wave (10-6) 完了後の独立 sub-track / 並走 — **推奨 並走 OK**、Phase 3 系列は filer の機能を補完する自然な拡張 |

---

## 6. Feasibility 結論(現時点)

**実装可能**:
- YouTube / Vimeo / niconico の 時間 fragment(native URL fragment 流用)
- PDF asset の `#page=N`(browser native PDF viewer 利用)
- 小説サイトの path-based locator(IR の `locator_kind: 'episode'` で表現)
- W3C text fragment(`#:~:text=`)— Chrome/Edge ネイティブ
- Internal `entry:LID#log/ID` 統合

**部分実装 / future**:
- Amazon / 楽天 の特定 review / カテゴリ fragment(provider 規約が無い、本文中 anchor 等で代用)
- 動画 time-range の精密同期(start + end の 2 点指定は IR に乗るが UI が要)
- Bookmarklet 配布(本 PR では doc + sample のみ、コミュニティで拡充)

**設計の鍵**:
- canonical IR は **provider に依らない** locator_kind 命名
- markdown link 内に native fragment を埋める伝統的 web 流儀を採用
- converter プラグインで user 拡張を許容(container 設定 / bookmarklet)

→ Phase 3c-A(本 doc)で **可能性を確定**、user 判断後 3c-B 着手の流れが推奨。

---

## 7. Viewer 責務 — PKC-extension への分離(2026-05-05 user 追加)

User direction:
> 読書帖やビデオ帖として使えるようにするには EPUB や zip 済み画像の
> 書籍ビューワーや webm の動画ビューワーを提供すべきかも。これは、
> PKC-extension の責務かな?

**結論:そう、PKC-extension の責務**(領域 10-5 範囲)。理由:

1. **bundle.js を肥大化させない** — EPUB.js (~500 KB)、PDF.js (~1 MB)、CBZ 展開(JSZip + 画像 viewer ~100 KB)、video.js (~300 KB)を本体に乗せると単一 HTML 哲学を破壊
2. **依存スタイルが viewer ごとに異なる** — EPUB は SPI / TOC / フォント設定、CBZ は見開き / 縦スクロール / 拡大、webm は player UI、PDF は注釈、すべて別物
3. **PKC2 本体は資料の保存と参照に集中** — viewer は外部 extension が担当、PKC-Message 経由で「この asset / fragment を開いて」とリクエストする

### Viewer extension の役割分担(future、領域 10-5 連携)

| viewer extension | 担当 | PKC-Message protocol(Phase 10-5 で確定) |
|---|---|---|
| `epub-viewer` | EPUB 展開 + 章節 navigation + ブックマーク | `record:offer { kind: 'epub', asset_key, fragment? }` で開く |
| `cbz-viewer` | zip 化された画像書籍(.cbz / .cbr / .zip) | 同上、`fragment.locator_kind: 'page'` |
| `pdf-viewer` | PDF.js or browser native | 同上 |
| `media-viewer` | webm / mp4 / mp3 等 | 同上、`fragment.locator_kind: 'time'` or `'time-range'` |

### 本 spec 範囲(Phase 3c)では何を実装するか

PKC2 本体側の責務に絞る:
- ✅ canonical fragment IR を保存 / 参照する型と converter
- ✅ markdown link 内 fragment(`asset:K#page=42`)を parse する経路
- ✅ "このリンクを開く" 時に **viewer extension があれば PKC-Message dispatch、なければ browser native fallback**(PDF は browser viewer、画像 zip は dummy zip download など)
- ❌ EPUB / CBZ / 動画の独自 viewer 実装 → **PKC-extension で別 wave**

Phase 10-5(PKC-Message + extension 連携)着地後に viewer extension の標準仕様を定め、それまでは fallback パスで「とりあえず開ける」状態を維持。

→ 本 spec の §4 sub-phase 3c-C「fragment 付き link を開く」は **viewer extension があれば dispatch、なければ browser native open** の二段構えで実装。

---

## 8. 参照

- 領域 10-5 PKC-Message + extension(viewer 連携の本体): roadmap §10-5
- 領域 10-6 audit: [`filer-view-and-folder-display-profile-audit-2026-05.md`](./filer-view-and-folder-display-profile-audit-2026-05.md)
- 領域 10-3 IR audit(本 doc と将来 merge): [`intermediate-representation-audit.md`](./intermediate-representation-audit.md)
- W3C Text Fragment: <https://wicg.github.io/scroll-to-text-fragment/>
- PDF `#page=` syntax (Adobe): <https://helpx.adobe.com/acrobat/kb/link-html-pdf-page-acrobat.html>
- 既存 PKC2 fragment(`entry:LID#log/ID`): `docs/spec/pkc-link-unification-v0.md`
- roadmap §10-6 bookmarklet 計画: `feature-requests-2026-04-28-roadmap.md`
