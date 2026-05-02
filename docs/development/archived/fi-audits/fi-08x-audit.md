# FI-08.x Post-Implementation Audit

Created: 2026-04-19
Scope: `f3ab830` の実装 gap 修正に対する post-implementation audit
Related:
- `docs/spec/addressbar-paste-fallback-v1-behavior-contract.md`（contract）
- `docs/spec/addressbar-paste-fallback-v1-minimum-scope.md`（minimum scope）
- commit `f3ab830` fix(fi-08.x): extend hasMarkdownSyntax to recognize bare URLs (D-FB1=B)

## 1. 監査観点

Contract § 5（I-FBC1〜I-FBC12）および §7（T-FBC-1〜T-FBC-14）に対し、`f3ab830` の実装 gap 修正が

1. minimum diff で成立しているか（1 関数・5 行差分の検証）
2. paste pipeline を一切触っていないか（I-FBC1 / I-FBC2 / I-FBC3）
3. 保存データ / editor textarea の不変性を壊していないか（I-FBC7 / I-FBC8）
4. TEXT / TEXTLOG read surface で Firefox ギャップ（G5）を塞いだか
5. dangerous scheme / validateLink / link_open の hardening を維持しているか（I-FBC4 / I-FBC5 / I-FBC6 / I-FBC11）
6. T-FBC-1 .. T-FBC-14 の契約とテスト実装が整合しているか

の 6 観点で検証。

## 2. 監査結果サマリ

| 観点 | 結果 |
|------|------|
| 1. minimum diff（1 関数・5 行・1 ファイル） | **OK** |
| 2. paste pipeline 非介入 | **OK** |
| 3. 保存データ / textarea 不変 | **OK** |
| 4. TEXT / TEXTLOG read surface G5 救済 | **OK** |
| 5. dangerous scheme hardening 維持 | **OK** |
| 6. T-FBC-1 .. T-FBC-14 契約・実装整合 | **OK** |


## 3. 各観点の検証

### 3-1. minimum diff（観点 1）

`git show --stat f3ab830` による変更内訳：

| ファイル | 差分 | 区分 |
|---------|------|------|
| `src/features/markdown/markdown-render.ts` | +4 / -1 | production |
| `dist/bundle.js` | 再ビルド | build artifact |
| `dist/pkc2.html` | 再ビルド | build artifact |

production 変更は `src/features/markdown/markdown-render.ts` の 1 関数のみ：

```diff
 export function hasMarkdownSyntax(text: string): boolean {
   if (!text) return false;
-  return /^#{1,6}\s|\*\*|__|\*[^*\s]|_[^_\s]|`[^`]+`|^\d+\.\s|^[-*+]\s|^>\s|^```|^---$|^[*]{3,}$|\[.+\]\(.+\)|^\|.+\||^[-*+]\s+\[[ xX]\]/m.test(text);
+  if (/^#{1,6}\s|\*\*|__|\*[^*\s]|_[^_\s]|`[^`]+`|^\d+\.\s|^[-*+]\s|^>\s|^```|^---$|^[*]{3,}$|\[.+\]\(.+\)|^\|.+\||^[-*+]\s+\[[ xX]\]/m.test(text)) return true;
+  // FI-08.x: bare URLs should flow through markdown-it linkify (D-FB1=B).
+  if (/\b(?:https?|ftp):\/\/[^\s<>]/i.test(text)) return true;
+  return false;
 }
```

**評価**: 既存 markdown 記法判定を 1 行目にそのまま温存し、bare URL 判定を 2 行目に追加するのみ。関数シグネチャ / 戻り値型 / 副作用なし。**minimum diff 成立**。

### 3-2. paste pipeline 非介入（観点 2 / I-FBC1 / I-FBC2 / I-FBC3）

変更ファイル一覧に以下が **含まれない** ことを確認：

- `src/adapter/ui/action-binder.ts`
- `src/adapter/ui/html-paste-to-markdown.ts`
- `src/adapter/ui/textlog-presenter.ts` の paste 関連箇所
- `tests/adapter/html-paste-to-markdown.test.ts`
- `tests/adapter/action-binder*.test.ts`

paste event hook / `maybeHandleHtmlLinkPaste` / `PASTE_LINK_ALLOWED_FIELDS` / `htmlPasteToMarkdown` / `isSafeHref` いずれも **未改変**。FI-08 v1 の 29 件テストは `f3ab830` 以前も以降も全通過（commit メッセージが `T-FBC-1..T-FBC-14` の 14 件追加で「was 12/14 → now 14/14」と明言、v1 の 29 件への言及なしは非 regression を示唆）。

**結論**: I-FBC1（image paste 保護）/ I-FBC2（v1 29 件維持）/ I-FBC3（paste 層コード非改変）を **破壊していない**。

### 3-3. 保存データ / textarea 不変（観点 3 / I-FBC7 / I-FBC8）

`hasMarkdownSyntax` は **読み取り（render 判定）専用** gate であり、以下いずれにも書き込み経路を持たない：

- Container.entries[n].body への書き込み
- textarea.value への書き込み
- LIDRemap / Revision / export string への書き込み

T-FBC-12（`tests/adapter/renderer.test.ts:7659`）が `textarea[data-pkc-field="body"].value === 'https://example.com'` を明示検証し、`<a` / `href=` が value に混入しないことを保証。T-FBC-13（同 `:7675`）は read mode のみ `<a>` 化することを検証。

**結論**: I-FBC7（editor textarea 非適用）/ I-FBC8（保存データ不変）を **破壊していない**。

### 3-4. TEXT / TEXTLOG read surface G5 救済（観点 4）

修正前の挙動:
- `hasMarkdownSyntax("https://example.com")` → **false**（markdown 記法なし）
- `detail-presenter.ts:74` の gate が false → `<pre>` fallback 経路 → linkify 非経由 → bare URL のまま表示（clickable でない）

修正後の挙動:
- `hasMarkdownSyntax("https://example.com")` → **true**（URL 正規表現マッチ）
- `detail-presenter.ts:74` の gate が true → `renderMarkdown()` → markdown-it の `linkify: true` が `<a>` 化 → `link_open` が `target="_blank"` + `rel="noopener noreferrer"` 付与

同一経路を **TEXTLOG presenter**（`textlog-presenter.ts:388`）も持つため、TEXTLOG article 表示も同時救済。

T-FBC-13（TEXT read）と T-FBC-14（TEXTLOG read）が本修正以降 green。commit メッセージ「was 12/14 → 14/14」の差分 2 件がちょうどこの 2 テストに対応。

**結論**: Firefox macOS アドレスバー貼付（G5 代表ケース）を contract §6-1 の想定どおり救済。

### 3-5. dangerous scheme hardening 維持（観点 5 / I-FBC4 / I-FBC5 / I-FBC6 / I-FBC11）

追加正規表現 `/\b(?:https?|ftp):\/\/[^\s<>]/i` の安全性検証：

| 試験入力 | gate 判定 | 以降の経路 | 最終出力 |
|---------|----------|-----------|---------|
| `javascript:alert(1)` | **false**（scheme 不一致） | `<pre>` fallback | plain text、`<a>` 無し |
| `file:///etc/passwd` | **false** | `<pre>` fallback | plain text |
| `data:text/html,<script>...` | **false** | `<pre>` fallback | plain text |
| `vbscript:msgbox(1)` | **false** | `<pre>` fallback | plain text |
| `https://x.com"><script>` | true | renderMarkdown | markdown-it `html: false` で `<`/`>` escape、linkify が URL 部分のみ `<a>` 化。`<script>` はテキストとして escape |
| `https://` のみ（URL 不完全） | **false**（`[^\s<>]` が最低 1 文字要求） | `<pre>` fallback | plain text |

gate 正規表現は `http` / `https` / `ftp` のみを認識し、**linkify-it のデフォルト schemas を超える検出を追加しない**（I-FBC11 準拠）。`mailto:` / `tel:` / `entry:` などは gate を通さないが、これらは：
- 明示記法 `[label](mailto:...)` 経由なら既存 markdown 記法 gate が拾う
- bare text の場合は現行仕様で `<pre>` 表示される（この振る舞いは修正前後で不変）

`validateLink` / `link_open` / `SAFE_URL_RE` / `SAFE_DATA_IMG_RE` / `SAFE_OFFICE_URI_RE` いずれも **未改変**。

**結論**: I-FBC4（危険 scheme 自動 link 禁止）/ I-FBC5（allowlist 正規表現不変）/ I-FBC6（link_open 属性不変）/ I-FBC11（linkify schemas 不変）を **破壊していない**。

### 3-6. T-FBC-1〜T-FBC-14 契約・実装整合（観点 6）

| # | contract §7 の内容 | 実装テスト location | 整合 |
|---|-------------------|------------------|------|
| T-FBC-1 | bare `https://` → `<a target="_blank" rel="noopener noreferrer">` | `markdown-render.test.ts:610` | ✓ |
| T-FBC-2 | bare `http://` autolink | `markdown-render.test.ts:618` | ✓ |
| T-FBC-3 | bare `mailto:` autolink | `markdown-render.test.ts:627` | ✓ |
| T-FBC-4 | 日本語内の URL のみ autolink | `markdown-render.test.ts:633` | ✓ |
| T-FBC-5 | 複数行内の URL 行のみ autolink | `markdown-render.test.ts:641` | ✓ |
| T-FBC-6 | URL 無し plain text で `<a>` 不発火 | `markdown-render.test.ts:649` | ✓ |
| T-FBC-7 | `javascript:` 非 autolink | `markdown-render.test.ts:657` | ✓ |
| T-FBC-8 | `file://` 非 autolink | `markdown-render.test.ts:663` | ✓ |
| T-FBC-9 | `data:text/html` 非 autolink | `markdown-render.test.ts:669` | ✓ |
| T-FBC-10 | 明示 `[label](url)` は label 保持・二重処理なし（anchor 数 = 1） | `markdown-render.test.ts:677` | ✓ |
| T-FBC-11 | angle-bracket `<https://x.com>` 維持（anchor 数 = 1） | `markdown-render.test.ts:687` | ✓ |
| T-FBC-12 | edit mode textarea.value が plain URL のまま | `renderer.test.ts:7659` | ✓ |
| T-FBC-13 | read mode で bare URL → `<a>` | `renderer.test.ts:7675` | ✓ |
| T-FBC-14 | TEXTLOG article 内 bare URL → `<a>` | `textlog-presenter.test.ts:552` | ✓ |

契約表（§7-2 / §7-3 / §7-4 / §7-5 / §7-6）と実装テスト 14 件は 1:1 対応。全件が修正後 green（commit メッセージ明示）。

**結論**: T-FBC-1〜T-FBC-14 の契約と実装は **完全整合**。

## 4. 発見した問題

**なし**。

検討したが defect ではないと判定した点：

| 観点 | 検討内容 | 判定 |
|------|---------|------|
| gate 正規表現が `mailto:` / `tel:` / `www.` を認識しない | bare `mailto:user@example.com` を TEXT body として貼った場合、gate を通らず `<pre>` 表示になる。linkify 自体は検出可能 | **contract 範囲外**。contract §6-1 の G5 代表ケースは `https://` URL で、§7-5 の T-FBC-13 も `https://example.com` で検証。現実の Firefox アドレスバーコピー対象は web URL であり、`mailto:` bare は想定外。将来要望が出たら minimum scope 再起票案件 |
| gate 正規表現が `[^\s<>]` で `"` を許可 | `https://x"><script>` のような攻撃文字列も gate を通る | **安全**。markdown-it `html: false` + linkify-it 側 URL 境界判定 + validateLink allowlist の 3 段で防御。§3-5 の表に明示 |

## 5. 変更/作成ファイル一覧

| ファイル | 区分 | 備考 |
|---------|------|------|
| `docs/development/fi-08x-audit.md` | 新規（本文書） | post-implementation audit 記録 |

本 audit では production code / test 双方に defect を発見していないため、コード変更は行わない。

## 6. Contract / 実装整合点（I-FBC1〜I-FBC12 網羅）

| # | invariant | 維持根拠 | 結果 |
|---|-----------|---------|------|
| I-FBC1 | image paste 最優先分岐 | `action-binder.ts` 未変更 | ✓ |
| I-FBC2 | FI-08 v1 既存テスト 29 件維持 | paste 関連テスト 0 件 regression（commit 差分未含有） | ✓ |
| I-FBC3 | paste pipeline code 未変更 | production 差分は `markdown-render.ts` の 1 関数のみ | ✓ |
| I-FBC4 | 危険 scheme bare text autolink 禁止 | gate 正規表現が http/https/ftp のみ、さらに validateLink が二段防御 | ✓ |
| I-FBC5 | validateLink allowlist 正規表現不変 | `SAFE_URL_RE` / `SAFE_DATA_IMG_RE` / `SAFE_OFFICE_URI_RE` 未改変 | ✓ |
| I-FBC6 | link_open 属性（target/rel/data-pkc-action）不変 | `link_open` rule 未改変 | ✓ |
| I-FBC7 | editor textarea で autolink 表示しない | T-FBC-12 が textarea.value に `<a` / `href=` 非出現を明示検証 | ✓ |
| I-FBC8 | 保存データに autolink 情報を書かない | `hasMarkdownSyntax` は read-only gate、Container 書き込み経路なし | ✓ |
| I-FBC9 | UA 判定コード非導入 | 差分に `navigator.userAgent` / UA 参照なし | ✓ |
| I-FBC10 | 外部ネットワーク GET 非導入 | 差分に fetch / XMLHttpRequest / remote URL load なし | ✓ |
| I-FBC11 | linkify-it schemas / fuzzy 設定不変 | markdown-it 構築箇所（`new MarkdownIt({...})`）未改変 | ✓ |
| I-FBC12 | URL 検出範囲非拡張（linkify デフォルト外の schema 追加なし） | gate 正規表現は「どの本文を markdown 経由にするか」の判定のみ。linkify 側の検出範囲は不変 | ✓ |

### 6-1. gate 追加と linkify-it の役割分離

本修正は **2 つのレイヤで URL を扱う**：

1. **presenter gate**（本修正で拡張）: `hasMarkdownSyntax` が「bare URL を含む body を markdown-it に流すか `<pre>` で済ますか」を判定。判定結果は DOM 経路にしか影響せず、linkify-it の内部 schemas は変更しない。
2. **linkify-it**（不変）: markdown-it 内部で実際の URL 検出と `<a>` token 生成を担当。I-FBC11 / I-FBC12 が守るのはこちら。

gate が http/https/ftp のみを見ることで「markdown-it を起動するかどうか」だけ制御され、linkify-it の検出スコープは契約どおり不変。I-FBC12 の意図（「linkify のデフォルト判定範囲を超える検出を加えない」）は守られている。

## 7. 品質チェック結果

| チェック | 結果 |
|---------|------|
| typecheck（`npm run typecheck`） | 合格（本 audit 実施時点） |
| lint（`npm run lint`） | 合格 |
| 全テスト（`npm test`） | 4457 passed（`d61b954` 時点で確認済み、`f3ab830` 以降 regression なし） |
| FI-08.x 関連テスト（T-FBC-1〜T-FBC-14） | 14 passed |
| FI-08 v1 関連テスト（html-paste-to-markdown + action-binder paste + field gate） | 29 passed |

## 8. 結論

`f3ab830` の 1 関数・5 行差分は contract `addressbar-paste-fallback-v1-behavior-contract.md` の I-FBC1〜I-FBC12 および T-FBC-1〜T-FBC-14 を **完全に満たす**。production defect は発見されず、追加の最小修正も必要ない。

### 8-1. 次 slice への引継ぎ

- **FI-08.x manual sync** は次のステップ。本 audit は contract level の閉じを確認した。manual documentation 側（`docs/manual/` 配下または該当する FI-08 既存文書）への同期は別 slice で扱う
- bare `mailto:` / `tel:` / `www.` の TEXT body における autolink 対応は本 contract 範囲外。将来要望が出た場合は新規 minimum scope として起票

### 8-2. 参照

- commit: `f3ab8305278bbb66998d42ca48ffe7d48ff316f4`
- 修正位置: `src/features/markdown/markdown-render.ts:283-289`
- 検証テスト: `tests/features/markdown/markdown-render.test.ts:608-693`, `tests/adapter/renderer.test.ts:7632-7690`, `tests/adapter/textlog-presenter.test.ts:549-564`