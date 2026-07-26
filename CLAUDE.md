# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **2026-06 スリム化**:本書は「足す時代」の儀式過積載(reform-2026-05 Phase 1–11 の wave 規律堆積)を削ぎ、**削る/選る/着陸の時代**の運用へ書き換えた。削除前の全文は `docs/development/archived/CLAUDE-md-2026-05-pre-slim.md` に保存。詳細な方法論は本書末尾の参照 doc 群に残っている。

## Language Policy

- Internal reasoning MUST be in American English
- Final output MUST be in Japanese

## 会話・提示ルール(user 確立、2026-07。必ず遵守)

- **AskUserQuestion ツールは使わない**。質問・確認は必ず会話文で行う(ツール UI はコンテキストが抜ける、user 明示指示)
- **成果物は GitHub URL(rendered)で提示**。diff の貼り付けでは user に伝わらない
- **doc-first**: 実装前に設計 doc → GitHub URL で提示 → user 裁定 → 実装。裁定前に実装を進めない
- **意図を読む**: user の発言が事実と食い違っていても、関連する実態を探して会話で聞き返す(字義対応で突っ走らない)
- 直近セッションの成果・残件・教訓は `docs/development/session-handoff-2026-07-24.md`
- 🔑 **セッション引き継ぎは「引き継ぎ用の PR」で完成する(user 指示 2026-07-26)**。doc を書いただけ・
  会話に要約を書いただけでは完成していない ── 次セッションは会話履歴を持たないので、**1 個の PR URL に
  集約されている**ことが条件。**PR には引き継ぎ事項に加えて「最初の仕事の有無」を必ず含める**
  (あり / なし・指示待ち / なし・裁定待ち の 3 択。曖昧にすると次セッションが勝手に仕事を作る)。
  手順は `.claude/skills/session-handoff/SKILL.md`(`/handoff` は明示版)

## 資産の自己免疫整備(user 指示 2026-07-25。最優先・本節削除不可)

- **スキル / サブエージェント / コマンド / ルール(本書 CLAUDE.md 含む)の整備は今後も続ける。最優先であり、この方針自体を削除してはならない**。これらはこのリポジトリに参加するみんなの資産である
- **自己免疫的に整備する**: セッションで得た教訓・踏んだ罠は都度 `.claude/skills|agents|commands` と参照 doc に反映する。実態と乖離した記述(廃止済み flag への言及 / 変わった手順 / 壊れた導線)は見つけ次第その場で修正し、肥大した儀式は削る。資産は「書いた時」ではなく**「次に使う時」に正しくあること**
- 🚫 **免疫の不可侵領域(最重要)**: user 由来の**金言的プロンプト** — プライム・ディレクティブ、会話・提示ルール、裁定記録、本節、その他「user 確立 / user 指示 / user 裁定」の出典タグが付いた記述 — は自己免疫の**対象外**。**削除はもちろん、希釈・要約・言い換えによる骨抜きも禁止**。変更できるのは user の明示裁定のみ。整理で迷ったら「消す」ではなく会話で確認する
- 出典タグの規約: user の方針・裁定を資産に書き込むときは「(user 指示/裁定 YYYY-MM-DD)」を付ける。**タグ付き記述 = 不可侵**、が機械的な判定基準
- 🔑 **キーワード「`.claude更新`」(user 指示 2026-07-26)**: この語は
  **スキル / コマンド / ルール / エージェントの更新を指す合図**である
  (長い別名: 「着地後に知見を .claude に反映してくれ」)。出たら `.claude/skills/knowledge-reflection/SKILL.md`
  の手順で反映する(`/claude-update` は明示版)。**着地後**が既定 ── merge 前は「結局どう直したか」が
  確定しておらず、書いた内容が嘘になるため。ただし実態との乖離(廃止済み flag への言及 / 壊れた導線)は
  その場で直す

## 現在の運用方針(2026-06、最優先)

> **プライム・ディレクティブ:機能を足さない。削る・選る・着陸させる。**

- 単一正本 = `docs/development/v3-consolidation-and-direction-2026-06.md`(診断 / 凍結表 / 4 レーン / North Star)。**まずこれを読む**
- **live tracking は GitHub Issues が正本**(file ベース台帳は archive 済)。レーン: `lane:perf` / `lane:curation` / `lane:arch-v3` / `lane:process`、`frozen` = 凍結中・参照のみ
- 許可される作業: ① bug fix ② perf ③ ~~bundle 引き算(機能 subtract)~~(**2026-07-01 user 判断で撤回**:mermaid / Office export / chart.js は keep・むしろ強化対象。削減候補として蒸し返さない)④ main 着陸の取捨選択 ⑤ doc/process 整理 ⑥ 設計 doc(実装しない)
- **flag を畳むときの作法**(user 裁定 2026-07-26、`lazy_entry_bodies` の退役で確立):
`defineFlag` の `retired: true` を使う。**値の解決と一覧の両方**が塞がる
(URL / container の `__flags__` / Inspector 編集をすべて無視し、`getRegisteredFlags()` からも消える)。
⚠ **UI から消すだけでは足りない** ── URL flag で有効化できてしまう(2026-07-25 に移行前 ZIP ゲートで実際に踏んだ)。
⚠ **定義は消さない** ── getter が生きていないと、既に有効化された環境が「既定値へ戻る = 安全な形式へ書き戻る」
経路ごと失われる。⚠ **戻し道の安全性を先に確かめる** ── 退役は全 user をその経路に乗せるので、
そこが壊れていると廃止作業自体がデータを壊す(実際 `save()` に本文の未読ガードが無く、S3 として先に塞いだ)。
⚠ **「次回起動で強制マイグレーション」は既存 4 経路の合成で成立する**(2026-07-26、`differential_save` の退役で確立。
新しい移行コードを書かない ── 移行専用の書込経路こそが S3 で穴の空いていた場所である):
① retired = 保存の分岐が inline 側に固定される ② `CONTAINER_LOADED` が `SAVE_TRIGGERS` の一員 = 起動しただけで保存が走る
③ `main.ts` が `storedInline === false` のとき `notePersistedBaseline()` を**呼ばない**(#1024 の「変わっていないなら
書かない」最適化の carve-out)④ `save()` が旧形式の record を掃除する。
**4 つはどれも性能最適化で消えうる**ので、退役するなら 4 つとも test で pin する
(`tests/adapter/differential-save-retirement.test.ts`)。
退役済み: `persistence.lazy_entry_bodies`(3 ヶ月後に廃止予定)/ `persistence.differential_save`。

🚫 新 archetype / feature / markdown 方言 / UI mode の追加は**凍結**。user が「足したい」と言い出したら本方針を引いて一旦止め、Issue 化して優先度判断へ回す
- 凍結中の旧計画(8案v3 / Phase β / 68PR Phase γ / roadmap 領域)は frozen backlog issue #776 に保全

## Build & Development Commands

```bash
npm run build:bundle     # Vite build → dist/bundle.{js,css}
npm run build:release    # Bundle → single HTML (dist/pkc2.html)
npm run build            # Both steps

npm test                 # vitest run (all tests)
npx vitest run tests/adapter/renderer.test.ts  # single test file
npx vitest run -t "Todo Kanban"                # tests matching name

npm run typecheck        # tsc --noEmit
npm run lint             # eslint src/ tests/
npm run lint:fix         # eslint --fix
```

**Before every commit**: run `npm test` and `npm run build:bundle`. The dist files must be updated.

## Architecture: 5-Layer Structure

```
core/         → Domain model. Pure types + operations. NO browser APIs.
features/     → Pure algorithmic functions (filter, sort, tree, calendar, kanban).
               Imports from core (read-only types) only.
adapter/      → Runtime integration: state machine, UI rendering, persistence, transport.
  state/      → AppState + Dispatcher (Redux-like pure reducer)
  ui/         → renderer.ts, action-binder.ts, *-presenter.ts
  platform/   → IndexedDB, compression, export/import, embed detection
  transport/  → PostMessage protocol (PKC-Message) + pkc-ext 拡張チャネル(v2 spec §3.8)
runtime/      → Build constants, version, DOM slot contracts
main.ts       → Bootstrap: wires everything together
```

**Import rules**: core ← features ← adapter. Core never imports from adapter or features. Features never import from adapter. Adapter orchestrates everything.

**Path aliases** (tsconfig): `@core/*`, `@adapter/*`, `@features/*`, `@runtime/*`

## Data Model

**Container** is the top-level aggregate (source of truth):
- `entries: Entry[]` — fundamental data units, each with `lid`, `title`, `body` (string), `archetype`
- `relations: Relation[]` — structural, categorical, semantic, temporal links between entries
- `revisions: Revision[]` — historical snapshots of entries
- `assets: Record<string, string>` — base64 file data (separated from body)

**Archetypes**: `text | textlog | todo | form | attachment | folder | generic | opaque`
Each archetype has a **DetailPresenter** (registered at boot) that handles view/edit/collect for its body format.

**Todo body** is JSON stored as string: `{ status: 'open'|'done', description, date?, archived? }`

ストレージ層は `src/adapter/platform/storage/storage-adapter.ts` で抽象化済(idb / memory adapter)。**OPFS adapter は seam として予約済**(L3 #771、設計のみ)。

## State Machine

```
AppPhase: 'initializing' → 'ready' ↔ 'editing' / 'exporting' → 'error'
```

**Dispatchable** = `UserAction | SystemCommand` → pure **reducer** → `(state', DomainEvent[])`

Key state fields: `container`, `selectedLid`, `editingLid`, `viewMode ('detail'|'calendar'|'kanban'|'filer'|'launcher')`, `phase`

The **Dispatcher** is the single coordination point: dispatch → reduce → notify state listeners → emit events.

## Renderer / ActionBinder / Presenter Pattern

- **Renderer** (`renderer.ts`): pure function `render(state, root)` → DOM. Never reads DOM to derive state. Uses `data-pkc-*` attributes for all functional selectors (minify-safe).
- **ActionBinder** (`action-binder.ts`): event delegation on root via `data-pkc-action` attributes → dispatches UserActions. Never renders DOM.
- **DetailPresenter** (`detail-presenter.ts`): archetype-specific `renderBody` / `renderEditorBody` / `collectBody`. Registry pattern with text fallback.

## Key Conventions

- All functional DOM selectors use `data-pkc-*` attributes, never CSS class names
- `QUICK_UPDATE_ENTRY` updates body only (no title change, no phase transition). Used for inline ops like todo status toggle.
- `selectedLid` is the single source of truth for selection across all views
- `SET_VIEW_MODE` does NOT clear selection
- Todo helpers: `parseTodoBody()`, `serializeTodoBody()`, `formatTodoDate()`, `isTodoPastDue()`
- Kanban always excludes archived todos; Calendar respects `showArchived` flag
- `dispatcher.onState()` / `onEvent()` return an unsubscribe `() => void`. Shorter-lived subscriptions must capture and call it on teardown. See `docs/development/stale-listener-prevention.md`.

## Invariants

1. **5-layer structure** — no cross-layer violations
2. **core has NO browser APIs** — pure TypeScript only
3. **Single HTML product** — everything bundles into one file via `build/release-builder.ts`
4. **Container is source of truth** — UI state is runtime-only
5. **Backward compatibility** — never break existing data contracts。
   ⚠ **互換は双方向で考える**(2026-07-26、差分保存の退役で判明)。「新ビルドが旧データを
   読める」だけでは足りない ── PKC2 は**単一 HTML 製品で、user は旧 `pkc2.html` を手元に
   残す**ので、**旧ビルドが新データを読めるか**も互換の一部である。とくに危険なのは
   **「読み側に合流処理を足して両立させる」型の変更**(#1022 の `__rel__:` / `__order__:`
   サイドカー):新ビルドでは正しく動くので test が全部通り、**旧ビルドでだけ静かに欠損する**
   (relations が 0 件に見え、保存すると実際に消えた)。判定法 ──
   **「この変更を知らない読み手が core record だけを読んだら何が見えるか」を必ず書き出す**。
   pin の型は `tests/adapter/differential-save-retirement.test.ts`(旧ビルドの読み方を
   再現して assert する)
6. **No premature abstraction** — three similar lines > one premature helper

## Testing

- Vitest + happy-dom。test env は per-file:`/** @vitest-environment happy-dom */`
- Tests mirror src: `tests/adapter/`, `tests/core/`, `tests/features/`
- Renderer tests は `data-pkc-*` selector を region scope(`[data-pkc-region="..."]`)で query
- **描画と状態は別物**:vitest / happy-dom の pass は生成の正しさを示すだけで、ユーザー実機の視認を保証しない。**視覚を持つ feature**(click / hover / drag / overlay)は `elementFromPoint` / `page.mouse.click(x,y)` 経由の **visual parity test を最低 1 件**持つ。方法論は `docs/development/visual-state-parity-testing.md`
- 動的機構(flag / event 連携 / dispatch+副作用)は **state mutation → consumer 観測点(DOM 数値 / 表示要素数 / 副作用)** の end-to-end parity を assert(DOM attribute 遷移で止めない)
- **「量が多い」と「体感が悪い」は別の主張**(2026-07-26)。書込量・使用量の計器で出した数字を、そのまま
  「操作が重い」の根拠にしてはいけない(IDB の書込はメインスレッド外)。体感を語るなら long task か
  `Performance.getMetrics`(Script / Layout / RecalcStyle)を測る。実例: 既定パスは 1 編集 25.7MB 書いて
  いたが体感の主因は**描画**で、5000 行のサイドバーを編集の開始・確定のたびに作り直していた
- **性能の主張は数字を出す前に手法を固める**(2026-07-26、同一セッションで 6 回誤った反省)。手順とハーネスの使い分けは `.claude/skills/perf-measurement/SKILL.md`(`/measure` コマンド)。とくに:**ベンチ fixture のゼロ件の次元は「測っていない次元」**(`bench-fixtures/c-*.json` が revisions 0 件だったため歴代のベンチが全部 O(N×M) を素通りしていた)/ **対照群は「何もしない」ではなく「測りたい操作以外を全部同じにしたもの」** / **差し引きで出た値は向きのみ信頼し倍率は書かない** / **百分率は「どの実行の何に対する比率か」まで書く**

## PR / Wave 運用(slim)

肥大の根本原因は**儀式過積載で 1 PR が高コスト化 → 着地せず stack に逃げる**こと(50 PR 一本 stack の事故)。最小限の硬い規律に絞る:

1. **stack 上限を守る**:open PR が積み上がったら下から sequential merge で main を最新化してから次を積む。stacked PR の squash は **base retarget が先**(中間 branch 着地事故を防ぐ)
2. **bundle 予算監視**:`git diff --stat` + bundle サイズを毎 PR 確認。bundle.js は 5MB 級で CI size budget 内。**機能 subtract による削減は 2026-07-01 user 判断で撤回**(mermaid / Office export / chart.js は keep・強化対象)。新規の重い dep 追加は引き続き原則しない
3. **既存問題は別 hotfix PR**:wave に紛れ込ませず即剥がす
4. **視覚機能 PR は visual parity test 最低 1 件**(上記 Testing 参照)
5. **新 doc は同 commit で INDEX 登録**(`check:doc-orphans` CI)
6. **user-facing 変更はお知らせに掲載 + マニュアル反映**(2026-07-22 user 指示):UI・挙動・既定値が変わる PR は `src/adapter/ui/startup-notice.ts` の `STARTUP_NOTICES` 先頭 entry に 1 行追記(新リリース = 新 entry を先頭追加)。起動後カードとして user に届く。マニュアル更新は `.claude/skills/manual-maintenance/SKILL.md` の手順で(画像は `images/*.png` 相対パス、生成物も同 commit)
7. **merge は通常時 Claude が実行**(user 委任、2026-06-07)。手順は `.claude/skills/merge-on-green/SKILL.md`(branch 作り直し → CI 監視 cron → squash merge → main 同期)。CI 全 green + audit 通過 + scope 自己監査クリアを確認したうえで squash merge する。ただし次のいずれかに該当する時は merge せず**会話で** user 判断を仰ぐ:scope drift / 後方互換の破壊 / 大規模 refactor / 不可逆操作 / プライム・ディレクティブ(機能を足さない)や frozen 方針への抵触。確認が取れない・CI が green でないものは merge しない

PR の自己監査(scope drift / CI / unresolved / mergeable / 互換性 grep / bundle)は `docs/development/pr-review-checklist.md` を参照(必要時のみ、儀式化しない)。

### markdown 3 surface(新 markup / features 層 DOM 操作を触る時のみ)

markdown は 3 経路で独立 render:center pane(detail-presenter)/ Viewer popup(rendered-viewer、独立 document・inline `<style>`)/ Split View preview(`sourceLineAnchors` 経路)。新 markup 追加時は **3 surface 全部で確認**(base.css → Viewer inline style mirror、features 層 DOM 操作は rendered-viewer でも呼ぶ、preprocessor の行挿入は LineMap で原文 index に逆引き、fence 内は preprocessor skip)。詳細 `docs/development/css-architecture-audit-2026-05.md` §9.5。

## 参照 doc(詳細方法論)

- `docs/development/v3-consolidation-and-direction-2026-06.md` — **方針正本**
- `docs/development/session-handoff-2026-07-24.md` — 直近セッションの成果・残件・教訓(storage v3 P0〜P2 完了時点)
- `docs/development/storage-default-layout-decision-2026-07-26.md` — 既定 storage layout の再判定(差分保存の既定 ON 棄却 / layout 5 の判断保留とその理由 / 手法の訂正 2 件 / データ消失経路 S1〜S4)
- `docs/development/archived/CLAUDE-md-2026-05-pre-slim.md` — スリム化前の全文(reform-2026-05 Phase 1–11 の wave 規律詳細)
- `docs/development/visual-state-parity-testing.md` — parity test 方法論
- `docs/development/pr-review-checklist.md` — PR 自己監査の正本
- `docs/development/markdown-render-scope.md` — markdown render scope 規約
- `docs/development/doc-archival-discipline.md` — doc archive discipline
- `docs/development/debug-via-url-flag-protocol.md` — `?pkc-debug=<feature>` ユーザー報告導線
