/** @vitest-environment happy-dom */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  readPkcData,
  chooseBootSource,
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

  it('prefers pkc-data over IDB when both are present (the fix)', () => {
    const chosen = chooseBootSource(pkcData, idbContainer);
    expect(chosen.source).toBe('pkc-data');
    expect(chosen.container!.meta.container_id).toBe('c-export');
  });

  it('forwards readonly from pkc-data', () => {
    const chosen = chooseBootSource({ ...pkcData, readonly: true }, idbContainer);
    expect(chosen.source).toBe('pkc-data');
    expect(chosen.readonly).toBe(true);
  });

  it('forwards lightSource from pkc-data', () => {
    const chosen = chooseBootSource({ ...pkcData, lightSource: true }, idbContainer);
    expect(chosen.source).toBe('pkc-data');
    expect(chosen.lightSource).toBe(true);
  });

  it('falls back to IDB when pkc-data is null', () => {
    const chosen = chooseBootSource(null, idbContainer);
    expect(chosen.source).toBe('idb');
    expect(chosen.container!.meta.container_id).toBe('c-idb');
    expect(chosen.readonly).toBe(false);
    expect(chosen.lightSource).toBe(false);
  });

  it('falls back to empty when both sources are null', () => {
    const chosen = chooseBootSource(null, null);
    expect(chosen.source).toBe('empty');
    expect(chosen.container).toBeNull();
  });

  it('does NOT inherit readonly/lightSource from a non-pkc-data source', () => {
    const chosen = chooseBootSource(null, idbContainer);
    expect(chosen.readonly).toBe(false);
    expect(chosen.lightSource).toBe(false);
  });
});
