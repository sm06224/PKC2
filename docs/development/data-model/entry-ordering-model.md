# Entry Ordering Model

Status: CANDIDATE
Created: 2026-04-12
Category: C. Data Model Extensions

---

## 1. 短い結論

entry の表示順を「ユーザが並べ替え可能」にするための ordering model を導入する。
現状は `created_at` / `updated_at` による暗黙順のみで、
手動で任意順（重要度 / 読む順など）を与える手段が無い。

---

## 2. 背景 / 問題

container 内 entry の並びは現在、sidebar や calendar 等の各 view が独自のソート規則で決めている。
「この 3 つをこの順に並べたい」というユーザ意図を保存する場所が無い。

長期運用で container が 500+ entry を抱えると、
日付ソートだけでは「読むべき順」「構造的な親子」が表現できない。

---

## 3. ユーザ価値

- 読む順 / 提示順を手動で制御できる
- 章立て / プレゼン順 / 優先度の表現ができる
- sidebar / calendar での並びが予測可能になる
- TOC（A-3）や document-set（C-6）との自然な連携ができる

---

## 4. 最小スコープ

- `Entry` に `order` or `sortKey` を追加せず、別の ordering relation として表現
- `Relation` に新タイプ `ordered_after` / `ordered_before` を追加
- sidebar / list view で ordering relation を尊重
- 未順序 entry は従来通り updated_at fallback
- drag-to-reorder は別 issue（まずはデータ構造だけ）

---

## 5. やらないこと

- drag & drop UI 実装（別 issue）
- cross-container ordering
- view 別 ordering（view 固有順序）
- 複数 ordering scheme の同時保持
- archetype 固有の特殊 ordering

---

## 6. 設計の方向性

- core に ordering relation 型を追加
- features 層に `sortEntriesByOrdering(entries, relations)` pure function
- トポロジカルソートで `ordered_before` / `ordered_after` を解決
- cycle 検出 → 循環検出時は fallback ソート
- 既存 relation types と非衝突

---

## 7. リスク / 未確定事項

- 大量 entry の sort パフォーマンス（O(N log N) 維持できるか）
- ordering relation の欠損 / 部分適用時の挙動
- revision 復元（C-1）との相互作用
- export / import で ordering が保全されるか
- user model（順序の手動 vs 自動）の mental model 設計

---

## 8. 将来拡張の余地

- drag-to-reorder UI
- view 別 ordering scheme
- auto-ordering（タグ / 関連度による自動並び替え）
- document-set（C-6）での章順序として活用
- TOC（A-3）の並び順への反映
