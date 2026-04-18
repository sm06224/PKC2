# FI-04 添付基盤 v1 — Post-Implementation Audit

Status: COMPLETE 2026-04-18  
Auditor: Claude Code  
Implementation commit: `2daa76a`  
Contract ref: `docs/spec/attachment-foundation-fi04-v1-behavior-contract.md`

---

## 1. 読んだファイル

| ファイル | 目的 |
|---------|------|
| `docs/spec/attachment-foundation-fi04-v1-behavior-contract.md` | 正解定義 |
| `src/adapter/ui/asset-dedupe.ts` | G-2 pure helper |
| `src/adapter/ui/action-binder.ts` ll.2998–3060, 4663–4746 | G-1/G-2 統合ロジック |
| `src/adapter/ui/renderer.ts` ll.1345–1365, 1606–1636 | G-3 常設ゾーン |
| `src/styles/base.css` ll.2974–2985 | G-3 CSS |
| `tests/adapter/fi04-multi-add-dedupe-persistent-dnd.test.ts` | テスト範囲確認 |

---

## 2. 監査観点

1. multi-add の FileList 順序保証（G-1）
2. 1件失敗時の継続（G-1）
3. dedupe が hash AND size 両方要求しているか（G-2）
4. duplicate でも attach が必ず続くか（G-2 I-FI04-1）
5. hash failure の soft-fail（G-2 I-FI04-5）
6. asset 共有・key 再利用がないか（I-FI04-2）
7. sidebar 常設ゾーンが 3 つの早期 return 前に mount されるか（G-3）
8. ready のみ active / editing で inactive か（G-3 I-FI04-6）
9. center-pane DnD との非干渉（region 名分離）
10. FI-05 editing path 非破壊（I-FI04-3）
11. type hygiene（FI-04 起因の新規 src/ エラー 0）

---

## 3. 監査結果サマリ

**判定: 合格（軽微な問題 1 件 → 修正済み）**

実装は behavior contract の主要インバリアントを全て満たしている。  
軽微な docs/comment ずれが 1 件あり、本 audit で最小修正を実施した。

---

## 4. 発見した問題

### D-1: region 名の contract-実装ずれ（軽微）

**箇所**: behavior contract §4-1・§4-3 と `renderSidebarDropZone` の JSDoc コメント

**内容**: behavior contract は sidebar 常設ゾーンの `data-pkc-region` を `"file-drop-zone"` と定義していた。しかし実装時に `"sidebar-file-drop-zone"` へ変更された（center pane との querySelector 先着問題を回避するため）。contract と JSDoc コメントが古い記述のまま残っていた。

**影響**: 機能的問題なし。ドキュメントを参照する次の実装者が混乱する可能性があった。

**修正**:
- `docs/spec/attachment-foundation-fi04-v1-behavior-contract.md` §4-1・§4-3 を `"sidebar-file-drop-zone"` に更新し、変更理由（querySelector 先着問題）と対処（action-binder 3 ハンドラの複合セレクタ化）を明記
- `src/adapter/ui/renderer.ts` の `renderSidebarDropZone` JSDoc コメントを実態と一致させた

---

## 5. 作成/変更ファイル一覧

| ファイル | 変更種別 |
|---------|---------|
| `docs/development/attachment-foundation-fi04-v1-audit.md` | 新規（本文書） |
| `docs/spec/attachment-foundation-fi04-v1-behavior-contract.md` | §4-1・§4-3 を実装に合わせて更新（D-1 修正） |
| `src/adapter/ui/renderer.ts` | `renderSidebarDropZone` JSDoc コメント修正（D-1 修正） |

---

## 6. contract / 実装との整合点

| 観点 | contract | 実装 | 整合 |
|------|----------|------|------|
| FileList 逐次処理 | index 昇順、前の onload 完了後に次 | `processNext(index)` → `onComplete` → `processNext(index+1)` | ✅ |
| 1件失敗で継続 | onerror → `console.warn` → 次へ | `reader.onerror` で `onComplete()` を呼ぶ | ✅ |
| サイズ超過でも継続 | guardrails 委任、バッチ停止しない | `isFileTooLarge` → toast → `onComplete()` | ✅ |
| hash AND size 両方 | 条件 A・B 両立 | `checkAssetDuplicate` で hash ループ後 size 照合 | ✅ |
| duplicate でも attach | 必ず `processFileAttachment` 実行 | try/catch 後に `CREATE_ENTRY` / `COMMIT_EDIT` | ✅ |
| hash failure soft-fail | `console.warn` + attach 継続 | `catch (dedupeErr)` → `console.warn` → 以降の attach | ✅ |
| asset key 共有なし | 常に新規 key | `att-${Date.now()}-${random}` を毎回生成 | ✅ |
| トースト文言 | `「${file.name}」は既存の添付と同一内容です` | 実装と完全一致 | ✅ |
| sidebar mount 3箇所 | allEntries=0 / entries=0 / 通常末尾 | l.1354, l.1363, l.1610 全て `renderSidebarDropZone(state)` | ✅ |
| ready のみ active | `phase === 'ready' && !readonly` | `isActive` フラグで `data-pkc-inactive` 制御 | ✅ |
| editing で inactive | `pointer-events: none` | `.pkc-drop-zone-sidebar[data-pkc-inactive="true"]` CSS | ✅ |
| FI-05 非破壊 | `handleEditorFileDrop` 等を変更しない | 該当関数に変更なし（I-6 テスト通過） | ✅ |
| region 名分離 | `sidebar-file-drop-zone`（修正後） | `data-pkc-region="sidebar-file-drop-zone"` | ✅（修正後） |
| handler 複合セレクタ | 3 ハンドラが両 region を受け付ける | `'file-drop-zone'`,`'sidebar-file-drop-zone'` 複合 | ✅ |

---

## 7. 品質チェック結果

D-1 の修正は `src/adapter/ui/renderer.ts` のコメント変更のみ（ロジック無変更）のため、テスト再実行不要。

ただし念のため確認済み:

- `npm test`: 4228 passed / 9 skipped（全 pass）
- `src/` typecheck エラー: 0（pre-existing のテストファイルエラーは FI-04 と無関係）
- `npm run build:bundle`: 成功

---

## 8. コミット有無

あり（本 audit 修正分を 1 コミットにまとめる）。
