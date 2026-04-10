# Folder Structure Restore for Batch Import

## 1. 概要

folder-export bundle (`pkc2-folder-export-bundle`) を import する際に、
**元の folder 階層構造を安全に復元する**機能。

現状は folder-export bundle の import は TEXT / TEXTLOG をフラットに追加するのみで、
folder エントリの作成や structural relation の生成は行っていない。

本 Issue で以下を実現する:
- export 時に folder hierarchy metadata を manifest に記録する
- import 時に folder エントリを作成し、structural relation で親子関係を復元する
- selective import と矛盾しない最小ルールを定義する
- 旧形式（metadata なし）は従来どおりフラット import する

---

## 2. 設計方針

### 2.1 always-additive / failure-atomic の維持

- 既存 entry の置換・マージは行わない（常に新規追加）
- 全 LID を再採番する（collision 回避）
- folder / relation 作成を含めて、import 全体が failure-atomic
  （parse / validate で何か 1 つでも失敗したら dispatch 0 件）

### 2.2 "安全に戻す" > "全部戻す"

- folder 構造の復元は best-effort ではなく、metadata が十分な場合のみ行う
- metadata が不十分な旧 bundle は flat fallback（従来動作）
- 復元可否は preview 時点でユーザに明示する

---

## 3. Export 側の変更: folder hierarchy metadata

### 3.1 manifest への追加フィールド

`FolderExportManifest` に optional な `folders` 配列を追加する:

```json
{
  "format": "pkc2-folder-export-bundle",
  "version": 1,
  "...existing fields...",
  "folders": [
    { "lid": "e-root-folder", "title": "My Folder", "parent_lid": null },
    { "lid": "e-subfolder-1", "title": "Subfolder A", "parent_lid": "e-root-folder" }
  ],
  "entries": [
    { "...existing fields...", "parent_folder_lid": "e-root-folder" },
    { "...existing fields...", "parent_folder_lid": "e-subfolder-1" }
  ]
}
```

### 3.2 `folders` 配列

| field | type | 説明 |
|---|---|---|
| `lid` | string | export 元の folder LID |
| `title` | string | folder title |
| `parent_lid` | `string \| null` | 親 folder の LID。export root folder は `null` |

- export root folder 自身を `folders[0]` に含める (`parent_lid: null`)
- 中間 subfolder も全て含める
- 子孫 folder のうち、descendant に TEXT/TEXTLOG を 1 つも持たないものは省略可
  （ただし実装の簡潔さのため、空 folder も含めて構わない）

### 3.3 `entries[].parent_folder_lid`

各 content entry に optional な `parent_folder_lid` を追加:
- 値は `folders` 配列内の folder LID を参照する
- import 時にどの folder の直下に配置するかを示す

### 3.4 backward compatibility

- `folders` は optional（新フィールド）
- `parent_folder_lid` は optional（新フィールド）
- 旧 importer は unknown field を無視するため、新 bundle を旧 importer で読んでも
  フラット import として正常動作する
- 新 importer が旧 bundle（`folders` なし）を読んだ場合もフラット import（fallback）

---

## 4. Import 側の変更: folder structure restore

### 4.1 restore 判定

`importBatchBundleFromBuffer()` の結果に folder hierarchy 情報を含める:
- manifest に `folders` 配列があり、1 件以上の folder が含まれる → restore 可能
- `folders` がないか空 → flat fallback

### 4.2 BatchImportResult の拡張

```typescript
export interface BatchFolderInfo {
  lid: string;
  title: string;
  parentLid: string | null;
}

export interface BatchImportEntry {
  archetype: 'text' | 'textlog';
  title: string;
  body: string;
  attachments: BatchAttachment[];
  /** 復元先 folder の original LID (folders 配列内の lid を参照) */
  parentFolderLid?: string;
}

export interface BatchImportSuccess {
  ok: true;
  entries: BatchImportEntry[];
  source: string;
  format: string;
  /** folder hierarchy info (present only for folder-export bundles with structure metadata) */
  folders?: BatchFolderInfo[];
}
```

### 4.3 dispatch 側 (main.ts) の folder / relation 作成

confirm handler で `result.folders` がある場合:

1. **必要 folder の計算**: selected entries の `parentFolderLid` から、
   必要な folder とその祖先チェーンを算出する
2. **folder entry の作成**: 必要な folder を root → leaf の順で作成
   - `CREATE_ENTRY { archetype: 'folder', title }` → `COMMIT_EDIT`
   - old LID → new LID のマッピングを構築
3. **content entry の作成**: 従来どおり CREATE_ENTRY → COMMIT_EDIT
4. **structural relation の作成**: 各 entry / subfolder について
   `CREATE_RELATION { from: newParentLid, to: newChildLid, kind: 'structural' }`

---

## 5. Selective import 時の folder restore ルール

### 5.1 最小必要 folder

選択された entries を正しい位置に配置するために必要な folder のみ作成する。

**ルール**: entry が選択されている場合、その `parentFolderLid` から
root folder までの全祖先 folder を作成する。

**例**:
```
Root Folder
├── Doc A [selected]
├── Subfolder X
│   ├── Doc B [NOT selected]
│   └── Subfolder Y
│       └── Doc C [selected]
└── Doc D [NOT selected]
```

→ 作成される folder: Root Folder, Subfolder X, Subfolder Y
→ 作成されない: なし（Doc C の祖先チェーン全てが必要）
→ Doc B, Doc D は dispatch しない

### 5.2 空 folder の扱い

- 祖先チェーンに含まれる folder は、直下に selected entry がなくても作成する
  （例: Subfolder X は Doc B が未選択でも、Subfolder Y の親として必要）
- 選択された entry の祖先に含まれない folder は作成しない

### 5.3 全選択時

全 entry が選択されている場合は、`folders` 配列の全 folder を作成する。

---

## 6. Preview への影響

### 6.1 restore 可否の表示

`BatchImportPreviewInfo` に folder restore 情報を追加:

```typescript
export interface BatchImportPreviewInfo {
  // ...existing fields...
  /** folder structure restore が可能かどうか */
  canRestoreFolderStructure: boolean;
  /** restore 対象の folder 数 */
  folderCount: number;
}
```

### 6.2 renderer での表示

- `canRestoreFolderStructure === true` の場合:
  summary table に「フォルダ構造: N folders — 復元されます」を表示
- `canRestoreFolderStructure === false` かつ `isFolderExport === true` の場合:
  既存の caveat「フォルダ構造は復元されません」を表示

---

## 7. Flat fallback

### 7.1 条件

- manifest に `folders` がない（旧 bundle）
- `folders` が空配列

### 7.2 動作

- 従来どおり TEXT / TEXTLOG をフラットに container 直下に追加
- structural relation は生成しない
- preview caveat を表示

---

## 8. ID 再採番

### 8.1 方針

- import 時に全 LID（folder / content entry 両方）を新規生成する
- `generateLid()` を使用（既存の LID 生成と同一）
- old LID → new LID のマッピングを dispatch 時に構築

### 8.2 relation ID

- structural relation の `id` も `generateLid()` で新規生成
- `from` / `to` は re-mapped LID を使用

---

## 9. Layering

| レイヤー | ファイル | 変更内容 |
|---|---|---|
| adapter/platform | `folder-export.ts` | manifest に `folders` / `parent_folder_lid` を追加 |
| adapter/platform | `batch-import.ts` | `folders` を parse、`BatchImportEntry.parentFolderLid` を追加 |
| adapter/ui | `renderer.ts` | preview に folder restore 情報を表示 |
| runtime | `main.ts` | dispatch に folder 作成 + relation 作成を追加 |

---

## 10. Readonly

- readonly 時はそもそも batch import が表示されない
- 影響なし

---

## 11. Intentionally やらないこと

| 項目 | 理由 |
|---|---|
| folder drag/drop UX | scope 外 |
| folder hierarchy の手動編集改善 | scope 外 |
| mixed attachment/todo/form 対応 | scope 外 |
| undo / rollback | scope 外 |
| multi-tab coordination | scope 外 |
| lint / DRY 整理 | 次 Issue 候補 |
| merge / overwrite policy | always-additive で固定 |
| import 先 folder の指定 | scope 外（root に追加） |
| folder 内の entry 順序の保持 | manifest の配列順序に依存（暗黙の順序保持） |
| nested folder depth 制限 | 既存の maxDepth=4 に従う |

---

## 12. テスト要件

1. folder-export bundle で folder structure が復元される（folder entry + relation）
2. parent-child relation が正しい（from=parent, to=child, kind=structural）
3. folder title が復元される
4. ID collision で安全に再採番される（old LID と new LID が異なる）
5. selective import で一部 entry だけ選んでも仕様どおり動く
   - 祖先 folder が作成される
   - 未選択 entry の folder は不要なら作成されない
6. restore 不能 bundle（`folders` なし）は flat fallback する
7. 既存 mixed import を壊さない
8. failure-atomic を維持する（folder 情報が壊れていても全体が fail）
9. preview に folder restore 可否が表示される
10. 旧 bundle でも flat import が正常動作する

---

## 13. 次候補

- lint / DRY 整理
- import/export パターン共通化の棚卸し
- import 先 folder の指定
- asset preview (deep preview の拡張)
