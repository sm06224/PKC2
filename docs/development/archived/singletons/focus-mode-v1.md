# Focus mode (両ペーン同時 collapse, PR #174, 2026-04-27)

**Status**: implemented (PR #174, regression fix + UI button)
**Date**: 2026-04-27
**User direction**:
> 「Ctrl+Alt+\が機能しない 左ペインしか畳まれない」
> 「両サイドペインをハイドするボタンを追加しよう。これはタッチデバイス向けだけど、通常でもマウス主体ユーザーが使えるだろう」

## 1. 背景

PR #173 で「Ctrl+Alt+\\ で両ペーン同時 toggle」を実装したが、
PR #173 着地後の動作確認で **左ペーンしか折り畳まれない** 回帰
が user audit で発覚。同時に「キーボードを持たない touch user
にも届く UI button が欲しい」という要請。

## 2. 回帰の根本原因

`action-binder.ts` の Slice 6 single-pane shortcut handler が:

```ts
// before (回帰):
if (mod && e.key === '\\') {
  // ...
  togglePane(root, e.shiftKey ? 'meta' : 'sidebar');
  return;
}
```

の guard で `altKey` を見ていなかったため、`Ctrl+Alt+\\` が
`mod && e.key === '\\'` に **先食い** され、sidebar だけが toggle
されて `return` してしまっていた。後続の focus-mode chord 分岐は
到達不能だった。

修正:
```ts
// after:
if (mod && !e.altKey && e.key === '\\') {
  // ...
}
```

`!e.altKey` を加えるだけの最小 fix。これで Ctrl+Alt+\\ は
Slice 6 を通り抜けて focus-mode chord branch まで届く。

## 3. `toggleFocusMode` helper

Keyboard chord と新 UI button が同じロジックを共有するために
helper を抽出 (`action-binder.ts`):

```ts
function toggleFocusMode(root: HTMLElement): void {
  const sidebarEl = root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]');
  const metaEl = root.querySelector<HTMLElement>('[data-pkc-region="meta"]');
  const sidebarCollapsed = sidebarEl?.getAttribute('data-pkc-collapsed') === 'true';
  const metaCollapsed = metaEl?.getAttribute('data-pkc-collapsed') === 'true';
  const eitherOpen = !sidebarCollapsed || !metaCollapsed;
  if (eitherOpen) {
    if (!sidebarCollapsed) togglePane(root, 'sidebar');
    if (!metaCollapsed) togglePane(root, 'meta');
  } else {
    if (sidebarCollapsed) togglePane(root, 'sidebar');
    if (metaCollapsed) togglePane(root, 'meta');
  }
}
```

「**either pane open → fold both** / **both collapsed → expand
both**」のセマンティクス。OS の focus mode と同じく「1 アクション
で全レイアウト state が flip する」。中間状態 (片方 collapsed +
片方 open) からも 1 回の trigger で fold-both に揃う。

## 4. UI surfaces

### Keyboard
- `Ctrl+Alt+\\` (Windows / Linux / Edge cross-platform)
- `Cmd+Alt+\\` (macOS)
- `Alt+Space` (Mac/Linux only — Windows / Edge は OS の window-menu
  が先食いする)
- Suppressed: textarea / input / contenteditable focused 時

### Header button
- `data-pkc-action="toggle-focus-mode"` の `▣` button
- Header の sidebar / meta toggle と並べて配置 (順番:
  `◧` sidebar / `◨` meta / `▣` focus mode / `⚙` shell menu)
- `title="Focus mode — hide both panes (Ctrl+Alt+\\)"`
- Touch tap でも mouse click でも同じ `toggleFocusMode(root)` を呼ぶ

## 5. 既存の単一 pane shortcut (variations)

`Ctrl/⌘+\\` → sidebar toggle (Slice 6 既存)
`Ctrl/⌘+Shift+\\` → meta pane toggle (Slice 6 既存)
`Ctrl/⌘+Alt+\\` → 両 pane toggle (本 PR で復活 + button)

`altKey` の有無で振り分け。`shiftKey` は Slice 6 の meta-toggle
分岐で処理されるので focus-mode branch では `!shiftKey` を要求。

## 6. Tests

`tests/adapter/action-binder-pane-toggle-shortcut.test.ts` に追加 (+3):
- "with both panes open, Ctrl+Alt+\\ collapses sidebar AND meta together"
- "second Ctrl+Alt+\\ press re-expands both panes"
- "Cmd+Alt+\\ (macOS) also drives the focus-mode chord"

回帰 prevention: Slice 6 single-pane handler が altKey ありの
chord を吸い込まないことを上記 3 件で pin。

## 7. Backward compatibility

- `data-pkc-action` 追加のみ (`toggle-focus-mode`)、既存値不変。
- Helper `toggleFocusMode` は internal、external API に露出しない。
- Slice 6 既存 shortcut (`Ctrl+\\` / `Ctrl+Shift+\\`) は touched
  なし。動作は altKey なしで従来どおり。

## 8. 関連

- Slice 6 既存 spec: ヘルプダイアログ参照 (renderer
  `renderShortcutHelp`)
- Pane state persistence: `./pane-state-persistence.md` (本 fix
  は keyboard precedence の問題なので persistence 側は touched
  なし)
- 触発した audit: PR #173 着地後の user feedback
  「Ctrl+Alt+\が機能しない 左ペインしか畳まれない」 + 「両サイド
  ペインをハイドするボタンを追加しよう」
