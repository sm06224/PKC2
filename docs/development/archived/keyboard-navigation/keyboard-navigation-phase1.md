# Keyboard Navigation Phase 1: Sidebar Arrow Up / Down

Status: COMPLETED
Completed: 2026-04-11
Created: 2026-04-11

---

## A. Scope

### 今回やること

- Arrow Up / Arrow Down で sidebar の可視エントリを前後移動する
- 現在の sidebar 表示順（フィルタ・ソート・ツリー反映済み）に従う
- 既存の `SELECT_ENTRY` を dispatch して選択経路に乗せる
- readonly でも移動を許可する（参照操作であり、データ変更ではない）

### 今回やらないこと

- Arrow Left / Arrow Right（ツリー展開/折りたたみ等）
- Calendar / Kanban 上のキーボード移動
- Enter で edit / open
- Shift+Arrow による range selection
- multi-select keyboard 拡張
- editor 内カーソル移動の再定義

---

## B. 発火条件

### 前提

Arrow Up / Down 処理は既存 `handleKeydown` 内に追加する。overlay/menu/autocomplete が開いている場合は既存の早期 return で先にキャッチされるため、Arrow handler には到達しない。

### ガード条件

| 条件 | Arrow 処理に到達するか | 理由 |
|------|---------------------|------|
| phase === 'ready' | YES | 正常動作 |
| phase === 'editing' | NO | editing ガードで除外 |
| overlay/menu/picker open | NO | handleKeydown 冒頭の早期 return |
| input / textarea / select にフォーカス | NO | 明示的ガード追加。ブラウザデフォルトのカーソル移動を奪わない |
| contenteditable にフォーカス | NO | 同上（PKC2 に contenteditable はないが安全側） |
| readonly mode | YES | 選択移動はデータ変更ではない |
| Ctrl/Meta + Arrow | NO | ブラウザデフォルト（スクロール等）を維持 |
| visible entries が 0 件 | no-op | 移動先がない |

### input/textarea ガードの必要性

既存の Escape カスケードは input/textarea ガードなしで動作するが、Arrow キーは異なる:
- Escape: ブラウザは input/textarea 内で特別な動作をしない → ガード不要
- Arrow Up/Down: ブラウザは textarea 内でカーソルを行移動する → **ガード必須**

---

## C. Source of Truth: 可視順の解決

### 方式

DOM クエリで sidebar の可視 entry lid 順を取得する:

```
sidebar.querySelectorAll('[data-pkc-action="select-entry"][data-pkc-lid]')
```

これにより:
- フィルタ / 検索で非表示の entry はスキップ
- ソート順が反映される
- ツリー表示のネスト順（DOM 出現順）が反映される
- reducer に view-aware order を持ち込まない

### Calendar/Kanban ビュー時

sidebar は常に表示されるため、Calendar/Kanban ビューでも sidebar の Arrow 移動は動作する。ただし center pane には Calendar/Kanban が表示されており、sidebar の entry 順で移動するのが自然な挙動。

---

## D. 境界条件

| 状況 | 挙動 |
|------|------|
| 先頭で Arrow Up | no-op（現在の選択を維持） |
| 末尾で Arrow Down | no-op（現在の選択を維持） |
| selectedLid === null で Arrow Down | **先頭の entry を選択** |
| selectedLid === null で Arrow Up | **先頭の entry を選択** |
| selectedLid が可視リストに存在しない（フィルタで隠れた） | **先頭の entry を選択** |
| visible entries が 0 件 | no-op |

### selectedLid === null の扱い

「先頭を選択」を採用する理由:
1. no-op だと「何も選択されていない状態から Arrow で抜け出せない」UX 問題が発生する
2. 先頭選択は多くのファイルマネージャ / リストアプリの標準挙動
3. Arrow Up でも先頭を選ぶ（「何も選択されていない → まず最初のエントリを示す」が自然）

---

## E. 実装設計

### 変更箇所

| ファイル | 変更内容 | 行数 |
|---------|---------|------|
| `action-binder.ts` | handleKeydown 内に Arrow Up/Down 処理追加 | ~20 行 |
| テスト追加 | `action-binder.test.ts` | ~80 行 |

**reducer 変更: なし** (`SELECT_ENTRY` は既存)
**renderer 変更: なし** (sidebar DOM は既に `data-pkc-lid` 属性付き)

### preventDefault

Arrow Up/Down で `e.preventDefault()` を呼ぶ。理由:
- ブラウザデフォルトではページスクロールが発生する
- entry 移動時にスクロールが同時に起きると UX が悪い
- input/textarea にフォーカスがある場合はガードで除外済みなので、ブラウザデフォルトのカーソル移動は阻害しない
