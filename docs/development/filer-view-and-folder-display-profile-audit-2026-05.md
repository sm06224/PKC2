# Filer view + Graph view + Hybrid Z data model — audit (2026-05-05)

**Status**: AUDIT(case ζ'' 確定 by user 2026-05-05、Phase 1 spec doc 起こし待ち)
**Roadmap**: 領域 10-6 アルバム + コンタクトシート(発展版) — center pane の filer view 追加 + subset profile + graph view + 入力負担減 sub-wave
**User direction(2026-05-05 chat、PR #257 merge 後)の集約**:

1. > 「10-6 にしようか。発展系として、書籍データとサムネ + 書籍メモを Obsidian Bases のように扱う / YouTube リンクと感想 / フォルダ内エントリ一覧をエクスプローラ風表示。センターペインの表示タブとしてファイラビューを追加、subset として上記 3 つを実現。フォルダの属性として subset 設定」
2. > 「フォルダの zip エクスポート/インポート機能が必要。リンク参照アセットも実体ファイル込みでエクスポート」
3. > 「まずアイデアベース、設計の危うい点を潰しましょう」
4. > 「私の案としては一つのエントリや書籍アセットは様々な方法でリンクを形成し、一次情報の棚卸しを含む」
5. > 「TEXT エントリとそれらの相互リンクをグラフで表現できることが必要。最小単位以外のエントリはかなり特殊な事情がない限り産みたくない」
6. > 「TEXTLOG は思考の道程、TEXT は思考の整理、TODO は思考に至るマイルストーン、FILE アセットは資料、FOLDER は構造的なまとめ。タグとリレーションがそれらの間を糊のように補強する」
7. > 「PKC2 実装原則によると d3.js は使用せずバニラ TS を志向すべき。ただし pandoc のようなことは build 時バンドル + version pin で問題ない」
8. > 「データの持ち方含めて将来性込みでお勧めは?PKC2 哲学守りつつ入力負担減 + 体験向上」
9. > 「お任せ推奨で OK」

**lineage**: 2026-05-05 に α/β/γ/δ/ε(archetype 増設系)→ ζ(subgraph)→ ζ'(TEXT-only subgraph)→ **ζ''(TEXT atom + Hybrid Z data model + vanilla TS)** で確定。

---

## 1. 案 ζ''(本 audit の確定推奨)

### 1.1 PKC2 archetype 体系 = 完成した認知モデル

| archetype | 認知的役割(user 言) | 物理形 |
|---|---|---|
| **TEXTLOG** | 思考の道程(過程) | 時系列ログ(CSV) |
| **TEXT** | 思考の整理(まとまり) | markdown body |
| **TODO** | 思考に至るマイルストーン(進捗) | task + status |
| **ATTACHMENT**(file) | 一次資料(原典) | binary asset |
| **FOLDER** | 構造的なまとめ(容器) | parent-child relation |
| **TAG** | 横串の意味付け | label set(W1) |
| **RELATION** | 個別の繋がり(糊) | graph edge(structural / categorical / semantic / temporal) |

semantic gap が無く、book / youtube / album / paper / film 等の新概念は **既存語彙の組み合わせ + 適切な viewing で十分表現可能**。新 archetype は **生まない**。

### 1.2 book / youtube / album の写像例

```
"ノルウェイの森" を扱う:
  ├─ TEXT entry "書誌 + 感想まとめ"           # 整理された思考
  ├─ TEXTLOG entry "読みながらのメモ"          # 思考の道程
  ├─ TODO entries "読了" "感想を書く"          # マイルストーン
  ├─ ATTACHMENT cover.jpg / scan.pdf          # 一次資料
  ├─ FOLDER "新潮文庫"                        # 構造的まとめ
  ├─ TAG: #book #read #favorite              # 横串
  └─ RELATION: TEXT root ⇄ cover / memo / 関連 book   # 糊

"Rust 入門動画" を扱う:
  ├─ TEXT entry "視聴メモ + 感想"
  ├─ TODO "視聴" "コード写経"
  ├─ ATTACHMENT thumbnail
  ├─ TAG: #youtube #watched #lang:rust
  └─ RELATION: TEXT root ⇄ thumb / 写経した code TEXT

"2024 夏旅行" album:
  ├─ FOLDER "2024-summer"
  ├─ ATTACHMENT × N(写真群)
  ├─ TEXT entries(各日のキャプション / 旅程)
  ├─ TAG: #album #travel #2024-summer
  └─ RELATION: FOLDER ⇄ photos / TEXT 各日記
```

→ **新 archetype ゼロ、新 schema ゼロ、新 bundle format ゼロ**。

---

## 2. データの持ち方: Hybrid Z(責務 3 分離)

| Layer | 担当 | 例 | 既存 PKC2 facility |
|---|---|---|---|
| **Frontmatter**(body 内 YAML) | 「**この entry 自体の固有プロパティ**」 | `kind: book` / `author: 村上春樹` / `year: 1987` / `isbn: ...` / `url: ...` | 新規(YAML mini parser) |
| **Tags** | 「**user 駆動の横串分類**」 | `#read` / `#to-read` / `#favorite` / `#2024-summer-reading` | W1 Tag(完了) |
| **Relations** | 「**他 entry / asset との繋がり**」 | structural: book ⇄ cover / semantic: book ⇄ memo / book ⇄ 影響受けた本 | `Relation.kind`(完了) |

各層が **明確に直交した責務** を持つ。

### 2.1 Frontmatter: book

```yaml
---
kind: book
author: 村上春樹
year: 1987
publisher: 講談社
isbn: 9784062748681
language: ja
read_at: 2024-03-15
rating: 4
---

# 感想
...
# 引用
...
```

### 2.2 Frontmatter: youtube

```yaml
---
kind: youtube
url: https://youtube.com/watch?v=xxx
channel: ProgrammingChannel
published_at: 2024-01-10
duration: PT25M30S
language: en
---

# 視聴メモ
...
```

### 2.3 Frontmatter: album

```yaml
---
kind: album
period_start: 2024-07-15
period_end: 2024-07-20
location: 京都
---

# 旅程
...
```

### 2.4 Frontmatter parser: 自前 YAML mini

- 平坦な key:value(string / number / date)+ 配列値のみサポート、nest なし
- 規模: ~2-3 KB pure TS
- 実装: features 層に `parseFrontmatter(body) → { meta, body_remainder }`、core 影響なし
- markdown-it との結合: `body_remainder` を既存 markdown-it に渡す
- backward compat: 不在 entry もそのまま動作(`{}` を返す)
- dep 増加: **0**(外部 lib なし)

### 2.5 入力負担減フロー(本案の最大価値)

| 操作 | 旧来(手動) | 新フロー(Hybrid Z + auto-fill) |
|---|---|---|
| book 追加 | TEXT 作成 → title / author / year / publisher 全手入力 → cover 探して attach → tag 付け、~3-5 分 | ISBN paste(またはモバイル barcode scan)→ OpenBD / Google Books fetch → frontmatter 自動 fill + cover ATTACHMENT 自動作成 + relation 自動 → memo のみ書く、**~10 秒 + memo 時間** |
| youtube 追加 | URL を memo に貼る → title / channel 確認 → tag 付け | YouTube URL paste → oEmbed fetch → frontmatter + thumbnail ATTACHMENT 自動 |
| 論文追加 | 同上 | DOI paste → CrossRef API → frontmatter 自動 |
| 漫画 / レコード / 映画 | 同上 | ISBN / MusicBrainz / TMDB 等 |

**外部 API → frontmatter 自動 fill** で **入力負担 90% 削減**(Phase 3b で着地)。

---

## 3. 表示層: Filer view + 5 subset profile

### 3.1 Filer view = 第 4 view-mode

```ts
viewMode: 'detail' | 'calendar' | 'kanban' | 'filer';  // 'filer' 新規追加
```

既存 calendar / kanban と並列、tab UI / shortcut / persistence は同 pattern。

### 3.2 Subset profile via tag + frontmatter query

`folder.display_profile?: FilerProfile`(folder entry の additive optional field)

| Subset | query | 表示 |
|---|---|---|
| `explorer` | filter なし | table(name / date / archetype / tags) |
| `contact-sheet` | `archetype === 'attachment' && type starts 'image/'` | grid サムネイル + caption |
| `book-base` | frontmatter `kind === 'book'` | grid card(cover + author / year / rating) |
| `youtube-base` | frontmatter `kind === 'youtube'` | grid card(thumb + channel + duration) |
| `graph` | folder 内 entry + relation を network 可視化 | force-directed graph |
| (拡張) `paper-base` | `kind === 'paper'` | … |

`book-base` / `youtube-base` の認識は **frontmatter 一行**(`kind: book`)で完結、tag も組合せ可能(`#read` で filter 等)。

### 3.3 Subset profile の override 経路

- folder 属性 = container 内 default(export 同伴)
- localStorage = user 個別 override(content 不変、UI 状態)
- query string = debug / one-shot 上書き

→ R7 確定:**content + UI override の 2 層**。

---

## 4. Graph view: vanilla TS + PKC1 force config 流用

### 4.1 Engine 選択

| Option | 規模 | dep | 採否 |
|---|---|---|---|
| **A** バニラ TS 自前(Verlet + spring + repulsion + 必要時 Barnes-Hut) | ~5-8 KB | 0 | **★ 確定** |
| B d3-force 単独 build-time bundle | ~42 KB | +1 | 不採用(Phase 2 中に問題出た時の fallback) |
| C d3 フル | ~272 KB | +1 | 不採用(overkill) |

### 4.2 PKC1 force config 流用

PKC1(`docs/requirements/00-01_参考_前世代PKC1.html`)で実機調整済の値:

```ts
forceLink:        distance: 70
forceManyBody:    strength: -180
forceCenter:      x: width/2, y: height/2
forceCollide:     radius: 20
```

→ Phase 2 実装時、初期値としてそのまま採用。`?pkc-debug=graph-view` で runtime tweak 可能(reform-2026-05 §debug-via-url-flag-protocol 準拠)。

### 4.3 Render layer

- 小〜中規模(N < 500): SVG(既存 PKC2 renderer pattern と同形)
- 大規模(N ≥ 500): canvas(performance、必要時 Phase 4+ で追加)

### 4.4 Layout Engine Substitution Trigger

実装中に N=500-1000 の実 data で収束 / 体感が破綻した場合、**Phase 2 内で Option B(d3-force build-time bundle)に切替**(+42 KB、許容範囲)。spec doc に escape hatch を明文化。

---

## 5. Folder ZIP export 拡張(subgraph reachability)

### 5.1 既存 `pkc2-folder-export-bundle` の限界

`src/adapter/platform/folder-export.ts`:
- archetype filter: `text || textlog` のみ → 拡張必要
- asset 同梱: text/textlog body の `asset:K` ref のみ → 拡張必要

### 5.2 拡張仕様

- archetype filter 撤廃(任意 archetype を bundle 対象に)
- asset reachability: `entry:` / `asset:K` ref を walk(既存 `build-subset.ts` パターン流用)
- frontmatter 内の `cover_asset:` / `thumbnail:` 等の asset reference も scan
- manifest version 1 → 2(additive、reader は version field で分岐、v1 reader は backward-compat)
- 大容量警告(画像主体 folder で容量 estimate 表示、cancel 経路)

### 5.3 reachability scope(R'15 確定)

- subgraph = **TEXT root から 1 hop の全 relation を walk**(structural / semantic / temporal)、それで到達した entry / asset を再帰的に walk
- cycle guard 既存(`build-subset.ts`)
- folder 境界 stop(別 folder の entry は別 export)

---

## 6. PKC2 invariants との照合

| 不変条件(`CLAUDE.md` §Invariants) | 整合性 |
|---|---|
| 5-layer 構造 | ◎(core 不変、features に YAML mini + graph layout、adapter で UI) |
| core に NO browser API | ◎(YAML mini / graph layout は pure TS) |
| Single HTML | ◎(dep 0、build-time bundle なし、Phase 2 vanilla TS) |
| Container is source of truth | ◎(frontmatter は body の一部、display_profile は folder 属性) |
| Backward compatibility | ◎(archetype / schema 不変、frontmatter 不在 entry もそのまま) |
| No premature abstraction | ○(YAML mini / graph layout / subset query は具体機能の最小実装) |

→ **6 / 6 invariant に完全整合**。

---

## 7. Wave 構造(最終)

| Phase | 内容 | サイズ | 必要性 |
|---|---|---|---|
| **1** | filer view 第 4 view-mode + explorer subset(folder 内 entry を table 表示)| 中(~2 PR) | MVP |
| **2a** | YAML mini frontmatter parser + frontmatter 表示(metadata pane / body 残部 markdown render) | 小(~1 PR) | MVP |
| **2b** | graph view(vanilla TS、PKC1 force config 流用、subset profile `graph` 着地) | 中(~2 PR) | MVP(user 必須要件) |
| **3a** | subset profile via frontmatter+tag query(book-base / youtube-base / contact-sheet) | 中(~2 PR) | MVP |
| **3b** | 入力負担減: ISBN / DOI / oEmbed auto-fill(外部 API、user opt-in)+ smart paste 検出 + template 駆動 entry 作成 | 中(~2 PR) | **MVP**(本案最大の体験向上) |
| **4** | folder ZIP export 拡張(subgraph reachability、asset 同梱、archetype filter 撤廃、manifest v2)| 中(~1 PR) | MVP |
| **5** | inventory query UI(Bases 風 filter / sort / group over frontmatter+tag+relation)| 中(~2 PR) | MVP |
| **計** | | **~12 PR、~3 ヶ月** | |

---

## 8. 既存 doc / wave への影響

### 8.1 領域 10-3 IR との結合

frontmatter は **IR primitive に直接 mapping**。`kind: book` は IR の `BlockType: book-card`、`author: X` は IR の `Property: author`。本 wave の Hybrid Z は IR 着地時に **migration cost ゼロ**(frontmatter 構造を IR がそのまま読み取る)。

### 8.2 領域 6 markdown 方言 / Pandoc export との結合

frontmatter は **Pandoc / Word / PPT export と native 互換**(Pandoc は frontmatter を document metadata として扱う)。領域 6 で確定する dialect 拡張(下線 / 段落 align / 改ページ等)と直交。

### 8.3 領域 10-5 PKC-extension data 渡し

frontmatter は serializable / portable。PKC-extension(word / ppt renderer 担当)に IR + frontmatter を渡す経路は領域 10-5 で確立、本 wave は data side の準備。

### 8.4 既存 CANDIDATE doc(`data-model/`)への影響

- `complex-entry-archetype.md`(C-5):本 wave で **不採用**(TEXT atom + relation で代替)、CANDIDATE のまま温存
- `spreadsheet-entry-archetype.md`(C-4):独立、影響なし
- `office-preview-strategy.md`(C-7):独立、影響なし

---

## 9. 残存 Open Questions(Phase 内で決める実装判断)

| Q | 内容 | Phase | 既定値(spec doc で再確認) |
|---|---|---|---|
| OQ-1 | filer view の tab UI 配置(既存 calendar / kanban 隣 / 別位置) | 1 | calendar / kanban 隣に並列追加 |
| OQ-2 | folder.display_profile 編集 UI(meta pane の attribute editor) | 1 | meta pane に dropdown |
| OQ-3 | iPhone / mobile での filer table layout(column 縮退 / row expand)| 1 | column 縮退(name + date のみ)+ tap で row expand |
| OQ-4 | Frontmatter 編集 UI(専用 form / body 編集にそのまま) | 2a | body 編集にそのまま(MVP)、Phase 5 で form UI 検討 |
| OQ-5 | Frontmatter 不在 entry の subset filter 挙動 | 3a | `kind` 不在 = subset filter から除外 |
| OQ-6 | 入力負担減 sub-wave で採用する API 一覧 | 3b | OpenBD(JP book)/ Google Books(global book)/ YouTube oEmbed / DOI CrossRef / TMDB(film)/ MusicBrainz(record) — opt-in toggle で個別 enable |
| OQ-7 | 外部 API のレート制限 / privacy(user direction「local-only / privacy by default」遵守) | 3b | API 呼出は user 明示操作時のみ、auto-fetch なし、cached value は container 内 frontmatter として保存 |
| OQ-8 | inventory query UI で column 自由度 | 5 | MVP は frontmatter key 全部選択可、Bases 風 filter operator(==, contains, > 等)を最小実装 |
| OQ-9 | Layout Engine Substitution Trigger 判定基準 | 2b | N ≥ 500 で実機実測、収束 > 5s または FPS < 30 で B(d3-force)に切替 |
| OQ-10 | Folder ZIP 大容量警告閾値 | 4 | 100 MB 警告、500 MB 強制 cancel(user override で続行可) |

これらは Phase ごとの spec doc で確定、本 audit では既定値を提示。

---

## 10. Phase 1 spec doc に向けて

audit 後に起こす最初の spec doc:

**`filer-view-explorer-subset-spec.md`**(Phase 1 着地用):
- `viewMode: 'filer'` の追加(reducer / persistence)
- filer-view region の DOM 構造(`data-pkc-region="filer-view"`)
- explorer subset の table layout(column / row click → SELECT_ENTRY)
- folder.display_profile の schema 定義 + meta pane editor
- iPhone / mobile fallback(OQ-3)
- visual-state-parity test 構成(reform-2026-05 §6 + Phase 8 順序性)
- `?pkc-debug=filer-view` URL flag

着手目安:audit doc landing 直後、~1 週間で spec doc → ~1 週間で実装 PR(Phase 1 全体 ~2 PR)。

---

## 11. 却下経緯 archive(議論経緯保存)

本 audit は最初 α/β/γ/δ/ε(archetype 増設系)を比較検討し、ζ(subgraph)→ ζ'(TEXT-only)を経て ζ''(Hybrid Z + vanilla TS)に確定した。却下案を圧縮 archive:

| 案 | 内容 | 却下理由 |
|---|---|---|
| **α** | 新 archetype `book` / `youtube` 追加 | R2 archetype 増殖の連鎖コスト(~12 経路同期)、PKC2 archetype 体系完備の認識欠如 |
| **β** | folder display profile のみ、archetype 不変、generic / attachment + frontmatter | UX △(folder 属性で表示変化が初見で「何が起きた?」)、entry の意味が folder context 依存 |
| **γ** | 1 archetype `cataloged` + kind discriminator | archetype と kind の二重 type system、R2 緩和だが invariant 4 と緊張 |
| **δ** | C-5 COMPLEX archetype 経由 | wave サイズ膨張(~10-12 PR)、user 「最小単位以外のエントリは産まない」哲学に違反 |
| **ε** | 既存 attachment + frontmatter で book 化 | attachment archetype の二義化(添付 file vs book カード) |

確定形 ζ'' は **PKC2 archetype 体系を「完成した認知モデル」と認識**(user 言、本 doc §1.1)し、**archetype 増設ゼロで TEXT atom + Hybrid Z + viewing layer** で全要件を満たす形。

詳細な議論経緯は git log + PR #258 conversation 参照。

---

## 12. 参照

- roadmap: [`feature-requests-2026-04-28-roadmap.md`](./feature-requests-2026-04-28-roadmap.md) §領域 10-6
- 既存 archetype: `docs/spec/data-model.md` §4 / `docs/spec/body-formats.md`
- 既存 view-mode: `src/adapter/state/app-state.ts:322`
- folder-export 既存: `src/adapter/platform/folder-export.ts`
- W1 Tag: `docs/spec/tag-data-model-v1-minimum-scope.md`
- 既存 Relation kind: `docs/spec/data-model.md` §6
- PKC1 graph 実装: `docs/requirements/00-01_参考_前世代PKC1.html` 5511 行付近(d3.js v7.9.0 / forceSimulation / forceLink dist 70 / forceManyBody -180 / forceCollide 20)
- IR audit(領域 10-3): [`intermediate-representation-audit.md`](./intermediate-representation-audit.md)
- reform-2026-05 doctrine: `visual-state-parity-testing.md` / `debug-via-url-flag-protocol.md` / `debug-privacy-philosophy.md`
- C-5 COMPLEX(本 wave で不採用、CANDIDATE 温存): `data-model/complex-entry-archetype.md`
- USER_REQUEST_LEDGER §3.6 deferred items(本 wave 完了時に「filer-OPFS 連携」を追加)
