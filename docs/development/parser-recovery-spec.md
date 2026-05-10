# Parser recovery spec(reform-2026-05 Phase 2 PR-2I)

**起草**:2026-05-10、ChatGPT 提案 #8 受容に伴う既存 parser tolerance の体系化。

## motivation

PKC2 は **AI 編集前提の知識構造フォーマット** として、LLM 出力の不完全さに対する **parser robustness** が極めて重要。本 doc は **既存 parser tolerance の集約 + future enhancement の roadmap**。

## 既存 tolerance(reform Phase 1 で実装済)

| ケース | 挙動 | 実装箇所 |
|--------|------|---------|
| `:::quote` 閉じ `:::` 無し | EOF まで content として処理、warning なし(`PKC1007 PARSER_DIRECTIVE_UNCLOSED` 候補) | `processQuoteBlocks` |
| `:::if` 閉じ `:::` 無し | 同上、content は match 時通常 emit、mismatch 時 strip | `processIfBlocks` |
| `:::section` 閉じ `:::` 無し | 同上、`<section>` open のまま EOF | `processSectionBlocks` |
| `:::paragraph` 閉じ `:::` 無し | 同上、content は align 適用済で残置 | `processParagraphAlignDirective` |
| `:::figure` 閉じ `:::` 無し | content は figure 内 markup として残置(figure block 不完全) | `processFigureBlocks` |
| `:::comment` 閉じ `:::` 無し | strip されない、open 行 + 後続行が literal で残る(ambiguity 防止) | `stripComments` |
| 閉じ `]` 無し inline role(`:span:[unclosed`) | role match せず literal で残る(state.pos 不変) | `parseInlineRoleAt` |
| 閉じ `}` 無し attrs(`:::quote{author=`) | directive open match せず literal で残る | `parseBlockDirectiveOpen` |
| smart quote(`{id=“fig1”}`) | ASCII / smart 両方受理(typographer / textarea autocorrect 対策) | `parseBlockDirectiveAttrs`、`processFigureRefs` |
| 不正値 frontmatter(`writing: diagonal`)| `invalid_value` warning + key undefined 復帰 | `extractDocumentGlobals` |
| 不正組み合わせ(`writing: horizontal align: top`)| `invalid_combo` warning + align undefined 復帰 | 同上 |
| size cap 超過 frontmatter(>16KB)| `size_limit` warning + parse 中止 + body 返却 | `parseFrontmatter` |
| `_<N>` cap 超過(N>50)| count=cap 適用 + visible 警告 banner(`⚠ _N (上限 cap)`) | `processBlankLineMarkers` |
| 未定義 vars(`{{vars.x}}` で x 未定義)| `<span class="pkc-variable-undefined">` で visible warning | `expandVarsInText` |
| 未登録 figure ref(`[@unknown]` / `:autoref:{id="unknown"}`)| literal 残置 | `processFigureRefs` |
| 未知 inline role(`:bogus:[x]`)| L-6 simple-inline へ fall-through、それも match しなければ literal | `inlineRoleRule` |
| 未知 block directive(`:::unknown{}`)| literal 残置(parseBlockDirectiveOpen 経由しない) | `processQuoteBlocks` 等は name match で gate |
| 未知 :::section role | `data-pkc-role` raw stamp / class は generic only(allowlist 経由 fallback)| `processSectionBlocks` |
| XSS 不正 `:span:` attrs(`onclick=…`)| silent skip(SPAN_SAFE_ATTRS allowlist 外) | `pushInlineRoleTokens` |
| fenced code block 内 marker | 全 directive / inline role / em-dot / etc. が marker 扱いせず literal | `fenceTransition` 共通 helper |
| HTML pass-through | `html: false` で `<div>` 等 escape | markdown-it config |

## fence-aware preprocessor pipeline

PKC2 の preprocessor は **`fenceTransition` を必ず通す**規律で fence 中の marker 誤発火を防ぐ。これは reform-2026-05 §11 教訓(wave-10-2 の fenced code 内 marker 誤発火 5 件 hotfix)を doctrinize したもの:

```
processBreakDirective       → fenceTransition aware
processSectionBreaks        → fenceTransition aware
expandVarsInText            → fenceTransition aware
processIfBlocks             → fenceTransition aware (inner fence + outer fence 両方)
processBlankLineMarkers     → fenceTransition aware
processFigureBlocks         → fenceTransition aware
processQuoteBlocks          → fenceTransition aware
processSectionBlocks        → fenceTransition aware
processParagraphAlignDirective → fenceTransition aware
preprocessAlignPrefix       → fenceTransition aware
stripComments               → fence 外 region のみ regex
```

## future enhancement(Phase 2+)

未対応の recovery シナリオ:

| ケース | 現状 | 望ましい挙動 |
|--------|------|------------|
| fence 未閉鎖(`` ``` `` だけ) | EOF まで code 扱い | warning + best-effort 復元(仮 `} ``` `` close 想定) |
| nested directive depth 不整合 | 内側 ::: で外側を close 誤判定 | depth tracking で正しく nest(現状 `:::if` のみ実装、他 directive にも展開) |
| table 行欠損 / pipe 不整合 | markdown-it の rendering 任せ | 行ごとに pipe 数を resolve、不整合行は warning + skip |
| frontmatter YAML invalid syntax | `parseFrontmatter` の現行 simple parser で拾えない記法は silent skip | 構造化 warning(`PKC1002 PARSER_FRONTMATTER_MALFORMED`)+ best-effort 部分 parse |

これらは Phase 3 以降で順次着手。

## warning code 連動

本 doc 記載の各 tolerance ケースには `src/features/notation/warnings.ts` の `WARNING_CODES` が対応する code を持つ:
- `PKC1007 PARSER_DIRECTIVE_UNCLOSED`(directive 未閉鎖)
- `PKC1008 PARSER_DIRECTIVE_MALFORMED_ATTRS`(attrs malformed)
- `PKC2003 SEMANTIC_VAR_UNDEFINED`(未定義 vars)
- `PKC2004 SEMANTIC_REF_UNKNOWN_TARGET`(未登録 ref)
- `PKC3001 RENDERER_BLANK_LINE_CAPPED`(`_<N>` cap)
- `PKC5002 SECURITY_UNSAFE_ATTR_DROPPED`(span style 等 skip)
