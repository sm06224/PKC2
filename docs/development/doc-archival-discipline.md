# Doc archival discipline — Phase 6 / reform-2026-05 拡張

**Status**: LIVE(active doctrine、2026-05-03 確立)
**目的**: live doc tree を「**今 active で参照する design / methodology / planning**」だけに保つ。RESOLVED な実装 / 設計 / 計画書は **結果サマリだけを live に残し、本体は再燃まで触らない archive folder に物理移動** することで、live doc 数を継続的に減らす。
**スコープ**: `docs/` 配下すべて(`development/`, `planning/`, `spec/`, `release/`, `manual/`, `requirements/`)。

## 1. 背景 — なぜ必要か

reform-2026-05 wave(2026-04-30 〜 2026-05-02)で:
- Phase 1A: `docs/development/archived/<group>/SUMMARY.md` 構造を確立
- Phase 1B〜3: live doc を整理して **orphan 0** を達成
- Phase 4: 49 spec を ALIGNED 検証
- Phase 5: orphan + dead-link を CI gate 化

しかし wave 完結後、user 指摘:
> 棚卸し時、対応するファイルベースイシューが確実にアーカイブしていき、数を減らしていってください
> ドキュメントに残す活動は一時やればいいものではないので、習慣化してください

→ 整理を **一回の wave で終わらせず、PR ごと / quarterly cycle で継続** する仕組みが欠落していた。本書はその discipline を canonical 化する。

## 2. 対象判定 — どの doc が archive 候補か

live tree に置くべき条件(**いずれかを満たすときのみ live 維持**):
- (a) **active design**:現在進行中 / 着手予定の feature spec(例:`textlog-viewer-and-linkability-redesign.md` の P1)
- (b) **canonical contract**:現実装と並ぶ truth source(例:`docs/spec/<feature>-v1-behavior-contract.md`、Phase 4 で ALIGNED 確認済み)
- (c) **active methodology / policy**:CI gate / PR review checklist / debug protocol 等の運用 doc
- (d) **未解消 issue / open question**:未着手の planning / 解消条件未達 audit
- (e) **roadmap / ledger / handover**:user direction の集積、quarterly review の対象

archive 候補(**いずれかに該当するなら archive 検討**):
- (i) 実装 / 設計 / 計画 が **完了**(対応 src + tests + audit がすべて存在)
- (ii) audit doc が「Outcome: A / FINAL / COMPLETE」で締めくくられている
- (iii) PR finding / changelog / wave クローズ doc(歴史記録、現行設計には影響しない)
- (iv) 上位 doc に **結果が反映済み**(個別 doc を読まずとも親で全容把握可能)

**判定の grey zone**: spec doc の扱い。`docs/spec/<feature>-v1-behavior-contract.md` は **canonical contract = live 維持**(条件 b)。実装 audit `<feature>-v1-audit.md` は archive 可(`docs/development/archived/v1-audits/SUMMARY.md` で集約済み)。

## 3. archive 操作の標準手順

### 3.1 1 件単位の archive

1. **trigger**: PR 着地時 / quarterly review で「(i)〜(iv) いずれかに該当」と判定
2. **物理移動**: `git mv <doc>.md <parent>/archived/<doc>.md`(`archived/` 無ければ作成)
3. **SUMMARY 更新**: `<parent>/archived/SUMMARY.md` に 1 行追加(file / topic / outcome / 対応 spec / 完了 commit)
4. **上位 INDEX cross-link 更新**: archive 先 SUMMARY を INDEX から参照(orphan check は SUMMARY 経由の 2 段間接登録モデルで pass)
5. **再燃 trigger 明記**: SUMMARY 内に「再燃 trigger」段落を含め、何が起きたら live に戻すかを明示

### 3.2 wave / 複数件の bulk archive

1. **対象列挙**: 対象 directory 内全 doc を `## Status` / 関連 spec / src 存在で分類
2. **agent 委譲可**: Explore agent に「RESOLVED/PARTIAL/OPEN」分類を依頼(本 doctrine では agent prompt の template も提供、§5)
3. **bulk move**: 複数 `git mv` を 1 commit に集約
4. **SUMMARY 一括作成**: `archived/SUMMARY.md` に live 残数 / archived 件数 / 各 archive の outcome を表で
5. **元 directory の `00_index.md` / 親 doc も更新**: live 件数を反映、archived 経由の lookup を案内

## 4. 各 doc tree への適用ルール

| Tree | 適用ルール | archive 場所例 |
|---|---|---|
| `docs/development/` | feature 完了 → archive group SUMMARY に集約。methodology / live spec は維持 | `docs/development/archived/<group>/SUMMARY.md`(reform-2026-05 で 14 group 構築済) |
| `docs/spec/` | **canonical contract = 維持**、obsolete 化した spec のみ archive | `docs/spec/archived/<feature>-vN.md`(必要時、現状空) |
| `docs/planning/file-issues/` | RESOLVED FI を archive | `docs/planning/file-issues/archived/SUMMARY.md`(2026-05-03 第 1 回 sweep で 7/13 件 archive) |
| `docs/planning/resolved/` | 既に「resolved」directory 名、archive 不要 | — |
| `docs/planning/` 直下(ledger / handover) | 維持(live ledger)、ただし §X が完全 dormant 化したら章削除 | — |
| `docs/release/CHANGELOG_*.md` | 維持(歴史記録) | — |
| `docs/manual/` | 維持(user 向け正本) | — |
| `docs/requirements/` | 維持(原典) | — |

## 5. agent prompt template(bulk audit 用)

```
<directory> 配下の N 件 doc を audit:
1. 各 doc を読み、対応 spec / src / tests / audit が存在するか grep
2. 判定: RESOLVED / PARTIAL / OPEN
3. RESOLVED ならば archive 推奨、PARTIAL は残課題明記、OPEN は理由明記
4. 出力フォーマット:
   [STATUS] <ID> <タイトル>
     evidence: <対応 spec / src / audit>
     archive: YES|NO + 理由
     残課題: (PARTIAL/OPEN の場合)
5. 集計表 + 推奨 archive 件数を最後に
```

## 6. 習慣化 — いつ実施するか

### 6.1 PR 着地時(1 PR ごと)

`pr-review-checklist.md` §3 自己監査 9 項目目:

> 9. **Roadmap 同期 + archive 検討**: 触った feature が完了したなら、対応する file-issue / planning doc / development doc を archive 対象として評価。RESOLVED と判断したら同 PR 内で archive sweep(§3.1 手順)。新規 follow-up は roadmap doc に追記。

### 6.2 Quarterly synthesis cycle(3 ヶ月ごと)

次回: **2026-08-03**(reform-2026-05 から 3 ヶ月)。実施内容:
- 全 doc tree を `find` + 各 directory の SUMMARY と照合し、archive 漏れ抽出
- USER_REQUEST_LEDGER §3.6 deferred items の trigger 状態 bulk-check
- feature-requests-2026-04-28-roadmap.md の 8 領域進捗再計算
- Phase 4-style spec audit の差分版(変更 spec のみ)
- INDEX に "Next synthesis: 2026-11-03" pin

cycle 自体を 1 PR で着地、live doc 件数の推移をグラフ化(将来的)。

### 6.3 「次の選択肢」提示前(私の自己ルール)

`CLAUDE.md` 自己 binding:

> 「次に何をするか」を user に聞く前 / autonomously に進める前、以下を必ず実施:
> 1. `docs/development/feature-requests-2026-04-28-roadmap.md`(8 領域の現状)を grep
> 2. `docs/planning/USER_REQUEST_LEDGER.md` §3.6(deferred items) を grep
> 3. INDEX LIVE Active feature specs(進行中 spec)を grep
> 4. 直近 PR で archive 候補となった doc の有無を確認
>
> grep 結果を要約してから選択肢を提示。grep を skip した提示は **禁止**。

## 7. 既知の制約

- **判定の主観性**: 「(i) 完了」の判定は audit doc の有無に依存するが、すべての feature が audit doc を持つわけではない。grey zone は PR review で議論。
- **breaking change 時の active 化**: archived doc が「再燃 trigger 成立」と判定された場合、live に戻す PR を起こすが、戻し漏れは構造的に防げない。quarterly cycle で全件 trigger 状態を bulk-check するのが defensive net。
- **`docs/spec/` archived/** は現状空: obsolete 化した spec が出るまで作らない(YAGNI)。

## 関連

- 上位 reform doctrine: [`debug-privacy-philosophy.md`](./debug-privacy-philosophy.md)、[`visual-state-parity-testing.md`](./visual-state-parity-testing.md)、[`test-strategy-audit-2026-05.md`](./test-strategy-audit-2026-05.md)
- doc CI gate: [`doc-ci-automation.md`](./doc-ci-automation.md)
- PR review: [`pr-review-checklist.md`](./pr-review-checklist.md)
- Phase 1A archive 構造の起点: [`archived/SUMMARY.md`](./archived/SUMMARY.md)
- 第 1 回 sweep 適用例: [`../planning/file-issues/archived/SUMMARY.md`](../planning/file-issues/archived/SUMMARY.md)
