# Archived dev docs

実装が完了し、参照のみが目的の dev doc を**カテゴリ別**に集約するアーカイブ。`docs/development/completed/` は **42 件の omnibus**(2026-04-25 audit で確定)を扱い、本ディレクトリは**それ以外の実装後 retrospective / point-in-time audit** を扱う。

## 構造

| Subdir | 性格 | 適用ルール |
|---|---|---|
| [`pr-findings/`](./pr-findings/SUMMARY.md) | PR 単位の retrospective(`*-pr<N>-findings.md`)。merge 済 PR の learning record。 | PR が main に merge 済 + 実装 anchor が現 src/ に存在 + 該当 test が `tests/` に存在 |
| [`audits-2026-04/`](./audits-2026-04/SUMMARY.md) | 2026-04 期に実施した point-in-time audit(`*-audit-2026-04-*.md`)。findings がすべて applied 済。 | Findings の resolution が確認済、後続 wave で superseded されていない |

## 移動条件(本リポジトリの archive ルール)

`docs/development/visual-state-parity-testing.md` §「描画と生成は別物 ─ test pass = ship 禁止」に基づき、archive する前に**5-gate verification** を全件 pass する必要がある:

1. PR / commit anchor が main に merge 済
2. 実装 anchor(file path / 関数名 / `data-pkc-*` selector)が現 src/ に存在
3. doc が主張する挙動を網羅する test が `tests/` に存在
4. 視覚 feature の場合、parity test(`page.mouse.click(x,y)` + `elementFromPoint`)が存在
5. UX 効果が test / smoke で**実 DOM 状態 / 実 OS event を観測**している(stub / mock のみではない)

5-gate のいずれかが失敗した doc は **archive せず**、live tree に残しつつ deficit を解消する PR を起こす。

## live tree との関係

- canonical truth source: [`../INDEX.md`](../INDEX.md) §CLOSED / §COMPLETED
- 本ディレクトリの SUMMARY は **navigation 索引のみ**、status は INDEX が canonical
- 新規設計時の「これは既に実装済か」確認は `../completed/SUMMARY.md` + 本 SUMMARY を一次窓口に

## 履歴

- 2026-05-02 — Phase 1 着地(本 PR):reform-2026-05 で確定した 5-gate verification を初適用、PR #173-#198 の perf wave findings + 2026-04 audits を本ディレクトリに移管
