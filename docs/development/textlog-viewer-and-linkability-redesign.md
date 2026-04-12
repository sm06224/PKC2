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

<!-- sections 5–8 are intentionally left blank; will be appended in the next pass. -->
