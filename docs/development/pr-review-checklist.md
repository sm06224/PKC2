# PR Review Checklist — 2026-04-25

**目的**: PR を作成するたびに必ず通す監査手順を、`CLAUDE.md` のプロジェクト不変ルールから切り出した独立 doc。新規エージェント(Gemini 等)が体制に加わるときの onboard も兼ねる。

**運用者**: implementer 自身(現状は Claude)。一人体制なので「自分で書いて自分で audit」になるが、checklist で項目を明示することで盲点を減らす。

## 1. 体制の前提

2026-04-25 まで、本プロジェクトでは以下の 3 役が存在していた:

- **User**: 方針承認 + GitHub merge の最終決裁者
- **ChatGPT 統括役**: 次 wave 選定 + prompt 起草 + PR 作成時の監査
- **Claude(本エージェント)**: 実装担当

2026-04-25 以降は ChatGPT 統括役が外れ、**User と Claude の 2 名体制**(将来 Gemini が加わる可能性あり)。Claude が implementer + auditor を兼任することになり、**従来 ChatGPT が PR 作成時にやっていた監査を Claude 自身が必ず行う** 必要が生じた。本 doc はその監査手順を明文化する。

## 2. PR 作成時の監査(8 項目、必須)

PR を `mcp__github__create_pull_request` で作成した直後に、以下を **必ず** 実行する。1 項目でも未確認のまま「ユーザー側で merge 判断してよい状態です」と報告してはいけない。

### 2.1 Scope drift / 禁止事項チェック

- 着手時に合意した方針(直近 user message の prompt、関連 audit doc の決定、進行表上の current wave)から **外れた変更が混入していないか**
- 禁止事項(`prompt` 内の「禁止事項」「やらないこと」「Out of scope」セクション)に触れていないか
- `git diff --stat` で変更ファイル一覧を見て、scope と一致するか確認

**よくある drift 例**:
- docs-only audit のはずが src を触った
- 既存テストの assertion を勝手に書き換えた
- `SAFE_URL_RE` / schema / version / About / CHANGELOG / Known limitations を方針外で触った
- "1 PR で閉じる" と決めた範囲を超えて、関連する別 wave に踏み込んだ

### 2.2 CI checks の conclusion

- `mcp__github__pull_request_read` の `get_check_runs` で CI 状態を取得
- 通常 PKC2 の CI は **3 checks**: typecheck + test + build × 2 jobs + Playwright smoke (chromium)
- すべて `status: "completed"` かつ `conclusion: "success"` であることを確認
- `in_progress` / `queued` のままなら「CI 待機中」と明示し、green 後に再確認する旨を報告

### 2.3 Review comments / unresolved threads

- `get_review_comments` で `review_threads` を取得
- `totalCount === 0`(未解決スレッドゼロ)を確認
- もし指摘があれば、tractable / 自分で fix できるなら fix、ambiguous なら User に確認、no-action なら理由を明示

### 2.4 mergeable_state

- `get` で PR object を取得
- `state: "open"`, `mergeable: true`, `mergeable_state: "clean"` を確認
- `dirty`(conflict)なら rebase / merge から fix
- `unknown`(GitHub 側の判定中)なら少し待ってから再確認

### 2.5 PR body の Test plan checklist

- PR body に `- [ ]` で残っている manual 確認項目を確認
- ブラウザ目視確認系は **source-based confirmation** で代替可能なら埋める(grep / 既存 test の DOM-level assertion / contract 不変の証跡)
- どうしても browser を起動しないと確認できない項目は **未チェックのまま残す + 注記**(マージ後の任意タイミングで OK な旨)
- `mcp__github__update_pull_request` で body を更新

### 2.6 互換性 / contract grep

PR の性質に応じて以下を grep 確認:

- **schema bump 禁止 PR**: `schema_version` / `SCHEMA_VERSION` / `Entry.color_tag` / `Saved Search` などの schema-relevant location が touched なし
- **Slice 5+ 系 PR**: `.pkc-card-placeholder` / `data-pkc-card-*` / `navigate-card-ref` 等の既存 contract が byte-for-byte 維持
- **vocab cleanup 系 PR**: 取りこぼしがないか(grep で旧呼称が残っていないか)
- **a11y 改善系 PR**: 主要 interactive 要素の `role` / `tabindex` / `aria-*` が壊れていないか

### 2.7 Bundle / budget

CSS / JS が増減する PR では:

- `node build/check-bundle-size.cjs` の出力を **PR body に明記**
- `bundle.css` が **98 KB** の budget、`bundle.js` が **1536 KB** の budget を超えていないことを確認(budget は `build/check-bundle-size.cjs` で随時 bump、過去履歴は同 file のヘッダコメントに記録)
- headroom が **1 KB を切ったら**、次 PR(機能追加系)着手前に **dedicated bump PR** を検討する旨を follow-up に書く
- budget 引き上げは **専用 maintenance PR でしか行わない**(機能追加 PR と同居させない、PR #138 が前例)

### 2.8 Merge 判断の報告

上記 2.1〜2.7 が全部 OK なら:

> CI green / unresolved review なし / scope drift なし / source-based 確認 OK で、**ユーザー側で merge 判断してよい状態です**。

を最終メッセージで明示。Merge そのものは User が GitHub UI で実行する(branch protection を尊重 + 誤 merge による main 破壊回避)。

## 3. PR 作成前のセルフチェック(参考)

PR を作る **前に** やっておくと audit 段階で issue が出にくい:

- `git status` / `git diff --stat` で変更範囲を頭で想像できるか
- src / tests / dist のみ?docs もあるか?バランスは妥当か?
- `npm run typecheck` / `lint` / `test` / `build:bundle` / `check-bundle-size` / `build:release` を **必ず**(docs-only PR は test まで省略可、ただし grep 確認は必須)
- **`npm run check:docs` を必ず**(docs/ を 1 行でも触る PR は必須)。`check:doc-orphans` で `docs/development/` 配下の orphan 検出、`check:doc-deadlinks` で `docs/` 内 relative link の壊れを検出。CI で blocking。Phase 5 / reform-2026-05 で導入
- **`npm run test:smoke` を必ず**(src / tests / dist / build / 既存の adapter 層 / features 層 を触る PR は **必須**、docs-only PR は省略可)。CI 待ち時間の圧縮 + 視覚レイアウトの実ブラウザ確認(happy-dom では拾えない)を兼ねる。Playwright spec は `tests/smoke/`(`app-launch.spec.ts` + `manual-launch.spec.ts`)、ローカル実行 ~6 秒。失敗したら push しない / PR 開かない、root cause 修正してから再走らせる
- `npm run build:manual` は About / planning/18 / manual 07-09 を触ったときのみ
- INDEX エントリ + Last updated は最後に書く(bundle size 等の確定値が出てから)

## 4. 失敗パターン(過去事例から)

### 4.1 Stream idle / Request timeout

- **原因**: 大きな Write payload を一括投入しようとして response stream が idle 化
- **対策**: doc は 200 行前後を上限の目安、超えるなら skeleton を Write → 章ごとに Edit で追記。前置きや thinking を溜めず即 tool call。

### 4.2 build:bundle が dist/pkc2.html を消す

- **原因**: read-only audit 中に health check で `npm run build:bundle` だけ実行すると `dist/pkc2.html` が古いまま残ったり、別 commit で生成された html が上書きされたりする
- **対策**: read-only audit では `build:bundle` を **省略**(typecheck / lint / test / check-bundle-size のみ)、または直後に `build:release` も走らせて整合させる。

### 4.3 Last updated 履歴の run-on / マージミス

- **原因**: 「Last updated (previous)」を残そうとして edit で run-on を起こす
- **対策**: 古い Last updated は INDEX 表側に entry として残るので、ヘッダの Last updated は **最新 1 件だけ** にする。前 PR の経緯は新エントリ本文で「前 PR(#XXX)の経緯を継承」と書けば足りる。

### 4.4 audit と実装の数値の乖離

- **原因**: pre-build estimate と actual measured の差(例: pink contrast の rounding、bundle size の minify 後差分)
- **対策**: PR body と INDEX entry の数値は **build:bundle 実行後の actual measured 値で更新**。事前見積もりは「audit 時点」と注記して残す。

## 5. Gemini / 他エージェント参画時の onboard

将来 Gemini や別エージェントが implementer / auditor として加わる場合:

1. 本 doc + `CLAUDE.md` の "PR Workflow" 節を必ず読ませる
2. `docs/development/INDEX.md` の最新 entry 5〜10 件を読ませて、最近の wave 文脈を把握させる
3. `docs/spec/pkc-link-unification-v0.md` / `card-embed-presentation-v0.md` / `color-palette-v1.md` 等、現行の正本 spec を把握させる
4. 1 PR 目は **小さい docs-only PR** で start させ、本 checklist の 8 項目を全部踏ませる(見落としポイントの早期検知)

## 6. References

- `CLAUDE.md`: §PR Workflow / Review checklist(本 doc への cross-link)
- `docs/development/INDEX.md`: 過去 PR の audit 履歴
- `build/check-bundle-size.cjs`: budget 定義(現状 bundle.css 98 KB / bundle.js 1536 KB、PR #188 で 96 → 98 KB に bump、2026-04-25)
- `docs/development/archived/audits-2026-04/css-ui-debt-audit-2026-04-25.md`: CSS budget 棚卸し例
- `docs/development/card-widget-ui-v0-audit.md`: Slice 段階分け audit 例

---

**Status**: accepted(2026-04-25 着地)、Claude が PR 作成時に毎回参照する canonical reference。改訂は本 doc + CLAUDE.md の "PR Workflow" 節をセットで更新する。
