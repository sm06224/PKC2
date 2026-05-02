/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '@adapter/state/app-state';
import { buildDebugReportFromState } from '@adapter/ui/debug-report';
import type { Container } from '@core/model/container';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
});

function makeContainer(overrides: Partial<Container> = {}): Container {
  return {
    meta: {
      container_id: 'c-test',
      title: 'Test',
      created_at: '2026-05-01T00:00:00Z',
      updated_at: '2026-05-01T00:00:00Z',
      schema_version: 1,
    },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
    ...overrides,
  };
}

describe('buildDebugReportFromState', () => {
  it('returns null container when state.container is null', () => {
    const report = buildDebugReportFromState(createInitialState());
    expect(report.container).toBeNull();
    expect(report.phase).toBe('initializing');
    expect(report.view).toBe('detail');
    expect(report.selectedLid).toBeNull();
    expect(report.editingLid).toBeNull();
  });

  it('summarizes container counts and asset key list', () => {
    const ts = '2026-05-01T00:00:00Z';
    const container = makeContainer({
      entries: [
        { lid: 'e-1', title: 'A', body: 'secret-body-A', archetype: 'text', created_at: ts, updated_at: ts },
        { lid: 'e-2', title: 'B', body: 'secret-body-B', archetype: 'todo', created_at: ts, updated_at: ts },
        { lid: 'e-3', title: 'C', body: 'secret-body-C', archetype: 'text', created_at: ts, updated_at: ts },
      ],
      relations: [
        { id: 'r-1', kind: 'categorical', from: 'e-1', to: 'tag:work', created_at: ts, updated_at: ts },
      ],
      assets: {
        'asset-key-alpha': 'data:image/png;base64,AAAA',
        'asset-key-beta': 'data:image/png;base64,BBBB',
      },
    });
    const state = { ...createInitialState(), container };
    const report = buildDebugReportFromState(state);

    expect(report.container).not.toBeNull();
    expect(report.container!.entryCount).toBe(3);
    expect(report.container!.relationCount).toBe(1);
    expect(report.container!.assetKeys).toEqual([
      'asset-key-alpha',
      'asset-key-beta',
    ]);
  });

  it('does NOT leak entry body text into the report', () => {
    const ts = '2026-05-01T00:00:00Z';
    const container = makeContainer({
      entries: [
        {
          lid: 'e-1',
          title: 'private',
          body: 'TOP-SECRET-PASSPHRASE-9F2A',
          archetype: 'text',
          created_at: ts,
          updated_at: ts,
        },
      ],
    });
    const state = { ...createInitialState(), container };
    const report = buildDebugReportFromState(state);
    const json = JSON.stringify(report);
    expect(json).not.toContain('TOP-SECRET-PASSPHRASE-9F2A');
    expect(json).not.toContain('private');
  });

  it('does NOT leak asset base64 data into the report', () => {
    const container = makeContainer({
      assets: {
        'asset-key-1': 'data:image/png;base64,VEVTVF9TRUNSRVRfQkFTRTY0',
      },
    });
    const state = { ...createInitialState(), container };
    const report = buildDebugReportFromState(state);
    const json = JSON.stringify(report);
    expect(json).not.toContain('VEVTVF9TRUNSRVRfQkFTRTY0');
    // The KEY name is allowed (spec §5.4); the data isn't.
    expect(report.container!.assetKeys).toContain('asset-key-1');
  });

  it('passes through phase, view, and selection identifiers', () => {
    const state = {
      ...createInitialState(),
      phase: 'editing' as const,
      viewMode: 'kanban' as const,
      selectedLid: 'e-42',
      editingLid: 'e-42',
      container: makeContainer(),
    };
    const report = buildDebugReportFromState(state);
    expect(report.phase).toBe('editing');
    expect(report.view).toBe('kanban');
    expect(report.selectedLid).toBe('e-42');
    expect(report.editingLid).toBe('e-42');
  });
});
