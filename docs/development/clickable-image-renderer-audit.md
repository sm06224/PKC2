# Clickable-Image Renderer Audit — 2026-04-24

## 1. Purpose / Status

**docs-only、実装なし**。PR #126 follow-up commit `3c7c8b6`(2026-04-24)で `Candidate D / legacy-asset-image-embed` を scanner v1 から外した判断の **後続設計 doc**。実装に進む前に「標準 Markdown の clickable-image(`[![alt](url)](url)` nest)を PKC が港としてどう受け入れるか」の航路図を固定する。

本 doc は:

- `src/features/markdown/markdown-render.ts` / `src/features/markdown/asset-resolver.ts` / `src/adapter/ui/action-binder.ts` を **変更しない**
- `src/features/link/migration-scanner.ts` を **変更しない**(A/B/C のまま)
- 新しい tests を追加しない
- dist bundle を rebuild しない

目的:

1. 標準 CommonMark の clickable-image `[![alt](url)](url)` を PKC 方言として将来採用するときに必要な **renderer / asset-resolver / action-binder の変更範囲** を明文化する
2. migration tool v1(PR #126 scanner)と migration v2(clickable-image 対応後)の **責務境界** を明確にする
3. Harbor 4 層(入港 / 定泊 / 出港 / 座礁回避)評価を **pin** し、UI / 追加 migration / 新 presentation 記法を追加するときの判断基準を共有する
4. 次 PR が Slice 2 UI なのか renderer 実装なのかを決める前提情報を揃える

Status: audit draft(2026-04-24)、PR #126 と同ブランチに commit 予定。手を動かす前に承認を得るフェーズ。

参照:

- 直前の audit 報告(本 audit の empirical 根拠): PR #126 review 内 2026-04-24 の「Markdown Standard Compatibility + PKC Dialect Design Audit」
- Harbor 設計原則: 2026-04-24 User instruction "[Design Philosophy Addendum]"
- Scanner v1 の責務: `docs/spec/link-migration-tool-v1.md` §3 / §14
- Internal Markdown Dialect canonical: `docs/spec/pkc-link-unification-v0.md` §5.7
- 既存 audit: `docs/development/link-system-audit-2026-04-24.md`(Copy / Paste / Render / Receive 棚卸し)

---

## 2. Harbor Philosophy 再掲 — 評価 4 層

PKC は閉じた Markdown 島ではなく、**整備された港**。外部ツールから知識が入港し、内部で豊かに解決され、再び外へ出港する。設計判断は以下 4 層すべてを通すこと。

| 層 | 役割 | OK 基準 |
|---|---|---|
| **1. 入港(paste-in)** | 外部 Markdown / URL / Office URI / 画像参照 / メモ断片が PKC に来たとき | PKC 方言として解決できるものは demote、未知は literal に壊さずそのまま受け入れる |
| **2. 定泊(internal normalize)** | PKC 内部 canonical として安定運用 | target / presentation 分離、resolver / renderer / action-binder 経路が閉じる、新 revision で undo 可能 |
| **3. 出港(export-out)** | PKC 外の標準 Markdown reader でも使える | 標準 CommonMark として valid、text / alt / label が消えない、click が届かなくても表示が崩れない |
| **4. 座礁回避(graceful degrade)** | PKC 方言未対応の reader / renderer でも body が literal text として漏れない | validateLink reject 時にブラケットが表に出ない、`@` などの prefix が別記号と衝突しない、IMG 404 時に alt が代替表示される |

**判断原則**:

- **どれかの層で ❌ なら、当該 form は canonical にしない / 生成しない / migration target にしない**
- **将来の renderer 改修で ❌ → ✅ に変えられる form は future dialect として reserve**
- **外部からの入港は "現行 canonical の意味として扱えるならそう扱う、扱えないなら原文維持で literal 漏れなし" を死守**

Migration tool / Copy surface / Paste handler / Renderer / Resolver / Action-binder は、いずれもこの harbor 原則の下で **役割を重ねない**(scanner が renderer の allowlist gap を肩代わりしない、resolver が action-binder の routing を肩代わりしない)。

---

## 3. Syntax audit matrix

11 form を 9 列で評価。2026-04-24 の PKC renderer + asset-resolver probe(markdown-it 素 probe + `renderMarkdown` 経由 probe)で empirical に確認した挙動を基準にする。記号:`✅` = harbor 的に安全 / `△` = 条件付き / `❌` = 現状壊れる or 意味喪失 / `—` = n/a。

| # | syntax | CommonMark / markdown-it | PKC2 renderer(現行)| asset-resolver(現行)| action-binder 経路 | 分類 | v1 scanner で触るべきか | future v2 候補か |
|---|---|---|---|---|---|---|---|---|
| 1 | `![alt](asset:key)` | `<img src="asset:key" alt>` | resolver 後 `<img src="data:image/…">` | pass 1 で `data:` URI に置換 | — | **canonical(定泊 ✅ / 出港 △ / 座礁 ✅)** | **NO**(現行 canonical) | NO |
| 2 | `![alt](entry:lid)` | `<img src="entry:lid">` | image rule が `<div class="pkc-transclusion-placeholder">` を emit、後段 `transclusion.ts` が展開 | touch しない | transclusion 経路(click でなく render 時に展開) | **canonical**(transclusion) | **NO** | NO |
| 3 | `[label](asset:key)` 非 image MIME | `<a href="asset:key">label</a>` | resolver が `[📄 label](#asset-key)` chip に置換 | pass 2 で chip 化 | `a[href^="#asset-"]` click → download | **canonical**(非画像 chip) | **NO**(label 非空) | NO |
| 3' | `[label](asset:key)` 画像 MIME | 同上 | resolver が `*[unsupported asset: key]*` に置換(**label 喪失**)| pass 2 で unsupported marker 化 | — | **誤用 notice**(現行は image には `![]` を使うのが正) | **NO**(label 非空で candidate 化せず) | 検討余地(§6.4) |
| 4 | `[label](entry:lid)` | `<a href="entry:lid">label</a>` | link_open で `data-pkc-action="navigate-entry-ref"` + `data-pkc-entry-ref="entry:lid"` | touch しない | click → `navigate-entry-ref` → SELECT_ENTRY + scroll | **canonical**(link presentation) | **NO**(label 非空) | NO |
| 5 | `[](entry:lid)` / `[](asset:key)` | empty label anchor | empty anchor(entry: は navigate 動くが**不可視**)/ asset 画像 MIME は `*[unsupported asset]*` 経路 | asset 画像 MIME で label 空は `*[unsupported asset]*` | entry: は navigate 動く(不可視)| **legacy**(scanner A 対象) | **YES**(Candidate A) | — |
| 6 | `[![alt](asset:key)](asset:key)` | `<a href="asset:key"><img src="asset:key" alt></a>`(標準 clickable-image)| resolver pass 1 で内側 `<img src="data:…">` に、外側 `[…](asset:key)` は regex 非 match で残存 → markdown-it が **`asset:` を `SAFE_URL_RE` 非含有で reject**、`[` `]` `(asset:key)` が **literal 漏れ**(`<p>[<img …>](asset:a1)</p>`)| 内側だけ pass 1、外側は pass 2 regex 非 match(inner image が label にあるため)| — | **broken @ 定泊 / 座礁**(現行 renderer 未対応)| **NO**(v1 は harbor 違反を emit しない) | **YES**(renderer 整備後の v2 target) |
| 7 | `[![alt](entry:lid)](entry:lid)` | 標準 clickable-image(nested img + link) | 内側が transclusion placeholder、外側 `<a>` が `<div>` を囲む → **動くが HTML semantics 不正**(block inside inline)| touch しない | 外側 anchor で navigate-entry-ref、内側で transclusion 展開が並走 | **動作するが semantic NG**(v1 では触らない、v2 で整理) | **NO** | **YES**(semantic 整理込み) |
| 8 | `[![]](asset:key)` / `[![]](entry:lid)` | anchor + literal text `![]`(nested image にならない、内側 `[]` が空 + 外側 `]` 直後に `(` が無いため) | asset: は allowlist 外 → validateLink reject で全文 literal 漏れ / entry: は navigate 動くが label が `![]` mojibake | 両方とも regex 非 match | — | **invalid**(harbor 4 層のどれでも価値ゼロ) | **NO** | **NO**(採用しない) |
| 9 | `@[card](entry:lid)` | `@` literal + `<a href="entry:lid">card</a>` | `@` literal + navigate-entry-ref anchor(label `card`)| touch しない | `@` は literal、link だけ navigate | **future dialect**(renderer hook 未実装) | **NO** | **YES**(Phase 4 card 実装時) |
| 10 | `[card:](entry:lid)` / `[card:Entry](…)` | 普通の link(label が `card:` 始まり) | 普通の `<a …>card:</a>` + navigate-entry-ref | touch しない | navigate-entry-ref(label だけ `card:` 表示) | **不採用**(spec §10.1、presentation marker にならず label と混在) | **NO** | NO |
| 11 | `[label](<base>#pkc?container=…&entry=…)` | `<a href="base#pkc?…">label</a>` (`&` は `&amp;` escape) | body 内 render では普通の `target="_blank"` 外部 URL(本文 render が `#pkc?` を横取りしない)| touch しない | body 内 click → 外部 URL / browser / external-permalink-receive は boot 時 `window.location.hash` のみ見る | **canonical**(External Permalink、出港 ✅ 4 層のみ唯一 full ✅) | **NO**(body 内残存は現状想定されていない、外部 Copy から paste された場合は paste-conversion が demote) | 検討余地(body 内 External Permalink の render fallback は別 follow-up、§9) |

補足:

- **6(clickable-image)は標準 Markdown として最強レベルの互換性**(GitHub README バッジ、外部 reader でも `<a><img></a>` として valid)を持つが、現行 PKC2 は `asset:` を `SAFE_URL_RE` に入れていないので validateLink が link を drop し座礁する
- **5, 8(空 label / `![]` label)は入港してきても出港しても価値が無い** — Harbor 原則的に do-not-emit に近いが、legacy body からは来ることがあるため scanner A が救済する / しないの判断は §3 現 spec どおり
- **9(`@[card]`)は現行 `<p>@<a>…</a></p>` として座礁はしていない** が、meaning loss(PKC 内で card widget にならない)は許容範囲。これは将来 hook 実装で解決する future dialect の代表例
- **11(External Permalink)は body に書かれることが現状想定外**(#142 以降 Copy 導線は外部 paste 向けに限定)。万一 body 内に残った場合の render fallback 整備は本 audit の対象外だが、§9 で責務を整理する

---

## 4. 現在地 — 現行実装の事実

### 4.1 markdown-render の SAFE_URL_RE と link_open rule

`src/features/markdown/markdown-render.ts` より(2026-04-24 時点):

```
SAFE_URL_RE = /^(https?:|mailto:|tel:|ftp:|entry:|pkc:|#|\/|\.\/|\.\.\/|[^:]*$)/i
SAFE_DATA_IMG_RE = /^data:image\/(gif|png|jpeg|webp|svg\+xml);/i
SAFE_OFFICE_URI_RE = /^(?:ms-(?:word|excel|…)|onenote):/i
```

事実:

- **`asset:` は SAFE_URL_RE に含まれていない**。markdown-it の `validateLink` がこれを reject するため、resolver preprocessing で `asset:` が消え損ねると link は anchor 化されず `[` `]` (asset:key)` が literal に漏れる
- `entry:` / `pkc:` は allowlist 済み → validateLink を通過し、後段の link_open rule が `data-pkc-action="navigate-entry-ref"` / `navigate-asset-ref`(same-container fallback)/ `pkc-portable-reference-placeholder`(cross-container)を付ける
- `pkc:` scheme は `pkc://...` の **machine identifier** としてのみ allowlist、外部 clickable ではない(§5.5 spec)

link_open rule の動作分岐(src 引用):

- `href.startsWith('entry:')` → `data-pkc-action="navigate-entry-ref"` + `data-pkc-entry-ref=<raw>`
- `href.startsWith('pkc:')` → parse → same-container なら navigate-entry-ref / navigate-asset-ref、cross-container なら portable-reference-placeholder、malformed なら外部 link 扱い
- それ以外 → `target="_blank"` + `rel="noopener noreferrer"`

### 4.2 asset-resolver の 2-pass preprocessing

`src/features/markdown/asset-resolver.ts` より:

```
ASSET_IMAGE_RE = /!\[([^\]]*)\]\(asset:([^\s)"]+)(?:\s+"([^"]*)")?\)/g
ASSET_LINK_RE  = /(^|[^!\\])\[([^\]]*)\]\(asset:([^\s)"]+)(?:\s+"([^"]*)")?\)/g
```

事実:

- **markdown-it より前に走る preprocessor**。`renderMarkdown(resolveAssetReferences(src, ctx), opts)` の順で呼ばれる(adapter/ui/renderer.ts 側)
- pass 1: `![alt](asset:key)` image form を image MIME allowlist(png/jpeg/gif/webp)チェックの上で `![alt](data:image/…;base64,…)` に置換。非 image MIME は `*[unsupported asset: key]*` に
- pass 2: `[label](asset:key)` link form(`!` 非直前)を:
  - 画像 MIME → `*[unsupported asset: key]*`(label が消える、user に誤用通知)
  - 非画像 MIME → `[${icon} ${label}](#asset-key)` chip
  - 空 label は `nameByKey` から filename fallback
- **外側 `[...](asset:key)` に inner `![alt](asset:k)` が入っている場合(clickable-image nest)、pass 2 regex の label capture `[^\]]*` が `]` を跨げない** → 外側 pass 2 は非 match、外側 `asset:` が残る → markdown-it で reject → literal 漏れ

つまり clickable-image nest を dock させるには pass 2 の **inner-image-aware variant** が必要。単純に `asset:` を SAFE_URL_RE に足すだけでは、resolver が外側リンクに何の処理もしていないため click target が `asset:k`(JavaScript で解決不能)のままになる(§6.3 で論じる)。

### 4.3 markdown-render の image rule(entry transclusion placeholder)

`markdown-render.ts` の image rule:

- `src.startsWith('entry:')` → `<div class="pkc-transclusion-placeholder" data-pkc-embed-ref="…" data-pkc-embed-alt="…"></div>`
- それ以外 → デフォルト image rule(`<img src=... alt=...>`)。`data:image/…` は SAFE_DATA_IMG_RE で通る

事実:

- `asset:` の image form は resolver が `data:` URI に置換するので image rule には `asset:` のまま届かない
- `entry:` の image form は resolver が触らず image rule に届いて transclusion placeholder になる
- **clickable-image nest の内側 `![alt](entry:lid)` は transclusion placeholder を emit する** → 外側 `<a>` が `<div>` を囲む構造(HTML parser は `<p>` を auto-close する可能性あり、#156 transclusion expander が後始末する想定だが nested anchor は考慮されていない)

### 4.4 action-binder の `navigate-entry-ref` / `navigate-asset-ref` / `#asset-` chip

`src/adapter/ui/action-binder.ts` の 3 系統:

- `data-pkc-action="navigate-entry-ref"`: click で `parseEntryRef(data-pkc-entry-ref)` → SELECT_ENTRY + scroll(log / day / range / heading)
- `data-pkc-action="navigate-asset-ref"`: click で `findAttachmentOwnerLid(assetKey)` → SELECT_ENTRY(owner attachment entry)、not-found は info toast
- `a[href^="#asset-"]` chip: resolver が非画像 asset link を chip 化したときに emit される anchor。click で download を起動

事実:

- clickable-image を正式サポートするとき、click target は **「asset image なら chip download、asset の非画像は既存 chip と同じ download、entry なら navigate-entry-ref」** のいずれかに決める必要がある
- 現状の `navigate-asset-ref` は `pkc://<self>/asset/<key>` が残った場合の fallback 用。clickable-image の外側 link がそのまま `asset:key` の場合、同じハンドラを再利用すべきか別ハンドラを立てるかは §6.3 で論じる

### 4.5 paste-conversion / external-permalink-receive(参考)

- `src/features/link/paste-conversion.ts`: External Permalink / Portable Reference の same-container は internal に demote。cross-container / plain URL は原文維持
- `src/adapter/ui/external-permalink-receive.ts`: boot 時 `window.location.hash` が `#pkc?...` なら SELECT_ENTRY
- **body 内に `<base>#pkc?...` が生で書かれた場合の render fallback は未定義**(現 renderer は普通の `target="_blank"` 外部 link 扱い)。migration / copy 導線がここに書き出すことは想定外なので現状問題化していないが、paste で他人が書いた External Permalink を本文に貼った際の挙動は §9 で整理する

---

## 5. Presentation taxonomy(canonical / legacy / future / invalid)

### 5.1 canonical now

新規 emit はこの形のみ(spec §5.7 正本):

- `[<label>](entry:<lid>)` / `[<label>](entry:<lid>#log/<logId>)` / `[<label>](entry:<lid>#day/<yyyy-mm-dd>)` / `[<label>](entry:<lid>#log/<logId>/<slug>)` — link presentation
- `[<label>](asset:<key>)`(非 image MIME、resolver chip 化)
- `![<alt>](asset:<key>)`(image MIME、image embed)
- `![<alt>](entry:<lid>[#log/…])`(transclusion embed)
- `[<label>](<base>#pkc?container=<cid>&entry=<lid>[&fragment=…])`(External Permalink、外部共有の正本)

### 5.2 accepted legacy

読み込み互換は維持、新規 emit はしない、migration scanner v1 が寄せる:

- `[<label>](entry:<lid>#<logId>)` legacy fragment(Candidate B)
- `[](entry:<lid>)` / `[](asset:<key>)` empty label(Candidate A)
- `[<label>](pkc://<self>/entry/<lid>)` / `[<label>](pkc://<self>/asset/<key>)` same-container portable(Candidate C)
- `[<label>](pkc://<other>/...)` cross-container portable(renderer は portable-reference-placeholder badge、scanner は触らない)

### 5.3 future dialect(renderer 整備後)

現 renderer 未対応、scanner v1 は生成しない。renderer 側の整備(§7)とセットで migration v2 target 化できる:

- **clickable-image(asset)**: `[![<alt>](asset:<key>)](asset:<key>)` — 標準 Markdown の clickable-image。外部互換性最強。PKC 内では image + click の 2 meaning を同時に運ぶ
- **clickable-image(entry)**: `[![<alt>](entry:<lid>)](entry:<lid>)` — transclusion + navigate。動作はするが現状は HTML semantic 不正。
- **card presentation**: `@[card](entry:<lid>)` / `@[card:<variant>](entry:<lid>)` — spec §6.3、block-level preview card
- **body 内 External Permalink の render fallback**: `[<label>](<base>#pkc?…)` を本文 click で内部 navigate できるようにする(§9 で判断)

### 5.4 invalid / do-not-emit

harbor 4 層のどこにも価値が無く、新規にも legacy 扱いにもしない:

- `[![]](asset:<key>)` / `[![]](entry:<lid>)` — nested image にならず literal `![]` label、**現行 canonical でも migration after でもない**
- `[card:<lid>]` / `[card:Entry](entry:…)` — label と presentation marker が混在、spec §10.1 で不採用確定済み
- `[<label>](pkc://<self>/...)` の **新規 emit**(paste demote で済むため)
- 新規 body への `[<label>](<base>#pkc?...)` 手書き emit(Copy 導線から paste-conversion を迂回して本文 canonical 化する意味が無い)

---

## 6. Decisions to pin

### 6.1 `asset:` を SAFE_URL_RE に追加すべきか

**結論(提案、docs-only 仮置き)**: **将来追加する、ただし resolver 側の整合と同時に**。

理由:

- 現在は `asset:` が allowlist に無くても resolver が link / image form を確実に書き換えるので外部には漏れない(pass 1 / pass 2 で `asset:` が消える)
- しかし **nested clickable-image の外側 `[…](asset:k)` は現在 resolver が処理していない** ため、asset: のまま markdown-it に届いて reject される
- resolver を拡張して clickable-image を処理する前に SAFE_URL_RE に asset: を足すと、link form の fallback 挙動が不明確になる(resolver 非 match の場合に `[label](asset:k)` が生の anchor として残る、action-binder 側で handler 未定のため click が no-op)
- 逆に resolver を拡張した後で SAFE_URL_RE を足すのは safe — 既存テストが既に pin している現行挙動(resolver 通過後には `asset:` が残らない)と両立する

**変更タイミング**: §7.1 で整理する「renderer / resolver / action-binder の連動変更」の最終段階で足す。単独変更はしない。

### 6.2 `asset:` allowlist 追加時、`[label](asset:key)` の経路整合

**質問**: resolver が先に pass 2 で `[label](asset:k)` を chip(`[📄 …](#asset-k)`)に変換しているので、SAFE_URL_RE に足しても素の `<a href="asset:k">` はほぼ render されない。では何が変わるか?

**整理**:

| ケース | 現状 | SAFE_URL_RE 追加後 | 備考 |
|---|---|---|---|
| 非 image MIME `[label](asset:k)` | resolver が chip 化 → `<a href="#asset-k">` | 同じ | allowlist は関係ない(resolver で asset: が消える) |
| image MIME `[label](asset:k)` | resolver が `*[unsupported asset: k]*` に置換 | 同じ | 同上 |
| image MIME `![alt](asset:k)` | resolver が data URI に置換 | 同じ | 同上 |
| nested `[![alt](asset:k)](asset:k)` | resolver inner のみ `data:`、外側 `asset:` reject → literal 漏れ | **外側が validateLink 通過 → `<a href="asset:k">` anchor**(中身は `<img src="data:…">`) | **action-binder に `asset:` click handler が必要**(§6.3) |
| 素の `[label](asset:k)` が resolver を skip した場合 | markdown-it reject → literal 漏れ | **anchor 化される、中身は label text**、`href="asset:k"` は OS で解決不能 | 通常 resolver が先に処理するので起こらないはずだが、安全のため action-binder で asset: click を捕捉すべき |

**設計指針**:

- SAFE_URL_RE 追加は「resolver が取り逃がした `asset:` anchor を literal 漏れさせない」安全網として価値がある
- ただし **追加と同時に action-binder に `a[href^="asset:"]` handler を足す**(asset-key 取り出し → `#asset-` chip と同じ download 経路に寄せる、または同 container なら navigate-asset-ref と同じ owner 遷移)
- そうしないと click が OS に落ちて「解決できない URL」として失敗する

### 6.3 `[![alt](asset:key)](asset:key)` 正式サポートに必要な変更

Harbor 4 層を全部 ✅ に揃えるために必要な変更を整理(docs-only、実装しない):

**A. markdown-render.ts(src)**:

- `SAFE_URL_RE` に `asset:` を追加(§6.1 / §6.2 の前提で resolver 拡張後に)
- link_open rule で `href.startsWith('asset:')` を分岐追加:
  - `href` をそのまま保持しつつ `data-pkc-action="navigate-asset-ref"` + `data-pkc-asset-key=<key>` を付与(既存 `pkc://<self>/asset/<key>` fallback と同じ data 属性を流用する案が最小差分)
  - または新規 action `"asset-click"` を立てて handler を分離

**B. asset-resolver.ts(src)**:

- 3-pass に拡張するか、既存 2-pass で nested 構造を認識する regex に差し替える
- **方針 1(最小差分)**: pass 2 の前に新 pass `[![alt](asset:k)](asset:k)` を検出して:
  - 内側 `![alt](asset:k)` は既存 pass 1 と同じく data URI に展開
  - 外側 `[…](asset:k)` は remain(click target として asset:k のまま)
  - この場合、pass 2 image-MIME link form の unsupported marker を踏まないように順序を入れ替える
- **方針 2(清潔案)**: resolver を簡素化し、image/chip/clickable の 3 分岐を単一 pass で行う(ただし regex / AST コスト増、future v2 で判断)

**C. action-binder.ts(src)**:

- `a[href^="asset:"]` または `data-pkc-action="navigate-asset-ref"` click を受けて:
  - image-MIME asset → download(既存 `#asset-` chip 経路と同じ)
  - 非 image-MIME asset → 既存 `#asset-` chip と同じ download
  - owner attachment entry に跳ぶ挙動(既存 `pkc://<self>/asset/<key>` fallback)と一緒にするか、別動作にするかは UX 議論(§6.4 で判断)

**D. tests**:

- `tests/features/markdown/asset-resolver.test.ts`: nested clickable-image の 2-pass / 3-pass 保護テスト
- `tests/features/markdown/permalink-placeholder.test.ts` または新規 `clickable-image.test.ts`: anchor 化 + data 属性 + target=_blank の排除 pin
- `tests/adapter/ui/action-binder.test.ts`(既存あれば): clickable-image click → download の pin

**E. migration v2 scanner**:

- `![<alt>](asset:<key>)` → `[![<alt>](asset:<key>)](asset:<key>)` を opt-in candidate(review confidence)として v2 で再導入
- before / after / confidence / reason を harbor 4 層ベースで記述
- migration v1 との共存(v1 は touch しない、v2 のみ emit)

**F. spec 更新**:

- `docs/spec/pkc-link-unification-v0.md` §5.7 に「clickable-image presentation」を正本追加
- `docs/spec/link-migration-tool-v1.md` に migration v2 を別節で追加 or 独立 spec に分離

**作業量の目安(おおよそ)**: src ~200 LOC + tests ~400 LOC + spec 2 本の surgical edit。1 PR にまとめる案と、renderer 実装 PR → migration v2 PR の 2 段階案のどちらでも可(1 段階の方が harbor 4 層全部を 1 回で validate できる)。

### 6.4 canonical image embed `![alt](asset:key)` と clickable-image の責務分離

**責務が明確に別**:

| form | 意味 | click 挙動 |
|---|---|---|
| `![<alt>](asset:<key>)` | inline image display(canonical) | クリック不可(static image)|
| `[![<alt>](asset:<key>)](asset:<key>)`(future)| inline image display + clickable | クリックで asset download or owner navigate |

ユーザーの使い分け(設計意図):

- 「文中に画像だけ見せたい」 → `![](asset:k)` 既存 canonical、変更なし
- 「画像をサムネ的に見せて click で詳細へ」 → clickable-image v2 で導入
- どちらも `asset:<key>` という **同じ target** を指す、presentation のみ違う(spec §5.7 の target / presentation 分離原則に一致)

**click 先 UX の選択肢**:

1. owner attachment entry にジャンプ(既存 `navigate-asset-ref` と同じ、§4.4)
2. raw download(既存 `#asset-` chip と同じ、§4.4)
3. new asset preview modal(未実装)

**推奨(docs 仮置き)**: **1. owner attachment entry にジャンプ**(既存 user mental model と一致、#146 G3 の同 container fallback と同じ)。2 は既存 chip form で選択肢として残す。3 は future UI。

### 6.5 `![alt](entry:lid)` transclusion と `[![alt](entry:lid)](entry:lid)` clickable transclusion

**現状**:

- `![alt](entry:lid)` は `<div class="pkc-transclusion-placeholder">` を emit、後段 `transclusion.ts` が本文展開
- `[![alt](entry:lid)](entry:lid)` は `<a href="entry:lid" data-pkc-action="navigate-entry-ref" …><div class="pkc-transclusion-placeholder">…</div></a>` になる — **動くが HTML semantic 不正**(block `<div>` が inline `<a>` の中)

**論点**:

- clickable transclusion が欲しいか? → **現状 card presentation(Phase 4)の領分**。transclusion は「参照先の本文を自分の body に展開する」もので、そもそも click の必要性が低い
- asset 側は canonical image + clickable-image の 2 presentation を分ける価値がある(上の §6.4)
- entry 側は transclusion 自体が「見せる」と「中身が分かる」を兼ねるため、clickable を重ねる価値は小さい

**docs 仮置き決定**:

- v2 で clickable-image を採用するとき、**entry 版も同じ records 型にのせる**(clickable transclusion として採用)が、**推奨 use-case は asset 側**
- HTML semantic の block-in-inline は renderer 側で解決する必要がある:
  - 案 1: transclusion placeholder を `<span>` にする(inline コンテキスト)→ 展開後の本文は `<span>` 内に block 要素を入れられないので不可
  - 案 2: 外側 `<a>` を展開後に unwrap して内側の block をそのまま残す(semantic は壊れるが visual は維持、click は外側 wrapper に設定)
  - 案 3: clickable transclusion は nested anchor ではなく、transclusion block 全体の上に overlay anchor を置く renderer 設計
- この詳細判断は **renderer 実装 PR で決める**、本 docs では「clickable transclusion を canonical にするなら block-in-inline 問題を解決してから」という条件を pin するに留める

### 6.6 `[![]](target)` は invalid / do-not-emit

**結論**: **明示的に invalid / do-not-emit として spec に pin**(既に `pkc-link-unification-v0.md` §5.7.4 / `link-migration-tool-v1.md` §14.2 で明文化済み)。

根拠(再掲、empirical):

- markdown-it は `[![]](target)` を `<a href="target">![]</a>`(literal `![]` label の anchor)として token 化
- nested image にならない理由: 内側 `[]` が空 + 外側 `]` 直後に `(` が無いため CommonMark の `[…]` grammar が nested image として展開できない
- harbor 4 層:入港 ❌(通常外部で書かれない)/ 定泊 ❌(PKC 方言として意味ゼロ)/ 出港 ❌(literal `![]` label は外部でも意味喪失)/ 座礁回避 ❌(asset: は literal 漏れ)

**pin 事項**:

- migration scanner v1 は before / after ともに生成しない(regression test で pin 済み、PR #126 commit `3c7c8b6`)
- renderer / resolver / action-binder に新 hook を追加しない
- spec の canonical / legacy / future のどこにも書かない(`invalid / do-not-emit` 区分のみ)

### 6.7 `@[card](...)` card presentation と clickable-image の棲み分け

**2 つの future presentation は別物、同時に採用しても衝突しない**:

| presentation | 記法 | 用途 | inline / block |
|---|---|---|---|
| **card** | `@[card](entry:<lid>)` / `@[card:<variant>](…)` | block-level preview card(title + excerpt + archetype badge + click navigate)| block |
| **clickable-image** | `[![<alt>](<target>)](<target>)` | inline image or transclusion + click navigate | inline(image は inline 要素) |
| **clickable-transclusion**(派生、§6.5) | `[![<alt>](entry:<lid>)](entry:<lid>)` | block transclusion + 外側 click | 内側 block / 外側 inline が衝突する |

**棲み分け原則**:

- **card は「参照先を前面プッシュ」、clickable-image は「本文流れの中で画像を見せつつ click で深掘り」** — 用途が重ならない
- card は **新規記法導入(`@[…]` prefix)**、clickable-image は **既存標準 Markdown の再解釈** — renderer 対応のアプローチが違う
- 両方を採用するとしても renderer hook は独立 — `@[card]` は新しい custom inline / block rule、clickable-image は既存 link_open / image rule の拡張
- migration v2 は両者を別 candidate 種として扱う(`card-presentation-promotion` / `clickable-image-promotion` 等の kind 名で)

**harbor 4 層評価(再確認)**:

| form | 入港 | 定泊 | 出港 | 座礁回避 |
|---|---|---|---|---|
| `@[card](entry:…)` | ✅(paste demote) | ❌(renderer hook 未実装) | ✅(`@` literal + link) | ✅ |
| `[![alt](asset:k)](asset:k)` | ✅(paste 対象外だが無害) | ❌(SAFE_URL_RE に asset: 無し) | ✅(外部 reader で `<a><img></a>`) | ❌(asset: reject で literal 漏れ) |

card は定泊 ❌ のみ、clickable-image は定泊 / 座礁の 2 層 ❌。clickable-image の方が renderer 側の整備が重いので、採用順序は「card(Phase 4)→ clickable-image(migration v2)」または「clickable-image → card」のどちらでも可。**いずれも本 audit では着手せず、判断材料のみ提供**。

### 6.8 migration tool v1 と v2 の境界

| 層 | v1 対象 | v2 候補 |
|---|---|---|
| **目的** | 既存の壊れかけた legacy 形を **現行 canonical** に寄せる(safe harbor 整備) | 新しい canonical(clickable-image / card)への **opt-in promotion**(future dialect 採用) |
| **前提** | renderer / resolver / action-binder 変更なしで動く | renderer / resolver / action-binder の future dialect 対応が先に landing していること |
| **候補** | A 空 label / B legacy fragment / C same-container portable | D 画像 promotion(clickable-image)/ E entry promotion(clickable-transclusion)/ F card promotion(`@[card]`)/ G External Permalink body 内救済(§9)|
| **confidence** | safe(user 意図破壊なし、可視化のみ) | review(presentation 意味変更あり、user opt-in 前提) |
| **default** | Apply all safe で ON | 明示 opt-in でのみ ON |
| **apply 時の body 壊れ** | ゼロ(現行 renderer で canonical のまま動く) | 新 renderer が landing していれば ゼロ、未 landing ならエラー(apply block) |
| **spec 担い** | `link-migration-tool-v1.md` | 新規 `link-migration-tool-v2.md`(renderer 実装完了時に起こす) |

**v1 / v2 をまたがない**: v1 scanner / preview / apply に v2 候補を追加しない、v2 は別 scanner module として分離する(`migration-scanner-v2.ts` 仮称)。既存 v1 の UI dialog は v2 を後付けで追加できる設計にするかは Slice 2 で判断。

---

## 7. Implementation scope — future-v2 発火時

### 7.1 markdown-render 変更(予想)

- `SAFE_URL_RE` に `asset:` を追加(§6.1)
- `link_open` rule に `href.startsWith('asset:')` 分岐を追加:
  - 既存の `navigate-asset-ref` 同 container fallback(`pkc://<self>/asset/<key>` 経路)と **同じ data 属性(`data-pkc-action="navigate-asset-ref"` + `data-pkc-asset-key`)を流用** するのが最小差分
  - これで既存 action-binder handler がそのまま動く
- `image` rule 変更なし(`asset:` image form は resolver が data URI に置換済み、clickable-image の内側 image も同じパスを通る)
- malformed `asset:` (key が空 / 不正文字)は SAFE_URL_RE に部分マッチしても action-binder 側で broken-ref 扱いに落とす

### 7.2 asset-resolver 変更(予想)

- 新 pass を追加(**pass 1 の前**に挿入するのが安全、inner image が data URI 化される前に nested 構造を識別しておく):
  ```
  ASSET_CLICKABLE_IMAGE_RE = /\[!\[([^\]]*)\]\(asset:([^\s)"]+)(?:\s+"([^"]*)")?\)\]\(asset:\2(?:\s+"([^"]*)")?\)/g
  ```
  - `\2` 後方参照で **inner と outer の key が一致** する case のみ処理
  - inner / outer の key が違うなら touch しない(ユーザーが意図的に画像と click 先を別 asset に指定している case を想定、pass 1 / pass 2 に回す)
- Match 時の書き換え:
  - image MIME: `[![<alt>](data:image/…;base64,…)](asset:<key>)` — 内側だけ展開、外側はそのまま
  - non-image MIME: 従来どおり unsupported marker(clickable-image で non-image は意味不明、user notice)
- 既存 pass 1 / pass 2 の regex は変更なし、順序だけ pass 0(clickable-image)→ pass 1(image)→ pass 2(link)に
- 不一致 key の nested form(`[![alt](asset:a)](asset:b)` で a ≠ b)は v1 / v2 どちらでも扱わない(ambiguous)

### 7.3 action-binder 変更(予想)

- **選択肢 1(推奨、最小差分)**: §7.1 で clickable-image の外側 anchor に既存 `data-pkc-action="navigate-asset-ref"` + `data-pkc-asset-key` を付けるので、**既存 `navigate-asset-ref` handler がそのまま動く**(owner attachment entry にジャンプ)
- **選択肢 2**: clickable-image 専用の `data-pkc-action="open-asset"` を新設し、image MIME は download、非 image MIME は owner navigate に分岐
- **選択肢 3**: click target をユーザー設定化(Settings で「image click → owner 遷移 / download を選ぶ」)
- **推奨は 1**(#146 G3 で既に owner 遷移の mental model が canonical 化されている、#142-#144 の Copy surface 1 本化と整合)
- `a[href^="#asset-"]` chip handler は変更なし(resolver が chip 化した非画像 link を捌く既存挙動を維持)

### 7.4 migration tool v2 scanner(予想)

新規 `src/features/link/migration-scanner-v2.ts`(v1 とは分離):

- Candidate kinds(仮):
  - `clickable-image-promotion`: `![<alt>](asset:<key>)` → `[![<alt>](asset:<key>)](asset:<key>)`(image MIME のみ、opt-in、confidence = `review`)
  - `clickable-transclusion-promotion`: `![<alt>](entry:<lid>)` → `[![<alt>](entry:<lid>)](entry:<lid>)`(§6.5 block-in-inline を renderer が解決した後、opt-in、confidence = `review`)
  - `card-promotion`: `[<label>](entry:<lid>)` → `@[card](entry:<lid>)`(Phase 4 card が landing した後、opt-in、confidence = `review`)
  - `external-permalink-body-residue`: body 内に書かれた `[<label>](<base>#pkc?container=<self>&…)` の自 container 判定とカンバセーショナル rewrite(§9 で判断)
- v1 と同じ preview / apply / revision 連携 frame を流用(interface はおそらく共通化できる)
- ただし **v2 は renderer 対応 PR が landing して初めて起動**、それまではコードごと存在しない(ブランチ / feature flag どちらでも可)

### 7.5 互換性 / backward compatibility

- `Entry` / `Container` / `Relation` / `Revision` schema 不変(`schema_version` bump 不要)
- 既存 `![alt](asset:k)` / `![alt](entry:l)` canonical は **一切変わらない**(resolver pass 0 は nested 専用、nested でなければ pass 1 に流れる)
- 既存 `[label](asset:k)` chip / `[label](entry:l)` link は **一切変わらない**
- 既存 `pkc://<self>/asset/<key>` same-container fallback は **そのまま維持**(同じ `data-pkc-action="navigate-asset-ref"` + `data-pkc-asset-key` を流用するため handler 追加なし)
- revision / export / import は clickable-image を `[...](asset:k)` の一形として素通し
- 旧 reader / 外部 Markdown reader で開いた場合は標準 CommonMark の clickable-image として `<a><img></a>` に解決(画像は broken でも anchor text と alt は見える)

---

## 8. Migration v1 / v2 境界サマリ

| 項目 | Migration v1(PR #126) | Migration v2(future) |
|---|---|---|
| Scanner module | `src/features/link/migration-scanner.ts` | 別 module(仮 `migration-scanner-v2.ts`)|
| Candidate kinds | A 空 label / B legacy log fragment / C same-container portable | D clickable-image / E clickable-transclusion / F card / G External Permalink body residue |
| Safety default | Apply all safe | opt-in promotions |
| Renderer 前提 | 既存 renderer で動く | renderer / resolver / action-binder の future dialect 対応が先 |
| Harbor 層 validation | 4 層すべて ✅(canonical へ寄せる)| 4 層すべて ✅ は renderer 変更後のみ |
| spec | `docs/spec/link-migration-tool-v1.md` | 新規 `docs/spec/link-migration-tool-v2.md` |
| UI dialog | Slice 2(Phase 2 Slice 2) | v2 scanner landing 時に同 dialog 拡張 or 分離 |
| Revision 記録 | `operation: 'link-migration'` | `operation: 'link-migration-v2'` |
| Apply block 条件 | editing phase / readonly / light mode / import preview | 同上 + renderer feature flag off(v2 presentation を renderer が dock できない環境は block) |

v1 と v2 で **API interface は揃える方向で設計**(`LinkMigrationCandidate` / `LinkMigrationPreview` の shape を共通化、kind union だけ違う)することで、Slice 2 UI dialog が v1 / v2 両方を同じ component で列挙できる。これは **Slice 2 UI 設計時の確認事項**(本 audit で強制はしない)。

---

## 9. External Permalink との責務整理

**External Permalink は body 内 presentation とは別系統**:

- **用途**: 外部アプリ(Loop / Office / mail)に貼って **外部 click で PKC に戻ってくる** 共有 URL
- **生成元**: Copy link ボタン(#142-#144 で 1 本化済み)
- **受信**: `src/adapter/ui/external-permalink-receive.ts` が boot 時 `window.location.hash` を見て SELECT_ENTRY
- **body 内に書く ユースケース**: 基本的にはなく、paste-conversion(§4.5)が demote するのが正。cross-container External Permalink は paste で原文維持される

**body 内 External Permalink が残る現実的シナリオ**:

- 旧 PKC export から import してきた body に混在
- 手動編集で user が書いた
- 他人の markdown を本文コピペ

**現行 render 挙動**:

- `<base>#pkc?…` は body render で普通の `target="_blank"` 外部 link(`external-permalink-receive` は boot 時のみ発火、body click は OS / browser に任せる)
- 同 container の External Permalink でも click すると外部 tab / window が開いて再 load → boot で self container を検出 → receive で navigate。遠回りだが動く

**判断**:

- **body 内 External Permalink の render fallback**(same-container なら内部 navigate-entry-ref に寄せる)は **migration v2 候補**(§8 G)
- clickable-image 実装とは独立、renderer / action-binder の整合確認は共通基盤
- 本 audit では「v2 で検討する」まで pin、実装はしない

---

## 10. Out of scope / Non-goals

本 docs-only slice で **扱わない** 項目:

- renderer / resolver / action-binder の **実装変更**(src/ に一切触らない)
- `SAFE_URL_RE` の書き換え
- migration scanner v1 への追加変更(A/B/C のまま)
- migration v2 scanner の実装 / spec 最終化
- Preview UI dialog 実装(Phase 2 Slice 2)
- `@[card](...)` renderer hook 実装(Phase 4)
- clickable-image を canonical として spec §5.7 に昇格(§5.7.5 future dialect reservation のまま)
- External Permalink body 内 render fallback 実装
- card / clickable-image の UI 仕様(hover preview, popover, pointer state 等)
- migration v2 scanner の web worker 化
- tests 追加(本 docs は regression test も伴わない)

---

## 11. Next-step PR options

### 11.1 Option A — Phase 2 Slice 2 Preview UI dialog

**scope**:

- `src/adapter/ui/link-migration-dialog.ts` 新規、`text-replace-dialog` と同等 UX
- Shell menu / command palette への entry point 追加
- AppState に `linkMigrationPreview?: LinkMigrationPreview` を additive 追加
- PR #126 の scanner v1(A/B/C)を dispatch から呼んで preview 格納
- Apply all safe / Apply selected / Cancel、apply 側は Slice 3 で実装
- integration tests(happy-dom 経由)

**前提**: 本 audit(docs-only)が land していること(UI が列挙する candidate kinds が v1 の 3 種に固定済み)

**作業量の目安**: src ~500 LOC + tests ~400 LOC

**harbor 観点の利点**:

- user が初めて migration tool を触れる導線が整う(定泊 ✅)
- v1 scope(A/B/C)に UI を絞るので future dialect の不確定性に影響されない
- v2 が landing したときの UI 拡張は additive(kind フィルタを増やすだけ)

### 11.2 Option B — clickable-image renderer support implementation

**scope**: §7.1 / §7.2 / §7.3 の変更を 1 PR にまとめる:

- `SAFE_URL_RE` 拡張
- `asset-resolver` に pass 0(clickable-image)追加
- `link_open` rule に asset: 分岐(既存 data 属性流用)
- regression test 一式(asset-resolver / markdown-render / action-binder)
- spec 更新(`pkc-link-unification-v0.md` §5.7 に clickable-image を canonical 追加、§5.7.5 から canonical now に昇格)
- migration v2 scanner はまだ追加しない(renderer 動作確認後の別 PR)

**前提**: 本 audit(docs-only)が land していること

**作業量の目安**: src ~200 LOC + tests ~400 LOC + spec 2 本

**harbor 観点の利点**:

- 入港 / 出港 / 座礁回避の 3 層改善(外部から `[![alt](asset:k)](asset:k)` を持ってきても壊れなくなる)
- v2 scanner の後続 PR が小さく済む(scanner のみ、renderer 未対応の不確定性が消えている)
- 外部 Markdown editor で書いた README 風 body を pastelできる

**harbor 観点のリスク**:

- 既存 `![alt](asset:k)` canonical 挙動を壊さないテストが必須
- asset-resolver の pass 0 追加は正規表現の後方参照 + 順序再編が入り、慎重な test matrix が必要

### 11.3 推奨順

**どちらを先にするかは user 判断**。判断材料:

| 観点 | Option A を先 | Option B を先 |
|---|---|---|
| user 価値の早期露出 | ✅(既存 legacy body が 3 つの migration で綺麗になる)| △(外部 Markdown ペーストが改善するが使う頻度は限定的)|
| 設計確定度 | v1 scanner は land 済み、UI は text-replace-dialog の型を踏襲 | renderer / resolver / action-binder の変更は本 audit で整理済み、実装は初見 |
| コードリスク | 低(adapter 層 additive、core / features は無変更)| 中(resolver 順序再編、既存 asset canonical の regression リスク)|
| harbor 4 層 全 ✅ 達成 | v1 の 3 kinds 分のみ達成 | clickable-image 分のみ達成 |
| v2 scanner 起動 | A → B → v2 の 3 PR | B → A → v2 の 3 PR(どちらも同数) |

**docs 仮置き推奨**: **A を先、B を次**。理由:

- A は既存 canonical を壊すリスクがほぼゼロ(adapter 層のみ)
- A が land すると migration tool の「体感」が user に届き、feedback が取れる(UI の kind ラベル / confidence 表示 / apply 流れ等)
- B は renderer 変更で既存 canonical を壊さないか慎重に見る必要があり、A の feedback が揃ってから着手する方が安全
- ただし B を先にすることで「外部 Markdown → PKC 入港」が強化されるので、外部 paste 経路を重視するなら B が先でも OK

---

## 12. References

- `docs/spec/pkc-link-unification-v0.md` — Link 正本 spec(§5.7 Internal Markdown Dialect / §5.7.5 future dialect reservations / §10.1 `[card:<lid>]` 不採用 / §12 URI scheme allowlist)
- `docs/spec/link-migration-tool-v1.md` — Migration scanner v1 spec(§3 candidates / §14 future dialect reservations)
- `docs/development/link-system-audit-2026-04-24.md` — 直前の Copy / Paste / Render / Receive 棚卸し(G1-G7 gap list)
- `src/features/markdown/markdown-render.ts` — `SAFE_URL_RE` / link_open rule / image rule(transclusion placeholder)
- `src/features/markdown/asset-resolver.ts` — 2-pass preprocessor(image form / link form)
- `src/adapter/ui/action-binder.ts` — `navigate-entry-ref` / `navigate-asset-ref` / `a[href^="#asset-"]` chip
- `src/features/link/migration-scanner.ts` — v1 scanner(A/B/C)
- `src/features/link/paste-conversion.ts` — same-container demote
- `src/adapter/ui/external-permalink-receive.ts` — boot-time hash receiver
- `docs/development/INDEX.md` — 本 audit は #158 として記録(commit 時に追記)
- PR #126 — Phase 2 Slice 1 scanner(follow-up commit `3c7c8b6` で Candidate D 削除)

---

**Status**: docs-only、2026-04-24。Clickable-image renderer audit draft — 本 doc で航路図が固定された上で、Option A(Preview UI dialog)または Option B(clickable-image renderer)のどちらを次 PR に切るかを user が選ぶ。どちらを選んでも後続の v2 migration scanner PR が自然に続く。
