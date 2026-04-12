# TEXTLOG Readability Hardening

Status: CANDIDATE
Created: 2026-04-12
Category: A. Immediate UX Improvements

---

## 1. 短い結論

TEXTLOG の rendered view で、各 log entry の境界が視覚的に弱く、日付表示が直列で読みにくい。
境界線・日付レイアウト・秒表示の 3 点を小さく調整して、ログらしい可読性を取り戻す。

**スコープ注記**: 本 Issue は TEXTLOG UI readability を主目的とするが、
**export / copy 系の timestamp fidelity 修正も同時に含む**。
UI 側は表示 formatter（秒まで）、export 側は raw ISO 出力（ミリ秒を含む生値）で
責務を明確に分離する。

---

## 2. 背景 / 問題

現状の TEXTLOG rendered view:

- log entry ごとの `<div data-pkc-log-id="...">` wrapper は視覚的区切りがほぼない
- 日付がテキストに直列で並び、「いつの log か」を目視で拾いにくい
- 日付表示の粒度が分単位で、高頻度ログでは同一時刻の entry が複数並ぶことがある

結果として、TEXTLOG は本来「時系列ログ」の用途だが、見た目は「単なる長文」になってしまう。

---

## 3. ユーザ価値

- log entry 単位で視線が止まる（境界が見える）
- 「いつ書いたか」を最初に目で拾える（日付が先頭・目立つ位置）
- 秒まで表示されるので高頻度ログでも時系列の順序が一意に把握できる
- main window / entry window / export いずれでも同じ読みやすさになる

---

## 4. 最小スコープ

- TEXTLOG rendered view の log entry 境界を視覚化（grid-areas による block 化 + 行間 separator）
- 日付表示の配置を block 先頭に寄せる（inline grid cell から `grid-area: ts` header へ）
- 日付 format を秒まで含める（UI 側 `formatLogTimestampWithSeconds` 新規追加）
- main window と entry window の両方で同じ見え方
- **export / copy 系の timestamp 出力を raw ISO に切替**
  - `serializeTextlogAsMarkdown` の heading: `## <ISO>`
  - CSV `timestamp_display` 列: raw ISO（`timestamp_iso` 列と同値になるが schema 維持）
  - Copy Reference label: `[title › <ISO>](entry:lid#logid)`
  - 既存 snapshot / 期待値は更新対象

---

## 5. やらないこと

- TEXTLOG storage format 変更（oldest-first JSON 不変条件は維持。内部 `createdAt` は ISO のまま）
- log entry 並び替え / drag-to-reorder
- log entry 内の markdown 機能拡張
- タイムゾーン / locale 切替 UI
- export column schema の変更（列名・列数は維持、値のみ raw ISO 化）

---

## 6. 設計の方向性

- **責務分離**: UI 用 formatter（秒表示）と export 用 raw 出力を明確に分離
  - UI: `formatLogTimestampWithSeconds(iso): string` pure function 新規追加
  - export: `entry.createdAt` を raw ISO 文字列としてそのまま出力
  - 旧 `formatLogTimestamp`（分単位）は呼び出し元ゼロ化 → 削除
- 境界表現は CSS 追加のみ。HTML 構造（`data-pkc-log-id`）は不変
- DOM 構造は据え置き、`grid-template-areas` で視覚上の block 化を実現
- entry window 側の inline CSS と main window の `base.css` に同じルールを同期

---

## 7. リスク / 未確定事項

- 境界を強くしすぎると TEXTLOG が「カード UI」に見え、長文ログと整合しなくなる
- 秒表示で既存 UI（sidebar の `updated_at` 表記など）との一貫性をどこまで揃えるか
- task badge（log entry 単位の task toggle）の縦位置が崩れないよう要回帰確認

---

## 8. 将来拡張の余地

- log entry ごとの折りたたみ UI
- 日付ヘッダごとのグルーピング（日単位 / 週単位）
- タイムゾーン表示の設定化
- TEXTLOG 検索時のハイライト（A-4 search-ux-partial-reach と連携）
