/**
 * @vitest-environment happy-dom
 *
 * pgc-181 wave-α' #4(v3 統合 master G6、handoff §3.5「Inspector History
 * tab の revision diff viewer」):各 revision row 末尾に「Show diff vs
 * current」 inline diff viewer を追加。`shell.revision_diff_viewer_enabled`
 * Tier 0 flag default OFF で gate、ON で `<details>` の中に line-level
 * diff(features/diff/line-diff の pure function 再利用)を表示。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-05-24T00:00:00Z';

function setFlag(diff: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (diff) {
    url.searchParams.set('pkc-flag', 'shell.revision_diff_viewer_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

function revision(id: string, createdAt: string, opts: { body?: string; title?: string } = {}): Container['revisions'][number] {
  return {
    id,
    entry_lid: 'e1',
    snapshot: JSON.stringify({
      lid: 'e1',
      title: opts.title ?? 'Entry One',
      body: opts.body ?? 'old body',
      archetype: 'text',
      created_at: TS,
      updated_at: createdAt,
    }),
    created_at: createdAt,
  };
}

function makeContainer(entryBody: string, revs: Container['revisions']): Container {
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry One', body: entryBody, archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [],
    revisions: revs,
    assets: {},
  };
}

let root: HTMLElement;

beforeEach(() => {
  __resetRegistry();
  __resetUrlCache();
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

function boot(container: Container) {
  const d = createDispatcher();
  d.onState((s) => render(s, root));
  d.dispatch({ type: 'SYS_INIT_COMPLETE', container });
  d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
  render(d.getState(), root);
  return d;
}

describe('pgc-181 revision diff viewer', () => {
  it('case 1: flag OFF だと diff `<details>` は描画されない(後方互換)', () => {
    setFlag(false);
    boot(makeContainer('current body', [revision('r1', '2026-04-10T09:00:00Z', { body: 'old body' })]));
    const diff = root.querySelector('.pkc-revision-diff');
    expect(diff).toBeNull();
  });

  it('case 2: flag ON + diff あり で diff `<details>` が描画', () => {
    setFlag(true);
    boot(makeContainer('current body\nnew line', [revision('r1', '2026-04-10T09:00:00Z', { body: 'old body' })]));
    const diff = root.querySelector('.pkc-revision-diff');
    expect(diff).not.toBeNull();
    expect(diff?.getAttribute('data-pkc-region')).toBe('revision-diff');
    expect(diff?.tagName.toLowerCase()).toBe('details');
  });

  it('case 3: summary に "+N / −M" count が含まれる', () => {
    setFlag(true);
    boot(makeContainer('line a\nline b\nline c', [revision('r1', '2026-04-10T09:00:00Z', { body: 'line a\nline b' })]));
    const summary = root.querySelector('.pkc-revision-diff-summary');
    expect(summary?.textContent).toContain('Show diff vs current');
    expect(summary?.textContent).toContain('+1');
    expect(summary?.textContent).toContain('−0');
  });

  it('case 4: add / del / same 各 row に data-pkc-diff-op attr', () => {
    setFlag(true);
    boot(makeContainer('a\nb\nc', [revision('r1', '2026-04-10T09:00:00Z', { body: 'a\nx\nc' })]));
    const adds = root.querySelectorAll('[data-pkc-diff-op="add"]');
    const dels = root.querySelectorAll('[data-pkc-diff-op="del"]');
    const sames = root.querySelectorAll('[data-pkc-diff-op="same"]');
    expect(adds.length).toBe(1); // +b
    expect(dels.length).toBe(1); // -x
    expect(sames.length).toBe(2); // a, c
  });

  it('case 5: rev = current(diff 無し)なら diff `<details>` は非描画(UI noise 回避)', () => {
    setFlag(true);
    boot(makeContainer('same body', [revision('r1', '2026-04-10T09:00:00Z', { body: 'same body' })]));
    const diff = root.querySelector('.pkc-revision-diff');
    expect(diff).toBeNull();
  });

  it('case 6: marker は add で "+"、del で "−"、same で " "', () => {
    setFlag(true);
    boot(makeContainer('keep\nadded', [revision('r1', '2026-04-10T09:00:00Z', { body: 'keep\nremoved' })]));
    const addMarker = root.querySelector('[data-pkc-diff-op="add"] .pkc-revision-diff-marker');
    const delMarker = root.querySelector('[data-pkc-diff-op="del"] .pkc-revision-diff-marker');
    const sameMarker = root.querySelector('[data-pkc-diff-op="same"] .pkc-revision-diff-marker');
    expect(addMarker?.textContent).toBe('+');
    expect(delMarker?.textContent).toBe('−');
    expect(sameMarker?.textContent).toBe(' ');
  });

  it('case 7: add row には new body(right)、del row には rev body(left)を表示', () => {
    setFlag(true);
    boot(makeContainer('hello world', [revision('r1', '2026-04-10T09:00:00Z', { body: 'goodbye moon' })]));
    const addRow = root.querySelector('[data-pkc-diff-op="add"] .pkc-revision-diff-text');
    const delRow = root.querySelector('[data-pkc-diff-op="del"] .pkc-revision-diff-text');
    expect(addRow?.textContent).toBe('hello world');
    expect(delRow?.textContent).toBe('goodbye moon');
  });

  it('case 8: 複数 revision それぞれに別 diff が出る(latest と current で diff、middle と current で別 diff)', () => {
    setFlag(true);
    const revs = [
      revision('r-old', '2026-04-10T09:00:00Z', { body: 'A\nB' }),
      revision('r-new', '2026-04-15T18:00:00Z', { body: 'A\nB\nC' }), // latest, 中間
    ];
    boot(makeContainer('A\nB\nC\nD', revs));
    const diffs = root.querySelectorAll('.pkc-revision-diff');
    expect(diffs.length).toBe(2);
    // r-new(latest)vs current("A\nB\nC\nD"):+D
    // r-old vs current:+C, +D
    // 順序は newest first(revsDesc)
  });

  it('case 9: `<details>` default 閉じ(open attr 無し、視覚 noise 回避)', () => {
    setFlag(true);
    boot(makeContainer('a', [revision('r1', '2026-04-10T09:00:00Z', { body: 'b' })]));
    const det = root.querySelector('.pkc-revision-diff');
    expect(det?.hasAttribute('open')).toBe(false);
  });

  it('case 10: diff body に max-height 制約(CSS 上で .pkc-revision-diff-body)+ scroll', () => {
    setFlag(true);
    // 長い diff
    const oldBody = Array.from({ length: 30 }, (_, i) => `old line ${i}`).join('\n');
    const newBody = Array.from({ length: 30 }, (_, i) => `new line ${i}`).join('\n');
    boot(makeContainer(newBody, [revision('r1', '2026-04-10T09:00:00Z', { body: oldBody })]));
    const body = root.querySelector('.pkc-revision-diff-body');
    expect(body).not.toBeNull();
    // 30 add + 30 del = 60 rows、scroll で全部見れる
    const rows = root.querySelectorAll('.pkc-revision-diff-row');
    expect(rows.length).toBe(60);
  });

  it('case 11: readonly mode でも diff は表示(informational、編集不能でも履歴比較は有用)', () => {
    setFlag(true);
    const container = makeContainer('current body', [revision('r1', '2026-04-10T09:00:00Z', { body: 'old' })]);
    const d = createDispatcher();
    d.onState((s) => render(s, root));
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container, readonly: true });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(d.getState(), root);
    // readonly でも revision picker + diff は表示(view-only 情報、編集 button のみ canEdit gate)
    const diff = root.querySelector('.pkc-revision-diff');
    expect(diff).not.toBeNull();
    // 編集 button(restore / branch)は canEdit gate なので非描画
    const restoreBtn = root.querySelector('[data-pkc-action="restore-entry"]');
    expect(restoreBtn).toBeNull();
  });
});
