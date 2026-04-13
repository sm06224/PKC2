# Embedded preview & cycle guard (補助 spec 2)

親 spec: `entry-transformation-and-embedded-preview.md` の Slice 2 / Slice 3
の詳細。

**本 doc の責任**: embed / link の意味論、TEXT / TEXTLOG / TODO の埋め込み
範囲、TODO / FOLDER description markdown 化との接続、cycle guard、self-embed、
depth limit、placeholder policy、TOC / export / selected-only HTML clone
への影響を確定させる。

**本 doc は新規 pipeline を作らない**。既存 `src/adapter/ui/transclusion.ts`
(slice 5-B で導入) を surface 拡張する。

## 1. link と embed の意味論

| 形式                       | 意味  | 描画                           | navigation                |
|----------------------------|-------|--------------------------------|---------------------------|
| `[label](entry:<lid>)`     | link  | 下線付きリンク                 | クリックで対象 entry に遷移 |
| `![alt](entry:<lid>)`      | embed | 対象 entry の render 結果を展開 | 展開先の内部 link は通常通り |

- link: 軽量、「これを参照してね」の指さし
- embed: 重量、対象 entry の中身を取り込む。preview / transclusion / 引用

両者は 1 つの URL scheme (`entry:`) を共有し、markdown 構文 (link vs image)
で分岐する。本 spec はこの二分法を維持する。

## 2. embed 対象 archetype

### 2.1 現状 (slice 5-B) と提案 (slice 2)

| archetype                           | 現 embed       | 提案 embed                              |
|-------------------------------------|----------------|-----------------------------------------|
| TEXT                                | ✅             | ✅ (変更なし)                           |
| TEXTLOG (全体)                      | ✅             | ✅                                      |
| TEXTLOG 単一 log (`#log/<id>`)      | ✅             | ✅                                      |
| TEXTLOG range (`#log/a..b`)         | ✅             | ✅                                      |
| TEXTLOG day (`#day/<date>`)         | ✅             | ✅                                      |
| TEXTLOG heading (`#log/<id>/<slug>`)| link fallback  | link fallback (維持)                    |
| TODO                                | link fallback  | **✅ (新規: status + date + description)** |
| FOLDER                              | link fallback  | link fallback (description markdown 化後に将来拡張) |
| attachment / form / opaque / generic | link fallback  | link fallback (維持)                    |

TODO を embed target に昇格。FOLDER は description の markdown 化 (slice 3)
が先。embed 対象化はその後。

### 2.2 embed 失敗時の link fallback

embed 非対応 archetype / 存在しない lid / cycle / self / depth 超過の
いずれも **描画しない選択を取らず**、以下のどちらかで表示する:

- 元が image 構文 (`![x](entry:y)`) なら **link** として描画
  (下線付きの `[x](entry:y)` と同等) — これが既存挙動
- 明示的に embed を試みた結果として失敗した場合は **可視 placeholder**
  (`<span class="pkc-embed-blocked">`) — 本 spec で統一

どちらを使うかは失敗理由で分岐 (セクション 4 参照)。

## 3. TODO embed の表示仕様

TODO を embed した時の DOM 構造 (案):

```html
<div class="pkc-embed pkc-embed-todo" data-pkc-embed-lid="...">
  <header class="pkc-embed-header">
    <span class="pkc-embed-archetype">TODO</span>
    <a class="pkc-embed-title" href="#entry/...">...title...</a>
  </header>
  <div class="pkc-embed-body">
    <div class="pkc-todo-status-line">
      <span class="pkc-todo-status pkc-todo-status-open">○</span>
      <span class="pkc-todo-date">2026-04-20</span>
    </div>
    <div class="pkc-todo-description pkc-md-rendered">
      <!-- markdown rendered description (slice 3 後) -->
      <!-- slice 2 時点は plain textContent -->
    </div>
  </div>
</div>
```

### 3.1 slice 2 時点 (description plain のまま)

description は `<div class="pkc-todo-description">` 直下に textContent として
挿入する。markdown 化は slice 3 で差し替え。つまり slice 2 の DOM 構造は
**slice 3 でも変わらない**。class 名と構造を先に固定しておくことで、
slice 3 は render 関数を 1 つ差し替えるだけに閉じる。

### 3.2 slice 3 後

description が `renderMarkdown()` 経由で rendered に切り替わる。description
内の `entry:<lid>` は再帰 embed の材料になる (depth ≤ 1 不変により、
embed から更に embed はせず link fallback)。

### 3.3 status / date / description の描画条件

- status: 常に表示 (open は `○`、done は `●` の 2 値)
- date: 設定されていれば表示、未設定なら行ごと省略
- description: 空文字列なら `<div>` ごと省略。空白のみも省略。
- archived = true の TODO は embed 上にラベル (`archived`) を付ける

### 3.4 embed 内部からの navigation

- header の title 部分 (`<a class="pkc-embed-title">`) は対象 TODO への
  link
- description 内の link / asset は通常の click 挙動
- description 内の embed 構文 (`![x](entry:y)`) は depth ≤ 1 不変により
  link fallback

## 4. cycle guard (一本化)

現行 `transclusion.ts` の guard は 3 層に分かれている:

1. **self-embed 遮断**: 自分自身を embed → 即 link fallback
2. **visited set による cycle 検知**: A→B→A → 即 link fallback
3. **depth ≤ 1 不変**: embed 内の embed は cycle に関係なく link fallback

本 spec でこれを公式化する。

### 4.1 不変 (inviariants)

- **depth ≤ 1 を維持する**。embed の中に embed は描かない。link fallback に
  degrade する。
- **visited set は render tree 1 本あたりに限定** (1 回の renderer 呼び出し
  内のみ)。2 本目の render で visited をリセットする。
- **cycle 検知時は可視 placeholder を残す** (silent に消さない)。

### 4.2 placeholder 文言 (統一)

全 embed 経路で同じ文言を使う:

```html
<span class="pkc-embed-blocked" data-pkc-embed-blocked-reason="cycle">
  (cyclic embed blocked: entry:&lt;lid&gt;)
</span>
```

reason の種類:

| reason    | 文言                                           | 発生条件                     |
|-----------|------------------------------------------------|------------------------------|
| `cycle`   | `(cyclic embed blocked: entry:<lid>)`          | embed ancestor chain で自分の先祖に戻った |
| `self`    | `(self embed blocked: entry:<lid>)`            | root と同じ lid を embed     |
| `missing` | `(missing entry: <lid>)`                       | 対象 lid が container に無い |
| `depth`   | `(nested embed blocked: entry:<lid>)`          | depth > 1 で ancestor でない先を embed 試行 |
| `invalid` | `(invalid entry ref: <ref>)`                   | ref が TOKEN_RE 不一致       |

`archetype` は **link fallback** に倒す (次節 4.3 参照)。embed 不能 archetype
については `a.pkc-transclusion-fallback-link` を返し、`title` 属性に
`(embed unsupported for archetype: <archetype>)` を置いて hover 時に理由が
見えるようにする。

どれも **inline `<span>`**。深い UI は持たない。CSS で `color: var(--c-muted)`
程度の控えめなスタイルを当てる。

### 4.3 link fallback vs placeholder の使い分け

失敗理由によって「link fallback」「placeholder」のどちらを出すかは:

- **link fallback** (既存挙動): user が `![x](entry:y)` を書いたが対象が
  embed 対象 archetype でない場合 (attachment / form など)。link として
  描画し、user の navigation 意図は保つ。
- **placeholder** (新規): embed 対象だが cycle / self / missing / depth で
  失敗した場合。なぜ描かなかったかを明示する。

つまり **archetype** の場合だけ link fallback、他は placeholder。

実装上は `transclusion.ts` の fallback path に reason enum を持たせて
分岐する。新規 test は各 reason を pin する。

### 4.4 build-subset 側との関係

`buildSubsetContainer` (`src/features/container/build-subset.ts`) には
独自の guard がある:

- `MAX_REF_ITERATIONS = 10_000` (:55) — 参照 walk の cycle 保険
- `MAX_ANCESTOR_DEPTH = 32` (:52) — ancestor chain の cycle 保険
- `visited` set per ancestor walk (:141-149)

これは **clone export 用の静的閉包計算**であり、transclusion の renderer 時
guard とは別物。役割分担:

- **renderer 時 guard**: 1 render で cycle を描かない (UI 用)
- **build-subset guard**: export container を閉包する時に cycle で無限ループ
  しない (data 用)

両者は独立。相互に依存させない。本 spec で renderer 時 guard を整理しても
build-subset 側は触らない (ただし scan 範囲拡張はセクション 6 参照)。

### 4.5 TODO description 内の ref scan (slice 2 で追加)

slice 3 で TODO description が markdown になると、そこに `entry:<lid>` が
現れうる。slice 2 の時点で以下を追加する:

- `src/features/entry-ref/extract-entry-refs.ts` の入力に TODO description
  を加える (caller 側で統合)
- `src/features/asset/extract-asset-refs.ts` も同様
- build-subset の walk で TODO body を parse して description 部分を scan

これにより、slice 3 で description を markdown render に切り替えた瞬間、
subset closure も clone export も「description 内の ref」を正しく追跡できる。

## 5. TODO / FOLDER description の markdown 化 (slice 3)

### 5.1 TODO description

- `todo-presenter` の viewer path で `renderMarkdown(todoBody.description)`
  に切り替える
- editor は textarea 維持 (raw markdown 文字列を編集)
- save 時は raw markdown 文字列として `TodoBody.description` に保存。
  **既存 schema 変更なし**。
- 既存 plain text は markdown として render しても意味が変わらないはず
  (heading / list 記法を意図せず含まない前提)。test で pin する。

### 5.2 FOLDER description

- `folder-presenter` の viewer path を同様に差し替え
- editor は textarea 維持
- embed 対象化は slice 3 には含めない (link は従来通り)

### 5.3 既存データ互換性

markdown 化により見た目が変わり得る文字列:

- 行頭 `#`, `##`, `###` → heading として render
- 行頭 `- `, `* ` → list として render
- `---` 単独行 → 水平線
- 行頭 `> ` → blockquote
- URL → 自動 linkify
- `*bold*` / `_italic_` → 強調

既存 plain text で上記記法を **意図せず**含むケースへの対策:

- slice 3 投入前に、開発環境で container snapshot を scan して影響エントリ
  数を見積もる (dev-only task、production migration は含まない)
- 影響が 1% 未満と判定されたら素直に markdown 化する
- 影響が大きい場合のみ、opt-in の escape option を別途検討 (v1 では無し)

### 5.4 標準 HTML エクスポートへの影響

`rendered-viewer.ts` (standalone HTML) 側の TODO / FOLDER presenter も
同じ `renderMarkdown()` を経由するように修正が必要。slice 3 と同時に入れる。

### 5.5 print への影響

TODO description markdown 化は print layout を壊さない。既存 print CSS で
text / textlog が markdown render されているため、同じ class (`pkc-md-rendered`)
で TODO description も被せるだけ。

## 6. TOC / export / selected-only HTML clone への影響

### 6.1 TOC

- **slice 2 (TODO embed)**: TOC 対象外。embed 内の heading は TOC に出さない
  (既存 textlog embed と同じ方針)
- **slice 3 (description markdown)**: TOC 対象外。description 内の heading
  は TOC に出さない
- 将来拡張: TODO / FOLDER description の heading を TOC に含める案は別 doc

### 6.2 selected-entry HTML clone export

subset closure は `extractEntryReferences()` に依存
(`src/features/container/build-subset.ts:101-116`)。

- **slice 2**: TODO body の description を scan 対象に追加。scan 関数の
  caller を拡張する
- **slice 3**: 何も追加しない (description は元々 string、slice 2 で scan 済み)

revisions は引き続き drop。relation は両端 in-subset で生存 (既存方針維持)。

### 6.3 full export / light export

- TODO description の raw markdown 文字列は container にそのまま入る (既存)
- rendered-viewer.ts 側に markdown render 適用が必要 (slice 3 と同時)

## 7. tests

### 7.1 slice 2 (embed 拡張 + cycle guard 一本化)

- `tests/adapter/transclusion-todo-embed.test.ts`
  - TODO を `![x](entry:<todo-lid>)` で embed → status / date / description
    が描画される
  - TODO の self-embed → `(self embed blocked)` placeholder
  - TODO → TEXT → TODO cycle → `(cyclic embed blocked)` placeholder
  - 存在しない TODO を embed → `(missing entry)` placeholder
  - 非対応 archetype (attachment / form / opaque) embed →
    link fallback (`title="(embed unsupported for archetype: <archetype>)"`)
  - depth 超過: embed の中の embed → `(nested embed blocked)` placeholder
  - TODO の archived フラグが embed 上に表示される
  - TODO date 未設定時に date 行が省略される
  - TODO description 空時に description ブロックが省略される
- `tests/features/container/build-subset-todo.test.ts`
  - TODO description に `entry:<lid>` が含まれると closure に target entry
    が入る
  - TODO description に `asset:<key>` が含まれると asset が closure に
    含まれる
  - TODO self 参照は closure で cycle にならない

### 7.2 slice 3 (markdown 化)

- `tests/adapter/todo-presenter-markdown.test.ts`
  - plain text description → markdown render 結果と視覚的に同等
  - description 内の `[x](entry:y)` が clickable link として描画
  - description 内の `![x](entry:y)` が embed 展開 (depth ≤ 1)
  - description 内の task list (`- [ ]`) が interactive checkbox
  - XSS: description に生 HTML が入っても escape される (markdown-it の
    `html: false` が効いている)
- `tests/adapter/folder-presenter-markdown.test.ts`
  - 同様、ただし embed は link fallback (FOLDER は embed 対象外)
  - 空 description → "Folder (no description)" placeholder 維持
- `tests/adapter/rendered-viewer-markdown.test.ts` (拡張)
  - standalone HTML でも TODO description が markdown render
  - standalone HTML でも FOLDER description が markdown render

### 7.3 共通 regression guard

- `tests/adapter/transclusion-depth-limit.test.ts` (既存に追加)
  - depth ≤ 1 不変を pin。depth 2 の embed 試行 → `(nested embed blocked)`
- `tests/adapter/transclusion-placeholder-text.test.ts` (新規)
  - 全 reason の placeholder 文言を exact match で pin

## 8. 互換性

| 変更                              | 既存 data | 既存 UI                                     | 既存 test           |
|-----------------------------------|-----------|---------------------------------------------|---------------------|
| TODO embed 追加 (slice 2)         | 影響なし  | `![](entry:<todo>)` の意味が link→embed に昇格 | 新規 test のみ    |
| placeholder 文言統一 (slice 2)    | 影響なし  | 既存 cycle fallback が link だった箇所が span | 該当 test 文字列更新 |
| TODO description markdown (slice 3) | raw 維持  | 表示が変わる可能性 (意図せず記法を含む場合)  | todo-presenter test 更新 |
| FOLDER description markdown (slice 3) | raw 維持  | 表示が変わる可能性                            | folder-presenter test 更新 |

既存 data schema は一切変更しない。raw body / description 文字列の互換性
は完全に保つ。

### 8.1 migration 要否

どの slice も migration script は不要。既存 container は slice 投入後すぐ
開ける。ただし slice 3 では「plain text として保存された文字列が markdown
として render される」視覚変化があるため、production 投入前に影響を scan
する dev task だけは必要。

## 9. 未確定事項

- TODO embed で description 全文を描くか、truncate するか (初期版は全文)
- 非対応 archetype embed の失敗を link fallback にするか placeholder に
  するか (セクション 4.3 の通り、archetype だけ link fallback、他は
  placeholder で採用)
- description 内の asset ref を同じ asset で複数回 embed する場合の最適化
  (初期版は最適化なし)
- FOLDER を embed 対象化する slice の独立性 (slice 3 に畳むか別 slice か、
  slice 3 後の実測を見て判断)
- `(cyclic embed blocked)` 等の文言を i18n 対象にするか (現状の multilingual
  spec の範囲外、本 spec では固定文言)
- depth ≤ 1 不変を user 側 opt-in で depth 2 まで許す将来案の UI
  (本 spec の範囲外)

## 10. 参照 docs

本 spec は以下と連動する:

- `docs/development/entry-transformation-and-embedded-preview.md` (親 spec)
- `docs/development/textlog-text-conversion.md` (補助 spec 1、変換結果に
  embed が現れた場合の意味論を本 spec が担保)
- `docs/development/textlog-viewer-and-linkability-redesign.md` — transclusion
  pipeline (slice 5-B) の既存 spec
- `docs/development/selected-entry-html-clone-export.md` — subset closure /
  reachability の既存 spec (セクション 6.2 で scan 範囲を拡張)
- `docs/development/markdown-phase2.md` — markdown link hardening
- `docs/development/markdown-interactive-task-lists.md` — GFM task list
  (TODO description markdown 化時の task list 互換性)
- `docs/development/asset-reference-resolution.md` — asset embed 解決
  (description 内の `asset:<key>` が既存 pipeline で解決されること)
- `docs/development/todo-view-consistency.md` — TODO 表示一貫性
  (description 描画経路変更時の影響確認)

## 11. マージ順序

slice 2 を先に入れる。slice 3 は slice 2 が安定してから追加する。
これは以下の理由による:

1. slice 2 で embed pipeline の TODO branch と cycle guard を固定する
2. slice 2 で TODO description scan を build-subset に追加する (description が
   plain のままでも、将来の markdown 化を先取りして scan 対象化しておく)
3. slice 3 では「描画経路を renderMarkdown に差し替えるだけ」で済む。
   scan / closure / embed pipeline は全て slice 2 時点で整っている

この順序を守れば、slice 3 の差分は最小化でき、test も focused に書ける。

