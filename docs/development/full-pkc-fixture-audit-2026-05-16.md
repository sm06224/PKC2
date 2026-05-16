# PKC2 全拡張記法 fixture 4 surface 可換性 audit(PR-W14、2026-05-16)

User 直接指示(2026-05-16):
- 「ちゃんとした PKC-Markdown 全部を使わないのはなんで?」
- 「全部の拡張記法試せ」
- 「もちろん AST から解釈するように実装しろよ?」「意味ないことすんなよ?」
- 「自分で確認した?AST の解釈以前に PKC-Markdown がそのまま透けて、出てきてるよね」
- 「この徹底的な叩き直しに 20PRs 以上支払うことも厭いません。前回回収の負債だと思ってください」
- 「徹底的に直してください。必要ならマイグレーション分断(破壊的変更)も辞さない」

## 1. 目的

PKC2 markdown の全拡張記法を **AST から解釈** して、各 export surface(HTML / DOCX / PPTX / PDF)で **可換性** が担保されているか視覚的に検証する。`tests/features/ast/fixtures/full-pkc-fixture.md` が canonical fixture。

## 2. AST kind 一覧(37 件)

### Inline(21 件)

| AST kind | 記法例 | docx export | pptx export | 状態 |
|---|---|---|---|---|
| text | 普通の文字 | ✅ | ✅ | OK |
| strong | `**X**` | ✅ | ✅ | OK |
| emphasis | `_X_` / `*X*` | ✅ | ✅ | OK |
| strike | `~~X~~` | ✅ | ✅ | OK |
| inline-code | `` `X` `` | ✅ shading | ✅ | OK |
| mark | `==X==` | ✅ shading FFF3A0 | ✅ highlight FFF3A0 | OK |
| em-dot | `..X..` / `^^X^^` | ✅ italic | ✅ italic | **bug:literal `..` 残り**(PR-W15 fix) |
| ruby | `[[ruby:b\|r]]` | ⚠️ `base(rt)` plain | ⚠️ plain | **未 native**(PR-W17 で Word Ruby API) |
| sup | `:sup:[X]` | ❌ AST 化されない | ❌ | **未対応**(PR-W16 で decompose-pkc 実装) |
| sub | `:sub:[X]` | ❌ AST 化されない | ❌ | **未対応**(PR-W16) |
| span | `:role:[X]{attrs}` | ⚠️ children flat | ⚠️ | 軽微対応 |
| link | `[X](url)` | ✅ | ✅ | OK |
| card | `@[card](...)` | ⚠️ children flat | ⚠️ flat | **未 native**(PR-W23) |
| embed | `![](entry:lid)` | ⚠️ children flat | ⚠️ flat | **未 native**(PR-W23) |
| image | `![X](src)` | ✅ ImageRun | ✅ addImage | OK |
| auto-ref | `[@id]` | ⚠️ `@id` plain | ⚠️ plain | **未 native**(PR-W19 で cross-ref) |
| var | `{{vars.x}}` | ✅ 展開 | ✅ 展開 | OK |
| math-inline | `$X$` | ❌ AST 化されない | ❌ | **未対応**(PR-W18 で OMML / docx native) |
| comment-inline | `%%X%%` | ✅ drop | ✅ drop | OK |
| footnote-ref | `[^id]` | ✅ **W18 FootnoteReferenceRun + footnotes.xml** | ⚠️ | docx native済(PR-W18)、HTML 側も markdown-it-footnote plugin で native、**pptx 後続** |
| opaque-inline | LaTeX 等 raw | ✅ original 保持 | ✅ | OK |
| citation | `[@id]`(prefix なし) | ⚠️ `@id` italic plain | ⚠️ | **未 native**(PR-W19) |

### Block(16 件)

| AST kind | 記法例 | docx export | pptx export | 状態 |
|---|---|---|---|---|
| heading | `# X` | ✅ 章節項 numbering | ✅ slide split | OK |
| paragraph | 普通段落 | ✅ | ✅ | OK |
| quote | `> X` / `:::quote{author}` | ✅ + **W14 author attribution** | ⚠️ author 未対応 | docx native済(PR-W14)、**pptx 後続**(PR-W15) |
| list | `- X` / `1. X` / `- [ ] X` | ✅ + W12 task glyph 色化 | ✅ | OK |
| table | `\| X \|` | ✅ + cell formatting | ✅ | OK |
| code-block | ` ```X ` | ✅ csv → table | ✅ csv → table | OK |
| code-render | ` ```mermaid ` | ❌ plain text | ❌ plain text | **未対応**(PR-W24 で image) |
| break | `---` / `\page` | ✅ rule / page | ✅ slide split | OK |
| figure | `:::figure{id=X}` | ✅ **W14 caption + auto-num** | ⚠️ caption 未対応 | docx native済、**pptx 後続**(PR-W15) |
| section | `:::section{role=X}` | ✅ **W14 role 別 callout box** | ⚠️ role 未対応 | docx native済、**pptx 後続**(PR-W15) |
| if-block | `:::if{format=X}` | ✅ **W14 format=docx 以外を skip** | ✅ pptx 以外 skip(後続 PR で) | docx native済、**pptx 後続** |
| comment-block | `:::comment` | ✅ drop | ✅ drop | OK |
| blank | `_<N>` | ⚠️ 1 行扱い | ⚠️ | **未対応**(PR-W21 で N 行 spacer) |
| math-block | `$$...$$` | ❌ AST 化されない | ❌ | **未対応**(PR-W18 で OMML) |
| definition-list | `term\n: desc` | ❌ AST 化されない | ❌ | **未対応**(PR-W22 で decompose + docx native) |
| opaque-block | raw | ✅ original 保持 | ✅ | OK |

## 3. AST 未対応 / decompose-pkc bug 一覧

直前の audit(`grep -oE "kind" full-ast.json | uniq -c`)で 0 件:
- `math-inline` / `math-block` — `$X$` / `$$X$$` は AST node 化されない
- `sup` / `sub` — `:sup:[X]` / `:sub:[X]` formal 形が decompose されない
- `definition-list` — `term\n: desc` syntax 未対応

literal text 残り(`grep -c LITERAL` in docx XML):
- `..` x2:em-dot `..X..` の不完全 decompose、片方 `..` 文字が text に残る
- `:::quote` x1:`:::quote{author="..."}` open marker の syntax text 残り
- `+++` x1:section break syntax(`AstBreak(kind=section)` 等?)未対応

## 4. 後続 Wave Z 計画(20+ PR、徹底返済)

User 認可「20 PR 以上、破壊的変更も辞さない」を受けた構造的改修計画:

### Wave Z.2(user feedback driven dense layout + literal 0 + footnote native、着地済 4 PR)

User の継続 feedback「順序リストぶら下げ / バレット大 / 表余白 / footnote 機能してない」を受けて当初計画と着地順序が変化した。**完了**:

- ✅ **PR-W15** literal 残り 0 件達成(audit script 4 種 → 0)+ 順序リスト hanging 240 twip 詰め
- ✅ **PR-W16** bullet list 自前 `pkc-bullet` numbering(glyph `·` 中点 + hanging 240、docx default の巨大 `•` 撤廃)
- ✅ **PR-W17** 表 cell padding 60 twip + `TableLayoutType.AUTOFIT`(従来固定均等幅で「同じセルサイズと絶対おかしい」状態だった)
- ✅ **PR-W18** footnote 真の native — docx `FootnoteReferenceRun` + `Document.footnotes` API、HTML `markdown-it-footnote` plugin

### Wave Z.3(残 P1 native 化、5 PR、後続)

- **PR-W19** pptx 側 section role / if-block / figure caption / quote author native(docx 同等)
- **PR-W20** sup / sub `:sup:[X]` / `:sub:[X]` formal を decompose-pkc に実装 + AST 化
- **PR-W21** ruby を Word `<w:ruby>` element で native 実装(現状 `base(rt)` plain → 真のルビ)
- **PR-W22** math-inline / math-block の OMML(Office Math)実装 + decompose-pkc で `$X$` / `$$X$$` AST 化
- **PR-W23** auto-ref / citation を docx bookmark + REF field で cross-ref native

### Wave Z.4(P2 拡張、4 PR)

- **PR-W24** blank-line marker `_<N>` を AST node 化 + docx で N 行 spacer paragraph
- **PR-W25** definition-list を decompose-pkc で AST 化 + docx native(現状 paragraph fallback)
- **PR-W26** card / embed を AST native + docx で entry preview(現状 children flat)
- **PR-W27** mermaid code-render を image(svg → png)化 + docx ImageRun

### Wave Z.5(P3 + 環境系、5 PR)

- **PR-W28** html-render fence を image 化 + docx ImageRun(現状 plain text)
- **PR-W29** TOC `:::toc{depth=N}` を docx TableOfContents native
- **PR-W30** docx running header / footer / page number / frontmatter core props(title / author / date を Word file properties に)
- **PR-W31** code-block syntax highlight を language-specific color runs(現状 plain monospace)
- **PR-W32** writing: vertical + direction: rtl を docx textDirection / bidi

### Wave Z.6(L-5 / L-8 / L-9 align / indent、3 PR)

- **PR-W33** paragraph align prefix L-5(`||` `|>` `<|`)を AstParagraph.align に AST 化
- **PR-W34** paragraph indent L-9(`>>`)を AstParagraph.indent に AST 化
- **PR-W35** `:::paragraph{align=...}` block を AstParagraph + alignAttr に AST 化(現状 children flat)
- **PR-W36** `+++` section break を AstBreak(kind=section)で AST 化 + docx で thin divider rendering

**累計 22 PR**(W15-W36)。W15-W18 完了、残 18 PR が後続着地予定。各 PR で fixture を全件再 render + literal 残り audit + native 実装 visual confirmation。破壊的変更が必要な場合は MIGRATION ノートを `CHANGELOG_v2.4.0.md`(次 minor bump 候補)に記載。

## 5. 検証方法

`tests/features/ast/fixtures/full-pkc-fixture.md` を 4 surface に render:

```bash
# AST + 4 surface 出力(test 経由)
npx vitest run tests/features/ast/full-pkc-fixture-render.test.ts  # 後続 PR で追加

# 視覚 verify(LibreOffice headless + chromium)
bash scripts/vtest.sh /tmp/vtest-fullfixture/full.docx /tmp/vtest-fullfixture/full-docx
bash scripts/vtest.sh /tmp/vtest-fullfixture/full.pptx /tmp/vtest-fullfixture/full-pptx
chromium --headless --screenshot=...  file:///tmp/.../full-html.html

# Literal 残り audit(0 件を目指す)
python3 -c "
import zipfile, re
with zipfile.ZipFile('/tmp/.../full.docx') as z:
    xml = z.open('word/document.xml').read().decode()
texts = re.findall(r'<w:t[^>]*>([^<]*)</w:t>', xml)
joined = ''.join(texts)
for p in ['==', '..', '%%', '{{', '[[', ':::', '[@', ':sup:', ':sub:', '^^^', '\\\\page', '+++', '\$\$']:
    if joined.count(p) > 0:
        print(f'LITERAL: {p!r} x{joined.count(p)}')
"
```

## 6. 視覚証跡(docs/manual/images/pkc-fixture/)

- `html.png`:PKC2 base.css inline + chromium headless screenshot
- `docx-page1.png` 〜 `docx-page7.png`:LibreOffice headless → PDF → pdftoppm @96dpi
- (pptx は別 PR で attach)
