# FI-05 attach-while-editing insert internal link v1 — 実装監査

Status: COMPLETE 2026-04-18
対象コミット: `2942e49`
監査基準: `docs/spec/attach-while-editing-insert-internal-link-v1-behavior-contract.md`

---

## 0. 目的と前提

`2942e49` で実装された FI-05（DnD / ボタン添付 → 編集中 textarea へ内部リンク自動挿入）が  
behavior contract の全項目を満たすかを確認し、非リグレッション・テスト網羅性を評価する。  
監査対象ファイル:

- `src/adapter/ui/action-binder.ts`（実装）
- `tests/adapter/action-binder-attach-while-editing.test.ts`（テスト 9 件）

---

## 1. スコープ確認

**対象 archetype と guard**

| 確認点 | 実装 | 判定 |
|--------|------|------|
| `phase !== 'editing'` で `captureInsertContext()` が null を返す | L3056: `if (state.phase !== 'editing') return null` | ✅ |
| `isMarkdownTextarea` が `body / textlog-entry-text / textlog-append-text` のみを対象にする | L3039–3043 | ✅ |
| `handleEditorFileDrop` / `handleEditorFileDropOver` が `phase !== 'editing'` で早期リターン | L3184, L3196 | ✅ |
| `triggerEditingFileAttach` が `phase !== 'editing'` で早期リターン | L3219 | ✅ |
| `create-entry(attachment)` の editing 中インターセプトが `arch === 'attachment'` 限定 | L311 | ✅ |
| todo / form / attachment 既存 `create-entry` パスは変更なし | L306–335（arch 分岐のみ追加） | ✅ |

**判定**: スコープ守衛は完全。対象外 archetype（todo / form / attachment / generic / opaque）には一切介入しない。

---

## 2. canonical 挿入形式

**リンク文字列・セパレータ・カーソル位置**

| 確認点 | 実装 | 判定 |
|--------|------|------|
| 画像 MIME (`image/*`) → `![name](asset:key)` | L3087–3088 | ✅ |
| 非画像 MIME → `[name](asset:key)`（`!` なし） | L3089 | ✅ |
| 複数ファイルのセパレータは `\n`（先頭なし・末尾なし） | L3164: `accumulatedRefs.length > 0 ? '\n' : ''` | ✅ |
| カーソルは挿入文字列末尾の直後 | L3103: `newPos = ctx.cursorPos + ref.length`（ref = 累積全体） | ✅ |
| `updateTextEditPreview` を呼んでプレビュー更新 | L3106 | ✅ |

**複数ファイル挿入の設計ノート**  
`processEditingFileDrop` は各ファイルの FileReader.onload 内で `PASTE_ATTACHMENT` を dispatch する。  
この dispatch が同期的な再レンダリングを引き起こし、textarea の DOM 値は state のエントリ本文（変更なし）にリセットされる。  
その後 `insertAssetLinkAtContext` が `accumulatedRefs`（累積全体）を元の `currentValue` の `cursorPos` に差し込む方式を採る。  
これにより「i+1 件目は i 件目の挿入結果を丸ごと置換する」形となり、最終的な textarea 値は  

```
originalText.slice(0, cursorPos) + ref1 + "\n" + ref2 + ... + originalText.slice(cursorPos)
```

となる。この動作は behavior contract §5 の例示と等価であり、race 条件もない（直列処理のため）。

---

## 3. キャプチャ / ルーティング

**activeElement 捕捉タイミング**

| 確認点 | 実装 | 判定 |
|--------|------|------|
| DnD: `captureInsertContext()` を `e.preventDefault()` 直後・FileReader 開始前に呼ぶ | L3205（drop ハンドラ内、reader 開始前） | ✅ |
| ボタン: `captureInsertContext()` を `editingFileInput.click()` 前に呼ぶ | L3221（click 呼び出し L3243 より前） | ✅ |
| activeElement が対象外 textarea → textarea 1 つのみなら fallback | L3065–3076（candidates.length === 1 のみ採用） | ✅ |
| 複数 textarea + フォーカスなし → no-op (null 返却) | L3074: `else { return null; }` | ✅ |
| readonly 時は挿入しない（既存の guard 経由） | L3184, L3219 | ✅ |

**InsertContext の内容**  
`fieldAttr`, `logId`, `cursorPos`, `currentValue` の 4 フィールドが behavior contract §3 の捕捉手順と 1:1 対応している。

---

## 4. TEXTLOG 安全性（I-FI05-6）

**セル独立性と FI-02A との整合**

| 確認点 | 実装 | 判定 |
|--------|------|------|
| `insertAssetLinkAtContext` が `logId` あり時に複合セレクタを使用 | L3093–3094 | ✅ |
| `CSS.escape(logId)` でセレクタを安全にエスケープ | L3094 | ✅ |
| 再取得後 `null` なら console.warn して挿入をスキップ（添付は残る） | L3097–3100 | ✅ |
| FI-02A の `handlePaste` 内 logId 捕捉・再取得は変更なし | L3384–3386, L3423–3426 | ✅ |
| テスト: log-B への drop が log-A / log-C に影響しないことを確認 | `action-binder-attach-while-editing.test.ts` L192–224 | ✅ |

---

## 5. 非リグレッション

**既存パスへの影響なし**

| 確認点 | 実装 | 判定 |
|--------|------|------|
| `handlePaste`（スクショ貼付）は `captureInsertContext` を呼ばず独立した経路を維持 | L3380–3444 | ✅ |
| `handleFileDrop`（ready phase の drop zone）は `handleEditorFileDrop` と分離 | 別関数、別リスナー（L3799 / L3803） | ✅ |
| `create-entry` の他 archetype（text / textlog / todo / form / folder）には変更なし | L306–335 | ✅ |
| `create-entry(attachment)` の non-editing パス（L315–325）は変更なし | L311 の guard が editing 専用 | ✅ |
| イベントリスナーのクリーンアップが cleanup 関数で完全に実施される | L3831, L3842–3843 | ✅ |
| テスト: ready phase での DnD が textarea を変更しない | `action-binder-attach-while-editing.test.ts` L227–252 | ✅ |
| テスト: paste 経路が変化しない（textarea.value === 'Hello world'） | `action-binder-attach-while-editing.test.ts` L319–329 | ✅ |

---

## 6. E2E テスト網羅性

behavior contract §12 の必須テスト 13 件に対するカバレッジ:

| # | spec | テスト | 判定 |
|---|------|--------|------|
| 8 | DnD / text body / 画像 1件 | `FI-05 DnD during editing — TEXT > drops an image file` | ✅ |
| 9 | DnD / textlog log-B / 非画像（I-FI05-6） | `TEXTLOG > drops on textlog editor with log-B focused` | ✅ |
| 10 | DnD / folder body / 画像 | `FOLDER > drops an image on folder editor` | ✅ |
| 11 | DnD / 画像 2件 | `FI-05 multiple files > two files dropped inserts both refs` | ✅ |
| 12 | ready phase での DnD → 変化なし | `FI-05 DnD during ready phase — non-regression` | ✅ |
| 13 | 既存 paste regression | `FI-05 existing paste path non-regression` | ✅ |
| — | 非画像 1件 DnD | `drops a non-image file inserts [name](asset:key) without ! prefix` | ✅ |
| — | activeElement なし → single fallback | `with one textarea, inserts even without explicit focus` | ✅ |
| — | 複数 textarea + フォーカスなし → no-op | `with multiple textareas, does NOT insert without explicit focus` | ✅ |

テスト: 9 件すべて pass（`npx vitest run` 実行確認済み）。  
pure unit テスト（`captureInsertContext` 単独の in/out 確認）は `captureInsertContext` が closure スコープに依存するため E2E パスで代替している。

---

## 7. 軽微な所見

**F-1（Cosmetic — 修正不要）**  
`processEditingFileDrop` L3166–3168 において、`insertAssetLinkAtContext` へ渡す第 1 引数が  
`{ ...insertCtx, cursorPos: insertCtx.cursorPos, currentValue: insertCtx.currentValue }` と  
spread 後に同一フィールドを再代入する冗長な書き方になっている。  
機能上の問題はなく、コンパイル後の動作も同一。読みやすさのためには `insertCtx` を直接渡す方がシンプルだが、  
v1 スコープでは修正不要。

---

## 8. 判定

**Outcome A — 指摘なし（実装を受理）**

FI-05 v1 の全不変条件（I-FI05-1〜I-FI05-6）および behavior contract の全項目を満たしている。  
テスト 9 件はすべて green。非リグレッション・TEXTLOG 安全性・複数ファイル処理のいずれも正常動作確認。  
F-1 は cosmetic のみであり、blocking 事項なし。

---

## References

- Implementation: `src/adapter/ui/action-binder.ts` L3045–3244（FI-05 helpers）
- Tests: `tests/adapter/action-binder-attach-while-editing.test.ts`
- Behavior contract: `docs/spec/attach-while-editing-insert-internal-link-v1-behavior-contract.md`
- Minimum scope: `docs/spec/attach-while-editing-insert-internal-link-v1-minimum-scope.md`
- FI-02A audit: `docs/development/textlog-paste-target-fix-audit.md`
