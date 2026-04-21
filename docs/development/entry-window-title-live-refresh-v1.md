# Entry-window title live refresh v1

**Status**: design + implementation — 2026-04-21.
**Scope**: pop-out entry-window の title 関連 surface（`<title>` / `#title-display` / script 内
`originalTitle`）を、親 window 側の rename に追随させる live refresh wire を新設する。
**Baseline**: `entry-rename-freshness-audit.md` §8.3（次 PR 提案）。

---

## 1. 背景

`entry-rename-freshness-audit.md` で唯一の stale surface として特定されたのが **pop-out
entry-window の title**。`buildWindowHtml()` が open 時の title を HTML 文字列に焼き付けて
`childDoc.write()` するため、親 window で同じ entry を rename しても子側は古い title を
表示し続ける。加えて child 側で view ↔ edit を切り替えるたびに `title-display.textContent =
originalTitle` が走るため（entry-window.ts:2181）、rename を反映できないと操作のたびに
古い title が "蘇生" する形になる。

既存の live refresh wire は 2 本:

- `wireEntryWindowLiveRefresh` → edit モード Preview tab の resolver ctx を更新（title 非対象）
- `wireEntryWindowViewBodyRefresh` → view-pane HTML (`#body-view`) を更新（title 非対象）

v1 ではこれらと対になる **3 本目の wire** を導入し、title 系 surface だけを refresh する。

## 2. 更新対象 surface

child window 内の title 系 surface は 3 箇所ある（`entry-rename-freshness-audit.md` §4 より）。
v1 ではすべてを 1 メッセージで更新する。

| # | 位置 | 読み書き元 |
|---|---|---|
| A | `document.title`（browser tab / OS window bar） | `<title>${escapedTitle} — PKC2</title>`（entry-window.ts:911） |
| B | `<h2 id="title-display">` 内テキスト | `${escapedTitle}`（entry-window.ts:1567）, view ↔ edit 切替時に `textContent = originalTitle`（2181） |
| C | script スコープの `var originalTitle` | `var originalTitle = ${escapeForScript(entry.title)}`（entry-window.ts:1616）／`pkc-entry-saved` / `cancelEdit` / `isEntryDirty` が参照 |

更新順序は A → B → C の順に child 側で 1 listener 内で連続実行する。読み取り元が相互に依存しない
ので順序依存は無いが、`originalTitle` を最後に書き換えることで `isEntryDirty()` 判定の
"base point" が更新前・更新後で混ざらないようにする。

以下は v1 では更新対象外:

- `#title-input.value`（edit モード中の textarea） → dirty 状態保護のため直接書き換えず、
  child 側で dirty 判定して後段で `pending title` を反映（§4）
- `escapedTitle` に依存する他の DOM（v1 時点では他に無い）

## 3. Parent → child 通知 protocol

既存 2 本の wire と同じ `postMessage` 方式で統一する。新規 message tag:

```ts
export const ENTRY_WINDOW_TITLE_UPDATE_MSG = 'pkc-entry-update-title';
```

payload:

```ts
{
  type: 'pkc-entry-update-title',
  title: string,   // 親側の最新 entry.title（空文字列可、子側でフォールバック済）
}
```

Parent 側 helper:

```ts
pushTitleUpdate(lid: string, title: string): boolean
```

- `openWindows.get(lid)` で child window を解決
- closed なら false を返して no-op
- `child.postMessage({ type: ENTRY_WINDOW_TITLE_UPDATE_MSG, title }, '*')`
- 返り値は既存 helper と同じ "送信した場合 true" セマンティクス

Wire (`wireEntryWindowTitleRefresh(dispatcher)`):

- `dispatcher.onState((state, prev) => ...)` で購読
- Outer gate: `prev.container?.entries !== state.container?.entries`（既存 2 本と同じ identity 判定）
- 各 open lid について:
  - `prevEntry = prev.container?.entries.find(...)`
  - `nextEntry = state.container?.entries.find(...)`
  - `nextEntry` 不在なら skip（entry が消えた場合）
  - `prevEntry?.title === nextEntry.title` なら skip（title が変わらない update は push しない）
  - `pushTitleUpdate(lid, nextEntry.title ?? '')` を呼ぶ
- archetype filter は **不要**: title はどの archetype でも存在し、attachment / folder / todo でも
  rename は有効。preview / view-body wire と違って markdown 依存の処理が無いため広く許容する
- 返り値は `dispatcher.onState` の unsubscribe function

## 4. Dirty 状態との整合（stomp 回避）

child 側では 2 種類の dirty シナリオを考える:

1. **view モードで pending**: view 側の title を push して良い（`#title-input` は render されていない）
2. **edit モードで user が title-input を書き換え中**: 親側で rename しても
   - `#title-display`（非表示）と `document.title` は更新して問題ない
   - `#title-input.value` は **触らない**（user の未保存入力を stomp してはいけない）
   - `originalTitle` はどうするか？ ここが難所:
     - 書き換えると `isEntryDirty()` の base point が変わり、今までの入力が "dirty ではない"
       と判定されてしまう可能性がある → 望ましくない
     - 書き換えないと、次に child が save / cancel した時に "親の新 title" と child 内の `originalTitle`
       が乖離したままになる → save path は `window.opener.postMessage('pkc-entry-save', ...)` を
       通じて親 reducer に届き、親側で conflict check されるので最終的に正しく整合する
     - **v1 方針**: edit モード中は `originalTitle` を **触らない**。view モードに戻る遷移
       （`cancelEdit` / `pkc-entry-saved`）で次に受け取ったメッセージが反映される

よって child 側 listener の疑似コード:

```js
if (e.data.type === 'pkc-entry-update-title') {
  var nextTitle = typeof e.data.title === 'string' ? e.data.title : '';
  // A: document.title は常に更新（tab / window bar）
  document.title = nextTitle + ' — PKC2';

  if (currentMode === 'edit') {
    // edit モード中は #title-display は非表示なので触らない。
    // originalTitle / #title-input は dirty 保護のため触らない。
    // ただし pending として積んでおき、cancelEdit / 'pkc-entry-saved' で再適用する。
    pendingTitle = nextTitle;
    showPendingTitleNotice();
    return;
  }

  // view モード（clean）: 全部まとめて更新
  var titleEl = document.getElementById('title-display');
  if (titleEl) titleEl.textContent = nextTitle;
  originalTitle = nextTitle;
  pendingTitle = null;
  hidePendingTitleNotice();
}
```

既存 `pendingViewBody` と同じ語彙・同じ flush タイミング（`cancelEdit()` / `pkc-entry-saved`）に
合わせる。再利用すると stomp リスクが混ざるので、title 専用の `pendingTitle` 変数を別に持つ。

### 4.1 `pkc-entry-saved` での扱い

`pkc-entry-saved` message 受信時:

- 既存 code は `originalTitle = document.getElementById('title-input').value` を実行（line 2178）
- save は child 側の title-input がそのまま親へ送られた後に戻ってくる ack なので、ここで
  `originalTitle` を title-input に合わせるのは正しい
- v1 追加: `pendingTitle` を discard する。既存 `pendingViewBody` と同じ扱い（save が authoritative）

### 4.2 `cancelEdit()` での扱い

- 既存 code は `titleInput.value = originalTitle` で入力をロールバック、view モードへ遷移
- v1 追加: `pendingTitle` が残っていれば
  - `originalTitle = pendingTitle`
  - `#title-display.textContent = pendingTitle`
  - `document.title = pendingTitle + ' — PKC2'`
  - `pendingTitle = null` / notice を消す
- flush 順番は既存 `flushPendingViewBody()` と同様、view モード入り直後

## 5. Helper / wire / listener の三位一体

| レイヤ | 追加場所 | 責務 |
|---|---|---|
| Parent helper | `src/adapter/ui/entry-window.ts` | `pushTitleUpdate(lid, title)` + `ENTRY_WINDOW_TITLE_UPDATE_MSG` 定数 |
| Parent wire | `src/adapter/ui/entry-window-title-refresh.ts`（新規） | `wireEntryWindowTitleRefresh(dispatcher)` — state 監視して `pushTitleUpdate` を起動 |
| Main wiring | `src/main.ts` | `wireEntryWindowTitleRefresh(dispatcher)` を boot 時に呼ぶ |
| Child listener | `buildWindowHtml()` の script 内 | `pkc-entry-update-title` message を受けて §4 のロジックを実行 |
| Child state | 同上 | `pendingTitle` / `showPendingTitleNotice` / `hidePendingTitleNotice` / `pending-title-notice` 要素 |

5-layer への影響:

- `core` / `features` は触らない（title の pure 計算は無い）
- `adapter/ui` 内で完結（新規 wire module 1 個 + 既存 entry-window.ts への追加のみ）
- `runtime` 不要

## 6. 非対象（v1 で扱わない）

- archetype label / task badge の live refresh（title 変更とは別軸、別 surface）
- `#title-input` への直接上書き（dirty stomp 回避）
- entry 削除時の child window auto-close（既存の scope 外、別 issue で扱う）
- multi-parent entry の title（多 relation は本 wire と無関係）
- archetype 変更時の UI 全面再描画（v1 の title wire は title フィールドのみ監視）
- child 内での独自 pending merge UI（既存の `pending-view-notice` と同じ minimal 告知に統一）

## 7. 既存 refresh wire との関係

| Wire | Message tag | 対象 DOM |
|---|---|---|
| `wireEntryWindowLiveRefresh` | `pkc-entry-update-preview-ctx` | edit モード Preview tab resolver ctx |
| `wireEntryWindowViewBodyRefresh` | `pkc-entry-update-view-body` | `#body-view` innerHTML |
| `wireEntryWindowTitleRefresh`（v1） | `pkc-entry-update-title` | `document.title` / `#title-display` / `originalTitle` |

3 本とも同じ `dispatcher.onState` に乗る。outer gate (`prev.entries !== next.entries`) は重複するが
それぞれが自分の payload だけを push するため、対象外 wire は cheap な per-entry check で即 skip する。

child window 側は message type で分岐するため、既存 2 本との衝突は無い。

## 8. テスト方針

新規テストファイル `tests/adapter/entry-window-title-refresh.test.ts`（view-body-refresh test を
model に）:

1. **title が変わった時に 1 回だけ push される**（text / textlog / attachment / folder 全部通す）
2. **title が変わらない container mutation では push されない**（body-only edit, asset add）
3. **window が無い時は no-op**
4. **closed window に対しては no-op**
5. **payload shape**: `{ type: 'pkc-entry-update-title', title: '<new>' }`
6. **複数 window 同時 rename で各 window に 1 回ずつ push**
7. **dispatcher unsubscribe で以降の push が止まる**

`pushTitleUpdate` helper の単体テストは `entry-window.test.ts` に 2 ケース追加:

8. **open window に対して postMessage が飛ぶ**
9. **closed window に対しては false を返して no-op**

child 側 listener の挙動は "child script inside buildWindowHtml" として文字列の中に居るため、
既存 `entry-window-dirty-state-policy.test.ts` / `entry-window-live-refresh.test.ts` 系と同じく
**parent 側の push 検証で代替** する（child の JS は同じ runtime でしか実行できないため)。

## 9. Related docs

- `entry-rename-freshness-audit.md` — 本 v1 の発端（§8.3 で設計概要を提示済）
- `edit-preview-asset-resolution.md` — Preview / view-body refresh の foundation。本 v1 はその
  3 本目として並ぶ
- `breadcrumb-path-trail-v1.md` / `recent-entries-pane-v1.md` — rename 追随が UX 上必要な理由
