# Boot Container Source Policy Revision — Post-Implementation Invariance Audit

Status: ACCEPTED (audit, no defects found)
Date: 2026-04-16
Scope: `d6c2d7b` (fix(boot): embedded pkc-data is view-only; IDB expansion only via explicit Import) 後見的レビュー
Related:
- `docs/development/boot-container-source-policy-revision.md`（実装 spec）
- `docs/development/boot-container-source-priority.md`（S-24 の先行 fix、本 revision で上書き）
- `src/adapter/platform/pkc-data-source.ts`（`chooseBootSource` / `finalizeChooserChoice`）
- `src/adapter/platform/persistence.ts`（`doSave` の viewOnlySource ガード）
- `src/adapter/state/app-state.ts`（`viewOnlySource` reducer 経路）
- `src/core/action/system-command.ts`（`SYS_INIT_COMPLETE.viewOnlySource`）
- `src/adapter/ui/boot-source-chooser.ts`（chooser overlay）
- `src/main.ts` §11（boot flow）
- `tests/adapter/pkc-data-source.test.ts` / `persistence.test.ts` / `boot-source-chooser.test.ts`

---

## 1. 監査方針

`d6c2d7b` の実装が `boot-container-source-policy-revision.md` の契約（embedded pkc-data は view-only snapshot、IDB 書き出しは明示 Import のみ）を本当に守っているかを、**実装コードを 1 パス** で読み下して確認する。

audit は原則 docs-only。具体的な欠陥が見つかった場合のみ最小修正を許可する方針だったが、**本 audit では欠陥は見つからなかった** ため、production code / test は一切変更せず本メモ 1 本で閉じる。

## 2. チェック項目と結果

### 2.1 Boot source resolution

**チェック**: `chooseBootSource` の 4 分岐が matrix 通りに決まるか。`main.ts` §11 が分岐ごとに正しい `SYS_INIT_COMPLETE` を dispatch するか。

**結果**: OK ✓

- `chooseBootSource(pkcData, idb)` は純粋関数（DOM / IDB / globals 非依存、`pkc-data-source.ts:134-178`）
  - `pkcData && idb` → `source:'chooser'`、`container:null`、両者を `pkcData` / `idbContainer` に stash
  - `pkcData` のみ → `source:'pkc-data'`、`viewOnlySource:true`（readonly / lightSource は pkcData の値をそのまま転送）
  - `idb` のみ → `source:'idb'`、`viewOnlySource:false`（readonly / lightSource は inherit しない）
  - 両者 null → `source:'empty'`、`viewOnlySource:false`
- `main.ts` §11（`main.ts:424-485`）は `chooser` 分岐を `showBootSourceChooser` → `finalizeChooserChoice` で必ず concrete source に畳み込み、3 switch case（`pkc-data` / `idb` / `empty`）で dispatch
- `pkc-data` ブランチだけが `SYS_INIT_COMPLETE.viewOnlySource` を payload に載せる（`main.ts:459`）。`idb` / `empty` は payload に含めず、reducer の `?? false` fallback（`app-state.ts:300`）で安全に false 化される

### 2.2 View-only contract（save suppression）

**チェック**: `viewOnlySource=true` が save を完全に遮断するか。debounce / pagehide / flushPending すべての経路でガードが効くか。

**結果**: OK ✓（構造的保証）

- `persistence.ts:123` の `if (currentState.viewOnlySource) return;` は `doSave()` 冒頭の早期 return
- save triggering パス 3 経路すべてが `doSave()` を経由する:
  1. `scheduleSave()` → debounce タイマー → `doSave()`（`persistence.ts:93-99`）
  2. `pagehide` handler → `flushPending()` → `doSave()`（`persistence.ts:166-176`）
  3. 外部呼び出しの `handle.flushPending()` → `doSave()`（`persistence.ts:146-152`）
- `lightSource` ガード（`persistence.ts:114`）と `viewOnlySource` ガード（`persistence.ts:123`）は **独立並列**。どちらか一方が true でも save は skip。両フラグの独立性は invariant I-Boot7 / light-mode 契約の両方に一致
- SAVE_TRIGGERS は `CONTAINER_LOADED` を含むため通常なら boot 直後に save が走るが、`viewOnlySource=true` の boot 経路では構造的に遮断される

### 2.3 Explicit import gate（clear paths）

**チェック**: `viewOnlySource` を false に戻すのは明示 Import 系 reducer のみか。その他 reducer で意図せず clear されないか。

**結果**: OK ✓

`app-state.ts` を逐一確認した:

| reducer case | viewOnlySource 処理 | 行 |
|--------------|-------------------|-----|
| `SYS_INIT_COMPLETE`（initializing） | `action.viewOnlySource ?? false` で設定（boot choice 反映） | 300 |
| `SYS_INIT_COMPLETE`（error recovery） | `action.viewOnlySource ?? false` で設定 | 1423 |
| `CONFIRM_IMPORT`（ready） | 明示的 `viewOnlySource: false` | 707 |
| `SYS_IMPORT_COMPLETE`（ready） | 明示的 `viewOnlySource: false` | 584 |
| `SYS_IMPORT_COMPLETE`（error recovery） | 明示的 `viewOnlySource: false` | 1446 |
| `CONFIRM_MERGE_IMPORT`（ready） | 明示的 `viewOnlySource: false` | 749 |
| `REHYDRATE`（readonly → writable） | 明示的 `viewOnlySource: false` | 1027 |
| その他すべての reducer case | `...state` spread で継承 | — |

- clear 経路は **7 箇所すべて explicit promotion gate**（boot / Import / Merge Import / Rehydrate）で、その他の reducer（SELECT_ENTRY / CREATE_ENTRY / COMMIT_EDIT / BULK_* / ACCEPT_OFFER / QUICK_UPDATE_ENTRY 等）は `...state` spread でフラグを保存する
- 通常の編集 action は viewOnlySource を温存 → 次の save trigger でも遮断が継続する

### 2.4 Chooser semantics

**チェック**: `finalizeChooserChoice` が純粋か。iframe 経路で chooser がスキップされるか。UI が policy 通りか。

**結果**: OK ✓

- `finalizeChooserChoice(pkcData, idb, choice)` は純粋関数（`pkc-data-source.ts:189-210`）
  - `choice === 'pkc-data'` → `source:'pkc-data'`、`viewOnlySource:true`、readonly / lightSource は pkcData から転送
  - `choice === 'idb'` → `source:'idb'`、`viewOnlySource:false`、readonly / lightSource = false
- `main.ts:429-448`: `chooser` 分岐で `embedCtx.embedded` を先頭チェック。iframe の場合は `showBootSourceChooser` を呼ばず、`finalizeChooserChoice(..., 'pkc-data')` にサイレントフォール（I-Boot5）
- `showBootSourceChooser` 経路は document.body に overlay を mount し、ユーザーの click を `Promise<ChooserChoice>` で返す。`closeBootSourceChooser` / 二重 open の置換ロジックはテストで別途検証済み
- UX 仕様（Escape / backdrop click で閉じない、default focus が embedded ボタン、日本語固定）は `boot-source-chooser.ts` と `boot-source-chooser.test.ts` で一致

### 2.5 Regression check

**チェック**: S-24 の「埋め込み HTML 表示」契約を壊していないか。readonly / lightSource の既存挙動を壊していないか。IDB contamination の再発構造が存在しないか。

**結果**: OK ✓

- **S-24 preservation**: `chooseBootSource` の pkc-data-only 分岐（`pkc-data && !idb`）は旧実装と同じく pkc-data をそのまま boot する。embedded HTML の中身は以前と同じく表示される
- **readonly**: `chooseBootSource` / `finalizeChooserChoice` は pkcData.readonly をそのまま転送。reducer 側の readonly ガード（`blocked` による編集系 action の拒否）は全く触っていないため、readonly export の挙動は無変更
- **lightSource**: `chooseBootSource` / `finalizeChooserChoice` は pkcData.lightSource をそのまま転送。`persistence.ts:114` の lightSource ガードは既存のままで、viewOnlySource と並列に維持
- **contamination 再発構造なし**: pkc-data ブート中は save 経路全体が遮断される（§2.2）ため、次回起動時の IDB には pkc-data 由来のスナップショットが残らない。再度 HTML を開いても `chooseBootSource` は同じ判定を返す（両立時は chooser、単独時は pkc-data / viewOnlySource=true）

### 2.6 非欠陥観察

audit 過程で把握した観察点（すべて非欠陥、将来の参考情報）:

- **iframe + ACCEPT_OFFER の扱い**: iframe 経路は chooser をスキップして pkc-data を silent fall → viewOnlySource=true になる。親ページから受け取った record offer を `ACCEPT_OFFER` で accept した場合も、reducer は `...state` spread で viewOnlySource=true を保存するため、IDB 書き出しは行われない。embedded 用途としては正しい挙動（iframe は親駆動の非永続セッション）だが、仕様として明記されていない。将来 embedded offer-accept の永続化が必要になった場合は別契約で扱う。
- **`?? false` による fail-safe**: `SYS_INIT_COMPLETE.viewOnlySource` は optional で、reducer 側 `?? false` で未指定時は false になる。`main.ts` の `idb` / `empty` 分岐は payload に含めず、意図的にこの fail-safe に乗っている。既存テスト fixture（手書きの AppState）や将来の呼び出し箇所が viewOnlySource を忘れても安全側に倒れる設計。
- **closeBootSourceChooser の unmount-only セマンティクス**: `closeBootSourceChooser()` は overlay を DOM から外すだけで、showBootSourceChooser が返した Promise は resolve しない。呼び出し側が手動 close した場合、boot flow は pending Promise を掴んだまま止まる。`main.ts` の通常経路は click による resolve しか通らないため実害はないが、将来テスト経路やエラーリカバリで手動 close を呼ぶ場合は Promise の扱いに注意が必要。
- **iframe 経路の単体テスト非カバー**: `main.ts:430-437` の `embedCtx.embedded` branch は `main.ts` ランタイムでのみ検証され、pkc-data-source / boot-source-chooser の単体テストではカバー外。I-Boot5 の振る舞いはテストではなく main.ts 側のコードパスで担保されている状態。
- **viewOnlySource の持続期間（将来の注意点）**: 現在の設計では boot で true、明示 Import で false となる「セッション内フラグ」である。multi-container / タブ切替 / session restore のような機能が将来入ると、フラグのスコープが問題になる可能性がある。現状は単一 container / 単一セッションの前提なので完全にスコープ内で閉じている。

## 3. 監査結果サマリ

| 項目 | 結果 |
|------|------|
| 2.1 Boot source resolution（4 分岐 + dispatch 経路） | ✓ OK |
| 2.2 View-only contract（save 全経路遮断） | ✓ OK（構造的保証） |
| 2.3 Explicit import gate（7 reducer clear 経路） | ✓ OK |
| 2.4 Chooser semantics（pure + iframe skip + UX） | ✓ OK |
| 2.5 Regression check（S-24 / readonly / lightSource / contamination） | ✓ OK |

**欠陥: 0**
**修正: 不要**
**追加テスト: 不要**

## 4. Policy / 実装 / テストの整合点

- revision policy §Boot matrix の A–F 全ケースが `chooseBootSource` + `main.ts` §11 の分岐で網羅されている
- I-Boot1〜I-Boot7 の不変条件はすべて実装コード上で構造的に担保されている:
  - I-Boot1（pkc-data 起動で IDB 書き換わらず）→ §2.2
  - I-Boot2（IDB 起動は save 継続）→ §2.2 の fail-safe
  - I-Boot3（明示 Import で clear + save 再開）→ §2.3
  - I-Boot4（両立時のみ chooser）→ §2.1
  - I-Boot5（iframe で chooser skip）→ §2.4
  - I-Boot6（fresh bundle `{}` で IDB-first）→ `readPkcData` の `raw === '{}'` early return
  - I-Boot7（readonly / lightSource 既存契約保持）→ §2.5
- テストカバレッジ:
  - `pkc-data-source.test.ts`: chooseBootSource 7 分岐 + finalizeChooserChoice 3 ケース（純粋関数）
  - `persistence.test.ts`: viewOnlySource=true で save skip / 明示 Import で clear + resume / viewOnlySource=false で通常 save
  - `boot-source-chooser.test.ts`: overlay mount / 両ボタンの Promise 解決 / unmount / 二重 open 置換 / 手動 close
  - 既存 3920 件の regression は無変更で通過

## 5. 次テーマへの申し送り

- **manual 同期**: 本 audit で policy 遵守が確認されたので、manual 07（保存と持ち出し）/ 09（トラブルシューティング）への最小同期へ進んでよい。同期対象は「HTML を開いても IDB に自動展開されない」「両立時 chooser が出る」「IDB 書き出しは明示 Import のみ」の 3 点と、対応するトラブルシューティング項目
- **多 container / session restore（将来）**: §2.6 の viewOnlySource 持続期間観察を該当テーマの検討時に参照すべき
- **H-10 merge import conflict UI**: 本 audit で boot 契約が安定したので、次は H-10 の contract 段階に復帰できる
- **`closeBootSourceChooser` の Promise 扱い**: 将来 error recovery の文脈で必要になった場合、Promise を reject するかタイムアウトで resolve する設計オプションを検討する

## 6. 意図的に扱わなかったこと

- CSS / chooser UI の見た目の追加審査（invariance audit の射程外、polish は別テーマ）
- iframe 経路の単体テスト追加（production code 側が変わっていないため audit 方針に従い見送り）
- manual 全体再編（次テーマで最小同期のみ）
- H-10 conflict UI 作業（本 audit のスコープ外）
- import / export / ZIP / block editor 系の再監査（範囲外）
- ledger / handover への追加記録（docs-only audit 慣例、supervisor 承認時に別途）
