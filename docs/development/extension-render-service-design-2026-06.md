# PKC Render Service — 拡張へレンダリングコアを貸す設計(2026-06)

> **位置づけ**: 📐 設計のみ・**実装は go 待ち**(プライム・ディレクティブ「機能を足さない」非抵触 ＝ 全経路がオプトインの**拡張インフラ**で、コア bundle / archetype / UI mode を増やさないため。むしろ重いレンダリングをコア外へ出す seam を用意し、L1 #767 slim-core に資する)。
>
> **normative は v2 spec**: 本書はあくまで設計記録。確定 wire は `docs/spec/pkc-message-api-v2.md` §3.8(`pkc-ext` チャネル)を正とし、本書が提案する追加メッセージは実装 go の段階で §3.8 へ additive に反映する。
>
> **関連**: `pkc-extensions-host-design-2026-06.md`(#772/#791 host I/F)/ `pkc-extension-containment-design-2026-06.md`(#796 封じ込め 2 層)/ `asset-access-and-consent-design-2026-06.md`(#806 host-push 同意モデル)/ `extension-host-status-2026-06.md`(実装棚卸し)/ `markdown-render-scope.md`(3 surface 規約)。

---

## 1. 背景と問題

PKC2 は独自の **PKC-Markdown**(`:::section{role=...}` callout / `==[red]X==` color / `^^X^^` em-dot / `[[ruby:..]]` / `:strong:[X]` / `$math$` / `[^fn]` footnote / `||` align prefix / csv fence / html-sandbox など、`docs/development/markdown-dialect-extensions-spec-2026-05.md`)を持つ。これは `src/features/markdown/` + `src/features/ast/`(**pure features 層**、`markdown-it` ベース、adapter / ブラウザ API 非依存)で実装され、center pane / Viewer popup / Split View preview の **3 surface** で独立 render される。

拡張(PKC-Extension)で「テキスト系 entry を綺麗に表示・編集する viewer/editor」を作るとき、PKC-Markdown 互換のレンダリングが要る。素朴な選択肢は **拡張がエンジンを bundle する(複製)** だが、3 つの負債を抱える:

1. **drift**: コアの方言が進化すると、拡張同梱コピーが取り残されて互換が崩れる。
2. **asset**: 本文の `asset:KEY` 参照はコンテナの `assets` map で解決される。拡張は projection(メタのみ)と deliver(送られた実体)しか持たないため、未送付アセットは解決できない。
3. **CSS**: HTML 出力を移植できても、視覚は base.css のミラーに依存する(3 surface 規約)。拡張は**4 つめのサーフェス**になり、CSS を別途持ち込まないと見た目が一致しない。

本書は **「拡張がコアを複製せず、ホストのレンダリングコア(と CSS)を借りる」** 設計を扱う。

---

## 2. 既存の土台(複製ではなく「貸す」前例)

「コアを貸す」は同一オリジンの子ウィンドウ向けに**既に動いている**:

| 露出 | 定義 | 消費側 |
|---|---|---|
| `window.pkcRenderMarkdown` | `src/adapter/ui/entry-window.ts:101`(= `renderMarkdown`) | child window が `window.opener.pkcRenderMarkdown()` で呼ぶ |
| `window.pkcRenderEntryPreview` | 同 `:295`(= `renderEntryPreview`) | Split View / child preview |
| `window.pkcHydratePreviewMermaid` | 同(mermaid SVG hydrate) | child の DOM 要素を後追い hydrate |
| `window.PKC.ast` | `src/adapter/public-ast-api.ts`(**版付き public API v1.2.0**: parseMarkdown / canonicalize …) | 公開 surface |

→ つまり **「版を切ってコアを貸す」流儀(`window.PKC.ast`)は既に確立**。本設計は「これを sandboxed な `pkc-ext` チャネル越しにも届かせる」こと。

---

## 3. 設計判断 ── モジュール手渡しではなく「レンダー RPC」

封じ込め 2 層(#796)で、既定の **Tier S は cross-origin / opaque iframe**。境界を越えられるのは postMessage の structured-clone のみで、**生きた JS モジュール/関数オブジェクトは越えられない**。よって「コアを貸す」は tier で 2 形態に分かれる:

| | Tier T(trusted, manifest opt-in) | Tier S(sandboxed, **既定**) |
|---|---|---|
| 機構 | `window.opener.PKC.*` を**直接呼ぶ**(同期・ゼロコピー、前例どおり) | **PKC-Message に render RPC を追加**(データのみ往復) |
| コア共有 | 生モジュール可 | 関数渡し不可 → **サービス化**が必須 |
| 信頼 | 全権(sandbox 無し) | thin / untrusted のまま |

**結論: 汎用解は「レンダーをサービスとして §3.8 に足す(RPC)」**。Tier T は既存の直呼びを継続できるが、untrusted を含む既定経路を支えるのは RPC。コードの literal 手渡し(host JS を sandbox 内で eval)は ① 結局 asset/CSS を別途処理 ② sandbox 内 eval のリスク ③ Tier T 全権化(sandbox 無効化)のいずれかになり、RPC に劣る。

### RPC が §2 の 3 負債を同時に解消する理由

1. **drift ゼロ** — 拡張はエンジンを bundle しない。常にホスト現行版で render。`render-result.engine_version` で不一致検出も可能(`window.PKC.ast v1.2.0` の版付け流儀を踏襲)。
2. **asset 解決はホスト側**(§6 で consent と両立させる)。
3. **CSS を借りる** — base.css は text なので postMessage で渡る(§7)。

---

## 4. プロトコル追加(§3.8 への additive 提案)

envelope は既存どおり `{ pkc:'pkc-ext', v:1, nonce, t, ... }`。`t` に以下を追加する。**capability `core-render` を宣言した拡張のみ**有効(§9)。

| t | 方向 | payload | 意味 |
|---|---|---|---|
| `render-request` | child→host | `{ source: string, opts?: RenderOpts, want_css?: boolean, correlation_id }` | PKC-Markdown ソースの HTML 化を要求 |
| `render-result` | host→child | `{ ok: boolean, html?: string, css?: string, engine_version: string, headings?: TocItem[], reason?: string, correlation_id }` | 描画結果(失敗時 `ok:false`+`reason`) |
| `stylesheet` | host→host(handshake 直後の push) | `{ css: string, engine_version }` | base.css を一度だけ貸す(`want_css` 連発を避ける) |

```ts
// RenderOpts(最小、すべて任意。未知キーは無視 = forward 互換)
interface RenderOpts {
  surface?: 'reader' | 'preview';   // typographic profile の選択(既定 reader)
  source_line_anchors?: boolean;    // Split View 相当の行アンカー付与
  strip_dialect?: boolean;          // strip-dialect.ts 経由で CommonMark へ降格(ロッシー)
  toc?: boolean;                    // headings を抽出して同梱
}
```

- **`correlation_id` 必須**(既存 write / deliver と同じ相関規約)。
- handshake / nonce / window identity の security gate は §3.8 と同一 primitive を流用(新規 gate を作らない)。
- 失敗は例外を投げず `ok:false` + `reason`(host 側 renderer が throw しても境界を越えさせない)。

---

## 5. 信頼方向の反転(host が HTML を返す)

§3.8 のデータ最小化原則は **host→child は projection(メタ)のみ、`body`/`assets`/`revisions` を送ってはならない(MUST NOT)**。`render-result` が HTML を返すのはこの原則の**意図的な例外**であり、以下で正当化する:

- 拡張が render する `source` は、**その拡張が既に `deliver` で受け取った実体**(または自分で生成したテキスト)。host は**新しい entry データを開示していない**。host は「拡張が既に持つデータ」を変換して返すだけ。
- ただし **asset 解決は新規開示になりうる**(§6)。ここだけ consent gate を効かせる。
- 返す HTML のサニタイズ責務は **host 側**(renderer が信頼境界)。拡張は受け取った HTML を自分の(既に sandboxed な)DOM に inject する。

> この反転は normative 反映時に §3.8 注記として明記する(「render-result は host が権威としてデータを返す唯一の経路」)。

---

## 6. Asset 解決と consent の両立

`source` が `asset:KEY` を含むとき、host が resolve すると **asset の base64 を HTML に inline する = 新規データ開示**になる。consent 不変条件(拡張は asset を pull できない、実体は send ジェスチャ/紐付けでのみ渡る)を破らないため:

- **MUST**: host は **当該拡張へ既に `deliver` 済みのアセットのみ** resolve する(チャネル単位で配送済み asset_key を追跡)。
- 未配送アセット参照は **broken-ref プレースホルダ**として描画する(現行ホスト挙動「本文の参照は壊れた状態で残る(送信側と同じ見え方)」と一致 ── `action-binder.ts` の既存文言)。
- 結果として `render-request` は **pull の抜け道にならない**(送られていない実体は render 経由でも出てこない)。

---

## 7. CSS / 4 つめのサーフェス

- host は handshake 直後に `stylesheet`(base.css 由来、エンジン版付き)を 1 回 push、または `want_css:true` の `render-result` に同梱。
- 拡張は ① 借りた CSS をそのまま当てれば**視覚一致**、② 同じ HTML 構造の上に**独自の上等な CSS を被せれば「もっと綺麗」**。これが premium viewer の狙い。
- markdown-render-scope.md の「3 surface」規約に**第 4 surface(拡張)**を追記する(go 段階)。base.css → 拡張へは「ミラー」ではなく「貸与(message 経由の単一ソース配布)」になる点が従来サーフェスと異なる(drift しない)。

---

## 8. 対話要素(mermaid / fold / task / footnote)

`render-result.html` は静的。現状ホスト JS(`pkcHydratePreviewMermaid` 等)が同一 document で後追い hydrate しているものを境界越しでどうするか:

- **mermaid**: host が `render-result` を返す前に **inline SVG まで焼く**(既存 `hydrateMermaidPlaceholders` を render パイプラインに前倒し)。境界を越えるのは確定 SVG のみ。**推奨**。
- **heading fold / task checkbox / footnote backref**: 純 CSS / 拡張ローカル JS で完結できるものは拡張側に任せる。状態変更(task トグル等)は **既存 `write`(`set-todo-status` 等)に載せる**(新経路を作らない)。
- どうしても host 側ロジックが要る対話は、将来 `render-request` のセッション拡張(§11)で扱う。本版スコープ外。

---

## 9. capability gating と性能

- 新 capability **`core-render`**(manifest `extension_manifest.capabilities` に追加、未知 capability 無視の forward 互換に乗る)。宣言した拡張のみ render RPC が有効。
- consent: 送るのは拡張が既に持つ source、返るのは(配送済みアセットに限定した)HTML。**banner は不要**(§3.8 同様、追加の実体露出が無い設計)。
- **性能**: 1 render = 1 往復。read viewer は問題なし。ライブ入力プレビューは ① debounce ② `stylesheet` は 1 回 + `render-request` を多数、で緩和。極端なケースのみ将来「render セッション」(§11)。

---

## 10. slim-core(L1 #767)との関係

本サービスは内部的に **`render(source, ctx) → { html, css, headings }` という綺麗な seam** をコアに要求する。これは:

- 既存 `renderMarkdown` / `renderEntryPreview` / `window.PKC.ast` を 1 つの export 面へ寄せる動機になり、3 surface の重複を縮める(= 引き算)。
- 将来「重いレンダリング(mermaid 3.1MB ほか)を拡張へ退避してコアから削る」(bundle-audit-2026-06.md の退避候補)際、退避先の拡張が**この同じサービス経由でコアを借りる/逆に提供する**構図に発展できる。

→ 機能追加ではなく、**コア境界を明確化する設計**として slim-core に整合。

---

## 11. 非ゴール / スコープ外(本版で定義しない)

- **render セッション**(stylesheet 1 回 + 多数 render の状態保持、対話 hydration の双方向)→ v2.1+ 予約。
- **WYSIWYG 双方向編集の無損失 round-trip**(PKC-Markdown ソースへの逆シリアライズ)。安全策は **ソース編集 + ライブプレビュー**(既存 Split View と同型)または `update-body` に raw source をそのまま渡す方式。`strip_dialect` は設計上ロッシー(CommonMark 降格専用)。
- **Tier T の直呼び API 拡張**(`window.opener.PKC.render`)の正式化 ── 既存露出で足りるため、必要になってから。
- **全コンテナ俯瞰系**(関係グラフ / ダッシュボード)に必要な projection 拡充 ── 別設計(read 能力の議論)。

---

## 12. テスト / 検証方針(go 段階)

- **features 層**: `render(source, ctx)` の純関数 parity(既存 3 surface と同一 HTML を出すこと)。
- **transport**: `render-request`/`render-result`/`stylesheet` の往復、`correlation_id` 整合、未配送アセットが broken-ref に落ちること(consent 不変条件)、`core-render` 未宣言拡張で no-op。
- **実ブラウザ**: PKC2-Extension ツール艦隊 + Tier S sandboxed iframe で、借りた CSS 適用後の**視覚 parity**(`elementFromPoint` 経路、CLAUDE.md Testing 規約)。
- **observability**: 往復は既存 `onTraffic` seam で観測(payload は `?pkc-debug=transport` 時のみ redacted preview、§6 Observability)。

---

## 13. 未決事項(user 判断待ち)

- **D-1**: `stylesheet` を handshake 直後 push にするか、`want_css` pull 同梱のみにするか(初期ペイロード量 vs 往復数)。
- **D-2**: asset 解決を「配送済みのみ(本書 MUST)」で確定してよいか。より緩い「参照されたら send 扱いで配送+banner」を許す余地を残すか。
- **D-3**: `core-render` を独立 capability にするか、既存の起動/紐付け tier に内包するか。
- **D-4**: mermaid を「host が SVG 前倒し」(本書推奨)で固定するか、対話 hydration を将来セッションに寄せるか。
- **D-5**: 着手順 ── 本サービスは host-push 体系(#806)/ 封じ込め(#796)の上に乗る。go する場合、まず features 層 `render()` seam 抽出 → transport 追加 → 実証 viewer の順を提案。

---

*設計のみ。実装は user の go 判断を待つ(プライム・ディレクティブ準拠)。確定時は §4/§5 を `docs/spec/pkc-message-api-v2.md` §3.8 へ additive に反映する。*
