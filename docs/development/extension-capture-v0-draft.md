# Extension Capture v0 — Design Draft (docs-only)

> **Status (2026-04-26)**: 本 doc は `docs/spec/pkc-message-api-v1.md` + `docs/spec/record-offer-capture-profile.md` で **superseded** された。canonical reference は v1 spec を参照。
> 本 doc は draft 段階の設計検討記録として保持する(履歴削除しない)。

**Status**: design draft — 2026-04-21. **No implementation in this PR**.
**Purpose**: 外部サーフェス（ブラウザ拡張 / bookmarklet / 共有シート等）から PKC2 へ「1-click で 1 件のコンテンツを送る」最小フローを、transport / platform の大規模設計に踏み込まずに固定する。

---

## 0. TL;DR

- **v0 の受け口は既存 `record:offer` postMessage パスを再利用**（新規 transport を作らない）
- **外部 sender は独立開発**（v0 では bookmarklet sample を参考実装として記載するのみ、拡張ビルドは非スコープ）
- 受信は **即 commit ではなく `PendingOffer` preview** → ユーザ明示の Accept で entry 化（既存 UI を流用）
- **provenance は v0 では body 先頭の quote block ヘッダ**（`> Source: <url>` / `> Captured: <ts>`）で表現し、formal な external-provenance schema は defer
- **安全性は parentOrigin allowlist 1 本に集約**。新しい permission モデルは導入しない
- **single HTML 制約から「PKC2 自体を拡張化」は永久 non-goal**

---

## 1. User problem

### 1.1 解く scenario

ユーザが Web 閲覧中に「このページ / この選択範囲 / このメモ を PKC2 に残したい」と思った瞬間に、

1. PKC2 を開き直す
2. 新規 entry を作る
3. タイトルを決める
4. 本文に URL を手で貼る
5. 選択テキストを貼る

という 5 ステップを踏むのは摩擦が大きい。ブラウザ拡張 / bookmarklet / 共有シートから **1-click で送り付け、PKC2 側は既存の PendingOffer UI で受ける** だけに圧縮したい。

### 1.2 今やる理由

- navigation/support 軸（Recent Entries / Breadcrumb / Saved Searches）が揃い、「中に入った後」の支援は P4 時点で一段落
- 次に value を積むなら **capture/import 軸**（container に「入れる」段）
- transport layer は `pkc-message` v1 が既に存在し、`record:offer` が `mode: 'any'`（standalone / embedded どちらでも受理）で定義済み
- PendingOffer → `ACCEPT_OFFER` の preview-then-confirm も既に wired
- つまり **受け口は既にほぼ出来ている**。v0 はそれを「外部 sender から呼べる契約」として仕様面で固定するだけで済む

---

## 2. Minimal v0 flow

### 2.1 外部 sender が渡すもの

1 件の `pkc-message` envelope を `window.postMessage` で PKC2 (受信 window) に送る。payload 型は既存 `RecordOfferPayload` を拡張:

```ts
interface RecordOfferPayloadV0Capture {
  title: string;                    // 必須。ページタイトルや選択先頭 1 行など
  body: string;                     // 必須。markdown 推奨。選択テキスト or 全文
  archetype?: ArchetypeId;          // 省略時 'text'
  source_container_id?: string;     // 既存 field（外部 sender では基本 null/omit）

  // v0 追加（全て optional、handler 側で validation）
  source_url?: string;              // 取得元 URL
  captured_at?: string;             // ISO 8601。省略時は受信側の now
  selection_text?: string;          // 選択テキスト（body と別保持したい場合のみ）
  page_title?: string;              // <title>。title と別個に保ちたい時用
}
```

envelope 自体（`protocol` / `version: 1` / `type: 'record:offer'` / `timestamp`）は既存規約そのまま。

### 2.2 PKC2 が受けるもの

現行 `recordOfferHandler` を経由して **既存の AppState slot** に届く:

- `validateEnvelope` で envelope 層の健全性チェック
- `canHandleMessage('record:offer', embedded)` で capability check（mode: 'any' なので standalone でも通る）
- 新 optional field を含む payload を `SYS_RECORD_OFFERED` で dispatch
- `AppState.pendingOffer` に stash

v0 は **新しい message type を足さない**。`record:offer` の payload が optional field で厚くなるだけ。

### 2.3 生成 / 提案される entry

Accept 時、既存 `ACCEPT_OFFER` reducer が entry を新規 mint する。v0 では body 先頭に provenance header を注入する加工を 1 箇所入れる:

```
> Source: <source_url>
> Captured: <captured_at>

<元の body>
```

- `source_url` / `captured_at` 両方 undefined の場合はヘッダを付けない（=既存動作と完全互換）
- どちらか一方のみある場合はその 1 行だけ出す
- 空行 1 行で元 body と区切る（markdown renderer の blockquote が閉じるため）

### 2.4 v0 non-scope

以下は v0 では **やらない**:

- multi-file attachment 受け入れ（body text のみ）
- image / PDF 同梱（`assets` は v0 payload に含めない）
- batch capture（1 message = 1 entry）
- 既存 entry への追記モード（常に新規 entry）
- folder 指定 / tag 指定 / sort key 指定（受信後にユーザが手で調整）
- 自動 archetype 判定（`archetype` 未指定なら `'text'` 固定）
- offline queue（拡張側も受信側も保持しない。送った瞬間 PKC2 が開いてない / iframe 外 なら失敗）

---

## 3. Placement / UX

### 3.1 表示場所

既存の **PendingOffer UI** をそのまま流用する。受信と同時に `AppState.pendingOffer` が埋まり、現行 renderer が表示する「オファー受諾パネル」が sidebar 上部 / モーダル的に現れる（実装詳細は現行のまま）。v0 で新規 pane / region は **追加しない**。

### 3.2 即 commit か preview か

**常に preview**。

理由:
- 外部 sender から届くデータは untrusted（origin allowlist を通っていても内容は検証できない）
- 即 commit は「気付かないうちに container が汚れる」リスク
- preview は既存コード（PendingOffer → ACCEPT_OFFER）で既に動く。追加コストゼロ
- readonly mode では ACCEPT_OFFER は既存 guard で block される（contributor 側で特別な対応不要）

### 3.3 最小 confirmation flow

1. 外部 sender が `record:offer` を post
2. PKC2 は envelope / capability / origin allowlist の 3 層で validate
3. 通れば PendingOffer に入る → 既存 UI が accept/dismiss ボタンを出す
4. **Accept** → body 先頭に provenance header を付与した上で新 entry を mint
5. **Dismiss** → 既存 main.ts:391 経由で `record:reject` を送り返し、PendingOffer を破棄

v0 は 4 の body 加工ロジック 1 箇所だけが新規で、他は全て既存 path の再利用で済む。

---

## 4. Data shape

### 4.1 必須 field

最小セット（これ無しでは entry を成立させられない）:

| field | 型 | 意味 | 無い時の扱い |
|-------|-----|------|------------|
| `title` | string | entry title | **reject**（handler で SYS_ERROR） |
| `body` | string | 本文 | 空文字は許容（notes-only archetype があるため） |

optional（無くても entry は作れる）:

| field | 型 | 意味 | default |
|-------|-----|------|---------|
| `archetype` | ArchetypeId | entry kind | `'text'` |
| `source_url` | string | 取得元 URL | header 非注入 |
| `captured_at` | ISO 8601 string | 取得時刻 | 受信側 now |
| `selection_text` | string | 選択テキスト | body と統合しない（v0 は無視してよい） |
| `page_title` | string | ページタイトル | title と同じ扱い |

`selection_text` / `page_title` は **v0 では受け取るだけで使わない**（将来 v1 で「title = page_title / body = selection_text」の自動分割に使える余地を残す）。

### 4.2 provenance 表現

v0 は **formal な relation を張らない**。body 先頭 quote block に人間可読な行として埋める:

```markdown
> Source: https://example.com/article
> Captured: 2026-04-21T21:30:00Z

<ここから元の body>
```

理由:
- `provenance` relation kind は **entry-to-entry の links**（merge-duplicate, text↔textlog 変換など）として既に意味が固まっている。外部 URL はその enum に収まらない
- container-level に「外部 source list」を持つのは additive schema 変更になり v0 として重い
- quote block なら markdown renderer が既に visually 区別する。検索可能 / export に自然に乗る
- 将来 v1 で formal schema（例: `container.meta.external_sources?: ExternalSourceRef[]`）を導入する時も、この quote block → 構造化データ の one-way migration は straightforward

### 4.3 v0 で import しないもの

- assets（image / PDF / zip attachment）
- meta fields 全般（tags, archived flag, sort position）
- relations（from/to いずれも無し。後でユーザが relation-create UI で張る）
- revisions（source 側の履歴は捨てる。PKC2 側で初回 save 時に revision が切られるだけ）
- sub-entry / child entry 構造（1 offer = 1 flat entry）

---

## 5. Integration options

### 5.1 Option A — paste/import-like local flow

**要旨**: 外部 sender は HTML / text を clipboard に乗せるだけ。ユーザが PKC2 を手で開き、editor に paste。既存 `html-paste-to-markdown` / import flow に乗せる。

| 項目 | 内容 |
|------|------|
| 新規実装 | ほぼゼロ（既存 paste handler を少し強化する程度） |
| 必要な PKC2 操作 | ユーザが window を切り替え、target editor を選び、paste |
| provenance | clipboard HTML から `<a href>` を拾える程度。URL を別 field で渡す術なし |
| ユーザ摩擦 | 大（window 切り替え / paste target 選択 / title 入力） |
| transport 依存 | なし |
| 適合 surface | デスクトップのみ。モバイル共有シートは絶望的 |

### 5.2 Option B — embedded postMessage + record:offer

**要旨**: PKC2 を tab / iframe として開き、外部 sender は `window.postMessage` で `pkc-message` v1 envelope を送る。PKC2 の既存 `message-bridge` + `recordOfferHandler` が受ける。

| 項目 | 内容 |
|------|------|
| 新規実装 | **`RecordOfferPayload` への optional field 4 本追加** + body header 注入の 1 箇所のみ |
| 必要な PKC2 操作 | PendingOffer で Accept 1 回 |
| provenance | `source_url` / `captured_at` を payload で直接渡せる |
| ユーザ摩擦 | 小（PKC2 が開いていれば 1-click） |
| transport 依存 | 既存 `pkc-message` v1 で完結。新 protocol 不要 |
| 適合 surface | ブラウザ拡張（content script / popup）/ bookmarklet / 同一 origin の iframe / BroadcastChannel 経由の親ページ |
| 制約 | PKC2 が **開いていない** と届かない（queue 無し）。file:// origin だと postMessage 可能だが origin string が `null` になるので allowlist 設計が必要 |

### 5.3 Option C — extension-assisted handoff (URL param / localStorage bridge)

**要旨**: 外部 sender は URL params（`#capture=...`）や `localStorage` に書き込み、PKC2 は起動時 / focus 時に読みに行く。

| 項目 | 内容 |
|------|------|
| 新規実装 | bootstrap で capture payload 読み出し → SYS_RECORD_OFFERED dispatch。localStorage の key 衝突ポリシーと TTL 設計が必要 |
| 必要な PKC2 操作 | PKC2 を開き直す or 戻る |
| provenance | URL param に乗せれば拾える。localStorage も同じ |
| ユーザ摩擦 | 中（tab 切り替え 1 回、queue が効くので off-time 保存は可能） |
| transport 依存 | 無し（DOM 層で完結） |
| 適合 surface | standalone file:// でも動かせる唯一の道 |
| 制約 | URL param は長さ上限（IE は 2KB 級、最近は 8KB 以上だが安全上限は厳しい）。localStorage は same-origin 制約があり、拡張 → PKC2 への書き込みに content script 経由が必要 |

### 5.4 v0 推奨

**Option B を v0 採用**。

理由:
- **新規コード量が最小**: payload field 追加と body header 注入の 2 点だけで完結
- 既存 capability / validation / preview UI の **全てが既に動いている**
- `source_url` / `captured_at` を payload で構造化して渡せるので、provenance 表現が素直
- 将来 v1 で formal external-provenance schema を導入する時も、Option B の payload は **そのまま superset として成長できる**

Option A は「既存機能で当面凌げる」補完路として残す（この draft で新規作業は要らない）。
Option C は standalone file:// ユーザ向けの将来 v1+ 候補として defer。

---

## 6. Risks / non-goals

### 6.1 Risks

| risk | 内容 | v0 での緩和 |
|------|------|------------|
| untrusted payload | 外部 sender は任意の markdown / html-ish body を送れる。XSS / relative URL 汚染の恐れ | 既存 markdown renderer の sanitize + PendingOffer で preview させる。即 commit しない |
| origin なりすまし | 任意 origin から postMessage は送れる | `message-bridge` の origin allowlist を v0 で明示設定する（default allow-all は v0 では破棄） |
| spam / 連打 | 短時間に複数 offer が飛ぶと PendingOffer が上書きで失われる | v0 は「最後の offer が残る」の既存動作を許容。rate limit は v1+ |
| size bloat | sender が巨大 body を送ると container が肥大化 | payload size hard cap（例: body 256KB）を handler 側で enforce。超過時 reject |
| origin `null` (file://) | file:// や sandboxed iframe からの postMessage は origin `"null"` | v0 では `"null"` origin は **reject** を default に。必要な場合のみ opt-in コメントで明示 |

### 6.2 Non-goals（v0 で絶対にやらない）

- **PKC2 自体の拡張化** — single HTML 製品の invariant により永久に non-goal
- **service worker / offline queue** — 同上。bundle 制約と矛盾
- **新 message type の導入** — `record:offer` の superset で済ませる
- **broad hook/event subscription** — 外部 sender が PKC2 の state 変化を購読する路線は一切開けない
- **auth / OAuth / token** — 信頼境界は「origin allowlist」の 1 軸のみ
- **multi-container routing** — `target_id` は envelope に存在するが v0 は **現 active container のみ** が受ける
- **rich media 同梱** — image / PDF / zip は v0 payload に含めない
- **批量 / structured import** — 既存 batch-import / merge-planner で十分。capture は 1 件単位の軽量 path として明確に分離する

---

## 7. Recommendation

### 7.1 PKC2 がまず最初にやるべきこと

この v0 draft の **承認** → 次 PR で **capture payload spec を docs として固定**:

1. `docs/spec/record-offer-capture-profile.md`（新設）
   - payload の optional field 4 本（`source_url` / `captured_at` / `selection_text` / `page_title`）を **contract** として明文化
   - body header 注入ルール（`> Source:` / `> Captured:`）を明文化
   - payload size cap（body 256KB 案）の数値を仮置き
   - sample bookmarklet / sample extension manifest は **appendix 扱い** で参考実装レベル

2. その後の実装 PR で:
   - `RecordOfferPayload` 型の optional field 追加（`src/adapter/transport/record-offer-handler.ts`）
   - handler の size cap enforce（reject 分岐）
   - `ACCEPT_OFFER` reducer で body header 注入（`src/adapter/state/app-state.ts`）
   - origin allowlist の default を restrictive 化（`src/adapter/transport/message-bridge.ts`）
   - tests: payload field 追加 / header 注入 / size cap / origin allowlist の 4 系統

### 7.2 Defer（v1 以降）

- formal external-provenance schema（`container.meta.external_sources?`）
- Option C（URL param / localStorage bridge）による standalone file:// 対応
- rate limit / multi-offer queue UI
- 自動 archetype 判定（url パターンベース: github.com/* → `todo` など）
- rich media 同梱（attachments payload）
- capability negotiation 拡張（sender 側の `record:offer-capture/v0` advertise）

---

## 8. Related docs

### 8.1 既存 transport / capture / import

- `docs/planning/resolved/24_message_transport.md` — `pkc-message` v1 protocol 正本
- `docs/development/transport-record-accept-reject-consistency-review.md` — accept/reject 対称性 audit
- `docs/development/transport-record-reject-decision.md` — `record:reject` sender-only 確定（Option A）
- `docs/spec/provenance-relation-profile.md` — relation kind = 'provenance' の意味論
- `docs/spec/merge-import-conflict-resolution.md` — batch import の conflict 解決
- `docs/development/merge-import-implementation.md` — overlay semantics
- `docs/development/completed/import-preview-ui.md` — batch preview の UI 契約
- `docs/development/completed/batch-import-transaction-hardening.md` — import の atomicity 保証

### 8.2 本 draft で参照する想定の次 spec

- `docs/spec/record-offer-capture-profile.md` — **本 draft 承認後に新設** する capture payload spec

### 8.3 CLAUDE.md invariants（本 draft 設計の前提）

- 5-layer（core ← features ← adapter）
- single HTML product（build/release-builder.ts で 1 file にまとまる）
- container is source of truth
- no browser APIs in core/
