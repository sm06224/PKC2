# Merge Import — 衝突解決の設計

**Status**: canonical spec（Tier 2-3 で凍結 / 2026-04-14）。**Tier
3-1 で MVP 実装済み**（2026-04-14、`features/import/merge-planner.ts`
+ `CONFIRM_MERGE_IMPORT` reducer case + preview UI）。
**Positioning**: `docs/spec/` 配下の正本仕様。`HANDOVER_FINAL.md`
§18.2 の不変条件 **I-Merge1 / I-Merge2** に紐付く凍結ドキュメント。
本 spec は MVP 契約を定める正本のままであり、§9 将来拡張はまだ
未実装。spec を変更するには schema bump に準ずる意思決定が必要。
**Scope**: 複数の PKC2 container を 1 つに **merge** するときの衝突
解決戦略。

## 1. 概要

PKC2 v0.1.0 までの import は **full replace** 契約に限定されている
（`data-model.md` §14.1 I-IO1）。すなわち `CONFIRM_IMPORT` は
「現在の container を import 元に **置き換える**」一方向の操作で
あり、**既存 container に読み込んだ container を重ねる merge**
は未実装である。

一方で Batch Import は「現行 container への追加」挙動を既に持つが、
これは textlog / todo / attachment など **特定 archetype を 1 件ずつ
新規 entry として追加する** 専用経路であり、container 全体を merge
する操作ではない。

本ドキュメントは Tier 3 で merge import を実装する際の **設計指針** を
事前に固める。具体的には:

- 現行 full-replace import の契約と、merge で崩れる invariant の洗い
  出し
- container レベルの衝突軸 5 種（entry / asset / relation / revision
  / metadata）の整理
- 3 つの設計候補 A / B / C の比較
- MVP として採用する方針と、その境界線
- Tier 3 実装前に済ませておくべき前提条件

実装フェーズに入る前に本書を更新・再承認する運用を想定している。

## 2. 現行 import の前提

本章は spec からの再確認であり、merge import 設計の制約条件になる。
引用元は `docs/spec/data-model.md` / `docs/development/container-wide-batch-import.md`
/ `docs/development/folder-scoped-import.md` / `docs/planning/HANDOVER_FINAL.md`。

### 2.1 Full-replace import（CONFIRM_IMPORT）

- 入口: `IMPORT_PREVIEW` → `CONFIRM_IMPORT`
- 効果: `state.container = importedContainer` の **全置換**
- 既存 container / 編集中 state / 選択状態は **破棄** される
- preview 段階でユーザーに container 差分（件数のみ）を提示し
  confirm で commit される
- Tier 2-1 で preview 経路に orphan asset auto-GC が入ったが、これは
  imported container に閉じた純粋な前処理であり、contract は変わらず
  「import されたものだけが残る」

### 2.2 Batch Import（always-additive）

- 入口: `BATCH_IMPORT_PREVIEW` → `CONFIRM_BATCH_IMPORT`
- 効果: 既存 container に N 件の entry を **追加** する
- archetype は textlog / todo / attachment / markdown(text) 等
  **archetype-aware で 1 行 / 1 ファイル = 1 entry** の mapping
- container 全体ではなく **個々の row / file を entry に変換する**
  transformation であり、「container を merge する」操作ではない
- folder-scoped-import は Batch Import の亜種

本書で扱う merge import とは別系統。混同しないように注意する。

### 2.3 Revision の非 reference-count 契約

`src/features/asset/asset-scan.ts` L37-40 が明記するとおり、revision
の snapshot は **asset reference にカウントしない**。すなわち revision
snapshot 内で参照される asset は、entry 側が参照しなくなった時点で
orphan とみなされる。

この契約は本書の merge import 設計にも引き継がれる。

### 2.4 Asset の identity = hash

container の `assets: Record<string, string>` は key = content hash
（SHA-1 ベース）で、value = base64。よって content 同一の asset は
container 内で自動的に 1 エントリに収束する。これは merge 時にも
重要な dedup 基盤となる（§4.2）。

### 2.5 Container 境界

各 container は単一 `container_id` を持つ。現行 full-replace import は
`container_id` ごと置換する。merge import では **host の container_id
を保持し、imported 側の container_id は捨てる** のが自然（§6）。

## 3. Merge import が難しい理由

単なる配列連結（`host.entries.concat(imported.entries)`）で merge が
完結しない理由を列挙する。これが §4 の衝突軸の motivation になる。

### 3.1 Lid は container 内ユニークしか保証していない

`Entry.lid` は container 内の identity であり、別 container で **偶然
同じ lid が採番されている** 可能性がある。import 側の container を
コピーして派生させた場合、重複はむしろ頻出する。

単純連結すると:

- `host.entries` と `imported.entries` に同じ lid が複数存在する
- `Relation.from_lid / to_lid` の参照先が曖昧になる
- `selectedLid` がどちらを指しているか決定不能

### 3.2 Relation は lid ベースで閉じている

Relation は from / to が lid 参照で、container 局所の identifier に
依存している。host と imported の lid 空間を統合しないと、import
した relation が「host 側の同じ lid」に誤って接続してしまう。

### 3.3 Asset hash は衝突しないが key は衝突しうる

Content 一致時の collision は自動 dedup で吸収できる（hash が同じ
なら content も同じ）。しかし **hash が偶然同じなのに別 content** の
ケースはほぼないにしても、key naming ルールが一致している保証は厳密
には無い（旧 schema 由来の key が legacy で混ざる余地）。MVP は hash
一致 = 同一として扱うが、contract として明示しておく必要がある。

### 3.4 Revision snapshot は stale になりうる

`Revision.snapshot` は JSON 文字列化された過去 entry。merge 時に lid
を remap した場合、revision の snapshot 内で言及される lid や
relation-id をどこまで書き換えるかで別の contract が必要になる。
書き換えないなら `RESTORE_ENTRY` 時に snapshot の内部 lid が host の
空間と整合しない。

### 3.5 Metadata は集合としての意味を持つ

`ContainerMeta` には title / description / created_at / schema_version
等が入る。merge 時にどちらを採用するか、または両方残すかで、UX 上の
意味が変わる。「import 側の title が残ると混乱する」「schema_version
が違うと merge 自体が不正」等、container レベルの判断が必要になる。

### 3.6 Bulk_id の container 越境

Revision の `bulk_id` は特定 container 内の 1 回の BULK 操作をグルー
プ化する tag。container を越えた bulk_id は意味を持たないため、
merge 時に持ち越すかどうかの契約が必要（§4.4）。

### 3.7 ユーザーの意図が 1 通りでない

同じ「merge したい」でも:

- **追加（append）**: 「別 container の中身をぜんぶ足したい」
- **更新（update）**: 「古い版を新しい版で上書きしたい」
- **マージ（reconcile）**: 「同じ entry の両方の差分を取り込みたい」

の 3 種が混ざる。これらを 1 つの UI に押し込むのは危険なので、MVP
では意図を 1 つに絞る（§6 で append に絞る）。

## 4. 衝突軸の整理

merge import が扱うべき衝突を 5 軸に分ける。各軸について (a) 衝突の
定義、(b) 保守的な既定挙動、(c) ユーザー設定で触れそうな余地、の 3
点で整理する。

### 4.1 Entry identity（lid）

**衝突の定義**: imported 側の `Entry.lid` が host に既に存在する。

**既定挙動**: imported 側の lid を **新規 lid に rename** する。
container の既存 lid 採番関数を再利用して未使用 lid を生成する。

**ユーザー設定余地**:

- 「lid 一致 = 同一エントリとみなして skip or overwrite」したいケース
  がある。これは §5 Option B の policy axis に相当する。MVP では
  **取らない**。理由: lid の一致は container を派生コピーした場合
  以外では偶発的であり、「同一性」の信号として弱い。
- Title / body hash で同一性判定するモード（content-based dedup）は
  将来拡張（§9）。

**副作用**:

- lid remap table `Map<oldLid, newLid>` を import 処理の中央に持つ
  必要がある
- 以下 §4.3 / §4.4 / §4.5 はすべてこの remap table を経由する

### 4.2 Asset

**衝突の定義**: imported 側の `assets[key]` と host 側の `assets[key]`
が同じ key を使っている。

**既定挙動**:

1. key と value が一致（hash 一致 = content 一致） → host 側を残す
   だけで **自動 dedup**。imported 側は捨てる
2. key が一致して value が異なる → 旧 schema 由来の例外。imported
   側 value に新 key（hash 再計算）を振り、body / snapshot 内の参照
   を rewrite する
3. key が host に存在しない → そのまま host.assets に追加

**ユーザー設定余地**: 基本ない（hash ベース dedup はアーキテクチャ
上自明）。例外 2 も自動処理で十分。

**副作用**:

- body 文字列内の `asset:<key>` 参照の書き換えが必要になるケースが
  ある（例外 2 ルート）
- この rewrite は純粋関数で閉じ、reducer の外で済ませる

### 4.3 Relation

**衝突の定義**: imported 側の `Relation.from_lid / to_lid` が、lid
remap（§4.1）の結果と整合していない、または host 側に同じ
`(from_lid, to_lid, kind)` 組の relation が既に存在する。

**既定挙動**:

1. from / to の両端が remap table に載っている（= imported 側 entry
   同士のリンク） → remap して追加
2. from / to のどちらかが **host 側に存在しない lid** を指している
   （= imported container の外部依存 dangling） → **drop**（silent）
3. from / to の両端が **元から host に存在する lid** を指している
   → ほぼ起きない（imported 側が host の lid を偶然参照している
   ケースは通常発生しない）。起きた場合は drop する
4. remap 後、host に同じ `(from, to, kind)` が存在する → skip（重複
   追加しない）

**ユーザー設定余地**:

- dangling を保持するモード（現在 entry が無くても将来の restore で
  復活する可能性を残す）は **取らない**。理由: relation の dangling
  は既存の data-model 契約でも避けるべき状態として扱われている
  （§11.7.4 参照）

**副作用**:

- `(from, to, kind)` の de-dup は `Set<string>` で線形処理
- import 後に `removeDanglingRelations` 相当の pure helper を通す

### 4.4 Revision

**衝突の定義**: imported 側の `revisions` をどこまで持ち込むか。

**既定挙動（MVP）**: **持ち込まない**。imported container の
revisions は **すべて drop** する。

**理由**:

- revision の snapshot は imported container の lid 空間で記述されて
  おり、remap table を適用するには snapshot JSON を parse して書き
  換える必要がある
- PKC2 の `RESTORE_ENTRY` は snapshot の lid をそのまま使う契約なの
  で、remap を失敗した状態で revision を持ち込むと stale snapshot が
  静かに復元不能化する
- 既に §2.3 で示したとおり、revision は reference-count から除外
  されているため、「歴史を持ち込まない = 現在の状態だけ取り込む」の
  が最も小さく安全な契約
- ユーザーから見ても「merge import 後に古い container の revision
  history が混ざる」は必ずしも嬉しくない

**ユーザー設定余地**:

- 「revision 全部持ち込む」オプションは将来拡張（§9）。snapshot
  書き換えの pure helper が前提になる

**副作用**: MVP では 0。`imported.revisions` を読まない分むしろ単純

### 4.5 Metadata（ContainerMeta）

**衝突の定義**: host と imported で `title` / `description` /
`created_at` / `schema_version` / `updated_at` が異なる。

**既定挙動**:

- `schema_version` が **不一致** → merge 自体を **拒否**（preview
  段階で error として表示、CONFIRM に進ませない）
- `title` / `description` / `created_at` → **host 側を温存**
- `updated_at` → merge 実行時刻で更新
- imported の meta は **捨てる**

**理由**: container の identity は host 側が保持する（host が "受け
皿"、imported が "追加物"）。title を重ねると「どの container で
作業しているか」がぼける。

**ユーザー設定余地**:

- title を suffix で merge する（例: "HostTitle + ImportedTitle"）は
  将来検討。MVP では取らない

**副作用**: 無し（host 側を書き換えないため）

### 4.6 Bulk_id（補助軸）

**衝突の定義**: imported 側 revision に `bulk_id` が振られている場合、
container を越えて意味を持つか。

**既定挙動**: §4.4 により MVP では imported revisions を drop する
ので、bulk_id は自然に消滅する。したがって本軸は MVP では発火しな
い。

**将来拡張**: revision 持ち込みを許すモードでは `bulk_id` を **host
側で再採番**（remap）する必要がある。2 container 間で偶然同じ
bulk_id を使っている場合に group 境界が壊れるのを防ぐため。

## 5. 比較する設計案

以下 3 案を比較する。いずれも §4 の衝突軸を埋める方針は共通で、
違いは **UI 粒度** と **reducer の拡張幅** にある。

### 5.1 Option A — Overlay import

**要旨**: imported container を pure helper で remap / dedup した上
で、1 個の追加 action（`CONFIRM_MERGE_IMPORT`）で **一括 commit**
する。UI は既存 import preview を拡張し、merge 固有の件数
（新規 / rename / dedup / drop）をだけ見せる。

**reducer 拡張**:

- 既存 `IMPORT_PREVIEW` に `mode: 'replace' | 'merge'` を追加
- 新規 `CONFIRM_MERGE_IMPORT` action
- 既存 `CONFIRM_IMPORT`（full replace）は無変更

**Pure helper**: `features/import/merge-planner.ts`

- `planMergeImport(host, imported) → MergePlan`
  - lid remap table
  - asset dedup table
  - relation drop list
  - imported revisions drop list
- `applyMergePlan(host, imported, plan) → Container`（pure）

**UI**:

- preview 画面に "merge" toggle（radio）追加
- 件数サマリ（`+12 entries / rename 3 / dedup 5 assets / drop 2
  relations / drop 4 revisions`）
- confirm で `CONFIRM_MERGE_IMPORT` dispatch

**長所**:

- 既存 full-replace を 1 ビットも壊さない
- pure helper 層で全ロジックが閉じるのでテストが素直
- UI が最小（モード切り替え 1 個と件数 5 行）

**短所**:

- per-entry の選択 UI がない（entry 単位で "これは import しない" が
  できない）
- policy が固定（rename on conflict / drop dangling / drop revisions
  がハードコード）

### 5.2 Option B — Policy-driven merge

**要旨**: §4 の各軸ごとにユーザーが `skip | overwrite | rename` 等
の policy を選択できる UI を提供する。Option A にさらに policy 層を
重ねた案。

**reducer 拡張**:

- `MERGE_IMPORT_PREVIEW` + `CONFIRM_MERGE_IMPORT`
- `MergePolicy` object を action payload に含める:
  ```ts
  type MergePolicy = {
    onLidCollision: 'rename' | 'skip' | 'overwrite';
    onRelationDangling: 'drop' | 'keep';
    onAssetKeyCollision: 'rehash' | 'skip';
    includeRevisions: boolean;
  };
  ```

**UI**:

- preview 画面に policy 編集フォーム（4 軸 × 2-3 選択肢）
- プレビューは policy を変更するたびに再計算

**長所**:

- ユーザーがケースに応じて調整できる
- 教育的: どの軸が merge の衝突対象かが UI に現れる

**短所**:

- UI 複雑度が一気に上がる（radio が 4 組）
- policy の組み合わせ爆発（2×2×2×2 = 16 通り）。テストも 16 倍近く
  書くことになる
- MVP で求められる「安全に merge できる」という最小要件に対して
  オーバースペック
- `overwrite` を許すと "逆方向の破壊" が起きる（host 側の entry が
  imported 側で塗りつぶされる）ので confirm UX が別途必要

### 5.3 Option C — Staging（imported as readonly container）

**要旨**: imported container を **host container に統合しない**。
代わりに UI 上で "別 container を併置" し、ユーザーが entry を 1 件
ずつ host に drag / copy して取り込む方式。

**reducer 拡張**:

- 新規 state fields: `stagingContainer: Container | null`
- 新規 actions: `OPEN_STAGING`, `CLOSE_STAGING`,
  `COPY_FROM_STAGING`
- container は 2 つ並立する

**UI**:

- 左右 2 ペイン（host / staging）
- staging 側は read-only
- per-entry で "copy" ボタン

**長所**:

- 最もユーザー制御が効く
- 途中でキャンセルしても host が壊れない（staging を閉じるだけ）

**短所**:

- **実装コストが他 2 案より 1 桁大きい**: 2 container 並存、2 つの
  renderer 対象、presenter 層も container 参照を引数化する必要がある
- persistence への影響が大きい（staging を IndexedDB に置くか）
- 現行 5-layer architecture の "container is source of truth" 原則
  を拡張する（複数 container）必要があり、ここだけで別プロジェクト
  級の設計変更になる

### 5.4 比較表

| 軸 | Option A: Overlay | Option B: Policy | Option C: Staging |
|----|-------------------|-------------------|-------------------|
| 新規 reducer action 数 | 1（+1 mode flag） | 1（+policy payload） | 3 以上 |
| 新規 state field 数 | 0 | 0 | 1（staging container） |
| UI 追加面積 | 小（mode toggle + 件数） | 中（policy form） | 大（2 ペイン + copy UI） |
| 単一 entry 単位の制御 | 無し | 部分的（policy） | 完全 |
| 既存 full-replace への影響 | 無し | 無し | 無し |
| architecture invariant への圧力 | 小 | 中 | 大（複数 container） |
| テスト面積（推定） | 20 件 | 60-80 件 | 100 件超 |
| MVP 適合度 | ◎ | △ | × |

## 6. 採用方針

**推奨: Option A（Overlay import）を MVP として採用する。**

### 6.1 選択理由

1. **既存 full-replace を 1 ビットも変更しない**
   - v0.1.0 の `CONFIRM_IMPORT` / import preview UI / 取説は完全に
     そのまま残り、merge は **新しい経路** として追加される
   - backward compatibility が構造的に担保される

2. **pure helper 層で閉じる**
   - `features/import/merge-planner.ts` に `planMergeImport` /
     `applyMergePlan` を置けば、reducer は 1 case 追加するだけ
   - 既存の `asset-scan.ts` / `container-ops.ts` の pure helper 群と
     同じ位置づけで、テストが素直に書ける

3. **UX が理解しやすい**
   - ユーザーが見る行動は「import 時に replace か merge か」の 1
     選択だけ
   - 件数サマリ（新規 / rename / dedup / drop）は現行 preview の
     自然な延長

4. **policy 爆発の回避**
   - Option B は MVP スコープで扱うには組み合わせが多い
   - policy が必要になった時点で Option A の `MergePlan` に flag を
     増やせば Option B に漸進的に拡張できる（§9.2）

5. **architecture invariant を守る**
   - 「container is source of truth」「reducer は pure」「core ← features
     ← adapter」はすべて維持
   - Option C は invariant を拡張する必要があり、Tier 3 に収まらない

### 6.2 "append" 意図に絞る

§3.7 の 3 意図（append / update / reconcile）のうち、**append のみ**
を MVP で扱う。

- imported entry は **常に新規 lid で追加** される（lid が被っても
  rename）
- host 側 entry は **absolute に触らない**
- よって merge import は **host に対して破壊的な操作ではない** こと
  が保証される
- update / reconcile を実装するには lid-based identity 判定または
  content-based identity 判定が必要になるが、これは §9 の将来拡張

この割り切りによって "merge import で誤って作業中の entry を消す"
というリスクを構造的に排除できる。

## 7. MVP のスコープ

本章は Tier 3 で実装する範囲を明示する。

### 7.1 受け入れる

1. **全 archetype** を merge 対象にする
   - text / textlog / todo / form / attachment / folder / generic /
     opaque のすべて
   - imported 側で認識できない archetype は **opaque として保持**
     （現行 full-replace の契約と同じ）
2. **lid remap**
   - imported 側の `Entry.lid` はすべて **未使用 lid に再採番**
   - remap table を pure helper 内で構築
3. **asset dedup**
   - hash (key) 一致 → host 側を残す
   - key 一致 value 不一致 → imported 側を rehash して衝突回避
   - body / snapshot 内の `asset:<key>` 参照を整合 rewrite
4. **relation remap**
   - imported 側 relation の from / to を remap table 経由で解決
   - 両端が解決可能なら追加、そうでなければ drop
   - host に既に同じ `(from, to, kind)` があれば skip
5. **revision は drop**（MVP）
6. **ContainerMeta は host 側を温存**、`updated_at` のみ merge 時刻
   で上書き
7. **schema_version 不一致は拒否**（preview で error）
8. **preview の件数サマリ**: 新規件数 / rename 件数 / dedup 件数 /
   drop 件数（relation, revision 別）
9. **merge 後 auto-GC**（Tier 2-1 の `removeOrphanAssets` を merge
   経路でも実行）

### 7.2 UI 変更

- `import preview` dialog に **mode radio**: `Replace (現行)` /
  `Merge (追加)`
- `Merge` 選択時は件数サマリの内訳が 5 行（`+N entries`, `rename N
  lids`, `dedup N assets`, `drop N relations`, `drop N revisions`）に
  展開される
- confirm button の text は `Import (replace)` / `Import (merge)` で
  mode を明示する
- それ以外の import UI / action-binder selector は無変更

### 7.3 新規 reducer 拡張

- `IMPORT_PREVIEW` action の payload に `mode: 'replace' | 'merge'`
  を追加（optional、default は `'replace'`）
- 新規 action `CONFIRM_MERGE_IMPORT`
- 新規 event `CONTAINER_MERGED`（既存 `CONTAINER_IMPORTED` とは別
  にする。ログ上の区別のため）
- 既存 `CONFIRM_IMPORT` / `CONTAINER_IMPORTED` は無変更

### 7.4 新規 pure helper（features 層）

- `features/import/merge-planner.ts`
  - `type MergePlan = { lidRemap, assetRemap, droppedRelations,
    droppedRevisions, counts }`
  - `planMergeImport(host: Container, imported: Container): MergePlan
    | { error: 'schema-mismatch' }`
  - `applyMergePlan(host: Container, imported: Container, plan:
    MergePlan): Container`
- 既存 `asset-scan.ts` / `container-ops.ts` は無変更

### 7.5 テスト方針（MVP）

想定テスト数 20 件前後。

- **planMergeImport（pure, 8 件）**: lid 衝突あり/なし、asset hash 衝
  突あり/なし、dangling relation あり、schema mismatch、空 imported、
  entry 0 件
- **applyMergePlan（pure, 4 件）**: remap 適用で body 内 asset 参照が
  rewrite される、relation の de-dup、host entry が unchanged
- **reducer（4 件）**: `CONFIRM_MERGE_IMPORT` で container が期待形
  になる、既存 `CONFIRM_IMPORT` の挙動が regression していない、
  event の種類が `CONTAINER_MERGED`、orphan GC が走る
- **UI（4 件）**: preview dialog に mode radio が出る、merge mode で
  件数サマリが 5 行出る、schema-mismatch 時 confirm disabled、mode
  切り替えで件数サマリが再計算される

## 8. 非スコープ

本章は MVP で **意図的に実装しない** 項目を明示する。将来拡張との
境界線として機能する。

### 8.1 Per-entry 選択 UI

imported container のうち「どの entry を merge するか」を entry 単
位で選ぶ UI は **実装しない**。

**理由**:

- UI 面積が一気に跳ね上がる（tree view / checkbox / bulk select）
- MVP の「append のみ」契約では、全部受け入れても host 側は破壊さ
  れない
- per-entry 選択が本当に必要なら Option C（staging）の方向に寄せる
  べきで、Option A の枠で無理に付けるのは筋が悪い

### 8.2 Title / body ハッシュによる同一性判定

「タイトルが同じ entry は merge ではなく skip or overwrite する」
というモードは **実装しない**。

**理由**:

- title は user-editable で自然言語。一致 = 同一 とみなすのは脆い
- 意図的に同名 entry を複数置く運用がある（例: "MEMO" が複数あって
  も良い）
- content hash ベースの dedup は §9.3 の将来拡張候補

### 8.3 Revision 持ち込み

imported container の revision history を host に連れてくるモードは
**実装しない**（§4.4 参照）。

**理由**:

- snapshot の lid remap が必要で、実装と検証の負債が跳ね上がる
- MVP の "現在状態だけ取り込む" 契約の方が安全

### 8.4 Policy UI（Option B 相当）

lid 衝突時の `rename / skip / overwrite` をユーザーが選ぶ UI は
**実装しない**。§6.1 の policy 爆発回避。

### 8.5 Staging container（Option C 相当）

2 container 並立モードは **実装しない**。architecture invariant を
拡張する必要があり、Tier 3 の範囲を超える。

### 8.6 Schema migration（version 不一致の自動補正）

`schema_version` 不一致時に imported 側を自動で migrate する機能は
**MVP では実装しない**。merge は preview で error を出して reject する。

**理由**:

- schema migration は別問題領域。まず full-replace import でも
  migration が必要になった時点で別ドキュメントとして設計すべき

**2026-04-15 追記（H-3 / 自主運転モード第 3 号）**: schema migration
の正本仕様が `docs/spec/schema-migration-policy.md` に策定された（docs-only）。
当該 spec §8 に従い、schema v2 到達時には以下の緩和を **§9 将来拡張枠で**
検討可能:

- `imported.schema_version < host.schema_version` → imported 側のみ migrate
  してから overlay
- `imported.schema_version > host.schema_version` → 従来通り reject、
  host の先行更新を促す UI 導線を用意
- `imported === host` → 現行通り

実装差分は `features/import/merge-planner.ts:79` の check 1 箇所で済む。
現段階では v1 固定のため何の変更も発生しない（設計の先置きのみ）。

### 8.7 Folder structure の semantic merge

imported 側 folder archetype の tree 構造を host 側 folder と
**統合** する処理は行わない。folder entry は他の entry と同様に
**新規 lid で追加**（= 独立 folder として 2 本立て）される。

**理由**:

- folder の "同じ folder" を判定する基準が無い（title 一致は弱い、
  path 一致は存在しない、structural relation はリマップされて別物）
- 将来 content-based identity を入れる時に合わせて再検討

### 8.8 Bulk_id の container 越境保持

§4.6 のとおり、MVP は revision を drop するので bulk_id も消える。
container を越えて bulk_id を保持する契約は作らない。

### 8.9 Merge の undo（1 クリック revert）

Merge 実行結果を 1 クリックで丸ごと revert するボタンは **MVP には
入れない**。

**理由**:

- 個別 entry の revert は既存の `RESTORE_ENTRY` で出来るが、merge
  自体の "bulk revert" を実装するには merge imported entry 全てに
  共通の merge-session-id を振る必要がある
- Tier 2-2（bulk restore UI）と相似の仕組みを用意する価値はあるが
  先に MVP の基礎契約を固める方が優先

## 9. 将来拡張

MVP のあとに検討する拡張を列挙する。どれも MVP の契約に **後付け
可能** な設計になっていることを確認するための章。

### 9.1 Merge session id と 1 クリック revert

- `CONFIRM_MERGE_IMPORT` 実行時に `merge_session_id` を採番
- imported 由来の entry の **初回 revision** に `merge_session_id`
  を刻む（`Revision.merge_session_id?: string`）
- Tier 2-2 の bulk restore UI を応用して、meta pane または "Data"
  パネルから `merge session` 単位の revert を提供
- data-model には field 追加が 1 つだけ（`Revision.merge_session_id?:
  string`）で済む

### 9.2 Policy UI（Option B 相当）

- `MergePlan` に `policy: MergePolicy` を追加
- 初期値は MVP と同じ hard-coded default
- preview UI に policy editor を追加

段階的に追加できる: MVP の `planMergeImport` signature を破壊せず、
optional 2nd argument として policy を受ける形にしておけばよい。

### 9.3 Content-based identity（title / body hash）

- imported 側 entry と host 側 entry の `title + body + archetype`
  から fingerprint を計算
- 一致したら merge せず skip（ユーザーが policy で選ぶ）
- attachment archetype の場合は asset hash で判定

これも `MergePlan` に `identityMatch: Array<{imported_lid, host_lid}>`
を足すだけで吸収できる。

### 9.4 Revision history 持ち込み

- `MergePolicy.includeRevisions: boolean` を true にしたとき、imported
  revisions の snapshot を remap table 経由で lid 書き換え
- `applyMergePlan` 内で snapshot JSON を parse → lid 置換 → stringify

snapshot 内部に現れるのは基本的に `lid` / `relation_id` のみなので、
pure helper で閉じる。

### 9.5 Bulk_id の remap

§4.6 の本格対応。`MergePolicy.includeRevisions` が true の時に、
`bulk_id` を `${original_bulk_id}@merge-${merge_session_id}` などの
decorated id に書き換えて group 境界を守る。

### 9.6 Folder semantic merge

title + 親子 relation が一致する folder を「同じ folder」とみなして
中身を統合するモード。§8.7 の逆。content-based identity（§9.3）の
実装と同時に検討する。

### 9.7 Staging container（Option C への道）

MVP の overlay 経路とは **別経路** として staging を追加する。
MVP 経路を壊さず、「もっと慎重に merge したい」ユーザー向けの上位
モードとして追加する。必要なら container 並立を allow する方向に
architecture invariant を拡張する。

### 9.8 Export 側の "diff export"

Merge import を使うワークフロー全体を考えると、host container と
imported container の **diff だけ export** する機能があると、merge
が実用化する。これは本ドキュメントの範囲外だが、merge UX を生かす
ための対の機能として記録しておく。

## 10. 実装前提条件

Tier 3 で実装に着手する **前に** 確認または整備しておく項目を
チェックリストで示す。

### 10.1 Spec 側

- [ ] `docs/spec/data-model.md` の §11.7.4 / §14.1 / §15.5 に本
      ドキュメントへの相互リンクを追加（"merge import は未実装"
      記述を "merge import の設計は `merge-import-conflict-resolution.md`
      参照" に更新）
- [ ] `data-model.md` §14.1 の I-IO1（"Import は full replace"）を
      そのまま残しつつ、merge import の前提契約を I-IO1b として
      追加
- [ ] 本ドキュメント自身の再レビュー（設計案 A の選択理由に異議な
      きこと、MVP スコープに過不足なきこと）

### 10.2 コード側（前調査のみ、実装は Tier 3）

- [ ] `src/core/types.ts` の `Container` / `Entry` / `Relation` /
      `Revision` / `ContainerMeta` の最終形が本ドキュメントの前提
      と一致しているか再確認
- [ ] `src/features/asset/asset-scan.ts` の `removeOrphanAssets` が
      merge 後の container にも安全に適用できるか確認（Tier 2-1 で
      確認済みの契約を再利用）
- [ ] `src/core/operations/container-ops.ts` の lid 採番関数
      （新規 lid 生成 pure helper）が merge-planner から呼べる形に
      なっているか確認。無ければ切り出し
- [ ] body 内の `asset:<key>` 参照抽出・書き換えの pure helper が
      存在するか。無ければ `features/asset/` に追加予定として
      記録

### 10.3 UI / Reducer 側

- [ ] `IMPORT_PREVIEW` action に `mode` field を足しても既存の
      preview dialog が regression しないか、実装前の prototype で
      確認
- [ ] import preview dialog の renderer に radio group を追加する
      余地が DOM 構造上あるか、renderer の現行コードで確認
- [ ] event log（`CONTAINER_IMPORTED` → `CONTAINER_MERGED`）を
      受け取る consumer の有無を確認（persistence / transport）

### 10.4 テスト側

- [ ] `tests/core/app-state.test.ts` の import セクションの fixture
      helper（`makeImportPreview()`）を merge 用にも流用できる形に
      なっているか確認
- [ ] `tests/features/` に `merge-planner.test.ts` を置ける命名・
      ディレクトリ慣習になっているか（既存の
      `tests/features/asset-scan.test.ts` と並置で OK）

### 10.5 ドキュメント / 取説側

- [ ] `docs/manual/07_保存と持ち出し.md` に merge 節を追記する
      予定を計画ドキュメントに記録（Tier 3 で実装と同時に更新）
- [ ] `docs/development/INDEX.md` に本ドキュメントを含め、次に入る
      merge-import 実装ドキュメント（Tier 3）との関係を記す

### 10.6 影響見積り

- bundle size 増加見込み: `merge-planner.ts` が 4-6 KB、UI 追加が
  1-2 KB、合計 +6-8 KB 程度
- 新規 test 数: 約 20 件（§7.5）
- 既存 test regression の想定: 無し（full-replace 経路は無変更）

## 11. 最終結論

本章は他章のまとめ。Tier 3 着手時の decision cheat-sheet として機
能する。

### 11.1 推奨案

**Option A（Overlay import）を採用**。§6 の 5 理由により、MVP と
しての適合度が他 2 案を明確に上回る。

### 11.2 MVP でやること

- `IMPORT_PREVIEW` に `mode: 'replace' | 'merge'` を追加
- 新規 action `CONFIRM_MERGE_IMPORT`
- 新規 event `CONTAINER_MERGED`
- pure helper `features/import/merge-planner.ts`（`planMergeImport`
  / `applyMergePlan`）
- lid auto-rename / asset hash dedup（key 衝突時 rehash）/ relation
  dangling drop / `(from, to, kind)` 重複 skip
- ContainerMeta は host 温存、`updated_at` のみ更新
- merge 後 orphan asset auto-GC（Tier 2-1 契約の再利用）
- import preview dialog に mode radio + 件数サマリ 5 行
- テスト約 20 件

### 11.3 MVP でやらないこと

- per-entry 選択 UI
- title / body hash 同一性判定
- revision の持ち込み（bulk_id 含む）
- Policy UI（Option B）
- Staging container（Option C）
- Schema migration
- Folder semantic merge
- Merge 自体の 1 クリック revert

### 11.4 Tier 3 で実装可能か

**可能**。理由:

- reducer 拡張は 1 action + 1 event の追加で済む
- pure helper で全衝突解決ロジックが閉じる
- 既存 full-replace 経路は無変更で backward compatibility が自明
- 想定テスト数 20 件は 1 回の Tier で収まる規模
- UI 変更は既存 import preview への radio + 件数サマリ追加のみ

### 11.5 追加調査の要否

大きな追加調査は不要。ただし **実装前に §10.2 の 4 項目** を軽く
確認するのは望ましい（各 30 分程度の読解で足りる）:

1. lid 採番関数の切り出し状況
2. body 内 `asset:<key>` 参照 rewrite helper の有無
3. `IMPORT_PREVIEW` action の payload 形式
4. import preview dialog の DOM 構造（radio 追加余地）

新しいアーキテクチャ上の意思決定は不要で、いずれも実装時の pure
refactor または minor addition で吸収できる。

## 12. 参考

- `docs/spec/data-model.md` §11.7.4 / §14.1 / §15.5
- `docs/development/container-wide-batch-import.md`
- `docs/development/folder-scoped-import.md`
- `docs/development/import-preview-ui.md`
- `docs/development/orphan-asset-auto-gc.md`（Tier 2-1）
- `docs/development/bulk-restore-ui.md`（Tier 2-2）
- `docs/planning/HANDOVER_FINAL.md` §5.1
- `src/features/asset/asset-scan.ts`
- `src/core/operations/container-ops.ts`
- `src/adapter/state/app-state.ts`（`CONFIRM_IMPORT` 周辺）

## 13. 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-14 | 初版（Tier 2-3, docs-only） |
| 2026-04-14 | Tier 3-1 で MVP 実装完了。`features/import/merge-planner.ts` (pure helper) + `CONFIRM_MERGE_IMPORT` / `SET_IMPORT_MODE` reducer cases + preview UI の mode radio + merge 件数サマリ。テスト 29 件追加（planner 13 / reducer+integration+UI 16）。spec 本文は無変更（MVP 契約として凍結済み） |
