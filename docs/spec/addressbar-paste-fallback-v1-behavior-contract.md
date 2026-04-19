# アドレスバー貼付 Fallback v1 — Behavior Contract

Status: DRAFT 2026-04-19
Pipeline position: behavior contract
Parent: `docs/planning/file-issues/08_editor-address-bar-link-paste-markdown.md`
Predecessor minimum scope: `docs/spec/addressbar-paste-fallback-v1-minimum-scope.md`
Predecessor v1 behavior contract: `docs/spec/addressbar-url-title-paste-v1-behavior-contract.md`（FI-08 v1）

Supervisor decisions (2026-04-19):

- **D-FB1 = B**: renderer 側 autolink 対応。paste pipeline は触らない。
- **D-FB2 = not C**: paste 時に `text/plain` の URL を Markdown（`<URL>` / `[URL](URL)`）に自動変換しない。
- **D-FB3 = not D**: UA sniffing を導入しない（Firefox 検出による分岐は行わない）。
- **D-FB4 = separate issue**: rich link preview（OGP / title fetch / thumbnail）は別 issue に切り出す。

---

## 0. 位置づけ

FI-08 v1（`addressbar-url-title-paste-v1`）は「clipboard に `text/html` anchor がある」ケースを paste pipeline で吸収する実装。Chrome / Edge / Safari の典型経路は v1 で解決済み。

Firefox macOS はアドレスバーコピー時に clipboard を **`text/plain` のみ** にする挙動があり、v1 の分岐に入らず `bare URL` がそのまま挿入される。

本 contract は minimum scope の supervisor 判断を受け、**renderer 側の autolink のみで Firefox ギャップを埋める** 挙動契約を確定する。paste pipeline は一切変更しない。**docs-only（実装はこの contract 確定後の後続作業）**。

### 0-1. 実装状況の前提

`src/features/markdown/markdown-render.ts` は既に markdown-it を `linkify: true` で初期化しており、GFM 相当の bare URL 自動リンク化（`https://...` / `http://...` / `www....`）が rendered Markdown 経路で機能している。また `validateLink` で scheme allowlist、`link_open` rule で `target="_blank"` / `rel="noopener noreferrer"` の適用も既存。

従って D-FB1 = B の本体は **既存の linkify が仕様上カバーしている可能性が高い**。本 contract の主目的は以下：

1. 「どの surface で autolink が効くか」の境界を明文化する
2. 既存 `validateLink` / `link_open` との合流点を契約化する
3. 新規の誤リンク化を招かないことを invariant で担保する
4. FI-08 v1 の 29 テストに回帰を入れないことを宣言する
5. editor textarea（編集中 plain text）には autolink を掛けないことを確定する

## 1. Scope

### 1-1. 対象

| 項目 | 対象 |
|------|-----|
| Markdown 解釈を通る「view / rendered preview」系 surface における bare URL の autolink 表示 | **対象** |
| TEXT archetype body の rendered 表示（詳細ペイン read mode / preview） | **対象** |
| TEXTLOG archetype の rendered 表示（日付グループ内の article 表示） | **対象** |
| Markdown renderer が使われる全 surface（markdown-it 1 箇所のカバレッジ） | **対象** |
| autolink の scheme allowlist 適用（既存 `validateLink` 継承） | **対象** |
| autolink 結果の `target="_blank"` / `rel="noopener noreferrer"` 付与（既存 `link_open` 継承） | **対象** |

### 1-2. 非対象

| 項目 | 非対象理由 |
|------|-----------|
| paste イベント hook / clipboard 加工 | D-FB2 により paste pipeline 非介入 |
| `text/plain` 内容の Markdown 化 | 同上（`[URL](URL)` / `<URL>` 自動化しない） |
| editor textarea（編集中領域）における autolink 表示 | plain text 編集の等価性維持（§2-3 参照） |
| Firefox / UA 検出による分岐 | D-FB3 により UA 依存導入しない |
| OGP / metadata fetch / title 取得 | D-FB4 により別 issue |
| rich link preview card / favicon / thumbnail | 同上 |
| title / source_url / form field surface への追加対応 | 既存 surface 判定を踏襲 |
| `www....` 相当の schemeless URL の扱い拡張 | 既存 linkify の初期設定に委ねる（後述 §3-4） |
| 新 module / 新規 features/url-autolink 追加 | minimum scope §8-3 の判断（markdown-render 1 箇所で完結） |

### 1-3. 責務分離

| 責務 | 担当 |
|------|------|
| clipboard 加工 / paste 時挿入形式 | FI-08 v1（既存実装）。本 contract は不介入 |
| rendered view における bare URL のクリック可能化 | 本 contract（markdown-it linkify + validateLink + link_open の合流） |
| editor（textarea）における plain text 編集の保持 | 本 contract（明示的に非対象宣言） |
| title / OGP 等の外部取得 | 別 issue（D-FB4） |

## 2. Render contract

### 2-1. 対象 surface の列挙

Markdown renderer（`renderMarkdown` / markdown-it instance）が呼ばれる以下の surface が autolink 対象：

| Surface | archetype | 発火経路 |
|---------|----------|---------|
| 詳細ペイン read mode の body 表示 | TEXT | `DetailPresenter.renderBody` → markdown-it |
| TEXTLOG の日付グループ内 article 表示 | TEXTLOG | TEXTLOG presenter の日付ごとレンダリング |
| Markdown で書かれた任意の other archetype preview | other（generic / system-about 等） | 各 presenter が markdown-it を呼ぶ場合のみ |
| Todo description の Markdown 表示（description が markdown を通すなら） | TODO | 現状の実装に従う（本 contract は追加しない） |

### 2-2. 非対象 surface の列挙

| Surface | 理由 |
|---------|-----|
| **editor textarea（`data-pkc-field="body"` / `"textlog-append-text"` / `"textlog-entry-text"` 等）** | plain text 編集領域。autolink を視覚化すると編集体験が壊れる |
| title input | 単一行 plain text。Markdown を通さない |
| source_url input | URL 専用 input。autolink 不要 |
| form field 各種 | form archetype の schema に従う（本 contract 対象外） |
| export で出力される raw Markdown 文字列 | 保存データ側（bare URL のまま。autolink は表示時のみ） |

### 2-3. 境界原則

**autolink は「表示のための変換」であり「保存のための変換」ではない**。

- clipboard からの挿入結果（保存データ）は bare URL のまま。
- 再 render 時に markdown-it が bare URL を `<a>` として出力することで初めて clickable になる。
- editor に戻したときも bare URL のまま表示される（WYSIWYG な編集体験を保つ）。

### 2-4. 適用メカニズム

markdown-it 構成：

```ts
new MarkdownIt({
  html: false,
  linkify: true,       // ← これが bare URL autolink を担う
  typographer: true,
  breaks: true,
  ...
});
```

`linkify: true` は markdown-it の既存機能で、内部的に `linkify-it` ライブラリが使用される。検出範囲は GFM autolink extension 相当で、`https://` / `http://` / `ftp://` / `mailto:` / `www.` プレフィックス等を URL 候補とする。

本 contract は **linkify-it の検出範囲を変更しない**。既存挙動をそのまま contract 化する。

### 2-5. 既存 path との合流

linkify で検出された URL は markdown-it が `link_open` / `link_close` token を生成する。この token は既存の 2 段 hardening を必ず通る：

1. `md.validateLink(url)` — scheme allowlist。`javascript:` / `vbscript:` / `data:text/html;...` 等は reject。reject されたトークンは `<a>` として emit されず、plain text のまま残る。
2. `md.renderer.rules.link_open` — `entry:` は `data-pkc-action="navigate-entry-ref"`、その他は `target="_blank"` + `rel="noopener noreferrer"`。

従って linkify 由来の autolink も明示記法（`[label](url)`）と同じ安全保証を受ける。新たな hardening を追加する必要はない。

## 3. Safe URL contract

### 3-1. Scheme allowlist（既存踏襲）

`markdown-render.ts` の既存 3 正規表現を継続適用する。新規追加しない。

| 分類 | 正規表現 | 扱い |
|------|---------|------|
| 通常の URL / ref | `SAFE_URL_RE = /^(https?:\|mailto:\|tel:\|ftp:\|entry:\|#\|\/\|\.\/\|\.\.\/\|[^:]*$)/i` | allow |
| 画像 data URI | `SAFE_DATA_IMG_RE = /^data:image\/(gif\|png\|jpeg\|webp\|svg\+xml);/i` | allow（画像系 data URI のみ） |
| Office URI | `SAFE_OFFICE_URI_RE = /^(?:ms-(?:word\|excel\|...)\|onenote):/i` | allow |

上記いずれにもマッチしない scheme は `validateLink` が `false` を返し、markdown-it は `<a>` を emit しない。

### 3-2. linkify との合流規則

| 状況 | 結果 |
|------|-----|
| `https://example.com` を含む plain text → linkify 検出 → `validateLink('https://example.com')` = true | `<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>` |
| `javascript:alert(1)` を含む plain text → linkify はそもそも `javascript:` を URL 候補として検出しない（linkify-it の `schemas` に含まれない） | そのまま plain text として出力 |
| `data:text/html,<script>...` を含む plain text → linkify が data: を検出しない／検出されても `validateLink` reject | plain text のまま |
| `file:///etc/passwd` → linkify が file: を検出しない | plain text のまま |
| `entry:lid-123` を含む plain text → linkify は検出しない（既存明示記法 `[label](entry:...)` 専用） | plain text のまま（v1.x 非対象） |

**要点**: linkify の検出スコープは GFM autolink 相当で、**危険 scheme は元々候補に入らない**。万一通っても `validateLink` の二段目で reject される。I-FB4 / I-FB5（minimum scope）を継承する。

### 3-3. Office URI / data-image の扱い

これらは linkify の一般 URL 検出対象外（`ms-word:` / `data:` スキームは linkify のデフォルト schemas に含まれない）。bare text で `ms-word:ofe|u|...` を書いても autolink されない。明示記法（`[Edit](ms-word:...)`）は既存どおり機能する。本 contract は変更しない。

### 3-4. linkify-it のデフォルト挙動を超えた拡張禁止

- `linkify-it` の `schemas` 追加（`javascript:` / `file:` 等を URL として認識させる）は **行わない**。
- `linkify-it` の `fuzzy_link` / `fuzzy_ip` のデフォルト（現行 `true` / `false`）も変更しない。
- 将来 scheme を追加する場合も本 contract 外の変更として別 issue で扱う。

## 4. Interaction with FI-08 v1

### 4-1. 処理層の分離

| 層 | 担当 | タイミング |
|----|------|-----------|
| FI-08 v1（paste pipeline） | `text/html` anchor → `[label](url)` 形式へ正規化、textarea へ挿入 | paste event |
| 本 contract（render layer） | rendered Markdown 内の bare URL を `<a>` として emit | render event |

**paste 層と render 層は直交する**。FI-08 v1 が挿入した `[label](url)` は既に明示記法なので linkify 対象外。FI-08 v1 が何も挿入しなかった場合（G3 / G5: Firefox 等で `text/plain` のみ）は bare URL が textarea に残り、保存後の render 時に linkify が `<a>` に変換する。

### 4-2. 非衝突の証明

FI-08 v1 の `htmlPasteToMarkdown` は以下の条件で null を返し paste をブラウザ default に委ねる：

- `text/html` が無い
- `text/html` はあるが `<a href>` が 0 個

これらのケースで textarea に入るのは clipboard の `text/plain`（素の bare URL もしくは plain text）。本 contract の変更は render 時のみ働くため、paste pipeline の動作を一切変えない。

明示記法ケース（FI-08 v1 が `[label](url)` を挿入したケース）では、挿入済み Markdown 記法が render 時に linkify 判定対象から除外される（linkify は「裸の URL」のみを見る）。従って FI-08 v1 の label 保持が壊れない。

### 4-3. v1 既存テスト 29 件の扱い

| 内訳 | 件数 | 本 contract の影響 |
|------|-----|-------------------|
| paste unit（`html-paste-to-markdown.test.ts`） | 20 | 影響なし（paste pipeline 非介入） |
| action-binder integration | 5 | 影響なし |
| 誤爆防止（field gate 等） | 4 | 影響なし |

**全 29 件の回帰は 0 件の想定**。本 contract 実装時にも触らない。

### 4-4. label === URL 縮約との非衝突

FI-08 v1 は `<a href="https://x">https://x</a>` のように label と URL が同一の anchor を検出すると bare URL（`https://x`）に縮約して挿入する（v1 §4 の G-1 仕様）。縮約後の bare URL は本 contract の linkify により render 時に `<a>` 化される。結果：

- 保存データ = bare URL（v1 の縮約方針を維持）
- 表示 = `<a>` タグ（本 contract の linkify）
- clipboard に `<a>` があろうとなかろうと、最終的な表示は同じ clickable URL

この経路は FI-08 v1 の意図（「冗長 `[x](x)` を書かない」）と本 contract の意図（「bare URL は表示時に clickable」）が一致する。

## 5. Invariants

本 contract が確定した後に実装・保守する際、以下を破壊してはならない。

| # | 不変条件 | 破壊したら違反 |
|---|---------|---------------|
| **I-FBC1** | Image paste（screenshot → attachment）の最優先分岐を変更しない | paste pipeline のどの分岐にも触れたらアウト |
| **I-FBC2** | FI-08 v1 既存テスト 29 件を全通過維持 | 1 件でも regression |
| **I-FBC3** | paste pipeline のコード（`action-binder.ts` の `handlePaste` / `maybeHandleHtmlLinkPaste`、`html-paste-to-markdown.ts`）を変更しない | paste 層に 1 行でも編集が入ったらアウト |
| **I-FBC4** | `dangerous scheme`（`javascript:` / `vbscript:` / `data:text/html` / `file:` 等）を bare text から autolink しない | render HTML に該当 scheme の `<a href>` が 1 件でも出たら違反 |
| **I-FBC5** | `validateLink` の allowlist 正規表現を緩めない。allow 側への schema 追加は別 issue で扱う | SAFE_URL_RE / SAFE_DATA_IMG_RE / SAFE_OFFICE_URI_RE を広げたら違反 |
| **I-FBC6** | `link_open` rule の出力属性を変えない。外部 URL には必ず `target="_blank"` + `rel="noopener noreferrer"`。`entry:` は `data-pkc-action="navigate-entry-ref"` | 属性欠落 / 追加 / 変更は違反 |
| **I-FBC7** | editor textarea（`data-pkc-field` 系の編集領域）内で autolink を「表示」しない。textarea の value 文字列にも `<a>` 表現を挿入しない | textarea 内で clickable 表示が出たら違反 |
| **I-FBC8** | 保存データ（Container.entries[n].body）に autolink 用の追加情報を書き込まない。export した Markdown は元の bare URL のまま | export 文字列に `<...>` / `[x](x)` が自動追加されたら違反 |
| **I-FBC9** | UA（`navigator.userAgent` 等）を読む新コードを入れない | UA 判定が 1 箇所でも入ったらアウト（D-FB3） |
| **I-FBC10** | 外部ネットワーク GET / fetch / XMLHttpRequest / `<img src="http://...">` 等の probe を行わない | ネットワーク越しの metadata 取得は本 contract では禁止（D-FB4） |
| **I-FBC11** | linkify-it の `schemas` / `fuzzy_link` / `fuzzy_ip` のデフォルトを変えない | 検出スコープ拡大は別 issue |
| **I-FBC12** | 非 URL 文字列（`foo.bar.baz` のような schemeless 候補の濫用化）を増やさない — linkify のデフォルト判定範囲を超える検出を加えない | カスタム URL 正規表現の追加は違反 |

### 5-1. Invariant と minimum scope の対応

minimum scope の I-FB1〜I-FB8 を本 contract で I-FBC 系に refine:

- I-FB1（image paste 保護）→ I-FBC1
- I-FB2（v1 29 件維持）→ I-FBC2
- I-FB3（safe paste path 保護）→ I-FBC3
- I-FB4（dangerous scheme 自動リンク禁止）→ I-FBC4
- I-FB5（誤リンク化抑制）→ I-FBC5 / I-FBC11 / I-FBC12
- I-FB6（外部 GET 禁止）→ I-FBC10
- I-FB7（field allowlist）→ I-FBC3（paste 層非介入で自動継承）
- I-FB8（title / form 除外）→ I-FBC3（同上）

新規追加: I-FBC6（link_open 属性）/ I-FBC7（textarea 非表示）/ I-FBC8（保存データ不変）/ I-FBC9（UA 禁止）。

## 6. Examples

### 6-1. Firefox macOS アドレスバー貼付（G5 代表ケース）

```
clipboard:
  text/plain: https://example.com/article
  text/html:  （なし）
```

| 段階 | 挙動 |
|------|------|
| paste 時 | FI-08 v1 の `maybeHandleHtmlLinkPaste` は `<a>` 不在で early return。ブラウザ default により `text/plain` がそのまま textarea へ挿入 |
| 保存 | `body: "https://example.com/article"` |
| render | linkify が検出 → validateLink allow → link_open が `target="_blank"` + `rel="noopener noreferrer"` を付与 |
| 最終 HTML | `<p><a href="https://example.com/article" target="_blank" rel="noopener noreferrer">https://example.com/article</a></p>` |
| editor に戻したとき | textarea には `https://example.com/article` が plain text で表示（I-FBC7） |

### 6-2. Chrome アドレスバー貼付（G1: v1 既存ケース）

```
clipboard:
  text/plain: https://docs.example.com
  text/html:  <a href="https://docs.example.com">Docs</a>
```

| 段階 | 挙動 |
|------|------|
| paste 時 | FI-08 v1 が `<a>` を検出 → `[Docs](https://docs.example.com)` へ正規化して textarea 挿入 |
| 保存 | `body: "[Docs](https://docs.example.com)"` |
| render | 明示リンク記法 → linkify 非対象。既存 `link_open` で属性付与 |
| 最終 HTML | `<p><a href="https://docs.example.com" target="_blank" rel="noopener noreferrer">Docs</a></p>` |

v1 の label 保持が本 contract と衝突しないことを示す。

### 6-3. label === URL 縮約ケース（FI-08 v1 G-1 縮約）

```
clipboard:
  text/plain: https://x.com
  text/html:  <a href="https://x.com">https://x.com</a>
```

| 段階 | 挙動 |
|------|------|
| paste 時 | FI-08 v1 が label === URL を検出 → bare URL に縮約して挿入 |
| 保存 | `body: "https://x.com"` |
| render | linkify が bare URL を検出 → `<a>` emit |
| 最終 HTML | `<p><a href="https://x.com" target="_blank" rel="noopener noreferrer">https://x.com</a></p>` |

保存は bare、表示は clickable — v1 の縮約意図と本 contract が整合。

### 6-4. 危険 scheme を含む plain paste

```
clipboard:
  text/plain: javascript:alert(1)
  text/html:  （なし）
```

| 段階 | 挙動 |
|------|------|
| paste 時 | FI-08 v1 は `<a>` 不在で不介入。plain text が textarea に入る（user が危険 URL を自ら貼った形） |
| 保存 | `body: "javascript:alert(1)"` |
| render | linkify の schemas に `javascript:` が無いため検出されない。仮に検出されても `validateLink` reject |
| 最終 HTML | `<p>javascript:alert(1)</p>`（plain text） |

I-FBC4 準拠。

### 6-5. TEXTLOG append 欄での Firefox 貼付

```
target: textarea[data-pkc-field="textlog-append-text"]
clipboard:
  text/plain: https://example.com
```

| 段階 | 挙動 |
|------|------|
| paste 時 | FI-08 v1 は `<a>` 不在で不介入。text/plain がそのまま挿入 |
| append commit | TEXTLOG entry body に bare URL が記録される |
| render（日付グループ内 article 表示） | linkify が `<a>` 化 |
| 最終 HTML | 外部リンクとして clickable 表示 |

### 6-6. 混在テキスト（URL + plain text）

```
clipboard:
  text/plain: 参考: https://example.com と書いてあった
  text/html:  （なし）
```

| 段階 | 挙動 |
|------|------|
| paste 時 | bare text 全体が textarea に挿入 |
| 保存 | `body: "参考: https://example.com と書いてあった"` |
| render | linkify が URL 部分のみ `<a>` 化 |
| 最終 HTML | `<p>参考: <a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a> と書いてあった</p>` |

### 6-7. editor への戻り（read ↔ edit 切替）

| 状態 | 表示 |
|------|------|
| read mode | linkify による `<a>` |
| edit mode（textarea） | bare URL（plain text） — I-FBC7 |
| 再度 read mode | linkify により clickable に戻る |

編集中に視覚的変化が起きない保証（WYSIWYG-like な plain text 編集体験）。

## 7. Testability

### 7-1. 新規テスト領域

本 contract の実装は markdown-it の既存設定（`linkify: true`）の挙動を確認するため、**検証的テスト** を追加する。実装コード自体は（linkify 既有のため）ほぼ 0 行、テストは振る舞い契約として追加する。

| カテゴリ | ファイル候補 | 件数目安 |
|---------|------------|---------|
| bare URL autolink（renderer pure） | `tests/features/markdown-render.test.ts`（既存に追記） | 6 |
| dangerous scheme 非 autolink | 同上 | 3 |
| FI-08 v1 明示記法との非衝突 | 同上 | 2 |
| editor textarea 非適用（UI） | `tests/adapter/renderer.test.ts`（既存に追記） | 2 |
| TEXTLOG 表示 autolink | `tests/adapter/textlog-*.test.ts`（該当あれば既存） | 1 |

合計 ~14 件の新規テスト。v1 既存 29 件は触らない。

### 7-2. bare URL autolink（renderer pure, 6 件）

| # | 入力 | 期待 HTML 要素 |
|---|------|--------------|
| T-FBC-1 | `"https://example.com"` | `<a href="https://example.com">` あり、`target="_blank"`、`rel="noopener noreferrer"` |
| T-FBC-2 | `"http://example.com"` | 同上（http でも allow） |
| T-FBC-3 | `"mailto:user@example.com"` | `<a href="mailto:user@example.com">` あり。`target="_blank"` は付く（既存 link_open rule） |
| T-FBC-4 | `"参考: https://example.com を見て"` | URL 部分のみ `<a>` 化。前後の日本語は plain |
| T-FBC-5 | `"行1\nhttps://example.com\n行3"` | URL 行のみ `<a>` |
| T-FBC-6 | `""` / URL を含まない plain text | `<a>` が emit されない |

### 7-3. dangerous scheme 非 autolink（3 件）

| # | 入力 | 期待 |
|---|------|------|
| T-FBC-7 | `"javascript:alert(1)"` | HTML に `<a href="javascript:` が含まれない |
| T-FBC-8 | `"file:///etc/passwd"` | `<a href="file:` が含まれない |
| T-FBC-9 | `"data:text/html,<script>..."` | `<a href="data:text/html` が含まれない |

### 7-4. FI-08 v1 明示記法との非衝突（2 件）

| # | 入力 | 期待 |
|---|------|------|
| T-FBC-10 | `"[Docs](https://x.com)"` | 明示記法は linkify で二重処理されず、label "Docs" を保持 |
| T-FBC-11 | `"<https://x.com>"`（angle-bracket autolink） | 既存の angle-bracket autolink 仕様で `<a>` 化。本 contract 追加による重複処理なし |

### 7-5. editor textarea 非適用（UI, 2 件）

| # | シナリオ | 期待 |
|---|---------|------|
| T-FBC-12 | TEXT body edit mode で bare URL を入力 → textarea の value を確認 | textarea 内に `<a>` / HTML tag が出ない。`textarea.value` は plain URL 文字列 |
| T-FBC-13 | read ↔ edit を切替 | read 側だけ `<a>`、edit 側は plain（I-FBC7） |

### 7-6. TEXTLOG 表示 autolink（1 件）

| # | シナリオ | 期待 |
|---|---------|------|
| T-FBC-14 | TEXTLOG の日付グループ article に bare URL 入り entry を表示 | article 内 HTML に `<a>` が出る |

### 7-7. v1 既存テストに関する regression 境界

- `tests/adapter/html-paste-to-markdown.test.ts`（20 件）— 本 contract では変更しない
- `tests/adapter/action-binder-paste-link.test.ts` 相当（5 件）— 変更しない
- field gate テスト（4 件）— 変更しない

本 contract 実装時に CI で 29 件通過を必須。1 件でも fail したら本 contract 違反（I-FBC2）として扱う。

### 7-8. negative testability — やらないことの契約

| やらないテスト | 理由 |
|--------------|------|
| paste event mock で text/plain → Markdown 化の検証 | D-FB2 により paste pipeline を変えないので対象外 |
| Firefox UA を mock する branch のテスト | D-FB3 により UA 分岐がないので対象外 |
| fetch() mock による title 取得の検証 | D-FB4 により rich preview は別 issue |
| linkify-it の schemas 拡張による危険 scheme 検出のテスト | I-FBC11 により schemas 変更を禁じているので検証不要 |

## 8. Future split

### 8-1. 別 issue に切り出す項目

| 項目 | 理由 | 推奨 issue 名（仮） |
|------|-----|-------------------|
| Rich link preview（OGP / `<title>` fetch） | D-FB4。外部 GET / privacy / cache model が本 contract の外 | `FI-LinkPreview` / `docs/planning/file-issues/NN_link-preview-external-metadata.md` |
| Paste 時 URL → Markdown 変換（`<URL>` angle-bracket 化） | D-FB2 で不採用。将来 supervisor が UX 重視に転換した場合のみ再検討 | `FI-08.y`（v1.x の後継 minimum scope） |
| linkify schemas 拡張（独自 scheme を autolink 対象に） | I-FBC11 で禁止。必要が出た場合のみ別 issue | 新 minimum scope 起票 |
| Cache / favicon / thumbnail | rich preview に内包 | 同上 |
| UA sniffing による分岐処理（D-FB3 再考） | 原則棄却。PKC2 全体の設計方針に反する | — |

### 8-2. 採用済み方針の固定

- renderer 1 箇所で bare URL を clickable にする経路が「恒久解」。
- paste pipeline を改修して保存データに細工する道は **採らない**（保存データの純度を保つため）。
- title 情報が欲しい user は **手動で `[label](url)` を書く**、もしくは v1 の paste 経路（`text/html` anchor がある場合）に依存する。

### 8-3. 本 contract 確定後の実装ステップ

1. `tests/features/markdown-render.test.ts` に T-FBC-1〜T-FBC-11 を追加 → **すべて先に pass することを確認**（既存 linkify 動作の確認）
2. `tests/adapter/renderer.test.ts` に T-FBC-12 / T-FBC-13 を追加
3. TEXTLOG 表示テストに T-FBC-14 を追加
4. 追加テストが全 green なら実装コード変更ゼロで本 contract 完了
5. green にならない項目があれば、**なぜ不足しているかを本 contract の gap として明文化** → supervisor 判断に上げる（`validateLink` allowlist の誤差、linkify schemas の差分など）

### 8-4. 非ゴール（再掲）

- UI に「Markdown 化しました」系の toast / confirm を出さない
- settings に「autolink を無効化」等のトグルを作らない（将来要望が出れば別 issue）
- user 体感として「Firefox でアドレスバーコピーしたら clickable になった」以上のことを本 contract では約束しない

---

## References

- Predecessor minimum scope: `docs/spec/addressbar-paste-fallback-v1-minimum-scope.md`
- Predecessor v1 minimum scope: `docs/spec/addressbar-url-title-paste-v1-minimum-scope.md`
- Predecessor v1 behavior contract: `docs/spec/addressbar-url-title-paste-v1-behavior-contract.md`
- Parent file issue: `docs/planning/file-issues/08_editor-address-bar-link-paste-markdown.md`
- S-25 完了文書: `docs/development/html-paste-link-markdown.md`
- `src/features/markdown/markdown-render.ts` — `linkify: true` / `SAFE_URL_RE` / `md.validateLink` / `link_open` rule
- `src/adapter/ui/html-paste-to-markdown.ts` — FI-08 v1 paste pipeline（本 contract では変更しない）
- `src/adapter/ui/action-binder.ts` — `PASTE_LINK_ALLOWED_FIELDS` / `maybeHandleHtmlLinkPaste`（本 contract では変更しない）
- markdown-it linkify: https://github.com/markdown-it/linkify-it
- GFM autolink extension: https://github.github.com/gfm/#autolinks-extension-
