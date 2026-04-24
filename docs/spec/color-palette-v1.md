# Color Tag Palette v1 — Fixed ID List (docs-only)

## 1. Purpose / Status

**docs-only、minimum-scope、additive**。`color-tag-data-model-v1-minimum-scope.md` §4.3 で「v1 palette は 10 色以下、具体 ID は次 slice で fix」として予約されていた palette ID fixed list を本書で確定する。Color tag の **Slice 1**(Data model の直下、parser / Saved Search / UI 実装の前提)に相当する。

- **コード変更ゼロ**。Color tag の実装 slice(Slice 2-4)が着手するときの **ID と意味分担の判断基準**
- data model 本体は変更せず、**値空間のみ** を固定する
- UI の label 規約 / picker / 色バー / chip 等は既に `ui-vocabulary-tag-color-relation.md` §3.2 で固定済み。本書はその "具体 ID 値" を埋める役割
- 本書が固まれば、以降の
  - `state.colorTagFilter: Set<ColorTagId>` の型
  - Saved Search `color_filter?: ColorTagId[]`
  - `color:<id>` parser の値空間
  - palette swatch UI
  のいずれも揺れずに進められる

Status: **accepted、fixed list v1**(2026-04-24)。本書は Color tag 全体を「実装済み」とは主張しない(§7 / §9 / §10 参照)。**palette ID の値空間のみが確定**、schema / reducer / UI はいずれも未実装で、関連 Known limitations(`Color tag is spec-only`)は継続。

参照(先行 docs):

- `./color-tag-data-model-v1-minimum-scope.md` — Color tag data model(§4.3 で本書を予約)
- `./tag-color-tag-relation-separation.md` — 概念分離(§3.2 Color tag)
- `../development/ui-vocabulary-tag-color-relation.md` — UI label 規約(「カラー」/「Color」)
- `./search-filter-semantics-v1.md` — 検索フィルタ軸 5 本(Color は軸 4、OR、`color:` 予約)
- `./schema-migration-policy.md` — additive 追加の扱い

---

## 2. Scope

### 2.1 In scope

- **v1 palette ID の固定リスト**(lowercase ASCII、`[a-z][a-z0-9-]*`、string literal union 化できる形)
- **各 ID の英語 label / 日本語 label**(UI tooltip / dev docs / code 用)
- **意味過積載を避けるためのガイダンス**(data model §5 の UI 側再確認)
- **a11y 方針**(色覚多様性 / theme / 実 HEX は後続 slice で確定する前提)
- **将来 palette 拡張時の互換ルール**(additive、削除 / rename 禁止の再確認)
- **下流 slice で解凍される contract**(parser / Saved Search / UI picker / sidebar bar)

### 2.2 Out of scope

- **具体 HEX 値 / RGB / CSS token**(theme 側で調整する前提、本書は ID と意味のみ)
- **light / dark / high-contrast theme の色値差分**
- **palette editor / user-defined color**(fixed palette 以外はユーザ拡張禁止、data model §2.2 と整合)
- **multi-color per entry**(1 entry 1 color 不変)
- **gradient / hue shift / animation**
- **categorical relation → Color tag 自動変換 migration**(data model §7.3 と整合)
- **実装**(reducer / action / presenter / CSS / parser / Saved Search writer-reader いずれも)
- **Tag 側の変更**(本書は Color tag 単独)
- **manual 更新**(実装着地後に改めて slice を切る)

### 2.3 Invariants

- data model 側の **§3 schema / §4.1-4.5 ID 戦略 / §5 semantics / §7 compatibility** は **不変**。本書は §4.3 の "v1 palette は 10 色以下、次 slice で fix" を埋めるだけ
- 既存 `Entry` / `Container` / `Relation` / `Revision` / `Assets` schema に影響なし
- 既存 `RelationKind` / `entry.tags` / filter 既存 4 軸 / Saved Search 既存 schema 一切変更なし
- `schema_version` は 1 のまま

---

## 3. Fixed palette (v1)

### 3.1 ID list

v1 で許される `ColorTagId` は以下の **8 値**。TypeScript 表現:

```ts
type ColorTagId =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'gray';
```

加えて「カラー未指定」の UI 表現は palette ID ではなく `entry.color_tag === null | undefined` で data model 側が表現する(data model §3.3、本 palette の要素ではない)。picker UI 上は "なし / None"(`×` マーク or 空円)として別枠で出す想定。

**選定方針**:

- 色相環(hue wheel)上で視覚的に離れている 6 系統(**red / orange / yellow / green / blue / purple**)を確保
- 柔らかいフォーカス表現として **pink** を 1 枠(red と彩度で差別化、tritanopia で yellow と混同しにくい位置)
- 彩度ゼロ側の muted 表現として **gray** を 1 枠(palette から外すと "薄い主張" が表現不能になる)
- 合計 8 枠。picker の swatch が 1 行に並びやすく、"なし" を含めても 9 要素で視認上バランスが取りやすい(data model §4.3 の「10 色以下」制約を満たす)

### 3.2 Vocabulary table

UI 実装時の label 正本。英語 label は tooltip / dev tool / CSV header、日本語 label は picker tooltip / manual 本文 / トラブルシューティングで使う。**picker の個別色に label 文字列は併記しない**(`ui-vocabulary-tag-color-relation.md` §3.2 の方針を尊重、色で選ぶ UX)— tooltip に日本語 label が出るだけ。

| ID | English label | Japanese label | Hue 系統 | 使い分けの想定(強制しない、§4 参照) |
|---|---|---|---|---|
| `red` | Red | 赤 | 暖色・高彩度 | 強い注目。**必ずしも "エラー" ではない** |
| `orange` | Orange | オレンジ | 暖色 | 暖かい注目 / 作業中 |
| `yellow` | Yellow | 黄 | 暖色・高輝度 | ハイライト / 目印 |
| `green` | Green | 緑 | 寒色寄り中性 | 新鮮 / 進行中。**必ずしも "完了" ではない** |
| `blue` | Blue | 青 | 寒色 | 落ち着いた参照 / 下書き |
| `purple` | Purple | 紫 | 寒色・高彩度 | 創造 / 特別扱い |
| `pink` | Pink | ピンク | 暖色・低彩度 | 柔らかい注目 / 一時的ピック |
| `gray` | Gray | グレー | 無彩色 | 弱め / 後回し / 済み(薄い主張) |

**備考**:
- 複数形は **日本語は単複区別なし**(`red` = "赤")
- UI tooltip の文面は「カラー: 赤」の形で統一(`ui-vocabulary-tag-color-relation.md` §3.2 picker 見出し規約の延長)
- dev CSV / log は内部 ID を露出してよい(`color_tag=red` のまま)
- picker swatch は丸 / 四角いずれも UI 実装 slice で選ぶ(本書は形状を固定しない)

### 3.3 Considered but not in v1

以下は **検討したが v1 palette から外した**。additive に追加可能(§7)なので future slice で入れる余地を残すが、v1 の ID にはしない。

| ID 候補 | 見送り理由 |
|---|---|
| `brown` | 暗めの赤 / 暗めのオレンジと見分けづらく、small swatch で CVD(色覚多様性)下の識別性が下がる。"earth tone" 用途は現状 `gray` で代替可 |
| `cyan` | 青と緑の間の中間色で、tritanopia / deuteranopia で blue に潰れやすい。必要な場合は `blue` と `green` の並置で十分カバー可 |
| `teal` | cyan と同じく blue-green で CVD 上の近接色。blue / green どちらかと混同しやすい |
| `lime` | green と黄緑で視覚近接、`green` と `yellow` の並置で代替可 |
| `violet` | `purple` と視覚的にほぼ同義。片方で十分、ユーザの認知負荷を下げるため single に |
| `magenta` | `pink` + `purple` の中間色。片方で十分 |
| `black` | 背景 / theme によっては前景そのもの、"色で目立たせる" 用途に不向き(data model §5 視覚フォーカス原則と衝突) |
| `white` | 同上。UI 上は "色なし" と視覚的に衝突する |
| `none` / `default` | ID ではなく「未指定」は data model §3.3 の `null` / 欠落で表現する |

v1 で 8 色に絞ったことで:

- picker swatch が 1 行で並べやすい
- a11y 検証の対象が 8 色に絞れる(hue pair の distinction matrix が 8×8)
- 実装 slice で theme HEX 調整する対象が 8 色で済む

**追加の入り口**: 将来 `brown` / `cyan` 等をどうしても入れたい需要が出た場合は、data model §4.4(palette additive 拡張)+ 本書の §7 に沿って v1.x で ID を 1 つずつ足せる(旧 reader 互換は `color-tag-data-model-v1-minimum-scope.md` §4.5 で担保済み)。

---

## 4. Semantic guidance(再確認)

**Color tag は意味分類ではなく視覚フォーカス**。本書で palette ID を固定することで、将来の UI / 検索 / Saved Search が ID の値空間を信頼できるようになるが、**意味そのものは固定しない**。運用規範は以下で、data model §5 の再確認:

- **色に業務意味を 1 対 1 で縛らない**
  - `red = エラー` ではない。赤は "今日 触っているエントリ" にもなれば "未レビュー" にもなれる
  - `green = 完了` ではない。Todo の完了状態は `entry.body.status = 'done'`(TODO archetype の内部状態)で表現、Color tag とは独立軸
  - `yellow = 警告`、`blue = 情報` のような一般 UI 慣習にも **引きずられない**
- **業務意味は別軸が担う**:
  - 自由文字列の意味分類 → `entry.tags[]`(Tag)
  - 所属先 entry → `categorical relation`
  - 進行状態 → Todo status / textlog / archetype 固有フィールド
  - 期日 / 時系列 → Todo date / `temporal relation`
  - 検索 / Saved Search の条件 → `search-filter-semantics-v1.md` の 5 軸
  - Color tag は **これらの上に重ねる "視覚的ピックアップ" の薄い補助軸** でしかない
- **ユーザ個人の運用規範**:
  - "今日触る → pink"、"要レビュー → yellow" のような **個人運用** は OK(ユーザ自身の視覚メモ)
  - 組織 / プロジェクト全体で色を強制する運用も **禁止ではない** が、data model 側は強制しない(Color tag を使わずに運用する自由を残す)
- **アンチパターン(強く推奨しない)**:
  - ❌ 色に優先度 P1/P2/P3 を 1 対 1 で縛る(palette が 8 色しかなく、優先度が 10 段階になった瞬間に破綻する)
  - ❌ 色に締切 1-3 日 / 4-7 日 / 8 日以上 を 1 対 1 で縛る(日付は動的、色は静的)
  - ❌ 色にチーム A / B / C を縛る(組織は Tag か categorical relation の領分)
  - ❌ `red` を "削除予定" に使う(削除は操作そのものが存在、色に代弁させない)
- これらの規範は data model では強制できないため、**UI tooltip / manual / picker 文言** で伝える(`ui-vocabulary-tag-color-relation.md` §3.2 で "意味を過積載しないでください" と書く)

---

## 5. A11y policy

### 5.1 原則

- **色だけに意味を依存しない**。色は補助、意味は label / tooltip / text / selected state 等 **非色の手がかり** と併用して伝える
- **WCAG 2.1 AA** を UI 実装 slice の目標にする(text の contrast 4.5:1、icon / graphical element の 3:1)— 具体 HEX は本書では固定せず、実装 slice + theme 側で調整
- **palette ID は固定、色値は theme 側で調整可能**(data model §4.1、theme 変更 / high-contrast / dark / light で色を変えても ID が不変)
- **色覚多様性を考慮した hue 選定**(§5.2)

### 5.2 palette 選定の前提

§3.1 の 8 色は以下の a11y 前提で選定済み:

- **hue の間隔を確保**:暖色 4(red / orange / yellow / pink)と寒色 3(green / blue / purple)+ 無彩色 1(gray)に分散、連続 hue が 2 つ並ばないよう pink が red と purple の間、orange が red と yellow の間に位置
- **deuteranopia / protanopia**(緑・赤系の区別が困難)への配慮:
  - red ↔ green は色相差 + 明度差で区別(UI 実装時は lightness を差別化)
  - pink は **red との彩度差** で区別(pink は低彩度の高明度、red は高彩度)
  - orange は red とも yellow とも **明度で離す**
- **tritanopia**(青・黄系の区別が困難)への配慮:
  - blue ↔ yellow は大きな hue 差 + 明度差で区別
  - cyan / teal / lime を除外したのはこの軸の混同を減らすため(§3.3)
- **全 CVD 共通**:全 8 色を **pairwise に違和感なく区別** できる前提で選定、ただし最終検証は実装 slice で palette simulation する(Coblis / Sim Daltonism 相当の tool で確認)

### 5.3 UI 実装時の追加要件(次 slice 以降)

palette の具体 HEX / theme token / CSS を決める slice で、以下を満たすことを要請:

- **swatch は色だけでなく形状 / border / selected state を持つ**
  - 枠線 1 px(theme border color)で swatch 境界を視覚化
  - selected state は check mark / 枠の太さ変化 / halo で **色以外の手がかり** を併用
  - hover state も色以外(scale / shadow / ring)で表現
- **tooltip 必須**:swatch hover で日本語 label("赤" / "オレンジ" 等)を 1 秒以内に出す
- **aria-label 必須**:swatch button の `aria-label="カラー: <label>"`、picker の role / aria-checked を WAI-ARIA radio group に合わせる
- **"なし" の視覚表現**:空円 + 斜線(`⊘`)などで color 未指定を色以外でも表現
- **sidebar 色バー**:4 px 幅の左端バー、幅だけで視覚キューが成立する(色覚多様性で hue が区別できなくても "何らかのカラー付き" は識別できる)
- **dark / light theme**:同じ ID で theme ごとに色値を変えてよい、ただし
  - `red` が light / dark で赤系列から外れる変換は禁止(ID の semantics を壊す)
  - contrast と彩度を theme ごとに調整してよい
  - high-contrast theme は contrast 強化のため彩度を上げる / 明度差を広げる
- **重ね合わせ**:swatch や色バーに文字を重ねる場合、文字色は必ず contrast を満たす側を選ぶ(色で fg / bg を決め打ちしない)

**本書はこれらの要件を "要請" として明記**。具体 HEX / CSS token / theme 差分は **次 slice**(= 実装 slice)で確定し、その slice で a11y pairwise 検証レポートを添付する前提。

---

## 6. UI usage notes(確認)

`ui-vocabulary-tag-color-relation.md` §3.2 を **正本** とし、本書は再確認のみ:

- **sidebar**: 行の左端に 4 px 幅の色バー。palette `gray` も含めて **8 色とも** バー表示、バーの有無で Color 付与の有無が分かる。`gray` は "色バーあり(薄灰)" であって「未指定」とは **別** — 未指定は色バー自体なし
- **detail**: ヘッダ左端のアクセントライン、またはヘッダ背景に subtle tint(透明度を高めに)
- **picker**: 小さな palette panel(**8 swatch + "なし"** の丸 `⊘`)= 9 要素、1 行 or 3×3 レイアウトいずれも可
- **label**: picker 見出しは **"カラー"** 一択、個別 swatch 下のテキストは出さない(色で選ぶ UX、tooltip で日本語名を補完)
- **filter バー**: 「カラーで絞る」/「Color」の行に **同じ 8 swatch**(+ "なし" の OR 分岐は Slice で判断)
- **禁止 / 避ける語**:
  - Color tag を単に "タグ" と書かない(Tag と混同)
  - 色に "優先度" / "締切" / "チーム" 等の業務意味を UI label / tooltip で重ねない
  - "カラータグ" を UI の主 label にしない(本文説明で "Color tag(カラー)" と 1 度書けば十分)
- **chip / badge**: Color 自体は chip として **表示しない**(Tag と見分けがつかなくなる)。表現は "色バー" / "アクセント" / "picker" のみ

---

## 7. Compatibility / additive extension

### 7.1 既存 container / export / import への影響

- 本書は **ID 値空間のみ** を固定し、schema は触らない
- 既存 container に `entry.color_tag` が存在しない(v2.1.1 時点では未実装)ため、既存 data への影響はゼロ
- 将来 Color tag が実装されて値が入り始めても、未知 ID のフォールバックは data model §3.3 / §4.5 に従う

### 7.2 palette 追加時のルール(future v1.x)

- **追加は additive**(新しい ID を追加しても既存 ID の意味は変わらない)
- 追加時は以下を同じ PR で更新する:
  1. 本書 §3.1 ID list に TypeScript literal を追加
  2. 本書 §3.2 vocabulary table に 1 行追加
  3. 本書 §3.3 Considered table から該当 ID を削除(入選した扱い)
  4. 実装側(`type ColorTagId` の定義 / theme HEX / picker swatch)を同時に更新(data と UI は lockstep)
- **schema_version bump は不要**(additive、data model §7.1 と整合)
- 追加時に **a11y pairwise 検証** を再実施(新 ID と既存 8 色の識別性、CVD シミュレーション)

### 7.3 palette 削除は禁止

- data model §4.4 の通り、**既存 ID を palette から外すと旧 entry が "未知 ID" にフォールバック** する
- ユーザの色設定が visual には消えるため、実質的な破壊変更
- どうしても削除が必要な場合は、旧 ID → 新 ID の明示的 migration slice を切る(実装側で旧 ID → 新 ID の正規化を 1 度だけ行う)

### 7.4 rename 禁止

- `red` → `crimson` のような同色別 ID の rename は **破壊的**(旧 reader で未知 ID になる)
- v1 契約期間内は行わない
- 必要な場合は §7.3 と同じく migration slice で

### 7.5 具体色値の調整は自由

- `red` の色味を微調整(light theme で少し明るく、dark theme で少し暗く等)は **自由**
- ID 契約は変わらない(data model §4.1)
- theme / a11y update で色値だけ変わるのは OK、data を触る必要なし

### 7.6 旧 reader 互換

- v1.x で `brown` が追加された場合、v1 時点の reader は `brown` を palette に持たないため **未指定にフォールバック**(data model §4.5)
- ただし `entry.color_tag: 'brown'` の値は **書き換えない**(round-trip 保持)
- v1 reader で保存 → v1.x reader で開くと `brown` がそのまま復活

---

## 8. Downstream slice contracts(値空間確定で解凍される)

本書で ID 値空間が固定されたため、以下の future slice が具体型を持てる。いずれも **本 PR では実装しない**。

### 8.1 `color:<id>` parser(future slice)

- `search-filter-semantics-v1.md` §5.1 で `color:` prefix が予約済み
- 値は **§3.1 の 8 ID のうちのひとつ**、lowercase fixed、prefix 内も lowercase
- 複数 token(`color:red color:yellow`)は Color 軸の **OR**(`search-filter-semantics-v1.md` §4 軸 4)
- 未知 ID(`color:teal`)は parser で error にせず、**filter 値として評価**(結果が 0 件になる、data model §6.4)
- 実装は parser slice / tokenizer で

### 8.2 `state.colorTagFilter`(future slice)

- 型:`Set<ColorTagId> | null`(null = 軸無効、空 Set = 軸無効、非空 Set = OR 評価)
- action: `TOGGLE_COLOR_TAG_FILTER { color: ColorTagId }` / `CLEAR_COLOR_TAG_FILTER`(Tag 軸の `TOGGLE_TAG_FILTER` / `CLEAR_TAG_FILTER` と同型)
- `hasActiveFilter` に軸 4 として参加(data model §6.3 の形)

### 8.3 Saved Search `color_filter`(future slice)

- `saved-searches-v1.md` に additive 追加:`color_filter?: ColorTagId[] | null`
- 配列は順序意味なし(OR 軸の Set を serialize)
- 旧 reader は unknown field として無視(additive、Tag 軸と同じ)
- `createSavedSearch` / `applySavedSearchFields` を Color 軸対応に拡張

### 8.4 UI picker / sidebar bar / meta pane accent(future slice)

- picker: 8 swatch + "なし" の 9 要素(§6 / `ui-vocabulary-tag-color-relation.md` §3.2)
- sidebar: 行左端 4 px 色バー
- meta pane: detail header 左端アクセントライン
- tooltip / aria-label / selected state / CVD 検証は §5.3 で要求済み

### 8.5 import / export round-trip

- data model §7.2 に従う:`entry.color_tag` の値は container.json / HTML export / ZIP export / text bundle / textlog bundle / mixed bundle いずれも **そのまま保持**
- 未知 ID も書き換えず round-trip(§7.6)
- 本 palette が固まったことで、import preview の validation(palette ID チェック)は **本書の 8 ID を許容、未知は warn but don't strip** のルールで実装可能

---

## 9. Non-goals

本書で **やらないこと**(contract breach を防ぐための明示):

- **code implementation**(`ColorTagId` type / reducer / action / presenter / picker / CSS / parser いずれも)
- **具体 HEX / RGB / CSS color token**(theme / 実装 slice で確定)
- **light / dark / high-contrast / theme token**
- **picker UI / swatch shape / selected state の実装**
- **a11y pairwise 検証の実データ添付**(palette simulation は実装 slice で実施)
- **`color:` parser / tokenizer / BNF**
- **Saved Search `color_filter` schema 実装**
- **sidebar 色バー / meta pane accent の描画**
- **categorical relation ↔ Color tag の自動変換**
- **Tag 側 / Relation 側の変更**
- **manual 更新**(実装着地後の別 slice で)
- **version bump**(本書は v2.1.1 内の docs-only、`2.1.1` 維持)
- **Known limitations からの削除**(`Color tag is spec-only` は本書だけでは解除しない、実装 slice 着地後に再評価)

---

## 10. Next-step reminders

**本書 = Color tag Slice 1 = palette fixed list**。次に着手する slice は `color-tag-data-model-v1-minimum-scope.md` §9 が列挙している順で、いずれも **別 PR / 別 slice**:

1. **Slice 2**: Saved Search additive schema(`color_filter?: ColorTagId[]`)実装 — data model + parser 不要、純 schema 追加
2. **Slice 3**: Minimal Color badge UI prototype — AppState / picker / sidebar bar / meta pane / filter bar
3. **Slice 4**: `color:` parser draft + 実装 — `parseSearchQuery` 拡張 + `applyFilters` 合成

**推奨順**: Slice 2 → 3 → 4(Saved Search schema が固まる前に parser / UI を実装すると、後で Saved Search を作ったときに round-trip が合わなくなるリスクがある)。

本書は Color tag 全体の **1 / 4** に相当。Slice 2-4 を連続で回すのか、1 slice ずつ間隔を空けるのかは統括役の判断。急がない場合、palette fixed list だけで一度止めて、Card / embed presentation spec など **別 wave を挟む** のも健全(本書は future slice を blocking しないため)。

---

## 関連

- Color tag data model(本書が §4.3 を埋める): `./color-tag-data-model-v1-minimum-scope.md`
- 概念分離: `./tag-color-tag-relation-separation.md`(§3.2 Color tag)
- UI vocabulary 正本: `../development/ui-vocabulary-tag-color-relation.md`(§3.2 Color tag picker / sidebar / filter)
- Search / filter semantics: `./search-filter-semantics-v1.md`(Color 軸 4、`color:` 予約)
- additive migration 方針: `./schema-migration-policy.md`
- 既存 Saved Search: `../development/saved-searches-v1.md`(Slice 2 の拡張先)
- Tag data model(同型テンプレート): `./tag-data-model-v1-minimum-scope.md`

---

**Status**: accepted、Color tag palette fixed list v1(2026-04-24)。8 ID を固定(`red` / `orange` / `yellow` / `green` / `blue` / `purple` / `pink` / `gray`)、`brown` / `cyan` / `teal` / `lime` / `violet` / `magenta` は v1 palette から除外(a11y 優先、future additive 拡張可能)。本書は **ID 値空間のみ** を確定、schema / reducer / UI / parser / Saved Search はいずれも未実装。`entry.color_tag` の具体 HEX / theme token / picker / swatch / filter は別 slice で実装。Known limitation `Color tag is spec-only` は本書だけでは解除しない(実装 slice 着地後に再評価)。
