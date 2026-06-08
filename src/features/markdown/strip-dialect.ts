/**
 * 領域 6:strip-dialect ── PKC-Markdown 方言記法を CommonMark へダウン
 * グレードする純関数(roadmap 領域 6 設計指針 #2「Strippable」、user
 * 明示要望「方言記法されたエントリからベーシックなマークダウンだけを
 * 取り出す機能」)。
 *
 * Phase 1(正規表現ベース)。各方言マーカーを「記号削除 / 中身保持」で
 * CommonMark 互換へ落とす。fenced code(``` / ~~~)内は全て素通し
 * (CLAUDE.md §11)。
 *
 * 対象マーカー:
 *   block ── `:::section/quote/figure/details/if/body/frontmatter/
 *            paragraph/table/equation`(枠線除去・中身保持)、
 *            `:::comment` / `:::toc`(ブロックごと削除)、
 *            `%%%…%%%`(ブロックコメント、削除)、`+++`(→ `---`)、
 *            行頭 align prefix `|| |> <| |< >|`(prefix 除去)、
 *            行頭 indent prefix `__` / `＿`(prefix 除去、`__bold__` は保護)、
 *            `_` 単独行(blank-line marker → 空行)
 *   inline ── `==X==` / `==[c]X==`、`^^X^^`、`[[ruby:base|read]]`(→ base)、
 *            `[[em:X]]`、`%%X%%`(削除)、`:role:[X]` 系 inline role
 *
 * Phase 1 対象外(中身そのまま残す):`{{vars.x}}`(変数 ── 解決は
 * 文脈依存)、`[@ref]`(相互参照 ── 無害な literal)、L-6 simple-inline
 * `:text:attrs:`(inline role と正規表現が曖昧なため保留)。
 */
import { parseBlockDirectiveOpen, isBlockDirectiveClose } from './block-directive-attrs';

/** 行を inline 方言マーカー除去。fenced code 外の行にのみ適用する。 */
function stripInline(line: string): string {
  return line
    // ==[color]X== / ==X== highlight → X
    .replace(/==(?:\[[a-zA-Z]+\])?([^=]+?)==/g, '$1')
    // ^^X^^ em-dot → X
    .replace(/\^\^([^^]+?)\^\^/g, '$1')
    // [[ruby:base|reading]] → base
    .replace(/\[\[ruby:([^|\]]+)\|[^\]]*\]\]/g, '$1')
    // [[em:X]] em-dot(旧形)→ X
    .replace(/\[\[em:([^\]]+)\]\]/g, '$1')
    // :emphasis:[X] / :role:[X] / :span:[X] / :sup:[X] / :sub:[X] → X
    .replace(/:(?:emphasis|role|span|sup|sub):\[([^\]]*)\](?:\{[^}]*\})?/g, '$1')
    // %%X%% inline comment → 削除
    .replace(/%%[^\n]*?%%/g, '');
}

/**
 * PKC-Markdown 方言を CommonMark へ strip する。
 *
 * 削除した方言マーカー / ブロックは **空行に置換**して段落分離を保つ
 * (隣接段落が `breaks` 設定で誤結合するのを防ぐ)。最後に連続空行を
 * 1 つへ畳み、先頭 / 末尾の空行を trim する。
 */
export function stripDialect(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let fenceChar = ''; // '' = fence 外
  let inBlockComment = false; // %%% ... %%%
  let inDropBlock = false; // :::comment / :::toc(中身ごと削除)

  for (const line of lines) {
    const fenceM = /^\s*([`~]{3,})/.exec(line);

    // ── fenced code:中は全て素通し ──
    if (fenceChar !== '') {
      out.push(line);
      if (fenceM && fenceM[1]![0] === fenceChar && /^\s*[`~]{3,}\s*$/.test(line)) {
        fenceChar = '';
      }
      continue;
    }
    if (fenceM) {
      fenceChar = fenceM[1]![0]!;
      out.push(line);
      continue;
    }

    // ── %%% ブロックコメント:中身ごと削除(空行へ)──
    if (/^\s*%%%\s*$/.test(line)) {
      inBlockComment = !inBlockComment;
      out.push('');
      continue;
    }
    if (inBlockComment) {
      out.push('');
      continue;
    }

    // ── :::comment / :::toc:ブロックごと削除(空行へ)──
    if (inDropBlock) {
      if (isBlockDirectiveClose(line)) inDropBlock = false;
      out.push('');
      continue;
    }
    const open = parseBlockDirectiveOpen(line);
    if (open && (open.name === 'comment' || open.name === 'toc')) {
      inDropBlock = true;
      out.push('');
      continue;
    }
    // ── その他の ::: ブロック:枠線(open / close 行)を空行へ、中身保持 ──
    if (open || isBlockDirectiveClose(line)) {
      out.push('');
      continue;
    }

    // ── +++ セクション区切り → CommonMark thematic break ──
    if (/^\+\+\+\s*(?:\{[^}]*\})?\s*$/.test(line)) {
      out.push('---');
      continue;
    }

    // ── _ 単独行(L-8 blank-line marker)→ 空行 ──
    if (/^\s*_\d*\s*$/.test(line)) {
      out.push('');
      continue;
    }

    // ── 行頭 align prefix(|| |> <| |< >|)除去 ──
    let work = line.replace(/^(\s*)(?:\|\||\|>|<\||\|<|>\|)\s?/, '$1');
    // ── 行頭 indent prefix(__ / ＿)除去。`___`(hr)と `__bold__`(行末が
    //    `__` で終わる bold 行)は保護のため除去しない ──
    if (/^\s*(?:__|＿)(?!_)/.test(work) && !/(?:__|＿)\s*$/.test(work)) {
      work = work.replace(/^(\s*)(?:__|＿)\s?/, '$1');
    }

    out.push(stripInline(work));
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}
