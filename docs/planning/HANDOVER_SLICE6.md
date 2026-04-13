# HANDOVER — Slice 6 完了時点

**最終更新**: 2026-04-13
**対象**: Issue #1〜#56 完了 + P1 Slice 1〜6 完了（TEXTLOG↔TEXT 相互変換 / TODO embed / cycle・depth・missing・invalid ガード / TODO・FOLDER description の markdown 化 / build-subset closure 対応 / pane 再トグル shortcut）
**ブランチ**: `claude/pkc2-handover-restructure-WNRHU`
**前段**: `docs/planning/HANDOVER.md` (#54 時点) / `docs/planning/INVENTORY_041.md` (#41 時点)

---

## 1. 位置づけ

本文書は「Slice 6 完了直後の全体棚卸し」と「次段 P0 の指針」の**正本**である。
後続セッションの最初に読む引き継ぎ書として機能する。

---

## 2. 現時点の確定事項

### 2.1 設計の芯（変えない）

- **5層構造**: `core ← features ← adapter ← UI`（`main.ts` が bootstrap）
- **core にブラウザ API を含めない**（grep で 0 件維持）
- **Container は source of truth**、UI state は runtime のみ
- **Redux 風 reducer**: `UserAction (44種) | SystemCommand (9種)` → `reducer` → `(state', DomainEvent[] (16種))`
- **data-pkc-\* 属性規約**: CSS class を functional selector に使わない
- **単一 HTML 成果物**: `build/release-builder.ts` で一本化
- **compression は export/import のみ**、IDB は非圧縮 base64 を保持

### 2.2 完成している領域（A）

| 領域 | 根拠 |
|------|------|
| core 型定義・action/event 契約 | `src/core/**`。JSDoc + registered に型リテラル安定 |
| Dispatcher | `src/adapter/state/dispatcher.ts` (`onState`/`onEvent` unsubscribe 返却) |
| embed / transclusion / cycle guard | `src/adapter/ui/transclusion.ts` + `src/features/entry-ref/**` |
| markdown XSS 防御 | `src/features/markdown/markdown-render.ts` (`html:false` + SAFE_URL_RE + escapeHtmlAttr) |
| transport 層 | `src/adapter/transport/**`（envelope/bridge/handler/capability/profile 全テスト済） |
| IDB basic flow | DB v2、assets store 分離、debounce 300ms、`pagehide` flush |
| キーボードナビ 6 Phase | #48–#54、#55–#56 |

### 2.3 直近完了の大型案件

- **P1 Slice 1**: pane 再トグル shortcut（Ctrl+\ / Ctrl+Shift+\）
- **P1 Slice 2**: TODO embed preview + unified blocked placeholder
- **P1 Slice 3**: TODO/FOLDER description の markdown 化
- **P1 Slice 4**: TEXTLOG から選択ログを抽出して新 TEXT を生成
- **P1 Slice 5**: TEXT を TEXTLOG に変換（heading / hr 分割）
- **P1 Slice 6**: build-subset の TODO/FOLDER closure 対応、embed fallback 統一

### 2.4 プレリリース v0.1.0 の到達点

`docs/planning/19_pre_release.md` 参照。4 系統成立:

1. **Workspace (IDB)** — ブラウザ内作業環境
2. **Portable HTML** — Light/Full × editable/readonly の 4 モード
3. **Portable Package (ZIP)** — 完全再現型
4. **Guardrail UX** — 非ブロッキング情報提示

---

## 3. 構造的負債の三本柱

これらは個別には破綻しないが、SaaS化・マルチユーザ拡張時に同時顕在化する。

### (I) 仕様の散在
- Container/Entry/Relation/Revision の **JSON schema 正本が無い**（実装のみ）
- archetype 別 body 仕様が `docs/development/` の複数文書に散逸
- export_meta / ZIP 構造 / Light-Full-ZIP の使い分けが実装コメント依存

### (II) 往復検証の欠如
- export → import → export の **round-trip 同一性テストが 0 件**
- mixed-bundle / text-bundle / textlog-bundle / csv が単向流テストのみ
- malformed ZIP / container.json 破損 / asset 欠落の error boundary テストが薄い

### (III) UI singleton state のスコープ超越
- `textlog-selection.ts` / `text-to-textlog-modal.ts` が module singleton
- `SELECT_ENTRY` / `SET_VIEW_MODE` で自動クリアされない
- `entry-window` の `previewResolverContexts` が手作業同期（dispatcher 非購読）

---

## 4. 操作順序の危険箇所 TOP 7

1. **【高】TODO embed 含む TEXT 編集中に別窓で TODO 変更** — main の preview が stale
2. **【中】TEXT→TEXTLOG modal で heading/hr 切替** — auto-title と一致する手動タイトルが消失
3. **【中】TEXTLOG 範囲選択 → 変換 cancel → 再選択** — singleton state が残留
4. **【中】multi-select 中に filter/sort/viewMode 切替** — 選択順と表示順がずれる
5. **【低〜中】Export missing-asset confirm → cancel → 別 export** — 静的メッセージが古いまま
6. **【低】ZIP import 連続実行** — asset key 衝突検知が無い
7. **【低】detail 選択 → calendar 切替で該当日なし** — center pane が空

---

## 5. 次段計画（監督補正後の確定順）

### 最優先（P0）
1. **データモデル仕様書の単一正本化**（本セッションで着手）
2. **export/import round-trip テスト導入**
3. **ZIP import asset key 衝突検知**

### 次点（P0 late / P1 high）
4. **Revision 形式契約の明文化**
5. **build-subset cycle test 追加**
6. **manual 更新の対象範囲確定**

### その次（P1）
7. **UI singleton state の reducer 編入**
8. **entry-window live-refresh の dispatcher 購読化**
9. **bulk 操作 snapshot 補完**

### 将来（P2）
- merge import 設計
- subset export の external relation 整合性チェック
- template archetype の正式設計
- Transport 仕様書化（P2P / multi-user への基礎）
- DOM 全置換レンダリングの局所 diff 化
- archetype registry のテスト戦略
- complex / document-set / spreadsheet archetype 設計

---

## 6. 実装戦略（Claude Code 向け）

### 6.1 原則
- **1 コミット = 1 不変式 or 1 契約**
- **docs と test は同一 commit に同梱**
- **CLAUDE.md の Language Policy**: 内部思考 = 英語 / 出力 = 日本語
- **大きいファイル（renderer.ts / action-binder.ts / app-state.ts / tests 1000+ 行）は必ずサイズ確認し、必要なら 20 チャンク分割**で扱う

### 6.2 各コミット作成時のチェックリスト
- `npm test` 全通過
- `npm run typecheck` 通過
- `npm run lint` 通過
- 必要なら `npm run build:bundle` で dist 更新
- data-pkc-\* 規約違反なし
- 5層依存方向違反なし
- `docs/spec/**` または `docs/development/**` に対応記載

### 6.3 禁止事項
- cross-layer import（core ← features ← adapter を崩す）
- CSS class を functional selector に使う
- renderer 内での DOM 読取
- action-binder 内での DOM 操作
- core にブラウザ API 導入
- export_meta / asset_encoding の **非互換変更**（P0–P1 では禁止）

---

## 7. 本セッション（Slice 6 棚卸し）の成果物

- [x] 棚卸しレポート（本文書前段）
- [x] P0 / P1 / P2 タスクリスト
- [x] 操作順序依存の危険箇所 TOP 7
- [ ] データモデル仕様書 → 次段（P0-1）で着手（本ハンドオーバと同じ PR で docs/spec/ に作成）
- [ ] round-trip テスト → P0-2
- [ ] その他の実装 → 順次

---

## 8. 次セッションへの標準プロンプト（雛形）

```text
[Meta]
- Internal reasoning MUST be in English
- Final output MUST be in Japanese

[File Handling]
- Before reading/editing any file, check size first.
- Split large files (renderer.ts, action-binder.ts, app-state.ts, tests ≥ 1000 lines) into 20 chunks.

[Context]
Read docs/planning/HANDOVER_SLICE6.md first. This is the canonical handover.
Then confirm the assigned P0 / P1 task before touching code.

[Current Task]
<...>
```

---

**以上**。本ハンドオーバは `docs/spec/data-model.md` / `docs/spec/body-formats.md` の新規作成と合わせて、Slice 6 完了地点の設計基準書の土台となる。
