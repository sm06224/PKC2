# PKC Link Unification — v0 (docs-first foundation)

## 1. Purpose / Status

PKC2 の「参照基盤」を 1 本の spec に正本化する **docs-first / code-change-zero draft**。W1 Tag wave 着地後の次の foundation layer として、**Tag / Color / UI の上流にある**「エントリ間・資産・コンテナ横断の参照」を先に固定する。

この spec を先に置く理由:

- **Link は PKC 全体の参照基盤**。export / embed / P2P / manual / card UI / permalink 共有 すべてに波及する
- **Color は表示レイヤ**。Link が後から変われば UI は巻き込まれる、逆は成立しない
- 現状、`entry:<lid>` スキームと `asset:<key>` スキームは **コードでは動いているが正本 spec が分散**(textlog-viewer-and-linkability-redesign §4.5, asset-reference-resolution, asset-autocomplete-foundation)。**1 本に集約して契約を固定する**
- permalink(外部共有 URL)・paste 変換・presentation 分離(link / embed / card)は **まだ決まっていない** — 本 spec で確定

本 spec は **実装変更を伴わない**。既存の `entry-ref.ts` / `extract-entry-refs.ts` / markdown renderer / subset export の挙動はすべて現状維持。後続 slice が実装を追加する時の判断基準。

参照(先行 docs):

- `docs/development/textlog-viewer-and-linkability-redesign.md` §4.5, §6.5 — `entry:<lid>` 既存 grammar
- `docs/development/asset-reference-resolution.md` — `asset:<key>` 既存 resolution
- `docs/development/asset-autocomplete-foundation.md` — `asset:` 入力補完
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

## 3. Terminology — target vs presentation

この spec は **「どこを指すか」(target)** と **「どう見せるか」(presentation)** を厳密に分ける。

| 層 | 役割 | 例 |
|---|---|---|
| **Target** | 何を指すかを決める。1 つの entry / asset を指す URI | `entry:<lid>` / `entry:<lid>#log/<id>` / `asset:<key>` |
| **Presentation** | どう表示するかを決める。target に対する見せ方の記法 | `[label](entry:...)`(link) / `![alt](entry:...)`(embed) / `@[card](entry:...)` |
| **Permalink** | 外部共有用の canonical URL。container 境界を跨ぐ | `pkc://<container_id>/entry/<lid>[#<fragment>]` |

**重要な不変量**:

- 同じ target は **link でも embed でも card でも同じ URI** を持つ。presentation を変えても target 文字列は変わらない
- **presentation は記法で区別される**(§6)。target 側に `?mode=card` のような query を付けたり、`card:<lid>` のような別スキームを作ったりしない — 理由は §10.1
- **Permalink は外側の形**。**internal reference(`entry:...`/`asset:...`)は同一 container 内側の形**。cross-container では permalink のみを使う(§8)

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

## 4. Permalink grammar

### 4.1 Canonical form

```
pkc://<container_id>/entry/<lid>
pkc://<container_id>/entry/<lid>#<fragment>
pkc://<container_id>/asset/<asset_key>
```

- **scheme**: `pkc://` 固定(lowercase)
- **container_id**: `container.container_id`。`[A-Za-z0-9_-]+`(既存 schema と整合)
- **entry/asset**: path segment、固定語(lowercase)
- **lid** / **asset_key**: 既存 token 形(`[A-Za-z0-9_-]+`)
- **fragment**: `entry:<lid>#<frag>` と同じ構文(§5.2)。URL fragment として `#` の後ろに置く

### 4.2 Why `pkc://` scheme

- **host-agnostic**: PKC2 は single-HTML で配布され、host URL が固定されない。`https://example.com/#/entry/x` のような host-dependent 形だと、同じ container を別 host に置いた瞬間に permalink が無効化する
- **container_id-anchored**: `pkc://` の **authority 部が container_id** なので、permalink を受け取った側は container_id だけを見て自 container かどうか判断できる(§7.1 の paste 変換が一発で決まる)
- **既存 web URL と衝突しない**: `pkc://` は IANA 未登録だが PKC 独自 scheme として整備。browser の href としてそのまま使うと open できないが、本 spec 範囲では「shareable text」であり browser navigation は別層で handle(§8.4)

### 4.3 Host URL ラッパー(optional)

permalink を **通常の web URL として** 共有したいケース(メッセージアプリ、email)では、`pkc://` を host URL の fragment として包む形を **optional で** 認める:

```
<base_url>#pkc-ref=pkc://<container_id>/entry/<lid>
```

- `<base_url>` は PKC2 が host されている URL(`https://example.com/pkc2.html` 等)
- fragment の key は `pkc-ref=`、値は permalink canonical 形そのまま(URL-encoded)
- 展開 / 受信時は `#pkc-ref=` を剥がして canonical 形に戻す
- これにより host 経由のリンクでも container_id ベースのルーティングができる
- host URL ラッパーを使うかは **共有チャネルの都合** で決まる。data model や paste 変換は canonical 形で処理する

### 4.4 Forbidden forms

本 spec v0 では以下は **認めない**:

- `<base_url>?entry=<lid>` のような query-based 形(query を sanitize する host に弱い)
- `<base_url>/entry/<lid>` のような path-based 形(host-side routing が必要、single-HTML と噛み合わない)
- `entry://<lid>` のような scheme(container_id を持たないので cross-container paste で意味が確定しない)
- `pkc:<container_id>/...`(authority のない scheme、`pkc:text/...` のような media type と衝突する可能性)

### 4.5 Encoding

- lid / asset_key / container_id は token 形(`[A-Za-z0-9_-]+`)のため、URL encoding 不要
- fragment は `entry:<lid>#<frag>` と同じ(`log/<id>` / `day/<yyyy-mm-dd>` / `log/<id>/<slug>`)。これらも token 形のみなので encoding 不要
- 将来 fragment に空白・日本語などを入れる拡張があったときは URL encoding を導入する(本 spec 対象外)

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
- cross-container の参照は **permalink に昇格** する(§8)

### 5.5 Parser / extractor 契約(既存維持)

- `parseEntryRef(raw)` は throw しない。invalid は `{ kind: 'invalid', raw }` を返し、renderer 側で broken ref placeholder に fallback(§9.1)
- `extractEntryReferences(markdown)` は fragment の有無にかかわらず LID のみを集める。subset export の依存先解決に使用
- 本 spec v0 では上記 2 関数の挙動を **変更しない**

---

## 6. Presentation modes

Target(§5)に対して「どう見せるか」を決める **3 つの記法**。target 文字列は共通、**presentation は記法で区別**する。

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

外部からペーストされた文字列を、自 container の body に取り込む際の **変換規則**。editor / paste-handler が本 spec に従って書き換える(実装 slice)。本 spec は **規則のみ** を定義、実装は別。

### 7.1 Permalink → Internal reference(同一 container のみ)

ペーストされた文字列が permalink(§4)で、**かつ authority の `<container_id>` が自 container と一致**する場合のみ、internal reference に **降格** する:

```
# in:  pkc://<self_id>/entry/lid_a
# out: entry:lid_a

# in:  pkc://<self_id>/entry/lid_a#log/xyz
# out: entry:lid_a#log/xyz

# in:  pkc://<self_id>/asset/ast-001
# out: asset:ast-001
```

- 判定は **exact match**(case-sensitive、trim なし)
- host URL ラッパー(§4.3)で来た場合は **canonical 形に展開してから判定**

### 7.2 Permalink → Permalink(cross-container は変換しない)

```
# in:  pkc://<other_id>/entry/lid_a
# out: pkc://<other_id>/entry/lid_a  (そのまま)
```

- 自 container と異なる `container_id` の permalink は **絶対に internal reference に降格しない**。降格したら別 container の entry を自 container の lid として解釈してしまう(ID 衝突 / 意味破壊)
- permalink のまま body に入れる。描画は §8 / §9 のルールに従う

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

**Status**: docs-only、PKC Link Unification v0 foundation draft(2026-04-24)。Tag wave クローズ直後の参照基盤正本化。target(`entry:` / `asset:` / `pkc://`)と presentation(link / embed / card)を厳密に分離、paste 変換は同 container のみ permalink → internal 降格、cross-container は permalink 維持。`@[card](...)` 記法を採用(target と presentation の分離、旧 reader fallback、extract scanner 単一化のため)。`schema_version` bump なし、既存 `entry:` / `asset:` grammar は不変。Slice 1-5 を next-step として整理、実装着手前に本 spec が判断基準。
