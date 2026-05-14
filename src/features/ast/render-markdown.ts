/**
 * AST → Markdown renderer(PR-2JJ v2、PR #432 stack)。
 *
 * 設計:
 *   - 2 mode:`'gfm'` = PKC 拡張を剥がして commonmark + GFM 標準にする
 *     (相互運用用)、`'pkc'` = 正規記法 PKC MD で出力(AST round-trip 想定)
 *   - 反復安定性(idempotency):`render(parse(render(parse(src))))` が
 *     1 周目以降同じ output を出す(後続反復で content が削れたり壊れたり
 *     しないことを保証、`tests/features/ast/render-markdown-roundtrip.test.ts`
 *     で test)
 *   - 出力は **string**(JSONL ではない、行で構成された MD)
 *
 * ⚠️ 重大な制約(2026-05-13 user 指摘 + bridge layer の限界):
 *   - 現 parser(PR-2Y / PR-2Z scope)は **commonmark + GFM core のみ cover**
 *     で、PKC 拡張(`:lead:` / `:emphasis:` / `:strong:` / `:spacing:` /
 *     `:align:` / `:quote:` / `:caption:` / `:::section` / `:::comment` /
 *     `:::figure` / `:::if` / `{{vars.x}}` / `[@autoref]` 等)を AST node
 *     として分解しない。すべて raw 文字列として `text` node に入る。
 *   - 「AST が可換」を真に達成するには parser 強化が必要(future wave)。
 *   - 本 implementation は **bridge layer**:render 後の string に対して
 *     PKC marker を line-aware に strip / 正規化することで、user fixture
 *     での output 品質を確保する。strict には AST が一意に decomposed
 *     されていないが、user visible output は GFM / PKC 両方とも fixture を
 *     概ね正しく扱う。
 *
 * Scope(本実装で対応する PKC marker):
 *   inline:
 *     - `:strong:[X]`  → `**X**`(gfm) / `**X**`(pkc)
 *     - `:emphasis:[X]` → `*X*`(gfm) / `*X*`(pkc)
 *     - `:code:[X]` → `` `X` ``
 *     - `:strike:[X]` → `~~X~~`
 *     - `:lead:[X]` → `X`(gfm:plain 段落)/ `**X**`(pkc:強調 fallback)
 *     - `:caption:[X]` → `X`(gfm:イタリック段落)/ `:caption:[X]`(pkc)
 *     - `:quote:{attribution="X"}` → 削除(gfm)/ 維持(pkc)
 *     - `:spacing:{size=N}` → 削除(gfm)/ 維持(pkc)
 *     - `:align:{position=X}` → 削除(gfm)/ 維持(pkc)
 *     - `[@id]` autoref → `@id`(plain)/ `[@id]`(pkc)
 *     - `{{vars.x}}` → AST.vars から expand(両 mode、未定義は literal)
 *   block:
 *     - `:::section{role=X} ... :::` → 中身展開(gfm)/ 維持(pkc)
 *     - `:::comment ... :::` → 完全削除(gfm)/ 維持(pkc)
 *     - `:::figure{id=X} ... :::` → 中身展開 + caption italic(gfm)/ 維持(pkc)
 *     - `:::if{format=html} ... :::` → 中身展開(gfm)/ 維持(pkc)
 *     - `:::if{format=pdf} ... :::` → 削除(gfm:今回 user fixture は HTML
 *       audience なので drop)/ 維持(pkc)
 */

import type {
  AstDocument,
  AstBlock,
  AstInline,
  AstNodeBase,
} from '@core/ast/index';

export interface RenderMarkdownOptions {
  /**
   * 出力形式:
   *   - `'gfm'`(default):commonmark + GFM 標準、PKC 拡張は plain に落とす
   *   - `'pkc'`:正規記法 PKC MD(可換世界の canonical 形)
   */
  mode?: 'gfm' | 'pkc';
}

export function renderAstToMarkdown(
  ast: AstDocument,
  opts: RenderMarkdownOptions = {},
): string {
  const mode = opts.mode ?? 'gfm';
  const lines: string[] = [];

  // YAML frontmatter — globals + vars(両 mode で出す。GFM consumer は無視可)
  const fm: string[] = [];
  if (ast.notation) fm.push(`notation: ${ast.notation}`);
  if (ast.writing) fm.push(`writing: ${ast.writing}`);
  if (ast.direction) fm.push(`direction: ${ast.direction}`);
  if (ast.align) fm.push(`align: ${ast.align}`);
  if (ast.vars && Object.keys(ast.vars).length > 0) {
    fm.push('vars:');
    for (const [k, v] of Object.entries(ast.vars)) {
      fm.push(`  ${k}: ${JSON.stringify(v)}`);
    }
  }
  if (fm.length > 0) {
    lines.push('---');
    lines.push(...fm);
    lines.push('---');
    lines.push('');
  }

  for (const block of ast.children) {
    const out = renderBlock(block, mode);
    if (out.length > 0) {
      lines.push(out);
      lines.push('');
    }
  }

  // 末尾の余分な blank を 1 個にまとめる
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  let result = lines.join('\n') + '\n';

  // ── Post-process bridge layer(PR-2JJ v2 hotfix、2026-05-13、user fixture
  // 対応):AST に raw 残留した PKC 拡張を全文字列に対して line-aware に
  // strip / 正規化。詳細は本ファイル先頭の Scope セクション参照。
  //
  // ChatGPT review 反映(2026-05-13):AstVar は semantic IR としてそのまま
  // 残し、render target が決定する。
  //   - PKC mode → `{{vars.x}}` literal を保持(template として serializable)
  //   - GFM mode → vars 値で expand(consumer は template を解釈できない)
  if (mode === 'gfm') {
    result = expandVarsInOutput(result, ast.vars ?? {});
    result = stripPkcBlocksForGfm(result);
    result = stripPkcInlinesForGfm(result);
  } else {
    result = normalizePkcMarkersForPkcMode(result);
  }
  // 後処理で発生した連続空行を折り畳む(2 連続まで残す)
  result = result.replace(/\n{3,}/g, '\n\n');
  return result;
}

/**
 * 出力 string 中の `{{vars.x}}` を AST.vars から expand。未定義 key は
 * literal で残す(`expandVarsInText`(markdown-render.ts)と semantics 同等)。
 * 反復安定性:expand 後に `{{vars.x}}` literal が残らないので、次 round
 * では parse → AST → render で同じ出力に収束。
 */
function expandVarsInOutput(text: string, vars: Record<string, string>): string {
  if (Object.keys(vars).length === 0) return text;
  return text.replace(/\{\{\s*vars\.([A-Za-z_][\w-]*)\s*\}\}/g, (m, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key] ?? m;
    }
    return m; // 未定義は literal
  });
}

/**
 * `:::section{role=X} ... :::` / `:::comment ... :::` / `:::figure{...} ... :::` /
 * `:::if{format=X} ... :::` を line-aware で処理。GFM mode 用。
 *
 * - `:::comment` → 完全削除(本文 + open / close marker、内側のコンテンツも消す)
 * - `:::if{format=pdf}` → 完全削除(本実装では export_audience=internal/html を
 *   想定、PDF 専用 content は GFM output から落とす)
 * - `:::if{format=html}` / `:::section` / `:::figure` → marker のみ剥がして
 *   中身は残す(段落として継続)
 *
 * 反復安定:剥がした output には `:::` が残らないので、次 parse でも同じ AST
 * (text node 集合)になり、再 render は同じ output に収束する。
 */
function stripPkcBlocksForGfm(text: string): string {
  // 単一行に `:::role{...} ... :::` 形式が現れる場合の処理を先に。
  // markdown-it が paragraph 結合した結果 AST text node に 1 line に
  // まとめて入ってくる症状の対応。non-greedy `[\s\S]*?` で最短一致。
  let pre = text;
  // (a)`:::comment ... :::` — drop entirely
  pre = pre.replace(/:::comment(?:\{[^}]*\})?[ \t\n]+[\s\S]*?[ \t\n]+:::/g, '');
  // (b)`:::if{format=pdf} ... :::` — drop entirely
  pre = pre.replace(/:::if\{[^}]*format\s*=\s*pdf[^}]*\}[ \t\n]+[\s\S]*?[ \t\n]+:::/g, '');
  // (c)その他 `:::role{...} content :::` 単一行 — marker drop、content 残す
  pre = pre.replace(
    /:::([a-zA-Z0-9_-]+)(\{[^}]*\})?[ \t\n]+([\s\S]*?)[ \t\n]+:::/g,
    (_m, _role: string, _attrs: string, content: string) => content,
  );
  // 単独 `:::comment{ ... }` 開始だけの fragment(close なし)
  pre = pre.replace(/:::comment(?:\{[^}]*\})?[ \t]+[^\n]*$/gm, '');
  const lines = pre.split('\n');
  const out: string[] = [];
  type Stack = Array<{ kind: 'comment' | 'pdf-only' | 'pass-through' }>;
  const stack: Stack = [];
  const OPEN_BLOCK_RE = /^[ \t]*:::([a-zA-Z0-9_-]+)(\{[^}]*\})?[ \t]*$/;
  const CLOSE_BLOCK_RE = /^[ \t]*:::[ \t]*$/;
  for (const line of lines) {
    if (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      // ネスト対応:close または next open
      if (CLOSE_BLOCK_RE.test(line)) {
        stack.pop();
        continue;
      }
      const m = line.match(OPEN_BLOCK_RE);
      if (m) {
        const kind = m[1]!;
        if (kind === 'comment') stack.push({ kind: 'comment' });
        else if (kind === 'if' && /format\s*=\s*pdf/.test(m[2] ?? '')) {
          stack.push({ kind: 'pdf-only' });
        } else {
          stack.push({ kind: 'pass-through' });
        }
        continue;
      }
      if (top.kind === 'comment' || top.kind === 'pdf-only') {
        // 内容を drop
        continue;
      }
      // pass-through:中身は emit
      out.push(line);
      continue;
    }
    // not inside a block
    const m = line.match(OPEN_BLOCK_RE);
    if (m) {
      const kind = m[1]!;
      if (kind === 'comment') {
        stack.push({ kind: 'comment' });
        continue;
      }
      if (kind === 'if' && /format\s*=\s*pdf/.test(m[2] ?? '')) {
        stack.push({ kind: 'pdf-only' });
        continue;
      }
      // section / figure / if{format=html} / その他 directive →
      // marker は drop、中身は段落として出す
      stack.push({ kind: 'pass-through' });
      continue;
    }
    if (CLOSE_BLOCK_RE.test(line)) {
      // 対応する open がない `:::` は literal として残す(防御)
      out.push(line);
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Inline PKC marker を GFM 等価表現に変換。AST text node に raw 残留した
 * marker を文字列 level で処理する。
 *
 *   :strong:[X]     → **X**
 *   :emphasis:[X]   → *X*
 *   :code:[X]       → `X`
 *   :strike:[X]     → ~~X~~
 *   :lead:[X]       → X(plain、段落として fallback)
 *   :caption:[X]    → *X*(italic、figure caption の見た目近似)
 *   :quote:{...}    → 削除
 *   :spacing:{...}  → 削除
 *   :align:{...}    → 削除
 *   [@id]           → @id(plain reference)
 *   ==text==        → text(mark drop)
 *   ..text..        → text(em-dot drop)
 *   %%hidden%%      → 削除(inline comment)
 */
function stripPkcInlinesForGfm(text: string): string {
  let s = text;
  // formal inline `:role:[X]` 系(spec PR-2B):X を semantic equivalent に
  s = s.replace(/:strong:\[\s*([\s\S]+?)\s*\]/g, '**$1**');
  s = s.replace(/:emphasis:\[\s*([\s\S]+?)\s*\]/g, '*$1*');
  s = s.replace(/:code:\[\s*([\s\S]+?)\s*\]/g, '`$1`');
  s = s.replace(/:strike:\[\s*([\s\S]+?)\s*\]/g, '~~$1~~');
  s = s.replace(/:lead:\[\s*([\s\S]+?)\s*\]/g, '$1');
  s = s.replace(/:caption:\[\s*([\s\S]+?)\s*\]/g, '*$1*');
  // tolerant alias attrs `:role:{...}` 系:基本的に視覚 hint なので drop
  s = s.replace(/^[ \t]*:quote:\{[\s\S]*?\}[ \t]*$/gm, '');
  s = s.replace(/:quote:\{[^}]*\}/g, '');
  s = s.replace(/:spacing:\{[^}]*\}/g, '');
  s = s.replace(/:align:\{[^}]*\}/g, '');
  // PKC mark / em-dot / hidden comment
  s = s.replace(/%%([^%\n]+?)%%/g, '');
  s = s.replace(/==([^=\n]+?)==/g, '$1');
  s = s.replace(/\.\.([^.\n]+?)\.\./g, '$1');
  // auto-ref `[@fig-X]` / `[@table-X]` 等の **図表参照** → `@id`(GFM plain)
  // PR-V2(2026-05-14):citation(`[@smith2020]` 等)は Pandoc syntax 互換で
  // brackets を残すので、prefix 判定で振り分ける。
  s = s.replace(
    /\[@([A-Za-z_][\w-]*)\]/g,
    (m, id: string) => (/^(fig|figure|table|tbl|eq|eqn|equation)-/i.test(id) ? `@${id}` : m),
  );
  return s;
}

/**
 * PKC mode の正規化:AST text node に raw 残留した marker を **canonical PKC
 * MD form** に揃える。可換性の確保のため、tolerant alias を canonical に
 * 寄せる(`:emphasis:[X]` などの formal inline はそのまま受理 spec、PKC
 * authoring の正規記法)。
 *
 * 反復安定:render → parse → render の 2 回目以降で同じ output になるよう、
 * spacing / blank line を正規化。
 */
function normalizePkcMarkersForPkcMode(text: string): string {
  // 連続する `:::` open / close が空行を挟まない場合に挟む(parse 後 markdown-it
  // が paragraph 結合する症状を避ける)
  // formal inline はそのままで OK、attrs hint も維持
  // hidden inline `%%` は visible content として残るので強制削除しない
  return text;
}

function renderBlock(block: AstBlock, mode: 'gfm' | 'pkc'): string {
  switch (block.kind) {
    case 'heading': {
      const hash = '#'.repeat(block.level);
      return `${hash} ${renderInlines(block.children, mode)}`;
    }
    case 'paragraph': {
      const text = renderInlines(block.children, mode);
      // PKC mode のみ align / indent を `{...}` attrs として出す
      if (mode === 'pkc') {
        const parts: string[] = [];
        if (block.align) parts.push(`align=${block.align}`);
        if (block.indent !== undefined && block.indent !== 0) {
          parts.push(`indent=${block.indent}`);
        }
        if (parts.length > 0) {
          return `${text}\n{${parts.join(' ')}}`;
        }
      }
      return text;
    }
    case 'quote': {
      const inner = block.children
        .map((b) => renderBlock(b, mode))
        .join('\n\n')
        .split('\n')
        .map((l) => (l.length > 0 ? `> ${l}` : '>'))
        .join('\n');
      if (mode === 'pkc' && block.citation && Object.keys(block.citation).length > 0) {
        const cite = Object.entries(block.citation)
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ');
        return `:::quote{${cite}}\n${block.children
          .map((b) => renderBlock(b, mode))
          .join('\n\n')}\n:::`;
      }
      return inner;
    }
    case 'list': {
      const lines: string[] = [];
      let idx = block.start ?? 1;
      for (const item of block.items) {
        let marker: string;
        if (block.listKind === 'ordered') {
          marker = `${idx}.`;
          idx++;
        } else if (block.listKind === 'task') {
          const check = item.state === 'done' ? 'x' : ' ';
          marker = `- [${check}]`;
        } else {
          marker = '-';
        }
        const itemText = item.children
          .map((b) => renderBlock(b, mode))
          .join('\n\n');
        const indented = itemText
          .split('\n')
          .map((l, i) => (i === 0 ? `${marker} ${l}` : `  ${l}`))
          .join('\n');
        lines.push(indented);
      }
      return lines.join('\n');
    }
    case 'table': {
      const lines: string[] = [];
      const aligns = block.align ?? [];
      for (let i = 0; i < block.rows.length; i++) {
        const row = block.rows[i]!;
        const cells = row.cells.map((c) => renderInlines(c.children, mode));
        lines.push(`| ${cells.join(' | ')} |`);
        if (i === 0 && row.isHeader) {
          const sep = row.cells.map((_, ci) => {
            const a = aligns[ci];
            if (a === 'left') return ':---';
            if (a === 'right') return '---:';
            if (a === 'center') return ':---:';
            return '---';
          });
          lines.push(`| ${sep.join(' | ')} |`);
        }
      }
      return lines.join('\n');
    }
    case 'code-block': {
      const lang = block.lang ?? '';
      return '```' + lang + '\n' + block.code + (block.code.endsWith('\n') ? '' : '\n') + '```';
    }
    case 'code-render': {
      // PKC:lang を維持、GFM:同じ書式で OK(rendering hint だけが PKC 拡張)
      return '```' + block.lang + '\n' + block.source + (block.source.endsWith('\n') ? '' : '\n') + '```';
    }
    case 'break': {
      if (block.breakKind === 'page') {
        return mode === 'pkc'
          ? `:::page-break${block.role ? `{role=${block.role}}` : ''}`
          : '---';
      }
      return '---';
    }
    case 'figure': {
      if (mode === 'pkc') {
        const inner = block.children
          .map((b) => renderBlock(b, mode))
          .join('\n\n');
        const cap = block.caption ? `\n\n${renderInlines(block.caption, mode)}` : '';
        // PR-2JJ v2 hotfix(2026-05-13、user fixture report):attrs.id /
        // attrs.kvs を round-trip 保持。`:::figure{kind=figure}` だけだと
        // `id="topology-overview"` 等の attrs 情報が失われる。
        const attrParts: string[] = [`kind=${block.figureKind}`];
        if (block.attrs) {
          if (block.attrs.id) attrParts.push(`id="${block.attrs.id}"`);
          for (const cls of block.attrs.classes) attrParts.push(`.${cls}`);
          for (const [k, v] of Object.entries(block.attrs.kvs)) {
            if (k === 'kind') continue; // already emitted
            if (v === true) attrParts.push(k);
            else if (v !== false) attrParts.push(`${k}=${JSON.stringify(v)}`);
          }
        }
        // marker 前後に **必ず blank line** を入れて、markdown-it が
        // close `:::` を直前 paragraph と結合しないように。
        return `:::figure{${attrParts.join(' ')}}\n\n${inner}${cap}\n\n:::`;
      }
      // GFM:figure marker を剥がして中身 + caption を plain に
      const inner = block.children.map((b) => renderBlock(b, mode)).join('\n\n');
      const cap = block.caption ? `\n\n*${renderInlines(block.caption, mode)}*` : '';
      return inner + cap;
    }
    case 'section': {
      if (mode === 'pkc') {
        const inner = block.children.map((b) => renderBlock(b, mode)).join('\n\n');
        return `:::section{role=${block.role}}\n\n${inner}\n\n:::`;
      }
      // GFM:section marker を剥がすだけだと role 情報が失われる(user 指摘
      // 2026-05-13:「AST section ブロックは GFM markdown の各行引用に
      // 解決しますか?」)。blockquote `> ` で各行を引用、role を太字 label
      // として先頭に追加することで GFM consumer でも視覚的 callout を保持。
      const inner = block.children.map((b) => renderBlock(b, mode)).join('\n\n');
      const roleLabel = `**${capitalize(block.role)}:**`;
      // blockquote 化:各行に `> ` を prefix、空行は `>` のみ
      const quoted = (roleLabel + '\n\n' + inner)
        .split('\n')
        .map((l) => (l.length > 0 ? `> ${l}` : '>'))
        .join('\n');
      return quoted;
    }
    case 'if-block': {
      if (mode === 'pkc') {
        const inner = block.children.map((b) => renderBlock(b, mode)).join('\n\n');
        return `:::if{format=${block.format}}\n\n${inner}\n\n:::`;
      }
      // PR-2JJ v2 final(2026-05-13、user direction「実装できるまでを終わり」):
      // GFM mode の format フィルタを **AST node level** で実施。
      // format=html / その他 web compatible は passthrough、format=pdf は drop。
      // 真の AST decomposition が利いてる証拠の経路(以前は string regex で対応)。
      if (block.format === 'pdf') return '';
      return block.children.map((b) => renderBlock(b, mode)).join('\n\n');
    }
    case 'comment-block': {
      // GFM:コメントは完全削除、PKC:`%%%`...`%%%` で復元
      // marker 前後の blank line で markdown-it の paragraph 結合を防ぐ。
      if (mode === 'pkc') {
        const src = block.source;
        return '%%%\n\n' + src + (src.endsWith('\n') ? '\n' : '\n\n') + '%%%';
      }
      return '';
    }
    case 'blank': {
      // blank node は paragraph 間の空行を制御するためのもの。
      // join('\n\n') で既に空行が入るため、ここでは追加しない。
      return '';
    }
    case 'math-block': {
      return '$$\n' + block.src + (block.src.endsWith('\n') ? '' : '\n') + '$$';
    }
    case 'definition-list': {
      // PR-2JJ v2 final(2026-05-13、Gemini review 反映):dl の MD 表現は
      // 多くの dialect で `term\n: description` 形式(Pandoc / PHP Markdown
      // Extra 等)。両 mode で同一(GFM 標準には無いが Pandoc / Hugo 等
      // 主要 dialect で widespread)。
      return block.items
        .map((it) => {
          const termText = renderInlines(it.term, mode);
          const descBlocks = it.description
            .map((b) => renderBlock(b, mode))
            .join('\n\n');
          // description の各行先頭に `: ` prefix、続く行は indent
          const descLines = descBlocks.split('\n');
          const formattedDesc = descLines
            .map((l, i) => (i === 0 ? `: ${l}` : `  ${l}`))
            .join('\n');
          return `${termText}\n${formattedDesc}`;
        })
        .join('\n\n');
    }
    case 'opaque-block': {
      // PR-2JJ v2 final(2026-05-13、ChatGPT review 反映):未知構文を
      // **lossless preserve**。両 mode で原文をそのまま emit。round-trip
      // 経路で再 parse されたとき AstOpaqueBlock に戻る(decompose-pkc が
      // sourceFormat hint で detect)。
      return block.original;
    }
    default: {
      // 未対応 kind は plain stringify(forward compatibility)
      const node = block as AstNodeBase & { kind: string };
      return `<!-- unsupported block kind: ${node.kind} -->`;
    }
  }
}

/**
 * 文字列を Title Case 化(`note` → `Note` / `warning` → `Warning`)。
 * GFM mode の section role label に使う。
 */
function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderInlines(
  inlines: readonly AstInline[],
  mode: 'gfm' | 'pkc',
): string {
  return inlines.map((n) => renderInline(n, mode)).join('');
}

function renderInline(node: AstInline, mode: 'gfm' | 'pkc'): string {
  switch (node.kind) {
    case 'text': {
      // PR-2JJ v2 hotfix(2026-05-13):text node の PKC marker 処理は
      // renderAstToMarkdown 末尾の post-process 層に集約(`stripPkcBlocks
      // ForGfm` + `stripPkcInlinesForGfm` + `expandVarsInOutput`)。
      // ここでは escape のみ。
      return escapeText(node.value);
    }
    case 'strong':
      return `**${renderInlines(node.children, mode)}**`;
    case 'emphasis':
      return `*${renderInlines(node.children, mode)}*`;
    case 'strike':
      return `~~${renderInlines(node.children, mode)}~~`;
    case 'inline-code': {
      // backtick が含まれる場合は二重 backtick で囲む
      const ticks = node.value.includes('`') ? '``' : '`';
      const pad = node.value.startsWith('`') || node.value.endsWith('`') ? ' ' : '';
      return `${ticks}${pad}${node.value}${pad}${ticks}`;
    }
    case 'mark': {
      const inner = renderInlines(node.children, mode);
      if (mode === 'pkc') {
        return `==${node.color ? `[${node.color}]` : ''}${inner}==`;
      }
      // GFM:`<mark>` HTML タグで近似(GFM が許す inline HTML)
      return `<mark>${inner}</mark>`;
    }
    case 'em-dot': {
      const inner = renderInlines(node.children, mode);
      if (mode === 'pkc') {
        const styleAttr = node.style && node.style !== 'dot' ? `[${node.style}]` : '';
        return `..${styleAttr}${inner}..`;
      }
      // GFM:em-dot は強調点。HTML span `class="pkc-em-dot"` で意味を保持
      // (reverse direction で AST に戻せる)。`*..*` 近似より lossless。
      return `<span class="pkc-em-dot">${inner}</span>`;
    }
    case 'ruby':
      if (mode === 'pkc') return `{${node.base}|${node.rt}}`;
      // GFM:正しい `<ruby>` HTML(`<rt>` 単独は invalid、`<ruby>` で wrap 必要)
      return `<ruby>${escapeText(node.base)}<rt>${escapeText(node.rt)}</rt></ruby>`;
    case 'sup': {
      const inner = renderInlines(node.children, mode);
      // PKC mode は formal inline `:sup:[X]`(spec PR-2B 認可形式)、
      // GFM mode は HTML `<sup>` で reverse 認識可能形に。
      if (mode === 'pkc') return `:sup:[${inner}]`;
      return `<sup>${inner}</sup>`;
    }
    case 'sub': {
      const inner = renderInlines(node.children, mode);
      if (mode === 'pkc') return `:sub:[${inner}]`;
      return `<sub>${inner}</sub>`;
    }
    case 'span': {
      const inner = renderInlines(node.children, mode);
      if (mode === 'pkc' && node.attrs && hasAttrs(node.attrs)) {
        // PR-2JJ v2 hotfix(2026-05-13):AstSpan(class=lead) や (class=caption)
        // は formal inline 形(`:lead:[X]` / `:caption:[X]`)で round-trip 安定。
        // decompose-pkc が同じ formal 形に戻すので idempotent。
        const cls = node.attrs.classes;
        if (cls.includes('lead') && cls.length === 1) return `:lead:[${inner}]`;
        if (cls.includes('caption') && cls.length === 1) return `:caption:[${inner}]`;
        if (cls.includes('pkc-em-dot') && cls.length === 1) {
          // pkc-em-dot は AstEmDot として後段で生成されるが、念のため。
          return `..${inner}..`;
        }
        // 一般 span:`[X]{attrs}` 形
        return `[${inner}]${formatAttrs(node.attrs)}`;
      }
      // GFM:class が付いていれば `<span class="X">` で reverse 可能に
      if (mode === 'gfm' && node.attrs && node.attrs.classes.length > 0) {
        const cls = node.attrs.classes.join(' ');
        return `<span class="${cls}">${inner}</span>`;
      }
      return inner;
    }
    case 'link': {
      const text = renderInlines(node.children, mode);
      // entry / asset / permalink は PKC では pkc:// scheme で復元
      return `[${text}](${node.href})`;
    }
    case 'card': {
      const text = renderInlines(node.children, mode);
      if (mode === 'pkc') return `?[${text}](${node.ref})`;
      return `[${text}](${node.ref})`;
    }
    case 'embed': {
      const text = renderInlines(node.children, mode);
      if (mode === 'pkc') {
        const prefix = node.mode === 'quote' ? '!q' : '!';
        return `${prefix}[${text}](${node.ref})`;
      }
      return `[${text}](${node.ref})`;
    }
    case 'image':
      return `![${escapeText(node.alt)}](${node.src})`;
    case 'auto-ref':
      // PR-2JJ v2 hotfix(2026-05-13):PKC mode は formal form `[@id]`、
      // GFM mode は plain `@id`(GFM consumer は brackets 解釈しないので)。
      if (mode === 'pkc') return `[@${node.id}]`;
      return `@${node.id}`;
    case 'var':
      if (mode === 'pkc') return `{{${node.path}}}`;
      // GFM:placeholder 文字列を素通し(consumer 側で展開できない)
      return `{{${node.path}}}`;
    case 'math-inline':
      return `$${node.src}$`;
    case 'comment-inline': {
      if (mode === 'pkc') {
        const inner = renderInlines(node.children, mode);
        return node.visibility === 'footnote'
          ? `%%footnote[${node.id ?? ''}](${inner})%%`
          : `%%${inner}%%`;
      }
      // GFM:hidden コメントは消す、footnote は `[^id]` で近似
      if (node.visibility === 'footnote') {
        return `[^${node.id ?? 'note'}]`;
      }
      return '';
    }
    case 'footnote-ref':
      // PR-2JJ v2 final(2026-05-13、Gemini review 反映):両 mode で `[^id]`。
      // GFM / Pandoc / 学術 dialect 共通の脚注参照 syntax。
      return `[^${node.id}]`;
    case 'opaque-inline':
      // PR-2JJ v2 final(2026-05-13、ChatGPT review 反映):未知構文 preserve。
      // 原文をそのまま emit、round-trip で AstOpaqueInline に戻る。
      return node.original;
    case 'citation': {
      // PR-V2(2026-05-14、Gemini review 反映):学術 citation を Pandoc 互換
      // markdown 形式で出す。
      //   - PKC mode:`[@id]` または `[prefix @id suffix]`
      //   - GFM mode:Pandoc citation syntax と同じ(`[@id]`)
      const parts: string[] = [];
      if (node.prefix) parts.push(node.prefix);
      parts.push(`@${node.id}`);
      if (node.suffix) parts.push(node.suffix);
      return `[${parts.join(' ')}]`;
    }
    default: {
      const n = node as AstNodeBase & { kind: string };
      return `<!-- unsupported inline kind: ${n.kind} -->`;
    }
  }
}

/**
 * CommonMark の "Backslash escape" rule に準拠した **最小限の inline escape**。
 *
 * 全 ASCII punctuation を escape すると `Hello (world)` → `Hello \(world\)` の
 * ような過剰 escape を produce してしまう(PR-2JJ v2 critical bug fix、
 * 2026-05-13 user 指摘:「MDコピーの両方の取得結果がシンタックスをエスケープ
 * する致命的なバグ」)。
 *
 * inline context で **markup として interpret される可能性が確実にある** 文字
 * のみ escape する:
 *
 *   - `\\` : escape character 自身(re-render の冪等性確保)
 *   - `` ` `` : inline code 開始
 *   - `*` `_` : emphasis / strong(連続する `*` / `_` が確実に markup)
 *
 * 他の punctuation(`( )` / `[ ]` / `#` / `+` / `-` / `!` / `|` / `>` /
 * `{` `}` / `/` / `~` / `:` 等)は inline では **markup を確実に trigger
 * しない** ので escape 不要。
 *
 *   - `[` `]`:本物の link は AST 上 `link` node に分解されており、text
 *     node の value に残るのは literal 用途のみ。escape すると `[test]`
 *     が `\[test\]` と読みづらくなる。markdown-it は対応する destination
 *     がない `[...]` を text token として残すので、escape なしでも re-parse
 *     で同じ AST に戻る。
 *   - 行頭 marker(`#` / `>` / `-`):block level context で別途扱う
 *     (paragraph wrap が常に block context を作るため)。
 *
 * 過剰 escape は出力の可読性を破壊するだけでなく、AI / 他システムへの
 * 互換性 hand-off で誤動作の原因になるため、ここは厳密に限定する。
 */
function escapeText(s: string): string {
  return s.replace(/([\\`*_])/g, '\\$1');
}

/**
 * GFM mode で AST text node に残った PKC 拡張 marker を plain text へ
 * 落とす post-process(PR-2JJ v2、2026-05-13 user 指摘:「ASTが可換に
 * なっていない、ASTの中なのにPKC Markdownがそのまま記録されていたりして、
 * ASTの体を成していない」)。
 *
 * 本来は parser(PR-2Y / PR-2Z scope)が PKC 拡張を AST 構造に分解する
 * のが筋だが、現 parser は **commonmark + GFM core のみ cover** で PKC
 * 固有 marker(`==text==` / `..text..` / `:::role` / `%%comment%%` 等)を
 * text node の value にそのまま渡してくる。
 *
 * GFM mode の互換性 contract を満たすため、render 段階で minimal な
 * fallback 変換を提供:
 *   - `==text==` → `text`(plain、強調マーカーは drop)
 *   - `..text..` → `text`(em-dot マーカー drop)
 *   - `%%hidden%%` → ``(hidden コメントは削除)
 *   - `:::role` ... `:::` block 形式は block 段階で処理済(現実装で剥がし済)
 *
 * 真の修正は AST canonicalize / parser を PKC 固有 inline 対応に強化する
 * future wave。本実装は symptom 緩和の bridge layer(2026-05-13 移行は
 * `stripPkcInlinesForGfm` + `stripPkcBlocksForGfm` + `expandVarsInOutput`
 * で renderAstToMarkdown 末尾の post-process に集約済)。
 */

function hasAttrs(attrs: { id?: string; classes: readonly string[]; kvs: Readonly<Record<string, string | boolean>> }): boolean {
  if (attrs.id) return true;
  if (attrs.classes.length > 0) return true;
  if (Object.keys(attrs.kvs).length > 0) return true;
  return false;
}

function formatAttrs(attrs: { id?: string; classes: readonly string[]; kvs: Readonly<Record<string, string | boolean>> }): string {
  const parts: string[] = [];
  if (attrs.id) parts.push(`#${attrs.id}`);
  for (const cls of attrs.classes) parts.push(`.${cls}`);
  for (const [k, v] of Object.entries(attrs.kvs)) {
    if (v === true) parts.push(k);
    else if (v !== false) parts.push(`${k}=${JSON.stringify(v)}`);
  }
  return `{${parts.join(' ')}}`;
}
