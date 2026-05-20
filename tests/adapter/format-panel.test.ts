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
import { FORMAT_GROUPS, renderFormatPanel } from '@adapter/ui/format-panel';
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

  it('every operation has a label / title / apply fn', () => {
    for (const g of FORMAT_GROUPS) {
      for (const op of g.ops) {
        expect(op.label.length).toBeGreaterThan(0);
        expect(op.title.length).toBeGreaterThan(0);
        expect(typeof op.apply).toBe('function');
      }
    }
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

  it('renders 14 operation buttons total', () => {
    const panel = renderFormatPanel();
    expect(panel.querySelectorAll('.pkc-format-panel-btn')).toHaveLength(14);
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

describe('format-panel — button click applies to the editor textarea', () => {
  it('clicking B wraps the textarea selection', () => {
    const editor = document.createElement('div');
    editor.className = 'pkc-editor';
    const panel = renderFormatPanel();
    const ta = document.createElement('textarea');
    editor.appendChild(panel);
    editor.appendChild(ta);
    document.body.appendChild(editor);

    ta.value = 'Hello World';
    ta.focus();
    ta.setSelectionRange(0, 5);

    const boldBtn = panel.querySelector<HTMLButtonElement>(
      '[data-pkc-format-label="B"]',
    );
    expect(boldBtn).not.toBeNull();
    boldBtn!.click();
    expect(ta.value).toBe('**Hello** World');

    editor.remove();
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
    expect(panel!.querySelectorAll('.pkc-format-panel-btn')).toHaveLength(14);
  });

  it('flag OFF: the editor has no format ribbon', () => {
    setContainerFlagSource({ 'editor.format_panel_enabled': false });
    renderEditingText();
    expect(root.querySelector('[data-pkc-region="format-panel"]')).toBeNull();
  });
});
