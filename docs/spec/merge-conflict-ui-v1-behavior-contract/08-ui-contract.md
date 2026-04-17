# 8. UI contract

## 8.1 DOM selectors

| selector | purpose |
|----------|---------|
| `data-pkc-region="merge-conflicts"` | conflict list コンテナ |
| `data-pkc-conflict-id="<lid>"` | 1 件の conflict row（identity は imported 側 lid） |
| `data-pkc-field="conflict-resolution"` | resolution radio group |
| `data-pkc-action="set-conflict-resolution"` | 個別 radio click |
| `data-pkc-value="keep-current\|duplicate-as-branch\|skip"` | radio の値 |
| `data-pkc-action="bulk-resolution"` | bulk shortcut button |
| `data-pkc-conflict-kind="C1\|C2\|C2-multi"` | 分類バッジ |

## 8.2 conflict 分類バッジ

| kind | バッジ表示 | 色 token |
|------|----------|----------|
| C1（content-equal） | `✓ content identical` | `--c-info`（緑系） |
| C2（title-only） | `⚠ title matches, content differs` | `--c-warn`（黄系） |
| C2-multi（title-only-multi） | `⚠ N host candidates` | `--c-warn`（黄系） |

新規 CSS variable は追加しない。既存 PKC2 の token（`--c-accent` / `--c-warn` / `--c-info`）を再利用する。

## 8.3 radio group の表示規則

| conflict kind | keep-current | duplicate-as-branch | skip |
|---------------|-------------|-------------------|------|
| C1 | ● pre-selected（default） | ○ | ○ |
| C2 | ○（選択可） | ○ | ○ |
| C2-multi | disabled（I-MergeUI7） | ○ | ○ |

- C1：`keep-current` が default pre-selected。ユーザーは override 可能
- C2：default なし。全 radio が未選択状態
- C2-multi：`keep-current` は disabled（どの host を残すか曖昧）

## 8.4 bulk shortcut button

| button | action | 適用範囲 |
|--------|--------|---------|
| `Accept all host` | 全 conflict を `keep-current` に設定 | C1 / C2 に適用。C2-multi は skip（I-MergeUI7 維持） |
| `Duplicate all` | 全 conflict を `duplicate-as-branch` に設定 | C1 / C2 / C2-multi すべてに適用 |

## 8.5 body preview 表示

- host 側と imported 側を side-by-side で表示
- diff 表示は出さない（v1 非対象）
- body preview は §4.6 の規則に準拠（200 code points + `↵` + `...`）

## 8.6 表示項目

conflict 1 件について表示する必須項目：

| 区分 | 項目 | 表示形式 |
|------|------|---------|
| Identity | archetype badge | `TEXT` / `TEXTLOG` / `TODO` 等の文字ラベル |
| Identity | title | 生テキスト（省略なし） |
| Match | conflict kind | C1 / C2 / C2-multi バッジ（§8.2） |
| Host side | createdAt | ISO 短縮（`YYYY-MM-DD HH:mm`） |
| Host side | updatedAt | ISO 短縮 |
| Host side | body preview | 先頭 200 code points |
| Incoming | createdAt | ISO 短縮 |
| Incoming | updatedAt | ISO 短縮 |
| Incoming | body preview | 先頭 200 code points |
| Resolution | radio group | 3 択（§8.3 の規則） |

## 8.7 画面レイアウト（概念）

```
┌─────────────────────────────────────────┐
│ Import Preview                          │
├─────────────────────────────────────────┤
│ ○ Replace    ● Merge                    │
├─────────────────────────────────────────┤
│ +12 entries, rename 3, dedup 5 assets,  │
│ drop 2 relations, drop 4 revisions      │  ← MVP 5行サマリ（無変更）
├─────────────────────────────────────────┤
│ Entry conflicts: N                      │  ← v1 追加セクション
│  ├─ #1 [TEXT] "Report 2025" (C1 ✓)      │
│  │   Host   : 2025-03-01 / body...      │
│  │   Incoming: 2025-03-01 / body...     │
│  │   ● Keep current  ○ Branch  ○ Skip   │
│  ├─ #2 [TODO] "Plan A" (C2 ⚠)          │
│  │   ...                                │
│  └─ #3 [TEXTLOG] "Log" (C2-multi ⚠)    │
│   [ Accept all host ] [ Duplicate all ] │
├─────────────────────────────────────────┤
│              [Cancel]  [Confirm merge]  │  ← gate 条件で disable/enable
└─────────────────────────────────────────┘
```

## 8.8 keyboard

v1 では conflict UI 固有のキーボードショートカットは追加しない。radio / button は標準の Tab / Space / Enter で操作可能。
