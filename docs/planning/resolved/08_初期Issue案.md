# 08. 初期Issue案

開始準備Issueを優先順に12件提案する。

---

## Issue一覧

| 優先 | Issue | Phase | 依存 |
|------|-------|-------|------|
| 1 | プロジェクト基盤セットアップ | 0 | なし |
| 2 | コアデータモデル型定義 | 0 | #1 |
| 3 | Archetypeインターフェース定義 | 0 | #2 |
| 4 | 基礎ドキュメント整備 | 0 | #2 |
| 5 | コアモデル単体テスト | 0 | #2, #3 |
| 6 | 状態管理レイヤー実装 | 1 | #2 |
| 7 | 最小UIシェル（3ペイン） | 1 | #6 |
| 8 | Record CRUD + text Archetype | 1 | #6, #7 |
| 9 | Relation CRUD（structural + categorical） | 1 | #8 |
| 10 | Revision管理実装 | 1 | #8 |
| 11 | IDB永続化 | 1 | #6 |
| 12 | HTML Export / Rehydrate | 1 | #8, #11 |

---

## 各Issueの詳細

### Issue #1: プロジェクト基盤セットアップ
**Phase**: 0  
**目的**: 開発環境の確立  
**内容**:
- TypeScript + Vite のセットアップ
- Vitest テスト環境
- ESLint / Prettier 設定
- ディレクトリ構成の作成
- package.json / tsconfig.json
- `npm run dev` / `npm run build` / `npm test` が動作する状態  

**完了条件**: `npm run build` で空の単一HTMLが生成される

---

### Issue #2: コアデータモデル型定義
**Phase**: 0  
**目的**: PKC2のデータ基盤の型を確定  
**内容**:
- `Record` 型（LID, title, body, created_at, updated_at）
- `Revision` 型
- `Relation` 型（from, to, kind, created_at）
- `Asset` 型
- `Container` 型（meta + records + relations + revisions + assets）
- `ArchetypeId` 型（text, textlog, todo, form, attachment, generic, opaque）
- ファクトリ関数（createRecord, createRelation等）

**完了条件**: `src/core/model/` に型定義が存在し、コンパイルが通る

---

### Issue #3: Archetypeインターフェース定義
**Phase**: 0  
**目的**: 類型システムの拡張ポイントを定義  
**内容**:
- `Archetype` インターフェース定義
- bodyの解釈関数の型
- 表示コンポーネントの型
- 状態判定関数の型
- `text` Archetype の最小実装

**完了条件**: Archetypeインターフェースが定義され、text実装が存在する

---

### Issue #4: 基礎ドキュメント整備
**Phase**: 0  
**目的**: 開発の共通理解基盤を確立  
**内容**:
- vision.md
- principles.md
- domain-model.md
- glossary.md
- non-goals.md
- testing-strategy.md
- dev-plan.md

**完了条件**: docs/ 配下��上記ファイルが存在する

---

### Issue #5: コアモデル単体テスト
**Phase**: 0  
**目的**: データモデルの正しさを保証  
**内容**:
- Record生成テスト
- Relation生成テスト
- Revision生成テスト
- Container操作テスト
- ファクトリ関数のエッジケーステスト

**完了条件**: `npm test` で全テスト通過

---

### Issue #6: 状態管理レイヤー実装
**Phase**: 1  
**目的**: UIとデータの橋渡し  
**内容**:
- ContainerState クラス（またはStore）
- Record/Relation/Revisionの追加・取得・更新API
- 変更通知（subscribe/notify）
- 操作のトランザクション性確保

**完了条件**: UIなしで状態管理のテストが通る

---

### Issue #7: 最小UIシェル（3ペイン）
**Phase**: 1  
**目的**: 基本画面レイアウト  
**内容**:
- 3ペインレイアウト（list / detail / meta）
- ツールバー（最小: タイトル + ステータス）
- レスポンシブ対応（最小限）

**完了条件**: 空の3ペイン画面がブラウザに表示される

---

### Issue #8: Record CRUD + text Archetype
**Phase**: 1  
**目的**: 最初の実用機能  
**内容**:
- テキストRecordの新規作成
- Record一覧表示（左ペイン）
- Record詳細表示（中央ペイン）
- テキスト編集・保存
- 操作シナリオ SC-01 の作成

**完了条件**: テキス��レコードを作成・編集・表示できる

---

### Issue #9: Relation CRUD（structural + categorical）
**Phase**: 1  
**目的**: フォルダとタグの実装  
**内容**:
- フォルダRecordの作成
- RecordのフォルダRelation作成（structural）
- タグRecordの作成
- RecordのタグRelation作成（categorical）
- 左ペインでのフォルダツリー表示
- 操作シナリオ SC-02, SC-03 の作成

**完了条件**: フォルダ作成・移動・タグ付けが動作する

---

### Issue #10: Revision管理実装
**Phase**: 1  
**目的**: 非破壊改訂の実装  
**内容**:
- 編集→保存時のRevision自動生成
- 履歴一覧表示（メタペイン）
- 過去リビジョンの閲覧
- 操作シナリオ SC-04 の作成

**完了条件**: 編集のたびにRevisionが生成され、履歴表示で確認できる

---

### Issue #11: IDB永続化
**Phase**: 1  
**目的**: ブラウザ再起動後のデータ保持  
**内容**:
- IndexedDB保存/読込
- 自動保存（dirty検知→保存）
- 起動時のIDB読込→状態復元

**完了条件**: ブラウザを閉じて再度開いてもデータが残っている

---

### Issue #12: HTML Export / Rehydrate
**Phase**: 1  
**目的**: 単一HTML自己完結の達成  
**内容**:
- 現在のデータ+コード+CSSを単一HTMLにExport
- ExportしたHTMLを開いてデータが復元される（rehydrate）
- 操作シナリオ SC-05 の作成

**完了条件**: Export→再読込でデータが完全に復元される
