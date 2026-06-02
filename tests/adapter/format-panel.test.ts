/**
 * @vitest-environment happy-dom
 *
 * 編集モード固定 format ribbon(Group C ワープロ化、Phase γ-C)の test。
 * 旧 PR-2JJ v2 floating panel は scrap、本 test も新 ribbon 用に書き直し。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import {
  FORMAT_GROUPS,
  renderFormatPanel,
  parseSimpleInline,
  applySimpleInlineAttr,
  parseHighlight,
  applyHighlightColor,
  applyAlignPrefix,
  applyListMarker,
  applyRenumberList,
  applyIndent,
  buildPipeTable,
  insertPipeTable,
  insertBlock,
} from '@adapter/ui/format-panel';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

describe('format-panel — FORMAT_GROUPS registry', () => {
  it('defines the 6 spec §3.2 groups in order', () => {
    expect(FORMAT_GROUPS.map((g) => g.id)).toEqual([
      'font',
      'paragraph',
      'list',
      'table',
      'insert',
      'search',
    ]);
  });

  it('has 29 operations total', () => {
    const total = FORMAT_GROUPS.reduce((n, g) => n + g.ops.length, 0);
    expect(total).toBe(29);
  });

  it('Font group includes underline (U) and em-dot (^^), drops the bogus `..`', () => {
    const font = FORMAT_GROUPS.find((g) => g.id === 'font');
    const labels = font?.ops.map((o) => o.label) ?? [];
    expect(labels).toContain('U');
    expect(labels).toContain('^^');
    // 旧 ribbon の `..` は PKC MD に存在しない em-dot delimiter で除去済(pgc-39)。
    expect(labels).not.toContain('..');
  });

  it('paragraph group offers || / |> align but not the mislabeled <|', () => {
    const para = FORMAT_GROUPS.find((g) => g.id === 'paragraph');
    const labels = para?.ops.map((o) => o.label) ?? [];
    expect(labels).toContain('||');
    expect(labels).toContain('|>');
    // `<|` は renderer L-5 で `|>` と同じ end へ写像され「左揃え」にならないため除去(pgc-39)。
    expect(labels).not.toContain('<|');
  });

  it('Font group has size / family / text-color / highlight-color pickers', () => {
    const font = FORMAT_GROUPS.find((g) => g.id === 'font');
    expect(font?.pickers?.map((p) => p.id)).toEqual([
      'font-size',
      'font-family',
      'text-color',
      'highlight-color',
    ]);
  });

  it('picker option counts: size 5 / family 3 / colors 6', () => {
    const font = FORMAT_GROUPS.find((g) => g.id === 'font');
    const byId = (id: string) => font?.pickers?.find((p) => p.id === id);
    expect(byId('font-size')?.options).toHaveLength(5);
    expect(byId('font-family')?.options).toHaveLength(3);
    expect(byId('text-color')?.options).toHaveLength(6);
    expect(byId('highlight-color')?.options).toHaveLength(6);
  });

  it('color pickers are swatch pickers', () => {
    const font = FORMAT_GROUPS.find((g) => g.id === 'font');
    const byId = (id: string) => font?.pickers?.find((p) => p.id === id);
    expect(byId('text-color')?.swatch).toBe(true);
    expect(byId('highlight-color')?.swatch).toBe(true);
  });
});

describe('format-panel — renderFormatPanel (fixed ribbon)', () => {
  it('renders the panel root with data-pkc-region', () => {
    const panel = renderFormatPanel();
    expect(panel.getAttribute('data-pkc-region')).toBe('format-panel');
  });

  it('renders 6 collapsible <details> group frames', () => {
    const panel = renderFormatPanel();
    const groups = panel.querySelectorAll('[data-pkc-region="format-panel-group"]');
    expect(groups).toHaveLength(6);
    for (const g of groups) {
      expect(g.tagName).toBe('DETAILS');
      expect(g.querySelector('summary')).not.toBeNull();
    }
  });

  it('renders 29 operation buttons (data-pkc-format-label)', () => {
    const panel = renderFormatPanel();
    expect(panel.querySelectorAll('[data-pkc-format-label]')).toHaveLength(29);
  });

  it('renders 6 value pickers with their option buttons', () => {
    const panel = renderFormatPanel();
    expect(panel.querySelectorAll('[data-pkc-picker]')).toHaveLength(6);
    const count = (id: string) =>
      panel.querySelectorAll(`[data-pkc-picker="${id}"] [data-pkc-picker-value]`)
        .length;
    expect(count('font-size')).toBe(5);
    expect(count('font-family')).toBe(3);
    expect(count('text-color')).toBe(6);
    expect(count('highlight-color')).toBe(6);
    expect(count('table-insert')).toBe(4);
    expect(count('table-align')).toBe(4);
  });

  it('color picker options render as swatches', () => {
    const panel = renderFormatPanel();
    const swatches = panel.querySelectorAll(
      '[data-pkc-picker="text-color"] .pkc-format-panel-swatch',
    );
    expect(swatches).toHaveLength(6);
  });
});

describe('format-panel — operation apply math (PKC MD canonical)', () => {
  function applyByLabel(
    label: string,
    value: string,
    start: number,
    end: number,
  ): { value: string; start: number; end: number } {
    const op = FORMAT_GROUPS.flatMap((g) => g.ops).find((o) => o.label === label);
    if (!op) throw new Error(`no op: ${label}`);
    return op.apply({ value, start, end });
  }

  it('B wraps the selection in ** with shifted caret', () => {
    const r = applyByLabel('B', 'hello', 0, 5);
    expect(r.value).toBe('**hello**');
    expect(r.start).toBe(2);
    expect(r.end).toBe(7);
  });

  it('== wraps a mid-string selection', () => {
    expect(applyByLabel('==', 'red text', 0, 3).value).toBe('==red== text');
  });

  it('H2 prefixes the line with "## "', () => {
    expect(applyByLabel('H2', 'title', 0, 5).value).toBe('## title');
  });

  it('> prefixes each selected line', () => {
    expect(applyByLabel('>', 'a\nb', 0, 3).value).toBe('> a\n> b');
  });

  it('link wraps the selection as [text](url)', () => {
    expect(applyByLabel('link', 'site', 0, 4).value).toBe('[site](url)');
  });

  it('ﾙﾋﾞ wraps the selection as [[ruby:X|]]', () => {
    expect(applyByLabel('ﾙﾋﾞ', '漢字', 0, 2).value).toBe('[[ruby:漢字|]]');
  });

  it('+++ inserts a section break block', () => {
    expect(applyByLabel('+++', '', 0, 0).value).toBe('+++');
  });

  // pgc-39:書式 ribbon ↔ PKC Markdown 不一致の修正(em-dot delimiter / sup-sub /
  // underline)。旧 ribbon は `..` 強調点・生 `<sup>` タグを出していたが、
  // renderer はどちらも render しない(literal 残り / html:false で escape)。
  it('^^ wraps the selection in ^^ (em-dot canonical delimiter, not `..`)', () => {
    const r = applyByLabel('^^', 'ここ', 0, 2);
    expect(r.value).toBe('^^ここ^^');
    expect(r.start).toBe(2);
    expect(r.end).toBe(4);
  });

  it('sup wraps as :sup:[text] formal inline role (not raw <sup>, which html:false escapes)', () => {
    expect(applyByLabel('sup', '2', 0, 1).value).toBe(':sup:[2]');
  });

  it('sub wraps as :sub:[text] formal inline role (not raw <sub>)', () => {
    expect(applyByLabel('sub', 'n', 0, 1).value).toBe(':sub:[n]');
  });

  it('U wraps plain text as :text:underline: simple-inline', () => {
    expect(applyByLabel('U', '下線', 0, 2).value).toBe(':下線:underline:');
  });

  it('U on an existing simple-inline appends underline (category-less, keeps size)', () => {
    expect(applyByLabel('U', ':X:lg:', 0, 6).value).toBe(':X:lg,underline:');
  });
});

describe('format-panel — parseSimpleInline', () => {
  it('parses :inner:attrs: into inner + attr list', () => {
    expect(parseSimpleInline(':hello:lg:')).toEqual({ inner: 'hello', attrs: ['lg'] });
    expect(parseSimpleInline(':hello:red,lg:')).toEqual({
      inner: 'hello',
      attrs: ['red', 'lg'],
    });
  });

  it('returns null for plain text and malformed input', () => {
    expect(parseSimpleInline('hello')).toBeNull();
    expect(parseSimpleInline(':a:b:c:')).toBeNull();
    expect(parseSimpleInline('')).toBeNull();
  });
});

describe('format-panel — applySimpleInlineAttr (attr 合成、spec §4.4)', () => {
  function apply(value: string, start: number, end: number, attr: string): string {
    return applySimpleInlineAttr({ value, start, end }, attr).value;
  }

  // case matrix(CLAUDE.md §4 規約、最低 10 件)
  it('1. plain text + size → fresh :text:size:', () => {
    expect(apply('hello', 0, 5, 'lg')).toBe(':hello:lg:');
  });
  it('2. plain text + family → fresh :text:family:', () => {
    expect(apply('hello', 0, 5, 'serif')).toBe(':hello:serif:');
  });
  it('3. :text:lg: + xl → size category 置換', () => {
    expect(apply(':hello:lg:', 0, 10, 'xl')).toBe(':hello:xl:');
  });
  it('4. :text:lg: + serif → 別 category は維持し合成', () => {
    expect(apply(':hello:lg:', 0, 10, 'serif')).toBe(':hello:lg,serif:');
  });
  it('5. :text:serif: + sans → family category 置換', () => {
    expect(apply(':hello:serif:', 0, 13, 'sans')).toBe(':hello:sans:');
  });
  it('6. :text:lg,serif: + xl → size 置換・family 維持', () => {
    expect(apply(':hello:lg,serif:', 0, 16, 'xl')).toBe(':hello:serif,xl:');
  });
  it('7. plain text + color → fresh :text:color:', () => {
    expect(apply('hello', 0, 5, 'red')).toBe(':hello:red:');
  });
  it('8. :text:red: + blue → color category 置換', () => {
    expect(apply(':hello:red:', 0, 11, 'blue')).toBe(':hello:blue:');
  });
  it('9. :text:lg: + red → size + color 合成', () => {
    expect(apply(':hello:lg:', 0, 10, 'red')).toBe(':hello:lg,red:');
  });
  it('10. :text:red,lg: + blue → color 置換・size 維持', () => {
    expect(apply(':hello:red,lg:', 0, 14, 'blue')).toBe(':hello:lg,blue:');
  });
  it('11. 空選択 + size → ::size:(inner 空)', () => {
    expect(apply('', 0, 0, 'lg')).toBe('::lg:');
  });
  it('12. CJK 選択 + size', () => {
    expect(apply('日本語', 0, 3, 'lg')).toBe(':日本語:lg:');
  });
  it('13. 絵文字選択 + size', () => {
    expect(apply('🎉', 0, 2, 'lg')).toBe(':🎉:lg:');
  });
  it('14. 行中の選択のみ wrap、前後は不変', () => {
    expect(apply('ab cd ef', 3, 5, 'lg')).toBe('ab :cd:lg: ef');
  });
  it('15. コロン入り選択は simple-inline と見なさず fresh wrap', () => {
    expect(apply(':a:b:c:', 0, 7, 'lg')).toBe('::a:b:c::lg:');
  });
  it('caret は置換後の simple-inline 全体を選択する', () => {
    const r = applySimpleInlineAttr({ value: 'hello', start: 0, end: 5 }, 'lg');
    expect(r.start).toBe(0);
    expect(r.end).toBe(':hello:lg:'.length);
  });
});

describe('format-panel — parseHighlight / applyHighlightColor (背景色、spec §4.1)', () => {
  function apply(value: string, start: number, end: number, color: string): string {
    return applyHighlightColor({ value, start, end }, color).value;
  }

  it('parseHighlight extracts inner from ==X== / ==[color]X==', () => {
    expect(parseHighlight('==hello==')).toEqual({ inner: 'hello' });
    expect(parseHighlight('==[red]hello==')).toEqual({ inner: 'hello' });
    expect(parseHighlight('==[#ff0000]x==')).toEqual({ inner: 'x' });
    expect(parseHighlight('hello')).toBeNull();
  });

  // case matrix(CLAUDE.md §4 規約)
  it('1. plain text + color → ==[color]text==', () => {
    expect(apply('hello', 0, 5, 'red')).toBe('==[red]hello==');
  });
  it('2. plain highlight ==X== + color → ==[color]X==', () => {
    expect(apply('==hello==', 0, 9, 'red')).toBe('==[red]hello==');
  });
  it('3. ==[red]X== + blue → 背景色 置換', () => {
    expect(apply('==[red]hello==', 0, 14, 'blue')).toBe('==[blue]hello==');
  });
  it('4. 空選択 + color → ==[color]==', () => {
    expect(apply('', 0, 0, 'red')).toBe('==[red]==');
  });
  it('5. CJK 選択 + color', () => {
    expect(apply('日本語', 0, 3, 'green')).toBe('==[green]日本語==');
  });
  it('6. 絵文字選択 + color', () => {
    expect(apply('🎉', 0, 2, 'purple')).toBe('==[purple]🎉==');
  });
  it('7. 行中の選択のみ wrap、前後は不変', () => {
    expect(apply('ab cd ef', 3, 5, 'orange')).toBe('ab ==[orange]cd== ef');
  });
  it('caret は置換後の highlight 全体を選択する', () => {
    const r = applyHighlightColor({ value: 'hello', start: 0, end: 5 }, 'red');
    expect(r.start).toBe(0);
    expect(r.end).toBe('==[red]hello=='.length);
  });
});

describe('format-panel — applyAlignPrefix (段落 align、spec §5.2)', () => {
  function apply(value: string, start: number, end: number, target: string): string {
    return applyAlignPrefix({ value, start, end }, target).value;
  }

  // case matrix(CLAUDE.md §4 規約、最低 10 件)
  it('1. plain line + || → ||line', () => {
    expect(apply('hello', 0, 5, '||')).toBe('||hello');
  });
  it('2. ||line + || → toggle off', () => {
    expect(apply('||hello', 0, 7, '||')).toBe('hello');
  });
  it('3. ||line + |> → align 置換', () => {
    expect(apply('||hello', 0, 7, '|>')).toBe('|>hello');
  });
  it('4. <|line + || → align 置換', () => {
    expect(apply('<|hello', 0, 7, '||')).toBe('||hello');
  });
  it('5. |>line + |> → toggle off', () => {
    expect(apply('|>hello', 0, 7, '|>')).toBe('hello');
  });
  it('6. 複数行(prefix なし)+ || → 各行に付与', () => {
    expect(apply('a\nb\nc', 0, 5, '||')).toBe('||a\n||b\n||c');
  });
  it('7. 複数行混在 + || → 各行独立に toggle', () => {
    expect(apply('||x\ny', 0, 5, '||')).toBe('x\n||y');
  });
  it('8. 空行 + || → || のみ', () => {
    expect(apply('', 0, 0, '||')).toBe('||');
  });
  it('9. prefix のみの行 + 同 prefix → 空行に', () => {
    expect(apply('||', 0, 2, '||')).toBe('');
  });
  it('10. CJK 行 + ||', () => {
    expect(apply('日本語', 0, 3, '||')).toBe('||日本語');
  });
  it('11. quote 行 + || → align prefix を quote の前に', () => {
    expect(apply('> quote', 0, 7, '||')).toBe('||> quote');
  });
  it('12. 行中選択でも行全体に適用', () => {
    expect(apply('hello world', 3, 5, '|>')).toBe('|>hello world');
  });
});

describe('format-panel — applyListMarker (リスト・番号、spec §7.1)', () => {
  const mark = (
    value: string,
    start: number,
    end: number,
    target: 'bullet' | 'ordered',
  ): string => applyListMarker({ value, start, end }, target).value;

  it('1. plain → bullet', () => {
    expect(mark('x', 0, 1, 'bullet')).toBe('- x');
  });
  it('2. bullet + bullet → toggle off', () => {
    expect(mark('- x', 0, 3, 'bullet')).toBe('x');
  });
  it('3. bullet + ordered → 種別変換', () => {
    expect(mark('- x', 0, 3, 'ordered')).toBe('1. x');
  });
  it('4. ordered + ordered → toggle off', () => {
    expect(mark('1. x', 0, 4, 'ordered')).toBe('x');
  });
  it('5. ordered + bullet → 種別変換', () => {
    expect(mark('1. x', 0, 4, 'bullet')).toBe('- x');
  });
  it('6. * 形 bullet も bullet と認識し toggle off', () => {
    expect(mark('* x', 0, 3, 'bullet')).toBe('x');
  });
  it('7. 複数行 plain + bullet → 各行に付与', () => {
    expect(mark('a\nb', 0, 3, 'bullet')).toBe('- a\n- b');
  });
  it('8. indent 付き bullet の toggle off は indent を保つ', () => {
    expect(mark('  - x', 0, 5, 'bullet')).toBe('  x');
  });
  it('9. 空行 + bullet → "- "', () => {
    expect(mark('', 0, 0, 'bullet')).toBe('- ');
  });
  it('10. CJK 行 + bullet', () => {
    expect(mark('日本語', 0, 3, 'bullet')).toBe('- 日本語');
  });
  it('11. 2. 形(非 1)ordered も ordered と認識し toggle off', () => {
    expect(mark('2. x', 0, 4, 'ordered')).toBe('x');
  });
});

describe('format-panel — applyListMarker ordered 採番(領域 8 Layer 1)', () => {
  it('複数行 plain → ordered は 1,2,3 と連番採番される', () => {
    expect(
      applyListMarker({ value: 'a\nb\nc', start: 0, end: 5 }, 'ordered').value,
    ).toBe('1. a\n2. b\n3. c');
  });

  it('frontmatter list-number: uniform なら 1,1,1 で統一する', () => {
    const fm = '---\nlist-number: uniform\n---\n';
    const r = applyListMarker(
      { value: `${fm}a\nb\nc`, start: fm.length, end: fm.length + 5 },
      'ordered',
    );
    expect(r.value).toBe(`${fm}1. a\n1. b\n1. c`);
  });
});

describe('format-panel — applyRenumberList(領域 8 Layer 1 / 2)', () => {
  it('選択なし → caret 行の run 全体を連番へ直す', () => {
    const r = applyRenumberList({ value: '1. a\n4. b\n5. c', start: 2, end: 2 });
    expect(r.value).toBe('1. a\n2. b\n3. c');
    expect(r.start).toBe(2);
    expect(r.end).toBe(2);
  });

  it('選択あり → 選択行ブロック内の順序リストを採番する', () => {
    const r = applyRenumberList({ value: '1. a\n4. b\n5. c', start: 0, end: 14 });
    expect(r.value).toBe('1. a\n2. b\n3. c');
  });

  it('frontmatter list-number: uniform を尊重する', () => {
    const fm = '---\nlist-number: uniform\n---\n';
    const r = applyRenumberList({
      value: `${fm}1. a\n2. b`,
      start: fm.length,
      end: fm.length + 9,
    });
    expect(r.value).toBe(`${fm}1. a\n1. b`);
  });

  it('caret が順序リスト外なら no-op', () => {
    const r = applyRenumberList({ value: 'ただの本文', start: 2, end: 2 });
    expect(r.value).toBe('ただの本文');
  });
});

describe('format-panel — applyIndent (リスト・番号、spec §7.1)', () => {
  const ind = (
    value: string,
    start: number,
    end: number,
    delta: 'in' | 'out',
  ): string => applyIndent({ value, start, end }, delta).value;

  it('12. plain + in → 2 space 前置', () => {
    expect(ind('x', 0, 1, 'in')).toBe('  x');
  });
  it('13. 2 space + out → 除去', () => {
    expect(ind('  x', 0, 3, 'out')).toBe('x');
  });
  it('14. indent なし + out → no-op', () => {
    expect(ind('x', 0, 1, 'out')).toBe('x');
  });
  it('15. 1 space + out → 1 space のみ除去', () => {
    expect(ind(' x', 0, 2, 'out')).toBe('x');
  });
  it('16. 複数行 + in → 各行に 2 space', () => {
    expect(ind('a\nb', 0, 3, 'in')).toBe('  a\n  b');
  });
});

describe('format-panel — buildPipeTable / insertPipeTable (表挿入、spec §6.1)', () => {
  it('buildPipeTable(2,2) produces a GFM skeleton', () => {
    expect(buildPipeTable(2, 2)).toBe(
      '| 列1 | 列2 |\n| --- | --- |\n|  |  |\n|  |  |',
    );
  });
  it('buildPipeTable(1,3) → header + sep + 1 body row, 3 columns', () => {
    const lines = buildPipeTable(1, 3).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('| 列1 | 列2 | 列3 |');
    expect(lines[1]).toBe('| --- | --- | --- |');
  });
  it('buildPipeTable(3,1) → header + sep + 3 body rows', () => {
    expect(buildPipeTable(3, 1).split('\n')).toHaveLength(5);
  });

  it('inserts a table into an empty document', () => {
    const r = insertPipeTable({ value: '', start: 0, end: 0 }, '2x2');
    expect(r.value).toBe(buildPipeTable(2, 2));
    expect(r.start).toBe(0);
    expect(r.end).toBe(buildPipeTable(2, 2).length);
  });
  it('prepends a newline when the caret is mid-text', () => {
    const r = insertPipeTable({ value: 'hello', start: 5, end: 5 }, '2x2');
    expect(r.value).toBe(`hello\n${buildPipeTable(2, 2)}`);
  });
  it('appends a newline when text follows the caret', () => {
    const r = insertPipeTable({ value: 'hello', start: 0, end: 0 }, '2x2');
    expect(r.value).toBe(`${buildPipeTable(2, 2)}\nhello`);
  });
  it('does not double the newline when before already ends with one', () => {
    const r = insertPipeTable({ value: 'a\n', start: 2, end: 2 }, '2x2');
    expect(r.value).toBe(`a\n${buildPipeTable(2, 2)}`);
  });
  it('parses "cols x rows": "3x2" → 3 columns, 2 body rows', () => {
    const r = insertPipeTable({ value: '', start: 0, end: 0 }, '3x2');
    expect(r.value).toBe(buildPipeTable(2, 3));
  });
  it('falls back to 2x2 on a malformed value', () => {
    const r = insertPipeTable({ value: '', start: 0, end: 0 }, 'bad');
    expect(r.value).toBe(buildPipeTable(2, 2));
  });

  it('insertBlock inserts text as a standalone block with NL guards', () => {
    expect(insertBlock({ value: '', start: 0, end: 0 }, '+++').value).toBe('+++');
    expect(insertBlock({ value: 'hello', start: 5, end: 5 }, '+++').value).toBe(
      'hello\n+++',
    );
  });
});

describe('format-panel — button click applies to the editor textarea', () => {
  function mountInEditor(): { panel: HTMLElement; ta: HTMLTextAreaElement } {
    const editor = document.createElement('div');
    editor.className = 'pkc-editor';
    const panel = renderFormatPanel();
    const ta = document.createElement('textarea');
    editor.appendChild(panel);
    editor.appendChild(ta);
    document.body.appendChild(editor);
    return { panel, ta };
  }

  it('clicking B wraps the textarea selection', () => {
    const { panel, ta } = mountInEditor();
    ta.value = 'Hello World';
    ta.focus();
    ta.setSelectionRange(0, 5);

    const boldBtn = panel.querySelector<HTMLButtonElement>(
      '[data-pkc-format-label="B"]',
    );
    expect(boldBtn).not.toBeNull();
    boldBtn!.click();
    expect(ta.value).toBe('**Hello** World');

    (panel.closest('.pkc-editor') as HTMLElement).remove();
  });

  it('clicking a font-size option wraps the selection as :text:size:', () => {
    const { panel, ta } = mountInEditor();
    ta.value = 'big';
    ta.focus();
    ta.setSelectionRange(0, 3);

    const lgOpt = panel.querySelector<HTMLButtonElement>(
      '[data-pkc-picker="font-size"] [data-pkc-picker-value="lg"]',
    );
    expect(lgOpt).not.toBeNull();
    lgOpt!.click();
    expect(ta.value).toBe(':big:lg:');

    (panel.closest('.pkc-editor') as HTMLElement).remove();
  });

  it('clicking a text-color swatch wraps the selection as :text:color:', () => {
    const { panel, ta } = mountInEditor();
    ta.value = 'warn';
    ta.focus();
    ta.setSelectionRange(0, 4);

    const redOpt = panel.querySelector<HTMLButtonElement>(
      '[data-pkc-picker="text-color"] [data-pkc-picker-value="red"]',
    );
    expect(redOpt).not.toBeNull();
    redOpt!.click();
    expect(ta.value).toBe(':warn:red:');

    (panel.closest('.pkc-editor') as HTMLElement).remove();
  });

  it('clicking a highlight-color swatch wraps the selection as ==[color]text==', () => {
    const { panel, ta } = mountInEditor();
    ta.value = 'mark';
    ta.focus();
    ta.setSelectionRange(0, 4);

    const blueOpt = panel.querySelector<HTMLButtonElement>(
      '[data-pkc-picker="highlight-color"] [data-pkc-picker-value="blue"]',
    );
    expect(blueOpt).not.toBeNull();
    blueOpt!.click();
    expect(ta.value).toBe('==[blue]mark==');

    (panel.closest('.pkc-editor') as HTMLElement).remove();
  });

  it('clicking || sets the center-align prefix on the line', () => {
    const { panel, ta } = mountInEditor();
    ta.value = 'centered';
    ta.focus();
    ta.setSelectionRange(0, 8);

    const centerBtn = panel.querySelector<HTMLButtonElement>(
      '[data-pkc-format-label="||"]',
    );
    expect(centerBtn).not.toBeNull();
    centerBtn!.click();
    expect(ta.value).toBe('||centered');

    (panel.closest('.pkc-editor') as HTMLElement).remove();
  });

  it('clicking a table-insert option inserts a GFM pipe table', () => {
    const { panel, ta } = mountInEditor();
    ta.value = '';
    ta.focus();
    ta.setSelectionRange(0, 0);

    const opt = panel.querySelector<HTMLButtonElement>(
      '[data-pkc-picker="table-insert"] [data-pkc-picker-value="2x2"]',
    );
    expect(opt).not.toBeNull();
    opt!.click();
    expect(ta.value).toContain('| 列1 | 列2 |');
    expect(ta.value).toContain('| --- | --- |');

    (panel.closest('.pkc-editor') as HTMLElement).remove();
  });

  it('clicking 行↓ adds a row to the table the caret is in', () => {
    const { panel, ta } = mountInEditor();
    ta.value = '| h | h |\n| --- | --- |\n| a | b |';
    ta.focus();
    ta.setSelectionRange(28, 28); // body 行内

    const addRow = panel.querySelector<HTMLButtonElement>(
      '[data-pkc-format-label="行↓"]',
    );
    expect(addRow).not.toBeNull();
    addRow!.click();
    expect(ta.value).toBe('| h | h |\n| --- | --- |\n| a | b |\n|  |  |');

    (panel.closest('.pkc-editor') as HTMLElement).remove();
  });

  it('clicking 行↓ outside any table is a no-op', () => {
    const { panel, ta } = mountInEditor();
    ta.value = 'just plain text';
    ta.focus();
    ta.setSelectionRange(5, 5);

    panel
      .querySelector<HTMLButtonElement>('[data-pkc-format-label="行↓"]')!
      .click();
    expect(ta.value).toBe('just plain text');

    (panel.closest('.pkc-editor') as HTMLElement).remove();
  });

  it('clicking 列→ adds a column to the table the caret is in', () => {
    const { panel, ta } = mountInEditor();
    ta.value = '| h | h |\n| --- | --- |\n| a | b |';
    ta.focus();
    ta.setSelectionRange(28, 28);

    panel
      .querySelector<HTMLButtonElement>('[data-pkc-format-label="列→"]')!
      .click();
    expect(ta.value).toBe(
      '| h |  | h |\n| --- | --- | --- |\n| a |  | b |',
    );

    (panel.closest('.pkc-editor') as HTMLElement).remove();
  });

  it('clicking a table-align option sets the column alignment', () => {
    const { panel, ta } = mountInEditor();
    ta.value = '| h | h |\n| --- | --- |\n| a | b |';
    ta.focus();
    ta.setSelectionRange(28, 28);

    panel
      .querySelector<HTMLButtonElement>(
        '[data-pkc-picker="table-align"] [data-pkc-picker-value="center"]',
      )!
      .click();
    expect(ta.value).toBe('| h | h |\n| :-: | --- |\n| a | b |');

    (panel.closest('.pkc-editor') as HTMLElement).remove();
  });

  it('clicking 1. converts the line into an ordered list item', () => {
    const { panel, ta } = mountInEditor();
    ta.value = 'item';
    ta.focus();
    ta.setSelectionRange(0, 4);

    panel
      .querySelector<HTMLButtonElement>('[data-pkc-format-label="1."]')!
      .click();
    expect(ta.value).toBe('1. item');

    (panel.closest('.pkc-editor') as HTMLElement).remove();
  });
});

describe('format-panel — 検索 launcher (spec §8)', () => {
  it('検索 group has the search-replace launcher', () => {
    const search = FORMAT_GROUPS.find((g) => g.id === 'search');
    expect(search?.launchers?.map((l) => l.id)).toEqual(['search-replace']);
  });

  it('renderFormatPanel("text") renders the 検索 launcher', () => {
    const panel = renderFormatPanel('text');
    expect(panel.querySelectorAll('[data-pkc-launcher]')).toHaveLength(1);
  });

  it('renderFormatPanel("textlog") omits the 検索 launcher (archetype filter)', () => {
    const panel = renderFormatPanel('textlog');
    expect(panel.querySelectorAll('[data-pkc-launcher]')).toHaveLength(0);
  });

  it('clicking the 検索 launcher opens the text-replace dialog', () => {
    const root = document.createElement('div');
    root.id = 'pkc-root';
    const editor = document.createElement('div');
    editor.className = 'pkc-editor';
    const panel = renderFormatPanel('text');
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    editor.appendChild(panel);
    editor.appendChild(ta);
    root.appendChild(editor);
    document.body.appendChild(root);

    ta.value = 'find me';
    ta.focus();
    ta.setSelectionRange(0, 4);

    const launcher = panel.querySelector<HTMLButtonElement>(
      '[data-pkc-launcher="search-replace"]',
    );
    expect(launcher).not.toBeNull();
    launcher!.click();
    expect(
      document.querySelector('[data-pkc-region="text-replace-dialog"]'),
    ).not.toBeNull();

    document.querySelector('[data-pkc-region="text-replace-dialog"]')?.remove();
    root.remove();
  });
});

describe('format-panel — renderer integration (flag-gated)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    // 2026-05-28 `shell.format_panel_default_hidden_enabled` always-on 化済 ── 本
    // describe は format panel 表示の content/structure を test するもので、default
    // hidden 経路は別 describe(`format-panel-default-hidden.test.ts`)で別 verify。
    // ここでは hidden flag を明示 OFF にして従来 "default visible" 経路を維持。
    const url = new URL(window.location.href);
    url.searchParams.delete('pkc-flag');
    url.searchParams.set('pkc-flag', 'shell.format_panel_default_hidden_enabled=0');
    window.history.replaceState({}, '', url.toString());
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  function renderEditingText(): void {
    const dispatcher = createDispatcher();
    const container: Container = {
      meta: {
        container_id: 't',
        title: 'T',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        schema_version: 1,
      },
      entries: [
        {
          lid: 'e1',
          title: 'Note',
          body: 'hello',
          archetype: 'text',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      relations: [],
      revisions: [],
      assets: {},
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);
  }

  it('flag default ON: the editor shows the format ribbon', () => {
    renderEditingText();
    const panel = root.querySelector('[data-pkc-region="format-panel"]');
    expect(panel).not.toBeNull();
    expect(panel!.querySelectorAll('[data-pkc-format-label]')).toHaveLength(29);
    expect(panel!.querySelectorAll('[data-pkc-picker]')).toHaveLength(6);
    expect(panel!.querySelectorAll('[data-pkc-launcher]')).toHaveLength(1);
  });

  it('flag OFF: the editor has no format ribbon', () => {
    setContainerFlagSource({ 'editor.format_panel_enabled': false });
    renderEditingText();
    expect(root.querySelector('[data-pkc-region="format-panel"]')).toBeNull();
  });
});
