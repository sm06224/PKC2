/** @vitest-environment happy-dom */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  readPkcData,
  chooseBootSource,
  finalizeChooserChoice,
} from '@adapter/platform/pkc-data-source';
import { SLOT } from '@runtime/contract';
import type { Container } from '@core/model/container';

const T = '2026-04-16T00:00:00Z';

const sampleContainer: Container = {
  meta: {
    container_id: 'c-export',
    title: 'Exported',
    created_at: T,
    updated_at: T,
    schema_version: 1,
  },
  entries: [
    { lid: 'e1', title: 'Hello', body: 'world', archetype: 'text', created_at: T, updated_at: T },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

const idbContainer: Container = {
  ...sampleContainer,
  meta: { ...sampleContainer.meta, container_id: 'c-idb', title: 'From IDB' },
  entries: [
    { lid: 'e2', title: 'Local', body: 'idb side', archetype: 'text', created_at: T, updated_at: T },
  ],
};

function mountPkcData(payload: string | null): HTMLScriptElement | null {
  document.body.innerHTML = '';
  if (payload === null) return null;
  const el = document.createElement('script');
  el.id = SLOT.DATA;
  el.type = 'application/json';
  el.textContent = payload;
  document.body.appendChild(el);
  return el;
}

describe('readPkcData', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns null when the #pkc-data element is absent', async () => {
    const result = await readPkcData();
    expect(result).toBeNull();
  });

  it('returns null when the element holds the canonical empty payload "{}"', async () => {
    mountPkcData('{}');
    const result = await readPkcData();
    expect(result).toBeNull();
  });

  it('returns null when the element is whitespace-only', async () => {
    mountPkcData('   \n\t   ');
    const result = await readPkcData();
    expect(result).toBeNull();
  });

  it('returns null and does not throw when JSON is malformed', async () => {
    mountPkcData('{ not valid json');
    const result = await readPkcData();
    expect(result).toBeNull();
  });

  it('returns result (not null) even when the container has only system-* entries', async () => {
    // System-entry isolation: a system-only pkc-data payload still
    // carries authoritative About / Settings data that must be merged
    // onto the IDB or empty boot container. readPkcData surfaces the
    // container with a populated systemEntries list; chooseBootSource
    // is what decides the payload doesn't win the boot vote.
    const systemOnlyContainer: Container = {
      ...sampleContainer,
      entries: [
        { lid: '__about__', title: 'About', body: '{}', archetype: 'system-about', created_at: T, updated_at: T },
      ],
    };
    mountPkcData(JSON.stringify({ container: systemOnlyContainer }));
    const result = await readPkcData();
    expect(result).not.toBeNull();
    expect(result!.systemEntries).toHaveLength(1);
    expect(result!.systemEntries![0]!.lid).toBe('__about__');
  });

  it('populates systemEntries separately from container.entries', async () => {
    const mixedContainer: Container = {
      ...sampleContainer,
      entries: [
        { lid: '__about__', title: 'About', body: '{}', archetype: 'system-about', created_at: T, updated_at: T },
        { lid: 'e1', title: 'Hello', body: 'world', archetype: 'text', created_at: T, updated_at: T },
      ],
    };
    mountPkcData(JSON.stringify({ container: mixedContainer }));
    const result = await readPkcData();
    expect(result).not.toBeNull();
    expect(result!.container.entries).toHaveLength(2);
    expect(result!.systemEntries).toHaveLength(1);
    expect(result!.systemEntries![0]!.lid).toBe('__about__');
  });

  it('returns null when the payload has no container key', async () => {
    mountPkcData(JSON.stringify({ export_meta: { mode: 'full' } }));
    const result = await readPkcData();
    expect(result).toBeNull();
  });

  it('returns the container with readonly=false / lightSource=false by default', async () => {
    mountPkcData(JSON.stringify({ container: sampleContainer }));
    const result = await readPkcData();
    expect(result).not.toBeNull();
    expect(result!.container.meta.container_id).toBe('c-export');
    expect(result!.readonly).toBe(false);
    expect(result!.lightSource).toBe(false);
  });

  it('marks readonly=true when export_meta.mutability === "readonly"', async () => {
    mountPkcData(JSON.stringify({
      container: sampleContainer,
      export_meta: { mutability: 'readonly' },
    }));
    const result = await readPkcData();
    expect(result!.readonly).toBe(true);
  });

  it('marks lightSource=true when export_meta.mode === "light"', async () => {
    mountPkcData(JSON.stringify({
      container: sampleContainer,
      export_meta: { mode: 'light' },
    }));
    const result = await readPkcData();
    expect(result!.lightSource).toBe(true);
  });
});

describe('chooseBootSource', () => {
  const pkcData = {
    container: sampleContainer,
    readonly: false,
    lightSource: false,
  };

  it('returns source="chooser" when both pkc-data AND IDB are present (policy revision)', () => {
    const chosen = chooseBootSource(pkcData, idbContainer);
    expect(chosen.source).toBe('chooser');
    expect(chosen.container).toBeNull();
    expect(chosen.pkcData).toBe(pkcData);
    expect(chosen.idbContainer).toBe(idbContainer);
  });

  it('boots pkc-data directly with viewOnlySource=true when IDB is absent', () => {
    const chosen = chooseBootSource(pkcData, null);
    expect(chosen.source).toBe('pkc-data');
    expect(chosen.container!.meta.container_id).toBe('c-export');
    expect(chosen.viewOnlySource).toBe(true);
  });

  it('forwards readonly from pkc-data in direct pkc-data path', () => {
    const chosen = chooseBootSource({ ...pkcData, readonly: true }, null);
    expect(chosen.source).toBe('pkc-data');
    expect(chosen.readonly).toBe(true);
    expect(chosen.viewOnlySource).toBe(true);
  });

  it('forwards lightSource from pkc-data in direct pkc-data path', () => {
    const chosen = chooseBootSource({ ...pkcData, lightSource: true }, null);
    expect(chosen.source).toBe('pkc-data');
    expect(chosen.lightSource).toBe(true);
    expect(chosen.viewOnlySource).toBe(true);
  });

  it('falls back to IDB when pkc-data is null', () => {
    const chosen = chooseBootSource(null, idbContainer);
    expect(chosen.source).toBe('idb');
    expect(chosen.container!.meta.container_id).toBe('c-idb');
    expect(chosen.readonly).toBe(false);
    expect(chosen.lightSource).toBe(false);
    expect(chosen.viewOnlySource).toBe(false);
  });

  it('falls back to empty when both sources are null', () => {
    const chosen = chooseBootSource(null, null);
    expect(chosen.source).toBe('empty');
    expect(chosen.container).toBeNull();
    expect(chosen.viewOnlySource).toBe(false);
  });

  it('returns idb (not chooser) when pkc-data has no user content, even if pkc-data is present', () => {
    // System-entry isolation: a system-only pkc-data must not trigger
    // the chooser or the view-only pkc-data boot path. IDB wins.
    const systemOnlyPkcData = {
      container: {
        ...sampleContainer,
        entries: [
          { lid: '__about__', title: 'About', body: '{}', archetype: 'system-about' as const, created_at: T, updated_at: T },
        ],
      },
      readonly: false,
      lightSource: false,
      systemEntries: [
        { lid: '__about__', title: 'About', body: '{}', archetype: 'system-about' as const, created_at: T, updated_at: T },
      ],
    };
    const chosen = chooseBootSource(systemOnlyPkcData, idbContainer);
    expect(chosen.source).toBe('idb');
    expect(chosen.viewOnlySource).toBe(false);
    expect(chosen.systemEntriesFromPkcData).toHaveLength(1);
    expect(chosen.systemEntriesFromPkcData![0]!.lid).toBe('__about__');
  });

  it('returns empty (not pkc-data) when pkc-data is system-only and IDB is absent', () => {
    const systemOnlyPkcData = {
      container: {
        ...sampleContainer,
        entries: [
          { lid: '__about__', title: 'About', body: '{}', archetype: 'system-about' as const, created_at: T, updated_at: T },
        ],
      },
      readonly: false,
      lightSource: false,
      systemEntries: [
        { lid: '__about__', title: 'About', body: '{}', archetype: 'system-about' as const, created_at: T, updated_at: T },
      ],
    };
    const chosen = chooseBootSource(systemOnlyPkcData, null);
    expect(chosen.source).toBe('empty');
    expect(chosen.viewOnlySource).toBe(false);
    expect(chosen.systemEntriesFromPkcData).toHaveLength(1);
  });

  it('surfaces systemEntriesFromPkcData on idb path so caller can merge authoritative system entries', () => {
    const pkcDataWithSystem = {
      container: sampleContainer,
      readonly: false,
      lightSource: false,
      systemEntries: [
        { lid: '__about__', title: 'About v2', body: '{"version":"2.0.0"}', archetype: 'system-about' as const, created_at: T, updated_at: T },
      ],
    };
    // pkc-data has user content + idb is present → chooser, but system entries still surfaced
    const chosen = chooseBootSource(pkcDataWithSystem, idbContainer);
    expect(chosen.systemEntriesFromPkcData).toHaveLength(1);
  });

  it('does NOT inherit readonly/lightSource/viewOnlySource from IDB-only path', () => {
    const chosen = chooseBootSource(null, idbContainer);
    expect(chosen.readonly).toBe(false);
    expect(chosen.lightSource).toBe(false);
    expect(chosen.viewOnlySource).toBe(false);
  });
});

describe('finalizeChooserChoice', () => {
  const pkcData = {
    container: sampleContainer,
    readonly: false,
    lightSource: false,
  };

  it('resolves to pkc-data with viewOnlySource=true when user picks embedded', () => {
    const resolved = finalizeChooserChoice(pkcData, idbContainer, 'pkc-data');
    expect(resolved.source).toBe('pkc-data');
    expect(resolved.container!.meta.container_id).toBe('c-export');
    expect(resolved.viewOnlySource).toBe(true);
  });

  it('resolves to idb with viewOnlySource=false when user picks IDB', () => {
    const resolved = finalizeChooserChoice(pkcData, idbContainer, 'idb');
    expect(resolved.source).toBe('idb');
    expect(resolved.container!.meta.container_id).toBe('c-idb');
    expect(resolved.viewOnlySource).toBe(false);
  });

  it('preserves readonly/lightSource when embedded is picked', () => {
    const resolved = finalizeChooserChoice(
      { ...pkcData, readonly: true, lightSource: true },
      idbContainer,
      'pkc-data',
    );
    expect(resolved.readonly).toBe(true);
    expect(resolved.lightSource).toBe(true);
    expect(resolved.viewOnlySource).toBe(true);
  });
});
