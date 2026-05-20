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

  it('carries the 14 existing operations across groups', () => {
    const total = FORMAT_GROUPS.reduce((n, g) => n + g.ops.length, 0);
    expect(total).toBe(14);
  });

  it('Font group has the font-size and font-family pickers', () => {
    const font = FORMAT_GROUPS.find((g) => g.id === 'font');
    expect(font?.pickers?.map((p) => p.id)).toEqual(['font-size', 'font-family']);
  });

  it('font-size picker has 5 options, font-family has 3', () => {
    const font = FORMAT_GROUPS.find((g) => g.id === 'font');
    const size = font?.pickers?.find((p) => p.id === 'font-size');
    const family = font?.pickers?.find((p) => p.id === 'font-family');
    expect(size?.options).toHaveLength(5);
    expect(family?.options).toHaveLength(3);
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

  it('renders 14 operation buttons (data-pkc-format-label)', () => {
    const panel = renderFormatPanel();
    expect(panel.querySelectorAll('[data-pkc-format-label]')).toHaveLength(14);
  });

  it('renders 2 value pickers with their option buttons', () => {
    const panel = renderFormatPanel();
    expect(panel.querySelectorAll('[data-pkc-picker]')).toHaveLength(2);
    const sizeOpts = panel.querySelectorAll(
      '[data-pkc-picker="font-size"] [data-pkc-picker-value]',
    );
    const familyOpts = panel.querySelectorAll(
      '[data-pkc-picker="font-family"] [data-pkc-picker-value]',
    );
    expect(sizeOpts).toHaveLength(5);
    expect(familyOpts).toHaveLength(3);
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
  it('7. :text:red: + lg → 未知 category(色)は維持し合成', () => {
    expect(apply(':hello:red:', 0, 11, 'lg')).toBe(':hello:red,lg:');
  });
  it('8. 空選択 + size → :​:size:(inner 空)', () => {
    expect(apply('', 0, 0, 'lg')).toBe('::lg:');
  });
  it('9. CJK 選択 + size', () => {
    expect(apply('日本語', 0, 3, 'lg')).toBe(':日本語:lg:');
  });
  it('10. 絵文字選択 + size', () => {
    expect(apply('🎉', 0, 2, 'lg')).toBe(':🎉:lg:');
  });
  it('11. 行中の選択のみ wrap、前後は不変', () => {
    expect(apply('ab cd ef', 3, 5, 'lg')).toBe('ab :cd:lg: ef');
  });
  it('12. コロン入り選択は simple-inline と見なさず fresh wrap', () => {
    expect(apply(':a:b:c:', 0, 7, 'lg')).toBe('::a:b:c::lg:');
  });
  it('caret は置換後の simple-inline 全体を選択する', () => {
    const r = applySimpleInlineAttr({ value: 'hello', start: 0, end: 5 }, 'lg');
    expect(r.start).toBe(0);
    expect(r.end).toBe(':hello:lg:'.length);
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
});

describe('format-panel — renderer integration (flag-gated)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
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
    expect(panel!.querySelectorAll('[data-pkc-format-label]')).toHaveLength(14);
    expect(panel!.querySelectorAll('[data-pkc-picker]')).toHaveLength(2);
  });

  it('flag OFF: the editor has no format ribbon', () => {
    setContainerFlagSource({ 'editor.format_panel_enabled': false });
    renderEditingText();
    expect(root.querySelector('[data-pkc-region="format-panel"]')).toBeNull();
  });
});
