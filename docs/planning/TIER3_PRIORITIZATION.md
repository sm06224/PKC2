# Tier 3 優先順位決定（分析・判断のみ）

**Status**: decision doc（Tier 3 キックオフ前の意思決定文書）
**Date**: 2026-04-14
**Positioning**: `HANDOVER_FINAL.md §18.5` で列挙された Tier 3 候補
（A〜E）の優先順位を確定する。本ドキュメントは **判断の固定** が
責務で、実装・擬似コード・ファイル編集案は一切含まない。

---

## 0. 前提

- Tier 1 / Tier 2 は完了（`HANDOVER_FINAL.md §18`）
- merge import spec は canonical として凍結済み
  （`docs/spec/merge-import-conflict-resolution.md`）
- PKC2 の主軸は **portable knowledge container**。OS 化 / P2P 化 /
  SaaS 化は前提にしない
- 評価軸は 6 軸（ユーザー価値 / 実装リスク / 既存アーキ整合性 / 仕様成
  熟度 / 着手容易度 / 伸びしろ）。High / Medium / Low + 理由

## 1. 結論（短く）

- **Tier 3-1**: **A. merge import 実装（Overlay MVP）**
- **Tier 3-2**: **D. release automation** + **C の軽量部分**（bundle
  size budget + E2E smoke baseline）
- **保留**: B（archetype 拡張）、C の重い部分（lint baseline 解消 /
  広範 E2E）、E（P2P / multi-window / i18n / multi-cid 等）

理由の一言: **「spec が凍結済みでユーザー価値が主軸に直結するもの」**
を最優先。**「配布を自動化して運用面を締める」** を 2 番手。それ以外
は「仕様化 or 要求観測」の前段階で止める。

## 2. 候補一覧（HANDOVER §18.5 からの再掲）

| 候補 | 概要 | spec 状態 |
|------|------|----------|
| A | merge import（Overlay MVP）実装 | canonical spec 凍結済み |
| B | archetype 拡張（complex / document-set / spreadsheet / template） | draft（80 行 × 7 本、`docs/development/data-model/`） |
| C | CI 強化（E2E / bundle size budget / lint baseline 解消 / release automation overlap） | spec 不要（実運用寄り） |
| D | release / distribution 強化（GitHub Release / artifact / v0.1.x 運用） | spec 不要 |
| E | 長期ビジョン（P2P / WebRTC / multi-window / message externalization / multi-cid / i18n） | vision 文書のみ |

## 3. 候補評価（6 軸）

High = 強い根拠あり / Medium = 条件付き / Low = 弱い。

### 3.1 A. merge import 実装

| 軸 | 評価 | 理由 |
|---|------|------|
| ユーザー価値 | **Medium-High** | portable knowledge container の "合流" は中核ユースケース。現段階で collision 事案は未観測だが、複数 HTML / ZIP を配布・集約する運用が可視化した時点で即必要になる |
| 実装リスク | **Low** | Option A は host 側を absolute に触らない append-only 契約（I-Merge1）。pure helper 層で全衝突解決が閉じる。regression surface は preview UI の mode radio 1 点のみ |
| 既存アーキ整合性 | **High** | full-replace 契約を 1 ビットも壊さない（I-Merge1 / spec §6.1）。5 層 / reducer / additive schema すべて維持 |
| 仕様成熟度 | **High** | canonical spec（13 章 500 行相当）凍結済み。非スコープ / 将来拡張も明示 |
| 着手容易度 | **High** | spec §10 の前提条件 4 項目（lid 採番 helper / asset 参照 rewrite helper / IMPORT_PREVIEW payload / preview DOM 構造）を実装前に読解確認するだけで開始できる |
| 伸びしろ | **High** | spec §9 に policy UI / staging / revision 持ち込み / diff export の 8 つの将来拡張が後付けで入る設計 |

**コメント**: 6 軸で High が 4 つ、Medium-High が 1 つ、Low が 0 個。
迷う要素がない。Tier 3-1 の第一候補。

### 3.2 B. archetype 拡張

| 軸 | 評価 | 理由 |
|---|------|------|
| ユーザー価値 | **Low-Medium** | 現状 `text` archetype + markdown table / YAML / code block で大半の表現は代替可能（HANDOVER §5.2 で同判断済み）。spreadsheet / document-set の本格ユースケースは要求が未観測 |
| 実装リスク | **Medium** | 新 presenter（render / edit / collect の 3 method）+ body-formats spec 追加 + asset 連動（spreadsheet なら CSV / XLSX）+ editor UI。surface が広い |
| 既存アーキ整合性 | **High** | archetype 拡張は設計上折り込み済み。`ArchetypeId` に追加、presenter registry 登録で済む |
| 仕様成熟度 | **Low-Medium** | 各 80 行 draft は構想段階で、`docs/spec/body-formats.md` に取り込まれていない。spec 化が先 |
| 着手容易度 | **Medium-Low** | spec 化セッションを 1 本挟む必要がある（draft → canonical spec） |
| 伸びしろ | **Medium** | user demand に依存。外部 .xlsx を container 内で扱えると価値は出るが、attachment archetype で代替している現状を逆転する理由が薄い |

**コメント**: spec 未成熟 + 要求未観測の 2 点で今やる理由が弱い。
**保留**。ユーザー要求が出てから「spec 化 → Tier 3-N で着手」の順で。

### 3.3 C. CI 強化

C は内部で粒度が分かれる。単一候補ではなく 4 サブ候補として評価する。

| サブ候補 | 実装リスク | 価値 | 判定 |
|---------|----------|------|------|
| **C-1**: bundle size budget（CI で dist/bundle.js が閾値超えたら fail） | **Low** | Medium | **採用（Tier 3-2 で）** |
| **C-2**: E2E smoke baseline（Playwright で起動 → 1 entry 作成 → export 読み込み） | **Low-Medium** | Medium | **採用（Tier 3-2 で）** |
| **C-3**: 広範 E2E（multi-select / kanban / calendar / import / export の flow） | Medium-High | Medium | **保留** — flaky リスク大、merge import 実装後に対象広げる方が自然 |
| **C-4**: lint baseline 解消（pre-existing 80 件 `no-restricted-imports`） | **Medium** | Low | **保留** — ESLint config 自体が CLAUDE.md の層規則と矛盾（HANDOVER §6.8）。config 再設計 PR で独立処理が筋 |

| 軸 | C-1 / C-2（採用分） | 理由 |
|---|------|------|
| ユーザー価値 | Low | 開発者体験寄り。ユーザーには見えない |
| 実装リスク | Low | ci.yml に step 追加するだけ |
| 既存アーキ整合性 | High | 既存 CI（Tier 1-1）の延長 |
| 仕様成熟度 | N/A | spec 不要 |
| 着手容易度 | High | 単発で閉じる |
| 伸びしろ | Medium | 将来 release 自動化と一体化できる |

**コメント**: C-1 / C-2 は **軽くて効くので Tier 3-2 に同梱**。
C-3 / C-4 は Tier 3-3 以降の宿題として保留。

### 3.4 D. release / distribution 強化

| 軸 | 評価 | 理由 |
|---|------|------|
| ユーザー価値 | **Medium** | v0.1.0 を GitHub Release として人に渡せる状態にする。配布物（`dist/pkc2.html` + `PKC2-Extensions/pkc2-manual.html`）をタグに自動アタッチすれば「URL 1 つで完結」になる |
| 実装リスク | **Low** | GitHub Actions + `gh release create` + artifact upload。CI と同じ基盤 |
| 既存アーキ整合性 | **High** | 既存 build flow の延長。production code に手を入れない |
| 仕様成熟度 | N/A | 実運用寄りで spec 不要 |
| 着手容易度 | **High** | yml 数十行で閉じる |
| 伸びしろ | **Low-Medium** | semver 管理 / changelog 自動化などは後続。但し本体 PKC2 の機能としての伸びしろは薄い |

**コメント**: 「開発ブランチ上の成果をユーザーに届ける最短距離」。
価値の天井は低いが費用が極めて低いため **Tier 3-2 に同梱**。

### 3.5 E. 長期ビジョン（P2P / multi-window / i18n / multi-cid）

| 軸 | 評価 | 理由 |
|---|------|------|
| ユーザー価値 | **High (if impl)** | 実装できれば価値は大きい。ただし現在の snapshot 共有 UX で overall には足りている |
| 実装リスク | **Very High** | CRDT / multi-container / transport 拡張 / i18n 基盤。いずれも Revision linear / single-cid の不変式を改造 |
| 既存アーキ整合性 | **Low** | I-Merge1 / I-AutoGC1 / 5 層構造との tension が大きい。tier 単発では収まらない refactor を要求する |
| 仕様成熟度 | **Low** | `docs/vision/` 相当で canonical spec 化されていない |
| 着手容易度 | **Very Low** | 設計再着手から |
| 伸びしろ | **Very High** | PKC2 を v1.x / v2.x の地平に引き上げる素材 |

**コメント**: 全て **保留**。v1.x 以降の大型テーマ扱いで、Tier 3 の
粒度に乗らない。

## 4. Tier 3 優先順位（確定）

### 4.1 Tier 3-1: 次にやる 1 個

**A. merge import 実装（Overlay MVP）**

- spec `docs/spec/merge-import-conflict-resolution.md` §7 を実装範囲
  の正本として着手
- 実装粒度: `features/import/merge-planner.ts`（pure 2 関数）+
  `IMPORT_PREVIEW` に `mode` field + `CONFIRM_MERGE_IMPORT` action
  + `CONTAINER_MERGED` event + preview UI の radio/件数サマリ
- テスト: 想定 20 件（spec §7.5）
- scope は **MVP に厳守**。Option B / C 要素は一切入れない（I-Merge2）

### 4.2 Tier 3-2: その次にやる 1〜2 個（並行可能）

**D. release automation** + **C の軽量部分（C-1 + C-2）** を **1 セッ
ションで** 合併して処理するのが筋。いずれも ci.yml に閉じ、
production code に触らない。

- D: `v*` tag push で GitHub Release 自動作成、`dist/pkc2.html` と
  `PKC2-Extensions/pkc2-manual.html` を artifact として添付
- C-1: bundle size budget（例: `bundle.js` > 600 KB で CI fail）
- C-2: Playwright smoke baseline（起動 → 新規 entry 作成 → HTML
  export ロードバック → 内容確認 の 1 flow）

Tier 3-2 の意図: **merge import 実装直後の "配布 + 回帰検知" を一段
固める**。C-2 は Tier 3-1 の成果（merge import UI）の E2E pin としても
後から使える。

### 4.3 保留（Tier 3-3 以降 or v1.x）

| 項目 | 理由 |
|-----|-----|
| B. archetype 拡張 | draft → canonical spec 化が先。要求が薄い |
| C-3. 広範 E2E | merge import 実装後に対象広げる方が自然 |
| C-4. lint baseline 解消 | ESLint config 再設計の別 PR |
| E.1 P2P / WebRTC | Revision linear モデルから再設計 |
| E.2 multi-window 協調 | message envelope 設計先行 |
| E.3 i18n 基盤 | 多言語要求が顕在化してから |
| E.4 multi-cid UI | Option C（staging）と合流する設計判断が先 |

## 5. やらない判断（ここで確定）

- **B / C-3 / C-4 / E を Tier 3 スコープから外す**。各々に記録済み
  の理由（§3.2 / §3.3 / §3.5）を根拠とする
- 「今はやらない」と「将来やらない」は別。本文書は **今はやらない**
  側の固定。将来やる判断は v1.x 計画時に別文書で決める
- 特に **archetype 拡張を今やらない** のは「spec 未成熟 + 要求未観
  測」の 2 軸で根拠が十分。Tier 3-N 単独で spec 化から着手する形が
  筋が良い

## 6. 推奨ロードマップ

3 段階で十分。各 Phase は 1 セッション相当。

### Phase A: Tier 3-1（merge import 実装）

- spec §10 の前提条件を確認（4 項目）
- 必要なら data-model.md §14.1 に I-IO1b を追記（spec §10.1）
- `features/import/merge-planner.ts` 追加 → `app-state.ts` に
  `CONFIRM_MERGE_IMPORT` 追加 → preview UI に mode radio
- テスト 20 件、orphan GC も merge 経路で発火（Tier 2-1 I-AutoGC1 の
  自然な拡張）
- 完了時に HANDOVER §18.7 に ✓、§18.5 A を閉じる

### Phase B: Tier 3-2（release automation + CI 軽量強化）

- `.github/workflows/release.yml` 新設（tag push → release 作成）
- `ci.yml` に bundle size budget step 追加
- Playwright smoke test を `tests/e2e/smoke.test.ts`（または
  `tests/e2e/playwright.config.ts` 経由）で 1 本追加
- 完了時に HANDOVER §18.5 C / D を閉じる

### Phase C: Tier 3-3 候補の再評価（実装ではなく選定）

- B（archetype）/ C-3（広範 E2E）/ C-4（lint baseline）のうち **どれ
  を Tier 3-3 にするか** を再議論するセッション
- この段階で v1.x テーマ（E 系）の優先順位も合わせて棚卸し

## 7. 実装に入る前提条件（Tier 3-1 向け）

次の実装者が Tier 3-1 を始める前に確認する 4 項目（spec §10.2 と同じ
だが、優先順位観点で再掲）:

1. **lid 採番 helper**: `src/core/operations/container-ops.ts` 内で
   「未使用 lid を生成する pure 関数」が切り出されているか。無ければ
   merge-planner から再利用できる形に切り出す（実装 commit の 1 つ目
   に入れる）
2. **body 内 `asset:<key>` 参照の抽出・書き換え helper**:
   `src/features/asset/` に該当関数があるか。無ければ追加
3. **`IMPORT_PREVIEW` payload の現状**: `mode: 'replace' | 'merge'`
   を optional で足しても既存 preview dialog が regression しない
   形になっているか
4. **import preview dialog の DOM 構造**: radio group を追加する余地
   があるか

**docs を先に足すべきか**:

- spec §10.1 の TODO（`data-model.md` §14.1 に I-IO1b 追加）は **実装
  PR の先頭 commit** で docs-only として入れる
- それ以外の docs 更新は不要。spec が canonical なので

**追加調査の要否**:

- **軽微なコード読解のみ** で十分。新しい設計判断は不要
- 4 項目のいずれかが「無い」と分かったら、その時点で Tier 3-1 を
  「helper 切り出し」と「merge 本体」の 2 commit に分割する

## 8. 次の実装者への申し送り

- **Tier 3-1 は MVP を厳守**。Option A / append-only / revision drop /
  host meta 温存 を動かさない（I-Merge1 / I-Merge2）
- **spec §8（非スコープ）の項目を実装に流し込まない**。per-entry 選
  択 UI / title-based identity / revision 持ち込みは将来拡張で、Tier
  3-1 の PR には含めない
- **テストは 20 件程度で完結**。過剰網羅せず spec §7.5 のリストに
  忠実に
- **regression 防止**: Tier 2-1 で追加した 3 経路の orphan auto-GC に
  `CONFIRM_MERGE_IMPORT` を **4 経路目** として wiring する（I-AutoGC1
  の自然な拡張。spec §7.1-9 も同旨）
- **Tier 3-2 は Tier 3-1 と独立**。先に Tier 3-1 をマージして main を
  更新してから、Tier 3-2 の branch を切るのが筋
- **`HANDOVER_FINAL.md §18.5 A` の完了マーク**を Tier 3-1 マージ時に
  追記する（§18.7 の表を 1 行拡張）

---

## 9. 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-14 | 初版作成（Tier 3 優先順位を確定：3-1 = merge import、3-2 = release automation + CI 軽量強化） |
