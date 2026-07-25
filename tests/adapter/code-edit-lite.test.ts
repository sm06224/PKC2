/** @vitest-environment happy-dom */
/**
 * CodeEditLite component(code-edit-lite.ts)の contract。
 * Host 契約(value / lang / validate / onCommit / onCancel)と
 * overlay 同期・エラー表示・キー操作の配線を検証する。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountCodeEditLite, type CodeEditError } from '@adapter/ui/code-edit-lite';

function mount(over: Partial<Parameters<typeof mountCodeEditLite>[1]> = {}) {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const handle = mountCodeEditLite(document.body, {
    value: over.value ?? '{\n  "a": 1\n}',
    lang: over.lang ?? 'json',
    validate: over.validate,
    onCommit,
    onCancel,
    commitLabel: over.commitLabel,
  });
  return { handle, onCommit, onCancel };
}

function keydown(ta: HTMLTextAreaElement, init: KeyboardEventInit): void {
  ta.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('mount と overlay', () => {
  it('overlay に highlight 済み HTML が入り、data-pkc-lang が立つ', () => {
    const { handle } = mount();
    expect(handle.root.getAttribute('data-pkc-region')).toBe('code-edit-lite');
    expect(handle.root.getAttribute('data-pkc-lang')).toBe('json');
    const code = handle.root.querySelector('.pkc-code-edit-highlight code')!;
    expect(code.className).toBe('language-json');
    expect(code.innerHTML).toContain('pkc-tok-'); // json は highlight 対象
    expect(handle.textarea.getAttribute('wrap')).toBe('off');
  });

  it('input で overlay が追従する', () => {
    const { handle } = mount({ value: '' });
    handle.textarea.value = '"hello"';
    handle.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const code = handle.root.querySelector('.pkc-code-edit-highlight code')!;
    expect(code.textContent).toContain('"hello"');
  });
});

describe('validate 契約', () => {
  const failOnX = (value: string): CodeEditError[] =>
    value.includes('x') ? [{ line: 2, message: 'x は禁止' }] : [];

  it('エラー時: 行付きで表示され、保存が disabled になる', () => {
    const { handle } = mount({ value: 'ax', validate: failOnX });
    const errors = handle.root.querySelector('[data-pkc-region="code-edit-errors"]')!;
    expect(errors.textContent).toContain('行 2: x は禁止');
    const commit = handle.root.querySelector<HTMLButtonElement>('[data-pkc-action="code-edit-commit"]')!;
    expect(commit.disabled).toBe(true);
  });

  it('修正で解除される(input → revalidate)', () => {
    const { handle, onCommit } = mount({ value: 'ax', validate: failOnX });
    handle.textarea.value = 'a';
    handle.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const commit = handle.root.querySelector<HTMLButtonElement>('[data-pkc-action="code-edit-commit"]')!;
    expect(commit.disabled).toBe(false);
    commit.click();
    expect(onCommit).toHaveBeenCalledWith('a');
  });

  it('エラー中は Ctrl+Enter でも commit されない', () => {
    const { handle, onCommit } = mount({ value: 'ax', validate: failOnX });
    keydown(handle.textarea, { key: 'Enter', ctrlKey: true });
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('キー操作の配線', () => {
  it('Escape → onCancel / Ctrl+Enter → onCommit', () => {
    const { handle, onCommit, onCancel } = mount();
    keydown(handle.textarea, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
    keydown(handle.textarea, { key: 'Enter', ctrlKey: true });
    expect(onCommit).toHaveBeenCalledWith(handle.getValue());
  });

  it('Tab が indent になる(既定の focus 移動を消費)', () => {
    const { handle } = mount({ value: 'ab' });
    handle.textarea.selectionStart = handle.textarea.selectionEnd = 1;
    keydown(handle.textarea, { key: 'Tab' });
    expect(handle.getValue()).toBe('a  b');
  });

  it('IME 変換中(isComposing)はキー支援に介入しない', () => {
    const { handle } = mount({ value: 'ab' });
    handle.textarea.selectionStart = handle.textarea.selectionEnd = 1;
    keydown(handle.textarea, { key: 'Tab', isComposing: true } as KeyboardEventInit);
    expect(handle.getValue()).toBe('ab');
  });
});

describe('タグ wrap(markup 言語のみ)', () => {
  it('html では wrap UI が出て、選択をタグで包む', () => {
    const { handle } = mount({ value: 'hello', lang: 'html' });
    const input = handle.root.querySelector<HTMLInputElement>('.pkc-code-edit-wrap-tag-name')!;
    expect(input).not.toBeNull();
    input.value = 'em';
    handle.textarea.selectionStart = 0;
    handle.textarea.selectionEnd = 5;
    handle.root.querySelector<HTMLButtonElement>('[data-pkc-action="code-edit-wrap-tag"]')!.click();
    expect(handle.getValue()).toBe('<em>hello</em>');
  });

  it('json では wrap UI を出さない', () => {
    const { handle } = mount({ lang: 'json' });
    expect(handle.root.querySelector('[data-pkc-action="code-edit-wrap-tag"]')).toBeNull();
  });
});

describe('xml highlight(alias 追加の回帰 pin)', () => {
  it('lang=xml でも overlay に token span が入る', () => {
    const { handle } = mount({ value: '<a href="x">t</a>', lang: 'xml' });
    const code = handle.root.querySelector('.pkc-code-edit-highlight code')!;
    expect(code.innerHTML).toContain('pkc-tok-');
  });
});

describe('destroy', () => {
  it('root が DOM から消える', () => {
    const { handle } = mount();
    handle.destroy();
    expect(document.querySelector('[data-pkc-region="code-edit-lite"]')).toBeNull();
  });
});
