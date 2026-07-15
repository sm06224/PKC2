/**
 * @vitest-environment happy-dom
 *
 * HTML 構造ごと markdown 復元 paste(2026-07-15、flag opt-in)。
 * user 報告「AI チャットの回答をコピペすると書式付きでいい感じに貼付
 * できないときがある」への対応:
 *   - 選択コピー(text/html = レンダリング済み HTML)→ 可換変換器で
 *     markdown に復元して挿入
 *   - AI の「コピー」ボタン(text/plain = markdown 原文)→ 介入しない
 *     (原文優先、二重変換防止)
 *   - flag `editor.html_paste_to_markdown` は既定 OFF(opt-in)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  htmlPasteToRichMarkdown,
  plainLooksLikeMarkdown,
  RICH_PASTE_HTML_MAX,
} from '@adapter/ui/html-paste-to-markdown';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { setContainerFlagSource } from '@adapter/flags';
import type { Container } from '@core/model/container';

const T = '2026-07-15T00:00:00Z';

// ChatGPT / Claude の回答を選択コピーしたときの text/html を模した fixture
const AI_HTML = [
  '<h2>手順</h2>',
  '<p>まず <strong>重要</strong> な <a href="https://example.com/doc">ドキュメント</a> を読む。</p>',
  '<ul><li>準備する</li><li>実行する</li></ul>',
  '<pre><code class="language-python">print("hello")</code></pre>',
  '<table><thead><tr><th>名前</th><th>値</th></tr></thead>',
  '<tbody><tr><td>a</td><td>1</td></tr></tbody></table>',
  '<blockquote><p>注意書き</p></blockquote>',
].join('');
// 選択コピー時の text/plain 相当(markdown 記号なしの平文)
const AI_PLAIN = '手順\nまず 重要 な ドキュメント を読む。\n準備する\n実行する\nprint("hello")\n名前 値\na 1\n注意書き';

describe('plainLooksLikeMarkdown(原文優先ヒューリスティック)', () => {
  it('フェンス / 見出し / 表 pipe / リンク / 強調は markdown と判定', () => {
    expect(plainLooksLikeMarkdown('```js\nx\n```')).toBe(true);
    expect(plainLooksLikeMarkdown('## 見出し\n本文')).toBe(true);
    expect(plainLooksLikeMarkdown('| a | b |\n| - | - |')).toBe(true);
    expect(plainLooksLikeMarkdown('see [doc](https://example.com)')).toBe(true);
    expect(plainLooksLikeMarkdown('これは **強調** です')).toBe(true);
  });

  it('平文(リスト記号 "- " 単独を含む)は markdown と判定しない', () => {
    expect(plainLooksLikeMarkdown(AI_PLAIN)).toBe(false);
    expect(plainLooksLikeMarkdown('- 買い物\n- 掃除')).toBe(false);
    expect(plainLooksLikeMarkdown('')).toBe(false);
  });
});

describe('htmlPasteToRichMarkdown(変換本体)', () => {
  it('構造付き HTML を markdown に復元する(見出し/リスト/コード/表/引用/装飾/リンク)', () => {
    const md = htmlPasteToRichMarkdown(AI_HTML, AI_PLAIN);
    expect(md).not.toBeNull();
    expect(md).toContain('## 手順');
    expect(md).toContain('**重要**');
    expect(md).toContain('[ドキュメント](https://example.com/doc)');
    expect(md).toMatch(/^- 準備する$/m);
    expect(md).toContain('```python');
    expect(md).toContain('print("hello")');
    expect(md).toMatch(/\| *名前 *\| *値 *\|/);
    expect(md).toMatch(/^> 注意書き$/m);
  });

  it('text/plain が markdown 原文らしければ介入しない(コピー ボタン経路優先)', () => {
    const mdPlain = '## 手順\n\n```python\nprint("hello")\n```';
    expect(htmlPasteToRichMarkdown(AI_HTML, mdPlain)).toBeNull();
  });

  it('構造の無い HTML は介入しない(anchor 正規化へ fallthrough)', () => {
    expect(htmlPasteToRichMarkdown('<p>plain <a href="https://x.example">x</a></p>', 'plain x')).toBeNull();
  });

  it('空 / 上限超過 HTML は介入しない', () => {
    expect(htmlPasteToRichMarkdown('', 'x')).toBeNull();
    expect(htmlPasteToRichMarkdown('<h1>' + 'x'.repeat(RICH_PASTE_HTML_MAX) + '</h1>', 'x')).toBeNull();
  });
});

// ── 統合: paste event → textarea 挿入(flag gate)──

let root: HTMLElement;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => {
  cleanup?.();
  root.remove();
  setContainerFlagSource({});
});

function setup() {
  const container: Container = {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Text', body: 'hello', archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
  const dispatcher = createDispatcher();
  dispatcher.onState((s) => render(s, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
  return root.querySelector<HTMLTextAreaElement>('[data-pkc-field="text-append-text"]')!;
}

function pasteHtmlOn(target: Element, html: string, plain: string): void {
  const ev = new Event('paste', { bubbles: true }) as unknown as ClipboardEvent;
  Object.defineProperty(ev, 'clipboardData', {
    value: {
      items: [{ kind: 'string', type: 'text/html', getAsFile: () => null }],
      getData: (t: string) => (t === 'text/html' ? html : plain),
    },
  });
  target.dispatchEvent(ev);
}

describe('paste 統合(flag gate、2026-07-15 user 判断で既定 ON = オプトアウト方式)', () => {
  it('既定(ON)で構造付き HTML paste が markdown として挿入される', () => {
    const ta = setup();
    pasteHtmlOn(ta, AI_HTML, AI_PLAIN);
    expect(ta.value).toContain('## 手順');
    expect(ta.value).toContain('```python');
    expect(ta.value).toMatch(/\| *名前 *\| *値 *\|/);
  });

  it('OFF でオプトアウトできる(従来の anchor 正規化 = 平文 + リンクのみ)', () => {
    setContainerFlagSource({ 'editor.html_paste_to_markdown': false });
    const ta = setup();
    pasteHtmlOn(ta, AI_HTML, AI_PLAIN);
    // 従来挙動: anchor があるので link 正規化は発火するが、構造は復元されない
    expect(ta.value).toContain('[ドキュメント](https://example.com/doc)');
    expect(ta.value).not.toContain('## 手順');
    expect(ta.value).not.toContain('```');
  });

  it('既定 ON でも text/plain が markdown 原文なら介入しない(コピー ボタン経路優先)', () => {
    const ta = setup();
    pasteHtmlOn(ta, AI_HTML, '## 手順\n\n```python\nprint("hello")\n```');
    expect(ta.value).toBe('');
  });

  it('オプトアウト(OFF)でも text/plain が markdown 原文なら anchor 正規化も介入しない(bug fix)', () => {
    // AI の「コピー」ボタン: markdown 原文が text/plain、レンダリング済み
    // HTML(anchor 含む)が text/html に併載されるケース。従来は anchor
    // 正規化が平文化 HTML で原文を上書きし、フェンス / 見出しが壊れていた。
    setContainerFlagSource({ 'editor.html_paste_to_markdown': false });
    const ta = setup();
    pasteHtmlOn(ta, AI_HTML, '## 手順\n\n```python\nprint("hello")\n```\n[ドキュメント](https://example.com/doc)');
    expect(ta.value).toBe(''); // 介入なし = native paste(test env では不変)
  });
});
