# Complex Entry Archetype

Status: CANDIDATE
Created: 2026-04-12
Category: C. Data Model Extensions

---

## 1. 短い結論

単一 archetype では表現しきれない「複合 entry」を扱うための `complex` archetype を導入する。
text + todo list + 表 + 添付 を一つの entry 内で構造化保持する器。

---

## 2. 背景 / 問題

現状の archetype は「一種類ずつ」の単純型：

- text: 文章
- textlog: 時系列ログ
- todo: 単一 task
- form: key-value

しかし実務では「打ち合わせメモ + アクションアイテム + 参考資料」のような
複合構造を 1 entry として扱いたい場面が多い。
現状は text 内に無理に詰め込むしかない。

---

## 3. ユーザ価値

- 複合的な情報を 1 entry として保持できる
- 会議メモ / プロジェクト概要 / 日報 などの構造化表現ができる
- 各セクションが独立した archetype のまま扱える（todo は todo として完了可能）
- 検索 / export で「構造化ユニット」として扱える

---

## 4. 最小スコープ

- 新 archetype `complex` を登録
- body は JSON: `{ sections: [{ kind, body }] }` 形式
- 各 section は既存 archetype 相当の kind（text / todo / table）を持つ
- presenter は各 section を該当 archetype presenter に委譲
- section の追加 / 削除 / 並び替えの最小 UI

---

## 5. やらないこと

- 任意 nest 深度（最小は flat sections のみ）
- section 間 relation 自動生成
- section 単位 revision
- cross-entry section の共有
- リアルタイム共同編集

---

## 6. 設計の方向性

- core に `ComplexBody` 型と section 型を追加
- features 層に section 操作の pure function（add / remove / reorder）
- presenter は既存 archetype presenter を section に適用する composite
- dispatcher に `UPDATE_SECTION` / `ADD_SECTION` / `REMOVE_SECTION` action を追加
- 各 section の body serialization は該当 archetype のルールに従う

---

## 7. リスク / 未確定事項

- body JSON の肥大化
- section kind 追加時の backward compatibility
- presenter の composite 実装がどこまで複雑になるか
- search index の粒度（section 単位 vs entry 単位）
- export / import での section 表現

---

## 8. 将来拡張の余地

- nest された complex entry（section 内に complex）
- section template（会議メモ template 等）
- C-6 document-set との統合
- section 単位の revision
- section 単位 permalink（A-4 sub-location と連携）
