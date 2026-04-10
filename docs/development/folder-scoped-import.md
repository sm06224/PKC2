# Folder-scoped Import

## 1. 概要

folder-scoped export (`pkc2-folder-export-bundle`) で生成された bundle を読み込み、
**現在の container に TEXT / TEXTLOG エントリを追加する**機能。

- import は **always-additive**（既存 entry の置換・マージはしない）
- 失敗時は **全体 atomic**（1 件でも失敗したら dispatch 0 件）
- **folder 構造は復元しない**（nested folder / relation は生成しない）
- 選択中 folder などの scope に依存しない
- 既存 batch import インフラに完全委譲

---

## 2. 既存 batch import との関係

folder-scoped import は、container-wide batch import
（`importBatchBundleFromBuffer`）がすでに `pkc2-folder-export-bundle` format を
受理するため、**新しい import ロジックは追加しない**。

既存 batch import が担う:
- outer ZIP parse
- manifest format / version 検証
- `entries[].archetype` による TEXT / TEXTLOG 判定
- 各 nested bundle の単体 import 委譲
- failure-atomic 保証
- asset key 再採番

folder-scoped import が追加するのは:
- 本機能の仕様文書（本ファイル）
- UI tooltip / help の明確化（folder 構造非復元の明示）
- folder-export bundle に特化した user notification
- folder-scoped import 専用テスト

---

## 3. import 対象 format / version guard

| field | 値 | 検証 |
|---|---|---|
| `format` | `'pkc2-folder-export-bundle'` | `ACCEPTED_FORMATS` に含まれること |
| `version` | `1` | `manifest.version === 1` |

format / version が不一致なら `{ ok: false, error }` で即座に失敗。
これは batch import の既存検証ロジックと同一。

---

## 4. outer ZIP layout

```
folder-<slug>-<yyyymmdd>.folder-export.zip
├── manifest.json                       ← top-level manifest
├── <slug-1>-<yyyymmdd>.text.zip        ← nested TEXT bundle
├── <slug-2>-<yyyymmdd>.textlog.zip     ← nested TEXTLOG bundle
└── ...
```

- manifest.json の `entries[].filename` を参照して nested bundle を取得
- manifest に列挙されていないファイルは無視
- manifest に列挙されているが ZIP 内に存在しないファイルは **failure**

---

## 5. nested bundle の扱い

各 nested bundle は既存の単体 import に完全委譲:

- `.text.zip` → `importTextBundleFromBuffer()`
- `.textlog.zip` → `importTextlogBundleFromBuffer()`

判定基準:
- `entries[].archetype === 'text'` → `importTextBundleFromBuffer`
- `entries[].archetype === 'textlog'` → `importTextlogBundleFromBuffer`

`resolveArchetype()` が `pkc2-folder-export-bundle` の場合に
`entry.archetype` フィールドから判定する（batch import 既存ロジック）。

---

## 6. import 順序

1. outer ZIP をパース
2. manifest.json を読んで format / version を検証
3. manifest.entries を巡回し、各 nested bundle をパース
4. **全件パース成功を確認してから** dispatch 材料を返す
5. caller (main.ts) が dispatch:
   - 各 bundle の attachments → CREATE_ENTRY + COMMIT_EDIT
   - 各 bundle の本体 → CREATE_ENTRY + COMMIT_EDIT

batch import と同一の順序。

---

## 7. asset key collision policy

既存単体 import と同一:
- **常時再採番**（`att-<ts>-<salt><rand>` 形式）
- 衝突チェック不要（新規キー生成は常にユニーク）
- body 内の `asset:<old>` 参照は新キーに書換済み

---

## 8. failure atomicity

**全体 atomic**:
- outer ZIP parse 失敗 → `{ ok: false, error }`
- manifest format/version 不一致 → `{ ok: false, error }`
- いずれかの nested bundle parse 失敗 → `{ ok: false, error }`
- 全件成功した場合のみ dispatch 材料を返す
- importer は dispatcher に触らない（main.ts が dispatch を流す）

batch import と同一の保証。

---

## 9. compacted / missing bundle の扱い

- `compacted: true` の bundle は **そのまま受理**
  （export 側で rewrite 済み、import 側は何もしない）
- `missing_asset_keys` を含む bundle も **valid**
  （broken 参照は verbatim で保持）
- 既存単体 import と同一の挙動

---

## 10. readonly 時の扱い

- readonly ではボタン自体を render しない（Data… panel 内 import 系と同様）
- handler 側でも `state.readonly` で bail
- 既存 batch import の readonly guard と同一

---

## 11. live state 不変条件

- importer 関数は dispatcher に触らない
- parse / validate フェーズでは container / entries / assets を一切変更しない
- 失敗時は dispatch 0 件（状態不変）

---

## 12. folder 構造を再現しないことの明示

**重要**: folder-scoped export bundle には `source_folder_lid` /
`source_folder_title` が記録されているが、import 時に:

- **folder エントリは生成しない**
- **structural relation は生成しない**
- **元の folder 階層は復元されない**

各 TEXT / TEXTLOG はフラットに container 直下に追加される。

この制約は:
- Quick Help に明記する
- import 成功時のコンソールログに記載する
- 📥 Batch ボタンの tooltip に反映しない（tooltip は短く保つ）

将来 folder 構造を復元する場合は別 Issue として扱う。

---

## 13. UI surfacing

- 既存の `📥 Batch` ボタン（Data… panel 内）を使う
  - `data-pkc-action="import-batch-bundle"`
  - file picker: `.zip,.textlogs.zip,.texts.zip,.folder-export.zip,application/zip`
- **新しいボタンは追加しない**（action surface を増やさない）
- Quick Help に folder-export import + 構造非復元の注記を追記
- import 成功時に format が `pkc2-folder-export-bundle` なら
  フォルダ構造非復元の旨をログに含める

---

## 14. return type

batch import と同一の `BatchImportResult` を使用:

```typescript
interface BatchImportSuccess {
  ok: true;
  entries: BatchImportEntry[];
  source: string;
  format: string;   // ← 'pkc2-folder-export-bundle'
}
```

caller は `result.format` を見て folder-export 固有の処理
（ログメッセージ等）を分岐できる。

---

## 15. intentionally やらなかったこと

- folder 構造（ネスト）の再現
- 新しい import ボタンの追加
- import preview UI
- merge / overwrite policy
- partial success（一部成功・一部失敗）
- multi-tab coordination
- import 先 folder の指定

---

## 16. 次候補

- **mixed archetype batch export/import**: attachment / todo 等を含む bundle
- **import preview UI**: batch の中身を一覧表示してから commit
- **folder 構造の復元**: 元の folder / relation も import で再現する
- **import 先 folder の指定**: 特定 folder 配下に import する
