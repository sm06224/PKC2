# Entry-ref Autocomplete v1.5 — Modifier-Enter handling policy

**Status**: implementation — 2026-04-20.
**Scope**: entry-ref autocomplete popup が開いている間に **Ctrl+Enter / Cmd+Enter** が押された時の挙動を確定する。`Escape` / `Enter` / `Tab` / `ArrowUp` / `ArrowDown` / `mousedown` 等他の挙動は不変。

## 1. 現状挙動（事実確認）

`src/adapter/ui/entry-ref-autocomplete.ts:289` の popup keyboard handler:

```ts
case 'Enter':
case 'Tab':
  e.preventDefault();
  if (activeMode === 'entry') {
    insertEntryCandidate(visibleEntries[selectedIndex]!);
  } else {
    insertFragmentCandidate(visibleFragments[selectedIndex]!);
  }
  return true;
```

`e.key === 'Enter'` は **plain Enter / Ctrl+Enter / Cmd+Enter / Shift+Enter / Alt+Enter のすべてで真** → 現状は **すべての Enter 派生で popup 候補を accept** している（修飾キーの区別なし）。

これは意図的ではなく、`e.ctrlKey` / `e.metaKey` をチェックしていない結果。**事実上 Option A 状態だが、設計判断としては明示されていない**。

一方、global keyboard handler (action-binder.ts:1810):

```ts
if (mod && e.key === 'Enter'
    && e.target.getAttribute('data-pkc-field') === 'textlog-append-text') {
  performTextlogAppend(lid);
}
```

textlog append textarea で `Ctrl+Enter` / `Cmd+Enter` を押すと、新規 log を追加する。**popup が開いている間はこのハンドラに到達しない**（popup 側が `return true` で先に consume）。

つまり: **popup 起動中にユーザーが「ログ追加するつもり」で Ctrl+Enter を押すと、popup の候補が代わりに挿入される**。これはサイレントな意図のミスマッチ。

## 2. A / B / C 比較

### Option A — Ctrl+Enter = accept（現状追認）
- popup で plain Enter と同じく候補を accept
- Pros:
  - キーストロークが少ない
  - 「Enter 系で確定」の単一原則
- Cons:
  - **textlog append の Ctrl+Enter とぶつかる**。ユーザーが「ログを追加したい」と意図したつもりが、popup の候補を挿入してしまう
  - 起こりうる典型シナリオ: textlog append textarea で `(entry:foo` まで打ったあと、リンクを諦めて Ctrl+Enter で append するケース → popup が開いていれば lid が挿入されてしまう
  - ユーザーは popup の存在を見落とすことがある（peripheral vision）

### Option B — Ctrl+Enter = close popup + pass through（**採用**）
- popup を閉じて `return false` → action-binder の global Ctrl+Enter ハンドラに event を流す
- Pros:
  - **textlog append の muscle memory を保護**
  - "Enter で accept、Ctrl+Enter で editor-level shortcut" という意味分離が明快
  - 誤挿入リスクが消える
  - Escape も "close without accept" なので一貫性あり
  - 実装は popup handler に 4 行追加だけ
- Cons:
  - 「popup 表示中の Ctrl+Enter で候補を accept」という理論上の用法ができなくなる（が、それを意図するユーザーは plain Enter で十分）

### Option C — pass through unchanged（現状を documentation で固定）
- popup handler が Ctrl+Enter を完全に無視 (`return false`) して何もしない
- popup は開いたまま、global handler が走る
- textlog append が走った後、textarea の中身が空になり、popup は古い textarea 参照を保持したまま残る → input 再評価で消えるかもしれないが、過渡状態が見える
- Pros:
  - 最小変更（実装 1〜2 行）
- Cons:
  - **popup が空のまま視覚的に残る** → ユーザー混乱
  - 過渡状態の挙動が "input イベントで自然に閉じる" に依存していて非決定的に見える
  - "popup 表示は中途半端だが OK" を spec で正当化しないといけない

## 3. 採用判断: **Option B**

選定理由:
1. **textlog append の Ctrl+Enter は確立した shortcut**。popup によって偶発的に上書きされる UX は受け入れがたい
2. plain Enter で accept できるので、accept 経路は失われない
3. Escape と並ぶ「明示的 close」として Ctrl+Enter を扱える（"editor-level の意図を popup に優先する"）
4. 実装が極めて小さく、回帰リスクが最小
5. Cmd+Enter (mac) / Ctrl+Enter (linux/win) をどちらも同じセマンティクスで吸収可能

### 不採用理由

- **A 不採用**: textlog append の muscle memory 衝突がユーザー体験の芯を直撃する。「accept したいだけなら plain Enter で済む」ので Ctrl+Enter accept の積極的価値はない
- **C 不採用**: popup が古い textarea 参照を抱えたまま残る過渡状態は、データ的には壊れていなくても視覚的に混乱を招く。"何もしないことで治る" は良い設計ではない

## 4. 実装

### 変更
`src/adapter/ui/entry-ref-autocomplete.ts` の `handleEntryRefAutocompleteKeydown` 内、`Escape` チェックの直後 / `count === 0` 早期 return の前に以下を挿入:

```ts
// v1.5: Ctrl/Cmd+Enter is reserved for editor-level shortcuts
// (notably textlog append). Always close the popup and pass through
// so the underlying handler can run. Plain Enter still accepts.
if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
  closeEntryRefAutocomplete();
  return false;
}
```

`return false` で popup handler が consume しないことを明示 → action-binder 側の `if (handleEntryRefAutocompleteKeydown(e)) return;` を素通り → 後続の textlog append handler に event が届く。

### 影響範囲
- entry / fragment 両 mode で同じ
- candidate 数によらず（empty list でも同じく close + pass through）
- Tab には影響なし（Tab は引き続き accept）
- Shift+Enter / Alt+Enter は現状維持（plain Enter と同じく accept、別 issue として保留）

## 5. テスト観点

### 新規テスト（`tests/adapter/entry-ref-autocomplete.test.ts` に追加）

- **Ctrl+Enter で popup が閉じる + 候補は挿入されない + return false**
- **Cmd+Enter (metaKey) で popup が閉じる + 候補は挿入されない + return false**
- **Shift+Enter は accept のまま**（修飾なしで挿入される — 後方互換性確認）
- **Alt+Enter は accept のまま**（同上）
- **空リストで Ctrl+Enter を押しても popup が閉じる + return false**（一貫性）
- **plain Enter は引き続き accept**（既存テストで担保）

### 統合テスト
- 既存 `mutation-shell.test.ts` の COMMIT_EDIT / CANCEL_EDIT 系は影響なし（state listener 経由の close は変更前後で同じ）

## 6. 用語整理

新しい用語の追加なし。本 PR の機能名としては **"modifier-Enter handling"** を運用語として用いるが暫定。spec doc 内のみ。Public API 名にはしない。

既存用語との関係:
- "popup precedence" / "field parity" / "entry-ref autocomplete" — 不変
- "accept" / "close without accept" — 既存セマンティクス

## 7. Rollback / 互換性

- 変更は popup keyboard handler 内 4 行のみ
- データモデル不変、`ParsedEntryRef` / `RECORD_ENTRY_REF_SELECTION` / 既存挙動すべて不変
- `git revert` で v1.4 に戻せる
- v1.4 までのテストはすべて pass

## 8. 既知の同種問題（本 PR スコープ外）

`src/adapter/ui/asset-autocomplete.ts:243` に同じパターンがある:

```ts
case 'Enter':
case 'Tab':
  e.preventDefault();
  insertCandidate(visibleCandidates[selectedIndex]!);
  return true;
```

asset autocomplete も Ctrl+Enter を accept として吸収している。同じ理由で textlog append とぶつかりうる。**本 PR は entry-ref autocomplete 限定**で進めるが、後続 PR で asset autocomplete に同じ修正を適用する余地あり。

> **Resolved**: `docs/development/asset-autocomplete-modifier-enter-v1.md` で同 policy を mirror 適用済み（v1.5 の派生 PR）。本 spec の記述は残すが、実コードは既に整合している。

`slash-menu.ts` も類似だが、slash menu は `/` トリガーで開かれるため textlog append との衝突パターンが異なる。本 PR スコープ外、別途検討。

## 9. 関連文書

- `docs/development/entry-autocomplete-v1.md` 〜 `-v1.4-fragment.md`
- `src/adapter/ui/action-binder.ts:1810-1824` — textlog append (Ctrl+Enter)
- `src/adapter/ui/asset-autocomplete.ts` — 同種問題 (本 PR 対象外)
