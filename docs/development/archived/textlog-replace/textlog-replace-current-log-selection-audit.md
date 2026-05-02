# TEXTLOG Replace v1.x — Post-Implementation Invariance Audit (Selection only)

Status: ACCEPTED (audit, no defects found)
Date: 2026-04-16
Scope: S-29 `textlog-log-replace-dialog.ts` Selection only 追加 + 既存 S-28 baseline 再確認
Related:
- `docs/spec/textlog-replace-v1-behavior-contract.md`（§4.2 / §4.3 は v1.x で更新済み）
- `docs/spec/find-replace-behavior-contract.md`（TEXT 側 Selection only の親契約）
- `docs/development/textlog-replace-current-log.md`（v1.x / S-29 を反映した実装ノート）
- `docs/development/textlog-replace-current-log-audit.md`（S-28 audit、本 audit の前段）
- `src/adapter/ui/textlog-log-replace-dialog.ts`
- `src/features/text/text-replace.ts`（`countMatchesInRange` / `replaceAllInRange` の pure helper）
- `tests/adapter/textlog-log-replace-dialog.test.ts`（23 件）

---

## 1. 監査方針

S-28 audit（`textlog-replace-current-log-audit.md`）の **additive 延長版**。v1 baseline は既に構造的 invariance 保証が確認済みなので、本 audit は S-29 で新たに加わった **Selection only** 経路に焦点を当てる。

具体的には以下 8 観点を実装コードの 1 パス読み下しで確認する:

1. **Target resolution**: current log の pin が Selection only 追加後も維持されているか
2. **Selection semantics**: open-time 1-shot snapshot / 空選択時 disable / session 中凍結
3. **Range correctness**: count / replace が `[start, end)` 範囲内にのみ作用するか
4. **Range shift**: Apply 後の delta 補正が正しく計算され、2 回目以降も範囲に留まるか
5. **Invariance**: v1 の 7 不変条件が v1.x でも全て保持されるか（特に範囲外本文の byte-identity）
6. **Gating / status**: `current log` / `selection` のスコープ切替が contract 通りか
7. **State interaction**: AppState / reducer / Container への非依存が維持されているか
8. **Test coverage**: 追加 10 件が仕様を過不足なくカバーしているか

audit は原則 docs-only。具体的な欠陥が見つかった場合のみ最小修正を許可する方針だが、**本 audit でも欠陥は見つからなかった** ため、production code / test は一切変更せず本メモ 1 本で閉じる。

## 2. チェック項目と結果

### 2.1 Target resolution（S-28 からの継承確認）

**チェック**: Selection only 追加後も current log の pin が壊れていないか。captured range が別の log に漏れる経路が無いか。

**結果**: OK ✓

- `openTextlogLogReplaceDialog(textarea, root)` の引数が依然 **単一 textarea 参照** であり、`activeTextarea = textarea` で pin される（line 170）
- `captureSelection(textarea)` は呼び出し時の引数 textarea の `selectionStart/End` しか読まない。他 log の textarea への参照を取得する経路は存在しない
- `state.range` は dialog セッションのローカル state（`interface DialogState`）であり、他 log に共有されない
- `activeRange()` は `state.range` を返すのみで、`document.querySelector` や他 DOM の走査を行わない → range が別 log に漏れる経路は構造的に不在
- S-28 の二重ガード（`data-pkc-field !== 'textlog-entry-text'` reject / `data-pkc-log-id` 欠落 reject）はそのまま維持（line 140–141）

**観察**: Selection only 追加で dialog の内部 state が 1 つ増えた（`DialogState.range`）が、これは **dialog セッション寿命の local state** で、module singleton の `activeTextarea` / `activeOverlay` とは別次元。Apply 後の range shift もこの local state のみを書き換え、他 log へ副作用を及ぼす経路はない。

### 2.2 Selection semantics（snapshot / disable / 凍結）

**チェック**: contract §4.2 が要求する「open 時 1 回キャプチャ → セッション中凍結 → 空選択時 disable」が実装されているか。

**結果**: OK ✓

- **1-shot snapshot timing**: `captureSelection(textarea)` は `buildOverlay()` / `root.appendChild` の **前** に呼ばれる（line 147）
  - overlay mount で focus が移動し textarea の selection が collapse するのを回避
  - コメント（line 144–146）にも意図が明記されている
- **空選択の検出**: `captureSelection` は 2 重ガード
  - `typeof start !== 'number' || typeof end !== 'number'` → happy-dom の unfocused input / 旧 API 不在環境で null 返し（line 187）
  - `end <= start` → 空選択で null 返し（line 188）
- **disable の実装**: `captured === null` のとき `selectionCheckbox.disabled = true` + `title = 'No selection in the current log textarea'`（line 157–160）
  - tooltip は UX 的な親切心であり、contract 要求は disabled 状態のみ（契約逸脱なし）
- **session 中の凍結**: `state.range` は open 時に `captured` で初期化され、以降は `applyReplace` 内の `delta` 補正でのみ書き換わる
  - live selection の再読み込み経路は存在しない（textarea の `selectionchange` listener は wire されていない）
  - ON/OFF トグルは `state.range` を破棄せず、`activeRange()` が checkbox 状態を見て返すか否かを決めるだけ → OFF→ON で原本 range が復活する

**観察**: 「session 中凍結」は contract §4.2 の核心。これが壊れると同じ dialog 内で複数の range が混在し undefined behavior になる。実装は `state.range` を 1 本化し、書き換え経路を `applyReplace` の 1 箇所に限定しており健全。

### 2.3 Range correctness（count / replace の範囲限定）

**チェック**: Selection only ON のとき、count と replace の両方が `[start, end)` に閉じているか。範囲外本文が触られていないか。

**結果**: OK ✓

- **count path**: `updateStatus` は `activeRange()` が非 null のとき `countMatchesInRange(textarea.value, range.start, range.end, query, options)` を呼び出す（line 354–360）
  - 非 range 版 `countMatches(textarea.value, query, options)` とは排他選択（分岐経路は `range === null` ? で 1 本化）
- **replace path**: `applyReplace` は `activeRange()` が非 null のとき `replaceAllInRange(oldValue, range.start, range.end, query, replacement, options)` を呼び出す（line 387–394）
  - 同様に非 range 版 `replaceAll` と排他
- **pure helper の信頼性**: `countMatchesInRange` / `replaceAllInRange` は `src/features/text/text-replace.ts` で S-27 に追加され、TEXT 側 Selection only で既に本番投入済み
  - 両 helper は内部で `body.slice(0, start)` + `body.slice(start, end)` + `body.slice(end)` の 3 分割で範囲外 byte-identity を保証
  - textlog audit の射程で pure helper を再監査する必要はない（所有が features 層、TEXT v1.1 contract 側で検証済み）
- **範囲外の byte-identity**: 実装上 `oldValue.slice(0, range.start) + newSlice + oldValue.slice(range.end)` の形でしか next が作られないため、範囲外の変化は発生しえない

**観察**: range-based 経路と full 経路が `range === null` ? の 1 条件で分岐し、それぞれが pure helper に委譲する構造。dialog 層には「範囲内のみ」を解釈するロジックが無く、helper の契約にそのまま委ねている。これは関心事の正しい分離で、dialog 側に範囲ロジックを持たせると invariance が崩れやすくなる。

### 2.4 Range shift（delta 補正の数学的正しさ）

**チェック**: Apply 後に `delta = next.length - oldValue.length` で range.end を補正し、2 回目以降の Apply も正しい範囲に閉じるか。

**結果**: OK ✓

**実装**: line 395–401

```ts
if (next !== oldValue) {
  const delta = next.length - oldValue.length;
  newRange = { start: range.start, end: range.end + delta };
}
```

**数学的トレース** (テスト 19 相当, `aa aa aa aa` の最初の 10 文字 `aa aa aa ` を選択):
- 初期: `body = "aa aa aa aa"`, `range = {start: 0, end: 10}`（`aa aa aa a` の 10 文字）
- 実際のテストは `aa aa aa aa` の **start=0, end=9** を選択（3 つの `aa` + 2 つのスペース = 8 文字、厳密には `aa aa aa` + 余白。contract 上 end 位置は文字数で解釈）
- 1 回目 Apply (`aa` → `bbbb`):
  - `replaceAllInRange` は `[0, 9)` 内の 3 つの `aa` を `bbbb` に → `"bbbb bbbb bbbb aa"`（length 17）
  - `delta = 17 - 11 = 6`
  - `newRange = {start: 0, end: 9 + 6} = {start: 0, end: 15}`
  - → 次の範囲は `"bbbb bbbb bbbb"` の部分に拡張される
- 2 回目 Apply (`bbbb` → `c`):
  - `replaceAllInRange` は `[0, 15)` 内の 3 つの `bbbb` を `c` に → `"c c c aa"`（length 8）
  - `delta = 8 - 17 = -9`
  - `newRange = {start: 0, end: 15 - 9} = {start: 0, end: 6}`
  - → 次の範囲は `"c c c "` の部分に収縮される

**数学的正しさ**: `replaceAllInRange` が返す next は `pre + newMid + post` の連結で、`pre.length === range.start` / `post.length === oldValue.length - range.end` は保存されている。よって `newMid.length - oldMid.length = delta = next.length - oldValue.length`。新しい範囲は `[start, start + newMid.length) = [start, end + delta)` となり、実装式と完全一致する。

- `delta` は `next !== oldValue` の分岐内でのみ計算される → 0 hit 時は `newRange` が null のまま、state.range は書き換わらない（後の 0 hit 早期 return と整合）
- `delta` は負値も許容される（replacement が shorter の場合） → `end + delta` が `start` を下回ることはあるか？
  - 理論上: `replacement = ""` で全文消すと `end + delta = start` になり `[start, start)` は空範囲 → その後 `countMatchesInRange` は常に 0 hit
  - 現象: 範囲空 → status が `No matches in selection.` → Apply disabled になって止まる
  - 破綻は無い。空範囲は空レスポンスに自然に degrade する

**観察**: range shift の数学は「pre/post 長さ保存」という `replaceAllInRange` の spec に依存している。これが壊れると delta 補正が破綻するが、TEXT 側 Selection only で同じ helper を使っており独立検証済み。

### 2.5 Invariance（v1 不変条件の v1.x 継承）

**チェック**: S-28 audit §2.2 で確認した 7 不変条件が v1.x 追加後も全て保持されているか。Selection only ON 時の追加不変条件（範囲外本文の byte-identity）が維持されているか。

**結果**: OK ✓（構造的保証）

v1 の 7 不変条件は textlog の JSON 構造と `collectBody` の原本 merge に依存しており、これらは S-29 で **一切書き換えられていない**。dialog 側は `textarea.value` を書き換えるだけなので、S-28 audit で確認した不変保証の全経路が自動的に継承される。

v1.x で追加された「範囲外本文の byte-identity」は `replaceAllInRange` の spec で保証される。

| 不変項目 | v1 での保証 | v1.x での追加検証 | 結果 |
|---------|-----------|-----------------|------|
| `log.id` | 起動 row の `data-pkc-log-id` 属性は replace の操作対象でない。collectBody は属性から読み戻す | range shift は `state.range` のみ書き換え、DOM 属性に触れない | ✓ |
| `log.createdAt` | 編集 UI は read-only `<span>`、collectBody は hidden body の original から引き戻す | 同上、createdAt に到達する経路は追加されていない | ✓ |
| `log.flags` | 独立した checkbox が管理、replace target 外 | selection checkbox は `FIELD_SELECTION` 別 namespace で flag checkbox と衝突しない | ✓ |
| entries length | delete button の `data-pkc-deleted="true"` で印付け、collectBody skip | delete 状態への書き換え経路は追加されていない | ✓ |
| entries order | collectBody が `originalOrder` map で常に昇順再ソート | sort ロジックに変更なし | ✓ |
| append area | `textlog-append-text` は editing phase の DOM に存在しない | selection 対象 textarea は `textlog-entry-text` 専用、append area textarea に到達しない | ✓ |
| viewer sort mode | dialog は renderer / AppState に触れない | Selection only でも同じ、AppState 非依存を維持 | ✓ |
| **範囲外本文 (v1.x 追加)** | ― | `replaceAllInRange` が `body.slice(0, start) + newMid + body.slice(end)` を返すため構造的保証 | ✓ |

### 2.6 Gating / status（scope 切替の完全性）

**チェック**: `current log` と `selection` の scope が checkbox 状態に応じて正しく切り替わるか。empty / invalid / 0 hit ガードが両 scope で維持されているか。

**結果**: OK ✓

`updateStatus` の status 文言は `range` の有無で分岐する（line 361–365）:

```ts
const scope = range === null ? 'current log' : 'selection';
parts.statusEl.textContent = n === 0
  ? `No matches in ${scope}.`
  : `${n} match${n === 1 ? '' : 'es'} will be replaced in ${scope}.`;
```

| 条件 | Selection OFF | Selection ON | 一致 |
|------|-------------|--------------|------|
| empty query | `Enter text to find…` | `Enter text to find…` | ✓ 両方同文言（scope 非依存） |
| invalid regex | `Invalid regex: <msg>` + `data-pkc-error` | 同上 | ✓ 両方同文言（scope 非依存） |
| 0 hit | `No matches in current log.` | `No matches in selection.` | ✓ scope に応じて切替 |
| N hits | `N match(es) will be replaced in current log.` | `N match(es) will be replaced in selection.` | ✓ scope に応じて切替 |
| Apply disable | n === 0 で disabled | n === 0 で disabled | ✓ 両 scope で維持 |

**ガードの経路**: empty query / invalid regex の早期 return は `range` を読む前に実行される（line 333–346）。つまり scope 切替は **valid な query + 非 0 hit** のときのみ発生し、ガード経路には一切影響しない。これは contract §4.3 の「Gating は Selection only と直交」という要求と一致する。

**観察**: S-29 で追加された scope 文言は `current log` / `selection` の 2 値のみ。TEXT dialog 側の `current entry` / `selection` とは **文言レベルで区別** されているので、仮に両 dialog が同時に DOM 上に存在してもユーザーがどちらで操作しているか判別可能（実際は一方のみがアクティブ）。

### 2.7 State interaction（AppState 非依存の維持）

**チェック**: S-29 で追加された state（`DialogState.range`）が AppState / reducer / Container に漏れていないか。dispatcher 経由の副作用が発生しないか。

**結果**: OK ✓

- `DialogState` は `openTextlogLogReplaceDialog` のローカル変数として生成され、`applyReplace` / `updateStatus` の closure にのみ渡される（line 148, 162–163）
- module singleton state（`activeOverlay` / `activeTextarea` / `activeEscapeHandler`）には `state` / `range` は保存されない → 次回 open 時に自動破棄
- `applyReplace` の副作用は 3 つのみ:
  1. `textarea.value = next`
  2. `textarea.dispatchEvent(new Event('input', {bubbles: true}))`
  3. `state.range = newRange` + `textarea.setSelectionRange(...)` (Selection only ON 時)
  
  いずれも AppState 経路を通らない。dispatcher は import されていない（grep 確認）。
- commit-edit 経路は S-28 と同じ:
  - input event → dirty 状態がグローバル state で観測される
  - 以後 `Ctrl+S` で `textlogPresenter.collectBody` が textarea.value を読み出す
  - Selection only の `state.range` / selection shift は commit-edit 経路に一切伝播しない（commit は本文だけを読む）
- Cancel 経路も S-28 と同じ:
  - `CANCEL_EDIT` → renderer が editor DOM を wipe → overlay も消える → `state.range` ごと GC される

**観察**: Selection only の追加は完全に presentation 層のローカル拡張で、永続層 / dispatcher / AppState には一切漏れていない。これは contract §6 / §7 の「dialog は純粋な view-layer 書き換え機」という位置づけと一致する。

### 2.8 Test coverage（追加 10 件の過不足確認）

**チェック**: S-29 で追加されたテスト 10 件が Selection only の契約を過不足なくカバーしているか。

**結果**: OK ✓

| # | テスト観点 | カバーする契約要求 |
|---|-----------|-----------------|
| 14 | 選択なしで開くと checkbox `disabled` | §4.2 disabled condition |
| 15 | 選択ありで開くと checkbox `enabled` | §4.2 capture success path |
| 16 | ON 時は範囲内のみ count（status `... in selection.`） | §4.3 scope 切替 / §4.5 range-bounded count |
| 17 | OFF 時は current log 全文 count（status `... in current log.`） | §4.3 backward compat |
| 18 | ON 時 replace は範囲内のみ、範囲外の本文不変 | §5 範囲外 byte-identity |
| 19 | 連続 Apply で range shift（`aa × 4` → `bbbb × 3 + aa` → `c × 3 + aa`） | §4.2 session 中凍結 + delta 補正 |
| 20 | regex + Selection only 組み合わせ | §4.2 orthogonality with regex option |
| 21 | invalid regex ガードが Selection only ON でも維持 | §4.3 gating orthogonality |
| 22 | Apply で `input` event 発火（dirty hook 維持） | §6 state integration |
| 23 | Selection only ON での commit-edit 後も id/createdAt/flags/配列順が不変 | §5 end-to-end invariance |

**過不足**:
- **過剰なし**: 10 件すべて contract の個別条項に対応
- **不足なし**: backward-compat（#17）/ 凍結（#19）/ invariance E2E（#23）の 3 つの「構造が壊れやすい箇所」を網羅
- **意図的な未テスト**: OFF→ON 切替で range が復活する挙動は #16/#17 の分離テストで間接的に確認されるが、直接的な「OFF→ON 遷移テスト」は存在しない。これは contract §4.2 で `state.range` は open 時にのみ書かれるという spec に従っており、過剰テストを避ける判断（後述の §5.1 参照）

**観察**: v1 baseline 13 件 + v1.x 10 件 = 23 件で textlog replace 全挙動を網羅。テスト構成は TEXT 側 Selection only と同じパターンを踏襲しており、将来的に v2（whole textlog / selected lines）を追加する際も同じ骨格で増量できる。

## 3. 監査結果サマリ

| 項目 | 結果 |
|------|------|
| 2.1 Target resolution（current log pin 維持） | ✓ OK |
| 2.2 Selection semantics（snapshot / disable / 凍結） | ✓ OK |
| 2.3 Range correctness（count / replace が `[start, end)` に閉じる） | ✓ OK |
| 2.4 Range shift（delta 補正の数学的正しさ） | ✓ OK |
| 2.5 Invariance（v1 7 条件 + 範囲外 byte-identity） | ✓ OK（構造的保証） |
| 2.6 Gating / status（scope 切替の完全性） | ✓ OK（contract 表と逐一一致） |
| 2.7 State interaction（AppState 非依存） | ✓ OK（dispatcher 非参照） |
| 2.8 Test coverage（10 件の過不足） | ✓ OK（契約条項網羅） |

**欠陥: 0**
**修正: 不要**
**追加テスト: 不要**

## 4. 発見した問題

**なし。**

S-29 実装は S-28 baseline と TEXT 側 Selection only（S-27）の両方を踏襲しており、新規に発生した defect は検出されなかった。pure helper 共有 + dialog 単独拡張という設計方針が、invariance の破壊余地を構造的に遮断している。

## 5. 非欠陥観察

以下は defect ではないが audit 過程で把握した細目。contract 違反ではなく、将来の v2 拡張時に明文化する候補。

### 5.1 OFF→ON 切替で range が復活する挙動

**観察**: `state.range` は open 時に `captureSelection` の戻り値で初期化され、以後 `applyReplace` 内の delta 補正でのみ書き換わる。checkbox の OFF→ON トグルは `state.range` を破棄しない。つまり:

1. open（range captured = `{start: 10, end: 30}`）
2. checkbox OFF（`activeRange()` returns null、current log 全文 scope）
3. full-scope で Apply 実行（`state.range` は書き換わらない）
4. checkbox ON
5. → ここで `state.range` は `{start: 10, end: 30}` のまま

ステップ 3 で全文 replace が走ると、textarea の長さが変わっている可能性があり、その場合ステップ 5 の range は古い座標系を指している。

**評価**: contract §4.2 は「range は open 時に 1 回 capture」と明記しており、OFF→ON で再キャプチャしない仕様。full-scope Apply 後に Selection only を ON にする操作は「ユーザーが意図的にミックスした」ケースで、そのとき range が古い座標を指すのは spec 通りの挙動。破綻ではない。

**同じパターン**: TEXT replace v1.1 の Selection only にも存在し、find-replace-behavior-contract.md §5.4.2 で明示されている（「once captured, the range is stable for the session」）。textlog 側も親 contract を継承しており、追加の明文化は不要。

**将来拡張の余地**: v2 で「live selection mode」を導入する場合、この挙動は再キャプチャ型に変わる。その際は v1.x との互換性を明示的に壊す形で contract を更新する方針（textlog contract §8 にも同じ注記あり）。

### 5.2 Selection only ON 中の mid-session toggle

**観察**: ユーザーが Selection only ON で 1 回 Apply → OFF に切り替え → もう 1 度 Apply という遷移を行うと:

1. Apply 1: 範囲内のみ replace、`state.range` が delta shift される（例: `{start: 0, end: 15}` → `{start: 0, end: 6}`）
2. OFF: `activeRange()` が null を返す → 以後の count / replace は full log scope
3. Apply 2: full log scope で replace 実行

このとき `state.range` はステップ 1 の shift 後の値 `{start: 0, end: 6}` のまま保持される。ステップ 3 の full-scope Apply は `state.range` を書き換えないので、もしユーザーが再度 Selection only ON にすると Apply 1 直後の shift 後 range がそのまま復活する。

**評価**: これも contract §4.2 の「session 中凍結」が意図する通りの挙動。mid-session toggle で range が生き残るのは望ましい性質で、ユーザーが「うっかり OFF にした後 ON に戻した」とき range を失わずに済む。破綻ではない。

**ただし**: ステップ 3 の full-scope Apply が textarea の長さを変えていた場合、ステップ 5（仮想）での ON 時の range は古い座標系を指す。これは 5.1 と同じ構造的注意点で、親 contract に既述のとおり意図的な trade-off。

### 5.3 `setSelectionRange` の try-catch

**観察**: `applyReplace` の line 419–424:

```ts
try {
  textarea.setSelectionRange(newRange.start, newRange.end);
} catch {
  /* happy-dom / non-focused input can reject setSelectionRange;
   * the internal state update above is what actually matters. */
}
```

happy-dom のテスト環境では unfocused textarea に対する `setSelectionRange` が throw することがあり、それを swallow している。コメントにある通り「state.range は既に更新済みなので UI 同期だけが失敗しても本質的挙動は壊れない」。

**評価**: defensive coding として妥当。production ブラウザ（Chrome / Firefox / Safari）では `setSelectionRange` は unfocused input でも throw せず、try-catch はほぼ dead path。ただし happy-dom 互換性のために残す価値があり、削除すべきではない。

**観察の結論**: 3 件の非欠陥観察は全て親 contract（TEXT replace v1.1）と同じ trade-off を継承しており、textlog 固有の問題ではない。将来 live selection mode を導入する v2 で再検討する。

## 6. Contract / 実装との整合点

contract `textlog-replace-v1-behavior-contract.md` v1.x 更新部分（§4.2 / §4.3）と実装の対応を逐一確認:

| contract §  | 要求 | 実装 | 一致 |
|-------------|------|------|------|
| §4.2 Selection only 追加 | open 時 1 回 `selectionStart/End` capture | `captureSelection(textarea)` を mount 前に呼ぶ（line 147） | ✓ |
| §4.2 | empty selection で checkbox disabled | `if (captured === null) parts.selectionCheckbox.disabled = true`（line 157-158） | ✓ |
| §4.2 | session 中凍結 | `state.range` は `applyReplace` の delta shift 以外で書き換わらない | ✓ |
| §4.2 | Apply 後 range を delta shift | `newRange = {start, end + delta}`（line 400） | ✓ |
| §4.2 | textarea selection を新 range に追従 | `textarea.setSelectionRange(newRange.start, newRange.end)`（line 420） | ✓ |
| §4.3 scope 切替 | `... in selection.` / `... in current log.` | `scope = range === null ? 'current log' : 'selection'`（line 361） | ✓ |
| §4.3 | Selection only ON 時 count/replace が範囲内のみ | `countMatchesInRange` / `replaceAllInRange` に委譲（line 354-360 / 387-394） | ✓ |
| §4.3 | regex option と直交 | `activeRange()` は `regex` option を見ない。options は `readOptions` で別管理 | ✓ |
| §4.3 | invalid regex ガードは scope 非依存 | `buildFindRegex` チェックが `activeRange` 呼び出しより前（line 340-346） | ✓ |
| §5 | 範囲外本文 byte-identity | `replaceAllInRange` が `slice(0, start) + newMid + slice(end)` を返す | ✓ |
| §5 | v1 7 不変条件の継承 | S-29 で collectBody / renderer / presenter に変更なし | ✓ |

全項目一致。contract との乖離なし。

## 7. S-28 audit との比較（v1 vs v1.x）

| 観点 | S-28 audit (v1) | S-29 audit (v1.x) |
|------|----------------|-------------------|
| 主題 | current log only の baseline | Selection only の additive 追加 |
| 不変条件 | 7 条件（id / createdAt / flags / length / order / append / sort） | 7 条件 + 範囲外 byte-identity = 8 条件 |
| pure helper | `replaceAll` / `countMatches` | 上記 + `replaceAllInRange` / `countMatchesInRange` |
| state 数 | 0（module singleton のみ） | 1（`DialogState.range`、セッションローカル） |
| 追加ガード | target check 二重（field + log-id） | 追加で empty selection → disabled |
| テスト件数 | 13 件 | +10 件 = 23 件 |
| 欠陥 | 0 | 0 |
| 非欠陥観察 | 2 件（CSS.escape / delete+apply 順序） | 3 件（OFF→ON drift / mid-toggle / setSelectionRange catch） |

**構造的差異**:
- S-28 は「current log pin」という位置の絞り込みを扱った。S-29 は「pin 内部の範囲の絞り込み」を扱い、包含関係が `textlog > log > selection` と 3 階層に拡張された
- pin → range の階層追加は純加算で、既存の `textarea.value` 経由経路を変えていない → S-28 で確認した全不変条件が自動継承される

**audit 方針の継承**:
- 両 audit とも docs-only、production code は触らず
- 両 audit とも「構造的保証」を主な論拠とし、test 追加を強制しない
- 両 audit とも親 contract（TEXT replace）との整合を明示的に確認

## 8. 次テーマへの申し送り

- **manual 同期**: 本 audit で v1.x 契約遵守が確認されたので、必要なら manual 05 / 09 に Selection only（現 current log）項目を追記可。ただし v1 同期は既に `0edf6ea` で完了しており、Selection only は軽微追加なので次回のまとまった同期タイミングで合わせても良い
- **v2 候補**:
  - whole textlog / selected lines / Replace next（contract §8 で既に列挙済み）
  - live selection mode（open 後の再キャプチャ; 5.1 / 5.2 で触れた trade-off を解消する代替設計）
- **CSS.escape 観察（S-28 継承）**: log id 仕様が拡張されるタイミングで selector safety を再検証
- **ledger / handover**: docs-only audit 慣例に従い、ledger への追加記録は見送り（HANDOVER §19 にも反映不要、audit は S-29 feat commit に暗黙的に紐付く）

## 9. 意図的に扱わなかったこと

- CSS / 見た目の追加審査（invariance audit の射程外）
- TEXT replace 側（`text-replace-dialog.ts`）の再監査（S-27 audit 範囲、親 contract に統合済み）
- pure helper（`countMatchesInRange` / `replaceAllInRange`）の再監査（features 層の責務、TEXT v1.1 で検証済み）
- 他 archetype（todo / form / attachment）の置換経路（S-29 スコープ外）
- export / import / ZIP / provenance / block editor 系
- 4 / 5 / 6 の overlap（invariance contract §5 と §7 が一部重複するが、両方で明示する方針を維持）

## 10. 位置づけサマリ

本 audit は **S-29（textlog-replace v1.x / Selection only）の post-implementation invariance review** であり、S-28 audit の additive 延長版である。

**確認結果**: 全 8 観点 OK、欠陥 0、修正不要、追加テスト不要。

**位置づけ**:
- textlog-replace v1.x スコープの **最終ゲート** として機能
- contract（§4.2 / §4.3 更新）と実装の 1:1 対応を再確認
- S-28 baseline の 7 不変条件 + v1.x 追加の「範囲外 byte-identity」合計 8 条件の構造的保証を明文化
- 3 件の非欠陥観察を記録し、将来 v2（whole textlog / live selection）へ継承

**S-29 の締め**:
- 実装: `e782606 feat(textlog-replace): add Selection only option (v1.x / S-29)`
- audit: 本メモ
- 以後、textlog replace v1.x の仕様・実装・検証は **固定化** され、v2 契約での additive 拡張のみ許容する

---

**Audit completed 2026-04-16.**

Reviewer: Claude (Opus 4.6) acting as implementation auditor under ChatGPT supervisor guidance.
Method: 1-pass read-down of `src/adapter/ui/textlog-log-replace-dialog.ts` cross-checked against contract §4.2 / §4.3 / §5 and test file assertions.
Verdict: **No defects. v1.x scope sealed.**
