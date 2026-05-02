# PR #186 — Root-level ASSETS / TODOS auto-create

**Status**: implemented
**Date**: 2026-04-28
**Predecessors**: PR #176-#185(独立、PR #185 と同じ `contextLid: string | null`
型拡張を含むため merge 順序問わず)

User direction:
> 「root配置はNG rootでもASSETS、TODOSの挙動は一緒
>  仕様が間違ってる 最初の要望ではそんなこと言っていない」

## 1. 何が起きていたか

`auto-folder-placement-for-generated-entries.md` 旧仕様 §"Root fallback":

> "When the context resolver returned `null` (root fallback), the
>  subfolder layer is skipped entirely. We explicitly do **not**
>  auto-create root-level `TODOS` / `ASSETS` buckets — those would
>  scatter at root in exactly the way we set out to stop."

ユーザー意図と逆だった。実害:

- iPhone「+ Compose」で todo 追加(selectedLid=null)→ root にじか配置
- sidebar drop zone で attachment drop(selection 無し)→ root にじか配置
- 結果として root に未整理の incidentals が散乱

ユーザーの最初の要望は「ASSETS/TODOS への整理」**であって**「folder
context があるときだけ」ではなかった。仕様文書が要望を狭く解釈して
いた。

## 2. 修正

新ヘルパー `findRootLevelFolder(container, title): string | null` を
`src/features/relation/auto-placement.ts` に追加:

- 「root-level」= 構造関係の `to` 端に出てこない folder(親無し)
- title 完全一致、最初に見つかったものを返す

reducer の root-fallback 経路を拡張:

### `CREATE_ENTRY`(todo 含む全 incidental)

```ts
} else if (action.ensureSubfolder && action.ensureSubfolder.length > 0) {
  // PR #186: parentFolder 無しでも ensureSubfolder hint があれば
  // root-level bucket folder を find or create
  const sub = action.ensureSubfolder;
  const existingRoot = findRootLevelFolder(container, sub);
  if (existingRoot) {
    placementParentLid = existingRoot;
  } else {
    const rootSubLid = generateLid();
    container = addEntry(container, rootSubLid, 'folder', sub, ts);
    events.push({ type: 'ENTRY_CREATED', lid: rootSubLid, archetype: 'folder' });
    placementParentLid = rootSubLid;
    autoCollapsedNewFolders.push(rootSubLid);
  }
}
```

`autoCollapsedNewFolders` にも乗せるので、新 root-level folder は折り
たたみ状態で表示(既存仕様継承)。

### `PASTE_ATTACHMENT`(画像ペースト + sidebar drop)

```ts
} else {
  // No folder context — route through root-level ASSETS.
  const existingRoot = findRootLevelFolder(container, subName);
  if (existingRoot) {
    placementParentLid = existingRoot;
  } else {
    const rootSubLid = generateLid();
    container = addEntry(container, rootSubLid, 'folder', subName, ts);
    events.push({ type: 'ENTRY_CREATED', lid: rootSubLid, archetype: 'folder' });
    placementParentLid = rootSubLid;
  }
}
```

### action-binder

incidental archetype のとき `ensureSubfolder` を **常に** 渡すように:

```ts
// PR #186
const ensureSubfolder = subfolderName ?? undefined;
```

(従来は `parentFolder && subfolderName ? ... : undefined` で
parentFolder 無しなら hint も落ちていた)

## 3. iPhone file-picker yield

ユーザー言「iPhone固有かもしれない」を受け、file picker 経路の
outer loop にも `await yieldToEventLoop()` を追加(drop zone は PR #181
で対応済だった):

```ts
processFileAttachmentWithDedupe(files[idx]!, contextFolder, dispatcher, () => {
  if (idx + 1 < files.length) {
    void yieldToEventLoop().then(() => processNext(idx + 1));
  } else {
    processNext(idx + 1);
  }
});
```

これで burst 30 ファイル添付でも各ファイル間で UI 描画 / 入力処理が
入り、main thread が独占されない。

## 4. 主要 archetype は変更なし

`text` / `textlog` / `folder` / `form` / `generic` / `opaque` は
`getSubfolderNameForArchetype` が `null` を返すため `ensureSubfolder`
を渡さない → reducer の新 branch に入らない → 従来通り **root に配置可能**。

つまり「primary documents は root に置けるが incidentals は必ず
ASSETS/TODOS に整理」という二段構えに整理された。

## 5. 後方互換性

- `CREATE_ENTRY` action 形 不変(`ensureSubfolder` は元から optional)
- `PASTE_ATTACHMENT.contextLid` 型を `string` → `string | null` に拡張
  (PR #185 と同変更、reducer の `resolveAutoPlacementFolder` は元から
  null/undefined 許容)
- 既存 root-level ASSETS/TODOS folder は **再利用** されて重複作成
  されない
- `nested ASSETS / TODOS` の挙動は不変(folder context あるときの
  従来パス)

## 6. テスト

新規:
- `tests/core/auto-placement-root-bucket-pr186.test.ts`(7 件)
  - CREATE_ENTRY:第 1 todo で root TODOS 自動作成 + 配置
  - 再利用:複数 todo が同じ root TODOS を共有(重複作成無し)
  - nested 経路は変わらず:explicit parentFolder + ensureSubfolder
    でフォルダ内 TODOS 作成
  - PASTE_ATTACHMENT:第 1 paste で root ASSETS 自動作成 + 配置
  - 再利用:複数 paste が同じ root ASSETS を共有
  - context あり時の nested ASSETS は従来通り
  - 既存 root ASSETS と nested ASSETS が両方ある状態 → root のみ採用

更新:
- `tests/core/app-state.test.ts` PASTE_ATTACHMENT 3 件:旧 root-unfiled
  の挙動を新 root-level ASSETS の挙動に書き換え
- `tests/adapter/action-binder-auto-placement.test.ts` 2 件 + 新 1 件:
  todo の root-level TODOS 自動作成と再利用を pin

合計 5907 / 5907 unit pass + 11 / 11 smoke pass。

## 7. spec doc

`docs/development/auto-folder-placement-for-generated-entries.md`:
- §1 "Context-folder resolution" の "null = no auto-placement" を
  "null = root fallback path" に修正
- §3 "Root-level bucket fallback (PR #186)" を新設、新ルール明記、
  ユーザー要望を引用

`src/core/action/user-action.ts` の `CREATE_ENTRY` JSDoc も更新
(旧 "ensureSubfolder is ignored" → 新 "root-level bucket auto-create")。

## 8. Files touched

- 修正: `src/features/relation/auto-placement.ts`(`findRootLevelFolder`
  追加、~30 行)
- 修正: `src/adapter/state/app-state.ts`(`CREATE_ENTRY` reducer の
  `else if` 分岐追加、`PASTE_ATTACHMENT` reducer の root-fallback
  分岐追加、import に `findRootLevelFolder` 追加、~50 行)
- 修正: `src/adapter/ui/action-binder.ts`(`ensureSubfolder` 常時送出 +
  file-picker outer loop の yield、~15 行)
- 修正: `src/core/action/user-action.ts`(`CREATE_ENTRY` JSDoc 更新 +
  `PASTE_ATTACHMENT.contextLid` 型を nullable に拡張)
- 修正: `docs/development/auto-folder-placement-for-generated-entries.md`
  (仕様 §3 新設)
- 新規: `tests/core/auto-placement-root-bucket-pr186.test.ts`(7 件)
- 修正: `tests/core/app-state.test.ts`(PASTE_ATTACHMENT 3 件 inverted)
- 修正: `tests/adapter/action-binder-auto-placement.test.ts`(todo
  root 関連 3 件 inverted、+1 件追加)
- 新規: `docs/development/root-bucket-pr186-findings.md` (this doc)

## 9. PR #185 との関係

PR #186 は PR #185 と独立してマージ可能。両方が `PASTE_ATTACHMENT.contextLid`
を `string | null` に拡張しているため、片方が先にマージされたあと
もう片方は no-op 差分で衝突無し。

PR #185(silent attach via PASTE_ATTACHMENT)がマージ済の場合、PR #186
の root-fallback は drop / paste / file-picker すべての attach 経路で
即座に効く。PR #185 が未マージなら、PR #186 の root-fallback は
PASTE_ATTACHMENT の既存 caller(画像ペースト経路)と CREATE_ENTRY の
incidental caller で先に効く。
