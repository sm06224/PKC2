# Split sync MacOS + Firefox 再調査(PR-XXX 2026-05-07)

**Status**: 🔍 INVESTIGATION ONLY(no code fix in this PR)
**Origin**: user 修正指示2 残「split sync MacOS+Firefox 再調査」
**Successor of**: `archived/pr-findings/pr-206-paused.md` + `split-view-sync-pr256-findings.md`

## 問題提起の現状

user 報告:**MacOS + Firefox** で split-sync(caret ↔ preview block 対応 highlight + scroll)が期待通り動作しない、と聞いている。具体 repro / pixel screenshot / DOM dump は未取得。本書は **code review ベースで Firefox 特有の挙動差を hypothesize し、user が repro を渡してくれた瞬間に Phase 8 順序性 / visual-state-parity test を red-first で書ける土台**を残すための investigation memo。

## コード read-through(2026-05-07 時点)

primary file: `src/adapter/ui/source-preview-sync.ts`(L1-820 程度)。critical entry points:

1. `caretSourceLine(textarea)` ─ pure。`selectionStart` を起点に `\n` 数。**Firefox 差異想定なし**。
2. `findPreviewElementForLine(preview, line)` ─ pure DOM 走査。**Firefox 差異想定なし**。
3. `syncPreviewToCaret(textarea, preview)` ─ caret → preview。`scrollIntoView({ block: 'center' })` を内部で呼ぶ可能性あり。**Firefox の smooth scroll は historically Chromium と timing 異なる**。
4. `syncCaretToPreview(textarea, preview, viewportY)` ─ preview click → caret。`textarea.selectionStart = offset; textarea.focus();` の順で text 更新。**Firefox は focus 前に selectionStart が一旦 0 にリセットされるバグが過去あった**(Bugzilla 753596 系)、現状の最新 Firefox では fix 済みのはず。
5. `markProgrammaticCaretMove() / consumeSelectionSuppression()` ─ feedback loop 抑止。`selectionchange` event の timing が Firefox では Chromium より遅延する傾向、suppression window 内に正しく drain されているか要確認。

## Firefox 特有の挙動差 hypothesis 3 件

### H1: `selectionchange` event が caret 移動より遅れて発火

- **影響**:`syncCaretToPreview` が `textarea.selectionStart = X; textarea.focus();` 後、Firefox は次の microtask で `selectionchange` を発火。その時点で suppression flag が **既に consume されて落ちて**おり、suppress に失敗 → ループ生起。
- **検証 plan**:`?pkc-debug=split-sync` overlay に `selectionchange` 発火時刻を追加表示、Firefox / Chromium で diff を取る。
- **fix shape**:`consumeSelectionSuppression` を Promise-based(microtask 1 拍 + rAF 1 拍まで持続)に bump。

### H2: `scrollIntoView({ behavior: 'smooth' })` が Firefox で長時間 block

- **影響**:smooth scroll が active 中に user が caret を動かすと、Firefox はインタラプトを Chromium ほど即時には反映しない。結果:**user 入力が「同期」によって妨害される体感**。
- **検証 plan**:Playwright で Firefox + macOS targeting、`scrollIntoView` を発射した直後に caret を動かし、scroll 位置が user 操作で奪取されるか測定。
- **fix shape**:Firefox 検出時のみ smooth → instant に degrade、または `scroll-behavior: auto` を CSS で強制。

### H3: `elementFromPoint(x, y)` が overflow: hidden の child を返さない

- **影響**:preview が `overflow: hidden` + scroll container 内にある場合、`syncCaretToPreview` の Y-fallback が **Firefox では `null` を返し、Chromium は内部要素を返す** ことがある(古い bug、最近の Firefox は fix だが retrieval test 必要)。
- **検証 plan**:happy-dom は `elementFromPoint` を mock 化していて、これだけは実 browser でないと検証不能。Playwright で実 Firefox + macOS で reproduce → screenshot diff。
- **fix shape**:fallback を `document.elementsFromPoint` (z-stack 全体) → `data-pkc-source-line` ancestor 探索に切替。

## 次 step:user 報告 → repro → red-first parity test

reform-2026-05 doctrine に従い、PR-XXX 後続(PR-XXX-2 等)では:

1. **user 操作 repro**:`?pkc-debug=split-sync` で Firefox 上の Report dump を取得。`docs/development/debug-via-url-flag-protocol.md` 経路。
2. **failing parity test**:`tests/smoke/split-sync-firefox-parity.spec.ts` を新規作成、当該 H1/H2/H3 のうち発火しているものを `elementFromPoint` + `page.mouse.click(x, y)` の OS event ベースで RED 化(Firefox project 追加が前提)。
3. **fix + green**:該当 hypothesis を defensive layer で潰す。Phase 8 順序性 doctrine を AND 条件で適用、state mutation → consumer behavior 観測点を full chain assert。

## Playwright Firefox project 追加(将来作業)

`tests/smoke/playwright.config.ts` に下記を追加すれば Firefox 実行可能:

```ts
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
],
```

CI image に `npx playwright install firefox` の追加が必要(2-3 min CI cost)。本 PR では含めない(repro が確定するまで cost を払わない判断)。

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-07 | 投機的 fix を入れない | repro 不在で「動いている方を壊す」リスク。code review + hypothesis のみ document |
| 2026-05-07 | Playwright Firefox 追加を deferred | CI cost vs investigation 値の trade-off。repro が確定したら同時に proj 追加 |

## 関連 doc

- `docs/development/archived/pr-findings/pr-206-paused.md`(原型 paused retrospective)
- `docs/development/split-view-sync-pr256-findings.md`(PR #256 reform-2026-05 着地版)
- `docs/development/visual-state-parity-testing.md`(parity test methodology)
- `docs/development/debug-via-url-flag-protocol.md`(repro 経路 protocol)
