# PR #185 — Background attach: drop without selection / editing transition

**Status**: implemented
**Date**: 2026-04-28
**Predecessors**: PR #176-#184

User direction:
> 「読み込みの都度、追加されたアセットをセンターペインに表示するせいで、
>  せっかくノンブロッキングにした意味がない」
> 「iPhone からですが、添付した直後にエントリメニューが開きっぱなしに
>  なってて邪魔」
> 「添付はバックグラウンドで、ユーザーは編集を続けられるのが望ましい」
> 「画像の最適化が発生してダイアログを出す場合はユーザーの編集を
>  邪魔してもいい」

## 1. 何が起きていたか

`processFileAttachmentWithDedupe` / `processFileAttachment`(sidebar
drop zone, paste fallback)は per-file で 2 dispatch を発火していた:

```ts
dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'attachment', ... });
//   ↑ reducer が selectedLid + editingLid + phase を新エントリに移し、
//     viewMode='detail' にして、editing phase に遷移
const state = dispatcher.getState();
if (state.editingLid) {
  dispatcher.dispatch({ type: 'COMMIT_EDIT', ... });
  //   ↑ editing phase を抜け、ready に戻す。selectedLid は新エントリのまま。
}
```

副作用:
- **selectedLid が新添付に移動**:center pane が再レンダー、ユーザーの
  閲覧コンテキスト消失
- **iPhone shell**:`SELECT_ENTRY` 起点で entry 詳細画面に push、ユーザー
  はメニューが開きっぱなしの状態に閉じ込められる
- **viewMode='detail' 強制**:Calendar / Kanban から添付すると detail
  に飛ばされる
- **N ファイル drop で 2N transition**:30 ファイルなら 60 回 selectedLid
  が変わり、UI がガタガタ

PR #181-#184 で「もっさり」感は CPU レベルで解消したが、UX レベルでは
**dispatch 自体が ユーザーの context を奪う** 構造が残っていた。

## 2. 修正

`PASTE_ATTACHMENT`(paste 経路で歴史的に使用)は **既に必要な処理**を
atomic に行う:
- 添付エントリ作成 + body + asset を 1 dispatch
- selectedLid / editingLid / phase / viewMode を**触らない**
- 自動配置(`contextLid → resolveAutoPlacementFolder → ASSETS subfolder`)
  も内蔵

drop 経路を `PASTE_ATTACHMENT` に切り替えるだけで silent attach が成立。

### Before / After

| 経路 | PRE | NEW |
|---|---|---|
| sidebar drop zone | `CREATE_ENTRY + COMMIT_EDIT` | `PASTE_ATTACHMENT` |
| paste fallback(no textarea) | `CREATE_ENTRY + COMMIT_EDIT [+ CREATE_RELATION]` | `PASTE_ATTACHMENT` |
| editor file drop(編集中) | `PASTE_ATTACHMENT`(変更なし)| 変更なし |
| paste-into-textarea | `PASTE_ATTACHMENT`(変更なし)| 変更なし |

`processFileAttachmentWithDedupe` と `processFileAttachment` 両方で:

```ts
dispatcher.dispatch({
  type: 'PASTE_ATTACHMENT',
  name: file.name,
  mime: payload.mime,
  size: payload.size,
  assetKey,
  assetData: payload.assetData,
  contextLid: contextFolder ?? preState.selectedLid ?? null,
  originalAssetData: payload.originalAssetData,
  optimizationMeta: payload.optimizationMeta,
});
```

`contextLid` は auto-placement の起点:
- `contextFolder` 明示(folder 上 drop)→ そのフォルダの ASSETS subfolder に配置
- `selectedLid` フォールバック(sidebar drop zone)→ 選択 entry の最近接 folder ancestor の ASSETS subfolder に配置
- 両方 null → root に配置

## 3. 画像最適化ダイアログとの両立

ユーザー指示「画像の最適化が発生してダイアログを出す場合は
ユーザーの編集を邪魔してもいい」に従い:

- `prepareOptimizedIntake(file, base64, surface)` 内の `showOptimizeConfirm`
  ダイアログは **PR #185 で変更しない**
- ダイアログは画面中央のモーダル → 添付 1 件あたり 1 回まで(remember-my-choice
  あり)
- ダイアログ表示中は `pasteInProgress` フラグで重複起動を抑止(既存挙動)

つまり「画像最適化を実際に行うか確認」だけは interactive、それ以外の
attach 処理は完全 silent。

## 4. 型変更

`PASTE_ATTACHMENT.contextLid` の型を `string` → `string | null` に
拡張(reducer の `resolveAutoPlacementFolder` は元から null/undefined
を許容)。既存呼び出し側(paste handler / editor drop)はすべて
non-null を渡しているので破壊変更ではない。

## 5. テスト

新規:
- `tests/adapter/background-attach-pr185.test.ts`(3 件)
  - 単一 drop:**selectedLid / editingLid / phase / viewMode 全部 不変**、
    かつ **添付は作成され asset も格納される**
  - 多ファイル drop(3 files):**全完了後も状態不変、3 件すべて添付成功**
  - selection 無し時(selectedLid=null)の drop:root 配置 + 状態不変

既存無修正で全通過:
- `tests/adapter/fi04-multi-add-dedupe-persistent-dnd.test.ts`(15 件、
  P-1..P-7 の dedupe 純粋関数 + I-1..I-5 の integration、すべて
  PASTE_ATTACHMENT 経路でも結果は同一)
- `tests/adapter/action-binder-attach-while-editing.test.ts`(9 件、
  編集中の textarea drop は元から PASTE_ATTACHMENT)

合計 5902 / 5902 unit pass + 11 / 11 smoke pass。

## 6. 後方互換性

- `PASTE_ATTACHMENT.contextLid: string` → `string | null`(緩和、既存
  呼び出しに破壊なし)
- attachment entry / asset 形式 不変、`data-pkc-*` 不変
- `CREATE_ENTRY + COMMIT_EDIT` chain は他の archetype 作成(text /
  todo / textlog 等)で引き続き利用、変更なし
- 画像最適化ダイアログの挙動 不変
- bundle.js: 729.95 KB → 729.16 KB(**−0.79 KB**:CREATE_ENTRY パスの
  bodyMeta + buildAttachmentAssets ヘルパー呼び出しが 2 サイトで消えた)
- bundle.css 不変

## 7. 効果まとめ(PR #181 → #184 → #185)

| 観点 | PR #181 | PR #184 | PR #185 |
|---|---|---|---|
| Memory peak heap(30×5MB)| 7 MB | 7 MB | 7 MB |
| Hash 累積 CPU | 14 s | 0.9 s | 0.9 s |
| Main thread 純占有 | ~10 s | ~3 s | ~3 s |
| Progress UI | なし | 表示 | 表示 |
| **selectedLid 移動回数(30 files)** | 30 | 30 | **0** |
| **editingLid 移動回数** | 30 | 30 | **0** |
| **center pane 再レンダー回数(detail mode)** | 60 | 60 | **0** |
| **iPhone entry view への強制 push** | 30 回 | 30 回 | **0 回** |

## 8. PR #186 候補

- 画像最適化の **OffscreenCanvas 化**(worker 内で decode + resize、
  ダイアログだけ main で出す)→ 30 枚画像 drop で ~9s 削減見込み
- **dispatch バッチ化**(`BATCH_PASTE_ATTACHMENTS` reducer + 1 render
  fold)→ 30 dispatch を 1 回に圧縮
- filter-pipeline メモ化(c-5000 で 100 ms / keystroke 削減見込み)

## 9. Files touched

- 修正: `src/adapter/ui/action-binder.ts`(2 サイト:`processFileAttachmentWithDedupe`
  と `processFileAttachment` で CREATE_ENTRY+COMMIT_EDIT → PASTE_ATTACHMENT
  に切り替え、未使用 import 削除)
- 修正: `src/core/action/user-action.ts`(`PASTE_ATTACHMENT.contextLid`
  型を `string | null` に拡張)
- 新規: `tests/adapter/background-attach-pr185.test.ts`(3 件)
- 新規: `docs/development/background-attach-pr185-findings.md` (this doc)
