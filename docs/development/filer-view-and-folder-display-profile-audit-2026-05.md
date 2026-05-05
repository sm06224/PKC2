# Filer view + folder display profile + thumbnail store — audit (2026-05-05)

**Status**: AUDIT DRAFT(user 議論待ち、open questions Q1〜Q9 未解決)
**Roadmap**: 領域 10-6 アルバム + コンタクトシート(発展版) — center pane の filer view 追加 + subset profile による extensibility(book / YouTube / explorer / album)
**User direction(2026-05-05 chat、PR #257 merge 後)**:

> さて、10-6 にしようか。発展系として、
> - 書籍データとサムネ、書籍メモを Obsidian の base のように扱う
> - 同様に YouTube のリンクと感想やまとめメモを残せるもの
> - フォルダ内のエントリ一覧をエクスプローラのように表示する
> のような使い方も想定しているため、センターペインの表示タブとしてファイラ
> ビューを追加して、ファイラビューのサブセットとして、これらの機能を実現
> できるようにしようか。データ形式として表示サムネを高速処理するために
> 別のデータコンテナに入れるなどの工夫が必要になるかも、また、将来的には
> OPFS の接続を利用して現在ディレクトリ内の表示サブセットとかも実装するかも。
> フォルダをどのサブセットでファイラビューで表示するかは、フォルダの属性
> にして設定できるようにしよう

**lineage**: roadmap §領域 10-6(原案: アルバム + コンタクトシート、サイズ 中、~3 PR)→ 本 audit で **filer view という上位概念** に格上げ + subset として album / book / youtube / explorer を並列定義する設計に拡張(サイズは大、wave 化想定)。

---

## 1. 範囲再定義(原案 → 発展版)

### 原案(roadmap §10-6)

特殊 folder = album。中身が画像 attachment 主体の folder を archetype subtype として認識し、コンタクトシート(grid サムネイル + caption)で表示。サイズ 中、~3 PR。

### 発展版(本 audit、user direction 2026-05-05)

**center pane に第 4 の view-mode「filer」を追加**。filer は **subset profile** という設定軸を持ち、subset ごとに異なる表示形態(table / grid / contact-sheet / detail-with-thumbnail)を提供。folder は属性として「自分はどの subset profile で表示されるべきか」を持つ。subset の初期セット:

| Subset | 主な対象 | 表示形態 | 想定 user 利用 |
|---|---|---|---|
| `explorer` | 任意の folder | table(name / date / size / archetype / tags) | エクスプローラ風一覧 |
| `contact-sheet` | 画像 attachment 主体の folder | grid サムネイル + caption | アルバム閲覧(原案 10-6) |
| `book-base` | 書籍メタ + サムネ + メモ | grid(表紙)+ row(書籍メタ + メモ) | 蔵書管理(Obsidian Bases 風) |
| `youtube-base` | YouTube link + 感想 / まとめ | grid(thumbnail) + row(URL + メモ) | 視聴ノート |

サイズ: 大(独立 wave、~5-7 PR、~2 ヶ月想定)。

---

## 2. 既存資産の確認

### 2.1 view-mode

`src/adapter/state/app-state.ts:322`:
```ts
viewMode: 'detail' | 'calendar' | 'kanban';
```

reducer `SET_VIEW_MODE`(`app-state.ts:2758`)で切替、renderer は `data-pkc-region="calendar-view"` / `"kanban-view"` で region 分岐。filer 追加は **additive**(既存 view への影響ゼロ可能)。

### 2.2 folder archetype

`src/core/model/record.ts:7`:
```ts
export type ArchetypeId =
  | 'text' | 'textlog' | 'todo' | 'form'
  | 'attachment' | 'folder' | 'generic' | 'opaque'
  | 'system-about' | 'system-settings' | 'system-flags';
```

folder は既に first-class archetype。`auto-placement.ts` が「folder ancestor を探して subfolder を作る」既存ロジックを持つ。folder の `body` は現状未使用(空文字 or メモ用)。

### 2.3 Asset / thumbnail

現状の assets は `container.assets: Record<string, string>`(asset id → base64 data URL)に集約。サムネは存在せず、image attachment は本体 base64 をそのまま `<img src="data:...">` で render。**thumbnail 高速処理目的の別 store はまだ無い**。

### 2.4 既存 CANDIDATE doc(`docs/development/data-model/`)

- `spreadsheet-entry-archetype.md`(C-4、未着手)
- `complex-entry-archetype.md`(C-5、未着手)
- `document-set-archetype.md`(C-6、未着手)
- `office-preview-strategy.md`(C-7、未着手)

**book / youtube の archetype doc はまだ存在しない**。本 wave で起こす想定。

---

## 3. アーキテクチャ設計空間

### 3.1 Filer view の位置付け(2 案)

| 案 | mount 位置 | 既存 detail との関係 |
|---|---|---|
| **A. 新 view-mode** | center pane 全体を占有。`viewMode === 'filer'` のとき detail / calendar / kanban と排他 | 切替式。folder を選んでも今までは detail 表示、filer mode 時は subset 表示 |
| **B. detail 内 sub-mode** | folder を選択 + folder.display_profile が設定されているとき、detail 内で filer subset を表示 | folder 専用、view-mode は変わらない |

**推奨**: **案 A**。理由:
- container 全体で「filer モード」になる設計の方が、folder 横断で book base / youtube base を巡回するときの体験が一貫
- view-mode tab UI(既存 calendar / kanban tab)と並列にして user mental model が単純
- 既存 detail の「entry を選んで body を読む」と filer の「container 内 folder 群を巡る」は別ワークフロー

### 3.2 Folder display profile schema

folder entry に additive optional field:

```ts
interface Entry {
  // ... existing fields
  /** Filer view 時の表示 subset。folder archetype のみ意味を持つ。 */
  display_profile?: FilerProfile;
}

type FilerProfile =
  | { kind: 'explorer'; columns?: string[] }
  | { kind: 'contact-sheet'; cell_size?: 'sm' | 'md' | 'lg' }
  | { kind: 'book-base'; columns?: string[] }
  | { kind: 'youtube-base' };
```

backward-compat:
- 旧 reader: 未知 field を無視(JSON parser default 動作)
- 旧 writer: 設定しなければ undefined のまま、container schema_version 不要

### 3.3 Book / YouTube は新 archetype か?

| 案 | 内容 | 賛否 |
|---|---|---|
| **C. 新 archetype** `book` / `youtube` | ArchetypeId union を 2 件追加、専用 DetailPresenter | (+) type-safe、UI 専用最適化容易 / (−) archetype 増殖、import / export / migration への波及 |
| **D. generic + soft-typing** | tag(`#book` / `#youtube`)or frontmatter で identify | (+) archetype 不変 / (−) subset profile が「entry を archetype で fold」しづらい |
| **E. attachment + 専用 metadata** | book = attachment(画像) + body にメタ JSON、youtube = generic + body にメタ | (+) 既存 archetype で吸収 / (−) ad-hoc |

**推奨**: **案 C(新 archetype)**。filer subset が「`archetype === 'book'` の entry を grid 表示」と単純化でき、IR(領域 10-3)への migration 時も明示的。ただし archetype 増殖を嫌う場合は案 D も検討余地。

### 3.4 Thumbnail store(別 data container)

user 提案:「データ形式として表示サムネを高速処理するために別のデータコンテナに入れるなどの工夫が必要になるかも」

設計選択肢:

| 案 | 内容 | 賛否 |
|---|---|---|
| **F. assets 内に thumbnail prefix** | `assets['thumb:<asset-id>']` のように key prefix で同居 | (+) schema 不変 / (−) 一覧時に全 asset load、本体と分離されない |
| **G. container.thumbnails 新 field** | `container.thumbnails: Record<string, string>` を additive optional で追加 | (+) field レベルで分離、reader が選択 load 可能 / (−) schema 拡張、migration 必要 |
| **H. 別 IndexedDB store** | `pkc2.thumbnails` store を独立、container には参照 key のみ持つ | (+) 本体 export に thumb 不含、build 軽い、OPFS 接続(将来)と整合 / (−) 単一 HTML export には乗らない、persist 整合性管理が複雑 |

**推奨**: 段階導入。**Phase 1 は案 F(assets 内 prefix)で MVP**、Phase 3 で **案 H(別 store)に migration** が現実的。案 G は中間で stuck risk。

理由:
- MVP は本体 base64 を縮小して同 store に書く程度で動く(book 表紙 30KB → thumb 5KB 等)
- OPFS 連携(将来)時には本体すら別 store になるので、thumb も同タイミングで分離するのが筋
- single-HTML 制約下では「export 時に thumb は捨てて本体だけ保存、import 時に再生成」が許容されるべき

### 3.5 OPFS 連携(将来 deferred)

user 提案:「将来的には OPFS の接続を利用して現在ディレクトリ内の表示サブセットとかも実装するかも」

OPFS = Origin Private File System、ブラウザ側 file system。container.entries とは別に「現在ディレクトリの実ファイル」を読む路。

**deferred 判断**: 本 wave では **OPFS は範囲外**。理由:
- single-HTML invariant への影響大(file handle persist + permission UX)
- container is source of truth 不変条件と緊張(OPFS は container 外)
- 現要件は「PKC 内 entry の filer 表示」が core、OPFS は外部ファイル巡回で別 axis
- 別 wave(領域 10-? 新規)として spec 起こすのが筋

USER_REQUEST_LEDGER §3.6 の deferred items に「filer-OPFS 連携」を追加し、再評価 trigger を「PKC 内 filer が安定 + 外部ファイル直接編集要求が user から具体化」とする。

---

## 4. Phase 分割案(MVP → 拡張)

### Phase 1: Filer view skeleton + explorer subset(MVP)

- `viewMode: 'filer'` 追加(SET_VIEW_MODE 拡張、tab UI 追加)
- `FilerProfile = 'explorer'` のみ実装(table:name / date / archetype / tags)
- folder 選択時、folder 内 entry を table 表示
- folder.display_profile 未設定時は `'explorer'` 既定
- folder.display_profile を設定する UI(meta pane の attribute editor)
- parity test:viewMode 切替 + folder 選択 + table row click → entry 選択

サイズ: 中(~2 PR)

### Phase 2: contact-sheet subset(原案 10-6)

- `FilerProfile = 'contact-sheet'`
- folder 内の image attachment を grid で表示
- caption は entry.title
- click → entry detail(modal or center pane)
- サムネは MVP で本体 base64 をそのまま(thumbnail store は Phase 4 で)

サイズ: 中(~1 PR)

### Phase 3: book-base / youtube-base archetype + subset

- ArchetypeId に `book` / `youtube` 追加
- DetailPresenter 登録(book = 表紙画像 + メタ + メモ、youtube = thumbnail oEmbed + URL + メモ)
- FilerProfile に `'book-base'` / `'youtube-base'` 追加
- 専用 grid:book は表紙 + 著者 / 出版年、youtube は thumbnail + chan / 公開日
- import / export 経路への migration(新 archetype を Backup ZIP に乗せる)

サイズ: 大(~3 PR、archetype 着地 1 + subset UI 1 + import/export 1)

### Phase 4: Thumbnail store 分離(高速化)

- `container.thumbnails` field 追加(案 G)or `pkc2.thumbnails` IDB store(案 H)
- thumbnail 生成 worker(book 表紙 / youtube oEmbed を縮小して書く)
- filer view 時に本体 load せず thumb のみ load する code path
- bench:1000 entry folder の filer 開きで本体 load 経路 vs thumb 経路の比較

サイズ: 大(~2 PR、store 切出 + worker)

### Phase 5(deferred): OPFS 連携

別 wave に切出。本 audit の §3.5 参照。

---

## 5. 既存 doc / wave への影響

### 5.1 既存 CANDIDATE 系との関係

- `spreadsheet-entry-archetype.md`(C-4):independent、本 wave とは別 archetype 拡張
- `complex-entry-archetype.md`(C-5):book = 「画像 attachment + メタ + メモ」を complex entry の 1 形態と見なせるか議論余地。**本 wave で book を新 archetype として実装するか、complex entry の 1 instantiate として実装するかは Q3**
- `office-preview-strategy.md`(C-7):youtube link は OPFS / external URL 系、本 wave とは別

### 5.2 領域 10-3 IR との結合

filer subset の view layer は **HTML renderer 専用**。IR 経由で word / ppt 出力する経路は filer view では不要(filer は閲覧 UI、export 時は entry 単位で従来 path)。ただし book / youtube archetype 自体は IR の対象になる(書誌情報 + メモを word に出力する要望が将来あり得る)。

→ 本 wave は **HTML renderer のみ touch**、IR layer は未着手で OK。

### 5.3 領域 10-7 アプリランチャー との関係

10-7 ランチャーは「Editor / Calendar / Kanban / Spreadsheet (10-4) / Album (10-6)」を入口で選択する dashboard。本 wave の filer view は **Editor の中の view-mode tab** として実装するので、ランチャー側は filer を「Editor 内の機能」として扱える。10-7 着手前に 10-6 が landing していると、ランチャーの選択肢が 1 つ整う。

---

## 6. Folder ZIP Export / Import 拡張(user 追加要件 2026-05-05)

User direction(audit 起こし直後の追加):
> なお、これによって、フォルダの zip エクスポート/インポート機能が必要に
> なります。リンク参照させているアセットも実体ファイル込みでエクスポート
> する必要がある点に留意願います。

### 6.1 既存の `pkc2-folder-export-bundle`(現状)

`src/adapter/platform/folder-export.ts:88` `buildFolderExportBundle()`:
- archetype filter: `'text' || 'textlog'` のみ(`folder-export.ts:102-104`)
- 出力形式: nested ZIP(outer に `.text.zip` / `.textlog.zip` + `manifest.json`)
- folder hierarchy: `folders[]` で parent_lid 含めて記録
- Asset: `text-bundle.ts` / `textlog-bundle.ts` が **markdown body 内の `asset:K` reference + 独自 metadata の `asset_key` field** を `asset-scan.ts` 経由で集めて、各 single bundle 内に実体同梱
- import: `batch-import.ts:60` で folder 階層を復元、entries / assets を merge

### 6.2 本 wave で必要な拡張

filer view + book / youtube archetype が landing するため、`buildFolderExportBundle()` の **archetype filter を撤廃 or 拡張** が必須。具体的に:

| 課題 | 既存 | 本 wave で必要 |
|---|---|---|
| **対象 archetype** | text / textlog のみ | + book / youtube / attachment / folder(自身)/ generic / todo / form |
| **per-archetype bundle** | text-bundle / textlog-bundle のみ | book-bundle / youtube-bundle / attachment-bundle 等が新規必要、または **uniform entry-bundle** に格上げ |
| **asset 実体同梱** | text/textlog body の `asset:K` ref のみ scan | book.cover_asset / youtube.thumbnail_asset / attachment 本体 / 任意 archetype の独自 asset_key field 全てを scan |
| **broken reference** | missing_asset_count で報告のみ | 同上(変更なし) |
| **manifest format** | version 1 | additive 拡張 v2 が筋(format は同名、version bump で reader 挙動分岐) |

### 6.3 「リンク参照させているアセットも実体ファイル込み」の解釈

user 強調点 = book の表紙画像 / youtube サムネイル / その他 asset 参照を **実 binary として ZIP 内に展開** する要件。既存の text/textlog では `asset-scan.ts` がこれを既に処理(`asset:K` ref → `container.assets[K]` の base64 → bundle 内 `assets/K.ext` に展開)している。本 wave では:

1. **新 archetype の asset reference scan 経路**追加:`asset-scan.ts:147` の archetype 分岐に book / youtube を追加(参照先 schema が確定したら hook 増やす)
2. **broken reference 防御**:export 時に asset 不在を warn、import 時に「asset 欠損あり」表示(既存 `missing_asset_count` 経路を踏襲)
3. **export size 警告**:画像主体の book / album folder は export ZIP が大きくなりやすいため、UI で容量 estimate を表示(既存の image-optimize-worker と整合可能)

### 6.4 import 側の整合

`batch-import.ts` の `pkc2-folder-export-bundle` 経路は archetype 不問で entry を取り込むが、現状 `text-bundle` / `textlog-bundle` reader が hardcode されている(`batch-import.ts:425-432` 付近)。本 wave で:

- 各 archetype に対応する **{archetype}-bundle reader** を実装
- もしくは **uniform entry-bundle reader** に統一(version 2 から)
- 既存 v1 bundle(text/textlog only)との backward-compat を維持(reader は version + format で分岐)

### 6.5 Phase 配置

Folder ZIP export 拡張は **本 wave の MVP 必須要件**。Phase 配置:

| Phase | folder-export 関連作業 |
|---|---|
| 1(filer skeleton + explorer) | 不変、touch なし |
| 2(contact-sheet) | attachment archetype の bundle 起こし(画像付き folder export 用) |
| 3(book / youtube archetype + subset) | **book-bundle / youtube-bundle reader/writer 必須**、folder-export.ts の archetype filter 撤廃、manifest v2、import 経路の archetype 不問化 |
| 4(thumbnail store) | thumbnail を export に含めるか別:本体は確実に含む、thumb は再生成可能なので omit 候補 |
| 5(OPFS、deferred) | OPFS 経由で読み込んだ外部ファイルを folder-export に含める要件は別 wave で議論 |

### 6.6 Open Questions 追加(Folder export 関連)

| Q | 内容 | options |
|---|---|---|
| **Q10** | bundle format を per-archetype に増やすか、uniform に統一するか | 案 P(book-bundle / youtube-bundle 等を archetype ごとに新設) / 案 Q(uniform entry-bundle v2 に統合、archetype は manifest field) — 推奨 Q(将来 archetype 増加に強い) |
| **Q11** | manifest version bump の単位 | format string で分岐(`pkc2-folder-export-bundle-v2`) / version field で分岐(同 format、version: 2)— 既存 doc 慣例で後者 |
| **Q12** | 大容量 folder(画像主体)の export | 一括 ZIP のまま / 分割 / 警告のみ — 推奨 警告のみ + 既存 image-optimize-worker 連携 |
| **Q13** | thumbnail を export に含めるか | 含める(import 時 instant) / omit して import 時再生成 — 推奨 omit(再生成可能、size 削減) |
| **Q14** | import 時の lid 衝突 / asset 衝突 | merge 既定 / replace 既定 / preview で選択 — 既存 batch-import 慣例(merge / replace 選択 UI)を踏襲 |

---

## 7. 設計の危うい点(idea-stage で潰すべき構造的リスク、優先度順)

User direction(2026-05-05、§6 追加直後):
> まずはアイデアベースです。設計の危うい点などを潰していきましょう。

→ Q1〜Q14 の細目に入る前に、wave 全体を狂わせ得る **構造的リスク 12 点** を棚卸し。各点に「具体例」「影響」「緩和案」「user 判断要否」を記す。優先度は **★★★ (本 wave の前提を崩す)/ ★★ (Phase 設計を歪める)/ ★ (実装段階で解消可能)** の 3 段階。

### R1 ★★★ — book / youtube が **entry archetype** か **folder display profile** かの混線

user 発話:
> 書籍データとサムネ、書籍メモを Obsidian の base のように扱う

これは 2 通りの読み方ができる:

| 読み方 | 意味 | 帰結 |
|---|---|---|
| **読み方 α** | book は **entry archetype**(個々の本が 1 entry)、folder の display_profile = `book-base` で folder 内の book entry 群を grid 表示 | book archetype 追加 + folder.display_profile + filer subset、3 層構成 |
| **読み方 β** | folder 自体が「書籍 base」になる(Obsidian の base が folder/note 集合に一括 view を被せる)、book という archetype は不要 | display_profile = `book-base` だけ、entry は generic / attachment のまま、metadata は entry.frontmatter |

**影響**: 全体設計の根幹。読み方 α は「archetype 増殖」、読み方 β は「folder が container の中の container」になる(container in container)。後者は Obsidian Bases に近いが、PKC の archetype 設計と緊張する。

**緩和**: §6 Q3 で確定する前に **読み方を 1 つに固定**。私の推奨は **読み方 α(book archetype 化)**。理由:
- PKC の data model invariant「Entry は archetype を持つ」と整合
- export / import / search / saved-search で「book を絞り込む」が自然
- IR(領域 10-3)に乗せる時 book primitive が明示的

ただし **user が Obsidian Bases の挙動を強くイメージしているなら β** で進める方が満足度高い。まずここを決める。

**user 判断要**:**読み方 α か β か**(これを決めないと Q3 / Q4 / Q5 が空中分解)。

### R2 ★★★ — archetype 増殖の連鎖コスト

新 archetype 追加(book / youtube)時に同期すべき箇所:

| コード経路 | 既存件数 | book / youtube 追加で必要な変更 |
|---|---|---|
| `ArchetypeId` union(record.ts:7) | 11 種 | 2 種追加 |
| `DetailPresenter` 登録 | 8 種 | 2 種追加 |
| `auto-placement.ts` subfolder 規則 | 4 種 | 2 種追加 |
| `asset-scan.ts` 参照 scan | 2 種(text/textlog) | 2 種追加(book.cover / youtube.thumbnail) |
| `excerpt-builder.ts` | 8 種 | 2 種追加 |
| `text-bundle` / `textlog-bundle` | 2 種専用 | book-bundle / youtube-bundle 新設 or uniform 化 |
| `batch-import.ts` reader 分岐 | 2 種 | 2 種追加 |
| `saved-search` archetype_filter | 11 種 | 2 種追加 |
| `kanban` / `calendar` exclude rules | 11 種 | 2 種追加 |
| `card/excerpt-builder.ts` | 8 種 | 2 種追加 |
| sidebar archetype icon | 11 種 | 2 種追加 |
| migration:既存 container schema_version 互換性 | — | additive optional で v2.2.x reader が新 archetype を opaque 扱い |

**影響**: archetype 1 つ追加 = ~12 経路の同期、PR 1 件で着地が困難。**Phase 3 で book / youtube 単独 PR は無理、wave 内 sub-wave 化が必要**。

**緩和**:
- 案 a:**読み方 β を採用**(R1 決着次第)で archetype 増殖を回避
- 案 b:`generic` archetype + frontmatter で soft-typing(`#book` tag + body 先頭 `---\nkind: book\n---`)、archetype 増設なし(複数経路に手を入れずに済む)
- 案 c:archetype 追加を覚悟、Phase 3 を sub-wave 化(book 単独 sub-wave + youtube 単独 sub-wave、各 ~3 PR)

**user 判断要**:archetype 増殖を引き受けるか、generic + frontmatter で済ませるか(R1 と連動)。

### R3 ★★★ — Folder ZIP export size 爆発

book / contact-sheet folder は画像主体、export ZIP が容易に GB に到達する。

**具体例**:
- 100 冊の book folder × cover 500 KB = 50 MB ZIP(まだ許容)
- 1000 冊 × 500 KB = 500 MB ZIP(browser 固まる risk)
- 動画 attachment 含む album folder × 50 MB = 5 GB(Blob 限界、export 不能)

**影響**:
- `createZipBlob()` は同期的に Blob を Memory に展開、500 MB 超で OOM
- 単一 HTML invariant 下では streaming ZIP write は困難(JSZip / pako の同期 API 利用中)
- user が export しようとして browser tab がクラッシュ → 価値破壊

**緩和**:
- 案 a:**容量 estimate を export 開始前に表示**、警告 + cancel 経路(既存 image-optimize-worker と整合)
- 案 b:**分割 export**(.folder-export.001.zip / .002.zip)、import 側で chain reader 実装
- 案 c:**streaming ZIP**(WHATWG `CompressionStream` + `WritableStream` の File System Access API、ただし single-HTML 制約と緊張)
- 案 d:**asset 参照の external mode**(ZIP は manifest + body のみ、asset は別 .assets.zip)

**user 判断要**:本 wave で対応する閾値(警告のみで済ます / 分割実装する)。

### R4 ★★ — Thumbnail store 段階導入の rebound risk

§3.4 で「MVP は案 F(assets 内 prefix)、Phase 4 で案 H(別 store)に migration」推奨したが、**Phase 4 移行時の苦痛が大きい可能性**。

**具体例**:
- Phase 1〜3 で `assets['thumb:K'] = base64` 形式が確立、user data に蓄積
- Phase 4 で別 IDB store に分離 → 既存 `thumb:` prefix を全件 IDB に移し、container.assets から削除する migration
- migration 中の crash で thumb と本体の整合性破綻、reader は両 store を check してどちらにあっても動く設計が要る
- **「migration 一度きり」と思って軽視すると、後の merge import / cross-version reader でバグの温床**

**影響**: Phase 4 が "single PR で済む" 想定が外れ、~3 PR + spec doc + parity test が必要になる(reform-2026-05 §6 visual-state-parity 対象)。

**緩和**:
- 案 a:**Phase 1 から案 G(container.thumbnails field)で開始**(後で IDB に切る時、container 構造は不変)
- 案 b:案 F のまま MVP 着地、Phase 4 直前に migration spec doc 起こし(rebound 受容)
- 案 c:**thumb 不在 → 本体 load にいつでも fallback** を data invariant 化(thumb は performance 最適化、本質的データではない)

**user 判断要**:Phase 1 の thumbnail 仕様(F / G / H のどれで開始)。

### R5 ★★ — uniform entry-bundle 化(案 Q)の現実性

§6.2 / Q10 で「book-bundle / youtube-bundle 等を archetype ごとに新設するか、uniform entry-bundle v2 に統合するか」を提示。

**uniform 化の難点**:
- 既存 text-bundle = `body.md` + `assets/`、textlog-bundle = `entries.csv` + `assets/` の **internal layout が archetype 依存**
- 「uniform」と言っても、`manifest.archetype` で reader が分岐 → ほぼ per-archetype reader を用意する必要(共通化できるのは ZIP framing のみ)
- entry-bundle v2 で「format string が同じだが archetype ごとに layout 違う」は spec として fragile(version + archetype の cross matrix で reader の test 量が爆発)

**影響**: Q10 で「uniform 推奨」と書いたが、**実態は per-archetype bundle**。命名だけ揃える表面的な統合は spec 設計を曇らせる。

**緩和**:
- 案 a:**素直に per-archetype bundle**(book-bundle / youtube-bundle / attachment-bundle 新設、folder-export.ts は archetype ごとに builder を dispatch)
- 案 b:**uniform "entry-bundle v2" + archetype 別 reader/writer plugin 機構**(archetype ごとに `BundleHandler` interface 実装、folder-export は handler を lookup)— Phase 8 順序性 doctrine と整合、test 矩形を定型化可能
- 案 c:**現状の text/textlog bundle を変えず、新 archetype は ZIP に entry.json + assets/ で素朴に展開**(per-archetype plugin の最小形)

**user 判断要**:bundle 設計方針(plugin 機構を導入するか、素朴に並べるか)。R2 と密接に連動。

### R6 ★★ — view-mode 拡張の波及

`viewMode: 'detail' | 'calendar' | 'kanban'` に `'filer'` 追加:

**touch 必要箇所**:
- `app-state.ts:322` 型定義
- `SET_VIEW_MODE` reducer の挙動(filer 時の selectedLid 扱い)
- `renderer.ts` の region 分岐(現状 calendar-view / kanban-view、filer-view を追加)
- shell menu / view-mode toggle UI(既存 `Calendar` / `Kanban` button 隣に `Filer`)
- keyboard shortcut(現状 `Ctrl+1/2/3` 等の割当?要確認)
- iPhone shell の layout fallback
- localStorage の viewMode persist(既存にあるか確認)
- `Editor` mode 中の filer 切替挙動(`viewMode !== 'detail'` 時の dispatch、既存 `app-state.ts:945` で edit が gate)

**影響**:**view-mode 追加 = AppState mutation 経路と UI 全体の同期**、PR 1 件で済むが parity test が増える(reform-2026-05 §6 順序性、Phase 8)。

**緩和**: Phase 1 で全 touch 完了、Phase 2 以降は filer 内で subset 切替のみ。view-mode 切替の parity test を Phase 1 spec doc で必須化。

**user 判断不要**:実装段階で解消、既存 calendar / kanban 拡張と同じ pattern。

### R7 ★★ — folder.display_profile を Container に書く invariant

**論点**: `display_profile` は **content** か **UI 状態** か?

| 解釈 | 帰結 |
|---|---|
| **content**(folder の本質的属性) | Container schema に乗る、export 時に同伴、別 PKC への移植時も保たれる |
| **UI 状態**(user ごとの好み) | localStorage に保存、export 不要、別 user で異なる表示 |

user 発話「フォルダの属性にして設定できる」は **content** 寄り、しかし「同一 folder を user A は contact-sheet で、user B は explorer で見たい」要望が将来出ると **UI 状態** 化必要。

**緩和**:
- 案 a:**content として保存**(Container 内、export 同伴)、UI override は別 channel(localStorage)で重ねる
- 案 b:**UI 状態のみ**(localStorage)、folder には書かない → Obsidian Bases の base file は metadata file として content だが、PKC は UI と分離
- 案 c:**両方**(folder default + user override)、render 時に override 優先

**推奨**: 案 a + override layer。**Phase 1 で確定し、後で localStorage override 追加(additive)**。

**user 判断要**:display_profile を content として持つか、UI 状態だけにするか(R1 と密接)。

### R8 ★ — Obsidian Bases 風 column 設定の scope creep

book-base / youtube-base で「Obsidian Bases のように」と user 発話。Bases の主機能:
- column 選択 / 並べ替え / 幅調整
- filter 式(property == value)
- sort(property asc/desc)
- group by property
- view 切替(table / cards / gallery / calendar)

**影響**: MVP に column UI を含めると filter / sort / group / view 切替も求められる(Bases mental model のため)。Phase 3 の sub-wave 全体が ~6 PR に膨らむ可能性。

**緩和**:
- Phase 3 MVP は **固定 column**(book = title / author / year / cover、youtube = title / channel / date / thumb)
- Phase 5+ で column / filter / sort / group を段階的追加(別 wave)
- spec doc で **MVP は Bases 模倣ではなく "Bases 風の入口"** と明記

**user 判断要**:MVP の column 自由度(固定 / カスタマイズ可能 / 全部 Bases 風)。

### R9 ★ — attachment と book の重複

既存 `attachment` archetype は画像 / PDF などの file 添付を保持(本体 base64)。book = 表紙画像 + メタ + メモ → **attachment + entry の複合**。

**論点**: book を新 archetype として作ると、attachment (= file holder) との関係が曖昧:
- book.cover は attachment への asset:K reference か、book entry 内 inline か?
- attachment archetype の image を「book 表紙」に昇格する path はあるか?

**緩和**:
- 案 a:**book entry の cover は asset:K reference**(`container.assets[K]` を参照、attachment archetype は無関係)
- 案 b:**book = 既存 attachment archetype + frontmatter で book metadata**(case β、archetype 不要)
- 案 c:**complex-entry-archetype(C-5)に乗せる**(複数 archetype の combine、book = attachment + memo + metadata の複合定義)

**user 判断要**:asset 参照経路(R1 / R2 と連動)。

### R10 ★ — OPFS 連携の data path 影響

§3.5 で OPFS は deferred と決めたが、**Phase 1 の data path が将来 OPFS 拡張を許す形**でないと積み残し。

**論点**:
- filer view が container 内 entry を表示する関数 `loadFilerEntries(folder, profile)` を Phase 1 で書く
- 将来 OPFS から取り込んだ外部 file を同 view に並列表示する場合、関数が `EntrySource = ContainerEntry | OpfsFile` の union を受ける形が必要
- Phase 1 で `loadFilerEntries(folder)` が `Entry[]` を返す前提で書くと、後で OPFS 追加時に signature 破壊

**緩和**:
- Phase 1 で **EntrySource abstraction を最初から導入**(Phase 5 で OpfsFile を後付け可能)
- 後付け不能なら Phase 1 を素朴に書き、Phase 5 で refactor 受容(YAGNI 派)

**user 判断不要**:実装段階の設計判断、ただし Phase 1 spec doc で言及。

### R11 ★ — iPhone / mobile filer view の layout

explorer table / book-base column は narrow viewport(iPhone 縦 320-414 px)で破綻。

**緩和**:
- explorer:column 縮退(name のみ / name + date)、tap で row expand
- contact-sheet:cell_size = sm で 3 列、md で 2 列、lg で 1 列
- book-base / youtube-base:cover 主体の card view に切替(column 表示は landscape only)

**user 判断不要**:既存 calendar / kanban の mobile fallback と同等の対応、Phase 1 spec doc で明記。

### R12 ★★ — folder と subset profile の semantic mismatch

user 発話「フォルダをどのサブセットでファイラビューで表示するかは、フォルダの属性にして設定できるようにしよう」を字面通りに取ると、**folder = subset profile を持つ**。だが:

- `explorer` subset:中身が任意 archetype の混在 folder(自然な default)
- `contact-sheet` subset:中身が画像 attachment 主体の前提
- `book-base` subset:中身が **book archetype 主体** の前提
- `youtube-base` subset:中身が **youtube archetype 主体** の前提

**論点**: subset profile が「中身の archetype 構成」を制約する。folder.display_profile = `book-base` なのに中身が text entry 1 件しか無いとき、view は何を表示する?

**緩和**:
- 案 a:**subset は表示 hint、archetype mismatch は graceful degrade**(book-base view で book 以外の entry も card で表示、ただし default field 表示は崩れる)
- 案 b:**subset 制約 = strict**、不適合 entry は隠す(filter 的)
- 案 c:**subset は archetype filter として機能**、book-base = `archetype === 'book'` の entry のみ表示、混在は不可

**user 判断要**:subset profile が archetype filter として機能するか、表示 hint だけか(R1 と連動)。

---

### 危うい点の優先順位サマリ

| # | risk | 優先度 | user 判断要 | 後続 Q への影響 |
|---|---|---|---|---|
| R1 | book/youtube が archetype か display profile か | ★★★ | **必須**(他全 Q の前提) | Q3, Q4, Q5, Q12 |
| R2 | archetype 増殖の連鎖コスト | ★★★ | **必須** | Q3, Q10, Phase 3 size |
| R3 | Folder ZIP export size 爆発 | ★★★ | **必須** | Q12, Phase 1 spec |
| R5 | per-archetype vs uniform bundle 設計 | ★★ | **必須** | Q10, R2 と連動 |
| R7 | display_profile が content か UI 状態か | ★★ | **必須** | Q2, Phase 1 schema |
| R12 | subset profile が archetype filter か表示 hint か | ★★ | **必須** | Q3, Q9, R1 と連動 |
| R4 | thumbnail store の段階導入 rebound | ★★ | **判断あれば** | Q6, Phase 4 size |
| R8 | Bases 風 column の scope creep | ★ | **判断あれば** | Q9, Phase 3 size |
| R9 | attachment と book の重複 | ★ | **判断あれば** | Q3, R1 |
| R6 | view-mode 拡張の波及 | ★★ | 不要 | Phase 1 spec |
| R10 | OPFS の data path 影響 | ★ | 不要 | Phase 5 |
| R11 | iPhone filer layout | ★ | 不要 | 実装段階 |

### 議論の進め方提案

**まず R1(book / youtube が archetype か display profile か)を確定** = wave 全体の前提。次に **R2 / R3 / R7 / R12** を順に潰す(これらが Phase 1 の schema / size / data path を決める)。残り R4 / R5 / R8 は Phase 設計時、R6 / R10 / R11 は実装段階の判断。

→ R1 から議論開始することを user に提案する。

---

## 8. Open Questions(user 判断待ち、§6 と統合)

| Q | 内容 | options |
|---|---|---|
| **Q1** | Filer view の位置付け | 案 A(新 view-mode) / 案 B(detail 内 sub-mode) — 推奨 A |
| **Q2** | Folder の display_profile を必須にするか | 必須(folder 全件に設定) / 既定 explorer + opt-in 上書き — 推奨 後者 |
| **Q3** | Book / YouTube の archetype 化 | 案 C(新 archetype) / 案 D(soft-typing tag) / 案 E(attachment + メタ) — 推奨 C |
| **Q4** | book archetype の body schema | JSON(`{title, author, year, isbn, ...}`) / frontmatter + markdown / 別 metadata field 追加 |
| **Q5** | youtube archetype の body schema | URL + メモ markdown / JSON + メモ / generic + tag |
| **Q6** | Thumbnail store の分離タイミング | Phase 1 から分離(案 H) / Phase 4 で分離(段階導入) — 推奨 後者 |
| **Q7** | Phase 1 の filer view tab UI | calendar / kanban と並ぶ tab / shell menu / keyboard shortcut のみ |
| **Q8** | OPFS 連携 | 本 wave 含む / 別 wave に分離 — 推奨 後者(deferred) |
| **Q9** | book / youtube subset で Obsidian Bases 風 column 設定 | MVP 含む / Phase 3+ で対応 — 推奨 後者(MVP は固定 column) |
| **Q10** | bundle format(per-archetype vs uniform) | 案 P(archetype ごと bundle 新設) / 案 Q(uniform entry-bundle v2)— 推奨 Q |
| **Q11** | manifest version 表現 | format string で分岐 / version field で分岐 — 推奨 後者 |
| **Q12** | 大容量 folder export | 警告のみ / 分割 — 推奨 警告のみ |
| **Q13** | thumbnail を export に含めるか | 含める / omit + import 時再生成 — 推奨 omit |
| **Q14** | import 時の lid / asset 衝突 | merge / replace / preview 選択 — 既存 batch-import 踏襲 |

---

## 9. サイズ集計

| Phase | サイズ | PR 数 |
|---|---|---|
| 1. Filer skeleton + explorer | 中 | ~2 |
| 2. contact-sheet | 中 | ~1 |
| 3. book / youtube archetype + subset | 大 | ~3 |
| 4. Thumbnail store 分離 | 大 | ~2 |
| 5. OPFS(deferred) | 別 wave | — |
| **計** | **大 wave** | **~8 PR、~2-3 ヶ月** |

---

## 10. 次アクション

1. **Q1〜Q9 を user 議論で確定**(本 audit doc が起点、回答を §6 に書き戻す)
2. 確定後、**Phase 1 spec doc 起こし**(`filer-view-explorer-subset-spec.md`):
   - `FilerProfile` 型定義
   - `viewMode: 'filer'` 追加 + reducer
   - tab UI / shortcut
   - folder.display_profile attribute editor
   - parity test 構成
3. spec doc landing 後、**実装 PR(Phase 1)**:reducer → renderer → UI → smoke
4. Phase 2 以降は Phase 1 着地後に re-plan

## 11. 参照

- roadmap: `feature-requests-2026-04-28-roadmap.md` §領域 10-6
- 既存 archetype: `docs/spec/data-model.md` §4
- 既存 view-mode: `src/adapter/state/app-state.ts:322`
- folder auto-placement: `src/features/relation/auto-placement.ts`
- IR audit(領域 10-3): `intermediate-representation-audit.md`
- USER_REQUEST_LEDGER §3.6 deferred items(本 wave 完了時に「filer-OPFS 連携」を追加)
