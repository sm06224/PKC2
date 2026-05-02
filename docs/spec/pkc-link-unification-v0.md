# PKC Link Unification — v0 (docs-first foundation)

> **⚠ 2026-04-24 訂正**: 初版で `pkc://...` を「permalink(外部共有 URL)」と扱っていたのは誤り。`pkc://` スキームは browser / Microsoft Loop / Office / メールクライアント等 **外部アプリでは解決できない**(OS protocol handler が無い)ため、外部に貼ってクリックで PKC に戻る用途には使えない。本訂正で **3 概念に分割** する:
>
> | 概念 | 形 | 用途 |
> |---|---|---|
> | **External Permalink** | `<base_url>#pkc?container=<cid>&entry=<lid>` | 外部アプリ(Loop / Office / mail / メモアプリ)に貼ってクリックで PKC に戻る共有 URL |
> | **Portable PKC Reference** | `pkc://<cid>/entry/<lid>` | PKC 内部 / PKC 間 / paste conversion 用の portable identifier(外部クリック不能、識別子としてのみ機能) |
> | **Internal Reference** | `entry:<lid>` / `asset:<key>` | 同一 container 内 markdown body 用 |
>
> 以降の本文は **訂正後の用語で読む**。古い「permalink = `pkc://...`」の記述は §11 migration / §4 で正本に置き換える。

## 1. Purpose / Status

> **📋 2026-04-24 audit**: Link system は #138 / #141-#148 で連続して着地。現在地の棚卸しと次 PR の実装順序は `../development/archived/audits-2026-04/link-system-audit-2026-04-24.md` を参照。本 spec は正本方針のみを持ち、surface 別詳細 / gap list / 実装順は audit doc 側に集約。

PKC2 の「参照基盤」を 1 本の spec に正本化する **docs-first foundation**。W1 Tag wave 着地後の次の foundation layer として、**Tag / Color / UI の上流にある**「エントリ間・資産・コンテナ横断の参照」を先に固定する。

この spec を先に置く理由:

- **Link は PKC 全体の参照基盤**。export / embed / P2P / manual / 外部共有 すべてに波及する
- **Color は表示レイヤ**。Link が後から変われば UI は巻き込まれる、逆は成立しない
- 現状、`entry:<lid>` スキームと `asset:<key>` スキームは **コードでは動いているが正本 spec が分散**(textlog-viewer-and-linkability-redesign §4.5, asset-reference-resolution, asset-autocomplete-foundation)。**1 本に集約して契約を固定する**
- 外部共有 URL / portable identifier / paste 変換 / presentation 分離(link / embed / card)は本 spec で確定

本 spec は **既存の `entry:` / `asset:` 内部参照を一切壊さない**。後続 slice が実装を追加する時の判断基準。

参照(先行 docs):

- `docs/development/textlog-viewer-and-linkability-redesign.md` §4.5, §6.5 — `entry:<lid>` 既存 grammar
- `docs/development/completed/asset-reference-resolution.md` — `asset:<key>` 既存 resolution
- `docs/development/completed/asset-autocomplete-foundation.md` — `asset:` 入力補完
- `docs/spec/attach-while-editing-insert-internal-link-v1-*.md` — 内部 link 挿入 UX
- `docs/spec/link-index-v1-*.md` — link index entry(Category C-3)
- `docs/spec/search-filter-semantics-v1.md` — 検索軸との関係(link は検索軸ではない)
- `docs/spec/tag-data-model-v1-minimum-scope.md` — 隣接 foundation(Tag 側)
- `docs/development/ui-vocabulary-tag-color-relation.md` — 「関連」「被参照」「参照」語彙

参照(コード):

- `src/features/entry-ref/entry-ref.ts` — parser / formatter
- `src/features/entry-ref/extract-entry-refs.ts` — bulk scanner(subset export 用)
- `src/features/entry-ref/entry-ref-autocomplete.ts` — 補完
- `src/features/entry-ref/fragment-completion.ts` — fragment 補完

---

## 2. Scope

### 2.1 含める

- **Permalink grammar**(外部共有 URL の canonical 形)
- **Internal reference grammar**(`entry:<lid>` / `asset:<key>` の正本)
- **Paste conversion rules**(permalink ↔ internal reference の自動変換トリガと条件)
- **Presentation modes**(link / embed / card の 3 形、**target とは独立に記法で指定**)
- **Cross-container behavior**(`container_id` が異なる permalink の扱い、internal への降格禁止)
- **Missing target behavior**(参照先が存在しない / 削除された時の描画と export 挙動)
- **Rendering / export fallback**(readonly, HTML export, ZIP export, sister bundle)
- **Compatibility / additive migration**(`schema_version` bump の要否、legacy 形の扱い)

### 2.2 含めない

- **実装**(parser / renderer / paste-handler / markdown transformer、いずれも後続 slice)
- **UI 実装**(card の具体的なレイアウト、hover preview、popover、editor 入力補助の実装)
- **Autocomplete 拡張**(`entry:` autocomplete / fragment completion の機能追加)
- **Search との統合**(link が検索軸に昇格するかは別 wave)
- **Relation model との融合**(Relation は `container.relations[]` の型付きエッジ、Link は body 内の参照。**別概念として併存**)
- **Tag / Color との関連付け**(Link に tag や color を付ける機能は非対象)
- **Permalink server / router 実装**(permalink をどの host で受けるかは環境依存、本 spec は grammar のみ)
- **History / revision の link 解釈**(revision snapshot 内の link は body そのままの文字列、特別扱いしない)
- **manual 更新**

### 2.3 invariant(本ドラフトが壊さない前提)

- 既存 `entry:<lid>` grammar(`textlog-viewer-and-linkability-redesign.md` §4.5)は **不変**。canonical 形の例は §5 で再掲のみ
- 既存 `asset:<key>` grammar(`asset-reference-resolution.md` §1)は **不変**
- `Entry` / `Container` / `Relation` schema は **不変**、`schema_version` は **bump しない**
- markdown body 内の **既存 link / image 記法は破壊しない**。Presentation modes(§6)は既存 markdown 記法に対する **追加の解釈層** であり、旧 reader は普通の markdown として解釈できる
- subset export(`extractEntryReferences`)の scan 契約は **不変**。新 presentation mode が増えても、scanner は同じ `entry:<lid>` token を LID として拾う
- Tag / Color の data model に影響しない

---

## 3. Terminology — target / presentation / external

この spec は **3 つの座標軸** を厳密に分ける。

| 層 | 役割 | 例 |
|---|---|---|
| **Internal Reference**(target 内側形) | 同一 container 内 markdown 用 | `entry:<lid>` / `entry:<lid>#log/<id>` / `asset:<key>` |
| **Portable PKC Reference**(target portable 形) | PKC 内部 / PKC 間 / paste 変換用 portable identifier。**外部アプリではクリック不可** | `pkc://<container_id>/entry/<lid>[#<fragment>]` / `pkc://<container_id>/asset/<key>` |
| **External Permalink**(外部共有形) | 外部アプリ(Loop / Office / mail)で **クリック可能** な共有 URL | `<base_url>#pkc?container=<cid>&entry=<lid>` / `<base_url>#pkc?container=<cid>&asset=<key>` |
| **Presentation** | target に対する見せ方の記法 | `[label](entry:...)`(link) / `![alt](entry:...)`(embed) / `@[card](entry:...)`(card) |

**重要な不変量**:

- **target と presentation は分離**: 同じ target は link / embed / card いずれの presentation でも同じ URI 文字列。presentation を変えても target は不変(§6 / §10.2)
- **Portable Reference と External Permalink は責務が違う**:
  - `pkc://` = **識別子**(machine-readable、grammar が短く paste / parse 効率優先、外部クリック不能)
  - `<base>#pkc?...` = **クリック可能 URL**(human-shareable、host URL を base にし `pkc://` 互換情報を fragment に詰める、外部アプリで開ける)
- **cross-container 共有は External Permalink を使う**(§4)、cross-container 識別子表現は Portable Reference を使う(§5)
- **Internal Reference は同一 container 内側の形** で、container_id を持たない(§5.4)

### 3.1 「Link」という語の扱い

UI 上の「リンク / Link」は §6 の presentation mode の 1 つ(`[label](entry:...)`)を指す狭義の用語でもあり、本 spec タイトルの「Link Unification」は参照基盤全体を指す広義の用語でもある。混同を避けるため本 spec では:

- 「**link presentation**」= §6 の 3 modes のうち link mode
- 「**reference**」= target を指す文字列(internal or permalink)
- 「**link system**」= 本 spec が扱う参照基盤全体

以降の節では文脈で一意になるよう使い分ける。

### 3.2 Relation(既存)との関係

- **Relation**(`container.relations[]`、`semantic` / `temporal` / `provenance` / `categorical` / `structural`)は **エントリ間の型付きエッジ**。meta pane の Related Entries に並ぶ
- **Link**(本 spec が扱う参照)は **body 内のテキスト参照**。markdown 記法で埋め込まれる
- 両者は **別概念で併存**。同じ entry ペアを Relation にも Link にも表現できるが、それは「UI 上の Related Entries」と「本文中の参照」の 2 つの面で見えるだけ
- **自動変換しない**(Link を書いたら自動で Relation が張られる、などはしない)

---

## 4. External Permalink grammar(外部クリック可能共有 URL)

### 4.1 Canonical form

```
<base_url>#pkc?container=<cid>&entry=<lid>
<base_url>#pkc?container=<cid>&entry=<lid>&fragment=<frag>
<base_url>#pkc?container=<cid>&asset=<asset_key>
```

- `<base_url>` = host URL(hash 部を除いた `window.location.href`、例: `file:///home/u/pkc2.html` / `https://example.com/pkc2.html`)
- fragment 全体は `#pkc?<query>` 形(URL fragment + query syntax)
- `container` = `container.container_id`(`[A-Za-z0-9_-]+`)
- `entry` か `asset` のいずれか **必須**(両方同時は不可)
- `fragment` = entry の場合のみ optional、`#` を **含まない** 形(`log/<id>` / `day/<yyyy-mm-dd>` / `log/<id>/<slug>`)。実体の `#` は外側のフラグメント区切りに使われるため、内側の "fragment" は query value として渡す
- 値は通常 token 形(`[A-Za-z0-9_-]+` + `..` for log range)。空白・日本語はクライアント側で `encodeURIComponent` する

### 4.2 Why `<base>#pkc?...` 形

- **外部アプリで開ける**: browser / Loop / Office / mail / メモアプリは `file://` / `https://` を解決できる。受信側で host URL を開くと PKC2 が起動し、`window.location.hash` を読んで `#pkc?...` を解決して該当 entry へジャンプする
- **`pkc://` は外部解決不能**: `pkc://` は OS protocol handler が無いので external-app クリックで PKC に戻れない。だから外部共有の正本にはできない
- **既存 markdown を壊さない**: 通常 `https:` / `file:` link としてそのまま流通、PKC 解釈できない host や旧 PKC でも 単に host URL に飛ぶ(無害な fallback)
- **identifier portable 形は別途 `pkc://`**(§5.5 Portable PKC Reference)で扱う

### 4.3 Examples

| 用途 | URL |
|---|---|
| Loop に貼ってクリックで戻る | `file:///home/me/pkc2.html#pkc?container=abc&entry=e123` |
| メールに貼る | `https://example.com/pkc2.html#pkc?container=abc&entry=e123` |
| log 行への深いリンク | `https://example.com/pkc2.html#pkc?container=abc&entry=e123&fragment=log/xyz` |
| asset を共有 | `https://example.com/pkc2.html#pkc?container=abc&asset=ast-001` |

### 4.4 Forbidden forms

本 spec v0 で External Permalink としては **認めない**:

- `<base_url>?entry=<lid>`(query-based、host が sanitize する可能性)
- `<base_url>/entry/<lid>`(path-based、server-side routing が必要)
- `<base_url>#pkc-ref=pkc://...`(初版の host wrapper 形 — `pkc://` を embed すると展開に追加 parse が要る、新形は flat な query で済む)
- `entry://<lid>`(container_id 無し)

### 4.5 Encoding

- token 値(lid / asset_key / container_id)は `[A-Za-z0-9_-]+` のため encoding 不要
- log range の `..` も URL safe
- 将来 fragment に空白・Unicode を入れる拡張は `encodeURIComponent` で吸収。decode 側は `decodeURIComponent` を一度だけ通す
- multi-key の order は固定: `container` → `entry`/`asset` → `fragment`。formatter は本 order を使うが、parser は順不同を許容

---

## 5. Internal reference grammar

Internal reference は **同一 container 内側の参照**。既存 code(`src/features/entry-ref/entry-ref.ts`)の grammar を **本 spec で正本化**。新しい構文は増やさない。

### 5.1 Entry reference

```
entry:<lid>                      # bare reference
entry:<lid>#log/<id>             # log entry fragment
entry:<lid>#log/<a>..<b>         # log range fragment
entry:<lid>#day/<yyyy-mm-dd>     # day fragment
entry:<lid>#log/<id>/<slug>      # heading fragment
entry:<lid>#<legacy-id>          # legacy log fragment (accepted, not emitted)
```

- `<lid>` / `<id>` / `<slug>` は `[A-Za-z0-9_-]+`
- `<yyyy-mm-dd>` は ISO 8601 date subset
- **canonical form** は `log/<id>` / `day/...` / `log/<id>/<slug>` を明示。旧形(`entry:<lid>#<id>`)は read accept、write emit しない

### 5.2 Asset reference

```
asset:<asset_key>
```

- `<asset_key>` は container-scoped、`[A-Za-z0-9_-]+`(既存 `asset-reference-resolution.md` §1)
- fragment は持たない(asset は単一 blob)
- resolver は `container.assets[<asset_key>]` を見て data URL に展開

### 5.3 なぜ `entry:` / `asset:` を分けるか

- **resolver path が違う**: entry は `container.entries[]` lookup、asset は `container.assets{}` lookup
- **型が違う**: entry は編集可能ノード、asset は immutable blob
- **許可される presentation mode が違う**: asset は link / embed(画像)のみ、**card mode を持たない**(§6.4)
- **extract 対象が違う**: subset export の scanner は entry ref のみ収集(asset は `extractAssetReferences` が別途担当、既存)

### 5.4 Internal reference は **container_id を持たない**

- 内部参照は同一 container 内前提。container_id を URI に埋め込まない
- これにより container 複製時(clone / export / import)に URI を書き換える必要がない
- cross-container の参照は **Portable PKC Reference / External Permalink に昇格** する(§5.5 / §4)

### 5.5 Portable PKC Reference(`pkc://...`)— machine identifier 形

```
pkc://<container_id>/entry/<lid>
pkc://<container_id>/entry/<lid>#<fragment>
pkc://<container_id>/asset/<asset_key>
```

- **scheme**: `pkc://` 固定(lowercase)
- **container_id**: `[A-Za-z0-9_-]+`、authority 部
- **entry/asset**: 固定語(lowercase)、path 1 段目
- **lid / asset_key**: token 形、path 2 段目
- **fragment**: entry のみ optional、`#log/<id>` 等の `entry:` と同形

役割と非役割:

- ✅ **PKC 内部 / PKC 間の identifier**(paste conversion / 内部 marshalling / extract scanner / container 間 reference)
- ✅ **paste conversion の入力形**(§7.1 で同 container 判定 → internal 降格、§7.2 で cross-container はそのまま保持)
- ✅ **External Permalink の中身を表す portable 表現**(§4.1 の query パラメータと同義)
- ❌ **外部アプリ用クリック可能 URL ではない**(OS protocol handler 不在)
- ❌ **single source of truth ではない**(External Permalink 経由でも同じ entry に到達できる)

### 5.6 Parser / extractor 契約(既存維持)

- `parseEntryRef(raw)` は throw しない。invalid は `{ kind: 'invalid', raw }` を返し、renderer 側で broken ref placeholder に fallback(§9.1)
- `extractEntryReferences(markdown)` は fragment の有無にかかわらず LID のみを集める。subset export の依存先解決に使用
- 本 spec v0 では上記 2 関数の挙動を **変更しない**

### 5.7 Internal Markdown Dialect(正本)— 2026-04-24 audit 確定

Body 内の PKC 専用 markdown 記法を **1 表で正本化** する。新規 emit はこの表の canonical 形のみ。legacy 形は読み込み互換として残すが、**新規には emit しない**。

#### 5.7.1 Target(内側形、body に書かれる)

| target | 意味 |
|---|---|
| `entry:<lid>` | 同 container の entry 全体 |
| `entry:<lid>#log/<logId>` | 同 container entry の log 行(**canonical**) |
| `entry:<lid>#day/<yyyy-mm-dd>` | 同 container entry の day section |
| `entry:<lid>#log/<logId>/<slug>` | 同 container log 行内の heading |
| `asset:<key>` | 同 container の asset |

#### 5.7.2 Presentation(外側形、記法)

| presentation | 記法 | 必須条件 |
|---|---|---|
| **link** | `[Label](<target>)` | **非空 label 必須**(CommonMark 準拠、空 label は不可視 anchor を生む) |
| **embed** | `![Alt](<target>)` | 画像 / transclusion、asset は画像形がデフォルト |
| **card**(次 wave) | `@[card](<target>)` | block preview(spec §10.1 で採用根拠確定) |

#### 5.7.3 Legacy / 読み込み互換(accept、**emit しない**)

| 形 | 扱い |
|---|---|
| `entry:<lid>#<logId>`(legacy fragment、`log/` なし) | parser accept、新規 emit しない |
| `[](entry:<lid>)` 空 label | renderer は従来どおり描画、新規 emit しない(paste 側 #147 で対策済み) |
| `pkc://<self>/entry/<lid>` body 内残存 | renderer が same-container fallback で navigate-entry-ref に合流(#146)、新規 emit しない |
| `pkc://<other>/...` body 内残存 | portable-reference-placeholder で描画(#143)、新規 emit しない |

#### 5.7.4 禁止(新規生成しない形)

- 空 label link: `[](entry:...)` / `[](asset:...)`
- body 内 `pkc://...`(Copy surface が External Permalink に一本化されたため)
- `[card:<lid>]` 独自記法(spec §10.1 で不採用確定)
- `[![<alt>]](<target>)`(字面どおり markdown-it は literal `![]` label の anchor として扱い clickable image にならない、§5.7.5 参照)

#### 5.7.5 Clickable-image / future dialect 整理

**正本 reference**: `../development/clickable-image-v2-decision-audit.md`(2026-04-25、PR #141 で着地)。本節は同 audit の決定(Option B+ ハイブリッド)を spec 側に正本化した整理。8-case empirical probe の根拠と Harbor 4 層評価は同 audit を参照。

標準 Markdown の clickable-image(`[![alt](image)](link)`)を PKC2 が dock させるときの 4 区分を以下に固定する。**`SAFE_URL_RE` に `asset:` を追加しないこと**(PR #131 → #132 / `card-asset-target-coordination-audit.md` の決定維持)を前提に、`asset-resolver` が single source of truth として asset ref を rewrite する現状をそのまま正本とする。

##### canonical(現 main で完全動作、新規 emit OK、migration v2 で promotion 候補)

| form | 動作 |
|---|---|
| `[![<alt>](asset:<key>)](entry:<lid>)` | inner→data URI、outer→`<a navigate-entry-ref><img data:></a>`(asset thumbnail to internal entry) |
| `[![<alt>](https://...image)](https://...target)` | 標準 README badge `<a target="_blank"><img></a>` |
| `[![<alt>](asset:<key>)](https://...target)` | asset thumbnail to external page |
| `[![<alt>](https://...image)](entry:<lid>)` | external thumbnail to internal entry |
| `[![<alt>](asset:<key>)](pkc://<other>/entry/<lid>)` | asset thumbnail with cross-container portable-reference-placeholder badge |

これら 5 form は 現 renderer + asset-resolver で完結。`migration v2` の opt-in promotion candidate(`![<alt>](asset:k)` → clickable-image 等)は本表を destination として扱う。

##### partial / caution(動くが新規 emit 推奨せず、reader / writer に注意点あり)

| form | 注意点 |
|---|---|
| `[![<alt>](entry:<lid1>)](entry:<lid2>)` | 動作するが **block-in-inline** semantic NG(transclusion `<div>` を `<a>` が囲む)。新規 emit せず reader tolerance に依存 |
| `[![<alt>](asset:<key>)](pkc://<self>/entry/<lid>)` | 動作するが same-container でも portable-reference-placeholder badge になる(現 renderer が same/cross 区別せず badge 化)。**`[![<alt>](asset:<key>)](entry:<lid>)` form を推奨** |

##### future v2(現 main では broken / 未対応、実装には別 wave envelope が必要)

| form | 現状 | 必要条件(同時 land) |
|---|---|---|
| `[![<alt>](asset:<key>)](asset:<key>)` | inner→data URI、outer `(asset:k)` が validateLink reject → `<p>[<img>](asset:k)</p>` の literal 漏れ | (a) `SAFE_URL_RE` に `asset:` 追加 / (b) `asset-resolver` に nested-form 対応 pass を追加 / (c) `action-binder` に asset: click handler 追加。**3 点が同時 land** しないと PR #131 regression を再発する |

`migration scanner v1` は本 form を **生成も検出もしない**(`link-migration-tool-v1.md` §14.1 既存契約)。`migration v2` 起動の前提は、上記 3 点 envelope が `clickable-image-v2-implementation-spec.md`(未作成、後続 wave)で固定されること。

##### invalid / do-not-emit(harbor 4 層のどこでも価値ゼロ)

| form | 理由 |
|---|---|
| `[![]](<target>)` | nested image にならない(内側 `[]` 空 + 外側 `]` 直後に `(` が無いため CommonMark grammar が image として展開しない)。anchor + literal `![]` label として token 化、harbor 4 層すべて ❌ |
| `[![<alt>]](<target>)` | 上と同様、`]]` 後に `(` が無いと image rule が起動しない疑似 form。誤読のみ生み、value 無し |

**migration scanner v1 / v2 のどちらでも before/after に出さない**(`link-migration-tool-v1.md` §14.2 既存契約)。

##### `@[card]` reservation(本表とは独立)

`@[card](<target>)` / `@[card:<variant>](<target>)` は本 spec では引き続き `card-embed-presentation-v0.md` 側の reservation。Card Slice 1-4(#170 / #171 / #178)で parser + renderer placeholder + click wiring が landing 済み、widget 本体(thumbnail / excerpt)は Slice 5+ 想定。clickable-image とは別軸の presentation で、本 §5.7.5 の 4 区分とは交差しない。

**Harbor 原則**(詳細は `./link-migration-tool-v1.md` §14): PKC 内で未解決の future dialect を migration tool が生成すると、apply 直後に body が visibly 壊れる。scanner v1 は before / after 双方で **future v2** および **invalid** の form を **生成も検出もしない**。

**先行 audit**: 11-form syntax matrix と Harbor 航路図の元設計は `../development/clickable-image-renderer-audit.md`(2026-04-24、#158)を参照。本 §5.7.5 はその後継 audit(`../development/clickable-image-v2-decision-audit.md`、#180、PR #141)の決定を canonical 化した整理。

---

## 6. Presentation modes

Target(§5)に対して「どう見せるか」を決める **3 つの記法**。target 文字列は共通、**presentation は記法で区別**する。

> **Note**: 本節は link / embed / card の記法概要を残すが、**詳細な決定版** は `./card-embed-presentation-v0.md` に集約されている(2026-04-24)。記法候補 7 案の harbor 4 層比較、target × presentation 許容表、paste / export / fallback / cross-container placeholder / 実装 slice 提案はそちらを参照。本節はあくまで target / presentation 分離原則の入口。

### 6.1 Link mode(既存 markdown link)

```markdown
[label](entry:<lid>)
[label](entry:<lid>#log/<id>)
[label](asset:<key>)
```

- 記法: **ordinary markdown link**(`[...](...)`)
- 描画: inline anchor、クリックで navigator に渡る
- **label は必須**(markdown 仕様)。空 label `[](entry:...)` は描画時に target から title / filename を補って表示
- 最軽量の presentation。本文中に自然に埋め込める

### 6.2 Embed mode(既存 markdown image の拡張)

```markdown
![alt](entry:<lid>)
![alt](entry:<lid>#log/<id>)
![alt](asset:<key>)
```

- 記法: **markdown image** プレフィックス `!` を `[...]` に付ける
- 描画:
  - `asset:<key>` → 画像として inline embed(既存、`asset-reference-resolution.md` §2)
  - `entry:<lid>` → **本文の transclusion**(参照先 entry の body を本文として埋め込む、readonly)
  - `entry:<lid>#log/<id>` → log 単位の transclusion
- **embed は参照元の内容を自 entry 内に展開する**。target が更新されれば embed 表示も自動追従
- 循環参照は renderer 側で 1 段だけ展開、2 段目以降は link placeholder に縮退(§9.3)

### 6.3 Card mode(新規、本 spec で確定)

```markdown
@[card](entry:<lid>)
@[card](entry:<lid>#log/<id>)
```

- 記法: **`@` プレフィックス + `[card]` + target**(プレフィックス `@` で link / embed と記法的に分離)
- 描画: **block-level な card widget**(タイトル / 抜粋 / サムネ / 種別バッジ を含むプレビューカード)
- クリック → navigator。hover → preview は実装 slice の UX 判断(本 spec では必須化しない)
- **最も重い presentation**。本文の流れを一度切って別 entry を紹介するときに使う
- asset には card mode を **持たせない**(§5.3)。asset には preview card 相当の情報(title / excerpt)がないため
- **`@[card]` の `[card]`** は **固定語**(将来 `@[card:large]` / `@[card:compact]` のように variant を増やす余地を残す — variant 拡張は別 slice)

### 6.4 Target × Presentation の許容表

| target | link | embed | card |
|---|---|---|---|
| `entry:<lid>` | ✅ | ✅ (transclusion) | ✅ |
| `entry:<lid>#log/<id>` | ✅ | ✅ (1 log 単位) | ✅ |
| `entry:<lid>#day/<yyyy-mm-dd>` | ✅ | ✅ (1 日単位) | ✅ |
| `asset:<key>`(画像) | ✅ | ✅ (inline image) | ❌ |
| `asset:<key>`(非画像) | ✅ | ⚠️ 実装 slice で判断(PDF preview 等) | ❌ |

### 6.5 Presentation と target の 1 対多

- 同じ target を link / embed / card で参照できる(参照する側の都合で切り替える)
- 同一 body 内で同じ target を複数 presentation で使っても問題ない
- extract scanner は presentation を見ず target のみ集める(既存契約、§5.5)

---

## 7. Paste conversion rules

外部からペーストされた文字列を、自 container の body に取り込む際の **変換規則**。editor / paste-handler が本 spec に従って書き換える(実装 slice)。

paste 変換が **受理する 2 形**:

1. **External Permalink** — `<base_url>#pkc?container=<cid>&entry=<lid>[&fragment=<frag>]` / `&asset=<key>`(§4)
2. **Portable PKC Reference** — `pkc://<cid>/entry/<lid>[#<frag>]` / `pkc://<cid>/asset/<key>`(§5.5)

両者とも container_id を持っているので、自 container 判定は同じロジック(`container === self_id`)で済む。

### 7.1 Same-container → Internal reference に降格

ペースト文字列が External Permalink **または** Portable Reference で、container_id が自 container と一致する場合、internal reference に降格する:

```
# in:  https://host/pkc2.html#pkc?container=<self_id>&entry=lid_a
# out: entry:lid_a

# in:  pkc://<self_id>/entry/lid_a
# out: entry:lid_a

# in:  https://host/pkc2.html#pkc?container=<self_id>&entry=lid_a&fragment=log/xyz
# out: entry:lid_a#log/xyz

# in:  pkc://<self_id>/entry/lid_a#log/xyz
# out: entry:lid_a#log/xyz

# in:  https://host/pkc2.html#pkc?container=<self_id>&asset=ast-001
# out: asset:ast-001

# in:  pkc://<self_id>/asset/ast-001
# out: asset:ast-001
```

- 判定は **exact match**(case-sensitive、trim なし、empty container_id は false)
- External Permalink では fragment が `&fragment=` query で来るので、internal 形では `#` を前置して連結

### 7.2 Cross-container → 保持(変換しない)

```
# in:  https://host/pkc2.html#pkc?container=<other_id>&entry=lid_a
# out: https://host/pkc2.html#pkc?container=<other_id>&entry=lid_a  (そのまま)

# in:  pkc://<other_id>/entry/lid_a
# out: pkc://<other_id>/entry/lid_a  (そのまま)
```

- 自 container と異なる `container_id` の参照は **絶対に internal reference に降格しない**。降格したら別 container の entry を自 container の lid として解釈してしまう(ID 衝突 / 意味破壊)
- External Permalink は外部アプリで開ける形のまま保持。Portable Reference はそのまま identifier として保持。描画は §8 / §9 のルールに従う

### 7.3 Internal reference → ?(変換しない)

- すでに `entry:<lid>` / `asset:<key>` の形でペーストされたものは **そのまま** body に入れる
- 「内部参照を permalink に昇格する」逆変換はしない(user intent 不明、多くの場合本人が意図して内部参照を書いている)
- export / share で permalink が必要になる場面は §9.4 で export 側が解決

### 7.4 Plain text / その他の URL

- `https://` / `http://` で始まる通常の web URL は **そのまま**(markdown link として扱う責任は markdown 側)
- プレーンテキストは **変換しない**(paste-handler は link 系にしか手を出さない)

### 7.5 Presentation mode の保持

paste 時に source 側に presentation 記法が付いていた場合、記法を保ったまま target だけ変換:

```
# in:  [foo](pkc://<self_id>/entry/lid_a)
# out: [foo](entry:lid_a)

# in:  ![pic](pkc://<self_id>/asset/ast-001)
# out: ![pic](asset:ast-001)

# in:  @[card](pkc://<other_id>/entry/lid_a)
# out: @[card](pkc://<other_id>/entry/lid_a)  (cross-container は permalink 維持)
```

### 7.6 Paste 変換の冪等性

- 同じ文字列を 2 回 paste しても結果が変わらない
- 変換結果を再度 paste しても変化しない(`entry:lid_a` は §7.3 によりそのまま、permalink 維持は §7.2 による)

---

## 8. Cross-container behavior

### 8.1 Cross-container は permalink でのみ表現する

- 他 container の entry / asset を参照する唯一の手段は **permalink**
- internal reference には container_id が無く、cross-container では意味が決まらないため禁止(§5.4)

### 8.2 描画ポリシー

同じ body 内に自 container / 他 container の参照が混ざっていた場合の挙動:

| target 形 | 解決元 | 描画 |
|---|---|---|
| `entry:<lid>` | 自 container の `entries[]` | 通常描画(§9.1 で解決成否を分岐) |
| `asset:<key>` | 自 container の `assets{}` | 通常描画 |
| `pkc://<self>/...` | **paste 時に internal に降格**(§7.1) | 通常描画 |
| `pkc://<other>/...` | **自 container では解決できない** | cross-container placeholder(§8.3) |

### 8.3 Cross-container placeholder

自 container で解決できない permalink は、**broken ref にせず「外部参照」として明示描画**:

- link mode: `[label](pkc://other/entry/x)` → inline badge + label(external icon)
- embed mode: `![alt](pkc://other/entry/x)` → card-like box「この参照は別 container のものです」+ permalink 文字列表示
- card mode: `@[card](pkc://other/entry/x)` → **skeleton card**(タイトル未解決 / container_id 表示 / "open" CTA)
- クリック時の挙動は §8.4

### 8.4 Cross-container navigation(実装 slice で確定)

- 本 spec v0 では「cross-container permalink を開いたときにどう遷移するか」の UX は **実装 slice で決める**(navigator / window manager / P2P 層との協調が必要)
- 本 spec が定義するのは **grammar と fallback 描画のみ**。navigation の specific behavior は後続

### 8.5 Export 時の cross-container permalink

- HTML export / ZIP export / sister bundle はいずれも **permalink 文字列をそのまま** 保持
- 他 container の実体を export に含める義務は無い(subset export の `extractEntryReferences` は同 container の entry ref のみ走査、cross-container permalink は `entry:` token を含まないので自然に除外される)

---

## 9. Missing target behavior / rendering fallback

### 9.1 Missing internal target(同 container 内、解決失敗)

- `entry:<lid>` で `lid` が `container.entries[]` に存在しない場合:
  - link mode: `[label](entry:<lid>)` → **broken ref placeholder**(`label` を灰色 + 取り消し線 or `[missing entry]` バッジ)
  - embed mode: `![alt](entry:<lid>)` → 1 行の broken box + `alt` 表示
  - card mode: `@[card](entry:<lid>)` → broken skeleton card(「削除されたか、未同期の entry」)
- **target 文字列(`entry:<lid>`)は body から消さない**。後で entry が復活したら link も復活する

### 9.2 Missing asset target

- `asset:<key>` で `key` が `container.assets{}` に無い場合:
  - link mode: broken ref placeholder
  - embed mode(画像想定): `alt` 表示 + broken image icon
- 復活時の挙動は §9.1 と同じ

### 9.3 循環参照(embed mode の特殊ケース)

- `A` の body に `![](entry:B)`、`B` の body に `![](entry:A)` のような循環:
  - renderer は **1 段だけ展開**。2 段目以降は link mode に縮退
  - 無限ループ防止のための **static limit**(例: depth 1)。具体的数値は実装 slice

### 9.4 Readonly / export fallback

- **HTML export**(single-file, readonly viewer):
  - internal reference → 同じ HTML 内で resolve(通常描画)
  - cross-container permalink → inline text + external badge(§8.3 と同じ)
  - missing target → broken placeholder(§9.1)
  - **`extractEntryReferences` が走って依存 entry を export に含める**(既存、subset export 経路)
- **ZIP export / sister bundle**: HTML export と同じ方針
- **readonly mode の navigator** は edit action を発行しない。broken ref のクリックは no-op

### 9.5 Legacy / unknown variant

- 既存 `entry:<lid>#<legacy-id>` 形(`log/` プレフィックスなし)は **read accept**、write emit しない(§5.1)
- 将来 `@[card:variant](entry:...)` のような variant が追加されたとき、未知 variant を見た旧 reader は **fallback として link mode として描画**(記法は壊れない、ただの markdown に見える)

---

## 10. Design rationale

### 10.1 なぜ `[card:<lid>]` ではなく `@[card](entry:<lid>)` か

**採用しなかった案**: `[card:<lid>]` / `[card](lid)` のような独自記法

**理由**:

1. **target と presentation の責務混同を防ぐ**
   - `[card:<lid>]` は「card であること」と「lid を指すこと」を 1 つの token に詰め込む。target 側に `lid` を書いてしまうので、§3 の「target と presentation の分離」が崩れる
   - `@[card](entry:<lid>)` なら target 部 `entry:<lid>` は link / embed と完全に共通、presentation(`@[card]`)だけが差し替わる
2. **既存 markdown 記法と同居できる**
   - `[...](...)` / `![...](...)` と同じ形(prefix 付き変種)なので、markdown parser の拡張として最小コストで乗る
   - `[card:...]` は通常 markdown 的には空 link になり、既存 parser が意味を失う
3. **旧 reader fallback が自然**
   - markdown 対応の旧 reader が `@[card](entry:x)` を見ると、`@` は literal、`[card](entry:x)` は通常の link としてレンダされる(link mode への自動縮退、§9.5)
   - `[card:<lid>]` の旧 reader fallback は「`[card:<lid>]` という literal 文字列」になってしまい、body が壊れて見える
4. **拡張の余地**
   - `@[card:compact]` / `@[card:wide]` のような variant を後から入れやすい
   - 同じ pattern で `@[mention](...)` / `@[quote](...)` のような **別の presentation 系** も追加できる(全て link / embed の target grammar を再利用)

### 10.2 なぜ presentation を target から切り離すか

1. **文書の意味変更なしに見た目だけ変えたい**
   - ある entry を「本文にさらっと link」か「カードで前面プッシュ」か、**同じ参照先のまま** 書き手が選べる必要がある
   - target に presentation を埋め込むとこの切り替えで lid を毎回書き直すことになり、diff / merge / search すべてが壊れる
2. **extract scanner が 1 本で済む**
   - `extractEntryReferences` は presentation に関係なく `entry:<lid>` token を数えるだけ。subset export / link index / broken-ref audit がすべて同じスキャナで動く
   - presentation ごとに別 scanner を書くと maintenance が爆発する
3. **paste 変換が単純になる**
   - §7 の paste rule は target 部分しか見ない。presentation prefix(`[`, `![`, `@[card]`)は保持したまま target を書き換えるだけ
   - target と presentation が混ざっていると正規表現で解ききれなくなる

### 10.3 なぜ permalink に `container_id` を authority に置くか

1. **paste 判定が O(1)**: authority を見るだけで「自 container か否か」が決まる。path を parse する必要がない
2. **host-agnostic**: §4.2 のとおり、host URL から切り離されているので、container を別ホストに置き換えても permalink は有効
3. **人間が読んで分かる**: `pkc://abc123/entry/xyz` を見れば「PKC の container abc123 の entry xyz」と直読できる

### 10.4 なぜ Link と Relation を併存させるか

- **Link = body 内テキスト参照**、**Relation = エントリ間の型付きエッジ**。UI 上の見え方・編集経路・検索軸がそれぞれ違う(§3.2)
- 両者を統合すると「body にリンクを書いたら勝手に Relation が張られる」のような **副作用** が発生し、Relation の明示的管理モデル(meta pane での CRUD)と衝突する
- 併存しつつ **自動変換はしない**。書き手が必要なら両方を明示的に書く

---

## 11. Compatibility / additive migration

### 11.1 既存 markdown 記法との互換

- link / embed mode は **既存 markdown 記法そのもの**。旧 reader で普通に描画される
- card mode(`@[card](...)`)は新 prefix `@[card]` を追加する拡張。旧 reader は `@` literal + 通常 link として描画(§9.5)= **body は壊れない**
- permalink(`pkc://...`)は新 scheme。旧 reader は「open できない URL」として link 表示(body は壊れない)

### 11.2 schema_version は bump しない

- link 系はすべて body 文字列に納まる(entry schema / container schema を一切変更しない)
- extract scanner / resolver の挙動追加はすべて **backward-compatible**
- v0 契約内では `schema_version` bump 不要

### 11.3 既存 `entry:` / `asset:` grammar の継続

- §5 は既存 grammar を **そのまま** 正本化するだけ
- legacy 形(`entry:<lid>#<id>`、`log/` なし)は read accept 継続(§5.1 / §9.5)
- `src/features/entry-ref/entry-ref.ts` / `extract-entry-refs.ts` / resolver / autocomplete は **コード変更なし**

### 11.4 Revision / history

- revision snapshot 内の link / permalink 文字列は **そのまま保持**。revision を復元したら link も復元される
- 本 spec のルールは **現在の body を解釈する際に適用**。過去 revision の解釈で本 spec に準拠しない形(旧 paste 変換で生まれた形)が残ることは許容

---

## 12. Non-goals

- **code implementation**(parser / paste-handler / markdown transformer / renderer / navigator)
- **Card widget の具体レイアウト**(title / excerpt / thumbnail / action row の詳細)
- **Hover preview / popover の UX**
- **Permalink の server-side router / host 環境別 URL 形**
- **Cross-container navigation の具体 UX**(どの window に開くか、P2P 経由で fetch するか等)
- **Autocomplete / fragment completion の機能追加**(既存挙動維持のみ)
- **Link を検索軸にすること**(`search-filter-semantics-v1.md` の軸には追加しない)
- **Link に Tag / Color を付ける機能**
- **Permalink の short URL / hash 化**
- **manual 更新**(実装 slice 着地後に別 slice で)

---

## 13. Next-step options

本 spec が固まったら、以下の順で最小 slice を切ることを推奨する。

### Slice 1 — Permalink formatter / parser(コード、最小)

- `src/features/link/permalink.ts`(新規)で `parsePermalink(raw)` / `formatPermalink({container_id, lid, fragment?})` / `isSamePermalinkContainer(raw, self_id)` を追加
- host URL ラッパー(§4.3)の展開 / 圧縮もこの module に収める
- 既存 `entry-ref.ts` は **触らない**(internal reference 側の API に混入させない)
- テストのみ追加、既存 body は不変

### Slice 2 — Paste conversion(コード)

- paste-handler を拡張(`src/adapter/ui/paste-handler.ts` 等、実装 slice で確定)
- §7 の変換規則を規則単位で実装、規則ごとにテスト

### Slice 3 — Cross-container placeholder rendering(コード)

- markdown renderer が `pkc://` URL を検出したら external badge / skeleton card に変換
- 既存の link / image renderer pipeline に minimal hook を足す

### Slice 4 — Card mode rendering(コード)

- `@[card](...)` を認識する markdown extension
- preview card widget(title / excerpt / archetype badge)
- missing / cross-container fallback(§9.1 / §8.3)

### Slice 5 — Permalink export / share UI(コード、optional)

- entry meta pane に「permalink をコピー」ボタン
- §4 canonical 形 / §4.3 host URL ラッパーの両方に対応

**推奨順**: Slice 1 → 2 → 3 → 4 → 5。Slice 1 の parser が安定しないと paste / renderer は書けない(grammar 検証が走らない)。Slice 4 は UI の重量級なので、Slice 2 / 3 の text path が通ってから着手するのが安全。

---

## 11. Migration / Compatibility(初版誤り訂正後の取扱い)

初版で `pkc://...` を「permalink(外部共有 URL)」として扱った経緯から、コード / docs 内に旧用語が残っている可能性がある。本訂正後の方針:

### 11.1 既存の内部リンクは壊さない

- `entry:<lid>` / `entry:<lid>#log/...` / `asset:<key>` 等の internal reference は **すべて従来どおり動作**
- 既存 markdown body / TEXTLOG ref / image embed / attachment ref はそのまま読める / render される
- 旧 `pkc://...` を body に書いてしまったケースも parse として認識される(Portable Reference として扱う、§5.5)

### 11.2 自動一括 rewrite はしない

- 既存 body の `pkc://` を External Permalink に書き換えるような migration script は **入れない**
- 理由: rewrite は破壊的かつ user 意図と干渉する可能性。新しい Copy 系 UI からは新形(External Permalink)を emit させ、自然に新形へ寄せる

### 11.3 Copy / Paste 経路は新形を優先

- **Copy link UI** は External Permalink を emit する(§4)
- **Paste conversion** は External Permalink と Portable Reference の **両方を受理**(§7)
- この組み合わせで、既存 body は壊さず、新規操作は External Permalink ベースに寄っていく

### 11.4 Markdown renderer は legacy grammar 維持

- `entry:` / `asset:` / `pkc:` / `https:` 等の link_open 解釈は本訂正でも変えない
- CSS class / data 属性の名称は `pkc-permalink-external` から `pkc-portable-pkc-reference`(または `pkc-external-permalink`)に **段階的に rename** する。旧 class が残っていても CSS は壊れない(両方を style するか、一方だけ残す)

### 11.5 Normalize / migration tool は future slice

- 旧 body の `pkc://` を External Permalink に置換する optional tool は将来別 slice。本訂正には含めない
- 同様に、旧 `pkc-ref=` host wrapper 形(初版 §4.3)を読む後方互換 parser も任意 slice

### 11.6 Normalize PKC links — migration tool 方針(2026-04-24 audit 追加)

Link 正本が固まった時点で、**既存 body を正本方言(§5.7)に寄せる optional tool** を提供する。実装は別 PR、本 spec は **方針のみ** を持つ。

#### 11.6.1 基本方針

- **自動一括 rewrite はしない**(破壊的 / user 意図と干渉)
- **user opt-in の explicit tool 経由でのみ実行**
- **preview 必須 → 確認 → 適用** の 3 段階
- apply 時は **新 revision** を作って記録(既存 revision 機構で undo 可能)
- ordinary URL / Office URI scheme / 無関係 markdown は一切触らない

#### 11.6.2 変換候補(tool が preview に列挙)

| 検出対象 | 変換案 |
|---|---|
| `[](entry:<lid>)` 空 label | `[Entry Title](entry:<lid>)` |
| `[](asset:<key>)` 空 label | `[Asset Name](asset:<key>)` |
| `pkc://<self>/entry/<lid>[#<frag>]` body 内残存 | `[Entry Title](entry:<lid>[#<frag>])` |
| `pkc://<self>/asset/<key>` body 内残存 | `[Asset Name](asset:<key>)` |
| `entry:<lid>#<logId>` legacy fragment | `entry:<lid>#log/<logId>` |

#### 11.6.3 触らない対象

- `pkc://<other>/...`(cross-container、解決不能)
- `https://` / `http://` / `file://`(`#pkc?` を含まないもの)
- `mailto:` / `tel:` / `ftp:`
- Office URI scheme(`ms-word:` / `onenote:` / 他)
- `obsidian:` / `vscode:` / その他未知 scheme
- `[label](entry:<lid>)` の **空でない label**(ユーザー意図を優先)

---

## 12. URI scheme allowlist / non-interference

PKC 専用 link parser / renderer は **PKC semantics 以外の URI を横取りしない**:

### 12.1 PKC が解釈する scheme(only these)

- `entry:` — internal entry reference(`src/features/entry-ref/entry-ref.ts`)
- `asset:` — internal asset reference(`docs/development/completed/asset-reference-resolution.md`)
- `pkc://` — Portable PKC Reference(§5.5)
- `<base>#pkc?...` — External Permalink(§4)、ただし PKC 解釈は `#pkc?` で始まる fragment のみ

### 12.2 PKC が横取りしない scheme(通常 link として残す)

以下は markdown renderer の link_open / paste handler / URL parser の **どれにも横取りされない**:

- `https:` / `http:` / `ftp:` — 通常 web URL(`#pkc?...` を持つ場合のみ External Permalink として扱い、それ以外は通常 web link)
- `file:` — 通常 file URL(同上)
- `mailto:` / `tel:` — 通信系
- `ms-word:` / `ms-excel:` / `ms-powerpoint:` / `ms-visio:` / `ms-access:` / `ms-project:` / `ms-publisher:` / `ms-officeapp:` / `ms-spd:` / `ms-infopath:` / `onenote:` — Microsoft Office URI scheme(`SAFE_OFFICE_URI_RE` で既に許可)
- `obsidian:` / `vscode:` / その他 syntactically valid な未知 scheme — 通常 link として残す(クリック時の挙動は OS / browser 任せ)

### 12.3 判定の優先順位

paste handler / link renderer は次の順で判定:

1. `entry:` / `asset:` → internal reference 経路
2. `pkc://` → Portable PKC Reference 経路
3. `<base>#pkc?...`(host URL に PKC 専用 fragment が付いた形) → External Permalink 経路
4. それ以外 → **通常 link として通過**(横取り禁止)

### 12.4 Unknown but syntactically valid URI

- markdown 内 `[label](obsidian://...)` のような未知 scheme は、PKC parser が **何もしない**
- markdown-it の SAFE_URL_RE allowlist に **入れない限り**、anchor 化されない(初版で `pkc:` を allowlist に追加したのと同じ判断を、未知 scheme に拡張しない)
- 既存の `mailto:` / `tel:` / `ftp:` 等は SAFE_URL_RE で既に anchor 化される。本訂正では allowlist は **`pkc:` を含めた現状維持**

---

## 関連

- textlog 側 link 設計: `../development/textlog-viewer-and-linkability-redesign.md`(§4.5 / §6.5 が既存 `entry:` grammar の根拠)
- asset resolver: `../development/asset-reference-resolution.md`(`asset:` 既存契約)
- autocomplete: `../development/asset-autocomplete-foundation.md`
- 内部 link 挿入 UX: `./attach-while-editing-insert-internal-link-v1-minimum-scope.md` / `./attach-while-editing-insert-internal-link-v1-behavior-contract.md`
- link index entry(Category C-3): `./link-index-v1-minimum-scope.md` / `./link-index-v1-behavior-contract.md`
- 隣接 foundation(Tag 側): `./tag-data-model-v1-minimum-scope.md`
- 検索軸との責務分離: `./search-filter-semantics-v1.md`(link は検索軸ではない、§3.2 parallel)
- UI 語彙(「関連」/「被参照」/「参照」): `../development/ui-vocabulary-tag-color-relation.md`

---

**Status**: 実装済み(v2.1.1 時点で Copy / Paste / Render / Receive の各層が稼働中、3 層用語 External Permalink / Portable PKC Reference / Internal Reference は spec・src・UI・manual で統一)。本書は **PKC Link Unification の canonical reference** として保持する。実装履歴は `../development/INDEX.md` #140-#162 / `../release/CHANGELOG_v2.1.0.md` §Link system + `../release/CHANGELOG_v2.1.1.md` を参照。`@[card](...)` は Card Slice 1-4 で parser + renderer placeholder + click wiring まで実装済み(widget 本体は Slice 5+ 想定、`card-embed-presentation-v0.md` 参照)、clickable-image `[![alt](url)](url)` は §5.7.5 で **canonical 5 form / partial 2 form / future v2 1 form / invalid 1 form** に整理済み(2026-04-25 spec alignment、`../development/clickable-image-v2-decision-audit.md` を canonical reference として参照)、`schema_version` は 1 のまま不変。
