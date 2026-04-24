# アドレスバー貼付 Fallback v1 — Minimum Scope

Status: 実装済み(v2.1.0 以前に landing、v2.1.1 時点で稼働中)。本書は minimum-scope / historical design record として保持。実装の現物は `src/features/markdown/markdown-render.ts` の linkify + validateLink allowlist / `tests/features/markdown/markdown-render.test.ts` §FI-08.x T-FBC-1..11 / `tests/adapter/addressbar-paste-fi08.test.ts`。
Pipeline position: minimum scope
Parent: `docs/planning/file-issues/08_editor-address-bar-link-paste-markdown.md`
Predecessor: `docs/spec/addressbar-url-title-paste-v1-minimum-scope.md`（FI-08 v1）
Predecessor: `docs/spec/addressbar-url-title-paste-v1-behavior-contract.md`（FI-08 v1）

---

## 0. 位置づけ

FI-08 v1（addressbar-url-title-paste-v1）は、「アドレスバーコピー時の clipboard に `text/html` anchor が存在する」前提で、Chrome / Edge / Safari の典型ケースを吸収した。実装済みで実運用に入っている。

しかし 2026-04-18 付で以下の実観測が報告された：

> **Mac の Firefox のアドレスバーからコピーして TEXT エントリに貼ると Markdown 化されない。**

これは FI-08 v1 が前提にしていた「`text/html` に anchor が入る」という想定の外側にあるケースで、v1 の §0-3 G-2（`text/plain` のみ）に対応するが、v1 では意図的に非対象として punt された。

本文書は、この実観測を起点として **Firefox を含むブラウザ差異の fallback 方針** を確定する minimum scope。**docs-only**。実装しない。

## 1. 問題の再定義

### 1-1. FI-08 v1 の前提（既存）

FI-08 v1 は clipboard に `text/html` が入り、かつその中に `<a href>` 要素がある前提で動作する：

```
text/html あり + <a href> 1 個以上 → Markdown リンク正規化 → 挿入
text/html なし                      → ブラウザ default text/plain paste
```

### 1-2. ブラウザ差異の実態

| ブラウザ | アドレスバーコピー時の clipboard | FI-08 v1 の結果 |
|---------|-----------------------------|----------------|
| Chrome（最新） | `text/plain` + `text/html`（anchor 付き） | Markdown 化される（OK） |
| Edge（最新） | `text/plain` + `text/html`（anchor 付き） | Markdown 化される（OK） |
| Safari（macOS 最新） | `text/plain` + `text/html`（anchor 付き）※要再確認 | Markdown 化される（OK） |
| **Firefox（macOS 最新）** | **`text/plain` のみ（anchor なし）** | **Markdown 化されない（NG — 本問題）** |

注：Firefox の挙動はバージョン・プラットフォーム・URL の種類（通常 URL / 内部 about: 等）で差があり、一律「Firefox = text/plain のみ」と断定はできない。v1 実装時の §0-1 にもこの不確実性は記載済み。

### 1-3. user の実害

user は「アドレスバーから URL をコピーして貼付すれば Markdown リンクになる」という動作を Chrome で体験済みで、Firefox でも同じ期待を持っている。ところが Firefox では `text/plain` のみしか来ないため、現在は：

- ペースト結果: `https://example.com` （bare URL のみ、タイトル情報なし）
- 期待: `[ページタイトル](https://example.com)` または同等の UX

という「期待と現実のギャップ」が発生している。

### 1-4. タイトル情報が clipboard 経由では取れない本質

Firefox が `text/html` anchor を出さない場合、**clipboard からはタイトルが取得できない**。これは PKC 側の実装の問題ではなくブラウザ側の仕様。

従って fallback 方針は「clipboard にないタイトルをどう扱うか」の設計問題になる。選択肢は大きく 2 方向：

- **A 系**: タイトル取得を諦め、URL の扱い方だけ改善する（bare URL / auto-link）
- **B 系**: タイトルを外部取得する（OGP / metadata fetch）— **rich link preview の領域**

A 系は PKC 単体で完結するが、B 系はネットワーク GET を伴い single-HTML 哲学や privacy に抵触する。本 minimum scope では両系を比較しつつ、**B 系は別 issue に切り出す方針** を第一候補として検討する。

## 2. 対象ギャップの整理

user 指示の G1〜G5 を本 scope の用語で再整理する。

| ID | ケース | 現状 | FI-08 v1 との関係 |
|----|-------|------|------------------|
| **G1** | `text/html` に `<a href>` あり | v1 で `[label](url)` に正規化 | **解決済み**（対象外） |
| **G2** | `text/html` あり、ただし anchor 無し（別要素のみ） | v1 は null を返しブラウザ default に委ねる | **対象外継続**（問題化していない） |
| **G3** | `text/plain` に URL のみ（`text/html` 無し） | `text/plain` がそのまま挿入 → bare URL | **本 scope の中心課題** |
| **G4** | ブラウザ独自表現（非標準 MIME / 拡張属性等） | 想定外 / 動作不定 | **非対象**（調査コスト過大） |
| **G5** | **Firefox macOS アドレスバーコピー実ケース** | G3 のサブケース。clipboard に `text/plain` のみ | **本 scope で解決すべき代表ケース** |

### 2-1. G1 と v1 の関係

G1 は FI-08 v1 の本体。変更不要。v1 が処理する限り本 scope は触れない。

### 2-2. G2 の扱い

`text/html` が存在するが `<a href>` が一切含まれないケース（例：プレーンな `<p>text</p>` のみ）。v1 は `htmlPasteToMarkdown` が null を返すことでブラウザ default に委ね、text/plain が挿入される。これは現状でも壊れていない。**本 scope で扱わない**。

### 2-3. G3 の扱い — 本 scope の焦点

`text/plain` のみが clipboard にある。中身は URL か、URL を含むテキストか、URL と無関係なテキストか。**URL のみ**という判定が確度高くできる場合にのみ介入できる。

### 2-4. G4 の扱い

Firefox が過去のバージョンで `text/x-moz-url` を使っていた等の独自形式。現行安定版で実害が出ていない限り調査対象から外す。本 scope 非対象。

### 2-5. G5 の扱い — G3 の具体例

Firefox macOS 実観測は G3 の代表ケース。本 scope の fallback 設計が G5 を解消すれば主要目的達成。

## 3. v1 scope

supervisor が見たいのは「どこまでを短期修正するか／どこからを別 issue か」の境界。本 scope は以下のとおり絞り込む。

### 3-1. 本 scope で決めること（このドキュメントの deliverable）

- G3（`text/plain` のみ URL paste）の **fallback 方針の採否判断** を supervisor に提示する（D-series として整理）
- G4 / G5 / rich preview の **別 issue 化** を判断する
- 誤変換リスク・不変条件・UX tradeoff を明文化する

### 3-2. 本 scope で実装に着手する範囲（もし採択されれば）

| 項目 | 対象/非対象 |
|------|-----------|
| G3 の fallback 挙動を PKC 側で決める | **対象** |
| target textarea は FI-08 v1 と同一（body / textlog-append-text / textlog-entry-text） | **対象** |
| 危険 scheme 排除は FI-08 v1 の `isSafeHref` 踏襲 | **対象** |
| dangerous scheme（javascript:/vbscript:/data:）の plain URL からの検出 | **対象（safety）** |
| title 情報の外部取得（OGP / favicon / fetch） | **非対象**（別 issue） |
| Firefox `text/x-moz-url` 等の独自 MIME | **非対象** |
| rich link preview / embed | **非対象**（別 issue） |
| 複数 URL 同時貼付の特殊整形 | **非対象** |
| TEXT body 以外の surface（title / source_url / form field） | **非対象**（v1 既存判定継承） |
| entry-window 内の textarea | **非対象** |

### 3-3. 判断の粒度

本 scope は「A/B/C/D のうちどれを採用するか」を supervisor 判断に上げることが主目的。実装仕様まで確定するのは後続の behavior contract。

## 4. Fallback 方針候補（A / B / C / D）

G3 に対する選択肢を整理する。いずれも **前提**: clipboard に `text/plain` のみがあり、その内容が単一 URL（先頭 / 末尾に URL のみ、前後空白許容、改行なし）である場合。

### 4-A. 何もしない（現状維持）

clipboard `text/plain` がそのまま textarea に入る。結果は bare URL。

| 項目 | 内容 |
|------|------|
| 利点 | 誤変換ゼロ。実装コストゼロ |
| 欠点 | Firefox で user 期待「Markdown リンク化」が満たされない（G5 未解決） |
| 誤判定リスク | なし |
| PKC 哲学整合 | 完全整合 |
| 実運用 | Markdown renderer 側が bare URL を自動 link 化する実装（GFM 等）であれば表示上は機能するが、PKC2 の markdown-render 実装に依存 |

**評価**: 安全だが、user 実害（G5）を放置する。

### 4-B. bare URL を意味的リンクとして扱う（markdown-render 側対応）

PKC 側では clipboard 内容を変更しない。ただし PKC2 の markdown renderer が bare URL を自動で `<a href>` 化するよう確認・補強する。

| 項目 | 内容 |
|------|------|
| 利点 | paste 経路に触らないため副作用ゼロ。renderer 側の 1 箇所修正で全経路に波及 |
| 欠点 | 保存データは bare URL のまま。export / 他 markdown tool との互換性は renderer 依存 |
| 誤判定リスク | renderer 側で URL like な非 URL を誤検出する可能性（ただし GFM autolink 相当に留めれば既知の安全範囲） |
| PKC 哲学整合 | 整合（local / pure / no-network） |
| 実運用 | Markdown 仕様としては GFM autolink extension で標準化されており、既存実装がカバー済みの可能性あり |

**評価**: paste 経路を一切変えないため副作用リスクが低い。要調査事項: PKC2 の markdown-render が GFM autolink に対応しているか。

### 4-C. `text/plain` URL を Markdown link 化する

clipboard が URL のみだと判定できたら、paste 時に `<URL>` または `[URL](URL)` 形式に自動変換する。

| 項目 | 内容 |
|------|------|
| 利点 | user 期待「Markdown 化」に最も近い。保存データも Markdown 形式で統一される |
| 欠点 | タイトル情報は取得できないため label === URL の冗長形式になる。v1 の G-1 修正方針と衝突（v1 は label === URL をベア URL に縮約する）。結果 `[URL](URL)` → `URL` になり 4-A と等価に戻る矛盾 |
| 誤判定リスク | URL 判定ルール次第で非 URL 文字列（例: `file:///...` のローカルパス、`mailto:` 等）を誤変換する可能性 |
| PKC 哲学整合 | 整合（local / pure） |
| 実運用 | v1 の G-1 修正と整合させるなら「URL のみ → `<URL>` angle-bracket 自動リンク」が自然。GFM `<https://...>` 構文は明示的 autolink として安全 |

**評価**: 4-A との差が「angle-bracket が付くかどうか」に収束し、user 体感的な改善は限定的。ただし明示的 autolink 化の意図は記録される。

### 4-D. Browser-specific paste handling

user agent 判定で Firefox を検出し、Firefox のみ特別な fallback を入れる。

| 項目 | 内容 |
|------|------|
| 利点 | 問題のあるブラウザだけに介入できる |
| 欠点 | UA sniffing は脆弱（Firefox 側が将来 `text/html` を出すようになった瞬間に不要になる）。PKC2 の他の挙動で UA 分岐は現状ゼロで、新規導入は設計負債 |
| 誤判定リスク | UA spoofing / 少数派ブラウザの誤分類 |
| PKC 哲学整合 | 不整合（progressive enhancement でなく UA 依存） |
| 実運用 | 非推奨 |

**評価**: 棄却推奨。

### 4-E. 比較サマリ

| 案 | 誤変換 | 実装コスト | 哲学整合 | G5 解消度 |
|----|-------|----------|---------|----------|
| A 現状維持 | なし | ゼロ | ◎ | × |
| B renderer 側 autolink | 低 | 低〜中 | ◎ | ○（見た目のみ） |
| C paste 時 angle-bracket | 中 | 中 | ○ | △ |
| D UA 分岐 | 中 | 高 | × | ○ |

**推奨（起票者）**: **B を第一候補、C を第二候補**。A は現実のユーザー体験を放置するため下位。D は棄却。B と C は排他でなく併用可能。

## 5. Rich link preview の切り分け

「タイトルを外部取得する（OGP / fetch）」系の機能について：

### 5-1. 検討対象となり得る機能

- remote GET による `<title>` タグ取得
- OGP / Twitter Card / schema.org metadata 取得
- favicon / thumbnail 取得
- Obsidian / Notion / Loop 的な inline link preview card
- link metadata のキャッシュ（永続化 / invalidation）

### 5-2. 本 scope に入れない理由

| 論点 | 判断 |
|------|------|
| PKC2 の single-HTML / offline-first 哲学 | 外部 GET は本質的に矛盾する |
| Privacy（貼付操作で外部サーバに URL が通知される） | user opt-in が必要 → UI 設計が大きい |
| CORS / CSP による取得失敗の扱い | 失敗時の UX が別設計 |
| Cache の永続化先 / invalidation ルール | container model への影響大 |
| fetch 実装と paste pipeline の結合 | paste の同期性を壊す（await が必要） |
| テスト難度 | ネットワーク mock / timeout / race の広い surface |

いずれも FI-08.x の fallback としては **重すぎる**。fallback の責務は「clipboard 内容をどう text として扱うか」までに留めるべき。

### 5-3. 別 issue として切り出す判断

本 scope の結論として、rich link preview は **別 issue にする**。推奨の切り出し先：

- 新規 planning ticket：`docs/planning/file-issues/NN_link-preview-external-metadata.md`
- priority は低（P3 候補）— opt-in / offline 対応が前提となるため設計コストが高く、現行実装の延長にない

本 minimum scope は rich preview を参照するが **採用しない**。次段 behavior contract も rich preview を含まない。

## 6. 不変条件

採用案（B / C）が実装される場合でも、以下は必ず守る。

| # | 不変条件 |
|---|---------|
| I-FB1 | image paste を壊さない（既存 screenshot → attachment 経路が最優先分岐） |
| I-FB2 | FI-08 v1 の経路（`text/html` + anchor）を壊さない。v1 テスト 29 件（20+5+4）全通過を維持 |
| I-FB3 | TEXT / TEXTLOG の既存 safe paste path を壊さない（readonly / pasteInProgress / field gate） |
| I-FB4 | dangerous scheme（javascript: / vbscript: / data:）は bare URL であっても **自動リンク化しない**。もし C 案採用時でも safety check（`isSafeHref` 同等）を通す |
| I-FB5 | 誤リンク化を増やさない — URL らしからぬ text を autolink しない。GFM autolink 仕様（scheme + domain + path）相当の厳格判定のみ許容 |
| I-FB6 | PKC は外部ネットワーク GET を行わない（rich preview は本 scope 非対象） |
| I-FB7 | `data-pkc-field` の許可リスト（body / textlog-append-text / textlog-entry-text）外の textarea には一切適用しない |
| I-FB8 | title / source_url / form 系 field には適用しない |

## 7. 例

### 7-1. Firefox macOS アドレスバーコピー（G5 代表ケース）

```
clipboard:
  text/plain: https://example.com/article
  text/html:  （なし）
```

| 案 | 挙動 | 挿入結果 |
|----|------|---------|
| A | そのまま | `https://example.com/article` |
| B | そのまま（renderer が autolink） | `https://example.com/article`（保存は bare、表示はリンク） |
| C | angle-bracket 自動リンク化 | `<https://example.com/article>` |
| D | Firefox 検出して特別処理 | 他案と同等の結果だが UA 依存 |

### 7-2. plain URL only（Chrome で `text/html` が無いレアケース）

```
clipboard:
  text/plain: https://x.com
  text/html:  （なし）
```

**結果**: 7-1 と同じ。ブラウザ依存でなく「anchor が無い」一般ケースとして処理される。

### 7-3. HTML anchor あり（FI-08 v1 既存処理。本 scope 非該当）

```
clipboard:
  text/plain: https://docs.example.com
  text/html:  <a href="https://docs.example.com">Docs</a>
```

**結果**: `[Docs](https://docs.example.com)` — v1 既存処理。本 fallback は発火しない。

### 7-4. dangerous scheme を含む plain paste

```
clipboard:
  text/plain: javascript:alert(1)
  text/html:  （なし）
```

| 案 | 挙動 |
|----|------|
| A | `javascript:alert(1)` がそのまま挿入される（現状 — 実害は Markdown renderer が link 化しなければなし） |
| B | renderer 側が scheme whitelist を持つなら link 化されない（望ましい） |
| C | PKC 側で `isSafeHref` 同等判定をかけ angle-bracket 化を拒否。結果は A と同じ（bare text） |

**I-FB4 に従い**、採用案が B / C であっても dangerous scheme は自動リンク化しない。

### 7-5. TEXTLOG append 欄への plain URL paste

```
target: textarea[data-pkc-field="textlog-append-text"]
clipboard:
  text/plain: https://example.com
```

FI-08 v1 の field gate（3 値許可）は `textlog-append-text` を含む。採用案に応じて同じ fallback 挙動が適用される（I-FB7 に従い許可リスト内のみ）。

## 8. 次段の接続

### 8-1. 候補パス

| 判断 | 次段 |
|------|------|
| B 単独採用 | markdown-render の autolink 対応状況を調査 → 未対応なら renderer に GFM autolink extension 追加（別 spec） |
| C 単独採用 | 本 minimum scope を behavior contract に昇格させ、paste 時 URL 検出ルール・safety check・テスト境界を逐条固定 |
| B + C 併用 | behavior contract を 2 本（renderer 側 / paste 側）または 1 本に統合 |
| A（現状維持） | 本 scope は close。G5 は既知の制約として 09 トラブルシューティングに記載 |
| rich preview | 新規 planning ticket を切る（本 scope とは独立） |

### 8-2. supervisor 判断事項（D-series）

| ID | 判断内容 | 選択肢 |
|----|---------|-------|
| **D-FB1** | G3 の fallback 方針 | A / B / C / (B+C) / D |
| **D-FB2** | rich link preview の扱い | 別 issue 化 / 本 scope 拡張 / punt（判断延期） |
| **D-FB3** | D-FB1 で C を採用する場合の URL 判定厳格度 | GFM autolink 仕様準拠 / より厳格 / より緩い |
| **D-FB4** | D-FB1 で B を採用する場合の実装位置 | markdown-render 改修 / 新規 features/url-autolink module |

### 8-3. 起票者推奨順

1. D-FB1 = **B**（renderer 側対応）。paste 経路に触らず、副作用最小。
2. D-FB2 = **別 issue 化**。本 scope は rich preview に踏み込まない。
3. D-FB3 = N/A（B 採用時）。C 採用なら **GFM autolink 仕様準拠**。
4. D-FB4 = **markdown-render 改修**。新規 module の必要は薄い。

ただし supervisor が user の実感値を優先し「paste 時に目に見えて Markdown 形式になる」を求める場合は C（angle-bracket 自動リンク）採用もあり得る。その場合は保存データが `<URL>` 形式で残るため export 互換性が明確になる副次利点もある。

---

## References

- Predecessor minimum scope: `docs/spec/addressbar-url-title-paste-v1-minimum-scope.md`
- Predecessor behavior contract: `docs/spec/addressbar-url-title-paste-v1-behavior-contract.md`
- Parent file issue: `docs/planning/file-issues/08_editor-address-bar-link-paste-markdown.md`
- S-25 完了文書: `docs/development/html-paste-link-markdown.md`
- `src/adapter/ui/html-paste-to-markdown.ts` — `htmlPasteToMarkdown` / `isSafeHref` / `walkNode`
- `src/adapter/ui/action-binder.ts` — `PASTE_LINK_ALLOWED_FIELDS` / `maybeHandleHtmlLinkPaste` / `handlePaste`
- GFM autolink extension: https://github.github.com/gfm/#autolinks-extension-

