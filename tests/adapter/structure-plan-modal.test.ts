/**
 * @vitest-environment happy-dom
 *
 * #905 — 構成コマンド適用 modal の wiring test。
 * 貼り付け → dry-run プレビュー表示 → 適用で APPLY_STRUCTURE_OPS が
 * dispatch され container が実際に変わる(consumer 観測点)ことを確認。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  openStructurePlanModal,
  closeStructurePlanModal,
  isStructurePlanModalOpen,
} from '@adapter/ui/structure-plan-modal';
import type { Container } from '@core/model/container';

const T = '2026-07-12T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-905', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'f1', title: 'Projects', body: '', archetype: 'folder', created_at: T, updated_at: T },
      { lid: 'e2', title: 'Loose', body: 'y', archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function boot() {
  const dispatcher = createDispatcher();
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  return dispatcher;
}

function q<T extends HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing: ${sel}`);
  return el;
}

beforeEach(() => {
  closeStructurePlanModal();
  document.body.innerHTML = '';
});

describe('structure-plan-modal(#905)', () => {
  it('open → 正しいコマンド貼り付けで dry-run プレビューが出て適用が有効化', () => {
    const dispatcher = boot();
    openStructurePlanModal(dispatcher);
    expect(isStructurePlanModalOpen()).toBe(true);

    const input = q<HTMLTextAreaElement>('[data-pkc-region="structure-plan-input"]');
    const apply = q<HTMLButtonElement>('[data-pkc-action="structure-plan-apply"]');
    expect(apply.disabled).toBe(true);

    input.value = 'mv e2 f1\nrename e2 "Z"';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const preview = q<HTMLElement>('[data-pkc-region="structure-plan-preview"]');
    expect(preview.textContent).toContain('"Loose": root → "Projects"');
    expect(preview.textContent).toContain('rename "Loose" → "Z"');
    expect(apply.disabled).toBe(false);
  });

  it('エラーのあるプランは ⛔ を表示し適用を無効化', () => {
    openStructurePlanModal(boot());
    const input = q<HTMLTextAreaElement>('[data-pkc-region="structure-plan-input"]');
    input.value = 'mv nope f1';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const preview = q<HTMLElement>('[data-pkc-region="structure-plan-preview"]');
    expect(preview.textContent).toContain('⛔');
    expect(q<HTMLButtonElement>('[data-pkc-action="structure-plan-apply"]').disabled).toBe(true);
  });

  it('適用 click → APPLY_STRUCTURE_OPS が走り container が実変化、modal は閉じる', () => {
    const dispatcher = boot();
    openStructurePlanModal(dispatcher);
    const input = q<HTMLTextAreaElement>('[data-pkc-region="structure-plan-input"]');
    input.value = 'mv e2 f1';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    q<HTMLButtonElement>('[data-pkc-action="structure-plan-apply"]').click();

    const c = dispatcher.getState().container!;
    const rel = c.relations.find((r) => r.kind === 'structural' && r.to === 'e2');
    expect(rel?.from).toBe('f1');
    expect(isStructurePlanModalOpen()).toBe(false);
  });

  it('readonly container では開かない', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer(), readonly: true });
    openStructurePlanModal(dispatcher);
    expect(isStructurePlanModalOpen()).toBe(false);
  });
});
