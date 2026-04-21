# Provenance Metadata Copy / Export v1

**Status**: implementation — 2026-04-20.
**Scope**: `provenance-metadata-viewer-v1.md` の viewer に **whole-metadata copy button** を 1 つ追加する。コピー対象は常に **raw canonical metadata**（pretty-print v1.x の表示文字列ではない）を JSON 化したもの。provenance relation は引き続き編集不可・mutation 不可の契約を維持。
**Baseline**: `provenance-metadata-viewer-v1.md` / `provenance-metadata-pretty-print-v1.md` / `docs/spec/provenance-relation-profile.md §2.2`。

---

## 1. 実装方針

v1 / v1.x で揃えた viewer の display 階層をそのままに、**copy という read-only な出口** を 1 つ足す。採用したルール:

- **whole-metadata のみ**。per-field copy は v1 scope 外（button 数の爆発を避ける）
- **format は raw canonical JSON**。pretty-print display（locale datetime / 省略 hash）ではなく、`Relation.metadata` の元 string 値そのまま
- **button 1 個**、viewer の `<details>` 内部、`<dl>` の直下に配置（折り畳みを開いたときだけ目に入る）
- **clipboard API が使えなければ no-op**（status attribute で差別化、別 fallback UI は v1 で足さない）
- **feedback は DOM 属性 + button テキストの transient flip**。AppState / container へ一切書かない
- **provenance 以外の relation kind には出さない**（v1 viewer 本体と同じ gate）

## 2. copy / export 仕様

### 2.1 DOM

`<details class="pkc-provenance-metadata">` 内、`<dl>` の**直後**に:

```html
<div class="pkc-provenance-metadata-copy-row">
  <button type="button"
          class="pkc-provenance-metadata-copy"
          data-pkc-action="copy-provenance-metadata"
          data-pkc-relation-id="<rid>"
          title="Copy raw canonical metadata as JSON"
          aria-label="Copy raw canonical provenance metadata as JSON">
    Copy raw
  </button>
</div>
```

状態遷移:

| 状態 | `data-pkc-copy-status` | button.textContent |
|---|---|---|
| 初期 | なし | `"Copy raw"` |
| 成功 | `"copied"` | `"Copied"` |
| 1500 ms 経過後 | なし（revert） | `"Copy raw"` |
| clipboard API なし | `"unavailable"` | `"Copy raw"` |
| writeText Promise reject | `"error"` | `"Copy raw"` |

### 2.2 click 発火時の処理（action-binder）

```text
1. data-pkc-relation-id から rid を取得（欠落 → break）
2. dispatcher.getState() で container.relations から該当 relation を lookup（欠落 → break）
3. serializeProvenanceMetadataCanonical(rel.metadata) で JSON 文字列を生成
4. navigator.clipboard.writeText(json) を呼ぶ
   - clipboard API 不在 → data-pkc-copy-status="unavailable" を立てて break
   - resolve → data-pkc-copy-status="copied" / textContent = "Copied" / 1500ms 後に revert
   - reject → data-pkc-copy-status="error"
5. reducer dispatch なし / AppState 変更なし / container 変更なし
```

### 2.3 serializer 契約

`src/features/provenance/serialize-metadata.ts` の pure helper:

```ts
export function serializeProvenanceMetadataCanonical(
  metadata: Record<string, unknown> | undefined,
): string;
```

- `undefined` / `{}` / 全値が非 string・空文字列 → `"{}"` を返す
- 有効な string key のみ収集し、以下の順でソート:
  1. `conversion_kind`
  2. `converted_at`
  3. `source_content_hash`
  4. 残り（alphabetical）
- `JSON.stringify(obj, null, 2)` で 2-space indent
- 出力は input 同一なら deterministic
- raw 値に手を加えない（ISO は ISO のまま、hash は full のまま）

### 2.4 keyboard 対応

native `<button>` に委譲:
- `Tab` で focus
- `Enter` / `Space` で click event 発火
- 追加の keydown handler は書かない

### 2.5 readonly / manual context

button は常に enabled。readonly でも click 可能。これは以下と同じポリシー:
- `provenance-metadata-viewer-v1` の viewer そのもの
- `references-summary-clickable-v3` の summary button
- `orphan-detection-ui-v1` の marker

copy は mutation ではないため、読み取り権限さえあれば許容される。

## 3. copied raw format

copy 対象は以下の形式:

```json
{
  "conversion_kind": "text-to-textlog",
  "converted_at": "2026-04-16T12:34:56Z",
  "source_content_hash": "abcd1234ef567890",
  "segment_count": "3",
  "split_mode": "heading"
}
```

- すべて string value（`docs/spec/provenance-relation-profile.md §2.2` の契約と一致）
- ISO 8601 は raw（pretty-print display ではない）
- hash は full（省略なし）
- 未知 key も含まれる（後方互換のため将来 additive に増える key もそのまま通す）
- key ordering は §2.3 の優先順

## 4. read-only 保持の根拠

v1 / v1.x / 本 PR を通じて以下の契約が全て維持されていることを機械的に確認済み:

- provenance relation の reducer path は `UPDATE_RELATION_KIND` の二重ガードのまま（`kind === 'provenance'` は blocked）
- viewer 配下の edit-shape input（`<input>` / `<select>` / `<textarea>`）**ゼロ**（test で検証）
- `<button>` は copy/export 1 個のみ、それ自体も mutation を**しない**（test で container 同一参照を検証）
- `Relation.metadata` は click しても変化しない
- canonical key 名は rename / alias なし
- 新規 UserAction / DomainEvent / core op / persistence trigger **ゼロ**
- container schema 不変
- reducer invariant 不変

**つまり copy/export は display layer だけの追加であり、provenance 保全契約に抵触しない。**

## 5. 既存挙動の維持

- 非 provenance 行に copy button が出ない（kind === 'provenance' gate、v1 viewer と同じ）
- metadata なし / `{}` / 有効 string 値ゼロなら viewer 自体が出ない → copy button も出ない
- pretty-print v1.x の表示挙動（locale datetime / 省略 hash）は一切変更なし
- v1 viewer / pretty-print v1.x の既存テストはすべて pass（1 件だけ「viewer 内に `<button>` が 0 個」assertion を「copy ボタンのみ許容」に修正）
- sidebar / summary row / relation delete / relation kind edit いずれも変更なし

## 6. 実装量

| ファイル | 変更 |
|---|---|
| `src/features/provenance/serialize-metadata.ts` | 新規 pure helper |
| `src/features/provenance/index.ts` | 新規 barrel |
| `src/adapter/ui/renderer.ts` | viewer signature に `relationId` 引数追加、copy button 描画ロジック +18 行 |
| `src/adapter/ui/action-binder.ts` | `case 'copy-provenance-metadata'` +46 行 / serializer の import +1 行 |
| `src/styles/base.css` | `.pkc-provenance-metadata-copy-row` / `.pkc-provenance-metadata-copy` + `[data-pkc-copy-status]` バリエーション 4 種、計 +42 行 |
| `tests/features/provenance/serialize-metadata.test.ts` | +9 tests（pure unit）|
| `tests/adapter/renderer.test.ts` | +4 tests（copy button 存在 / readonly / metadata なしで非描画 / 非 provenance 行で非描画）＋ 1 既存 test の button 条件を「copy のみ許容」に更新 |
| `tests/adapter/provenance-copy.test.ts` | 新規 +6 tests（click → clipboard / status / 1500ms revert / container 非 mutation / clipboard API 不在 / keyboard activation） |
| `docs/development/provenance-metadata-copy-export-v1.md` | 本書 |
| `dist/{bundle.js,bundle.css,pkc2.html}` / `PKC2-Extensions/pkc2-manual.html` | rebuild |

CSS は copy button 専用に追加（v1.x の pretty-print では CSS 追加なしだった分を、ここで補う形）。

## 7. Validation

| 項目 | 結果 |
|---|---|
| `npm run typecheck` | OK |
| `npm run lint` | OK |
| `npm test` | 4798 / 4798 pass（+19 from pretty-print v1.x baseline 4779）|
| `npm run build:bundle` | OK（bundle.css 87.32 kB / bundle.js 621.11 kB、pretty-print baseline から +0.79 kB / +1.63 kB）|
| `npm run build:release` | OK（dist/pkc2.html 678.4 KB）|
| `npm run build:manual` | OK（PKC2-Extensions/pkc2-manual.html 1711.9 KB）|

## 8. 用語整理

- **"copy / export"** と呼ぶ。"dump" / "extract" / "serialize (UI 文言として)" とは呼ばない
- button 可視 label は `"Copy raw"` / 成功時 `"Copied"`
- aria-label は `"Copy raw canonical provenance metadata as JSON"`
- canonical key 名は変更なし
- "raw canonical" = `Relation.metadata` に保存されている string 値そのまま
- `data-pkc-copy-status` の値 `"copied"` / `"unavailable"` / `"error"` は canonical（将来 rename しない）

## 9. 非スコープ（v1+）

- **per-field copy**: 各 `<dd>` 横に mini copy button、v1 では採らない（value 数が 5〜7 個になり得るため button 数爆発）
- **ファイルエクスポート**: `.json` ファイル download、v1 範囲外
- **display 値の copy**: pretty-print 後の locale datetime / 省略 hash をコピー対象にする、**採らない**（原則として raw が source of truth）
- **multi-relation copy**: 複数 provenance relation を一括 copy する UI、v1 範囲外
- **clipboard API 不在時の textarea fallback**: v1 では `data-pkc-copy-status="unavailable"` を立てるのみ、textarea-based selection は足さない（UI 複雑度を避ける）
- **history / paste buffer**: browser clipboard の挙動に完全に委譲、独自 store は持たない
- **copy hooks / telemetry**: 独自 event 発火は v1 で入れない

## 10. 関連文書

- `docs/development/provenance-metadata-viewer-v1.md` — v1 viewer canonical（本 PR の親）
- `docs/development/provenance-metadata-pretty-print-v1.md` — display layer（本 PR は raw を coexist させる）
- `docs/spec/provenance-relation-profile.md §2.2` — metadata 正規定義（serializer の根拠）
- `docs/development/relation-kind-edit-v1.md` — provenance 二重ガード（本 PR で維持）
- `docs/development/unified-backlinks-v1.md` — References umbrella（本 PR の上位 pane）
- `src/features/provenance/serialize-metadata.ts` — pure serializer
- `src/features/provenance/index.ts` — barrel
- `src/adapter/ui/renderer.ts` — viewer + copy button 描画
- `src/adapter/ui/action-binder.ts` — click handler
- `src/styles/base.css` — copy button スタイル
- `tests/features/provenance/serialize-metadata.test.ts` — unit tests
- `tests/adapter/renderer.test.ts` — DOM tests
- `tests/adapter/provenance-copy.test.ts` — E2E tests

## 11. 後続 PR 候補

1. **S5 orphan filter** — `unified-orphan-detection-v3-contract.md §7.4`、defer 継続推奨（S4 marker で気づきが成立している）
2. **provenance source_container_cid → title lookup** — `source_container_cid` に対応する container title を横引きして表示する optional feature。scope が増えるので慎重に
3. **relation metadata viewer の他 kind への拡張** — `structural` / `categorical` 等の metadata 表示、別 contract が必要

provenance UX は v1 viewer → v1.x pretty-print → copy/export の 3 段で一区切り。次は orphan 系 defer を続けつつ、横方向の機能（container cid lookup 等）に進むのが自然。
