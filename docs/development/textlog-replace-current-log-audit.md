# TEXTLOG Replace v1 — Post-Implementation Invariance Audit

Status: ACCEPTED (audit, no defects found)
Date: 2026-04-16
Scope: S-28 `textlog-log-replace-dialog.ts` + presenter / action-binder / tests 後見的レビュー
Related:
- `docs/spec/textlog-replace-v1-behavior-contract.md`
- `docs/spec/textlog-replace-feasibility-and-minimum-scope.md`
- `docs/development/textlog-replace-current-log.md`
- `src/adapter/ui/textlog-log-replace-dialog.ts`
- `src/adapter/ui/textlog-presenter.ts`
- `src/adapter/ui/action-binder.ts`
- `src/features/textlog/textlog-body.ts`
- `tests/adapter/textlog-log-replace-dialog.test.ts`

---

## 1. 監査方針

S-28 の実装が `textlog-replace-v1-behavior-contract.md` の契約を本当に守っているかを、**実装コードを 1 パス** で読み下して確認する。

audit は原則 docs-only。具体的な欠陥が見つかった場合のみ最小修正を許可する方針だったが、**本 audit では欠陥は見つからなかった** ため、production code / test は一切変更せず本メモ 1 本で閉じる。

## 2. チェック項目と結果

### 2.1 Target resolution

**チェック**: `data-pkc-log-id` により current log が一意に解決されているか。display desc でも target がずれないか。

**結果**: OK ✓

- `renderEditorBody` は `[...log.entries].reverse()` で display desc にするが、各 row / textarea / flag checkbox / delete button / 🔎 trigger の **いずれにも正しい `data-pkc-log-id` が付与される**（行 161–223）
- action-binder の resolver は `textarea[data-pkc-field="textlog-entry-text"][data-pkc-log-id="<escaped>"]` で id 直接一致 → DOM 順序に依存しない
- `CSS.escape(logId)` が攻撃的な id でも selector injection を防ぐ（ULID / legacy `log-{ts}-{n}` は実質 alphanumeric だが defensive）
- dialog の `openTextlogLogReplaceDialog` 自身も `data-pkc-field` と `data-pkc-log-id` の 2 条件を再確認（line 111–112） → **二重ガード**
- 選択後は `activeTextarea` に 1 本を pin し、セッション中に他 log の操作で切り替わらない

**観察（非欠陥）**: `CSS.escape` はもともと CSS 識別子のエスケープ用途であり、quoted attribute value 内へ挿入する場合は厳密な仕様一致ではない。ただし実際の log id 文字種（`0-9A-HJKMNP-TV-Z` の base32 ULID または `log-\d+-\d+` の legacy 形式）では `"` / `\` / 改行が出現しないため **実害なし**。将来 id 仕様が広がる場合は別 escape 戦略の検討余地。

### 2.2 Invariance

**チェック**: replace 前後で id / createdAt / flags / entries length / order / append area / viewer sort mode が不変か。変わるのは current log text のみか。

**結果**: OK ✓（構造的に保証）

| 項目 | 実装上の保証 |
|------|-------------|
| `log.id` | 起動 row の `data-pkc-log-id` 属性は replace の操作対象でない。collectBody は `row.getAttribute('data-pkc-log-id')` で読み戻す |
| `log.createdAt` | 編集 UI は read-only `<span class="pkc-textlog-timestamp">` で表示のみ。collectBody は hidden body の original から `createdAt: orig?.createdAt` で引き戻す（line 277）。replace は textarea.value のみに作用するため createdAt に到達不能 |
| `log.flags` | 独立した `<input type="checkbox" data-pkc-field="textlog-flag">` が管理。collectBody は checkbox の `.checked` を読む（line 273）。replace の target 対象外 |
| entries length | row の削除は delete button が `data-pkc-deleted="true"` + `display: none` で印を付け、collectBody が skip する。replace は delete 状態を触らない |
| entries order | collectBody は `originalOrder` map から index を復元して **常に昇順に再ソート**（line 284–288）。display desc / viewer sort との差異は常に自動吸収 |
| append area | `textlog-append-text` は viewer の `renderBody` 内にのみ存在し、`renderEditorBody` には出現しない。edit phase の DOM にそもそも存在しないため干渉不能 |
| viewer sort mode | dialog は renderer / AppState に触れない。sort mode を変更する action は dispatch しない |

### 2.3 Scope guards

**チェック**: current log only / append area 非対象 / readonly / historical / preservation / viewer で trigger 不在または無効か。

**結果**: OK ✓

- **trigger**: `renderEditorBody` 内でのみ描画。`renderBody`（viewer、ready phase）では描画されない
- **append area**: `renderEditorBody` に append area は存在しない
- **dialog 側の target check**: `data-pkc-field !== 'textlog-entry-text'` を reject（line 111） / `data-pkc-log-id` 欠落を reject（line 112）
- **readonly**: reducer が `BEGIN_EDIT` を readonly 時にブロックするため editing phase に入らず、`renderEditorBody` が呼ばれず trigger 不在
- **historical revision viewer**: 独立の viewer 経路（revision pane）を使い、`renderEditorBody` を呼ばない構造。trigger 不在
- **preservation viewer / selected-only export viewer**: clone された read-only 状態で readonly と同じく editing phase に入らない

contract §3.4 の readonly / historical trigger 不在の扱いは、既存テスト `does not render triggers or accept opens in readonly mode` で readonly について直接検証済み。historical / preservation は構造的に同じ経路を通るため、追加テストは要求しない（audit 方針に従い production test 追加は見送り）。

### 2.4 Gating / status

**チェック**: empty query / invalid regex / 0 hit のガードが contract 通りか。status 文言が current log scope に統一されているか。

**結果**: OK ✓

| 条件 | contract 要求 | 実装 | 一致 |
|------|--------------|------|------|
| empty query | `Enter text to find…` | line 250: `'Enter text to find…'` | ✓ |
| invalid regex | `Invalid regex: <message>` + `data-pkc-error="true"` | line 258: `` `Invalid regex: ${built.error}` ``, line 259: setAttribute `data-pkc-error="true"` | ✓ |
| 0 hit | `No matches in current log.` | line 269: `'No matches in current log.'` | ✓ |
| N hits | `N match(es) will be replaced in current log.` | line 270: `` `${n} match${n === 1 ? '' : 'es'} will be replaced in current log.` `` | ✓（単数複数対応済み） |
| Apply disable 条件 | empty / invalid / 0 | `parts.applyBtn.disabled = true` が 3 経路すべてで設定 | ✓ |

status scope 表記は `in current log.` / `in current log.` で **完全に `current log` で統一**。TEXT 側の `in current entry.` / `in selection.` とは混線しない。

### 2.5 State interaction

**チェック**: input event 発火 / dirty + commit flow 接続 / AppState / reducer / Container に直接触れていないか。

**結果**: OK ✓

- Apply 経路（line 283–299）:
  1. `next = replaceAll(textarea.value, …)` — pure helper
  2. `next === textarea.value` 早期 return（0 hit ガード）
  3. `textarea.value = next` — textarea 書き換え
  4. `textarea.dispatchEvent(new Event('input', { bubbles: true }))` — input event 発火
  5. `rerun()` — 再 status 評価
- contract §6.1 のシーケンスと 1 行ずつ一致
- dialog 全体を通じて `dispatcher` / `AppState` / `Container` / `Revision` / `Relation` への参照はゼロ（import していない、grep で確認）
- commit-edit 経路: 既存 `textlogPresenter.collectBody` が textarea.value を読んで hidden body の original と merge し `COMMIT_EDIT` で dispatch。replace は commit-edit の独自経路を追加しない
- Cancel: 既存 CANCEL_EDIT が editor の DOM を完全に破棄、replace 済みの textarea.value も破棄される。dialog module 側の singleton state は次の open で自動 unmount される

### 2.6 ライフサイクルの追加観察（非欠陥）

以下は defect ではないが audit 過程で把握した細目。

- **dialog open 中に `CANCEL_EDIT` / `COMMIT_EDIT` が走ると**: renderer が root を wipe → overlay DOM が消える → `activeEscapeHandler` が document に残留
  - 次回 `openTextlogLogReplaceDialog` 呼び出し時に `activeOverlay !== null` が真のまま → `unmount()` が先行して古い listener を除去 → 自己回復
  - 同じ挙動は TEXT replace dialog（`text-replace-dialog.ts`）にも存在する **既存パターン**であり、S-28 に固有の欠陥ではない
- **edit 中に対象 log を delete ボタンで削除 + dialog で Apply**: 削除 row は `data-pkc-deleted="true"` で印付けされるが textarea は DOM に残り、Apply で textarea.value が書き換わる → commit-edit の collectBody が削除行を skip するため結果は反映されない
  - 契約違反ではない（削除が勝ち、replace 結果は自然に破棄される）
  - contract §5 に明記されていないため将来の明文化余地はあるが、v1 スコープ外で問題なし

## 3. 監査結果サマリ

| 項目 | 結果 |
|------|------|
| 2.1 Target resolution | ✓ OK |
| 2.2 Invariance (id / createdAt / flags / length / order / append / sort) | ✓ OK（構造的保証あり） |
| 2.3 Scope guards (current log only / readonly / historical / viewer) | ✓ OK |
| 2.4 Gating / status 文言 | ✓ OK（contract と逐一一致） |
| 2.5 State interaction | ✓ OK（6.1 シーケンス一致、reducer 非依存） |

**欠陥: 0**
**修正: 不要**
**追加テスト: 不要**

## 4. Contract / feasibility / 実装との整合点

- contract §2.1 surface 条件 4 つ（phase / archetype / DOM / location / access）はすべて renderEditorBody 経由でのみ trigger を出す設計で満たされている
- contract §2.2 「current」の定義（trigger 起動時に id で解決 → セッション中 pin）は実装通り
- contract §4.3 Gating は status 文言を含めて contract 表と実装が完全対応
- contract §4.5 multi-line 跨ぎ防止は「log.text 1 本に直接 `replaceAll` を適用する」構造で担保されており、cross-log match が発生する経路が存在しない
- contract §5 の 7 不変条件すべてが、collectBody の既存実装 / 独立 DOM 要素 / renderer の構造により自動保護
- contract §6.1 Apply 5-step シーケンスは applyReplace 関数と 1:1 対応
- feasibility §6.2 の 5 前提（JSON 非破壊 / pure helper 共有 / dialog 別モジュール / log 単位 trigger / TEXT contract 非破壊）はすべて実装に反映
- `docs/development/textlog-replace-current-log.md` の Invariance 表と実装構造が同一

## 5. 次テーマへの申し送り

- **manual 同期**: 本 audit で契約遵守が確認されたので、manual 05 / 09 への同期へ進んでよい
- **selected lines / whole textlog**: 依然 v2 候補。本 audit で判明した `data-pkc-deleted + dialog Apply` の挙動は、将来 scope 拡張時の contract に書き加える候補
- **CSS.escape の観察**: log id 仕様が拡張されるタイミングで selector safety を再検証

## 6. 意図的に扱わなかったこと

- CSS / 見た目の追加審査（invariance audit の射程外）
- TEXT replace 側の再監査（supervisor 指示により範囲外）
- 他 archetype の置換経路調査
- export / import / ZIP / provenance / block editor 系
- manual の更新（次テーマ）
- ledger / handover への追加記録（docs-only audit 慣例に従い見送り）
