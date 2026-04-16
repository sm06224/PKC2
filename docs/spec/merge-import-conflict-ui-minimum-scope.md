# Merge Import — Conflict UI v1 最小仕様

**Status**: proposal（docs-only / 2026-04-16）
**Position**: `docs/spec/merge-import-conflict-resolution.md` §8.1「Per-entry 選択 UI を MVP に入れない」の決定を後退させず、その先に **v1 conflict resolution UI** を据えるための **独立した補助 spec**。canonical spec の §9 将来拡張枠（H-10）に含まれる「Policy UI / Staging / Revision 持込 / diff export / merge undo」のうち、**Policy UI 相当の最小形**を entry 単位の conflict 解決に絞って再定義する。
**Scope**: Merge MVP（Overlay / append-only、2026-04-14 commit `00e7f68`）が既に body に提供している `+N entries / rename N lids / dedup N assets / drop N relations / drop N revisions` の **5 行件数サマリ** を壊さずに、その 1 段内側で entry 単位の介入 UI を追加するときの最小仕様を固める。
**Non-goal**: 本書は実装仕様ではなく、**docs-only の先行設計**。後続の behavior contract → implementation → audit → manual 同期 の 4 段パイプライン（replace 系と同じ運用）で進める前提。
**Related**:
- `docs/spec/merge-import-conflict-resolution.md`（canonical、本書の親契約）
- `docs/development/merge-import-implementation.md`（MVP 実装ノート、参照のみ）
- `docs/spec/data-model.md`（Container / Entry / Revision / Relation schema）
- `docs/spec/text-textlog-provenance.md`（`RelationKind = 'provenance'` + `Relation.metadata?` 既設計、§5 で参照）
- `docs/spec/schema-migration-policy.md`（schema mismatch policy）

---

## 1. 目的と位置づけ

### 1.1 なぜ別テーマに分けるか

Merge MVP（Overlay）は `merge-import-conflict-resolution.md` §6.2 の **append-only 契約** により、lid 衝突はすべて rename、host entry は absolute に保護、imported の revision は drop という方針で **構造的に conflict を消している**。この設計は MVP としては堅牢だが、運用では次の pain が出る:

1. **同じ entry を重複で import してしまう**: host に「報告書2025.txt」があり、imported にも「報告書2025.txt」があるとき、MVP は両方残す。ユーザーは merge 後に手で delete する必要がある
2. **意図せず古い版が "別物" として append される**: 派生 container（同じ entry の履歴違い）を merge すると、host に古い版が増え、どちらが最新か判定不能になる
3. **container 単位の "見えない衝突" が可視化されない**: MVP UI は件数サマリだけで、「どの entry が重複しているか」が判らない

これらは **canonical spec §8.1 / §8.2 で意図的に v1 非対象** にした項目だが、実運用で最も求められるのは「**この entry は重複している、どうする？**」を **entry 単位で見せて選ばせる** UI である。本書はその最小形を **別テーマとして分離** して策定する。canonical spec 本体を touch しない形で設計し、後続の contract で正式採用する選択肢を残す。

### 1.2 対象スコープ

- **対象 UI 経路**: Merge mode（`SET_IMPORT_MODE { mode: 'merge' }` が dispatch された後の import preview dialog）でのみ出現する、entry 単位 conflict リスト
- **対象 container 単位**: single imported container vs single host container の 2 項（multi-way は非対象、§6）
- **対象 archetype**: 全 archetype（text / textlog / todo / form / attachment / folder / generic / opaque）
- **対象 phase**: `importPreview !== null` の preview 画面内のみ
- **非対象 phase**: replace import / batch import / folder-scoped import（これらは conflict UI を出さない既存契約を維持）

### 1.3 v1 設計の基本原則

1. **canonical spec §6.2（append-only / host entry 不変）を緩めない**: conflict UI は merge 実行前の **事前フィルタ** として働き、「この entry を merge 候補から外す」操作は許しても、「host 側を上書きする」操作は許さない（詳細 §5.3）
2. **pure helper 層で閉じる**: conflict 検出ロジックは `features/import/` に pure helper として追加し、reducer 拡張は最小 1 action 追加に留める
3. **既存 MVP UI は無変更で残る**: conflict UI は preview dialog の **追加セクション**として出現し、件数サマリ 5 行は従来通り
4. **skip しても dangling relation を生まない**: conflict UI で「この entry は import しない」を選んでも、残った relation は既存の dangling drop 経路で自動除去（§5.2）

### 1.4 import / merge / revision / provenance との関係

本書の conflict UI は以下の既存サブシステムと **明確な境界** を持つ。

| サブシステム | 関係 | 境界 |
|-------------|-----|------|
| **full-replace import**（`CONFIRM_IMPORT`） | 無関係。conflict UI は出さない | `importMode === 'replace'` のとき本 UI は mount されない |
| **batch import**（`CONFIRM_BATCH_IMPORT`） | 無関係。batch は常に additive、conflict 概念なし | batch preview 経路には触れない |
| **merge import MVP**（`CONFIRM_MERGE_IMPORT`） | **上位に被せる**。MVP の件数サマリの前段に conflict 解決ステップを挟む | merge-planner の MergePlan を消費する新経路として追加 |
| **revision system**（`snapshotEntry` / `RESTORE_ENTRY`） | **読まない / 書かない**。conflict UI は host 側 revision を参照しない | host entry の最新 snapshot のみを比較対象とし、履歴 compare は v2+ |
| **provenance Relation**（`RelationKind = 'provenance'`） | **書き出す**（§5.4）。duplicate-as-branch 操作で imported → host の "potential duplicate" 関係を `provenance` + `metadata.kind = 'merge-duplicate'` として記録 | 既存 `text-textlog-provenance.md` の profile を拡張せず、既存 schema に metadata key を追加するだけ |
| **schema-migration-policy**（`docs/spec/schema-migration-policy.md`） | 前段 gate として効く | schema mismatch は conflict UI より **前に** reject される（既存契約維持） |
| **bulk restore UI / BULK_* revision** | 無関係 | conflict UI は merge 前の操作で、bulk restore は merge 後の revision ベース操作 |
| **orphan asset auto-GC** | 後段で走る（既存経路） | conflict UI で skip された entry が参照していた asset は、merge 後 GC で除去される |

**相互影響の方向**: conflict UI は **merge-planner の出力（MergePlan）を消費** → ユーザー選択で **MergePlan を絞り込む** → 絞った MergePlan を `CONFIRM_MERGE_IMPORT` に dispatch。このパイプラインにより既存の 4 サブシステム（revision / provenance / schema / GC）を壊さずに上位レイヤに追加される。

## 2. Conflict の定義

### 2.1 何を conflict とみなすか

canonical spec §4.1 は lid 衝突を自動 rename で解決するため、**lid 一致は identity の信号として弱い**（偶発的 / 派生コピー由来のノイズが多い）としている。本 v1 UI も **lid 一致を conflict 判定には使わない**。代わりに以下 **2 層** を conflict の定義とする。

#### Layer A: content-identity match（primary）

以下 3 条件を **すべて満たす** imported entry × host entry のペアを `entry-conflict` と定義する:

1. `imported.archetype === host.archetype`
2. `normalizeTitle(imported.title) === normalizeTitle(host.title)`（trim + 連続空白 → 単一空白、unicode NFC）
3. `contentHash(imported) === contentHash(host)` **または** `titleOnlyMatch === true`（content hash が一致しなくても、archetype + title の一致だけで "potential duplicate" とする弱判定）

`contentHash` は S-22（H-6）で追加された FNV-1a-64 16-char hex helper（`src/core/operations/hash.ts`）を再利用。title だけで判定する弱判定は `(archetype, title)` が一致するが body が異なるケース（同名の別文書、同一 folder 内の同名別ファイル等）を **ユーザーに見せる** ためにある。

**弱判定（title-only）と強判定（content-equal）は UI 上で区別する**（§4.2）。

#### Layer B: structural-identity match（secondary / 情報提示のみ）

以下の **3 つの structural 衝突** は MVP が既に自動解決しているが、conflict UI 上では **参照情報** として件数付きで提示する（ユーザーが介入できる対象ではない）:

1. **lid 衝突**: 既存 rename 経路で解決済み（rename 件数を表示）
2. **asset key 衝突**: 既存 hash rehash 経路で解決済み（dedup 件数を表示）
3. **relation dangling**: 既存 drop 経路で解決済み（drop 件数を表示）

Layer B は v1 では **介入不能**（UI 上はサマリのみ）。Layer A のみがユーザー解決対象である。

### 2.2 なぜ lid 一致 / asset 衝突を v1 の conflict に含めないか

- **lid 一致**: canonical §4.1 のとおり identity の信号として弱い。派生 container 由来の偶発的一致がほとんどで、「同一性」とみなすにはデータ点が不十分
- **asset 衝突**: hash 一致 = content 一致が自明で、dedup に user judgement は不要。自動処理が正解
- **relation dangling**: 片端が消えた relation は drop するしかなく、「どちらを残すか」の選択肢が存在しない

v1 が介入可能にするのは **entry 単位 content-identity** のみ。これが最も user value が高く、かつ意思決定が意味を持つ唯一の軸である。

### 2.3 Conflict の単位

v1 は **entry 単位** に限定する。それ以下の粒度（field 単位 / block 単位 / textlog log 単位 / markdown 節単位）は **すべて v2+ 候補**（§6）。

| 単位 | v1 対象 | 理由 |
|-----|--------|------|
| **container 全体** | ✗ | canonical MVP が既に決定（`importMode` radio） |
| **archetype グループ** | ✗ | 「text だけ全部 skip」のような粗操作は UX 的に需要が低く、per-entry の繰り返しで代替できる |
| **entry** | ✓ | 本 v1 の唯一の conflict 単位 |
| **field（title / body / createdAt / updatedAt）** | ✗ | field 単位の cherry-pick は "semantic merge" に分類。v2+ |
| **textlog log entry** | ✗ | textlog 内部の 1 log を選んで merge は semantic merge。v2+ |
| **markdown section / block** | ✗ | block-level 3-way merge は巨大テーマ、別仕様化が必要 |
| **asset 単位** | ✗ | §2.2 のとおり介入不能 |
| **relation 単位** | ✗ | §2.2 のとおり介入不能 |

### 2.4 Conflict 判定の安定性

conflict 判定関数（仮: `detectEntryConflicts(host, imported): EntryConflict[]`）は以下を満たす:

- **pure**: dispatcher / AppState / DOM への副作用なし
- **deterministic**: 同じ入力に対して同じ出力を返す（`normalizeTitle` + `contentHash` がどちらも pure）
- **O((H + I) + M)**: host entry 数 H + imported entry 数 I の走査 1 回で `Map<title_hash, host_lid>` を作成、imported 側を 1 回走査して match 検索。content-equal は hash 比較のみ
- **cross-archetype match を発火しない**: `archetype` が異なる imported × host ペアは conflict とみなさない（同 title でも）

これにより conflict UI は MVP の `planMergeImport` と **同じ計算クラス**（O(N+M) pure、host 変更なし）に収まる。

### 2.5 判定の安定性に関する注記

v1 は `titleOnlyMatch` の弱判定を含むため、**偽陽性**（意図的な同名別 entry）が発生する。これは設計上の既知コストで、以下で受容する:

- UI 上で content-equal / title-only を視覚的に区別（§4.2）
- ユーザーが「これは別物」と判断したら `duplicate-as-branch` または **介入せず** merge（= MVP デフォルトの rename 経路）に流せる
- `titleOnlyMatch` が過剰に発火する場合、v1.x で disable toggle を追加する余地を残す（§7.4）

**偽陰性**（同一 entry なのに title が微妙に違って match しない）は当面許容する。正確性より「検出漏れ時も既存 MVP の append-only 契約で host が安全」が効いているため、致命的ではない。

## 3. v1 で扱う conflict 種別

### 3.1 3 分類

conflict UI が扱う entry conflict を **3 種** に分類する:

| 分類 | 条件 | v1 解決責任 |
|------|------|-----------|
| **C1: content-equal** | archetype 一致 + title 一致 + `contentHash` 一致 | **自動 skip 提案**（デフォルト `keep-current`。重複登録を防ぐ） |
| **C2: title-only match** | archetype 一致 + title 一致 + `contentHash` 不一致 | **ユーザー介入必須**（デフォルトなし。UI で明示選択） |
| **C3: no-conflict** | 上記いずれにも該当しない | **介入不要**（MVP 経路でそのまま append） |

### 3.2 自動解決可能なもの

C1（content-equal）は **同一内容が 2 度登録されるだけ** なので、デフォルト操作を `keep-current`（= skip imported）に **自動選択**する。ユーザーは override できるが、無操作で confirm すれば安全側に倒れる。

本 v1 で「自動解決可能」とは「デフォルト値を proposed として UI に出す」ことを意味し、**ユーザーの確認なしで実行することはない**。具体的には:

- conflict UI が表示されている間は `CONFIRM_MERGE_IMPORT` がブロックされる（preview 段階で suspend）
- ユーザーが各 conflict の resolution を明示的に選ぶ（または default をそのまま承諾する）
- 全 conflict に resolution が割り当たった段階で merge button が enable になる

これは MVP の「confirm 1 クリックで commit」UX を壊さない範囲で、**追加確認が必要なときにだけ preview 段階を 1 ステップ延長する** 構造である。

### 3.3 UI 解決が必要なもの

C2（title-only match）は **ユーザー介入必須**。default 値を提示せず、以下のいずれかをユーザーが選ぶ:

- `keep-current`（= host を残し imported を skip）
- `duplicate-as-branch`（= imported を新 lid で append、host と並存、provenance 記録）
- `skip`（= どちらも何もしない、imported を append リストから外す、host も触らない）

各操作の厳密な意味は §5 で定義。C2 は title が一致するが内容が違う "似た entry" なので、ユーザーしか正解を知らない。

### 3.4 v1 で扱わないもの

以下は v1 **非対象**（§6 で詳細）:

- Layer B（lid / asset / relation の structural 衝突）への介入
- field 単位の cherry-pick（title だけ採用 / body だけ採用）
- 3-way merge（host + imported + common ancestor）
- archetype-aware diff（markdown AST diff、textlog log-level diff）
- attachment binary diff
- folder structure の semantic merge
- bulk orchestration UI（「すべて keep-current」ボタンのみ §4.4 で検討）
- revision の持ち込み / 比較
- content-identity policy の user customization（閾値 / 正規化ルールの編集）

### 3.5 自動解決と UI 解決の境界条件

以下の決定表に従う:

| 条件 | 分類 | UI 要介入 | 既定 resolution | Confirm gate |
|------|-----|----------|-----------------|-------------|
| archetype 異なる | — | — | — | N/A（C3 扱いでそのまま append） |
| title 異なる | — | — | — | N/A（C3） |
| content hash 一致 | C1 | No（proposed） | `keep-current` | 通過可（default 承諾で可） |
| content hash 異なるが title 一致 | C2 | **Yes** | なし | **要選択**（enable まで block） |
| 同 title が host 側に複数 | C2（multi-host） | Yes | なし | 要選択、ambiguity は §3.6 |

### 3.6 Ambiguity: 同 title の host 複数件

host 側に同 title の entry が複数存在する場合、どの host と pair にするかが一意に決まらない。v1 は以下で処理:

1. **`contentHash` 一致するペアが 1 つあればそれを採用** → C1 に確定
2. **`contentHash` 一致が 0 件かつ title 一致 host が複数** → **「multi-host ambiguous」フラグ付きで C2 リスト入り**、UI では候補 host を列挙（最大 3 件、超過分は `... +N more`）し、ユーザーは (a) 代表 host 1 件と比較、または (b) 一律 `duplicate-as-branch`、または (c) `skip` のいずれかを選ぶ
3. **`contentHash` 一致が複数** → 最初の 1 件を採用（deterministic ordering は `host.entries` の array index 昇順）、残りは C3 扱い

この処理は `detectEntryConflicts` 内の pure helper で完結し、UI 側に ambiguity 判定ロジックを持たない。

### 3.7 Conflict 検出と MergePlan の関係

conflict UI は merge-planner の MergePlan を **絞り込む** 形で働く:

```
(host, imported)
  → planMergeImport → MergePlan0（MVP 出力、全 imported を append 候補）
  → detectEntryConflicts → EntryConflict[]
  → UI でユーザーが resolution を選ぶ
  → applyConflictResolutions(MergePlan0, resolutions) → MergePlan1
  → CONFIRM_MERGE_IMPORT (MergePlan1) → 既存 applyMergePlan 経路
```

`applyConflictResolutions` は pure helper で、以下の変換を行う:

- `keep-current` / `skip` → 該当 imported entry を MergePlan から除外（`droppedByConflict` に移動）
- `duplicate-as-branch` → MergePlan に残す（MVP default と同じ）、ただし **provenance relation 追加** を予約
- ambiguous multi-host のうちユーザーが skip → 同上

この層化により、既存 `applyMergePlan` は **無変更**。新規 pure helper と新規 reducer case のみで v1 が成立する。

## 4. 比較表示の最小要件

### 4.1 ユーザーに見せる情報

conflict UI が 1 件の conflict について表示する必須項目:

| 区分 | 項目 | 表示形式 | v1 要否 |
|------|------|---------|--------|
| Identity | archetype badge | `TEXT` / `TEXTLOG` / `TODO` / ... 文字ラベル | 必須 |
| Identity | title | 生テキスト（省略なし） | 必須 |
| Match | conflict kind | `content-equal (C1)` / `title-only (C2)` / `multi-host` フラグ | 必須 |
| Match | content hash | 先頭 8 桁（両側比較、C2 で mismatch を明示） | 必須 |
| Host side | createdAt | ISO 短縮（`YYYY-MM-DD HH:mm`） | 必須 |
| Host side | updatedAt | ISO 短縮 | 必須 |
| Host side | body preview | 先頭 N 文字 + "..."（N = 200、archetype 非依存） | 必須 |
| Incoming | createdAt | 同上 | 必須 |
| Incoming | updatedAt | 同上 | 必須 |
| Incoming | body preview | 同上 | 必須 |
| Resolution | 選択状態 | radio 3 択（C1 は default pre-selected） | 必須 |
| Before / 共通元 | — | — | **非対象** (§6.3) |

### 4.2 side-by-side vs diff

v1 は **side-by-side** のみ提供し、**diff 表示は出さない**。

**理由**:
- diff は archetype ごとに意味が違う（TEXT = line diff、TEXTLOG = log-level array diff、TODO = JSON field diff、attachment = binary diff 不能）
- archetype-aware diff の実装は別仕様（§6.2）、v1 スコープを超える
- side-by-side の body preview 200 文字でも content-equal / title-only の判別には十分
- ユーザーが詳細比較したいときは `duplicate-as-branch` で両方 import してから既存 TEXT replace / 手動比較で運用可能

**v1 の body preview 規則**:

- 先頭 200 文字を unicode code-point 単位でスライス（`substr` 等の UTF-16 単位ではなく `[...body].slice(0, 200).join('')`）
- 改行は `\n` を visible `↵` に置換（overflow 防止）
- markdown / JSON 等の構造記号は **そのまま表示**（render しない、escape しない）
- 200 文字未満なら末尾に "..." 付けない
- 200 文字以上なら末尾に "..." 追加

### 4.3 content-equal 視覚区別

C1（content-equal）と C2（title-only）は視覚的に区別する:

- C1: `✓ content identical` バッジ（緑系、info レベル）
- C2: `⚠ title matches, content differs` バッジ（黄系、warning レベル）
- multi-host C2: `⚠ N host candidates` バッジ（黄系、ambiguity レベル）

色は既存 PKC2 の token（`--c-accent` / `--c-warn` / `--c-info`）を再利用し、新規 CSS variable を追加しない。

### 4.4 bulk 操作（最小形）

個別選択だけだと N 件の conflict に N 回クリック必要で UX が悪い。以下の **2 つの bulk shortcut** のみ v1 に含める:

- **`Accept all host (keep current)`**: すべての conflict を `keep-current` に一括設定（C2 にも適用）
- **`Duplicate all as branch`**: すべての conflict を `duplicate-as-branch` に一括設定

以下の bulk は **v1 非対象**:

- `Skip all`（= merge する意味がなくなるため）
- `Accept all incoming`（= host 上書きで append-only 契約違反、§5.3）
- archetype 別 bulk（「text だけ skip」等）
- tag / folder / date 別 bulk

### 4.5 画面レイアウト（最小 UI 提案）

import preview dialog の既存構造:

```
┌─────────────────────────────────────────┐
│ Import Preview                          │
├─────────────────────────────────────────┤
│ ○ Replace    ● Merge                    │
├─────────────────────────────────────────┤
│ +12 entries, rename 3, dedup 5 assets,  │
│ drop 2 relations, drop 4 revisions      │  <-- MVP 5-line summary（無変更）
├─────────────────────────────────────────┤
│ [ v1 追加 ] Entry conflicts: N          │
│  ├─ #1 [TEXT] "Report 2025" (C1)        │
│  │   Host   : 2025-03-01 ... 2025-04-01 │
│  │   Incoming: 2025-03-01 ... 2025-03-15│
│  │   ● Keep current   ○ Branch  ○ Skip  │
│  ├─ #2 [TODO] "Plan A" (C2 ⚠)           │
│  │   ...                                 │
│  └─ #3 [TEXTLOG] "Log" (C2 multi-host)   │
│   [ Accept all host ] [ Duplicate all ]  │
├─────────────────────────────────────────┤
│              [Cancel]  [Confirm merge]  │  <-- すべて resolve されるまで disabled
└─────────────────────────────────────────┘
```

### 4.6 DOM 構造と selector（実装時ガイド、v1 確定部）

conflict UI は `data-pkc-*` attribute で functional selector を提供する:

| selector | 用途 |
|----------|------|
| `data-pkc-region="merge-conflicts"` | conflict list コンテナ |
| `data-pkc-conflict-id="<imported_lid>"` | 1 件の conflict row（identity は imported 側 lid） |
| `data-pkc-field="conflict-resolution"` + `data-pkc-conflict-id="<lid>"` | resolution radio group |
| `data-pkc-action="set-conflict-resolution"` + `data-pkc-value="keep-current\|duplicate-as-branch\|skip"` | 個別 radio click |
| `data-pkc-action="bulk-resolution"` + `data-pkc-value="accept-all-host\|duplicate-all"` | bulk shortcut button |
| `data-pkc-conflict-kind="C1\|C2\|C2-multi"` | 分類バッジ（CSS / test selector 用） |

class 名はすべて既存 `pkc-*` prefix を維持。新規 class は追加せず、既存 token（`--c-accent` / `--c-warn` / `--c-info`）で視覚区別する。

### 4.7 state 保持の方法

conflict resolution state は以下 **どこに保持するか** を v1 で決定:

- **選択肢 A**: `AppState.mergeConflictResolutions?: Record<imported_lid, Resolution>` に新 field を追加
- **選択肢 B**: preview dialog の module-local state（reducer に載せない）

**v1 推奨: A**（AppState への optional field 追加）。理由:

- merge-import MVP が既に `AppState.importMode?: 'replace' | 'merge'` を optional で追加した前例がある
- CANCEL_IMPORT / CONFIRM_MERGE_IMPORT 時の reset を reducer で明示できる
- テストが reducer level で完結する（module singleton は testability が落ちる）
- optional なので既存 AppState literal を使う test fixture は無変更で通る

field 名（仮）: `AppState.mergeConflictResolutions?: Record<string, 'keep-current' | 'duplicate-as-branch' | 'skip'>`
初期化: `SET_IMPORT_MODE { mode: 'merge' }` で空 `{}` 初期化
更新: `SET_CONFLICT_RESOLUTION { importedLid, resolution }` / `BULK_SET_CONFLICT_RESOLUTION { resolution }` 新 action
reset: `CANCEL_IMPORT` / `CONFIRM_MERGE_IMPORT` 完了時に削除

## 5. 解決操作の最小集合

### 5.1 v1 の 3 操作

v1 conflict UI がユーザーに提供する解決操作は **3 種のみ**:

| 操作 | 意味 | 副作用 | 適用対象 |
|------|------|-------|---------|
| **`keep-current`** | host 側 entry を残し、imported 側を merge から外す | 既存 host 不変、imported 1 件が merge から drop | C1 の default、C2 の選択肢 |
| **`duplicate-as-branch`** | imported 側を新 lid で append（既存 MVP 挙動） + `provenance` relation 追加 | imported が新 entry として追加される、provenance relation 1 件追加 | C1 / C2 の選択肢 |
| **`skip`** | host も imported も触らない | imported 1 件が merge から drop | C2 の選択肢 |

`keep-current` と `skip` は **副作用が同一**（imported を drop）だが、**意図の違い** を記録するため別操作として分ける（§5.5）。

### 5.2 各操作の厳密な意味

#### 5.2.1 `keep-current`

- MergePlan から該当 imported_lid を **除外**
- imported 側 relation で from / to に該当 lid を持つものは **dangling drop**（既存経路）
- imported 側 asset 参照は merge 後 orphan GC で除去（既存経路）
- host 側は一切変更なし（revision も増えない）
- event `CONTAINER_MERGED.added_entries` に当該 entry は含まれない
- **user intent**: 「host が正しい。imported の "似たもの" は不要」

#### 5.2.2 `duplicate-as-branch`

- MergePlan は **無変更**（既存 MVP rename 経路でそのまま append）
- **追加**: `Relation { kind: 'provenance', from_lid: <imported_newLid>, to_lid: <host_lid>, metadata: { kind: 'merge-duplicate', detected_at: <now> } }` を 1 件作成し `applyMergePlan` 内で container.relations に追加
- imported 側は新 lid で host に並存し、provenance により host との関係が記録される
- host 側は一切変更なし
- **user intent**: 「どちらも残したい。後で差分を見る」

#### 5.2.3 `skip`

- MergePlan から該当 imported_lid を **除外**（挙動は `keep-current` と同じ）
- imported 側 relation も dangling drop
- host 側は変更なし
- **user intent**: 「どちらも要らない」または「判断保留、今回は見送る」

### 5.3 accept-incoming を v1 に含めない理由

canonical spec §6.2（I-Merge1 = append-only）および `HANDOVER_FINAL.md` §18.2 の I-Merge1 を **強く維持** する。v1 で `accept-incoming`（host を imported で上書き）を追加しない理由:

1. **host entry は absolute 保護** という不変条件に真っ向から反する
2. 上書き操作は revision を増やすべきか replace すべきかで別 contract が必要（既存 `UPDATE_ENTRY` とは意味が異なる）
3. multi-host ambiguous で「どの host を上書きするか」が不定
4. 上書き誤操作の revert 経路が既存 revision 系では不完全（merge_session_id 拡張が前提、§9）
5. 実運用で本当に上書きしたい場合は: (a) `duplicate-as-branch` で imported を追加 → (b) 既存 `DELETE_ENTRY` で host を削除 → 同等の結果が **audit trail 付き** で得られる

よって v1 は **上書き系をすべて delete + duplicate に分解** する方針。これにより既存 delete / restore UX にも整合し、merge 固有の破壊的操作を追加しない。

### 5.4 provenance 記録の詳細

`duplicate-as-branch` で追加する provenance relation は、既存 `docs/spec/text-textlog-provenance.md` の profile を **拡張せず** に流用する。

**Relation 形式**:

```ts
{
  id: "<new relation id>",
  kind: "provenance",                   // 既存の RelationKind additive
  from_lid: <imported_new_lid>,         // merge で生成された新 lid
  to_lid: <host_lid>,                   // 対応 host entry
  metadata: {
    kind: "merge-duplicate",            // profile 拡張: 新 metadata.kind 値
    detected_at: "<ISO datetime>",
    match_kind: "content-equal" | "title-only" | "title-only-multi",
    imported_title: "<snapshot>",
    imported_archetype: "<archetype>",
    merge_session_id: "<opt, §9.1 互換>",
  }
}
```

**向き**: `from = imported (derived)`, `to = host (source)` — `text-textlog-provenance.md` §4 の「source → derived の逆向き」規則を踏襲（provenance relation は derived から source を指す）。

**`metadata.kind` の値拡張**: 現行 `text-textlog-provenance.md` は `kind: 'text-to-textlog' | 'textlog-to-text'` の 2 値を推奨 profile としている。v1 はこれに **`'merge-duplicate'` を additive 追加**（profile 拡張 v1.1 扱い）。同 spec §8「将来拡張余地」に想定済みの additive 拡張で、既存 payload を破壊しない。

**記録しない情報**:

- host 側の `contentHash` の snapshot（将来の C1 判定を再計算する際に host が変わっていたら整合しないため、判定結果のみ記録）
- imported 側の完全 body（entry 本体は別途存在するため重複記録を避ける）
- user の選択時刻以外の session 情報

### 5.5 keep-current と skip の違いを残す理由

両者は副作用が同一だが、v1 は以下の方針で記録を分ける:

- `keep-current`: `CONTAINER_MERGED` event に `suppressed_by_keep_current: <lid>[]` として付記
- `skip`: `CONTAINER_MERGED` event に `suppressed_by_skip: <lid>[]` として付記

両リストは **merge session の意図を後から再現可能にする** ためのメタデータ。v1 では UI から表示しないが、event 購読者（persistence / transport / 将来の audit log）が区別できる。container の state には入らず、event payload のみで管理する（state 汚染を避ける）。

この区別は `merge_session_id`（§9.1）を実装する v2 で、session ベースの revert や履歴 UI を作る際の identity に使える。

### 5.6 操作の UI 規則

- 選択肢 3 つは **radio group**（単一選択、tri-state でない）
- C1: `keep-current` が **default pre-selected**（灰色円で明示）、他 2 つは空円
- C2: **default なし**（全円 empty、ユーザーが選ぶまで未 resolved）
- multi-host C2: `duplicate-as-branch` / `skip` のみ enable、`keep-current` は **どの host を残すか曖昧なので disable**（title-only の別 host 複数件の場合の曖昧性を避ける）
- bulk `Accept all host` ボタン: multi-host C2 には適用せず skip（explicit 選択を要求）
- bulk `Duplicate all` ボタン: 全 conflict に適用（C1 / C2 / multi-host いずれも OK）

### 5.7 Confirm ボタンの gate 条件

merge 確定ボタン（`Confirm merge`）が enable になる条件:

1. すべての C1 に resolution が割り当たっている（default 採用も OK）
2. すべての C2 にユーザーが **明示的に** resolution を割り当てている（default なし）
3. すべての multi-host C2 にも明示的に割り当て済み
4. schema-mismatch / その他既存 blocker が無い（既存 MVP の gate 条件維持）

gate が満たされない間、button は disabled + tooltip `Resolve N pending conflicts` を表示（N は残件数）。

### 5.8 State transition（v1 flow diagram）

```
  [ready]
    │  user triggers import preview (mode=merge)
    ▼
  [preview, importMode='merge', mergeConflictResolutions={}]
    │  planMergeImport → MergePlan0
    │  detectEntryConflicts → EntryConflict[]
    │  render preview + conflict list
    ▼
  [preview + awaiting conflict resolution]
    │  (user clicks radios or bulk button)
    │  SET_CONFLICT_RESOLUTION / BULK_SET_CONFLICT_RESOLUTION
    ▼
  [preview, mergeConflictResolutions populated]
    │  gate check: all C1 resolved (default or override)
    │             + all C2 explicitly resolved
    ├── gate fails → confirm disabled, stay here
    └── gate passes
         │  user clicks Confirm merge
         │  CONFIRM_MERGE_IMPORT { now, resolutions }
         │  reducer:
         │    1. applyConflictResolutions(plan0, resolutions) → plan1
         │    2. applyMergePlan(host, imported, plan1) → nextContainer
         │    3. append provenance relations for duplicate-as-branch ops
         │    4. clear mergeConflictResolutions, importPreview, importMode
         │    5. emit CONTAINER_MERGED with suppressed_by_* lists
         ▼
       [ready, container updated]
```

### 5.9 Cancel 経路

`CANCEL_IMPORT` は既存経路通り以下を reset:

- `importPreview` → null
- `importMode` → 'replace'（MVP 挙動）
- **追加**: `mergeConflictResolutions` → undefined（記憶しない）

conflict 未解決のまま Cancel すると `mergeConflictResolutions` は破棄され、次回 preview で空から再開される。これは **意図的な忘却** で、user session を跨いで resolution state を持ち越さない（file を再選択すると内容も変わりうるため）。

### 5.10 再 preview 時の挙動

同じ session 中に import file を再選択した場合:

- 新しい `SYS_IMPORT_PREVIEW` が `mergeConflictResolutions` を `{}` に **リセット**
- 新しい `EntryConflict[]` で conflict UI を再描画
- 前回の選択は **保持しない**（imported container が変わった可能性があるため）

これにより state の stale は構造的に発生しない。

### 5.11 型定義（v1 signature 予約）

本書は docs-only だが、contract 段階で確定する型の雛形を示す:

```ts
// features/import/conflict-detect.ts (新規予定)
export type ConflictKind = 'content-equal' | 'title-only' | 'title-only-multi';
export type Resolution = 'keep-current' | 'duplicate-as-branch' | 'skip';

export interface EntryConflict {
  imported_lid: string;
  host_lid: string | null;           // multi-host のとき null（代表未確定）
  host_candidates?: string[];         // multi-host のときのみ
  kind: ConflictKind;
  imported_title: string;
  host_title: string;
  archetype: string;
  imported_content_hash: string;
  host_content_hash: string;
  imported_body_preview: string;     // 200 char, normalized
  host_body_preview: string;
  imported_created_at: string;
  imported_updated_at: string;
  host_created_at: string;
  host_updated_at: string;
}

export function detectEntryConflicts(
  host: Container,
  imported: Container,
): EntryConflict[];

export function applyConflictResolutions(
  plan: MergePlan,
  resolutions: Record<string, Resolution>,
  conflicts: EntryConflict[],
): { plan: MergePlan; provenance_relations: Relation[] };
```

この型は contract 段階で pure helper spec として固定する（`merge-planner.ts` の既存 `MergePlan` を extend する形）。

## 6. 非対象

本章は v1 で **意図的に実装しない** 項目を明示する。将来拡張の境界線として機能する（canonical spec §8 と同様の位置づけ）。

### 6.1 Bulk conflict orchestration

「すべての conflict を自動ルールで一括解決」のような multi-step orchestration UI は v1 非対象。例:

- archetype 別一括（「TEXT はすべて keep-current、TODO はすべて duplicate」）
- 作成日別一括（「2025-01 以降の imported は全部 duplicate」）
- tag / folder 別一括
- 条件付き自動ルール（`if content_equal then skip else manual`）

v1 が許す bulk は `Accept all host` と `Duplicate all` の 2 個のみ（§4.4）。より複雑な orchestration が必要なら policy UI（Option B 相当 / §9.2）に引き上げる。

### 6.2 Multi-way merge

host + imported + common ancestor の 3-way merge は v1 非対象。

- PKC2 の Container には「共通祖先 container」の記録機構が存在しない
- 3-way merge には ancestor identity の契約（時刻 / id / chain）が必要で、別 spec 領域
- 2 container merge で実用要件は満たせる（export → edit → import の典型 flow）

### 6.3 Semantic merge

field 単位 / block 単位の意味論を考慮した merge は v1 非対象:

- title だけ採用 / body だけ採用 のような field cherry-pick
- markdown の heading / section 単位 merge
- textlog の log entry 単位 merge（`textlog.entries[]` の要素単位 append / overwrite）
- TODO の status / description / date の個別採用
- form archetype の key-value 単位 merge

これらは archetype 別仕様が必要で、archetype × field 数の組み合わせ爆発が発生する。v2+ で archetype-specific semantic merge を別 spec として策定する。

### 6.4 Attachment binary diff

attachment archetype の body は asset reference + meta JSON。binary 本体の diff は技術的に困難で v1 非対象:

- asset key（hash）一致 → content 一致で自動 dedup（既存 MVP）
- asset key 違い → 別 asset として扱う（duplicate-as-branch で両方残す）
- visual diff（image diff UI 等）は v2+ 以降の別テーマ

### 6.5 Textlog special-case merge

textlog は log entry の array を内部に持つため「imported の log 追加分だけを host に注ぐ」操作に需要があるが、v1 非対象:

- log-level append / dedup
- createdAt 昇順で自動マージ
- log flag の union / intersection

textlog の semantic merge は `docs/spec/body-formats.md` 側の archetype 契約に影響するため、本書単独では決められない。別 spec で扱う。

### 6.6 Global auto-resolution policy

user が policy を登録して「今後すべての merge で自動適用」する機能は v1 非対象:

- `keep-current-if-equal` のようなルール化
- regex / glob による title matching
- archetype 別 default 設定の永続化

これは設定 UI + persistence が必要で、merge 単体テーマを超える。

### 6.7 Revision-based conflict

imported の revision history を host に持ち込み、revision 単位で衝突解決する機能は v1 非対象:

- canonical spec §8.3 が `revisions を持ち込まない` と決めた経路を維持
- revision merge は snapshot remap、revision ordering、merge_session_id 拡張が前提
- これは §9.1 / §9.4 の将来拡張で別途扱う

### 6.8 Conflict 検出 policy の customization

title 正規化ルール / hash の選択 / archetype match 条件 の user customization は v1 非対象:

- 「title の大文字小文字を区別する / しない」trigger
- 「hash は SHA-1 に切替」等の algorithm 選択
- archetype 異なっても title 一致なら conflict とみなす mode

v1 は固定 rule（`normalizeTitle` + FNV-1a-64 + archetype 一致）のみ。customization は user value 対コストが合わず、偽陽性を減らす目的なら toggle 1 個で十分（§7.4）。

### 6.9 Conflict UI の readonly / historical / export viewer 対応

canonical spec §2.1 が readonly / historical / preservation phase で merge を許さない契約を既に持つため、conflict UI もこれらで **mount されない**（trigger が出ない）。追加ガードは不要。

### 6.10 canonical spec §8 との関係

本書は canonical spec §8 の決定を以下のように **refine する**（緩めず・破壊せず）:

| canonical §8 項目 | 本書 v1 での扱い |
|------------------|-----------------|
| §8.1 Per-entry 選択 UI（非対象） | **本書で解禁**（ただし最小 3 操作に絞り、host 破壊は許さない） |
| §8.2 Title / body hash 同一性判定（非対象） | **本書で解禁**（C1 = content-equal で活用） |
| §8.3 Revision 持ち込み（非対象） | 本書でも非対象（維持） |
| §8.4 Policy UI（非対象） | 本書でも非対象（維持）— 本書は per-entry UI であり policy UI ではない |
| §8.5 Staging container（非対象） | 本書でも非対象（維持） |
| §8.6 Schema migration（非対象） | 本書でも非対象（維持、schema mismatch は preview 前 reject） |
| §8.7 Folder structure semantic merge（非対象） | 本書でも非対象（維持） |
| §8.8 Bulk_id の container 越境保持（非対象） | 本書でも非対象（維持） |
| §8.9 Merge の undo（非対象） | 本書でも非対象（維持）— §9.1 merge_session_id と連携する v2 テーマ |

**緩める項目**: §8.1 と §8.2 の 2 項目のみ。§8.1 は「entry 単位 UI」の再定義、§8.2 は「content-hash 判定」の限定復活。いずれも canonical の core 不変条件（append-only / host 破壊禁止 / schema mismatch reject）は触らない。

### 6.11 §9 将来拡張との関係

canonical §9 の列挙と本書の関係:

| canonical §9 項目 | 本書 v1 | 将来（本書を受けた contract → implementation） |
|------------------|--------|----------------------------------------------|
| §9.1 Merge session id + 1-click revert | ― | 本書 v1 の `merge_session_id` metadata 用意で下地を作る |
| §9.2 Policy UI | 非対象 | 本書 v1 完了後に検討（本書は per-entry UI で代替） |
| §9.3 Content-based identity | **v1 で部分実装**（C1 判定に利用） | v2 で archetype 別 identity 拡張 |
| §9.4 Revision history 持ち込み | 非対象 | canonical 通り v2+ |
| §9.5 Bulk_id remap | 非対象 | §9.4 と連動 |
| §9.6 Folder semantic merge | 非対象 | §9.3 / §9.4 実装後 |
| §9.7 Staging container | 非対象 | 独立テーマ、本書の延長にならない |
| §9.8 Diff export | 非対象 | 独立テーマ |

本書は **§9.3（content-based identity）の最小採用** と位置づけられる。§9.2（policy UI）の代替として per-entry UI を選び、§9.1（session id）の足場だけ先行用意する形。

## 7. 推奨方針

### 7.1 実装に進む価値

**推奨: 実装する価値は高い**。ただし 4 段の pipeline を経由する（replace 系 S-26→S-29 と同じ運用）:

1. **docs-only（本書）** — minimum scope を確定（完了で本書 commit）
2. **behavior contract** — API / UI / invariance / error / gating / state interaction を条項化（別 spec 1 本 `docs/spec/merge-conflict-ui-v1-behavior-contract.md`）
3. **implementation** — pure helper `features/import/conflict-detect.ts` + reducer 2 case + renderer 1 section + action-binder 2 case + テスト 25 件前後
4. **post-impl audit** — 不変条件 + append-only 契約維持 + provenance 書き出し検証

v1 の推定 implementation 規模:

| 層 | 増分 | 備考 |
|---|-----|------|
| pure helper | `conflict-detect.ts` 新規 ~150 行、`merge-planner.ts` に `applyConflictResolutions` 追加 ~50 行 | 既存 `hash.ts`（S-22）を再利用 |
| core/types | `RelationMetadata` の kind 値拡張 1 行 | additive、schema bump 不要 |
| core/action | 新 action 2 種（`SET_CONFLICT_RESOLUTION` / `BULK_SET_CONFLICT_RESOLUTION`） | additive |
| adapter/state | AppState optional field 1 個、reducer 2 case + CANCEL / CONFIRM_MERGE 拡張 | 既存 case は no-op 継続 |
| adapter/ui/renderer | `renderMergeConflictList` 新関数、`renderImportConfirmation` からの呼び出し 1 箇所 | 既存 5 行サマリは無変更 |
| adapter/ui/action-binder | 2 case 追加 | |
| CSS | 無変更（既存 token 再利用） | §4.3 |
| tests | pure 12 + reducer 6 + UI 7 = 25 件程度 | |

bundle 増加見込み: +3〜4 KB JS（gzip +0.8 KB）、CSS +0 KB。

### 7.2 docs → contract → implementation の順が適切か

**適切**。理由:

- merge 系は既存 canonical spec との整合を厳密に要求するため、先に minimum scope を書いて canonical §8 / §9 と逐項マッピングするのが安全
- 実装に入る前に UI 要素（operations / gating / bulk shortcut）の取捨選択を確定すべき（実装後に削るのは PR / revert コスト高）
- replace 系（S-26 / S-27 / S-28 / S-29）で validated な pipeline なので、同じ進め方にすると supervisor / reviewer の認知コストも下がる

### 7.3 先に必要な前提

v1 実装に進む前に、以下は **前提として成立している**（本書執筆時点で確認済み）:

| 前提 | 根拠 | 状態 |
|------|------|------|
| `contentHash` helper 存在 | `src/core/operations/hash.ts`（S-22 で追加） | ✓ 利用可 |
| `RelationKind = 'provenance'` | `docs/spec/text-textlog-provenance.md`（H-8） | ✓ 定義済み |
| `Relation.metadata?` field | 同上 | ✓ 定義済み |
| `applyMergePlan` が pure | `features/import/merge-planner.ts`（Tier 3-1） | ✓ pure 維持 |
| `AppState.importMode` field | `merge-import-implementation.md` §2.1 | ✓ 既存 |
| schema mismatch gate | canonical §4.5 | ✓ 既存 |
| orphan auto-GC in merge path | `merge-import-implementation.md` §2.5 | ✓ 既存 |

**追加前提 なし**。v1 は既存のピースのみで組める。

### 7.4 偽陽性対策の v1.x 枠

§2.5 で触れた偽陽性（意図的な同名別 entry）について、v1 では fixed rule にする。v1.x で以下を additive 追加する余地を残す:

- `title-only match` 判定の **disable toggle**（preview UI に checkbox 1 個）
- `normalizeTitle` の strictness 2 段階（現行 = 連続空白 → 単一空白、strict = 大文字小文字区別）

これは v1 リリース後の運用 feedback 次第で判断する。追加しても contract は破壊されない additive 変更。

### 7.5 実装時のリスクと対応

| リスク | 対応 |
|-------|-----|
| conflict list が長大化（N=100+） | virtual scroll ではなく pagination（各 20 件 / Next ボタン）で対応、UI 実装で v1 cap を 200 件に |
| bulk shortcut で unintended 操作 | 無し（bulk は 2 種に絞り、skip bulk を含めない） |
| provenance relation 大量追加で relations[] 肥大 | duplicate-as-branch 件数分のみ追加、典型運用では 10 件未満 |
| `detectEntryConflicts` の O 計算量 | title map + hash map 構築で O(H + I)、100k entry までは実用域 |
| multi-host ambiguity で UI 複雑化 | 3 候補までに cap、超過は "+N more" 表示で済ませる |

### 7.6 scope から外す候補（明示的却下）

以下は本書の contract / implementation 段階でも追加 **しない**:

- conflict 1 件ずつの独立 modal（list 内で完結させる）
- conflict preview の expand / collapse animation
- conflict 検出 progress indicator（pure helper の 1 回走査で終わるため不要）
- conflict の並び替え UI（archetype 別 / C1 先 / title A-Z などは v2+）
- merge 実行後の結果 summary toast（既存 `CONTAINER_MERGED` event で十分）

### 7.7 実装前に確認すべき項目（軽量）

canonical §10 の前提条件チェックリストに相当する、本 v1 向けの軽量チェックリスト:

#### Spec 側（本書完了時に済む）

- [x] 本書 v1 が canonical §8.1 / §8.2 の「非対象」を解禁する論理を明示
- [x] canonical §9 との関係表を §6.11 に記載
- [x] 既存 provenance profile 拡張 1 個（`metadata.kind = 'merge-duplicate'`）を §5.4 に記載

#### Pure helper 側（実装前調査）

- [ ] `hash.ts` の `contentHashOfEntry(entry)` signature が archetype 非依存か（v1 は archetype 込みの hash を使うため、JSON.stringify → FNV の順序安定性を確認）
- [ ] `merge-planner.ts` の `MergePlan` 型が `applyConflictResolutions` で拡張可能か（field 追加で backward compatible か）
- [ ] `normalizeTitle` の pure helper が既存にあるか、無ければ `features/text/` に追加予定として記録

#### UI 側（実装前調査）

- [ ] 既存 `renderImportConfirmation` の DOM 構造で conflict list 挿入位置が明確に分離できるか
- [ ] `data-pkc-region="merge-conflicts"` を新規 selector として追加しても既存 selector と衝突しないか
- [ ] preview dialog の scroll 領域（溢れる conflict list 対応）が CSS で既に handle されているか

#### Reducer 側（実装前調査）

- [ ] `AppState.mergeConflictResolutions?` を optional で追加して既存 test が通るか
- [ ] `CANCEL_IMPORT` / `CONFIRM_MERGE_IMPORT` の reset 処理に 1 field 追加で regression が出ないか
- [ ] `SET_IMPORT_MODE { mode: 'merge' }` が `mergeConflictResolutions` を `{}` で初期化することで、mode 切替前後のテストに問題が出ないか

いずれも実装時 30 分以内に確認可能な軽量項目。追加 spec / 別調査は不要。

### 7.8 本書完了後の進行

本書 commit 後、以下の順で進める前提:

1. **supervisor review**: 本書の v1 scope が適切か、削減 / 拡張の判断
2. **behavior contract**（承認時）: 別 spec 1 本で API / UI / invariance を条項化
3. **implementation**: contract 通りに pure helper + reducer + UI + テストを 1 コミットで導入
4. **post-impl audit**: 不変条件チェック（host 不変 / append-only / provenance 正しく書かれる / schema gate 維持）
5. **manual 同期**（必要なら）: `docs/manual/07_保存と持ち出し.md` に conflict UI 節を追記

所要 commit 数は 4〜5 本程度。replace 系 S-26→S-29 と同規模。

### 7.9 推奨判断の結論

- **本書を canonical spec の補助 doc として commit する**
- supervisor が本書 v1 scope を承認した段階で contract 化（Step 2）に進む
- 承認前に実装着手しない（H-10 は canonical §9 の重量級 roadmap で、前段整理が必須）

## 8. Examples

以下 3 例は本 v1 UI が扱う典型ケース。各例で host / imported の初期状態、conflict UI が提示する内容、ユーザー選択後の container 結果を示す。

### 8.1 Example A: 単純な entry conflict（C1 = content-equal）

**Host container**:

```
entries:
- { lid: "e-001", archetype: "text", title: "Weekly Report",
    body: "# 2025-W14\n\n- Done ...",
    createdAt: "2025-04-07T09:00:00Z",
    updatedAt: "2025-04-07T09:00:00Z" }
relations: []
```

**Imported container**（export からの一部再 import）:

```
entries:
- { lid: "e-042", archetype: "text", title: "Weekly Report",
    body: "# 2025-W14\n\n- Done ...",  // ← 同一 body
    createdAt: "2025-04-07T09:00:00Z",
    updatedAt: "2025-04-07T09:00:00Z" }
```

**conflict 検出**:

- `archetype === 'text'` 一致
- `normalizeTitle("Weekly Report") === normalizeTitle("Weekly Report")` → 一致
- `contentHash(imported.e-042) === contentHash(host.e-001)` → 一致
- **分類: C1（content-equal）**

**conflict UI**:

```
#1 [TEXT] "Weekly Report" ✓ content identical
   Host    : 2025-04-07 09:00 / 2025-04-07 09:00 / "# 2025-W14\n↵\n↵- Done ..."
   Incoming: 2025-04-07 09:00 / 2025-04-07 09:00 / "# 2025-W14\n↵\n↵- Done ..."
   ● Keep current   ○ Duplicate as branch   ○ Skip
```

`● Keep current` が default で pre-selected。ユーザーはそのまま Confirm を押せる。

**結果**（default 採用 / Keep current）:

```
entries: [{ lid: "e-001", ... }]  // 変化なし、imported e-042 は merge から除外
relations: []
event: CONTAINER_MERGED {
  added_entries: 0,
  suppressed_by_keep_current: ["e-042"],
  suppressed_by_skip: []
}
```

host は完全に不変、意図せぬ重複が防がれる。

### 8.2 Example B: 二者択一（C2 = title-only）

**Host container**:

```
entries:
- { lid: "e-010", archetype: "text", title: "Plan A",
    body: "## Draft v1\n- Phase 1: research",
    createdAt: "2025-04-01T10:00:00Z",
    updatedAt: "2025-04-01T10:00:00Z" }
```

**Imported container**（他メンバーが独立に編集した版）:

```
entries:
- { lid: "e-777", archetype: "text", title: "Plan A",
    body: "## Revised\n- Phase 1: market survey\n- Phase 2: design",
    createdAt: "2025-04-01T10:00:00Z",
    updatedAt: "2025-04-15T14:00:00Z" }
```

**conflict 検出**:

- archetype + title 一致
- `contentHash` 不一致（body が違う）
- **分類: C2（title-only match）**

**conflict UI**:

```
#1 [TEXT] "Plan A" ⚠ title matches, content differs
   Host    : 2025-04-01 10:00 / 2025-04-01 10:00 / "## Draft v1↵- Phase 1: research"
   Incoming: 2025-04-01 10:00 / 2025-04-15 14:00 / "## Revised↵- Phase 1: market survey↵- Phase 2: design"
   ○ Keep current   ○ Duplicate as branch   ○ Skip
```

**default なし**（どの選択肢も未選択）。ユーザーが明示的に選ぶまで `Confirm merge` は disabled。

**シナリオ分岐**:

1. **ユーザーが `Keep current` 選択**（= host が最新と判断）:

   ```
   entries: [{ lid: "e-010", ... }]
   relations: []
   event: CONTAINER_MERGED {
     added_entries: 0,
     suppressed_by_keep_current: ["e-777"],
     suppressed_by_skip: []
   }
   ```

2. **ユーザーが `Duplicate as branch` 選択**（= 両方残す）:

   imported は新 lid（例: `m-1680000000-001`）で append され、provenance relation が追加される:

   ```
   entries:
   - { lid: "e-010", ... }  // host 不変
   - { lid: "m-1680000000-001", archetype: "text", title: "Plan A",
       body: "## Revised\n- Phase 1: market survey\n- Phase 2: design",
       createdAt: "2025-04-01T10:00:00Z",
       updatedAt: "2025-04-15T14:00:00Z" }  // imported を new lid で追加
   relations:
   - { id: "r-new-001", kind: "provenance",
       from_lid: "m-1680000000-001",  // derived (imported new)
       to_lid: "e-010",                // source (host)
       metadata: {
         kind: "merge-duplicate",
         match_kind: "title-only",
         detected_at: "2026-04-16T12:00:00Z",
         imported_title: "Plan A",
         imported_archetype: "text"
       }
   }
   event: CONTAINER_MERGED {
     added_entries: 1,
     added_relations: 1,
     suppressed_by_keep_current: [],
     suppressed_by_skip: []
   }
   ```

   ユーザーは後で両 entry の body を比較し、好きな方を手で保持・削除できる。provenance relation により「この 2 つは title が一致していた」ことが記録される。

3. **ユーザーが `Skip` 選択**（= 判断保留）:

   ```
   entries: [{ lid: "e-010", ... }]  // 変化なし
   relations: []
   event: CONTAINER_MERGED {
     added_entries: 0,
     suppressed_by_keep_current: [],
     suppressed_by_skip: ["e-777"]
   }
   ```

   意図は keep-current と同じ副作用だが、「host を残すと決めた」のではなく「今回は判断しない」という意思が event に記録される。

### 8.3 Example C: branch 化が必要な例（multi-host C2）

**Host container**（同名 entry が 3 件存在）:

```
entries:
- { lid: "e-100", archetype: "textlog", title: "Daily Log",
    body: "{ \"entries\": [{ \"id\": \"l-1\", \"text\": \"proj X note\", ... }] }",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-04-10T00:00:00Z" }
- { lid: "e-200", archetype: "textlog", title: "Daily Log",
    body: "{ \"entries\": [{ \"id\": \"l-2\", \"text\": \"proj Y note\", ... }] }",
    createdAt: "2025-02-01T00:00:00Z",
    updatedAt: "2025-04-11T00:00:00Z" }
- { lid: "e-300", archetype: "textlog", title: "Daily Log",
    body: "{ \"entries\": [{ \"id\": \"l-3\", \"text\": \"proj Z note\", ... }] }",
    createdAt: "2025-03-01T00:00:00Z",
    updatedAt: "2025-04-12T00:00:00Z" }
```

**Imported container**:

```
entries:
- { lid: "e-999", archetype: "textlog", title: "Daily Log",
    body: "{ \"entries\": [{ \"id\": \"l-9\", \"text\": \"new project\", ... }] }",
    createdAt: "2025-04-01T00:00:00Z",
    updatedAt: "2025-04-15T00:00:00Z" }
```

**conflict 検出**:

- archetype + title 一致
- host 側候補 3 件、`contentHash` 一致する host なし
- **分類: C2（multi-host ambiguous）**

**conflict UI**:

```
#1 [TEXTLOG] "Daily Log" ⚠ 3 host candidates
   Host candidates (3):
     - e-100 (2025-01-01 / 2025-04-10) "... proj X note ..."
     - e-200 (2025-02-01 / 2025-04-11) "... proj Y note ..."
     - e-300 (2025-03-01 / 2025-04-12) "... proj Z note ..."
   Incoming:
     e-999 (2025-04-01 / 2025-04-15) "... new project ..."
   ○ Keep current [disabled — ambiguous]
   ○ Duplicate as branch
   ○ Skip
```

`Keep current` は disabled（どの host を残すか曖昧）。ユーザーの選択肢は `Duplicate as branch` または `Skip` の 2 択。

**シナリオ**:

- **ユーザーが `Duplicate as branch` 選択**: imported を新 lid で append、provenance は **代表 host（最も新しい updatedAt を持つ e-300）** に向けて 1 本作成:

   ```
   entries:
   - e-100, e-200, e-300（全 host 不変）
   - m-1680000000-001（imported の new lid）
   relations:
   - { id: "r-new-002", kind: "provenance",
       from_lid: "m-1680000000-001",
       to_lid: "e-300",                  // 代表 host（最新 updatedAt）
       metadata: {
         kind: "merge-duplicate",
         match_kind: "title-only-multi",
         host_candidates: ["e-100", "e-200", "e-300"],
         detected_at: "2026-04-16T12:00:00Z",
         imported_title: "Daily Log",
         imported_archetype: "textlog"
       }
   }
   event: CONTAINER_MERGED { added_entries: 1, added_relations: 1, ... }
   ```

   multi-host の全候補 lid は `metadata.host_candidates` に記録され、後から関連 entry を辿れる。

- **ユーザーが `Skip` 選択**: imported は何もせず drop、host 3 件はそのまま。

### 8.4 Examples の範囲

以上 3 例で v1 UI の典型挙動をカバーする:

- **C1 default 採用**（Example A）— 重複防止の最も単純なケース
- **C2 明示選択**（Example B）— 異なる版の共存 or 取捨選択
- **multi-host ambiguous**（Example C）— 曖昧性のフォールバック

これ以外のケース（conflict 0 件 / bulk 操作 / cancel 経路 / schema mismatch）は既存 MVP 経路のテスト (`merge-import.test.ts`) で既にカバーされる範囲に含まれるため、本書では重複記載しない。

## 9. 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-16 | 初版（docs-only / H-10 の一部を Per-entry UI 最小形として先行策定） |

## 10. 位置づけサマリ

- **何**: Merge import の **entry 単位 conflict resolution UI** の v1 最小仕様
- **なぜ別テーマ**: canonical spec §8.1 / §8.2 が MVP 非対象にした per-entry UI / content-identity を、core invariant（append-only / host 不変）を破らずに復活させるため
- **どこまで**: C1（content-equal）/ C2（title-only）/ C2 multi-host の 3 分類、3 操作（keep-current / duplicate-as-branch / skip）、2 bulk shortcut
- **何をやらない**: accept-incoming（host 破壊）/ semantic merge / multi-way / revision 持込 / policy UI / staging / binary diff
- **次のゲート**: supervisor review → behavior contract → implementation → audit → manual sync（4 段 pipeline、replace 系と同じ）
- **依存**: 既存 `hash.ts` / provenance Relation / merge-planner MVP / schema mismatch gate — いずれも実装済みで v1 は additive のみ

本書は docs-only の先行設計であり、実装に進むかは supervisor 判断に委ねる。

---

**Spec drafted 2026-04-16.**
