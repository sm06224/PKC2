# Next-Feature Prioritization — After Relations / Reference / Provenance / Orphan Wave

**Status**: planning memo — 2026-04-21。docs-only。
**Purpose**: relations / references / provenance / orphan-detection の一連の wave と直後の dead-code cleanup が一段落した時点で、**次の feature 軸を意図的に選ぶ**ための棚卸し。
**Out of scope**: graph visualization / hook subscription / telemetry — 近い将来は入れない前提（今後数本の PR では前提にしない）。
**Baseline**: main (6c5a831)。

> **📌 As-of 2026-04-21 追補（実装後 status）**
>
> 本 memo は初版時点の棚卸しとして残す。**P1–P4 はすべて wave として着地**し、現時点で active candidate として残っているのは **P5（Extension Capture）の receiver side draft のみ**。
>
> | 順位 | 当時の候補 | 現状 | 参照 |
> |---|---|---|---|
> | P1 | recent-entries pane | **SHIPPED** | `recent-entries-pane-v1.md` |
> | P2 | breadcrumb / path trail | **SHIPPED** | `breadcrumb-path-trail-v1.md` |
> | P3 | entry-rename display freshness | **audit DONE + follow-up SHIPPED** | `entry-rename-freshness-audit.md` / `entry-window-title-live-refresh-v1.md` |
> | P4 | saved searches | **SHIPPED** | `saved-searches-v1.md` |
> | P5 | extension capture → provenance | **v0 draft のみ**（receiver side 未着手、唯一の active candidate） | `extension-capture-v0-draft.md` |
>
> §6 以下の本文は当時の推奨ロジックを歴史として保存しているが、**現時点での「次 PR」判断は P5 receiver side draft 化が基点**。LEDGER §1.1 / HANDOVER_FINAL §22.2 も同じ。

---

## 1. サマリ

- 5 軸 × 1 候補ずつ（editor / search / inbox / navigation / launcher）で棚卸し
- **P1 に推奨**: **recent-entries pane**（inbox 軸）— small / derived-only / S4 orphan marker と対で意味が閉じる
- **P2**: breadcrumb / path trail（navigation 軸）— small / 独立 / jump 動線後の "迷子" 補修
- P3 は audit、P4 / P5 は実需ドリブンで保留
- **次 PR として P1 を draft → 実装で 1 本切る**のが最適解

## 2. 現在の成熟度（共通認識）

直近 wave で閉じた領域（= **当面は触らない**前提で良い）:

- **Relations layer**: References summary v2/v3（jump navigation）、relation-kind-edit 二重ガード、relation-delete-ui
- **Provenance layer**: viewer v1 → pretty-print v1.x → copy/export v1（raw canonical JSON）
- **Orphan detection**: v1 legacy marker + v3 sidebar marker（connectedness-s3 + s4）。S5 filter は defer
- **Dead code**: inventory + Category A cleanup 完了（2 export 削除）

既に実装済みの基盤（= **"これが無い" と誤解しない**）:

- keyboard-navigation phase 1–6 / backlink-badge-jump / entry-ref-autocomplete（v1.3 recent-first）
- slash-menu / search-mark / sub-location-search（`NAVIGATE_TO_LOCATION` 含む）
- search archetype-filter v1（multi-select）
- batch-import wave（preview / transaction-hardening / folder-scoped / conflict detect）
- html-paste-to-markdown / image-optimize / asset-dedupe / orphan-asset-auto-gc
- dual-edit-safety（pure / state / ui slice 揃い）
- PKC2-Extensions（readonly manual HTML）

**つまり**: "素朴に足りない基本 UX" はもうほぼ無い。候補は **橋渡し / 再発見 / 外部連携** のいずれかの性質を持つ。

## 3. 候補（5 軸 × 5 候補）

### 3.1 [editor] 候補 A — entry-rename 時の表示 freshness

**概要**: entry の title を変更したとき、既存の markdown 本文中の `entry:lid` 参照は **lid key のため自動追従**しているが、レンダー後の **表示 text**（title 文字列）がキャッシュに残っている箇所がないか、および `pretty-print`/`references summary` の再集計タイミングを点検 + 必要なら再 render 誘導を足す。

- **解決する user problem**: 著者が entry title を修正した直後、他 entry 側で title が古いままに見える瞬間があると、"壊れた" 印象を与える。実データは正しいが display が遅延するケースの整理。
- **now が timing か**: **条件付き Yes**。provenance / references 周りの display layer を最近整えたので、display ↔ data の同期契約を同じ基準で見直す文脈が揃っている。
- **size**: **small**（audit 1 PR → 必要なら小さな fix 1 PR の 2 本立て）。
- **arch risk**: **Low**。reducer / container schema は無変更、renderer の再 render trigger 確認が中心。
- **recommended priority**: **P3**（実証ベース。"本当に stale が出る" のを確認してから fix する）。

### 3.2 [search] 候補 B — saved searches / named filter snapshots

**概要**: archetype filter + text クエリ + sort 設定を **名前付きで保存**し、ワンクリックで復元できる「saved search」機構。runtime-only slice（container に持たず、IndexedDB にも持たない）か container 永続化かは設計判断の余地あり。

- **解決する user problem**: 決まった組み合わせの filter（例: "text archetype × 今月作成 × 未参照"）を毎回手で組み立てる繰り返し摩耗を削減。
- **now が timing か**: **中**。archetype multi-select v1 / sub-location-search / partial-reach が揃ったので "組み合わせ filter" の価値が高くなっているが、**"毎日 3 回同じ filter を組む" 実証**が無いと投資対効果が薄い。usage 実証があれば timing は良い。
- **size**: **medium**。UI（filter 上の saved-search ボタン / chip 列）+ 永続化箇所の判断 + saved filter の dehydrate/rehydrate。
- **arch risk**: **Low–Medium**。runtime slice だけに閉じれば Low。container に乗せるなら schema 変更が発生し、後方互換の議論が要る。
- **recommended priority**: **P4**（実需確認の後）。

### 3.3 [inbox/capture] 候補 C — recent-entries pane（directed）

**概要**: 最近 **作成**された user entry を新しい順で N 件（~20–30）並べる**派生ビュー**。`created_at` desc で sort するだけの derived-only pane。sidebar と並立させるのではなく、既存 sidebar の上段に開閉可能な `<details>` として差し込む、または References 周りと同じ補助 pane として入れる。

- **解決する user problem**: batch-import 後 / html-paste 後に "いま入った entry" へ素早く戻れない。orphan marker は "放置された entry" を見せるが、**"生まれたばかりの entry"** を見せる面が現状無い。これは S4 orphan marker と対の UX。
- **now が timing か**: **Yes**。orphan marker v3 によって "未接続を目立たせる" は成立したので、"新規を目立たせる" 反対側を補うと reference/provenance wave の締めとして自然。
- **size**: **small**。renderer に derived list 追加 + CSS。新 action は不要（`SELECT_ENTRY` を re-use）。container 変更ゼロ、reducer 変更ゼロ。
- **arch risk**: **Very Low**。pure derivation、既存 `entries[]` の sort のみ。
- **recommended priority**: **P1**（最有力）。small かつ S4 と対で意味が閉じる。

### 3.4 [navigation] 候補 D — breadcrumb / path trail for current entry

**概要**: 選択中 entry の **祖先 folder chain** を detail pane 冒頭に 1 行で表示（例: `Root › Projects › PKC2 › 開発ログ`）。各セグメントは click で `SELECT_ENTRY` 発火。sidebar tree で "この entry はどこにいるのか" の把握が弱い瞬間を埋める。

- **解決する user problem**: flat-mode で search 結果をクリックした直後、"この entry はどの folder 配下か" を sidebar scroll しないと分からない。backlink / references jump 後も同じ問題が発生する。
- **now が timing か**: **Yes**。sub-location-search / references-summary-clickable v3 で "ジャンプして飛ぶ" 動線が増えたぶん、**飛んだ先で迷子**になる確率が上がっている。
- **size**: **small**。祖先解決ロジック（structural relation を上にたどる）は既存 tree 計算の再利用可能。renderer に 1 セクション追加 + CSS。
- **arch risk**: **Low**。derive-only、reducer 変更なし。
- **recommended priority**: **P2**（small で daily 価値あり、P1 と独立）。

### 3.5 [launcher/extension] 候補 E — extension-originated capture with provenance

**概要**: PKC2-Extensions 側（browser extension / external host）から URL + selection を post すると、PKC2 が新規 text entry として受け取り、**作成時点で provenance metadata を付与**する（例: `conversion_kind: "external-capture"`, `source_url`, `captured_at`, `source_content_hash`）。受信プロトコルは既存 postMessage transport を再利用、provenance は v1 scheme に追従。

- **解決する user problem**: 外部コンテンツを PKC2 に落とすと "どこから来たか" が失われる。provenance wave で display / copy 基盤はあるので、**source** 側のパイプラインを通すと wave が real-world に接続する。
- **now が timing か**: **条件付き**。provenance の display 基盤が揃った今、source 側を作る意義は明確。ただし "extension 側" を同時に動かす必要があり、scope が 1 PR では閉じない可能性が高い。
- **size**: **medium–large**。receiver side（transport + reducer の capture action + provenance attach）は medium。sender side（extension UX）を含めると large。
- **arch risk**: **Medium**。transport 契約の拡張 + provenance schema を "external-capture" に足す判断 + 外部由来データの sanitization が焦点。
- **recommended priority**: **P5**（手を付けるなら receiver side だけ先に draft contract を書く）。

## 4. 優先順位

| 順位 | 候補 | 軸 | size | risk | 決め手 |
|---|---|---|---|---|---|
| **P1** | recent-entries pane | inbox | small | very low | S4 orphan marker と対をなす。scope が 1 PR で閉じる、derived-only、即価値 |
| **P2** | breadcrumb / path trail | navigation | small | low | jump 動線が増えた後の "迷子問題" 解消。P1 と独立、並行 or 直列どちらも可 |
| **P3** | entry-rename display freshness | editor | small（audit 主体） | low | 問題実証してから fix。audit 自体を 1 PR として出して OK |
| **P4** | saved searches | search | medium | low–medium | 使用実証（同じ filter を繰り返し組んでいる）が出てから投資 |
| **P5** | extension capture → provenance | extension | medium–large | medium | receiver 側の contract draft から。本体は wave 化する |

**観察**:

- P1 と P2 は **どちらも small / derived-only / 1 PR で閉じる**。連続して出すことも、片方だけでも良い
- P3 は "実害あるか audit する" ことが先。fix 前提で時間を取るのは早計
- P4 / P5 は単発 PR ではなく **小さな wave**（contract → 実装 → 補助）として扱う

## 5. 非採用 / defer 継続

以下は意図的に**本 memo では取らない**:

- **S5 orphan filter**: `unified-orphan-detection-v3-contract.md §7.4`。S4 marker で "気づき" は成立したため、filter は実需の積み上げ待ち。defer 継続
- **graph visualization**: 前提として本 memo で採らない（user 指示）
- **hook subscription / telemetry**: 同上、近い将来は入れない
- **per-field provenance copy**: `provenance-metadata-copy-export-v1.md §9` で scope 外確定済み
- **multi-relation bulk copy**: 同上
- **full-text search across all bodies のグローバル re-index**: sub-location-search の scope を超える。入れるなら別 contract が必要
- **source_container_cid → title lookup**: provenance copy/export v1 の §11 候補。スコープ増のため defer
- **provenance 以外 kind の metadata viewer 拡張**: 別 contract、本 memo では保留

## 6. 推奨次アクション

> **📌 2026-04-21 更新**: P1–P4 はすべて wave として着地済み（冒頭 As-of 表参照）。本節の当時の "P1 を次 PR に" 推奨は **完了扱い**。以下は **P5 Extension Capture** に絞って現時点の推奨を示す。

**次 PR**: **P5 — Extension Capture receiver side draft** を `docs/spec/record-offer-capture-profile.md` の docs-only PR として切る。

理由:

1. P5 以外の 4 候補は既に wave として閉じた（recent-entries pane / breadcrumb / rename freshness audit + title live refresh / saved searches）
2. `extension-capture-v0-draft.md` が 2026-04-21 時点で唯一の active candidate（HANDOVER_FINAL §22.2 / LEDGER §1.1 S-51 と整合）
3. receiver side を先に contract 化し、sender side（extension UX）は scope 外に据え置く方針が v0 draft 段階で固まっている
4. 直前 wave と同じく **contract-first → 実装 slice 分割** で進める

**保留で続ける**:

- hook subscription（canonical = `pkc-message-hook-subscription-decision.md`、現決定: Defer）
- graph visualization / telemetry（§5 と同じく永続的な non-goal）
- S5 orphan filter（`unified-orphan-detection-v3-contract.md §7.4`、実需待ち）

## 7. 関連文書

- `docs/development/archived/dead-path-cleanup/dead-code-inventory-after-relations-wave.md` — 直前の wave 閉幕 memo
- `docs/development/unified-orphan-detection-v3-contract.md` — S4 成立 / S5 defer 根拠
- `docs/development/connectedness-s4-v1.md` — orphan marker と対を考える出発点（→ P1 候補の根拠）
- `docs/development/references-summary-clickable-v3.md` — jump 動線の現状（→ P2 候補の根拠）
- `docs/development/search-ux-partial-reach.md` — search 基盤の現状（→ P4 候補の判断材料）
- `docs/development/provenance-metadata-copy-export-v1.md` §9 / §11 — provenance wave の scope 外 + 後続候補（→ P5 候補の根拠）
- `docs/development/archived/entry-autocomplete/entry-autocomplete-v1.3-recent-first.md` — recent "書き" 側の先行実装（→ P1 の自然な続き）
- `CLAUDE.md` §Invariants — "No premature abstraction"、本 memo の scope 判断の土台
