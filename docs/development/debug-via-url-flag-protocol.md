# Debug via URL Flag Protocol(ユーザー報告導線の統一規約)

**Status**: 設計 draft(2026-05-01)
**Owner**: PR #206 仕切り直しの一部、reform-2026-05
**前提**: PR #206 の experimental debug overlay(`?pkc-sync-debug=1` / `localStorage.pkc2.sync-debug`)が「ユーザーがデバッグ用の見え方を後付けで切り替えられる」点で良かった、という user feedback を全 feature の標準にする。

## 1. 解決したい問題

ユーザーが「動かない」「変な挙動になった」と言ったとき、現状こちら側にあるのは**自然言語の説明だけ**。再現するには:

- どの archetype / どの操作 / どの platform / どの状態か聞き返す
- それでも当たらないので推測ベースで「これかな」を順番に試す

これは本質的に **observability の欠如**で、ユーザーに余計な質問負担を強いている。本プロトコルはこれを変える。

## 2. 基本コンセプト

> **`?pkc-debug=<feature>` を URL に付けてもう一度操作すると、画面に当該 feature の overlay が出る。困った瞬間に "Report" ボタンを押すと、AppState / 直近 dispatch / DOM / 環境情報が JSON で clipboard にコピーされ、ユーザーはそれをそのまま issue / PR / Claude conversation に貼れる。**

すなわち feature ごとに「困ったらこれを ON にしてください」と言える URL flag があり、ON 時は

- 内部状態を可視化する overlay(該当 feature のもの)
- どこを通っているか見える instrumentation
- ボタン一発で「貼り付けるべき情報」を吐く dump 機能

がセットで提供される。

## 3. URL parameter 規約

### 3.1 名前空間

すべて `pkc-debug-*` または `pkc-debug=<list>` で統一する。

| 形式 | 意味 |
|---|---|
| `?pkc-debug=*` | 全 feature の debug overlay を有効化(開発用、性能落ちる) |
| `?pkc-debug=sync` | source-preview-sync の overlay 有効化 |
| `?pkc-debug=kanban` | kanban view の overlay |
| `?pkc-debug=sync,kanban` | カンマ区切りで複数 |
| `?pkc-debug-quiet=1` | 通常の debug 表示は出すが console.log を抑制 |
| `?pkc-debug-record=1` | dispatch 履歴を最大 N=100 件 ring buffer に保持(default OFF) |

`localStorage.pkc2.debug = 'sync,kanban'` でも同等(URL に書きたくない PWA / iPhone holdback 用)。URL が優先。

### 3.2 ランタイム判定 API

`src/runtime/debug-flags.ts`(新規):

```ts
export function isDebugEnabled(feature: string): boolean
export function debugFeatures(): Set<string>      // active な feature 名集合
export function dispatchDebugReport(): void       // ↓ 5 章の Report dump を発火
```

各 feature は `if (isDebugEnabled('sync')) { /* overlay */ }` で gate。default OFF。

## 4. Overlay と instrumentation

debug が ON の feature は次の 2 種を出す責任がある:

### 4.1 Visual overlay

**何が見えているはずか / 内部 state がそれと一致しているか** を可視化する。例:

- **sync**: caret y の横断線 / preview の active block 枠 / 一致しないときは赤
- **kanban**: dragging entry の hover status target がハイライト / drop ターゲット計算 zone を点線
- **calendar**: 表示中の今日マーカー / archived 隠しトグル状態

> 重要原則: **overlay は「state がこう言っている」を画面に出す**。「DOM がこう描かれている」ではない。state ↔ display の mismatch を発見させる目的。

overlay 要素は `data-pkc-debug="true"` 属性を必ず持たせ、screenshot regression や production console 検査時に切り分け可能にする。

### 4.2 Instrumentation hook

dispatch / 重要 lifecycle を ring buffer に積む:

```ts
recordDebugEvent({ kind: 'dispatch', action, before, after, ts })
recordDebugEvent({ kind: 'render', frame, ts })
recordDebugEvent({ kind: 'sync-click', target, line, offset, ts })
```

`?pkc-debug-record=1` または `?pkc-debug=*` で有効。最大 100 件 ring。Report に含める。

## 5. Report dump(ユーザーが貼り付けるもの)

### 5.1 トリガー

debug ON のとき、画面右下の小さな "🐞 Report" ボタンが出る。または `Alt+Shift+D`(キーバインド一案)。

### 5.2 出力内容(JSON)

```json
{
  "pkc": "2.x.y / commit / build-ts",
  "ts": "ISO-8601",
  "url": "<full URL with debug flags>",
  "ua": "<navigator.userAgent>",
  "viewport": { "w": 1280, "h": 800, "dpr": 2 },
  "pointer": { "coarse": false },
  "phase": "ready",
  "view": "detail",
  "selectedLid": "...",
  "editingLid": "...",
  "container": { "entryCount": 42, "relationCount": 17, "assetKeys": ["..."] },
  "recent": [
    { "kind": "dispatch", "action": {...}, "stateChanged": ["selectedLid"], "ts": "..." }
  ],
  "domSnapshot": {
    "rootClasses": "...",
    "phaseAttr": "ready",
    "scoped": {
      "split-editor": "<HTML scoped to active region or null>"
    }
  },
  "feature": {
    "sync": {
      "caretLine": 5,
      "activeAnchorLine": 5,
      "previewScrollTop": 320,
      "syncEnabled": true
    }
  },
  "screenshot": "data:image/png;base64,..."   // optional, ?pkc-debug-shot=1 で添付
}
```

### 5.3 出力先

- 第 1 候補: `navigator.clipboard.writeText(JSON.stringify(report, null, 2))` → 「クリップボードにコピーしました」トースト
- 第 2 候補(clipboard 失敗時): `<pre>` 全画面 modal で表示 → 全選択コピー
- `?pkc-debug-download=1` 指定時は `report-<ts>.json` で `download` 属性付き anchor

### 5.4 機密情報の扱い

本節の規律は **`docs/development/debug-privacy-philosophy.md` を上位規約**として運用する。最新の判断基準・graduated opt-in / schema versioning / 「拾わないか全部出すかの二択」方針はそちらを参照。本節は具体的な default 動作のサマリだけ残す:

- `container.entries[].body` は**デフォルトでは含めない**(本文は機密の可能性)。代わりに `entryCount` と archetype 別のサンプリングだけ。
- `container.assets` の base64 本体は**デフォルトでは含めない**(`assetKeys` の名前一覧のみ)。
- `screenshot` は default OFF。`?pkc-debug-shot=1` で明示的に opt-in したときのみ。
- 段階 β 以降の `recent[]` も同じ「拾わない or 全部出す」原則: `?pkc-debug-contents=1` を追加で立てたときだけ user content を含める(philosophy doc §4 原則 3 / §5-1 参照)。

これは「**ユーザーが書き換えなくても貼って安全な report**」を作るための default 原則であり、philosophy doc §4 原則 2(Privacy by default、structural-only)の現行表現。

## 6. Feature への組み込みフロー

新規 feature を実装するときの checklist:

1. URL flag を 1 つ予約(例: `?pkc-debug=table-interactive`)
2. `isDebugEnabled('table-interactive')` で gate した overlay を 1 つ実装
3. 重要分岐に `recordDebugEvent` を 1 行追加
4. Report の `feature.<name>` に当該 feature の内部状態を JSON 化する関数を登録
5. **その feature の Playwright test に `?pkc-debug=*` ブラウザを 1 ケース追加**(visual-state-parity-testing.md 参照)。`Report` ボタンを押したときのクリップボード内容を test で snapshot して、debug schema を保護する。

## 7. PR #206 への適用例

reform 後の sync feature では:

- `?pkc-debug=sync` で `caret horizontal line` / `preview active block の枠線` / `markers の clipping 範囲枠` がすべて画面に出る
- `Report` ボタン押下で `feature.sync` に `{ caretLine, activeAnchorLine, previewScrollTop, syncEnabled, sourceLineAnchorCount }` が含まれる
- ユーザーが「ジャンプしない」と言ったとき、URL に flag を足してから当該操作 → Report 押下 → JSON を貼り付け、で**こちら側が一発で「caretLine と activeAnchorLine が乖離している / sourceLineAnchorCount が 0(= anchor 落ちている)」のような root cause に当たれる**。

## 8. 段階導入

新規にすべて入れるのではなく、最低限から段階的に:

| 段階 | 範囲 | 完了基準 |
|---|---|---|
| α | `runtime/debug-flags.ts` + Report ボタン + 最小 dump(env / phase / selectedLid のみ) | URL flag が読める、Report が clipboard に何か入れる |
| β | `recordDebugEvent` ring buffer 導入、dispatch hook を 1 か所 | recent dispatch 10 件が Report に出る |
| γ | sync feature を最初の adopter として overlay + feature dump 完備 | PR #206 仕切り直し再着手の前提が揃う |
| δ | kanban / calendar / table-interactive の順で adopt | feature ごとに red-first できる土台 |

α は本 reform docs landing 後に着手、最大 1 PR で完了させる軽量なものを想定。

## 9. 非ゴール

- 自動 telemetry / analytics(privacy。ユーザーの明示操作で出る)
- production console.error の自動収集(別の責務)
- 既存 feature を**漏れなく**adopt させること(機械的にやらない、価値ある順に。レガシー feature は ad-hoc debug でよい)

## 10. リファレンス

- 既存 PoC: PR #206 v13 の `?pkc-sync-debug=1`(`localStorage.pkc2.sync-debug`)+ `pkc-sync-debug-line` 要素
- 関連: `docs/development/visual-state-parity-testing.md`(本 protocol を test 観点で活用)
- 関連: `docs/development/pr-206-paused.md`(なぜ仕切り直しか)
