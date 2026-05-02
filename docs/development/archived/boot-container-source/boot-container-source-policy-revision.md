# Boot Container Source Policy Revision

Status: COMPLETED 2026-04-16
Related:
- `src/adapter/platform/pkc-data-source.ts`（`chooseBootSource` / `finalizeChooserChoice`）
- `src/adapter/ui/boot-source-chooser.ts`（chooser UI）
- `src/adapter/state/app-state.ts`（`viewOnlySource` field + `SYS_INIT_COMPLETE` / `CONFIRM_IMPORT` / `SYS_IMPORT_COMPLETE` / `CONFIRM_MERGE_IMPORT` / `REHYDRATE`）
- `src/adapter/platform/persistence.ts`（`viewOnlySource` save suppression）
- `src/main.ts` §11
- `docs/development/boot-container-source-priority.md`（S-24 の先行 fix、本書で上書き）

---

## 問題

**S-24（`boot-container-source-priority.md`）の残件**:

S-24 は「エクスポート HTML を開いたとき IDB より pkc-data を優先表示する」という表示順序の fix を入れた。結果としてエクスポート HTML の中身は **見える** ようになったが、以下の暗黙動作が残っていた:

1. pkc-data からブートした Container が `SYS_INIT_COMPLETE` → `CONTAINER_LOADED` event をトリガー
2. `persistence.ts` の `SAVE_TRIGGERS` には `CONTAINER_LOADED` が含まれる
3. 300ms のデバウンスを経て `store.save(container)` が **自動的に** 実行される
4. 以後、ブラウザの IndexedDB には pkc-data 由来のスナップショットが常駐する
5. 次回以降、**どの HTML を開いても** その IDB コンテナが候補として残る（pkc-data が空であれば IDB が勝つ）

つまり「受信者が HTML をただ見ただけで、自分の IndexedDB が上書きされる」という **contamination** が発生していた。

これは import / export UX の根幹に反する:

- **参照目的で HTML を開く**: ユーザーは保存されることを期待していない
- **IDB の汚染**: 受信者の以前の作業状態が静かに上書きされる
- **明示的な Import 操作の不在**: 「見る」と「取り込む」が区別されない

## 新 policy

### 基本原則

> 埋め込み pkc-data は **view-only snapshot**。IDB への永続化は **明示的 Import** のときだけ。

これを実現するため、以下 3 つの変更を入れる:

1. **`viewOnlySource` フラグ**: AppState に追加（optional、default false）。pkc-data 起動経路で `true` にセット。persistence.ts はこのフラグが立っているとき save を skip する
2. **起動 source chooser**: pkc-data と IDB が **両方** 存在するとき、起動時に modal overlay でユーザーに選ばせる
3. **Import 経路の明示化**: 既存 Import 経路（`CONFIRM_IMPORT` / `SYS_IMPORT_COMPLETE` / `CONFIRM_MERGE_IMPORT` / `REHYDRATE`）が `viewOnlySource: false` にリセット → save 再開

### Boot matrix

| ケース | pkc-data | IDB | 挙動 | viewOnlySource | IDB 保存 |
|--------|---------|-----|-----|---------------|---------|
| A. fresh bundle | 空 (`{}`) | 無 | empty container | false | 最初の編集から save |
| B. 通常再起動 | 空 | 有 | IDB から load | false | save 継続 |
| C. 参照用 HTML 開く（IDB 空） | 有 | 無 | pkc-data load | **true** | **save なし** |
| D. 参照用 HTML 開く（IDB 有） | 有 | 有 | **chooser 表示** | 選択次第 | 選択次第 |
| D-1. D で embedded 選択 | — | — | pkc-data load | **true** | **save なし** |
| D-2. D で IDB 選択 | — | — | IDB load | false | save 継続 |
| E. 明示的 Import 操作 | — | — | `CONFIRM_IMPORT` 経由 | **false にリセット** | save 再開 |
| F. iframe 埋め込み（D 相当） | 有 | 有 | pkc-data 優先（chooser skip） | **true** | **save なし** |

**重要な変化**:

- 従来: C / D でも pkc-data が IDB に書き出されていた
- 新 policy: C / D-1 / F で pkc-data は **純粋な view-only**、IDB は触らない
- D: 両方存在時にのみ chooser が出現
- E: 明示的 Import のみが IDB 書き出しの正規経路

### Explicit import only の意味

「IDB への書き出しは Import 操作だけ」という新方針の帰結:

- pkc-data 起動後にユーザーが編集しても、**リロードで消える**（in-memory only）
- 編集を永続化したければ、
  1. 現在の HTML をファイルとして保存
  2. `📥 Import` ボタンでそのファイルを選択
  3. CONFIRM_IMPORT 経由で IDB に書き出される
- これは UX 上は 1 ステップ多いが、「見る」と「取り込む」を明確に分離できる

**既存の save() 契約は変更しない**: `persistence.ts` の debounce / pagehide / flushPending / onError 経路はすべてそのまま。追加したのは `viewOnlySource` チェック 1 行のみ。

### Chooser UI

起動時 modal overlay。`src/adapter/ui/boot-source-chooser.ts` に独立モジュールとして配置:

- タイトル: `どちらのコンテナを開きますか？`
- 各候補（pkc-data / IDB）のサマリ表示:
  - Title / Entry count / Container ID / Updated timestamp
- ボタン 2 個:
  - `埋め込みを開く (view-only)` — pkc-data 経路、viewOnlySource=true
  - `IndexedDB を開く` — IDB 経路、viewOnlySource=false
- default focus: 埋め込みボタン（HTML を「開いた」動作の素直な帰結）
- **Escape / backdrop click で閉じない**: コンテナ未決定で boot を進められないため、必ず 1 つ選ぶ必要がある
- iframe 埋め込み時は chooser を skip（pkc-data 優先、S-24 との互換）

### 構造変更

| ファイル | 変更 |
|---------|-----|
| `src/adapter/platform/pkc-data-source.ts` | `BootSource.viewOnlySource` 追加 / `source: 'chooser'` 分岐 / `finalizeChooserChoice` helper 新規 |
| `src/adapter/ui/boot-source-chooser.ts` | **新規** — overlay mount + 2 ボタン + Promise<choice> |
| `src/adapter/state/app-state.ts` | `AppState.viewOnlySource?: boolean` 追加、`SYS_INIT_COMPLETE` / `CONFIRM_IMPORT` / `SYS_IMPORT_COMPLETE` / `CONFIRM_MERGE_IMPORT` / `REHYDRATE` の各 reducer で明示的に設定 |
| `src/core/action/system-command.ts` | `SYS_INIT_COMPLETE` payload に `viewOnlySource?: boolean` 追加 |
| `src/adapter/platform/persistence.ts` | `currentState.viewOnlySource` 時に save skip（`lightSource` と同じ層） |
| `src/main.ts` | §11 で chooser 経路を追加、`finalizeChooserChoice` 呼び出し |
| `src/styles/base.css` | `pkc-boot-chooser-*` スタイル追加（既存 `pkc-text-replace-overlay` / `-card` / `-actions` を継承） |

## Why explicit import only

1. **UX 整合**: 「見る」動作が IDB を汚染しない、直感的な mental model
2. **データ保全**: 受信者の以前の作業状態を踏み潰さない
3. **権限の明確化**: Import ボタンが「取り込み」の唯一の正規経路
4. **readonly / light export との整合**: 両者も save を suppress する方針、同じレイヤで統一
5. **テスト容易性**: pure helper `chooseBootSource` / `finalizeChooserChoice` が discriminated 判定を担当し、UI は Promise で包める
6. **backward compatibility**: fresh bundle（`pkc-data = {}`）や通常再起動（B）は従来通り IDB-first で動作

## Test coverage summary

### `tests/adapter/pkc-data-source.test.ts`（既存 14 件 → 17 件、+3 件）

- `readPkcData` 8 件（従来通り、無変更）
- `chooseBootSource` 7 件（再構成）:
  - **新規**: `source: 'chooser'` 分岐（両方存在時）
  - pkc-data のみ → viewOnlySource=true
  - readonly / lightSource forwarding
  - IDB fallback
  - empty fallback
  - readonly/lightSource/viewOnlySource の非継承
- `finalizeChooserChoice` 3 件（新規）:
  - pkc-data 選択 → viewOnlySource=true
  - idb 選択 → viewOnlySource=false
  - readonly / lightSource 保持

### `tests/adapter/persistence.test.ts`（既存 + 3 件）

- **新規**: `viewOnlySource=true` 時 save skip（CONTAINER_LOADED も後続 mutation も）
- **新規**: 明示 Import 後 viewOnlySource クリア → save 再開
- **新規**: `viewOnlySource=false` 時は従来通り CONTAINER_LOADED で save

### `tests/adapter/boot-source-chooser.test.ts`（新規 7 件）

- overlay mount / `isBootSourceChooserOpen()`
- 両候補のサマリ表示
- `pkc-data` 選択で Promise 解決
- `idb` 選択で Promise 解決
- 選択後 DOM から unmount
- 再 open で古い overlay を置換
- `closeBootSourceChooser()` で手動 unmount

### 既存 regression

- 従来 `tests/adapter/pkc-data-source.test.ts` の「pkc-data 優先」を validate する testcase は、**両方存在** の前提だったので chooser 経路に書き換え（意味的には等価な検証）
- `persistence.test.ts` / `app-state.test.ts` / 全体 3920 件は変更なしで通る

## 非対象（明示的に今回やらない）

- **multi-source workspace**: 複数 container を同時に開く仕組みは別テーマ
- **chooser の永続設定**: 「次回以降もこれで開く」のような preference 記憶
- **chooser UI polish**: animation / custom theme / 多言語切替（固定 Japanese 1 択）
- **promote ボタン**: pkc-data を view-only → IDB 書き出しに明示昇格する shortcut
- **import の UX 再編**: Import button 自体の UI は無変更
- **merge / import conflict UI**: H-10 系は別テーマ
- **block editor / replace 系の変更**: scope 外

これらは将来 polish / 別テーマ候補として HANDOVER 向けに記録しておく（LEDGER / HANDOVER 反映は supervisor 承認後）。

## 関連する不変条件

| 項目 | 保証 |
|------|------|
| **I-Boot1** | pkc-data 起動で IDB は絶対に書き換わらない（viewOnlySource=true → persistence skip） |
| **I-Boot2** | IDB 起動は従来通り save を継続（viewOnlySource=false） |
| **I-Boot3** | 明示 Import で viewOnlySource=false にリセット、save 再開 |
| **I-Boot4** | pkc-data + IDB 両方存在時のみ chooser が出現、それ以外は従来分岐 |
| **I-Boot5** | iframe embedded 時は chooser skip（embedded workflow 保全） |
| **I-Boot6** | fresh bundle（pkc-data=`{}`）は readPkcData=null、従来通り IDB-first |
| **I-Boot7** | readonly / lightSource の既存契約は完全保持（両フラグは viewOnlySource と独立） |

## 経路比較（S-24 との差分）

| 経路 | S-24 | 本 revision |
|-----|------|-----------|
| HTML 開いて IDB 空 | pkc-data load + IDB 書き出し（汚染） | pkc-data load + IDB 触らず（view-only） |
| HTML 開いて IDB 有 | pkc-data 優先 load + IDB 書き出し（汚染） | **chooser 表示** → 選択次第 |
| fresh bundle 再起動 | IDB から load | 同じ |
| 明示 Import | IDB 書き出し | 同じ（変更なし） |
| iframe embedded | pkc-data load | 同じ（chooser skip） |
| readonly export | save blocked（reducer） | 同じ |
| light export | save blocked（lightSource） | 同じ |

## 今後の polish 候補

- view-only 表示時の visual indicator（header に `👁 view-only` バッジ）
- view-only → writable の 1-click promote ボタン（IDB に save するだけ）
- chooser の 3rd option「新規 container で開く」
- multi-container session（長期）

これらは v1 スコープ外。supervisor 承認時に個別判断。
