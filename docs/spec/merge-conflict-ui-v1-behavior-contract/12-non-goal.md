# 12. Non-goal / v1.x 余地

## 12.1 v1 で意図的に実装しないもの

| 機能 | 理由 |
|------|------|
| accept-incoming（host 上書き） | I-MergeUI1 違反。append-only 契約を維持する |
| semantic merge（field 単位 cherry-pick） | archetype 別仕様が必要、組み合わせ爆発 |
| 3-way merge（common ancestor） | ancestor identity の記録機構が PKC2 に存在しない |
| archetype-aware diff | archetype × diff 手法の組み合わせが大きい |
| revision 持ち込み / 比較 | canonical §8.3 の非対象を維持 |
| policy UI（永続ルール登録） | 設定 UI + persistence が merge 単体テーマを超える |
| staging container | 独立テーマ |
| bulk orchestration（archetype 別 / 条件付き） | v1 は 2 bulk のみ（I-MergeUI6） |
| Skip all bulk | merge する意味がなくなるため |
| conflict 並び替え UI | v2+ |
| conflict expand/collapse animation | UX polish、v1 不要 |
| conflict 検出 progress indicator | pure helper の 1 回走査で終わるため不要 |
| merge 後 result summary toast | 既存 CONTAINER_MERGED event で十分 |
| 大文字小文字区別 toggle | v1 は固定（区別あり） |
| title-only match disable toggle | v1.x で additive 追加可能 |

## 12.2 v1.x で additive 追加可能なもの

以下は v1 contract を破壊せずに追加できる：

- `title-only match` 判定の disable toggle（preview UI に checkbox 1 個）
- `normalizeTitle` の strictness 2 段階（v1 = 空白正規化のみ、strict = 大文字小文字非区別）
- conflict list の pagination（v1 は全件表示、v1.x で 20 件/page に cap）

## 12.3 canonical spec §8 との関係

本書は canonical spec §8 の決定を以下のように refine する（緩めず・破壊せず）：

| canonical §8 項目 | 本書 v1 での扱い |
|------------------|-----------------|
| §8.1 Per-entry 選択 UI（非対象） | **本書で解禁**（最小 3 操作、host 破壊は許さない） |
| §8.2 Title / body hash 同一性判定（非対象） | **本書で解禁**（C1 = content-equal で活用） |
| §8.3 Revision 持ち込み（非対象） | 維持（非対象） |
| §8.4 Policy UI（非対象） | 維持（非対象） |
| §8.5 Staging container（非対象） | 維持（非対象） |
| §8.6〜§8.9 | 維持（非対象） |

解禁する項目は §8.1 と §8.2 の 2 項目のみ。core 不変条件（append-only / host 破壊禁止 / schema mismatch reject）は一切触らない。

---

**Contract drafted 2026-04-17.**
