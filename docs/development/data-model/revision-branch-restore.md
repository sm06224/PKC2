# Revision Branch Restore

Status: CANDIDATE
Created: 2026-04-12
Category: C. Data Model Extensions

---

## 1. 短い結論

既存 revision 履歴から任意の過去版を選んで「復元」できる機能を追加する。
現状は revision が保存されるだけで、過去版を現在 entry に戻す UI が無い。

---

## 2. 背景 / 問題

`Container.revisions` には historical snapshot が蓄積されている。
しかし UI からは閲覧のみで、「ここに戻したい」ができない。
結果として revision は事実上 audit log にとどまっている。

---

## 3. ユーザ価値

- 誤編集からの復旧ができる
- 過去版との比較 → 採用が直感的にできる
- 「書き直したが前の版が良かった」ケースに対応できる
- revision がバックアップとして機能する

---

## 4. 最小スコープ

- revision list UI に「このバージョンに戻す」action 追加
- 復元は「現在の entry を past revision の body / title で上書き」
- 復元操作自体も新しい revision として記録（履歴は消さない）
- dispatcher に `RESTORE_REVISION` action 追加
- 確認 dialog で誤操作を防ぐ

---

## 5. やらないこと

- revision 間 diff viewer（将来拡張）
- branch / merge 的な複数系譜管理
- revision の削除 / 圧縮 UI
- cross-entry 復元（別 entry の過去版から body コピー）
- 部分復元（特定段落だけ戻す）

---

## 6. 設計の方向性

- core に `restoreRevision(container, entryLid, revisionId)` pure function
- reducer で `RESTORE_REVISION` を処理、同時に現 entry を revision として push
- UI は既存 revision list に action button を追加
- revision ID は既存の一意 ID をそのまま使用
- 復元後の selectedLid / viewMode は変更しない

---

## 7. リスク / 未確定事項

- revision がバイナリ asset を参照していた場合の整合性
- 復元後の undo（直前の現 entry に戻したい）の扱い
- entry archetype が変更されていた場合の可否（typically 同 archetype のみ許可）
- revision の容量（頻繁な復元で履歴が肥大化する懸念）

---

## 8. 将来拡張の余地

- revision diff viewer
- revision への comment / tag 付与
- revision の pin / named snapshot
- C-2（entry ordering）との連携で「時系列 entry 順序」も含めた復元
- export / import で revision を選択的に含める
