# VSCode 級マルチウィンドウ拡張 spec(2026-05-22)

**Status**:設計 spec(docs-only)。実装は Phase γ-A5 として段階着地予定。
**Trigger**:user direction(2026-05-22)「設計を先に、思い描くのは vscode
並みのマルチウィンドウ性能」。
**Predecessor**:
- [`phase-beta-group-a-shell-spec-2026-05.md`](./phase-beta-group-a-shell-spec-2026-05.md)
  §3 — γ-A3 最小マルチウィンドウ(**機能的に完了済**)
- [`../vision/pkc-multi-window-architecture.md`](../vision/pkc-multi-window-architecture.md)
  — vision(window role / layout 保存 / WindowBus)
**Scope**:γ-A3 で landing 済みの基盤の **上に積む** 4 拡張 ── window role
分離 / window layout 保存・復元 / 競合解決 UI 格上げ / window 間 entry 移動。

---

## §0 本書の位置付け

`phase-beta-group-a-shell-spec-2026-05.md` §3 が定義した **γ-A3 最小マルチ
ウィンドウ**(子 window で entry を開く / 複数同時 / main reload guard /
競合検知)は、同 spec §3.6 の実装記録どおり **機能的に完了**している
(`entry-window.ts` の既存機構 + `main-reload-guard.ts` 着地)。

本書はその基盤を **書き直さない**。基盤の上に「VSCode 級」を目指す 4 拡張を
spec 化する。vision doc が §6/§8 で挙げた window role / layout 保存 /
WindowBus を、現実の `entry-window` 機構に落とし込む。

「VSCode 級」は browser `window.open` の枠内での意味:複数 window が同じ
container を live に共有し、window ごとに役割と配置を持ち、再起動で配置を
復元できる ── を指す。OS-native window 管理や process 分離は **しない**
(vision §5、§2-3)。

---

## §1 現状の事実関係(γ-A3 基盤、本拡張の前提)

### §1.1 entry-window 機構(`src/adapter/ui/entry-window.ts`、約 3013 行)

- `openEntryWindow(entry, onSave?, assetContext?)` @ L542 ──
  `window.open('', 'pkc-entry-${lid}', 'width=720,height=600,menubar=no,toolbar=no')`
  で子 window を開き、`document.write()` で完全な HTML(inline `<script>`
  1200+ 行)を注入する。
- `openWindows: Map<lid, Window>` ── 子 window 一覧。dedup は **per-lid**
  (同 lid は 1 子 window、別 lid は複数同時 OK)。
- `getOpenEntryWindowLids(): string[]` @ L153 ── 開いている子 window の
  lid 一覧。`main-reload-guard` 等が参照する。
- 子 window の生死は 500ms `setInterval` polling(`child.closed`)で検知
  → `openWindows.delete` + listener 解除。
- archetype:text/textlog は markdown editor + view、attachment は MIME
  preview card、todo/form は field editor。

### §1.2 postMessage protocol(現 9 type)

| dir | type | payload |
|---|---|---|
| P→C | `pkc-entry-init` | `{ entry, readonly }` |
| C→P | `pkc-entry-save` | `{ lid, title, body, openedAt }` |
| P→C | `pkc-entry-saved` | `{}` |
| P→C | `pkc-entry-conflict` | `{ message }` |
| C→P | `pkc-entry-task-toggle` | `{ lid, taskIndex, logId }` |
| C→P | `pkc-entry-download-asset` | `{ assetKey }` |
| P→C | `pkc-entry-update-preview-ctx` | `{ previewCtx }` |
| P→C | `pkc-entry-update-view-body` | `{ viewBody }` |
| P→C | `pkc-entry-update-title` | `{ title }` |

raw `postMessage(…, '*')`、同一 origin 信頼(`document.write` 注入のため
子 window は親と同一 origin / 同一信頼領域)。

### §1.3 不変条件:main = 単一権威

- **main window だけが dispatch する**。子 window は dispatcher を持たない。
- **main window だけが IndexedDB に書く**(`persistence.ts`、debounce
  300ms)。
- 子 window の編集は `pkc-entry-save` → main の `onSave` callback →
  `BEGIN_EDIT` + `COMMIT_EDIT` dispatch → reducer → persistence、という
  一本道。
- → **子 window が main の dispatch / IDB を奪い合う race は構造的に発生
  しない**。base spec §1.6 が懸念した risk は entry-window の設計で既に
  解消済み。

本拡張は **この不変条件を死守する**(§2-1)。VSCode 級 UX を、単一権威
データモデルの上で実現する。

### §1.4 main reload guard(`src/adapter/ui/main-reload-guard.ts`)

`installMainReloadGuard(getOpenEntryWindowLids)` が `beforeunload` listener
を張り、`shouldGuardReload`(flag ON かつ子 window ≥ 1)なら native 確認
ダイアログを出す。flag `shell.main_reload_guard`(default OFF)。

### §1.5 競合検知(γ-A3、検知のみ)

- entry-window 経路:`pkc-entry-save` の `openedAt` と現 `updated_at` を
  main が比較 → 不一致なら `pkc-entry-conflict` を子へ返す。
- main 経路:dual-edit-safety(`captureEditBase` / `checkSaveConflict` /
  `EditBaseSnapshot`、`docs/spec/dual-edit-safety-v1-behavior-contract.md`)。
  衝突時 `state.dualEditConflict` に park、resolution は
  **discard / copy-to-clipboard / branch** の 3 択。
- **解決 UI は文字どおり「3 択ボタン」のみ。差分表示は無い。**

### §1.6 基盤で「VSCode 級」に足りないもの(本書の対象)

| # | 不足 | 本書 § |
|---|---|---|
| E1 | window に role が無い(全部「entry 編集窓」) | §3 |
| E2 | window 配置(geometry / 開いていた entry)が再起動で失われる | §4 |
| E3 | 競合解決が 3 ボタンのみ、差分が見えない | §5 |
| E4 | window 間で entry を移す手段が無い | §6 |

---

## §2 不変条件(本拡張で死守する 4 点)

1. **single authority** ── main が唯一の dispatcher / IDB writer(§1.3)。
   子 window は postMessage で main に依頼する UI satellite に留める。
   monitor / viewer も IDB を直接読まない。
2. **opt-in / no-op default** ── 全機能 Tier 0 flag、default OFF。flag OFF
   出荷時は現挙動と完全一致(γ-A stack の「全 flag OFF 出荷」方針を継承)。
3. **browser 制約の正直さ** ── vision §5「やらないこと」を踏襲:worker 化
   しない / OS-native window 管理しない / 楽観的 auto-merge(CRDT)しない /
   別 container 跨ぎ同期しない。本書は browser `window.open` の枠内で設計
   し、できないことを open question に正直に残す。
4. **backward compat** ── 既存 entry-window 経路(double-click 編集)は不変。
   新 message type は **追加のみ**、既存 9 type は保持。

---

## §3 E1 — window role 分離(editor / viewer / monitor)

### §3.1 3 role 定義

| role | 役割 | content | 編集 | data 鮮度 |
|---|---|---|---|---|
| `editor` | entry を編集(現 entry-window) | editor + split preview | ○ | 自分が source |
| `viewer` | entry を **読むだけ**(参照用) | render only、edit affordance 無し | ✕ | main から push |
| `monitor` | container 横断の **ライブ panel** | TOC / recent log / search / calendar | ✕ | main から push |

- **editor** は実装済(現 `openEntryWindow`)。
- **viewer** は editor から edit affordance(Save / 編集ペイン / Ctrl+S)を
  抑止するだけ ── 規模:小。「別 entry を参照しながら書く」用途。
- **monitor** は entry に紐づかない。container 全体の派生 view を出す ──
  規模:中〜大。マルチディスプレイで「TOC を常時表示」(vision §3)。

### §3.2 role 指定経路 ── `openEntryWindow` → `openWindow(spec)` 一般化

```ts
interface WindowSpec {
  role: 'editor' | 'viewer' | 'monitor';
  lid?: string;           // editor / viewer は必須、monitor は任意
  monitorKind?: 'toc' | 'recent' | 'search' | 'calendar';  // monitor のみ
  geometry?: WindowGeometry;  // §4
}
```

- `window.open` の name を `pkc-${role}-${lid ?? monitorKind}` に拡張
  ── role 別 dedup(同 entry に editor と viewer を 1 つずつ持てる)。
- 既存 `openEntryWindow(entry, onSave, ctx)` は `openWindow({ role:
  'editor', lid })` への **薄い wrapper** として残す(backward compat)。
- 各 window に open 時 main が一意 `windowId` を採番(§7)。

### §3.3 monitor role の live-data 購読

monitor は container 変更に追従する必要がある。新 message:
- `pkc-monitor-subscribe`(C→P)── monitor boot 時 `{ windowId,
  monitorKind }`。
- `pkc-monitor-update`(P→C)── main が関連 domain event 後に派生 data を
  push。

main は購読中 monitor を `monitorWindows: Map<windowId, monitorKind>` で
保持、`dispatcher.onEvent` で該当 event 時に派生 data を再計算 → push する。
**monitor も IDB を読まない**(§2-1)── 派生は main の `state.container`
から計算する。

### §3.4 editor → viewer / monitor の保存時反映(「真のマルチウィンドウ」)

複数 window が同じ entry を **別 role** で同時に開ける(§3.2、window name
`pkc-${role}-${lid}` で role 別 dedup)。典型シナリオ:

- window A = entry L の **editor**(window 内に split preview を持つ ──
  **同一 window 内**のプレビューは従来どおり打鍵ごとに live)
- window B = entry L の **viewer**(プレビューのみ分離した別 window)

window A で **保存**すると:

1. A → `pkc-entry-save` → main
2. main の reducer が container を更新(§1.3 single authority)
3. main が **同 lid を映す全 viewer**(と関連 monitor)に更新を push
   (`pkc-entry-update-view-body` / `pkc-monitor-update`、§7)
4. window B の viewer が再レンダリング

→「window A で書いて保存」→「window B が反映」が成立する。これが
**真のマルチウィンドウ** ── 各 window は独立した popup ではなく、main を
単一権威として **協調**する。1 window = 1 role(1 作業に特化)でも、
editor 1 window で編集 + split preview を兼ねるのでも、どちらも選べる。

**反映タイミング**:cross-window は **保存時**(同一 window 内 split
preview は live のまま)。未保存 draft は別 window へ push しない ──
中途半端な打鍵状態を他 window に出さない。これは user direction
(2026-05-22「編集保存時にレンダリング反映」)に一致し、OQ-MW-5 を
解決する。

---

## §4 E2 — window layout 保存 / 復元

### §4.1 永続化するもの

`WindowGeometry = { screenX, screenY, outerWidth, outerHeight }`。子 window
は自 geometry を読める(`window.screenX` 等)。

保存単位:`WindowLayoutEntry = { role, lid?, monitorKind?, geometry }`、
layout = その配列。

### §4.2 永続化先

`localStorage['pkc2.windowLayout']`(H-7 pane-prefs と同じ localStorage
流儀)。**container には入れない** ── window 配置は端末固有 = runtime 設定
であり、export HTML に同伴させない(別ディスプレイ構成の受信者で無意味)。

子 window は `pkc-window-geometry`(C→P、close 直前 + 定期)で自 geometry
を報告、main が layout を localStorage に書く。

### §4.3 復元 UX(browser popup 制約)

**制約**:`window.open` を **複数**呼ぶには user activation が要る。1 user
gesture 中の 2 つ目以降の `window.open` は popup blocker に阻まれ得る。
VSCode(native app)と異なり browser はここを保証しない(vision §5
「OS-native window 管理しない」)。

**設計**:
- boot 時、保存 layout があれば main に「前回のウィンドウ(N 件)を復元」
  ボタンを出す。
- ボタン click(= user gesture)で N 件を順に `window.open`。blocker で
  開けなかった分は「残り M 件 ── クリックで開く」を再掲する。
- **自動復元はしない**(gesture 無し → 全 blocked)。明示 1 click 起点。

### §4.4 per-window 状態(OQ-A-5 への回答)

geometry に加え、各 window の scroll 位置 / editMode も `WindowLayoutEntry`
に optional 追加できる。**v1 は geometry + role + lid のみ**。scroll /
editMode の保存は後続(YAGNI、§10 OQ-MW-2)。

---

## §5 E3 — 競合解決 UI の格上げ

### §5.1 現状

§1.5 のとおり discard / copy / branch の 3 ボタンのみ。user は「自分の
draft」と「他者の現行」の **差が見えないまま** 選ばされる。

### §5.2 拡張:side-by-side diff view

`dualEditConflict` overlay に **2 ペイン読み取り専用 diff**(左 = 現
container の body / 右 = 自分の draft、行単位 diff ハイライト)を追加する。
3 ボタンの選択肢自体は不変。

- diff 計算は features 層の純関数(`src/features/diff/` 新規、行 LCS)。
- **merge editor は作らない** ── vision §5「楽観的 merge / CRDT に踏み
  込まない」を尊重。user は差を **見て** discard か branch を選ぶ。手で
  混ぜたければ branch して 2 entry を見比べる。
- base spec §3.5 が書いた「3-pane 手動 merge」は **2-pane diff view に
  縮小**する(§10 OQ-MW-3 で最終確認)。

### §5.3 entry-window 経路との統合

子 window 側 `pkc-entry-conflict` は、message を `{ message, currentBody }`
に拡張する。子 window は main の overlay DOM を共有できないため、子 window
内で 2-pane diff を **自前描画**する。diff の **計算** は子 window から
`window.opener` 経由で features 層の diff 純関数を呼び **データ**で受け取る
(既存の `window.opener.pkcRenderMarkdown` 等と同じパターン)── main が
diff 済み HTML を組んで push する案は canvas 化非互換のため採らない
(§11.3)。

---

## §6 E4 — window 間 entry 移動

### §6.1 「新しいウィンドウで開く / 送る」command(v1 scope)

- 任意の entry に対し context menu / command palette から
  **「新しいウィンドウで開く」**(role 選択 = editor / viewer)。
- 既に別 window で開いている entry は foreground する(現 dedup focus の
  延長)。
- 実体は §3 の `openWindow(spec)` を呼ぶだけ。**v1 はここまで**。

### §6.2 drag(将来拡張)

window 間の HTML5 native drag-and-drop は `dataTransfer` が cross-window
で保たれず browser 差が大きい。postMessage 協調 drag(`dragstart` を全
window に broadcast → 対象 window が drop 受理 → main に通知)は実装可能
だが fiddly。**v1 scope 外**(§10 OQ-MW-4)。「送る」command で恒久的に
足りる可能性が高い。

---

## §7 postMessage protocol 拡張

§1.2 の現 9 type は **保持**。新規(すべて追加):

| dir | type | payload | 用途 |
|---|---|---|---|
| C→P | `pkc-window-geometry` | `{ windowId, geometry }` | layout 保存(§4)|
| C→P | `pkc-monitor-subscribe` | `{ windowId, monitorKind }` | monitor 購読(§3.3)|
| P→C | `pkc-monitor-update` | `{ derived }` | monitor data push(§3.3)|
| P→C | `pkc-entry-conflict`(拡張)| `+ { currentBody }` | 子 window diff view(§5.3)|

`windowId` = open 時に main が採番する一意 id。同 lid で role 違いの window
(editor + viewer)を区別するために必要。既存 per-lid dedup は role 込みの
`pkc-${role}-${lid}` name dedup に置き換わる。

---

## §8 Tier 0 flag / migration

| flag | default | 効果 |
|---|---|---|
| `shell.window_roles`(新)| OFF | viewer / monitor role を有効化。OFF なら editor のみ(現挙動)|
| `shell.window_layout_persist`(新)| OFF | layout 保存・復元ボタンを有効化 |
| `shell.conflict_diff_view`(新)| OFF | 競合 overlay / `pkc-entry-conflict` に diff ペインを追加 |
| `shell.edit_mode_enabled`(既存)| — | 不変 |
| `shell.main_reload_guard`(既存)| OFF | 不変 |

全 default OFF。flag OFF 出荷 = 現挙動 no-op。採用時に user が ON にする。

---

## §9 実装スライス(推奨 PR 順、Phase γ-A5)

user direction「window role を先に → layout 永続化、競合 UI は独立」を反映:

| slice | scope | 規模 | 状態 |
|---|---|---|---|
| A5-1 | `openEntryWindow` → viewer role 一般化 | 小 | **完了**(pgc-68)|
| A5-2 | monitor role(toc)+ `pkc-monitor-*` | 中 | **完了**(pgc-69、`recent` は A5-6 後追い)|
| A5-3 | `pkc-window-geometry` + layout の localStorage 保存 | 小 | **完了**(pgc-70)|
| A5-4 | layout 復元プロンプト(popup 制約対応)| 小〜中 | **完了**(pgc-71)|
| A5-5 | 競合 diff view(features 層 diff 純関数 + overlay 2-pane)| 中 | **完了**(pgc-72 main overlay、pgc-75 §5.3 子 window)|
| A5-6 | 「別ウィンドウで開く」context menu 動線 | 小 | **完了**(pgc-74、user 報告対応)|
| A5-7 | visual parity test + 各 flag default 判断 | 小 | **保留** ── 本環境で Playwright chromium が DL 不可。γ-A5 の全 flag は default OFF 維持、parity 検証(実ブラウザ / CI)後に default ON を判断する |

各 slice = 1 PR、Tier 0 flag で gate。A5-1〜A5-6 + §5.3 は unit test
約 90 件で orchestration を被覆。A5-7 の視覚 parity は browser 環境
回復後 or CI で実施し、それまで `shell.window_roles` /
`shell.window_layout_persist` / `shell.conflict_diff_view` は OFF 出荷。

**bugfix(pgc-73)**:γ-A3 の `BEGIN_EDIT` childWindowLids ガードが子窓
自身の save 経路まで弾いていた不具合を、`BEGIN_EDIT.windowSave` 免除で
修正(user 報告「別窓 Save が main に伝搬しない」)。

---

## §10 open questions

- **OQ-MW-1**:monitor role の初期 kind は `toc` / `recent` の 2 種で
  足りるか? `search` / `calendar` monitor は需要次第。
- **OQ-MW-2**:per-window の scroll / editMode 復元は v1 で要るか、
  geometry のみで足りるか。
- **OQ-MW-3**:競合解決は 2-pane diff view(見るだけ)で確定か、将来
  3-pane 手動 merge まで行くか(vision §5 は **楽観的** merge を禁止 ──
  手動 merge は禁止対象外、ただし規模大)。diff の描画方式は §11.3 で
  「データ経路・子 window 自前描画」に確定済。
- **OQ-MW-4**:window 間 drag を将来やるか、「送る」command で恒久的に
  足りるとするか。
- ~~**OQ-MW-5**~~:**解決済**(user direction 2026-05-22)── viewer /
  monitor への cross-window 反映は **保存時のみ**(保存済のみ反映、未保存
  draft は push しない)。同一 window 内 split preview は live のまま。
  §3.4 参照。

---

## §11 canvas 化(Phase δ)との前方互換性

v3 提案 #2 + #8(editor / parser core の wasm 化 + 編集・レンダリング両面の
canvas 化)は Phase δ で v2.x とは別 line(別 repo branch、switchover 方式)
として進む。本 spec が canvas 化後も生き残るかを整理する。

### §11.1 層が直交している

本 spec が扱うのは **window orchestration 層**(window を開く / role を
与える / geometry を持つ / postMessage で繋ぐ / 単一権威データモデル)。
canvas 化が書き換えるのは **rendering surface 層**(window の中身を
textarea + DOM で描くか canvas で描くか)。この 2 層は直交する ── canvas
化しても browser window は browser window のままで、`window.open` /
postMessage / IndexedDB / dispatcher は不変。

### §11.2 そのまま carry over するもの

- **§2-1 single authority** ── main = 唯一の dispatcher / IDB writer。
  canvas 化は core / features(pure 層)を温存し adapter/ui の描画のみ
  書き換えるため、データ・状態アーキテクチャは不変。
- **§3 role 概念** ── editor / viewer / monitor は「振る舞いの種別」で
  あり DOM 構造ではない。canvas window にも同じ role がそのまま載る。
- **§4 layout(geometry)** ── `window.screenX/Y/outerWidth/Height` +
  localStorage。描画方式と完全に無関係。
- **§7 postMessage protocol** ── window 間の通信契約。canvas 化で window
  の数や繋ぎ方は変わらない。

### §11.3 canvas 化を見据えた設計判断

本 spec の新 message は **すべて「データ」を運び、描画済み HTML を運ば
ない**:`pkc-window-geometry`(数値)/ `pkc-monitor-update`(`derived`
データ)/ `pkc-entry-conflict` 拡張(`currentBody` = 文字列)。canvas
renderer はデータを受け取り自前で paint できる ── HTML 文字列を inject
する設計だと canvas 化で破綻するため、本 spec は最初からデータ経路を採る。

(対照:既存 `pkc-entry-update-view-body` は HTML 文字列を push する旧式。
これは本 spec の導入ではなく γ-A3 以前からの既存 message で、canvas 化時
に data 経路へ要改修 ── 本 spec の責務外だが記録する。)

§5 競合 diff も **features 層の純関数**(`src/features/diff/`)として定義
する。純関数は DOM にも canvas にも依存しない ── canvas 化後は diff の
**描画**だけ canvas に差し替わり、diff の **計算**は不変。§5.3 が子
window 側で diff を「データ経由で受け取り自前描画」とするのもこの理由。

### §11.4 caveat

- canvas 化は v3.0 の **rewrite / switchover**。「互換」とは **設計概念が
  carry over する**意であり、v2.x の DOM 実装がそのまま動く意ではない。
  viewer / monitor / diff の **描画コード**は canvas 用に書き直される
  ── ただしこれは v2.x UI 全般に言えることで、本 spec 固有の弱点ではない。
- canvas 化が同時にデータモデルを `body: string` から内部中間表現(IR /
  AST、`src/features/ast/` 既存)へ移す場合、diff の粒度は行ベースから
  block / AST ベースへ **格上げ**され得る。その場合も window orchestration
  層(本 spec の主題)は無影響、diff 純関数の差し替えで済む。
- 本 spec の orchestration 層(`openWindow(spec)` + role + postMessage)は
  vision doc §6 が構想する `WindowBus` 抽象の実体に相当する ── canvas
  時代に再利用される resilient な部品。

### §11.5 結論

本 spec は canvas 化と **直交し、前方互換**。window orchestration の設計
概念(role / geometry / single authority / data 経路の message)はそのまま
v3.0 canvas line に carry over する。canvas 固有で書き直すのは各 role の
**中身の描画**のみで、それは canvas 化の本来の仕事そのもの ── 本 spec が
それを阻害する箇所は無い。

---

## §12 関連 doc / history

- [`phase-beta-group-a-shell-spec-2026-05.md`](./phase-beta-group-a-shell-spec-2026-05.md)
  §3 — γ-A3 基盤(本書の前提)
- [`../vision/pkc-multi-window-architecture.md`](../vision/pkc-multi-window-architecture.md)
  — vision(window role / layout / WindowBus)
- [`../spec/dual-edit-safety-v1-behavior-contract.md`](../spec/dual-edit-safety-v1-behavior-contract.md)
  — 競合検知の既存契約(§5 が UI 面を格上げ、契約自体は不変)
- [`phase-gamma-implementation-wave-map-2026-05.md`](./phase-gamma-implementation-wave-map-2026-05.md)
  — γ-A wave map(本書は γ-A5 として後段に追加)

| date | event |
|---|---|
| 2026-05-22 | 本書起こし。user direction「VSCode 並みのマルチウィンドウ、設計を先に」。γ-A3 基盤が機能的完了済であることを code(`entry-window.ts` / `main-reload-guard.ts`)+ shell spec §3.6 で確認し、その上に積む 4 拡張(role / layout / diff / 移動)を spec 化。重複 spec ではなく **拡張 spec** |
| 2026-05-22 | user 質問「canvas 化に対応可能か」を受け §11「canvas 化(Phase δ)との前方互換性」を追加。本 spec は window orchestration 層、canvas 化は rendering surface 層で直交 ── 前方互換と結論。併せて §5.3 / OQ-MW-3 を「diff はデータ経路・子 window 自前描画」に確定(HTML push 案は canvas 非互換のため不採用)|
| 2026-05-22 | user 確認「editor + viewer 分離、保存時にレンダリング反映 = 真のマルチウィンドウか」を受け §3.4「editor → viewer / monitor の保存時反映」を追加。editor 保存 → main 単一権威 → 同 lid の viewer へ push → 再レンダリングの鎖を明示。cross-window 反映は保存時のみ(同一 window 内 split preview は live)で OQ-MW-5 を解決 |
| 2026-05-22 | **γ-A5 実装 wave 着地(pgc-68〜75、10 PR)**:A5-1 viewer / A5-2 monitor / A5-3 layout 保存 / A5-4 layout 復元 / A5-5 競合 diff(main + 子 window §5.3)/ A5-6 別窓動線、+ bugfix pgc-73。§9 状態欄を更新。A5-7 視覚 parity は本環境の Playwright DL 不可で保留、γ-A5 flag は OFF 出荷維持 |
