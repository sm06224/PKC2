# Search UX — Partial Reach Links

Status: **COMPLETED 2026-04-14** (USER_REQUEST_LEDGER S-15 + S-18).
Slice α (visual `<mark>`) shipped as S-15. FULL slice (sub-location
result rows + scroll-to + temporary highlight + `NAVIGATE_TO_LOCATION`
action) shipped as S-18 per supervisor direction 「A-4 を部分補修では
なく検索 UX の実用完成まで一気に持っていく」.
Created: 2026-04-12
Category: A. Immediate UX Improvements

---

## 0. 実装サマリ（2026-04-14 完了）

- **pure indexer**: `src/features/search/sub-location-search.ts` の
  `findSubLocationHits(entry, query, maxPerEntry)`。TEXT は行走査で
  直前の `#` heading slug に match を帰属（`makeSlugCounter` を共有
  するので renderer の `id=` と完全一致）、TEXTLOG は
  `parseTextlogBody` で log 単位、それ以外の archetype は `[]`。
  dedupe by sub-id、fenced code block はスキップ（S-15 と同じ方針）。
- **新 user action**: `NAVIGATE_TO_LOCATION { lid, subId, ticket }`。
  reducer で `selectedLid` + `pendingNav = { subId, ticket }` をセット、
  ancestor folder 自動展開 + per-entry transient UI cleanup は
  `SELECT_ENTRY` と同じ規則
- **新 AppState field**: `pendingNav?: { subId: string; ticket: number } | null`
  （optional、既存 test fixture 非破壊）
- **adapter helper**: `src/adapter/ui/location-nav.ts` の
  `createLocationNavTracker()`。`lastTicket` をクロージャに保持し、
  ticket 前進時のみ `findLocationTarget` → `scrollIntoView` →
  `.pkc-location-highlight` class 追加 → 1.6s 後に削除。再 render の
  嵐で同じ pending が何回流れても idempotent
- **main.ts post-render effect**: onState の最後に
  `locationNavTracker.consume(root, state.pendingNav ?? null)`
- **renderer**: sidebar flat-mode（filter active 時）で、各 entry の
  行直後に sub-location hits を最大 5 行まで emit。`data-pkc-action
  ="navigate-to-location"` + `data-pkc-lid` + `data-pkc-sub-id` +
  `data-pkc-subloc-kind`
- **action-binder**: `navigate-to-location` ケース + ticket カウンタ
  （再クリックでも ticket 前進、scroll が再発火）
- **CSS**: `.pkc-entry-subloc` + kind / label / snippet の 3 スパン
  layout、dashed 左罫で indent。`.pkc-location-highlight` は
  keyframes で 1.6s の background/color flash + `scroll-margin-block:
  4rem` で sticky header を避けて着地
- **テスト (+46)**:
  - `tests/features/search/sub-location-search.test.ts` (21) —
    TEXT heading dedup / no heading fallback / maxPerEntry /
    fenced skip / 大小文字 / 空クエリ / TEXTLOG log hit / 時刻
    label / 非 text/textlog は [] / malformed body
  - `tests/adapter/location-nav.test.ts` (15) — subId → element
    解決（heading / log / entry / unknown / missing / escape）、
    highlight 追加 + タイマー後削除、scrollIntoView 呼び出し、
    tracker の idempotency / ticket 前進 / null pending
  - `tests/adapter/navigate-to-location.test.ts` (10) — reducer
    3 case（成功 / not ready / container null / ticket 進行）、
    renderer sidebar 3 case（TEXT 行 × 2 / TEXTLOG 行 × 2 / 空
    query 0 行 / kind 属性 + snippet）、handler 2 case（click
    dispatch + 再 click で ticket 前進）

以下の §1 以降は当時の設計判断記録としてそのまま保持。

---

## Trigger

A-1（TEXTLOG readability）と A-3（右ペイン TOC）で「読める / 俯瞰できる」
状態に到達した。本 issue は A-1 / A-3 後の**ユーザ体感によって着手可否が
決まる条件付き候補**であり、現時点では実装対象ではない。

着手条件（どれかが真になったら昇格）:

- A-1 / A-3 を実際に触った上で「entry を特定しても、その中でヒット箇所を
  探す作業がまだ痛い」という実感が残っている
- 長文 TEXT / 長期 TEXTLOG で TOC 経由 navigation だけでは足りないシーン
  が具体的に挙がる

着手を見送る条件:

- TOC + rendered body のスクロールで十分だと感じる
- 痛みが具体的に言語化できない

見送り時は本 doc を CANDIDATE に戻さず、CONDITIONAL のまま待機する。

---

## 1. 短い結論

検索結果一覧で「entry 単位のヒット」だけでなく、
**entry 内部のヒット箇所（段落・見出し・log entry）までリンク到達**できるようにする。
クリックでその位置にスクロール / highlight される。

---

## 2. 背景 / 問題

現状の検索は entry を開くところまでしか案内しない。
長文 entry / 長期 TEXTLOG ではヒット箇所の特定に手間がかかる。

特に TEXTLOG は 1 entry が実質「年単位の日誌」になり得るため、
「どの log entry にヒットしたか」まで絞り込めないと使い物にならない。

---

## 3. ユーザ価値

- 検索ヒット箇所まで一発でジャンプできる
- TEXTLOG 内の個別 log entry を「検索結果」として扱える
- 長文 TEXT の該当段落を即座に確認できる
- container が大きくなるほど価値が増す（スケーラビリティ）

---

## 4. 最小スコープ

- 検索 index の粒度を entry 単位から「entry + sub-location」に拡張
  - TEXT: 段落 or 見出しブロック
  - TEXTLOG: 各 log entry（`data-pkc-log-id` と対応）
  - todo / form: entry 単位のまま
- 検索結果 UI: 1 ヒット = 1 行表示、entry タイトル + sub-location snippet
- クリックで該当 entry を開き、該当位置にスクロール + 一時的に highlight
- 既存の entry 単位検索結果とも両立（folded 表示など）

---

## 5. やらないこと

- 全文検索エンジンの差し替え
- fuzzy / regex / 構文拡張
- 検索結果のソート規則の抜本的変更
- 検索結果の永続化 / bookmark
- cross-container 検索
- A-3 TOC の右ペイン統合

---

## 6. 設計の方向性

- indexer は features 層 pure function
- 入力 = entry、出力 = `{ entryLid, subId, snippet, position }[]`
- sub-location ID は既存 DOM アンカー（`data-pkc-log-id` / heading slug）と同じ表現
- dispatcher に `SELECT_ENTRY_AT_LOCATION` 的な action を追加（または `SELECT_ENTRY` にオプション追加）
- renderer 側は受け取った sub-location に scroll + 一時 highlight（CSS animation）
- 検索結果 UI は既存 search surface を拡張

---

## 7. リスク / 未確定事項

- index サイズの増加（sub-location 単位になるため膨らむ）
- 検索結果が冗長になる可能性（同一 entry から多数ヒット）
- highlight の視覚的ノイズ（dark mode / light mode 両対応必要）
- preview 内 anchor jump（A-2 / A-3）との重複リスク
- export / import で sub-location ID が保全されるか要検討

---

## 8. 将来拡張の余地

- cross-entry link（検索ヒット → そのまま別 entry 内の該当箇所へ）
- 「最近ヒット箇所」の履歴
- C-3（link index entry）自動生成時に検索 sub-location を活用
- TEXTLOG 内の log entry 単位 permalink
