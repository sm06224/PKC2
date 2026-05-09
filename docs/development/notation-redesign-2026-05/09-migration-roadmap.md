# 09. Migration Roadmap(破壊的変更 / Phase 計画 / 移行手順)

## 9.1 破壊的変更カタログ

本記法整理の確定に伴う **breaking changes**(spec / 動作変更で既存 entry に影響):

| # | 変更 | 影響範囲 | 自動 migration 可? | severity |
|---|------|---------|-----------------|---------|
| 1 | `![label](entry:LID)` default が引用 chrome → seamless | embed 使用 entry 全体 | △(意図確認要)| **major** |
| 2 | `[[ruby:base\|読み]]` → `[base\|読み]` | ruby 使用 entry | ✓(機械置換可)| medium |
| 3 | `[[em:傍点]]` → `^^傍点^^` | em-dot 使用 entry | ✓(機械置換可)| medium |
| 4 | `<\|text` simple 廃止(`||` `|>` のみに) | left align 明示使用 entry | ✓(`<\|` を `:::paragraph{align=left}` に変換 or 削除)| minor |
| 5 | `^x^` superscript / `~x~` subscript native 削除(math mode で代替)| 該当 user(rare)| ✗(用途要 user 判断、math 化 or formal `:sup:[]`)| medium |
| 6 | bundle.css budget bump 512 KB → 1024 KB | build / deploy | ✓(自動)| minor(ops のみ) |
| 7 | code fence 既存 lang(json / yaml / 等)に `{view}` attribute 必要、default は plain syntax highlight | code fence 使用 entry | ✓(plain は変更なし、`view` 必要なら手動付与)| minor |

`major` = user 視認動作が大きく変わる、`medium` = syntax 変わるが migration tool で自動対応可、`minor` = ops / 一部 edge case のみ

## 9.2 非破壊的変更(additive only)

migration 不要、既存 entry に影響しない:

- frontmatter `writing` / `align` / `direction` 追加(default で従来動作)
- `^^em-dot^^` 新記法(`[[em:..]]` 廃止と並行、両形 parse)
- `[base|読み]` ruby 新記法(`[[ruby:..]]` 廃止と並行、両形 parse)
- `%%[fn]%%` footnote(既存 `%%hidden%%` は影響なし、新 attribute opt-in)
- `[^id]` `[^id]:` `^[inline]` Pandoc footnote 新規
- `$...$` `$$...$$` math 新規(KaTeX bundle 追加)
- code block renderer 新 lang(`tree` / `dbschema` / `query` / `cards` / etc.)
- `:::quote` `:::quote{author=...}` block directive 新規
- typo 寛容化(`|>` `<|` `|<` `>|` 全 4 形受理)
- inline `:role:[content]{attrs}` formal 全部新規

## 9.3 Phase 計画

各 Phase は **non-breaking** か **部分破壊** か明示。順序は依存関係 + リスク minimization で確定。

### Phase 1:formal 記法導入 + 共通基盤 + cap 管理 + profile system(non-breaking)

**期間**:2-3 週、5-8 PR

**scope**:

- **`src/runtime/caps.ts` 新規**:HARD_CEILINGS + SOFT_DEFAULTS + `resolveCap()` 共通 helper(§07.2.2)
- **`src/runtime/notation-profiles.ts` 新規**:profile 定義(`pkc-markdown-1.0` 等)
- 既存 cap 散在を `caps.ts` に集約(frontmatter / markdown / embed 等)
- `:::name{attrs}` block directive parser を強化(既存 `:::figure` `:::if` を含めて統一)
- `:role:[content]{attrs}` inline role parser 新規実装
- attribute syntax `{key=v key2=v2}` parser(Pandoc-style)
- frontmatter `notation` / `notation_overrides` field 認識(default = `pkc-markdown-1.0`)
- frontmatter `writing` / `align` / `direction` の predefined keys 認識
- 既存 simple 記法は不変、formal を追加で受理(可換性確保)
- typo 寛容化(`|>` `<|` `|<` `>|` 全 4 形)を align prefix で実装
- IR は **spec のみ**(§08)、persist / consume は本 reform 範囲外(post-reform 別 wave)

**non-breaking 確認**:既存 entry 全部が unchanged、test test 全 green

### Phase 2:simple 記法整理(部分破壊)

**期間**:2-3 週、3-5 PR

**scope**:

- `[[ruby:base|読み]]` → `[base|読み]` の **deprecate + 自動 migration script** 提供
  - parser は両形を引き続き受理、`[[ruby]]` 検出時に inspector で warning 表示
  - migration script(`scripts/migrate-notation-2026-05.ts`):dry-run / apply mode で全 entry 走査 + 機械置換
- `[[em:傍点]]` → `^^傍点^^` の同等 migration
- `<|text` simple 廃止 + `:::paragraph{align=left}` への migration option(廃止前 deprecated 期間)
- `^x^` `~x~` superscript / subscript 削除 +(該当 user 向け)formal `:sup:[]` 提案
- HTML pass-through 完全 off + build asserter 導入(`07-security-stance.md` §7.4)
- 全記法 hard cap 仕様の spec 化 + 実装(`07-security-stance.md` §7.2)

**部分破壊**:廃止記法の deprecation period 開始、user に migration script 提供

### Phase 3:embed seamless / quote(部分破壊)

**期間**:2 週、3-5 PR

**scope**:

- `![label](entry:LID)` default 動作を seamless に変更(major breaking)
- `{quote}` attribute syntax + `:::quote` block directive 実装
- 6 surface 全部で seamless / quote 両 mode の render 整合(center pane / Split View / Viewer popup / textlog log / embed in embed / Rich copy)
- 既存 entry 検出 → inspector で「default 動作変更により表示が変わっている」警告
- 既存 user 向け frontmatter flag(`embed.default_mode = "quote"` で従来動作維持)

**major breaking**:user 影響が大、deprecation period 設けて段階的に転換

### Phase 4:math + footnote(non-breaking)

**期間**:3-4 週、3-5 PR

**scope**:

- KaTeX library + math fonts 完全 bundle(§05、~480 KB)
- system asset bundle architecture 初実装(`scripts/inline-fonts.cjs`)
- bundle.css budget 512 KB → 1024 KB に bump
- `$...$` inline math + `$$...$$` block math + GitHub-style disambiguation
- `%%[fn]%%` 可視 footnote attribute
- `[^id]` `[^id]: text` Pandoc-compat footnote
- `^[inline]` short footnote

**non-breaking**:全部新規 syntax、既存に影響しない

### Phase 5:Renderer Registry 基盤 + Phase A renderer(non-breaking)

**期間**:1-2 週、1-2 PR

**scope**:

- Renderer Registry architecture(§06.2)
- `CodeBlockChrome` 共通 component
- `tree` renderer
- `dbschema` renderer
- 攻撃面 cap / 共通 chrome / search box 等の基盤機能

**non-breaking**:既存 code block(plain / syntax highlight)は不変、`tree` `dbschema` は新 lang のみ

### Phase 6:object viewer(non-breaking)

**期間**:2-3 週、2-3 PR

**scope**:

- `json{view}` `yaml{view}` `toml{view}` `xml{view}`
- TOML parser library bundle(~30 KB)
- XML XXE 防御
- 共通 viewer DOM(折りたたみ / search / type badge)

**non-breaking**:既存 `json` / `yaml` / `toml` / `xml` plain は不変、`{view}` attribute opt-in

### Phase 7:PKC2 killer(query + cards、non-breaking)

**期間**:4-6 週、5-8 PR

**scope**:

- `query` DSL parser + executor + multi-view renderer
- `cards` LID list / tag query / backlinks-of
- live re-render(container 変化追従)
- security:read-only、副作用なし、cap 適用

**non-breaking**:全部新規 lang

### Phase 8:lightweight diagram(non-breaking)

**期間**:3-4 週、4-6 PR

**scope**:

- `mindmap` / `flow` / `seq` / `state` 4 種、独自軽量 SVG 実装
- Mermaid (~1.2 MB)を採用しないため独自実装、bundle 軽量(~80 KB 計)

**non-breaking**:全部新規 lang

### Phase 9:binary + hexdump + diff(non-breaking)

**期間**:2 週、2-3 PR

**scope**:

- `binary` struct schema + SVG layout
- `hexdump` xxd-style 表示
- `diff` side-by-side / inline color

**non-breaking**:全部新規 lang

### Phase 10〜(optional、需要次第)

- Phase G renderer(palette / quiz / regex / etc.)
- 編集 UX 連動(autocomplete engine)
- format 別 export(Word / PPT / LaTeX 等)、IR confluence(10-3 wave 連携)

### Phase Z(post-reform、別 wave)

reform Phase 1〜9 の **後** に検討する次フェーズ:

- **IR persist / consume 実装**(本 reform は spec のみ、code は post-reform):container.entry に IR を attach、cross-PKC import を IR-based lossless で
- **parser library 化**:`src/features/markdown/` を `@pkc/markdown` 独立 npm パッケージに extract、PKC2 が dependency として消費する形へ
- **3rd party tool 互換**:Pandoc filter / Obsidian plugin / VS Code extension 等が `@pkc/markdown` を使って PKC Markdown 互換を持てるよう開放
- **PKC ecosystem 横展開**:mobile / CLI / server stack の他 implementation

これらは PKC Markdown spec 1.0 着地後の発展形、reform Phase 1〜9 ではここまで進めない。

## 9.4 累計影響(全 Phase 実装後)

| metric | 現状 | reform 完了後 |
|--------|------|-------------|
| bundle.js | 970 KB | ~1.8 MB(40% / 4608 KB)|
| bundle.css | 150 KB | ~750 KB(73% / 1024 KB bumped)|
| dist/pkc2.html | 1.4 MB | ~2.3 MB(46% / 5 MB)|
| 記法数 | ~30 | 50+ |
| AI 生成適合性 | 高 | very 高(formal + math + footnote 全部 Pandoc/KaTeX 互換)|
| 編集 UX | basic | rich(IR-driven autocomplete / hover / lint)|

## 9.5 移行 tool

### 9.5.1 `scripts/migrate-notation-2026-05.ts`(NEW)

```bash
# dry-run mode:変更点を表示するだけ
npm run migrate-notation -- --dry-run

# apply mode:全 entry に migration を適用
npm run migrate-notation -- --apply

# scope 限定:特定 entry / lid のみ
npm run migrate-notation -- --apply --lid=moxhfs3j-0001
```

実装する変換:

- `[[ruby:base|読み]]` → `[base|読み]`
- `[[em:傍点]]` → `^^傍点^^`
- `<|text` (alone in line) → `:::paragraph{align=left} text :::` or 削除(user 確認)
- `^x^` superscript → math `$x$` 提案 or formal `:sup:[x]` 提案

各変換は **dry-run で diff 表示**、user が確認してから apply。

### 9.5.2 inspector overlay の deprecation 警告

`?pkc-debug=notation-migration` URL flag で起動時、廃止記法を含む entry を一覧表示:

```
Entry moxhfs3j-0001: [[ruby:漢字|かんじ]] (line 12) → migrate to [漢字|かんじ]
Entry moxhfs3j-0002: [[em:重要]] (line 5) → migrate to ^^重要^^
Entry moxhfs3j-0003: <|left text (line 8) → migrate or remove
```

click で該当 entry に jump、手動修正 or migration script 起動。

## 9.6 既存 PR との関係

現在 paused 中の PR:

- **#382**(Split View hotfix、embed 未展開 + line offset ずれ修正)
- **#383**(YAML natural extension、nested mapping / block scalar / cap & warnings / `/pkcfm*` snippets)

reform doc 確定後の対応:

- **#382**:Phase 1 / 3 で内容を吸収、PR 自体は close → reform-aligned PR で再着地(または現状のまま merge して、後続で reform 改修)
- **#383**:Phase 1 / 2 で内容を吸収、frontmatter parser の YAML extension は reform でも維持、`/pkcfm*` snippets は reform 後の simple / formal 形に合わせて再 design

具体的どう扱うかは reform 計画詳細(別 doc)で確定。

## 9.7 既存 doc の supersession

reform 確定後、以下 doc を本 doc set で supersede:

- `docs/development/markdown-dialect-extensions-spec-2026-05.md`(wave-10-2 spec)→ 本 doc set で完全置換、archive
- `docs/spec/markdown-dialect-for-ai-authors-v1.md`(AI 規約書 v1)→ v2 を起こす(本 doc set 確定後、AI 向けに再構築)
- `docs/development/notation-redesign-formal-simple-2026-05.md`(私の前回 draft)→ 本 doc set で frame inversion 後に supersede、archive

archive は `docs/development/archived/` 以下に move、INDEX で reference 切替。

## 9.8 全体期間見積もり

| Phase | 期間 |
|-------|------|
| 1(formal + 基盤) | 2-3 週 |
| 2(simple 整理 + 廃止) | 2-3 週 |
| 3(embed 動作変更)| 2 週 |
| 4(math + footnote)| 3-4 週 |
| 5(Registry + tree/dbschema)| 1-2 週 |
| 6(object viewer)| 2-3 週 |
| 7(query + cards)| 4-6 週 |
| 8(lightweight diagram)| 3-4 週 |
| 9(binary + hexdump + diff)| 2 週 |
| 計 | **20-30 週(5-7 ヶ月)** |

並列実行可能な Phase は並走で短縮可能、依存関係:1 → 2,4,5 → 3 → 6,7,8,9。

実 deploy は段階的、各 Phase 終了時に独立 release 可能(全部終わるまで待つ必要なし)。

## 9.9 レビュー観点

1. **breaking change の優先順位**:Phase 3(embed default seamless)が major breaking、ここを早期実行 vs 後段実行のどちらが安全か?
2. **migration tool 設計**:dry-run / apply の運用、user UX、edge case 対応
3. **deprecation period**:廃止記法の暖機期間(parser 受理 + warning)をどれくらい設けるか?
4. **bundle 累計**:Phase 4(KaTeX +480 KB)+ Phase 7(query + cards +50 KB)等で 5 MB budget 内、deploy / load 時間影響は?
5. **既存 PR の扱い**:#382 / #383 を reform-aligned で再 design するか、close して新 PR か?
6. **並列性**:Phase 1〜9 のうち、本当に並走できる組み合わせは?(依存関係の厳密化)
7. **release strategy**:user 視点での「これが新 PKC2」判別 timing、Phase 4 終了時 / Phase 7 終了時 のどこを「v2 release」にするか?
