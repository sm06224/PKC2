# Container-wide Batch Import

## 1. 概要

container-wide export / folder-scoped export で作成された batch bundle を
読み込み、**複数の TEXT / TEXTLOG エントリを現在の container に追加する**機能。

- import は **always-additive**（既存 entry の置換・マージはしない）
- 失敗時は **全体 atomic**（1 件でも失敗したら dispatch 0 件）
- 既存の単体 import（`importTextBundleFromBuffer` / `importTextlogBundleFromBuffer`）
  に完全委譲

---

## 2. import 対象 format

以下の 4 つの batch format を受け付ける:

| format | 生成元 |
|---|---|
| `pkc2-textlogs-container-bundle` | container-wide TEXTLOG export |
| `pkc2-texts-container-bundle` | container-wide TEXT export |
| `pkc2-folder-export-bundle` | folder-scoped export |
| `pkc2-mixed-container-bundle` | mixed container export (TEXT + TEXTLOG) |

> **Note**: 4th format (`pkc2-mixed-container-bundle`) は
> `mixed-container-export.md` で追加された。

### version guard

- `version === 1` のみ受理
- format / version が不一致なら `{ ok: false, error }` で即座に失敗

---

## 3. outer ZIP の layout

```
<name>.{textlogs,texts,folder-export}.zip
├── manifest.json           ← top-level manifest（format / version 判定）
├── <slug>.text.zip         ← nested TEXT bundle
├── <slug>.textlog.zip      ← nested TEXTLOG bundle
└── ...
```

- manifest.json の `entries[].filename` を参照して nested bundle を取得
- manifest に列挙されていないファイルは無視
- manifest に列挙されているが ZIP 内に存在しないファイルは **failure**

---

## 4. nested bundle の扱い

各 nested bundle は既存の単体 import に完全委譲:

- `.text.zip` → `importTextBundleFromBuffer()`
- `.textlog.zip` → `importTextlogBundleFromBuffer()`

判定基準:
- `pkc2-textlogs-container-bundle`: 全 nested bundle は `.textlog.zip`
- `pkc2-texts-container-bundle`: 全 nested bundle は `.text.zip`
- `pkc2-folder-export-bundle`: `entries[].archetype` で判定
  - `'text'` → `importTextBundleFromBuffer`
  - `'textlog'` → `importTextlogBundleFromBuffer`

---

## 5. import 順序

> **Superseded**: 本 doc の初版では caller (main.ts) が N+1 回の dispatch を
> 行う方式を記述していた。`batch-import-transaction-hardening.md` により、
> 現行実装では `buildBatchImportPlan()` (pure planner) →
> `SYS_APPLY_BATCH_IMPORT` (単一 reducer action) による atomic apply に移行済み。
> 以下は歴史的参考として残す。

~~1. outer ZIP をパース~~
~~2. manifest.json を読んで format / version を検証~~
~~3. manifest.entries を巡回し、各 nested bundle をパース~~
~~4. **全件パース成功を確認してから** dispatch 材料を返す~~
~~5. caller (main.ts) が dispatch:~~
   ~~- 各 bundle の attachments → CREATE_ENTRY + COMMIT_EDIT~~
   ~~- 各 bundle の本体 → CREATE_ENTRY + COMMIT_EDIT~~

**現行実装**:
1. outer ZIP をパース、manifest 検証
2. `previewBatchBundleFromBuffer()` で preview 情報抽出 → UI に preview 表示
3. ユーザ確認後、`buildBatchImportPlan()` で pure plan 作成
4. `SYS_APPLY_BATCH_IMPORT` で plan を単一 reducer action として atomic apply

---

## 6. asset key collision policy

既存単体 import と同一:
- **常時再採番**（`att-<ts>-<salt><rand>` 形式）
- 衝突チェック不要（新規キー生成は常にユニーク）
- body 内の `asset:<old>` 参照は新キーに書換済み

---

## 7. 失敗原子性

**全体 atomic**:
- outer ZIP parse 失敗 → `{ ok: false, error }`
- manifest format/version 不一致 → `{ ok: false, error }`
- いずれかの nested bundle parse 失敗 → `{ ok: false, error }`
- 全件成功した場合のみ dispatch 材料を返す
- importer は dispatcher に触らない（main.ts が dispatch を流す）

---

## 8. compacted / missing bundle の扱い

- `compacted: true` の bundle は **そのまま受理**
  （export 側で rewrite 済み、import 側は何もしない）
- `missing_asset_keys` を含む bundle も **valid**
  （broken 参照は verbatim で保持）
- 既存単体 import と同一の挙動

---

## 9. readonly 時の扱い

- readonly ではボタン自体を render しない（Data… panel 内 import 系と同様）
- handler 側でも `state.readonly` で bail

---

## 10. live state 不変条件

- importer 関数は dispatcher に触らない
- parse / validate フェーズでは container / entries / assets を一切変更しない
- 失敗時は dispatch 0 件（状態不変）

---

## 11. UI surfacing

- Data… パネル内の import セクションに `📥 Batch` ボタンを追加
  - `data-pkc-action="import-batch-bundle"`
  - tooltip: `batch bundle (.textlogs.zip / .texts.zip / .folder-export.zip) をまとめてインポート`
- readonly では非表示
- Quick Help に batch import を追記

---

## 12. return type

```typescript
interface BatchImportEntry {
  archetype: 'text' | 'textlog';
  title: string;
  body: string;
  attachments: ImportedAttachment[];
}

interface BatchImportSuccess {
  ok: true;
  entries: BatchImportEntry[];
  source: string;
  format: string;
}

interface BatchImportFailure {
  ok: false;
  error: string;
}

type BatchImportResult = BatchImportSuccess | BatchImportFailure;
```

~~caller は `entries` を順番に dispatch するだけ。~~

> **Superseded**: 現行では `SYS_APPLY_BATCH_IMPORT` による atomic apply。
> 上記 return type は parse 段階の中間表現として残存しているが、
> 最終的な dispatch は `BatchImportPlan` 型 (`system-command.ts`) に変換される。

---

## 13. intentionally やらなかったこと (当時)

> **Note**: 以下は本 doc 初版時点の「やらなかったこと」リスト。
> その後の開発で多くが実装済みとなった。

- 既存 entry への merge / overwrite
- ~~import preview UI~~ → **実装済み** (`import-preview-ui.md`)
- ~~folder 構造（ネスト）の再現~~ → **実装済み** (`folder-structure-restore.md`)
- ~~folder-scoped import（別 Issue）~~ → **実装済み** (`folder-scoped-import.md`)
- partial success（一部成功・一部失敗）
- bundle ごとの skip / retry
- multi-tab coordination

---

## 14. 次候補 (当時) → 実装済み状況

- ~~folder-scoped import~~ → **実装済み**
- ~~import preview UI~~ → **実装済み**
- ~~mixed archetype batch import~~ → **実装済み** (`mixed-container-export.md`)
