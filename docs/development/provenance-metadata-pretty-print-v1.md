# Provenance Metadata Pretty-Print v1.x

**Status**: implementation — 2026-04-20.
**Scope**: `provenance-metadata-viewer-v1.md` の値表示のみを対象に、**読みやすさ**を上げる小さな変更。canonical key は一切変えず、pretty-print は **key-scoped** で 2 key だけに適用。raw 値は `title` + `aria-label` で必ず復元可能にする。read-only / viewing 契約は完全維持。
**Baseline**: `docs/development/provenance-metadata-viewer-v1.md`、`docs/spec/provenance-relation-profile.md §2.2`。

---

## 1. 実装方針

v1 viewer は canonical key と raw string 値を "as-is" で出していた（contract 信頼度は高い一方、`converted_at` の ISO string と 16-char hex が読みづらい）。v1.x は以下だけを加える:

- **key-scoped** な小さな formatter を 1 本追加（`formatProvenanceMetadataValue(key, raw)`）
- 対象は canonical spec で意味が確定している 2 key のみ
- 変換失敗時は raw を出す（防衛的）
- raw 値は `title` / `aria-label` で必ず hover / screen reader から復元可能
- formatted かどうかを DOM attribute で明示（test / CSS 対応）
- 新規 action / DOM button / reducer path は**一切**追加しない（read-only 維持）

## 2. pretty-print 対象と規則

### 2.1 対象 key（key-scoped rule table）

| key | raw 形式 | pretty-print 表示 | fallback |
|---|---|---|---|
| `converted_at` | ISO 8601 string（例: `"2026-04-16T12:34:56Z"`）| `Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })` による locale-aware datetime（例: `"Apr 16, 2026, 12:34 PM"`）| `Date.parse` が `NaN` or `Intl` 例外 → raw そのまま |
| `source_content_hash` | ≥ 12 文字の hex（`provenance-relation-profile.md §2.2.2` で fnv1a64hex / 16-char 規定）| `first8 + '…'`（例: `"abcd1234…"`）| 長さ < 12 → raw そのまま（未知 alt hash を壊さない）|

**それ以外の key は全て pass-through**（`conversion_kind` / `split_mode` / `segment_count` / `selected_log_count` / `source_updated_at` / `source_revision_id` / `source_container_cid` / `source_content_hash_sha256` / 将来の additive key 全て）。

### 2.2 key-based を採る理由

- **pattern-based は採らない**: 「ISO っぽい string は全部 datetime 化」「16-char hex は全部省略」のような推測は、値の意味が spec で確定していない key を誤変換するリスクがある
- **additive で安全**: 未知の key は常に raw 表示 → 将来の canonical spec 追加時にも UI が勝手に挙動を変えない
- **test 単純**: 1 key 1 rule、回帰しやすい

### 2.3 未知 key への姿勢

`some_future_key: "some-long-value-that-might-look-like-a-hash-abcd1234ef567890"` のような値が来ても **そのまま表示**。見た目が hash / date に "似ている" だけでは変換しない（§2.2 key-based policy）。

### 2.4 対象拡張のガイドライン

将来 canonical spec に新 key が追加されて pretty-print 対象にしたい場合:
1. `provenance-relation-profile.md` の §2.2.x に新 key の正規定義が先行
2. `formatProvenanceMetadataValue` に 1 分岐追加（key ===  '<new_key>'）
3. 対応 test を追加
4. 本書の §2.1 表に 1 行追記

pattern-based / generic formatter 化は**しない方針**を維持。

## 3. raw 値の保持方法

### 3.1 属性レイアウト

formatted な行は `<dd>` に以下を追加:

```html
<dd class="pkc-provenance-metadata-value"
    data-pkc-metadata-value="converted_at"
    data-pkc-metadata-formatted="true"
    title="2026-04-16T12:34:56Z"
    aria-label="converted_at: 2026-04-16T12:34:56Z">
  Apr 16, 2026, 12:34 PM
</dd>
```

non-formatted 行は既存と同じ:

```html
<dd class="pkc-provenance-metadata-value"
    data-pkc-metadata-value="conversion_kind">
  text-to-textlog
</dd>
```

### 3.2 復元経路

| 経路 | 何が返るか |
|---|---|
| hover tooltip（`title`）| raw canonical string |
| screen reader（`aria-label`）| `"<key>: <raw>"` 形式で key + raw を 1 読み上げ単位 |
| DOM query（`[data-pkc-metadata-value="<key>"]`）| 要素自体（従来どおり）|
| formatted 判定（`[data-pkc-metadata-formatted="true"]`）| CSS / test のフック |

`data-pkc-metadata-formatted` 属性は **formatted のときだけ** 付く。未付与 = raw 表示。

### 3.3 container / spec 側への影響

**ゼロ**。`Relation.metadata` は従来どおり `Record<string, string>`、値は canonical のまま container に保存される。viewer 表示層だけが変化する。

## 4. read-only 保持の根拠

v1 viewer が既に守っている以下は全て維持:

- **入力要素を一切追加しない**: `<input>` / `<select>` / `<textarea>` / `<button>` のいずれも viewer 配下に存在しない（test で機械検証）
- **reducer path 未変更**: `UPDATE_RELATION_KIND` の `provenance` 二重ガード不変
- **`canEdit` / readonly gate 不変**: pretty-print は `canEdit` に依存せず、readonly でも同じ表示
- **container への書き戻しなし**: 計算は render 時の derived、metadata は不変
- **canonical key を変えない**: key 名 / 順序 / 出現条件すべて v1 viewer の動作と同じ

つまり pretty-print は **display layer only** の変更で、`relation-kind-edit-v1.md §2.3` / `provenance-metadata-viewer-v1.md §5` の provenance 保全契約には影響しない。

## 5. 既存挙動の維持

- 非 provenance 行への影響: なし
- v1 viewer の collapsed-by-default / `<details>` 動作: 不変
- key 並び順（required → recommended → others alphabetical）: 不変
- 非 string metadata の defensive filter: 不変
- `data-pkc-region="provenance-metadata"` / `data-pkc-metadata-key` / `data-pkc-metadata-value`: 不変（新 attribute は additive）

## 6. 実装量

| ファイル | 変更 |
|---|---|
| `src/adapter/ui/renderer.ts` | `formatProvenanceMetadataValue` 新規 helper (+28 行) + viewer 本体での適用 (+8 行) |
| `tests/adapter/renderer.test.ts` | +7 tests（converted_at format / 解釈失敗 fallback / hash 省略 / 短 hash 非省略 / 未知 key pass-through / read-only shape / readonly context）と 1 既存 test 更新（raw から formatted へ） |
| `docs/development/provenance-metadata-pretty-print-v1.md` | 本書 |
| `dist/{bundle.js,bundle.css,pkc2.html}` / `PKC2-Extensions/pkc2-manual.html` | rebuild |

CSS は追加なし（`data-pkc-metadata-formatted` 属性用の特別スタイルは現状不要、既存 value スタイルで十分）。

## 7. Validation

| 項目 | 結果 |
|---|---|
| `npm run typecheck` | OK |
| `npm run lint` | OK |
| `npm test` | 4779 / 4779 pass（+7 from summary-clickable v3 baseline 4772）|
| `npm run build:bundle` | OK（bundle.css 86.53 kB / bundle.js 619.48 kB、baseline から css 同一 / js +0.53 kB）|
| `npm run build:release` | OK（dist/pkc2.html 676.1 KB）|
| `npm run build:manual` | OK（PKC2-Extensions/pkc2-manual.html 1709.6 KB）|

## 8. 用語整理

- **"pretty-print"** と呼ぶ（"provenance interpretation" / "provenance decode" とは呼ばない）
- canonical key 名は**変えない**: `converted_at` / `source_content_hash` をそのまま `<dt>` に出す
- 翻訳・alias は入れない（UI ラベルとしての key は spec 由来の snake_case）
- display ラベルは暫定扱いしない（`Intl.DateTimeFormat` の locale-aware 出力 / `first8…` は確定ルール）
- `data-pkc-metadata-formatted` attribute 名は canonical（将来 rename しない、addition-only）

## 9. 非スコープ（v1.x+）

- **copy / export**: 別 PR（「provenance metadata copy / export」候補）。本書には含めない
- **pattern-based formatter**: "任意の ISO 8601 値を datetime 化" 等の汎用化は採らない（§2.2）
- **non-provenance kind の metadata 表示**: `relation-kind-edit-v1.md` / `provenance-metadata-viewer-v1.md §9` と同じく範囲外
- **formatted 値の編集動線**: 入力要素を増やさない（read-only 契約）
- **locale 固定 / custom format**: `Intl.DateTimeFormat(undefined, ...)` で browser locale に任せる、上書き UI は v1.x で持たない
- **container cid / source_revision_id の title lookup**: 別 feature として別 PR で検討（entry title を横引きする副作用を避ける）

## 10. 関連文書

- `docs/development/provenance-metadata-viewer-v1.md` — viewer v1 canonical（本 PR の親）
- `docs/spec/provenance-relation-profile.md §2.2` — metadata key 正規定義（本 PR の対象判定の根拠）
- `docs/spec/text-textlog-provenance.md §7.2` — TEXT ↔ TEXTLOG 変換の metadata payload
- `docs/spec/textlog-text-conversion-policy.md` — textlog-to-text conversion metadata
- `docs/spec/dual-edit-safety-v1-behavior-contract.md` — dual-edit 由来の provenance（本 pretty-print の適用対象としても通る）
- `docs/development/relation-kind-edit-v1.md` — provenance 二重ガード（本 PR で維持）
- `src/adapter/ui/renderer.ts` — `formatProvenanceMetadataValue` + viewer 本体
- `tests/adapter/renderer.test.ts` — 追加 7 tests

## 11. 後続 PR 候補

> **📌 As of 2026-04-21（historical overlay）**: 3 件中 **1 件 LANDED / 2 件 Defer**。
>
> 1. provenance metadata copy / export — **LANDED** (`provenance-metadata-copy-export-v1.md`。raw canonical JSON を copy / export 対象とする設計のまま着地)
> 2. S5 optional orphan filter — **DEFERRED 継続**（`unified-orphan-detection-v3-contract.md §7.4`）
> 3. provenance metadata container cid → title lookup — **DEFERRED**（`provenance-metadata-copy-export-v1.md §11` で scope 外確定、`next-feature-prioritization-after-relations-wave.md §5` でも defer 継続）

1. **provenance metadata copy / export** — 1 clipboard copy ボタンで raw canonical を丸ごとコピー。pretty-print の display ではなく raw を copy 対象にするのが素直（別 PR で詳細設計）
2. **S5 — optional orphan filter** — defer 継続推奨
3. **provenance metadata container cid → title lookup**（optional v1.x+）— `source_container_cid` 等が来たときに cid → container title 解決をしたい場合の別 feature

v1 viewer（表示） → v1.x pretty-print（可読性） → copy/export（コピー）の順で provenance UX が段階的に仕上がる。
