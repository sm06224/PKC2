# TEXTLOG Viewer & Linkability Redesign

Status: CANDIDATE
Created: 2026-04-12
Category: P1. Structural Redesign

Scope note: 本ドキュメントは P1 の親仕様であり、TEXTLOG の model /
viewer / TOC / 参照 / transclusion / 出力 の 6 軸をまとめて再設計する。
補助仕様（log ID model / transclusion / viewer output actions）は
別ドキュメントに分割される予定。

---

## 1. 短い結論

TEXTLOG を「単一 Entry の body 内で addressable な時系列ドキュメント」として
再定義する。live viewer / rendered viewer / print / HTML download /
transclusion の 5 経路を、features 層の純関数 `buildTextlogDoc` が返す
共通 representation `TextlogDoc` から派生させる形に一本化する。

canonical anchor は `entry:<lid>#log/<id>` とし、派生形式として
`#log/<a>..<b>`（range）/ `#day/<yyyy-mm-dd>`（day group）を持つ。

log entry は子 Entry に昇格させず、body JSON の内部構造のまま
**DOM 上で一意に addressable になる**ことで、表層 CSS では解けなかった
「時系列・ナビゲーション・参照・埋め込み」の 4 軸を同時に解消する。

---

## 2. 背景・問題

現状の TEXTLOG は `{ entries: TextlogEntry[] }` という append-only の
flat list を body に埋め込んだ構造で、viewer / TOC / export / 参照の
すべてがこの単層モデルに乗っている。結果として次の構造破綻を抱えている：

- **時系列がドメインに無い**：日付・セッション単位の集約がデータに無く、
  描画も TOC も「append 順の flat list」以上の構造を作れない。
- **log entry が addressable でない**：log ID は生成されるが、コンテナを
  またぐ一意性が弱く（`Date.now()+counter`）、DOM 上は `data-pkc-log-id`
  属性のみで `id=` になっていない。`entry:<lid>#<logId>` の文字列は
  コピーできるが resolver が無く、クリックしても何も起こらない。
- **viewer の source of truth が曖昧**：live viewer の DOM と rendered
  viewer の `serializeTextlogAsMarkdown` 経由 HTML が別経路で、印刷結果
  と画面表示が別構造になる。
- **TOC と視覚構造がズレる**：TOC は markdown heading (h1–h3) のみを
  抽出するため、heading を書かない TEXTLOG では TOC が空になり、
  「いつ何を書いたか」を一望できない。
- **合成（transclusion）が存在しない**：TEXTLOG の一部を他のメモから
  引用する手段が、文字列レベルでも定義されていない。TEXTLOG は
  「書き込む器」にとどまり、「引用可能な資料」になっていない。
- **出力動線が不在**：viewer に Print ボタンも HTML download ボタンも
  無く、rendered viewer を開いてブラウザメニュー経由でしか印刷できない。

A-1（readability hardening）/ A-3（TOC）は flat list 前提のまま表層を
整えた改善であり、上記はそのスコープの外側に残された構造的問題である。

---

## 3. ユーザ価値

本設計が同時に提供する価値は次の 4 点：

- **日付でまとまった読める TEXTLOG**：log が day 単位にグルーピングされ、
  timestamp が本文と分離した header 上に置かれる。短いログでも長いログ
  でも「ドキュメントを読む」体験になる。
- **どのログ行にも戻れる安定リンク**：canonical anchor
  `entry:<lid>#log/<id>` で TEXTLOG 内の任意の 1 行を指せる。
  day（`#day/<yyyy-mm-dd>`）や range（`#log/<a>..<b>`）も同じ文法で
  扱える。
- **他のメモから TEXTLOG を引用できる**：`![](entry:<lid>#...)` で
  全体 / 単一ログ / 範囲 / 日 の 4 粒度を transclude 可能。過剰な
  構文は導入せず、既存の markdown embed 文法を流用する。
- **印刷と HTML ダウンロードが 1 クリック**：rendered viewer のツール
  バーに Print / Download HTML を配置。出力は live viewer と同じ
  `TextlogDoc` から派生するため、画面と印刷の構造不一致が原理的に
  起こらない。

これらは A 系 polish の延長ではなく、TEXTLOG を「時系列ドキュメント」と
して使うための基盤である。

---

## 4. 最小スコープ

次の範囲に限定する。これ以上は本 P1 では行わない。

### 4.1 データモデル

- body JSON schema は **据え置き**（`{ entries: [{ id, text, createdAt,
  flags }] }`）。
- 新規 log entry の ID を **ULID** に切替（features 層の pure 生成器、
  injectable clock）。
- 既存 ID は **そのまま保持**（rewrite しない）。resolver は新旧両方を
  opaque token として受理する。

### 4.2 共通 render representation

- features 層に `TextlogDoc` 型と `buildTextlogDoc(entry, options)` を
  新設。
- options：`order: 'asc'|'desc'` / `embedded: boolean` /
  `resolveRefs: boolean` / `idScope?: string`（将来拡張用に予約）。
- markdown → HTML 変換と asset / ref 解決は DOM 化時に行い、
  `TextlogDoc` は raw を保持する。

### 4.3 viewer DOM

- day-grouped 構造：`<section id="day-<yyyy-mm-dd>">` の内側に
  `<article id="log-<logId>">` を並べる。
- day header は **非 sticky**。
- 各 `<article>` の header に timestamp（`<time datetime>`）/ flag
  toggle / anchor copy ボタンを置く。本文は header と完全に分離。
- live viewer（`order='desc'`）と rendered viewer（`order='asc'`）は
  同じ builder 出力を採用する。append area は live viewer 専用の
  wrapper として builder 出力の外側に置く。

### 4.4 TOC

- TEXTLOG は time-driven の 3 段：L1 day / L2 log / L3 log 内
  h1–h3。
- TEXT archetype は従来どおり heading-driven（h1–h3）。
- 出力型は `TocNode` union に切替（`day` / `log` / `heading` の
  3 種）。
- 空 TEXTLOG は TOC 非表示。heading が無くても day / log は必ず出る。
- **TOC の day/log 並び順は caller の content order と一致させる**
  (2026-05-03 追加)。`extractTocFromEntry(entry, { order })` の
  `order` 引数で `'desc'`(default、live viewer / sidebar)
  / `'asc'`(rendered viewer / detached entry-window)を切替。
  これ以前は TOC が常に `'desc'` ハードコードで、rendered viewer +
  entry-window が content `'asc'` を出していたため top mismatch。
  **Stage 2 として、live viewer 側にも user-choosable order toggle**
  を別 PR で追加予定(per-entry / global / runtime のいずれかは
  user 判断)、本 P1 spec の延長線として段階拡張。

### 4.5 参照スキーム（`entry:`）

- canonical grammar を固定：
  - `entry:<lid>`
  - `entry:<lid>#log/<id>`
  - `entry:<lid>#log/<a>..<b>`
  - `entry:<lid>#day/<yyyy-mm-dd>`
  - `entry:<lid>#log/<id>/<slug>`
- context-relative（`#log/<id>` 等の単独形）は **同一 entry 内の
  描画コンテキストに限り有効**。
- legacy `#<logId>` 形式は resolver が互換受理する。
- `[]()` = link（navigate + scroll）、`![]()` = embed（transclusion）。

### 4.6 transclusion

- `![](entry:<lid>[#fragment])` の 4 粒度（全体 / log / range / day）
  のみ。
- 深さ 1 固定、循環検出あり、欠落は placeholder。
- embed 内の `<article>` / `<section>` は `id=` を付与せず、host 文書の
  重複 ID を防ぐ。TOC は embed subtree に入らない。

### 4.7 出力アクション

- rendered viewer を共通 builder 化。
- rendered viewer のツールバーに **Print**（`window.print()`）と
  **Download HTML**（Blob + anchor、asset は data URI inline）を追加。
- 旧 `serializeTextlogAsMarkdown` と flat markdown copy は削除。

---

## 5. やらないこと

本 P1 では以下を行わない。明示的に除外する。

- **log entry の child Entry 化**：昇格は relation explosion / UI 複雑化 /
  import・export 破綻を招くため、恒久的に不採用。body 内 addressable で
  解決する方針を取る。
- **新規 relation kind の追加**：参照は markdown 本文の `entry:` スキーム
  で完結させる。`container.relations` は現行 4 種（structural /
  categorical / semantic / temporal）のまま。
- **time grouping のデータ化**：session marker / day marker 等のフィールド
  を body に持たせない。day 階層は常に `createdAt` からの render-time 派生。
- **week / month グルーピング**：本 P1 は day 1 段のみ。将来拡張の余地
  としてのみ残す（§8）。
- **editor への day grouping の導入**：editor（BEGIN_EDIT）は現行 flat
  textarea 列挙を維持する。edit 時の順序・追加・削除と day grouping の
  整合設計は本 P1 の外。
- **editor での log reorder / drag**：storage は常に original append 順を
  維持する。
- **cross-container transclusion**：embed 対象は同一 container の Entry
  のみ。
- **深さ 2 以上の transclusion**：embed 内の `![](entry:...)` は展開せず
  link にフォールバックする。
- **URL bar への fragment 反映 / share URL 化**：`#log/...` は in-page
  ナビゲーション専用。ブラウザ URL には反映しない。
- **copy-as-markdown (flat)**：旧 `## <ISO>` 形式の copy アクションは
  削除する。`serializeTextlogAsMarkdown` 経路は廃止。
- **TEXT archetype の fragment 文法拡張**：`entry:<lid>#section/<slug>`
  のような TEXT 専用 fragment は本 P1 では定義しない（link は entry
  単位のみ、embed は全体のみ）。
- **backlink index / 参照グラフ UI**：relation ベースの逆引きは将来課題。

---

## 6. 設計の方向性

### 6.1 共通 builder を正とする

- features 層に `buildTextlogDoc(entry, options) → TextlogDoc` を純関数
  として置く。DOM / ブラウザ API は含まない。
- `TextlogDoc` は raw を保持する（markdown → HTML 変換、`asset:` /
  `entry:` 解決はすべて DOM 化時）。
- adapter 層は `TextlogDoc` を DOM / 標準 HTML に変換する薄い層のみを
  担う。live viewer / rendered viewer / print / HTML download /
  transclusion の 5 surface すべてがこの 1 本の builder 出力から派生する。

### 6.2 builder options

| option | 値 | 用途 |
|---|---|---|
| `order` | `'asc' \| 'desc'` | surface ごとに切替（live=desc, rendered/print/export/transclusion=asc） |
| `embedded` | `boolean` | true 時は `<section>` / `<article>` の `id=` を省略し、`data-pkc-embed-source` を付与 |
| `resolveRefs` | `boolean` | true 時に `asset:` / `entry:` を解決 |
| `idScope` | `string?` | 将来の embed 衝突回避用に予約（本 P1 未使用） |

- **`order` は並び順の全称規則**：section（day）と log（article）の
  両レイヤーの並び順が同じ `order` に従う。section だけ asc で log
  だけ desc のような混在は builder contract で禁止する。この contract
  固定が 5 surface 一致の前提条件。

### 6.3 DOM 形（live / rendered 共通）

```
<div class="pkc-textlog-document" data-pkc-region="textlog-document" data-pkc-lid="<lid>">
  <section id="day-<yyyy-mm-dd>" class="pkc-textlog-day" data-pkc-day="<yyyy-mm-dd>">
    <header class="pkc-textlog-day-header"><h2>YYYY-MM-DD (Sun)</h2></header>
    <article id="log-<logId>" class="pkc-textlog-log" data-pkc-log-id="<logId>">
      <header class="pkc-textlog-log-header">
        <time class="pkc-textlog-timestamp" datetime="<ISO>">HH:mm:ss</time>
        <button data-pkc-action="toggle-log-flag" ...>★/☆</button>
        <button data-pkc-action="copy-log-anchor" ...>🔗</button>
      </header>
      <div class="pkc-textlog-log-body pkc-md-rendered"> ... </div>
    </article>
    ...
  </section>
  ...
</div>
```

- day header は非 sticky。
- live viewer の append area / 編集起動動線は builder 出力の **外側**
  に wrapper として配置（live surface 固有）。

### 6.4 ID と anchor

- 新規 log ID：**ULID**（k-sortable、26 文字）。生成器は pure module、
  clock injectable。
- 既存 log ID：rewrite せず opaque token として保持。
- resolver 受理条件：`^[A-Za-z0-9_-]+$` を満たす非空文字列。
- storage 順が正：ID の sort 可能性には依存しない（ULID と legacy ID が
  同一 entry に混在しても append 順が source of truth）。

### 6.5 `entry:` スキーム

- canonical：`entry:<lid>#log/<id>` / `#log/<a>..<b>` / `#day/<d>` /
  `#log/<id>/<slug>`。
- context-relative（`#log/<id>` 等の単独形）は **同一 entry 内描画
  コンテキスト限定**。copy-to-clipboard は常に canonical を出す。
- legacy `#<logId>` 形式は resolver が互換受理する。
- `[]()` = link、`![]()` = embed。markdown post-processor が
  `<a href="entry:...">` を検出して `data-pkc-action="navigate-entry-ref"`
  を付与。

### 6.6 TOC

- TEXT = heading-driven（現行維持、h1–h3）。
- TEXTLOG = time-driven、3 段固定（`day` / `log` / `heading`）。
- 出力型は `TocNode` union に切替。空 TEXTLOG は TOC 非表示。
- heading 無しでも L1 / L2 は出る（TEXTLOG の第一情報は「いつ何件
  あったか」）。
- click 解決：day → `day-<dateKey>`、log → `log-<logId>`、heading →
  `article id="log-<logId>"` スコープ内の slug id。

### 6.7 transclusion

- `![](entry:<lid>[#fragment])` の 4 粒度のみ（全体 / log / range / day）。
- depth 1 固定、循環検出（source == host → link fallback）、欠落は
  placeholder。
- embedded=true の builder 出力は `id=` を持たないため、host 文書内で
  ID 重複は起きない。TOC は embed subtree を走査しない。
- asset 解決は host container の `container.assets` に対して行う
  （現 PKC2 は single container）。

### 6.8 出力

- rendered viewer を共通 builder 経路に再実装。toolbar に Print
  （`window.print()`）と Download HTML（Blob + anchor、asset は data URI
  inline）を配置。toolbar は `@media print` で非表示。
- `serializeTextlogAsMarkdown` は削除。flat markdown copy も撤去。

---

## 7. リスク・未確定事項

### 7.1 破壊範囲

- **Slice 2（viewer DOM 置換）**：live viewer の DOM 構造と
  `data-pkc-*` selector が大きく変わる。renderer / action-binder /
  TOC / entry window のテストは selector レベルで広範に書き換えが
  必要。旧 `.pkc-textlog-row` を参照する経路はゼロ化する。
- **Slice 4（出力経路統合）**：rendered viewer / `serializeTextlogAsMarkdown`
  / flat markdown copy の 3 つを同時に扱う。見た目以上に重い。
  - 設計上は **4-A（rendered viewer を共通 builder 化）** と
    **4-B（Print / HTML download ボタン追加＋旧 flat markdown 経路削除）**
    の 2 段に分割可能。実装時は 4-A 単体で先行マージし、4-B を後続
    PR に切れば破壊を時間的に分散できる。
- **Slice 5（参照 / embed）**：`entry:` resolver と transclusion が
  同一スライスに入る。
  - 設計上は **5-A（navigate-entry-ref、link 解決のみ）** と
    **5-B（`![](entry:...)` の embed 解決、transclusion）** が独立
    実装可能。5-A だけ先行マージしても既存 UX は壊れず、embed を
    後続で追加できる。

### 7.2 ID / resolver の混在期間

- ULID と legacy `log-{ts}-{n}` は同一 entry に長期的に混在する
  （旧 ID を rewrite しない方針）。resolver は両形式を opaque token
  として同等に扱う。混在期間のテストカバレッジ（新旧ID を同一 entry
  で 1 件ずつ持たせ、link / embed / TOC の全経路で動作確認）は Slice 1
  および Slice 5 で必須。
- ULID の k-sortable 性は UX としては活用しない（ID から時刻を推測
  する経路を作らない）。時刻は常に `createdAt` を唯一の真とする。

### 7.3 day grouping / viewer 挙動

- day header 非 sticky：long scroll 中に「今どの日を読んでいるか」
  が視界から外れるリスクがある。本 P1 は TOC（day ノード）での補完
  を前提とする。必要性が確認されたら将来 option 化できるよう、header
  構造は sticky 追加に耐える DOM 形にしておく。
- local time 境界：日本時間境界の log が「書いた感覚の日」と dateKey
  が食い違う可能性がある。本 P1 は local timezone 固定。tz 切替は
  将来課題（§8）。

### 7.4 source of truth の一本化

- `serializeTextlogAsMarkdown` の廃止によって「markdown flat 化で
  コピーする」動線を一時的に失う。copy 要件は
  - canonical anchor のコピー
  - log 単体の raw text コピー
  - HTML download による自己完結 HTML
  で代替するが、「markdown として貼りたい」ユースケースが残っていた
  場合にリグレッションとなる可能性がある。Slice 4 以前に copy 要件の
  棚卸しが必要。

### 7.5 transclusion

- 範囲 embed `#log/<a>..<b>` の a / b 片側欠落時の placeholder 表示仕様
  （部分展開する／全部 placeholder にするか）は Slice 5 実装時に最終
  確定する。本仕様では「存在する subset を展開し、欠落片側を
  placeholder として明示」の方針。
- embed 内 heading の slug は builder の embedded モードで捨てられる
  ため、embed 内見出しへ直接リンクする方法は本 P1 では提供しない。

### 7.6 editor / viewer の構造差

- editor は flat のまま残し、viewer のみ day-grouped 化する。編集
  結果を viewer で確認する往復で「構造が違う」印象が出る可能性。
  A-1 以降で append area は center pane 上部常設のため、差は UX 的に
  吸収できるはずだが、Slice 2 のユーザ確認で要検証。

---

## 8. 将来拡張の余地

現仕様の contract を保ったまま段階的に足せる余地。**本 P1 では実装しない**。

- **week / month / session grouping**：`buildTextlogDoc` に
  `groupBy: 'day' | 'week' | 'month' | 'session'` option を追加。
  DOM 階層は同じ `<section>` / `<article>` 形を再利用できる。
- **session marker**：ユーザが任意位置に明示的な区切りを挿入可能に
  する。body JSON への `session` フィールド追加が必要になるため
  breaking change、別 P で設計する。
- **cross-container transclusion**：`buildTextlogDoc` に渡す
  `assetCtx` を container 非依存に抽象化できれば道は開く。
- **depth > 1 の transclusion**：cycle detection を強化すれば可能。
  UX 上の必要性が出てから着手。
- **TEXT archetype への fragment 文法拡張**：`entry:<lid>#section/<slug>`
  / `#heading/<slug>` による TEXT 部分参照・部分 embed。
- **backlink index**：`semantic` relation を用いた逆引きインデックス
  と、右ペインでの「参照元」表示。
- **TOC の可視範囲 highlight**：スクロール位置に応じて現在見ている
  day / log を TOC 上で強調。
- **URL bar への fragment 反映**：`location.hash` 同期による share URL
  化。既存 `navigate-entry-ref` は同じ resolver を使えるよう設計済み。
- **range embed の highlight 表示**：範囲埋め込みに対する視覚的
  ブラケット、`..` の境界線強調。

いずれも本 P1 の builder / anchor grammar / TOC 出力型を前提に足し算
できる形になっている。逆に言えば、本 P1 の 6 軸（model / viewer / TOC
/ 参照 / transclusion / 出力）をまとめて固定することが、これらを
無理なく積むための前提となる。
