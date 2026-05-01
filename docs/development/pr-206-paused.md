# PR #206 — Caret ↔ Preview Sync(保留)

**Status**: ⛔ **PAUSED / RELEASE BLOCKED**(2026-05-01 ユーザー判断)
**Branch**: `claude/pkc2-caret-preview-sync-pr206`(commit: `dcfc9df`、v17 まで)
**PR**: <https://github.com/sm06224/PKC2/pull/206>(draft 化済み)

## なぜ保留か

ユーザー指摘(2026-05-01)を要約:

1. **「描画と生成を同じものとして受け取っている」** ─ 私の検証は `renderMarkdown` が anchor 属性を生成したか、`syncCaretToPreview` が `selectionStart` を変えたか、までしか確認していない。**「ユーザーが実際に見るピクセル」と「ユーザーが実際に行う操作」を経た結果**を assertion していない。生成 ≠ 描画。
2. **ユーザー側のデバッグ報告導線が無い**。「動かない」と言われたとき、こちらは推測でしか進められない。AppState / 直近 dispatch / DOM / 環境を**ユーザーが 1 アクションで吐き出して貼り付けられる**仕組みが存在しない。
3. **Playwright の programmatic click も実機検証ではない**。`locator.click()` は OS event を経由せず、また screenshot で「実際に何が見えていたか」を残していない。
4. **本実装は「動いている」と言える根拠が薄い**まま v17 まで積まれた。リリースしてはいけない。

## 到達点(2026-05-01 時点)

PR 上の commit に残っているもの。**これが「動く」とは私から保証しない**。検証の境界は次節を参照。

### 実装済み

- `src/features/markdown/markdown-render.ts`: `renderMarkdown(text, { sourceLineAnchors: true })` opt-in API。block tokens に `data-pkc-source-line` / `data-pkc-source-end` を付与。fence は per-line span で更に細粒度。
- `src/adapter/ui/source-preview-sync.ts`(新規): pure DOM 関数群。caret↔行 マッピング、preview 内 active block マーカー、editor caret marker、preview pane scroll、Y-fallback。
- `src/adapter/ui/action-binder.ts`: split editor preview に click handler を追加(inline 詳細ビュー)。`keyup` / `selectionchange` / `focus` で editor → preview 同期。
- `src/adapter/ui/entry-window.ts`(v17): popup window の split editor にも同等の click handler と anchor 付き render を移植。
- `src/adapter/ui/detail-presenter.ts`: 同期 ON/OFF トグル `⇄` ボタン。`localStorage` 永続化。iPhone 縦は default off。
- experimental debug overlay(v13): URL param `?pkc-sync-debug=1` または `localStorage.pkc2.sync-debug=1` で有効。caret y を viewport 横断する 1 px 線で可視化。**この URL-flag 方式が今後の reform 全体の出発点になる**。
- 単体テスト(vitest)27 件、Playwright smoke 6 件(inline 5 + popup 1)を追加。

### 関連 doc

- `docs/development/feature-requests-2026-04-28-roadmap.md` 領域 9 ─ WYSIWYG vision(将来計画)

## 検証の境界 ─ 「何を確認していて、何を確認していないか」

### 確認できていること

| Layer | カバレッジ | 結果 |
|---|---|---|
| 単体(合成 DOM) | `caretSourceLine` / `findPreviewElementForLine` / `findSourceLineByPoint` / `findSourceLineForElement` / `syncPreviewToCaret` / `syncCaretToPreview` などの純関数 | 27 / 27 pass |
| renderer DOM 生成(happy-dom) | `renderMarkdown` が anchor 属性を期待通り出力すること | pass |
| Playwright smoke(programmatic) | `locator(...).click()` で anchor 付き要素を programmatic にクリック → `selectionStart` が期待 offset へ | 6 / 6 pass |

### 確認**できていない**こと(release blocker)

- **実 OS マウス・指タップ**で人間が click した結果。Playwright の `locator.click()` は自前合成のクリックで、現実の pointer / focus / 視覚状態と必ずしも一致しない。
- **実際に画面に見えているもの**との一致。例えば preview の anchor 要素が `position`/`overflow`/`z-index` で**画面上は隠れているのに、test では visible 扱い**になっているケースを区別できていない。
- **screenshot による視覚回帰**。「動きとして合っている」「ズレが許容内」を判断する根拠が私にはない。
- **複数 platform**(Mac+Chrome / iPhone Safari / iPad / Android)。CI は chromium 1 種のみ。
- **長文・複雑構造下での体感**(50+ 行の本文、tall fence、巨大 table、ネストした list 等)。スクロール挙動・ズレ・取りこぼしを human verification していない。

私が「動く」と書いた v15 / v16 / v17 はすべて「**コード経路として通る**」段階の話で、ユーザーの実体験を保証していなかった。これが本 PR の最大の瑕疵。

## Release blocker としての扱い

`docs/development/release-blockers.md` 等で release を阻止する trigger が存在する場合は、本 doc を参照させて release blocker として認識させる。merge は**仕切り直し計画(下記)が landing し、新しい methodology の下で同等の機能を red-first で再構築するまで凍結**する。

## 仕切り直し計画(reform docs)

別 branch `claude/reform-2026-05-debug-and-parity` に同梱される 2 本 + 本 doc:

- `docs/development/debug-via-url-flag-protocol.md` — GET パラメータ方式の debug overlay / signaling 規約。ユーザーが実機で「動かない」と思った瞬間に、URL に `?pkc-debug=<feature>` を足して再操作 → 自動で AppState / 最近 dispatch / DOM / 環境情報を吐き出して clipboard にコピー、という導線を全 feature に適用する protocol。
- `docs/development/visual-state-parity-testing.md` — 「state を作る → 描画する → 実 viewport で `elementFromPoint` 確認 → 実 click → state 観察」という流れを feature ごとに必須にする methodology。programmatic click の test pass を「動く」とみなさない。
- `docs/development/pr-206-paused.md`(本 doc)。

reform docs が landing したら、本 PR の機能は新方針に従って red-first で書き直す(コードは現状を参考にしてよいが、検証は完全にやり直し)。

## 既存 commit の扱い

- **削除しない**。`claude/pkc2-caret-preview-sync-pr206` ブランチに v17 (`dcfc9df`)まで残す。
- 後続の re-implementation は「既存 commit の差分を見ながら、新 methodology で 1 機能ずつ green にしていく」進め方を取る。
- 既存実装の中で**新 methodology の検証を即パスできる部分**(例: `renderMarkdown` の anchor 生成は単体生成として正しい)があれば、そこから cherry-pick する形で再構築できる。

## ユーザーへの note

> 描画と生成を同じものとして受け取っている / 描画と操作を一致させなきゃいい物ができない / ユーザーがデバッグ報告するための導線がない

を実装責任者として真正面から受け止め、本 doc + 反省 + 仕切り直しの起点とする。本 PR の merge は、ユーザー判断で release ready が確認されるまで行わない。
