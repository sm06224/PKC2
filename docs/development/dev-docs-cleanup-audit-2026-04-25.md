# Dev docs cleanup audit — 2026-04-25

## 1. Purpose / Status

**docs-only audit、実装ゼロ**。`docs/development/` 配下の `.md` 群が wave を重ねるごとに膨らみ、**実装済みの過去 doc / 現役の audit / Active candidate / Idea Inventory が同じディレクトリに混在** してノイズになっている問題を整理する。

User の指摘(2026-04-25):
> 実装済みで考慮が不要なものをフォルダ階層で混ぜて保管しているのが気に入らない。ノイズだから別の階層に移動しよう。実装済み専用のサマリを用意して、これからは実装済みかとか競合を確認する際はそっちを見に行こう。

本 audit は **C-1 segment**(分類規則 + 移動先設計 + サマリ doc 構造を決める docs-only PR)。実際の `git mv` + cross-link 修正 + SUMMARY 作成は **C-2 segment** で別 PR として着地させる(2 PR pipeline、新ルール下で安全側)。

- **触らない**: 実 doc の git mv / 削除 / 内容書換、INDEX.md の cross-link 修正、新規 SUMMARY 作成、src / tests / dist いずれも。

## 2. 現状(2026-04-25 survey)

| 指標 | 件数 |
|---|---|
| `docs/development/*.md`(`INDEX.md` 込み) | **190** |
| `INDEX.md` に file path として参照されている doc | **152** unique |
| **どの INDEX 行にも乗っていない orphan doc** | **67 件** |
| サブディレクトリ | `data-model/` + `markdown-extensions/` の 2 つのみ |

INDEX.md の section 構成(L27-478):

- §Status Legend
- §CLOSED (42 docs) — 2026-04-11 strict close audit を通過した歴史 doc
- §COMPLETED — #43 〜 #190 までの実装着地履歴(本 audit 時点で 190 行付近)
- §Post-Stabilization Wave(2026-04-19〜21)
- §Stabilization Phase(2026-04-12)
- §CANDIDATE — Next Feature(Active candidate / Deferred / Idea Inventory への分岐)
- §Idea Inventory(2026-04-12 棚卸しの A/B/C/D カテゴリ)
- §Close Audit Summary

**問題点**:

1. **CLOSED 42 件 + COMPLETED ~150 件 = 約 200 件の "完了した doc" が `docs/development/` 直下** で active doc(ongoing audit、Active candidate、recent design memo)と混在
2. **orphan 67 件は INDEX で位置付けが不明**、棚卸し対象から漏れている
3. **competing change を確認するときに「全 190 件を grep する」しかなく**、「これは実装済みの歴史だから無視して良い」と判断する根拠が file 単体では出ない(INDEX を読まないとわからない)

## 3. 移動の判定基準(本 audit の中核)

各 doc を以下のいずれかに分類する。**C-2 で実際に移動するのは A1 のみ**、A2-A3 は本 audit で list のみ確定して別 wave で扱う。

### A1. Archive 候補(明確に完了 + 実装履歴の参照価値のみ)

判定条件 = **全部** 満たす:
- INDEX の **§CLOSED または §COMPLETED に載っている**
- COMPLETED の場合、status が「完了」「COMPLETED YYYY-MM-DD」「実装済み」明記
- 該当機能を再着手する予定が **無い**(Active candidate / Idea Inventory に逆参照されていない)
- 過去 30 日以内に他 PR で touch されていない(`git log` で確認、C-2 で実施)

例(暫定): `action-surface-consolidation.md`、`asset-autocomplete-foundation.md`、`asset-picker-foundation.md`、`asset-reference-resolution.md`、`attachment-preview-strategy.md` 等の §CLOSED 42 件 + §COMPLETED の確実に完了した item 群。

### A2. Active(維持 = 直下に残す)

- 直近 30 日に他 PR で touch されている、または
- INDEX §CANDIDATE の Active candidate / Idea Inventory に逆参照されている、または
- audit / decision / spec の正本(`pkc-link-unification-v0.md` のような spec 系は `docs/spec/` 配下なので本 audit 対象外、ただし `docs/development/` 配下の audit は要判定)

例: `import-export-surface-audit.md`(Slice α partial landing 中)、`clickable-image-v2-decision-audit.md`(future v2 envelope 待ち)、`color-theme-cvd-slice5-audit.md`(Slice 5.1 まで完了、Slice 5.2 / 6 未着手)、`card-widget-ui-v0-audit.md`(Slice 5.0 / 5.1 まで完了、5.2 / 6 未着手)、`pr-review-checklist.md`(canonical reference)。

### A3. Orphan(INDEX に乗っていない 67 件)— 別 wave で個別判定

本 audit では一律に「**INDEX に追加するか / archive 行きにするか / 削除するか**」を決めない。orphan 個別の判断は実装履歴を読まないと分からないものが多く、数も 67 件と多いため、本 audit の scope を肥大化させない。

orphan 例(全 67 件、`tests/dev-docs-orphan-list.txt` 仮称で C-1 PR の参考付録に list 化):
- audit-of-audit 系(`archived/v1-audits/addressbar-url-title-paste-v1-audit.md`、`archived/v1-audits/attachment-foundation-fi04-v1-audit.md` 等の "v1 audit" suffix → 実装後に閉じた audit ノート)
- multi-select sub-slice doc(`archived/multi-select/calendar-kanban-multi-select-bulk-date.md` 等 5 件 → multi-select 親 doc に統合余地)
- decision / revision / coordination doc(`card-asset-target-coordination-audit.md`、`archived/boot-container-source/boot-container-source-policy-revision.md` 等)
- color slice 設計補助(`color-tag-filter-slice4-design.md`、`color-tag-ui-appstate-audit.md`)

→ **C-3+(将来 wave)で「orphan 個別判定」を 1 doc ずつ実施**。本 audit / C-2 では touched なし。

## 4. 移動先ディレクトリ命名

候補比較:

| 命名 | 意味 | 採否 |
|---|---|---|
| `docs/development/completed/` | "実装完了した doc" を直接示す | ✅ **採用**(user の元発言「実装済み専用のサマリ」と整合) |
| `docs/development/archived/` | "歴史記録、もう参照しない" のニュアンス | △(参照価値はある、archive は強すぎる) |
| `docs/development/_history/` | underscore prefix で「補助」 | △(検索 / sort で末尾化される、git でも特殊扱いされない) |
| カテゴリ細分(`completed/asset/`, `completed/textlog/` 等) | 大規模 | ❌(本 audit では細分化しない、平坦に置く) |

**採用**: `docs/development/completed/` 直下に **平坦** に置く。1 階層のみ、サブカテゴリは作らない(将来必要なら再整理)。

## 5. SUMMARY.md の構造

`docs/development/completed/SUMMARY.md`(NEW、C-2 で作成):

```md
# Completed dev docs — index

実装が完了し、実装履歴の参照のみが目的の dev doc を集約。
新しい設計を始めるときに「これは既に実装済みかどうか」を確認する一次窓口。

最新の方針 / Active candidate / Idea Inventory は `../INDEX.md` を参照。

## 一覧(landing 順、最新が上)

| # | File | Topic | Landed | Slug |
|---|------|-------|--------|------|
| 1 | `card-widget-ui-v0-audit.md` | Card widget UI 4-stage chrome 計画 | 2026-04-25 | card-widget-ui-v0 |
| 2 | `archived/audits-2026-04/css-ui-debt-audit-2026-04-25.md` | 連続 wave 後の小掃除 6 観点 | 2026-04-25 | css-ui-debt |
| ... | ... | ... | ... | ... |

## カテゴリ索引(secondary)

- **Card / embed / link**: ...
- **Color / a11y**: ...
- **Storage / Import-Export**: ...
- ...
```

カテゴリ索引は **手作業で書く**(自動生成しない、件数が多くないので保守可能)。検索性を上げるためだけ、Truth source は INDEX.md 側のまま。

## 6. C-2 segment(別 PR、本 audit 後の実装)で行うこと

1. `mkdir docs/development/completed/`
2. **§CLOSED 42 件**(INDEX.md L36-83 の表に列挙されている doc 群)を `git mv` で `completed/` 配下に平坦移動
3. **§COMPLETED の中で「明確に完了 + 30 日以内に touch なし」の doc を移動**(C-2 PR 開始時に再 survey、当該 list は audit doc に付録として add しない、C-2 commit で確定する流動 list として扱う)
4. **`docs/development/completed/SUMMARY.md`** を新規作成(§5 構造で)
5. INDEX.md の参照リンクを `completed/<file>.md` 形に修正(grep で broken link を検出 → 機械的更新)
6. **`docs/development/INDEX.md` 自体は移動しない**(canonical source として直下維持)
7. C-2 着地後、orphan 67 件は **C-3+ で個別判定**(将来 wave、本 audit で list 化のみ)

## 7. Cross-link 破壊の防止

`docs/` 配下の各種 doc が `docs/development/X.md` を相対参照している箇所を C-2 PR 内で grep + 一括修正:

```bash
grep -rln "docs/development/<moved-file>" docs/ src/ tests/ build/
```

修正範囲想定:
- 他の audit doc 内の cross-link
- spec 内の "see also"
- INDEX.md 内の table file path 列
- README / CLAUDE.md / pr-review-checklist.md
- 過去 PR の commit message(履歴は遡及修正不要)

C-2 PR は移動 + cross-link 修正 + SUMMARY 作成を **1 PR で commit、ただし split commits** で行う(`mv` のみの commit → cross-link fix の commit → SUMMARY commit、の 3 commit 推奨)。git の rename detection が効くように `mv` と内容変更を分離するのが目的。

## 8. 評価軸

| 軸 | 値 |
|---|---|
| ユーザー価値 | **高**(競合確認時のノイズが半減、新しい設計を始めやすくなる) |
| 中途半端さ解消 | 高(190 doc 混在 → ~50 doc 直下 + ~140 doc archive 想定) |
| 実装リスク | 低(`git mv` は履歴保全、cross-link は grep で網羅、SUMMARY は新規 doc で衝突なし) |
| docs / spec readiness | 高(INDEX が既に Status legend を持っているので分類基準は流用可) |
| schema impact | ゼロ |
| import/export impact | ゼロ |
| harbor philosophy | ✅(整理は港湾整備の典型タスク) |
| 1 PR で閉じられるか | **C-2 は移動 doc 数次第**(§CLOSED 42 件のみなら 1 PR で十分、+§COMPLETED 50 件超なら分割検討) |
| 今やるべきか / defer すべきか | **今やる**(user 提案、wave 進捗の自然な区切り) |

## 9. Out of scope / 今回触らない

- 実 doc の `git mv` / 削除 / 内容書換(C-2 で実施)
- INDEX.md cross-link 修正(C-2 で実施)
- SUMMARY.md 新規作成(C-2 で実施)
- orphan 67 件の個別判定(C-3+ 別 wave)
- カテゴリ細分(`completed/asset/` 等)導入(必要なら C-3+)
- `docs/spec/` 配下の整理(本 audit は development 配下のみ対象)
- `docs/manual/` / `docs/planning/` / `docs/release/` / `docs/vision/` の整理(本 audit 対象外)
- src / tests / dist / schema / version / About / CHANGELOG いずれも touched なし
- 並走している Card Slice / Color / Import-Export / clickable-image / Extension Capture wave

## 10. 次の最小 follow-up(本 audit が canonical reference になる)

1. **C-2 PR(本 audit 着地後の即着手)**: §6 の手順で `completed/` ディレクトリ作成 + §CLOSED 42 件 + §COMPLETED の "30 日以内 untouched" 分を `git mv` + INDEX cross-link 修正 + SUMMARY.md 新規作成。3 commit split 推奨。
2. **C-3 wave(更に後)**: orphan 67 件の個別判定、カテゴリ細分の必要性再評価。
3. その後 **案 1 Visual smoke 拡充** に進む(user 指示の進行表通り)。

## 11. References

- `docs/development/INDEX.md` §Status Legend / §CLOSED / §COMPLETED / §CANDIDATE / §Idea Inventory
- `docs/development/pr-review-checklist.md`(本 audit も 8 項目 self-audit を回す)
- 過去類似事例: なし(本 audit が初の development ディレクトリ整理)

---

**Status**: docs-only audit(2026-04-25)。C-2 implementation PR が本 audit を canonical reference に着地予定。本 audit 自体は `docs/development/` 直下に維持(`completed/` には入れない、active reference として参照される間)。
