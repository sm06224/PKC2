# Card / Embed Presentation v0 — docs-only

## 1. Purpose / Status

**docs-only、v0、実装ゼロ**。`pkc-link-unification-v0.md` §6 / §10.1 で reservation されていた **presentation 3 mode**(link / embed / card)の最終契約を、実装に踏み込む前に 1 本の spec に集約する。

対象は以下 3 問への回答:

1. **Embed** が現在の `![alt](entry:<lid>)` / `![alt](asset:<key>)` でどこまで canonical か、TEXTLOG log fragment / 非 image asset / missing / cycle の挙動はどうなるか
2. **Card** の記法を最終的に `@[card](<target>)` に確定してよいか(他 6 候補と harbor 4 層で比較)
3. **Clickable-image**(`[![alt](url)](url)`)を card と混同しないか、migration v1 / v2 の境界はどうか

本書が固まることで、以降の **実装 slice**(markdown renderer hook / preview card widget / migration v2)が **具体的な contract** を持てる。

- **コード変更ゼロ**。本 spec は実装 slice 着手時の判断基準
- 既存 `pkc-link-unification-v0.md` §6 / §10 の記述と **矛盾しない形** で書き下す(duplicate は最小、cross-link で本書が上位版になる)
- Card / embed は依然として **未実装**。v2.1.1 Known limitations "Card / embed presentation is not implemented" は本書着地後も **そのまま維持**
- 実装は別 wave(次の新機能 wave 選定時に user + 統括役が判断)

### Status

- link presentation: **実装済み / canonical**(既存、本書は再確認のみ)
- embed presentation(`![alt](asset:<key>)` image embed): **実装済み / canonical**(既存、本書は再確認のみ)
- embed presentation(`![alt](entry:<lid>[#log/...])` transclusion): **実装済み / canonical**(既存、`adapter/ui/transclusion.ts` で稼働中)
- **card presentation**: **spec accepted、Slice 1-4(parser + renderer placeholder + click/keyboard wiring)+ Slice 5.0(minimal chrome: archetype badge + entry title + missing/cross-container/malformed 状態)実装済み**(2026-04-24 Slice 1 / 2 / 3.5、2026-04-25 Slice 4 + Slice 5.0、`src/features/link/card-presentation.ts` + `src/features/markdown/markdown-render.ts` の `pkc-card` core rule + `src/adapter/ui/action-binder.ts` の `navigate-card-ref` case + `src/features/card/widget-presenter.ts` + `src/adapter/ui/card-hydrator.ts`)。`@[card](<target>)` は renderer が placeholder span を emit し、4 つの presenter(detail / folder / todo / textlog)が `expandTransclusions` の直後に `hydrateCardPlaceholders` を呼んで widget chrome に hydrate。click / Enter / Space で対象 entry に遷移する経路は Slice 4 の `runEntryRefNavigation` に委譲(missing / cross-container / malformed は `aria-disabled="true"` + `tabindex="-1"` で safe no-op)。**target は `entry:<lid>` / `pkc://<cid>/entry/<lid>` のみ canonical**、`asset:<key>` / `pkc://<cid>/asset/<key>` は Slice-3.5 で parser reject + Slice 5.0 hydrator で defence-in-depth malformed 化(spec §5.4 / audit Option C と整合)。**excerpt(Slice 5.1)/ thumbnail(Slice 5.2)/ advanced variants(`compact` / `wide` / `timeline`、Slice 6)は未実装**
- **clickable-image**(`[![alt](url)](url)`): **future dialect reservation**(本書でも未実装方針、`clickable-image-renderer-audit.md` に詳細)

参照(先行 docs):

- `./pkc-link-unification-v0.md` — 3 層用語 / target grammar / §6 presentation modes / §10 design rationale(本書の基盤)
- `../development/link-system-audit-2026-04-24.md` — Copy / Paste / Render / Receive 棚卸し
- `../development/clickable-image-renderer-audit.md` — clickable-image の future dialect 航路図
- `./link-migration-tool-v1.md` — migration v1 contract(本書の非対象)
- `../release/CHANGELOG_v2.1.1.md` §Known limitations — Card / embed 未実装が明記されている
- `../development/INDEX.md` #140-#168 — Link wave / Color tag wave の履歴

---

## 2. Target / Presentation separation(原則の再確認)

`pkc-link-unification-v0.md` §3 / §10.2 の **target / presentation 分離原則** を本書でも軸にする。

| 概念 | 役割 | 本書の扱い |
|---|---|---|
| **Target** | "何を指すか" の識別子 | 変更しない。`entry:<lid>` / `entry:<lid>#log/<id>` / `asset:<key>` / `pkc://<cid>/...` / External Permalink は既存 grammar のまま |
| **Presentation** | "どう見せるか" の記法 | 本書で v0 確定。link / embed / card の **3 mode**(+ future clickable-image) |

**原則(本書が壊さないもの)**:

1. **target は presentation を知らない**。`entry:e1` は link にも embed にも card にもなれる
2. **presentation は target を書き換えない**。同じ `entry:e1` を link / embed / card で切り替えるとき、**target 文字列は一字も変わらない**(diff / merge / search を保つ)
3. **extract scanner は presentation 不問**。`extractEntryReferences` は presentation prefix(`[`, `![`, `@[card]`)を無視して target token のみ数える
4. **migration は target を動かす、presentation は動かさない**(migration v1 の契約、本書 §9.3)
5. **paste 変換は target だけ書き換え、presentation prefix は保持**(`pkc-link-unification-v0.md` §7.5)

**違反するとどうなるか**:

- target に presentation を埋めると(例 `[card:e1]`)、`extract scanner` が presentation を展開し直す必要が出る → scanner が分岐だらけになり壊れる
- presentation が target を書き換えると、link → card に UI で切り替えるたび diff が発生する → revision / merge が荒れる
- paste / migration / render が **同じ target に対して 3 経路独立に動く** ために、この分離は **全 pipeline の前提**

本書 §5(card)と §6(記法候補比較)で「なぜ `@[card]` か」を改めて議論するが、**判断軸は常にこの原則**。

---

## 3. Link presentation(現行 canonical)

既存の標準 markdown link、v2.1.1 時点で **完全稼働中**。本書は canonical 記法の再確認のみ。

```markdown
[Label](entry:<lid>)
[Label](entry:<lid>#log/<logId>)
[Label](entry:<lid>#day/<yyyy-mm-dd>)
[Label](entry:<lid>#log/<logId>/<slug>)
[Label](asset:<key>)
[Label](pkc://<other-cid>/entry/<lid>)          # cross-container(portable reference)
[Label](<base>#pkc?container=<cid>&entry=<lid>)  # External Permalink
```

- **label は非空必須**(CommonMark 準拠、空 label は migration scanner Candidate A が label を合成)
- 描画: inline `<a>` anchor、クリックで `navigate-entry-ref` / `navigate-asset-ref` / external URL へ
- 最軽量の presentation、本文流れに自然に埋め込める
- **新規追加ルールなし**。本書では "link 既に canonical" を pin するのみ

---

## 4. Embed presentation(現行 canonical + v0 確定)

### 4.1 記法

標準 markdown image の prefix `!` を流用:

```markdown
![Alt](asset:<key>)                       # image embed(既存 canonical)
![Alt](entry:<lid>)                       # 全体 transclusion(既存 canonical)
![Alt](entry:<lid>#log/<logId>)           # 1 log 単位 transclusion(既存 canonical)
![Alt](entry:<lid>#day/<yyyy-mm-dd>)      # 1 day 単位 transclusion(既存 canonical)
```

- **alt は空可**(既存 markdown image 準拠)。欠落時は renderer が target から補う
- target 書式は link / card と **完全に共通**(target / presentation 分離、§2)

### 4.2 現行実装の棚卸し

| form | 実装状態 | 担当 |
|---|---|---|
| `![alt](asset:<key>)` image MIME | **canonical、稼働中** | `src/features/markdown/asset-resolver.ts` pass 1 が `data:` URI に展開 → `<img>` |
| `![alt](asset:<key>)` 非 image MIME | **canonical、chip 化** | `asset-resolver.ts` pass 2 + action-binder の `#asset-` chip handler(クリックで download) |
| `![alt](entry:<lid>)` | **canonical、稼働中** | `markdown-render.ts` image rule が `<div class="pkc-transclusion-placeholder" data-pkc-embed-ref="entry:<lid>">` を emit、`adapter/ui/transclusion.ts` が post-render で展開 |
| `![alt](entry:<lid>#log/<logId>)` | **canonical、稼働中** | 同上、`transclusion.ts` 内で `parseEntryRef` が log kind を認識、対応 row のみ展開 |
| `![alt](entry:<lid>#day/<yyyy-mm-dd>)` | **canonical、稼働中** | 同上、day 単位で展開 |
| `![alt](entry:<lid>#log/<logId>/<slug>)` | **link fallback**(`transclusion.ts` の非対象 kind、link mode に縮退) | transclusion.ts §29-32 |
| `![alt](pkc://<self>/entry/<lid>)` | **未実装**(embed で portable reference を書いた場合は renderer が無視、`<img src="pkc://...">` を emit して fallback の literal anchor に落ちる) | なし |
| `![alt](pkc://<other>/entry/<lid>)` | **未実装**(cross-container embed は §9.3 placeholder 案のみ記述、実装はまだ) | なし |
| `![alt](<base>#pkc?...)` | **未実装**(embed で External Permalink を書く UX 想定なし) | なし |

### 4.3 target 別の許容

v0 で embed が canonical なのは以下の組み合わせ。

| target | embed 挙動 | notes |
|---|---|---|
| `entry:<lid>` | **canonical**(全体 transclusion、depth=1) | `transclusion.ts` で稼働 |
| `entry:<lid>#log/<logId>` | **canonical**(1 log row のみ transclusion) | row id 不一致は link fallback |
| `entry:<lid>#day/<yyyy-mm-dd>` | **canonical**(1 日分の log を transclusion) | |
| `entry:<lid>#log/<logId>/<slug>` | **link fallback**(heading anchor までの transclusion 粒度は未確定、v0 は link に縮退) | `transclusion.ts` の non-goal |
| `entry:<lid>#<legacy-logId>`(`log/` 無し) | **legacy accept + transclusion**(既存 `entry-ref.ts` が legacy kind を log と同じに解釈) | 新規 emit はしない、read 互換のみ |
| `asset:<key>`(image MIME) | **canonical**(inline `<img>`、data URI 展開) | `asset-resolver.ts` |
| `asset:<key>`(PDF 等 application/pdf) | **link / chip fallback**(embed で書かれた非 image MIME は chip 描画にフォールバック、v0 で PDF preview / media player は非対象) | 将来 slice で PDF preview を入れる余地 |
| `asset:<key>`(audio/video) | **link / chip fallback**(同上、future で `<audio>` / `<video>` embed を入れるか検討) | |
| `asset:<key>`(unknown / unsupported MIME) | **chip fallback**(download 可能、embed 自体は失敗扱いではない) | |
| `pkc://<self>/...` | **link fallback 推奨**(paste 時に `paste-conversion` が internal reference に降格するので通常は body に届かない。届いた場合は §11.3 placeholder) | |
| `pkc://<other>/...` | **cross-container placeholder**(§11.3、未実装) | |

### 4.4 depth / cycle guard

既存 `transclusion.ts` の契約を v0 で pin(変更なし):

- **depth ≤ 1**:embed 内部に別 embed があっても、2 段目以降は **link mode に縮退**
- **self-embed**(`entry:<hostLid>` を自 body に書く)→ **link fallback**、展開しない
- **循環**(`A` に `![](entry:B)`、`B` に `![](entry:A)`)→ 1 段目のみ展開、2 段目は link
- embed 内部の `id` attribute は **strip**(同一 slug 衝突を避ける、`#day-xxx` / `#log-xxx` / `id="overview"` 等)
- embed 内部の task-list checkbox は **disabled + `data-pkc-embedded="true"`**(read-only)

本書は **depth=1 / self-embed 禁止 / cycle は link 縮退** を v0 で凍結する(将来 depth≥2 を検討する場合は別 slice、本書の scope 外)。

### 4.5 missing / unresolved

`pkc-link-unification-v0.md` §9 を継承:

| 状況 | embed の fallback |
|---|---|
| missing entry | 1 行の broken box + `alt` 表示、`target` 文字列は body から消さない |
| missing asset | `alt` 表示 + broken image icon |
| textlog 行 id 不一致 | 1 行の broken box + `alt` 表示("log row not found") |
| non-textlog entry に log fragment | link mode に縮退(`entry-ref.ts` が legacy kind として認識し transclusion.ts が row を見つけられないので broken) |
| unsupported MIME | chip 化にフォールバック、embed 表示は出さない |
| renderer 未対応 kind(`heading` 等) | link mode に縮退(既存 `transclusion.ts` §29-32) |

**共通原則**: body の target 文字列は **消さない**、fallback は表示のみ、後で target が復活すれば embed も復活。

---

## 5. Card presentation(v0 で記法固定)

### 5.1 記法

```markdown
@[card](entry:<lid>)
@[card](entry:<lid>#log/<logId>)
@[card](entry:<lid>#day/<yyyy-mm-dd>)
@[card](pkc://<other>/entry/<lid>)      # cross-container は skeleton card
```

- 記法: `@` literal prefix + `[card]` + target
- `[card]` は **固定語**(`@[card:compact]` / `@[card:wide]` のような variant は §5.3 予約)
- target 記法は link / embed と **完全共通**

### 5.2 描画モデル(block-level preview widget)

- **block-level** な preview widget(title / archetype badge / excerpt / optional thumbnail / "open" CTA を含む矩形)
- クリック → `navigate-entry-ref`(同一経路)
- hover preview / popover は実装 slice で判断(本 spec では **必須化しない**)
- **embed との違い**:
  - embed = body そのものを inline 展開(readonly の "コピー")
  - card = **要約 / 概要** を block で紹介(本文流れを一度切る)
- **link との違い**:
  - link = inline anchor、本文流れに溶け込む
  - card = 本文流れを中断、視覚的に entry を前面プッシュ
- 重さの順:link(最軽量)< embed(中量)< card(重量)

### 5.3 variant(将来拡張点)

v0 では **`@[card]`(variant 無し)のみ canonical**。将来の拡張点として以下を予約:

```markdown
@[card:compact](entry:<lid>)      # タイトル + archetype のみの薄い表示
@[card:wide](entry:<lid>)         # thumbnail / excerpt / action row を含む full display
@[card:timeline](entry:<lid>#day/2026-04-24)   # 日付軸に最適化
```

- variant 拡張は **別 slice**、v0 では記法 reservation のみ
- 未知 variant(`@[card:unknown]`)を見た reader は **link mode に縮退**(`pkc-link-unification-v0.md` §9.5)
- variant は **`:` 区切り** で `card` の直後に来る(`@[card:<variant>]`)、spec v1+ で追加される variant は parser の additive 拡張で受け入れる

### 5.4 target 別の許容

| target | card 挙動 | notes |
|---|---|---|
| `entry:<lid>` | **canonical**(entry 全体の card widget) | `entry.title` + archetype badge + body の先頭抜粋 |
| `entry:<lid>#log/<logId>` | **canonical**(該当 log row の card) | row の createdAt + text snippet |
| `entry:<lid>#day/<yyyy-mm-dd>` | **canonical**(日付単位の card) | その日の log 件数 + 先頭 log snippet |
| `entry:<lid>#log/<logId>/<slug>` | **link fallback**(heading anchor は card 粒度に合わない、v0 は link に縮退) | variant 追加で拾う余地あり |
| `asset:<key>` | **❌ 非対応**(asset には card 相当の title / excerpt が無い、embed で十分) | `pkc-link-unification-v0.md` §6.4 と整合 |
| `pkc://<self>/...` | **link fallback 推奨**(paste で internal に降格) | |
| `pkc://<other>/entry/<lid>` | **skeleton card**(タイトル未解決 / container_id 表示 / "open" CTA) | §11.3 |
| `<base>#pkc?...` (External Permalink body residue) | **未対応**(body に External Permalink を書くユース想定なし、書かれた場合は外部 URL として anchor render) | `pkc-link-unification-v0.md` §11.6.2 G8 future |

---

## 6. Card notation candidate comparison

`pkc-link-unification-v0.md` §10.1 で `@[card](entry:<lid>)` が採用候補として議論されていたが、本書では **7 候補を harbor 4 層で比較** して最終確定する。

### 6.1 候補 7 案

| # | 記法 | 例 |
|---|---|---|
| 1 | **`@[card](<target>)`** (prefix + fixed label) | `@[card](entry:e1)` |
| 2 | **`@[card:<variant>](<target>)`** (prefix + variant) | `@[card:compact](entry:e1)` |
| 3 | **`[Label](<target> "card")`** (title abuse) | `[Entry](entry:e1 "card")` |
| 4 | **`[card:Label](<target>)`** (label prefix) | `[card:Entry](entry:e1)` |
| 5 | **HTML comment / directive** | `<!-- card:entry:e1 -->` / `:::card\nentry:e1\n:::` |
| 6 | **独自 fenced block** | ` ```card\nentry:e1\n``` ` |
| 7 | **Card 不採用**(link / embed だけで運用) | — |

### 6.2 比較軸

8 軸で各候補を評価:

| 軸 | 説明 |
|---|---|
| a | **markdown-it 素 token 化**(prefix / fenced block として認識されるか) |
| b | **CommonMark / 外部 reader での見え方**(GitHub / VS Code / Obsidian 等の reader で literal 化するか破綻しないか) |
| c | **入港(入ってくる paste / import で壊れない)** |
| d | **定泊(PKC 内 renderer で rich card widget に解決できる)** |
| e | **出港(PKC 外に body を持ち出しても意味の一部が残る)** |
| f | **座礁回避(未対応 reader で literal text として漏れない、`<p>` に包まれる)** |
| g | **既存 link / embed と誤認されないか**(grammar overlap / scanner 衝突) |
| h | **variant 拡張容易性**(`:compact` / `:wide` / `:timeline` 等) |

### 6.3 候補別 harbor 評価

| # | 記法 | a tokenize | b 外部 reader | c 入港 | d 定泊 | e 出港 | f 座礁回避 | g grammar 衝突 | h variant |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `@[card](<target>)` | `@` literal + `<a>` | `@card` + link text | ✅ | ✅(renderer hook) | ✅(link として意味保持) | ✅(`<p>@<a>…</a></p>`) | ✅ 無し | ✅ `@[card:v]` で additive |
| 2 | `@[card:<variant>](<target>)` | 1 と同じ、variant 字列が label に入る | `@card:compact` + link | ✅ | ✅ | ✅ | ✅ | ✅ 無し | ✅ native |
| 3 | `[Label](<target> "card")` | 通常 link、title が `"card"` | 通常 link、tooltip に "card" | ✅ | ⚠️(title 属性を presentation hint にする abuse) | ⚠️(外部では tooltip のみ) | ✅ | ❌ title は既存 markdown 用途と衝突、tooltip 表示ずれ | ❌ variant は title 文字列の parse が必要 |
| 4 | `[card:Label](<target>)` | 通常 link、label に `card:` を含む | "card:Label" が label に見える | ✅ | ⚠️(label から presentation を推定するのは migration scanner §10.1 で不採用確定済み) | ❌(外部で "card:Entry" という謎文字列) | ✅ | ❌ 既存 `[card:Entry]` を card と誤認するユース | ❌ variant 文字列が label と重なる |
| 5 | HTML comment / `:::card` directive | `:::` は CommonMark 外、markdown-it は未対応 | ❌ 外部 reader で literal `:::card\n...\n:::` | ❌(外部 paste で block が literal 文字列に) | ⚠️(カスタム parser 必要、実装重い) | ❌(外部では意味完全喪失) | ⚠️(literal text 表示、壊れない) | ✅ | ⚠️ variant は directive arg で表現 |
| 6 | ` ```card\nentry:e1\n``` ` | code fence、markdown-it は code block として扱う | `<pre><code class="language-card">` | ❌(外部で code block として見える、誤認) | ⚠️(fence 名で hook、実装重い) | ⚠️(外部 reader では `entry:e1` という code block が見える、誤解を招く) | ✅(code block なので壊れない) | ❌ 既存の csv/tsv fence と同じ拡張経路で実装コスト | ⚠️ fence info 文字列で variant |
| 7 | Card 不採用 | — | — | — | — | — | — | — | Card 機能自体を持たない |

### 6.4 採用判断

**採用: 候補 1 `@[card](<target>)` + 候補 2 の variant 予約**。

理由:

1. **harbor 4 層で唯一全 ✅**(入港 / 定泊 / 出港 / 座礁回避)
2. **target / presentation 分離原則に従う**(target 部 `entry:<lid>` は link / embed と同一、presentation prefix `@[card]` だけが差し替わる、§2)
3. **既存 markdown grammar と衝突しない**(`@` literal + `[...]` link、markdown-it 標準 tokenize で "正常に" 壊れた形 = `<p>@<a>…</a></p>`)
4. **旧 reader fallback が自然**(`@` literal + 通常 link として描画 → 意味の一部が残る、body が視覚的に壊れない、`pkc-link-unification-v0.md` §9.5)
5. **extract scanner が presentation 不問で動ける**(target token `entry:<lid>` は `[...]()` / `![...]()` / `@[card](...)` いずれでも同じ形で出現、scanner 1 本で済む)
6. **variant 拡張が容易**(`@[card:compact]` / `@[card:wide]`、未知 variant は link fallback)
7. **PKC2 以外の markdown editor で書いた body の paste でも破綻しない**(外部で `@[card](entry:e1)` と書いても破綻せず literal `@` + link、PKC に paste されれば renderer hook で card に変換)

**不採用理由の要点**:

- 候補 3(title abuse):title 属性を presentation hint に乗っ取るため、既存 tooltip UX と衝突
- 候補 4(`[card:Label]`):`pkc-link-unification-v0.md` §10.1 + Link migration Harbor audit で既に不採用確定(label と presentation を同じ token に詰め込む)
- 候補 5(HTML comment / directive):CommonMark 外、外部 reader で literal block 漏れ、入港・出港ともに破綻
- 候補 6(fenced block):code block として外部 reader で表示される、誤解を招く
- 候補 7(Card 不採用):Link migration Harbor audit + `pkc-link-unification-v0.md` §6.3 で既に「preview card は user 要望として浮いている」と言及、放棄は本書の目的から外れる

**採用の含意**:

- markdown renderer に **`@[card](...)`** を認識する hook を入れる実装が必要(Slice 2、§12)
- hook は markdown-it plugin もしくは post-tokenize transformer で書ける(`@[xxx](url)` は prefix 付き link の generic pattern として parser 拡張可能)
- **fallback 挙動**(hook 未実装 reader / 古い PKC runtime)は既存 markdown 通りに `<p>@<a href="entry:e1">card</a></p>` → literal `@` + link として視覚的に壊れない
- variant 拡張は additive、v0 では **variant 無し** の canonical のみ confirm

---

## 7. Clickable-image との関係(別物)

### 7.1 標準 Markdown の clickable-image

```markdown
[![alt](<image-url>)](<link-url>)
```

- markdown-it が **`<a><img></a>` nested** に tokenize する標準 CommonMark 形
- GitHub README のバッジ(`[![Build](ci-badge.png)](ci.html)`)等で普及
- link と embed を **1 行に同時** 使う presentation

### 7.2 Card とは別物

**clickable-image ≠ card**。意味 / 用途 / 記法すべて違う:

| 観点 | Card | Clickable-image |
|---|---|---|
| 主眼 | entry / log の **preview widget**(タイトル + 抜粋 + badge) | **画像表示 + クリックで移動** の複合 |
| 記法 | `@[card](<target>)` | `[![alt](<image-url>)](<link-url>)` |
| 粒度 | block level | inline(`<img>` は inline 要素) |
| 参照 target | 1 つ(entry / log / day) | **2 つ**(image source + click destination、通常は同じ URL を 2 回書く) |
| PKC 方言度 | **PKC 専用**(旧 reader は `@` + link に縮退) | **標準 CommonMark**(どの markdown reader でも `<a><img></a>` にネスト) |
| 実装状態 | 本書で spec 確定、実装未着手 | **v0 では renderer 非対応**(clickable-image-renderer-audit.md §11.2) |
| 本書での位置づけ | **canonical**(v0 で spec 確定) | **future dialect reservation**(別 slice) |

**同時採用する**:card も clickable-image も、**それぞれ別の presentation として v2 以降に実装される余地** がある。card は "entry の preview"、clickable-image は "画像に click 動作"、重ならない。

### 7.3 v0 での扱い

- **本書の責務は card 側**。clickable-image の正本整理は `pkc-link-unification-v0.md` §5.7.5(2026-04-25 spec alignment 着地済み)に集約、根拠 audit は `../development/clickable-image-v2-decision-audit.md`(#180、PR #141)
- clickable-image は §5.7.5 で **4 区分**(canonical 5 form / partial 2 form / future v2 1 form / invalid 1 form)に整理済み: canonical 5 form は現 main で完全動作、`[![alt](asset:<key>)](asset:<key>)` のみが future v2(SAFE_URL_RE + asset-resolver + action-binder の 3 点同時 land が必要条件)、`[![]](<target>)` は invalid / do-not-emit
- migration scanner v1 は **clickable-image を生成も検出もしない**(既存契約、`link-migration-tool-v1.md` §14.1)
- **card と clickable-image は引き続き独立**、相互影響なし(card は entry preview の block presentation、clickable-image は image + click 動作の link variant)

**user 誤読防止**:
- card 実装を依頼された時に、誤って clickable-image `[![alt](url)](url)` を採用しないこと
- `@[card]` hook の PR と clickable-image renderer の PR は **別物**、両者は並行可能だが混ぜない

---

## 8. Target × Presentation 許容表(決定版)

`pkc-link-unification-v0.md` §6.4 の表を、本書 v0 の粒度で拡張。**凡例**: ✅ supported now / ⏭ future slice / ❌ invalid or not supported / ⚠️ fallback に縮退 / 🚫 do-not-emit。

| Target | link | embed | card | clickable-image |
|---|---|---|---|---|
| `entry:<lid>` | ✅ canonical | ✅ canonical(全体 transclusion) | ✅ canonical(v0 本書で確定) | ⏭ future(renderer audit) |
| `entry:<lid>#log/<logId>` | ✅ canonical | ✅ canonical(1 log transclusion) | ✅ canonical | ⏭ future |
| `entry:<lid>#day/<yyyy-mm-dd>` | ✅ canonical | ✅ canonical(1 day transclusion) | ✅ canonical | ⏭ future |
| `entry:<lid>#log/<logId>/<slug>` | ✅ canonical | ⚠️ link fallback(heading 粒度未対応) | ⚠️ link fallback | ⏭ future |
| `entry:<lid>#<legacy-logId>`(`log/` 無し) | ✅ legacy accept | ✅ legacy accept(log と同じに解釈) | ✅ legacy accept | ⏭ future |
| `asset:<image-key>` | ✅ canonical(chip or inline) | ✅ canonical(inline `<img>`) | ❌ 非対応(title / excerpt 無し) | ⏭ future(renderer audit) |
| `asset:<non-image-key>` (PDF / audio / video / unknown) | ✅ canonical(chip) | ⚠️ chip fallback(v0 は embed 不可) | ❌ 非対応 | ⏭ future |
| `pkc://<self>/entry/<lid>` | ✅ canonical(paste で降格が通常、body に残った場合は fallback として navigate) | ⚠️ 未実装(paste 時に降格、届いた場合 placeholder) | ⚠️ 未実装(paste で降格、届いた場合 link fallback) | ⏭ future |
| `pkc://<self>/asset/<key>` | ✅ canonical(navigate-asset-ref fallback) | ⚠️ 未実装 | ❌ 非対応(asset) | ⏭ future |
| `pkc://<other>/entry/<lid>` | ✅ placeholder badge(cross-container) | ⚠️ cross-container placeholder(未実装、§11.3) | ⚠️ skeleton card(未実装、§11.3) | ⏭ future |
| `pkc://<other>/asset/<key>` | ✅ placeholder badge | ⚠️ 未実装 | ❌ 非対応 | ⏭ future |
| `<base>#pkc?container=<cid>&entry=<lid>` (External Permalink) | ✅(body に残った場合は外部 anchor として render、boot 時は receive) | 🚫(body 内に embed 書く想定無し) | 🚫(body 内に card 書く想定無し) | 🚫 |
| `<base>#pkc?container=<cid>&asset=<key>` | ✅(同上) | 🚫 | 🚫 | 🚫 |

**key takeaways**:

- **card が canonical になるのは `entry:` 系のみ**。asset には card を持たせない(§5.4)
- **embed の未対応組み合わせは link fallback に縮退**(target 文字列は body に残る、§4.5)
- **cross-container の embed / card は placeholder 形**(§11.3、実装は future slice)
- **External Permalink は body に書かれる想定なし**(paste-conversion が同 container なら internal 降格、cross-container は portable reference へ降格)
- clickable-image は **全 target で future**(本書の主体ではない、`clickable-image-renderer-audit.md` 参照)

---

## 9. Paste / Copy / Migration との関係

### 9.1 Copy 主導線は External Permalink のまま

- Copy link ボタン(entry meta pane / attachment / TEXTLOG log)は **External Permalink** を emit(`pkc-link-unification-v0.md` §4、既存動作不変)
- Card / embed は **Copy 導線から自動生成しない**(user が markdown source / editor で presentation を選ぶ)
- 本 spec が着地しても Copy 導線は **変わらない**

### 9.2 Paste は target を書き換えるだけ、presentation は保持

`pkc-link-unification-v0.md` §7.5 の rule を継承:

```
# in:  [foo](pkc://<self>/entry/lid_a)
# out: [foo](entry:lid_a)                 (link 保持、target 降格)

# in:  ![pic](pkc://<self>/asset/ast-001)
# out: ![pic](asset:ast-001)              (embed 保持、target 降格)

# in:  @[card](pkc://<self>/entry/lid_a)
# out: @[card](entry:lid_a)               (card 保持、target 降格)

# in:  @[card](pkc://<other>/entry/lid_a)
# out: @[card](pkc://<other>/entry/lid_a) (cross-container は portable 維持)
```

- **presentation prefix (`[`, `![`, `@[card]`) は保持**
- target 部のみ降格(same-container なら internal reference へ)
- cross-container は permalink 維持 → renderer 側で cross-container placeholder
- paste-conversion 実装は `src/features/link/paste-conversion.ts` を拡張して `@[card]` prefix 対応を入れる(Slice 3、§12)

### 9.3 Migration tool v1 は card / embed を触らない

- v1 scanner(`link-migration-tool-v1.md`)の responsibilities は **target 正規化** のみ:
  - Candidate A: 空 label link
  - Candidate B: legacy log fragment
  - Candidate C: same-container portable reference の降格
- **presentation の migration は v1 scope 外**(本書 §13、Known limitations にも維持)
- v1 は `@[card](...)` を **触らない**(scanner が prefix を認識しないので自然に対象外)
- v1 は `![alt](entry:...)` / `![alt](asset:...)` を **触らない**(image form は scanner が Candidate 対象外)

### 9.4 Migration v2 の候補(本 spec 対象外)

本書は v1 との **境界** を明確にするため、v2 で扱いうる candidate を **予約のみ**(実装しない):

| v2 candidate | 目的 |
|---|---|
| `[label](entry:<lid>)` に user 明示 flag があったとき → `@[card](entry:<lid>)` に格上げ | link → card の opt-in 昇格 |
| `![alt](entry:<lid>)` を `@[card](entry:<lid>)` に格上げ | embed → card(preview 寄り UX) |
| `[![alt](<target>)](<target>)` clickable-image の昇格 | future dialect、clickable-image renderer landing 後 |
| body 内に残った `<base>#pkc?...` External Permalink を context に応じ internal reference / placeholder に整理 | body residue rendering(`link-system-audit-2026-04-24.md` G8) |

いずれも **v2 で user opt-in 前提**、自動変換はしない(`link-migration-tool-v1.md` §14 の harbor 原則を継承)。

---

## 10. Export / Import / external reader での振る舞い

### 10.1 Harbor 4 層評価

PKC は閉じた Markdown 島ではなく整備された港。body に入る各 presentation を 4 層で評価:

| presentation | 入港 | 定泊 | 出港 | 座礁回避 |
|---|---|---|---|---|
| **link** `[Label](entry:e1)` | ✅ paste demote で internal 化 | ✅ 現行 navigate-entry-ref で稼働 | ✅ 外部で anchor + label 見える | ✅ `entry:` は validateLink 通過 |
| **embed** `![alt](asset:k)` | ✅ paste demote | ✅ data URI 展開で `<img>` | △ 外部で broken image + alt 見える | ✅ data URI は SAFE_DATA_IMG_RE 通過 |
| **embed** `![alt](entry:e1)` | ✅ paste demote | ✅ transclusion 展開 | △ 外部で broken image、alt 見える | ✅ `entry:` validateLink 通過 |
| **card** `@[card](entry:e1)` | ✅ paste demote(§9.2) | ⚠️ renderer hook 未実装、link fallback | ✅ 外部で `@` literal + 普通 link | ✅ 既存 markdown grammar のみ |
| **clickable-image** `[![alt](asset:k)](asset:k)` | ⚠️ paste で触らない(migration v1 範囲外) | ❌ `SAFE_URL_RE` に asset: 無し → 外側 link reject、literal 漏れ | ✅ 外部で `<a><img></a>` nested で表示 | ❌(renderer allowlist 未対応で literal 漏れ) |

**card の harbor 評価サマリ**:
- 入港 ✅:外部 markdown editor で `@[card](entry:e1)` を書いて PKC に paste しても破綻しない(同 container なら target 降格、cross-container なら portable 維持)
- 定泊 ⚠️:現状 renderer hook 未実装 → link fallback。実装 slice(Slice 2、§12)で ✅ 化
- 出港 ✅:外部 reader では `@` literal + `[card](entry:e1)` 通常 link として描画、意味の一部が保持される(target 文字列 + label `card`)
- 座礁回避 ✅:markdown-it の標準 tokenize で `<p>@<a>…</a></p>`、body が視覚的に壊れない

### 10.2 PKC 内 render

- link / embed は **既に稼働中**(本書で変更なし)
- card は **実装 slice 着地後に稼働**(本書は spec、実装は §12 Slice 2)
- hook 実装までの間、body に `@[card](...)` を書いても **link fallback で描画**(`@` literal + link、壊れない)
- cross-container / missing は §11 の placeholder に従う

### 10.3 外部 Markdown reader(旧 reader fallback)

PKC 外の markdown reader(GitHub / Obsidian / VS Code / dillinger 等)で body を開いた場合:

| presentation | 外部描画 | 意味の保持 |
|---|---|---|
| link `[Label](entry:e1)` | `<a href="entry:e1">Label</a>` — scheme 未対応で click 無効だが anchor + label は見える | ✅ label / target 両方 |
| link `[Label](<base>#pkc?…)`(External Permalink) | `<a href="…#pkc?…">Label</a>` — 通常 URL なのでクリック可、戻って来れる | ✅ label / target 両方 + 動作 |
| embed `![alt](asset:k)` | `<img src="asset:k" alt="alt">` — broken image だが alt 見える | △ alt / target |
| embed `![alt](entry:e1)` | 同上 | △ alt / target |
| **card** `@[card](entry:e1)` | **`<p>@<a href="entry:e1">card</a></p>`** — `@` literal + label が "card" の通常 link | ⚠️ target / `"card"` literal / click 不可(scheme 未対応) |
| clickable-image `[![alt](img)](url)` | `<a href="url"><img src="img"></a>` — nested 構造は標準 Markdown 準拠 | ✅ 最強、全要素保持 |

**card の旧 reader fallback**:外部で `@card` + link に見えるのは **許容**(完全な rich widget は PKC 専用、外部では "このリンクは card presentation として書かれた" と視覚的に読める程度に留まる)。literal 漏れは起きない。

### 10.4 File Tree Interchange future との整合

`docs/development/import-export-surface-audit.md` §9 の File Tree Interchange(`.pkc2-tree.zip`、人間可読 folder tree + `_pkc_manifest.json`)との関係:

- **body の markdown は `.md` ファイルとして export される**
- card / embed / link いずれも **target は `entry:<lid>` / `asset:<key>` のまま保持**(body 文字列そのまま)
- File Tree Interchange で export する時は `entry:<lid>` → `./<relative-path>.md` の relative link rewrite が走る(§9.3 予約)
- **`@[card](./<relative>.md)` になっても card 記法は保持**(renderer hook 側で `@[card]` prefix を検出、target を rewrite してから展開)
- 逆変換(Import round-trip)は relative path を `entry:<lid>` に戻す → card 記法はそのまま

**本書は File Tree Interchange の spec に干渉しない**(target rewrite 層と presentation 層が独立しているため)。

### 10.5 export / import / revision round-trip

- **HTML export / ZIP export / sister bundle**:body 文字列を **そのまま保持**、card prefix も保持
- **revision snapshot**:`entry.body` に card 記法が含まれていれば snapshot に保存、restore で復活
- **旧 revision の body に card 記法が無い**:普通に link / embed だけで描画、問題なし
- **旧 runtime(v2.1.1 以前)で body を開く**:card prefix は link fallback(§10.3)、壊れない
- schema_version bump なし(body 文字列 grammar の additive 拡張のみ)

---

## 11. Missing target / unresolved handling

`pkc-link-unification-v0.md` §9 を継承しつつ、本書で **embed / card の fallback を具体化**。

### 11.1 missing entry

`entry:<lid>` で `lid` が `container.entries[]` に存在しない場合:

| presentation | fallback |
|---|---|
| link | broken ref placeholder(label 灰色 + 取り消し線 or `[missing entry]` バッジ) |
| embed | 1 行の broken box + `alt` 表示(既存 transclusion.ts 挙動) |
| card | **broken skeleton card**(「削除されたか、未同期の entry」+ target 文字列表示) |

`target` 文字列は **body から消さない**(後で entry が復活したら復活)。

### 11.2 missing asset

`asset:<key>` で `key` が `container.assets{}` に無い場合:

| presentation | fallback |
|---|---|
| link | broken ref placeholder(label + broken marker) |
| embed(image MIME) | `alt` 表示 + broken image icon |
| embed(非 image MIME) | chip fallback にフォールバック、missing 表記 |
| card | (asset に card は非対応、§5.4)→ この組合せは spec 違反、renderer は link fallback |

### 11.3 cross-container unresolved

`pkc://<other>/...` を PKC が自 container で解決できない場合(= 同 container ではない時点で常に unresolved):

| presentation | fallback |
|---|---|
| link | **inline badge + label**(🌐 external icon + label 文字列) |
| embed(entry) | **cross-container placeholder box**(「この参照は別 container のものです」+ permalink 文字列表示) |
| embed(asset) | 同上 |
| card(entry) | **skeleton card**(タイトル未解決 / container_id 表示 / "open" CTA、クリックで navigation は §11.5 per future slice) |
| card(asset) | (asset に card 非対応)→ link fallback |

cross-container navigation の UX(どの window に開くか / P2P 経由で fetch するか等)は **実装 slice で決める**(`pkc-link-unification-v0.md` §8.4 と整合)。本 spec は **grammar と fallback 描画のみ** を固定。

### 11.4 unsupported MIME

`asset:<key>` の MIME が image でも PDF でも audio でもない場合:

- embed: **chip fallback**(download 可能、`<img>` / `<video>` / `<audio>` は emit しない)
- link: chip(既存挙動、`asset-resolver.ts` pass 2)
- card: 非対応(asset に card 無し)

### 11.5 renderer 未実装の presentation(旧 reader / 旧 runtime)

- **旧 PKC runtime**(v2.1.1 以前)で body に `@[card](...)` を含む container を開く場合:
  - markdown renderer は card prefix を認識せず、**`<p>@<a>...</a></p>`** の link fallback(§10.3)
  - body の視覚的破壊なし、target `entry:<lid>` は通常 link として navigate 動作(既存 navigate-entry-ref)
- **外部 Markdown reader**(GitHub / Obsidian / VS Code 等)で body を開く場合:
  - 同上、link fallback で表示される
  - `<script>` 類似の干渉は発生しない(`@[card]` は `@` literal + 標準 markdown link)
- **未知 variant**(`@[card:unknown]`):
  - v0 renderer 実装が未知 variant を見たら **link fallback**(`pkc-link-unification-v0.md` §9.5)
  - body 文字列は保持、復活時に未知 variant が canonical になれば card 描画に戻る

### 11.6 循環 / self-reference

embed mode と同じく、card にも循環制約を想定:

- **self-reference**(`A` の body に `@[card](entry:A)`):
  - link fallback に縮退、card widget は表示しない(無限再帰 / 意味ループ回避)
- **循環**(`A` に `@[card](entry:B)`、`B` に `@[card](entry:A)`):
  - card 同士の循環は、card widget が "entry preview" であり depth≥2 展開を想定していないため **自然に止まる**(card 内部に別 card を展開する UX は v0 で定義しない)
  - 実装 slice で "card が展開する preview 内に link / embed / card が現れた時の挙動" を決める(既存 embed の depth=1 guard と同じ idiom)

---

## 12. 実装 slice 提案(本 PR では実装しない)

本書を基に実装に進む場合の推奨分割。**本 PR では一切着手しない**、user + 統括役の判断で個別 PR に落ちる。

### Slice 1 — `@[card](<target>)` markdown tokenization(features 層、最小)

- `src/features/markdown/markdown-render.ts` に `@[card](...)` を認識する hook 追加
- markdown-it plugin / post-tokenize transformer で `@` prefix + `[card]`(optional `:variant`) + `(target)` を検出
- 検出時は **`<div class="pkc-card-placeholder" data-pkc-card-target="<target>" data-pkc-card-variant="<v>">` inert placeholder** を emit(既存 transclusion placeholder と同型)
- 検出失敗 / hook 無効時は markdown-it 標準の link として `<p>@<a>card</a></p>` を emit(§10.3 の既存 fallback 継承)
- **tests**: tokenization pin(placeholder 生成 / variant / fallback / escape / embed との衝突)
- 実装は **placeholder 生成まで**、card widget 本体は Slice 2

### Slice 2 — Card widget renderer(adapter 層、中規模)

- `src/adapter/ui/card-expander.ts`(新規、`transclusion.ts` と同型)で placeholder を walk → card widget に置換
- card widget DOM 構造:
  - `<article class="pkc-card" data-pkc-card-target="<target>" data-pkc-card-variant="<v>">`
  - header:entry title + archetype badge + target 文字列(読み取り専用)
  - body:excerpt(先頭 2-3 行、markdown strip)or log snippet(log fragment 時)
  - footer:"Open" CTA(クリック → navigate-entry-ref)
- CSS 最小(`pkc-card` / `pkc-card-header` / `pkc-card-body` / `pkc-card-open-cta`)
- **missing / cross-container / self-reference / unresolved** の §11 fallback を実装
- **tests**: happy-dom で placeholder 展開、fallback 6 種(missing entry / missing asset / cross-container / self / cycle / unresolved variant)
- renderer に sync 呼び出しを追加(`transclusion.ts` と同じ pattern、`renderer.ts` から)

### Slice 3 — Paste conversion 対応(features 層、小)

- `src/features/link/paste-conversion.ts` に `@[card]` prefix を認識させ、target を降格
- 既存 link / embed の paste conversion rule(§9.2)を再利用、prefix を pattern に追加
- **tests**: `@[card](pkc://<self>/entry/x)` → `@[card](entry:x)` の降格 / cross-container 保持 / presentation prefix の保持

### Slice 4 — Editor insertion UI(adapter 層、中)

- entry body editor / TEXTLOG editor の context menu に「Card として挿入」action を追加
- action-binder の `insert-card-ref` / 既存 `insert-entry-ref` の variant として扱う
- action-binder → 選択 entry / log の target を `@[card](entry:<lid>)` として editor に挿入
- **tests**: action-binder integration、textarea value assertion

### Slice 5 — migration v2 spec + 実装(docs-first、別 wave)

- `docs/spec/link-migration-tool-v2.md`(新規)で v2 scanner の scope を確定
- Candidate:link → card 格上げ、embed → card 格上げ、clickable-image 昇格等(§9.4)
- 全て opt-in、v1 と同型の preview + Apply all safe UX
- 実装は Slice 1-4 着地後

### Slice 6 — Manual / CHANGELOG / About 更新

- `docs/manual/05_日常操作.md` に §Card presentation 節を追加
- `docs/manual/09_トラブルシューティングと用語集.md` に用語 "Card"(カード)/ FAQ 追加
- Known limitations から "Card / embed presentation is not implemented" を削除(**embed は既に canonical なので "Card" だけの limitation に書き換える可能性もあるが、本書段階では維持**)
- version bump は Slice 2-4 landing 後に別 PR

**推奨順**: Slice 1 → 2 → 3 → 4 → 5 → 6。Slice 1 の tokenization が通らないと下流が書けない。Slice 2 の widget が固まってから editor 挿入 UI(Slice 4)を作る方が UX を確認しながら進められる。v2 migration(Slice 5)は実装が固まってから、user 要望で切る。

**想定 PR サイズ**:
- Slice 1: ~150 LOC src + ~300 LOC tests(docs-first spec の実装部分)
- Slice 2: ~400 LOC src + ~500 LOC tests(widget / fallback matrix)
- Slice 3: ~100 LOC src + ~200 LOC tests
- Slice 4: ~200 LOC src + ~300 LOC tests
- Slice 5: docs ~500 行 + src ~200 LOC + tests ~400 LOC
- Slice 6: docs ~150 行 + release rebuild

---

## 13. Status / Known limitations との整合

本書着地後の状態:

| 項目 | Status |
|---|---|
| **link presentation** | 実装済み / canonical(v2.1.1 稼働中、本書は再確認のみ) |
| **embed presentation**(image / transclusion / log / day) | 実装済み / canonical(v2.1.1 稼働中、本書は再確認のみ) |
| **card presentation** 記法(`@[card](...)`) | **spec accepted**(本書で固定)、**Slice 1 parser helper + Slice 2 renderer placeholder + Slice 3.5 parser asset narrow + Slice 4 click / keyboard wiring 実装済み**(Slice 4 着地: 2026-04-25、`src/adapter/ui/action-binder.ts` の `navigate-card-ref` case + `runEntryRefNavigation` 共有 helper + `resolveCardClickToEntryRef`)。click は既存 `entry:` link と同じ routing(entry / log / day / heading / range / legacy)に委譲、Enter / Space で keyboard 起動可、focus-visible outline のみ最小 CSS。**cross-container `pkc://<other>/entry/<lid>` は silent no-op**(Portable Reference badge と同等、cross-container resolver 着地まで)。canonical target は `entry:<lid>` / `pkc://<cid>/entry/<lid>` のみ、`asset:<key>` / `pkc://<cid>/asset/<key>` は v0 future dialect(parser reject + click resolver でも防衛)。**widget UI / thumbnail / excerpt は未実装**(Slice 5 以降) |
| card variant(`@[card:compact]` 等) | spec reservation(v0 では variant 無しのみ canonical)。Slice 1 parser は `compact` / `wide` / `timeline` の 3 variant を syntax レベルで受理、Slice 2 renderer は `data-pkc-card-variant` に値を伝達するのみ、variant 別 widget レンダリングは未実装 |
| **clickable-image** `[![alt](url)](url)` | **future dialect reservation**(本書で再確認、`clickable-image-renderer-audit.md` §11.2 の Option B 保留継続) |
| About `RELEASE_SUMMARY['2.1.1'].knownLimitations` 『Card / embed presentation is not implemented yet』 | **継続**(本書だけでは解除しない、Slice 1-2 実装着地後に再評価) |
| CHANGELOG v2.1.1 §Known limitations 同項目 | **継続** |

> **Cross-link (2026-04-24)**: asset target × card の扱いは `../development/card-asset-target-coordination-audit.md` で docs-first audit 済み。**決定: Option C(v0 future dialect demote、現状維持)**。本 §5.4 / §8 の `❌ 非対応` がそのまま契約として有効、asset-resolver / markdown-render / SAFE\_URL\_RE は Slice-2 状態(asset: 非許可)のまま据え置き。asset preview card UI は clickable-image / asset-preview wave と合わせて将来判断。

**Color tag の本書への影響**:ゼロ。Color tag は entry-level の視覚マーカーで、body 内の presentation とは **独立軸**。card widget 内に Color tag を表示するかは Slice 2(card widget renderer)の UI 判断事項。

**矛盾がないことの確認**:
- 『Card / embed presentation is not implemented yet』は **"card" が未実装の事実** を述べている。embed は既に canonical だが、Known limitation 文面は "card / embed" を 1 つの未実装項目に束ねている。本書で card の spec が固まっても、実装は依然として未着手なので文面に矛盾なし
- Slice 2 が実装着地したタイミングで、この Known limitation を "Card presentation is not implemented yet" に書き換えるか、完全削除するかを再評価(本 PR では触らない)

---

## 14. Non-goals

本書が **やらないこと**:

- **code implementation**(markdown-it plugin / card widget / placeholder expander / paste-conversion 拡張 / editor insertion UI のいずれも)
- **具体 card widget の DOM 構造 / CSS / color / layout**(Slice 2 で確定)
- **hover preview / popover の UX**(Slice 2 以降)
- **card variant の fixed list**(`compact` / `wide` / `timeline` は予約のみ、具体追加は別 slice)
- **cross-container navigation の具体 UX**(window 管理 / P2P fetch / skeleton card の resolve タイミング)
- **asset card**(asset は title / excerpt が無いため card 非対応、§5.4)
- **card に Color tag を表示する UX**(card widget renderer の実装判断、本書では触れない)
- **autocomplete / fragment completion の card 対応**(現状 link / embed で autocomplete が走る経路があるが、card 追加は Slice 4 以降)
- **clickable-image renderer support**(別 audit doc、本書で fix しない)
- **Color tag Slice 2-4**(別 chain)
- **Import / Export UI vocabulary cleanup**(別 audit)
- **migration tool v2 実装**(Slice 5、本書は v1/v2 境界の明文化のみ)
- **manual 更新**(Slice 6)
- **About / CHANGELOG 修正**(本書着地後も Known limitations は継続)
- **version bump / schema bump**(本書は docs-only)

---

## 15. References

- `./pkc-link-unification-v0.md`(§3 target/presentation 分離 / §6 presentation modes / §10.1 `@[card]` 採用根拠 / §10.2 分離の理由)— **本書の基盤**
- `./link-migration-tool-v1.md`(§14 Future dialect reservations、card / clickable-image の v1 取扱い)
- `../development/link-system-audit-2026-04-24.md`(Copy / Paste / Render / Receive 棚卸し、G1-G8 gap list)
- `../development/clickable-image-renderer-audit.md`(clickable-image future、§11.2 Option B)
- `../development/import-export-surface-audit.md`(§9 File Tree Interchange future、target rewrite と presentation の独立性)
- `../release/CHANGELOG_v2.1.1.md`(§Known limitations 『Card / embed presentation is not implemented yet』)
- `../../src/features/markdown/markdown-render.ts`(既存 link_open / image rule / asset-resolver 呼び出し)
- `../../src/adapter/ui/transclusion.ts`(embed placeholder → widget 展開の既存 pattern、card widget の template)
- `../../src/features/link/paste-conversion.ts`(paste 降格 rule、Slice 3 で拡張)
- `../../src/features/link/migration-scanner.ts`(v1 scanner、card / embed を touch しない確認)

---

**Status**: accepted、Card / Embed Presentation v0 docs-only draft(2026-04-24)。link / embed / card の 3 mode を 1 本の spec に集約、card 記法を `@[card](<target>)` に最終確定、target / presentation 分離原則 + harbor 4 層評価 + 6-slice 実装計画を固定。clickable-image は別 audit doc で保留継続(本書で card と混同しないことを明示)。v2.1.1 Known limitations "Card / embed presentation is not implemented yet" は **継続**(実装未着手)。schema / version / src いずれも不変、実装は別 PR / 別 wave で着手。

