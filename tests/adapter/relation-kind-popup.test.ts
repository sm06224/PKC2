/**
 * @vitest-environment happy-dom
 *
 * graph relation wire editor の kind selector popup(Group B、Phase γ-B2-3）。
 * popup 単体 + wire-drop → popup → CREATE_RELATION の鎖を検証。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  openRelationKindPopup,
  closeRelationKindPopup,
} from '@adapter/ui/relation-kind-popup';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { RelationKind } from '@core/model/relation';

describe('relation-kind-popup (Phase γ-B2-3)', () => {
  beforeEach(() => {
    closeRelationKindPopup();
    document.body.innerHTML = '';
  });

  it('openRelationKindPopup は 4 kind button + cancel を出す', () => {
    openRelationKindPopup({ x: 10, y: 20, onPick: () => {} });
    const popup = document.querySelector(
      '[data-pkc-region="relation-kind-popup"]',
    );
    expect(popup).not.toBeNull();
    expect(
      popup!.querySelectorAll('.pkc-relation-kind-popup-btn'),
    ).toHaveLength(4);
    expect(
      popup!.querySelector('[data-pkc-relation-kind="cancel"]'),
    ).not.toBeNull();
  });

  it('kind button click で onPick(kind) を呼んで閉じる', () => {
    let picked: RelationKind | null = null;
    openRelationKindPopup({
      x: 0,
      y: 0,
      onPick: (k) => {
        picked = k;
      },
    });
    document
      .querySelector<HTMLButtonElement>('[data-pkc-relation-kind="semantic"]')!
      .click();
    expect(picked).toBe('semantic');
    expect(
      document.querySelector('[data-pkc-region="relation-kind-popup"]'),
    ).toBeNull();
  });

  it('cancel button は onPick を呼ばず閉じる', () => {
    let picked: RelationKind | null = null;
    openRelationKindPopup({
      x: 0,
      y: 0,
      onPick: (k) => {
        picked = k;
      },
    });
    document
      .querySelector<HTMLButtonElement>('[data-pkc-relation-kind="cancel"]')!
      .click();
    expect(picked).toBeNull();
    expect(
      document.querySelector('[data-pkc-region="relation-kind-popup"]'),
    ).toBeNull();
  });

  it('再 open で前の popup は閉じ、同時に 1 つだけ', () => {
    openRelationKindPopup({ x: 0, y: 0, onPick: () => {} });
    openRelationKindPopup({ x: 0, y: 0, onPick: () => {} });
    expect(
      document.querySelectorAll('[data-pkc-region="relation-kind-popup"]'),
    ).toHaveLength(1);
  });

  it('wire-drop → popup → kind click で CREATE_RELATION が dispatch される', () => {
    const root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
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
          title: 'A',
          body: '',
          archetype: 'text',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          lid: 'e2',
          title: 'B',
          body: '',
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
    render(dispatcher.getState(), root);
    bindActions(root, dispatcher);

    root.dispatchEvent(
      new CustomEvent('pkc-graph-wire-drop', {
        detail: { source: 'e1', target: 'e2', clientX: 50, clientY: 60 },
        bubbles: true,
      }),
    );
    const popup = document.querySelector(
      '[data-pkc-region="relation-kind-popup"]',
    );
    expect(popup).not.toBeNull();
    popup!
      .querySelector<HTMLButtonElement>(
        '[data-pkc-relation-kind="structural"]',
      )!
      .click();

    const rel = dispatcher
      .getState()
      .container!.relations.find((r) => r.from === 'e1' && r.to === 'e2');
    expect(rel).toBeDefined();
    expect(rel!.kind).toBe('structural');
  });
});
