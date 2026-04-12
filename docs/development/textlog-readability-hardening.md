# TEXTLOG Readability Hardening

Status: CANDIDATE
Created: 2026-04-12
Category: A. Immediate UX Improvements

---

## 1. 短い結論

TEXTLOG の rendered view で、各 log entry の境界が視覚的に弱く、日付表示が直列で読みにくい。
境界線・日付レイアウト・秒表示の 3 点を小さく調整して、ログらしい可読性を取り戻す。

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

- TEXTLOG rendered view の log entry 境界を視覚化（border / background / margin のいずれか最小）
- 日付表示の配置を block 先頭に寄せる（inline から block へ）
- 日付 format を秒まで含める（既存 timestamp ISO string の表示ロジック調整のみ）
- main window と entry window の両方で同じ見え方

---

## 5. やらないこと

- TEXTLOG storage format 変更（oldest-first JSON 不変条件は維持）
- log entry 並び替え / drag-to-reorder
- log entry 内の markdown 機能拡張
- タイムゾーン / locale 切替 UI
- TEXTLOG export 側の format 変更

---

## 6. 設計の方向性

- rendering 層のみで完結させる。core / features は触らない
- 境界表現は CSS 追加のみ。HTML 構造（`data-pkc-log-id`）は不変
- 秒表示は既存 timestamp parser の出力フォーマット関数を拡張
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
