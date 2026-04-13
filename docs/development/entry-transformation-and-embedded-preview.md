# Entry transformation & embedded preview — 親 spec

本 doc は PKC2 の「文書構造変換」と「埋め込み参照モデル」を同時に拡張する
大型案件の親 spec。実装は複数の slice に分割し、各 slice は単独で merge
可能にする。

**本 spec の役割は slice 境界と共通モデルを固定することのみ。** 変換規則の具体は
`textlog-text-conversion.md` に、embed pipeline と cycle guard の具体は
`embedded-preview-and-cycle-guard.md` に分ける。実装コードは含まない。

## 1. 短い結論

PKC2 に以下 5 件を段階導入する:

1. TEXTLOG の複数ログを選んで TEXT エントリに変換
2. TEXT エントリを TEXTLOG のログ行に変換
3. TEXT / TEXTLOG / TODO の本文内プレビュー埋め込み (embed)
4. TODO / FOLDER の description を markdown 化
5. ペイン再トグル shortcut (独立小案件)

これらは見た目の改善ではなく、PKC2 の「embed 参照モデル」と「archetype 間
の構造変換モデル」の拡張である。順序を誤ると後戻りが大きいため、slice
を先に固定する。

**現状の重要な前提**: transclusion (`![x](entry:<lid>)`) は slice 5-B で
既に実装済み (`src/adapter/ui/transclusion.ts`)。TEXT / TEXTLOG を対象に
depth ≤ 1 / self-embed 遮断 / cycle fallback が入っている。本案件はこれを
破棄せず **surface 拡張**として進める。

## 2. 背景・問題

現状 (survey した実装):

- transclusion は TEXT / TEXTLOG の 2 archetype のみ。TODO は embed 対象外で、
  `![x](entry:<todo-lid>)` は link fallback に degrade する
  (`src/adapter/ui/transclusion.ts:159-161`)。
- TODO description は plain text として `textContent` で描画される
  (`src/adapter/ui/todo-presenter.ts:54-59`)。markdown 非対応。
- FOLDER body は plain `<pre class="pkc-view-body">` で描画される
  (`src/adapter/ui/folder-presenter.ts:16-18`)。markdown 非対応。
- TEXTLOG の個別ログ行を複数選択して新しい TEXT を起こす導線がない。
- TEXT → TEXTLOG の逆変換もない。
- sidebar / TOC などの pane を閉じた後、key 一発で戻す shortcut がない。

これらは一見独立した UI 改善に見える。しかし実質は以下 2 つの拡張を共有する:

- **archetype 間の構造変換 (transformation)**: ある archetype の内部要素を
  別 archetype の内部要素に写す pipeline。
- **embed 参照モデルの surface 拡張**: 現状 TEXT + TEXTLOG の 2 archetype に
  限定されている embed 対象を、TODO まで広げる。同時に TODO / FOLDER
  description の markdown 化で、embed 候補の土台を揃える。

順序を誤ると、embed と変換が別々の前提で作られて後で矛盾する。本 spec で
共通 model を先に固定する。

## 3. ユーザ価値

- **ログから原稿**: 走り書きの TEXTLOG から日付見出し付きの原稿を機械的に
  起こせる。
- **原稿からログ**: 章を持つ TEXT を章単位で TEXTLOG のログ行に落とせる。
- **プレビュー埋め込み**: TEXT / TEXTLOG / TODO の中身を別のエントリに差し
  込める。掘り下げ先を最新状態で参照できる。
- **TODO/FOLDER markdown**: task list / checkbox / link を description 内で
  使える。TODO description 自身を embed 対象にもできる。
- **pane 再トグル**: 閉じた pane を key 一発で戻せる。

## 4. 最小スコープ

**親 spec が扱う範囲**:

- 全 slice 共通の用語・モデル
- slice 境界と順序
- 各 slice の 1 行サマリ
- 互換性影響の総まとめ
- 独立小案件 (pane shortcut) の位置づけ

**親 spec が扱わない範囲**:

- 変換規則の具体 → `textlog-text-conversion.md`
- embed 展開 pipeline / cycle guard の具体 → `embedded-preview-and-cycle-guard.md`
- UI mockup / 文言 / 配色
- 実装コード

## 5. やらないこと

- TEXT → TEXTLOG の段落自動分割 (手動 or heading 単位のみ)
- TOC への TODO / FOLDER description 反映 (後続)
- FOLDER description を embed 対象化 (後続)
- depth ≥ 2 の embed (depth ≤ 1 不変を維持)
- embed の中で別 embed を描く (link fallback 維持)
- 変換後の backlink を relation として永続化 (将来拡張)
- 多言語化方針は本件では凍結。`docs/development/multilingual-spec-*.md` 側で別管理

## 6. 設計の方向性

### 6.1 用語

- **変換 (transformation)**: archetype A の entry (または sub-entry) を
  archetype B の entry (または sub-entry) に写す pipeline。原則として
  非可逆。新しい entry を生成する (in-place 更新ではない)。
- **embed**: `![x](entry:<lid>)` の形で、本文中に他 entry の render 結果を
  差し込む。現行の transclusion と同一。
- **link**: `[x](entry:<lid>)` の形で、別 entry への navigation。
- **subset closure**: HTML clone export で `buildSubsetContainer` が計算
  する到達閉包。embed / link / asset の参照先を辿って集めた entry 集合。

### 6.2 embed surface の拡張方針

現行の depth ≤ 1 不変は変えない。embed 対象の archetype を増やすだけ。

| archetype         | link | 現 embed | 提案 embed                            |
|-------------------|------|----------|---------------------------------------|
| TEXT              | ✅   | ✅       | ✅                                    |
| TEXTLOG           | ✅   | ✅       | ✅                                    |
| TODO              | ✅   | ✅ (S2)  | ✅ (status + date + markdown desc)    |
| FOLDER            | ✅   | ❌       | ❌ (Slice 3 は description markdown のみ) |
| attachment / form | ✅   | ❌       | ❌                                    |

embed 実装は既存 `expandTransclusions()` に TODO branch を追加する形。
新規 pipeline は作らない。

### 6.3 archetype 間 markdown 化方針

| archetype          | viewer render          | editor          | embed 対象              |
|--------------------|------------------------|-----------------|-------------------------|
| TEXT               | markdown (既存)        | textarea        | ✅                      |
| TEXTLOG            | per-row markdown (既存)| per-row textarea| ✅                      |
| TODO description   | **plain → markdown**   | textarea 維持   | ✅ (rendered desc のみ) |
| FOLDER description | **plain → markdown**   | textarea 維持   | ❌ (後続)               |

editor 側は触らない。viewer 経路のみ差し替える。既存 detail-presenter
registry パターンに素直に乗る。

### 6.4 構造変換 pipeline の共通形

どの方向の変換も以下に収める:

1. **selection**: 変換元の粒度を確定 (log 行の範囲 / TEXT の章境界)
2. **preview**: 変換結果の dry-run を表示 (非破壊)
3. **commit**: 新規 entry を生成し、既存 `CREATE_ENTRY` 系 action を発火
4. **backlink**: 元 entry と新 entry の双方向参照を本文内に挿入 (link のみ、
   relation 永続化は将来)

reducer / state shape は拡張しない。選択状態は既存 multi-select 基盤に乗せる。

### 6.5 cycle guard の一本化

現行 transclusion に cycle guard がある (`src/adapter/ui/transclusion.ts`)。
今後:

- embed の cycle guard は `embedded-preview-and-cycle-guard.md` に集約
- visited set + depth limit + self-embed 遮断 + 可視 placeholder を 1 箇所
- `buildSubsetContainer` の iteration cap
  (`MAX_REF_ITERATIONS=10000`, `MAX_ANCESTOR_DEPTH=32`) は独立した保険
  として維持 (別レイヤの別責務)

## 7. リスク・未確定事項

- **TODO embed の描画粒度**: status のみ / date のみ / full の 3 段階を出すか。
  初期案は full のみ。
- **FOLDER / TODO description markdown 化の互換リスク** (Slice 3 実装済):
  既存 plain text に `#`、`---`、`[...](...)`、リスト記号 (`- `) などが
  含まれている場合、viewer 描画が markdown として再解釈される。editor
  側は従来どおり textarea なので raw 文字列は変化しない。migration は
  意図的に行わない (renderable になるだけで破壊的ではなく、ユーザが
  raw を確認したいときは edit に入ればよい)。衝突報告があれば
  個別対応する。
- **TEXTLOG → TEXT の backlink 形**: 元 log 行の fragment
  (`entry:<lid>#log/<id>`) を各 log セクション末尾に貼る案。doc 末尾にまとめる
  案との比較は補助 spec 1 で決める。
- **buildSubsetContainer の TODO body 走査**: 現在 TEXT body と TEXTLOG row
  text のみ scan (`src/features/container/build-subset.ts:101-116`)。TODO
  description を embed 対象化すると scan 範囲拡張が必要。slice 2 と連動。
- **TEXT → TEXTLOG の「章」定義**: ATX heading (`#` または `##`) 単位を採用
  予定。heading 0 の TEXT は「単一 log 行として登録」。
- **非可逆性の明示**: 変換 UI 上で「新規 entry が作られる / 元 entry は
  変更されない」と必ず明記。
- **pane 再トグル shortcut のキー衝突**: 既存 keydown 優先度
  (`docs/development/text-textlog-editing-ux-consolidation.md`) と衝突しない
  キーを選ぶ必要あり。候補は `Ctrl+\` / `Ctrl+Shift+\`。

## 8. 将来拡張の余地

- backlink を semantic relation として永続化 (関係グラフで由来を辿れる)
- depth ≥ 2 の embed (opt-in、depth インジケータ表示)
- FOLDER description を embed 対象化
- heading 単位の backlink 自動同期 (TEXT 側の heading 編集が元 log の
  backlink に追随)
- multi-TEXTLOG への分配変換 (TEXT の章を複数 TEXTLOG に分配)
- 名前付き selection (複数ログ選択を保存して再利用)

## 9. Slicing plan

以下の順序で独立 slice として導入。各 slice は単独で merge 可能にする。

### Slice 1 — spec 確定 (本 doc)

本 doc + 補助 spec 2 本の merge。実装なし、docs のみ。

### Slice 2 — embed 対象の拡張 (TODO) + cycle guard 正式化

- 既存 `transclusion.ts` に TODO branch を追加 (surface 拡張のみ)
- placeholder 文言を統一 (`cycle` / `self` / `missing` / `archetype` / `depth`)
- `buildSubsetContainer` に TODO description scan を追加 (TODO embed が
  closure に正しく含まれるようにするため)
- 新規 tests: TODO embed / TODO-cycle / archetype fallback
- **依存なし**。先に入れる動機は「変換結果に embed を使うケースがあるため、
  embed 意味論を先に固定する」。

### Slice 3 — TODO / FOLDER description の markdown 化 (**実装済み**)

- `todo-presenter` / `folder-presenter` の viewer path を
  `renderMarkdown()` + `expandTransclusions()` + `resolveAssetReferences()`
  に接続。`hasMarkdownSyntax()` がヒットしたときだけ markdown 描画し、
  plain 1 行はそれぞれ `<span>` / `<pre>` の従来 DOM を残して compat を
  維持する。
- TODO embed 側 (`transclusion.ts::renderTodoEmbed`) も description を
  markdown 化。`embedded: true` + `embedChain` を引き継ぐので、description
  の中で ancestor を embed すると Slice 2 の `cycle`/`depth` 判定が働く。
- editor は textarea 維持 (raw 保存)
- `buildSubsetContainer.collectScannableBodies` に FOLDER branch を追加
  (TODO は Slice 2 で済み)。folder description 内の `entry:` / `asset:`
  参照も selected-only HTML export の closure に含まれる。
- plain text 互換: `hasMarkdownSyntax()` が誤検知しない限り従来出力を
  維持。`#`、`---`、`[...](...)` 等を含む plain 文は markdown render に
  切り替わる — **これは意図的**で、migration は行わない。
- **依存**: Slice 2 (TODO embed 経路が 1 本化されているほうが test 境界が
  明確)
- **TOC 対象外**: TODO/FOLDER description の heading は TOC に載せない
  (後続 slice の判断にゆだねる)。

### Slice 4 — TEXTLOG → TEXT 変換

- TEXTLOG viewer にログ行 multi-select UI (選択モード制御)
- 「Selected logs → new TEXT」action (TEXTLOG 内 toolbar)。Data menu は
  汚さない
- `features/textlog-to-text.ts` (純粋関数)
- preview modal → commit (`CREATE_ENTRY` 相当)
- backlink 形は補助 spec 1 で確定
- **依存**: Slice 2 (変換後の TEXT に TODO embed や TEXTLOG embed が含まれ
  たときの意味論が確定している必要あり)

### Slice 5 — TEXT → TEXTLOG 変換

- TEXT viewer に「このエントリを TEXTLOG に流す」action
- 分割単位: heading (ATX `#` / `##`) または手動 (`---`) のみ
- 投入先: 新規 TEXTLOG / 既存 TEXTLOG append
- `features/text-to-textlog.ts`
- **依存**: Slice 4 と独立だが、UI 語彙を合わせるため後続推奨

### Slice 6 — pane 再トグル shortcut (独立小案件)

- 親 spec ではスコープ外扱い
- 閉じた sidebar / TOC を key 一発で戻す
- **依存ゼロ**。Slice 1〜5 のいつでも入れられる
- 本 spec では位置づけのみ固定、詳細 doc は別紙

### 並び順の根拠

- 2 → 3 の順: embed 経路が 1 本化された状態で markdown 差し替えをすると
  test の境界が明確
- 2 → 4 の順: 変換結果に embed を埋める需要があるため、embed 意味論を先に固定
- 4 → 5 の順: 使用頻度が高い (ログから原稿)。TEXT → TEXTLOG は用途限定
- 6 は完全独立。user の都合で割り込み可

## 10. 互換性影響まとめ

| slice | 既存データ | 既存 reducer action | 既存 UI                               | migration |
|-------|------------|---------------------|---------------------------------------|-----------|
| 1     | 影響なし   | 影響なし            | 影響なし                              | —         |
| 2     | 影響なし   | 影響なし            | `![](entry:<todo>)` の意味が link→embed | 不要    |
| 3     | raw 維持   | 影響なし            | TODO/FOLDER 表示が変わる可能性        | audit 要  |
| 4     | 新規 entry | `CREATE_ENTRY` 利用 | TEXTLOG viewer に選択モード追加       | 不要      |
| 5     | 新規 entry | `CREATE_ENTRY` / `APPEND_LOG` | TEXT viewer に action 追加    | 不要      |
| 6     | 影響なし   | 影響なし            | 新規 shortcut                         | 不要      |

いずれも既存 data schema を変更しない。raw body 文字列の互換性は完全に保つ。

## 11. 参照 docs

本 spec は以下を補完する。上書きしない:

- `docs/development/textlog-viewer-and-linkability-redesign.md` — TEXTLOG
  ref / transclusion の土台 (6 軸を `TextlogDoc` に統合した spec)
- `docs/development/selected-entry-html-clone-export.md` — subset closure、
  reachability。Slice 2 / 3 で scan 範囲を拡張する箇所
- `docs/development/selected-entry-export-and-reimport.md` — ZIP 再インポート
- `docs/development/markdown-phase2.md` — markdown link hardening
- `docs/development/todo-view-consistency.md` — TODO 表示一貫性
- `docs/development/folder-structure-restore.md` — FOLDER 構造
- `docs/development/text-textlog-editing-ux-consolidation.md` — keydown
  優先度 (Slice 6 shortcut の衝突確認に使用)

同時作成する補助 spec:

- `docs/development/textlog-text-conversion.md` — Slice 4 / 5 の詳細
- `docs/development/embedded-preview-and-cycle-guard.md` — Slice 2 / 3 の詳細

