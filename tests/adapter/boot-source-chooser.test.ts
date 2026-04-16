/** @vitest-environment happy-dom */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  showBootSourceChooser,
  closeBootSourceChooser,
  isBootSourceChooserOpen,
} from '@adapter/ui/boot-source-chooser';
import type { BootSource } from '@adapter/platform/pkc-data-source';
import type { Container } from '@core/model/container';

const T = '2026-04-16T00:00:00Z';

const samplePkcData: Container = {
  meta: {
    container_id: 'c-embedded',
    title: 'Embedded',
    created_at: T,
    updated_at: T,
    schema_version: 1,
  },
  entries: [
    { lid: 'e-a', title: 'A', body: 'a', archetype: 'text', created_at: T, updated_at: T },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

const sampleIdb: Container = {
  ...samplePkcData,
  meta: { ...samplePkcData.meta, container_id: 'c-idb', title: 'Local' },
  entries: [
    { lid: 'e-x', title: 'X', body: 'x', archetype: 'text', created_at: T, updated_at: T },
    { lid: 'e-y', title: 'Y', body: 'y', archetype: 'text', created_at: T, updated_at: T },
  ],
};

function makeChooserDescriptor(): BootSource {
  return {
    source: 'chooser',
    container: null,
    readonly: false,
    lightSource: false,
    viewOnlySource: false,
    pkcData: { container: samplePkcData, readonly: false, lightSource: false },
    idbContainer: sampleIdb,
  };
}

describe('boot-source-chooser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Defensive: clear any leftover module state between tests.
    closeBootSourceChooser();
  });

  it('mounts the overlay and reports isOpen=true while pending', () => {
    const chooser = makeChooserDescriptor();
    void showBootSourceChooser({ host: document.body, chooser });

    expect(isBootSourceChooserOpen()).toBe(true);
    const overlay = document.querySelector('[data-pkc-region="boot-source-chooser"]');
    expect(overlay).not.toBeNull();
  });

  it('shows container summaries for both sources', () => {
    const chooser = makeChooserDescriptor();
    void showBootSourceChooser({ host: document.body, chooser });

    const text = document.body.textContent ?? '';
    // pkc-data side
    expect(text).toContain('HTML 埋め込みコンテナ');
    expect(text).toContain('Embedded');
    expect(text).toContain('c-embedded');
    // IDB side
    expect(text).toContain('IndexedDB のコンテナ');
    expect(text).toContain('Local');
    expect(text).toContain('c-idb');
    // Entry counts render as plain strings
    expect(text).toContain('1'); // Embedded entry count
    expect(text).toContain('2'); // IDB entry count
  });

  it('resolves with "pkc-data" when the embedded button is clicked', async () => {
    const chooser = makeChooserDescriptor();
    const pending = showBootSourceChooser({ host: document.body, chooser });

    const btn = document.querySelector<HTMLButtonElement>(
      '[data-pkc-action="boot-source-pick-pkc-data"]',
    );
    expect(btn).not.toBeNull();
    btn!.click();

    const choice = await pending;
    expect(choice).toBe('pkc-data');
    expect(isBootSourceChooserOpen()).toBe(false);
  });

  it('resolves with "idb" when the IDB button is clicked', async () => {
    const chooser = makeChooserDescriptor();
    const pending = showBootSourceChooser({ host: document.body, chooser });

    const btn = document.querySelector<HTMLButtonElement>(
      '[data-pkc-action="boot-source-pick-idb"]',
    );
    expect(btn).not.toBeNull();
    btn!.click();

    const choice = await pending;
    expect(choice).toBe('idb');
    expect(isBootSourceChooserOpen()).toBe(false);
  });

  it('removes the overlay from the DOM once the user chooses', async () => {
    const chooser = makeChooserDescriptor();
    const pending = showBootSourceChooser({ host: document.body, chooser });

    const btn = document.querySelector<HTMLButtonElement>(
      '[data-pkc-action="boot-source-pick-idb"]',
    );
    btn!.click();
    await pending;

    expect(document.querySelector('[data-pkc-region="boot-source-chooser"]')).toBeNull();
  });

  it('gracefully handles a stale call by replacing the previous overlay', () => {
    const chooser = makeChooserDescriptor();
    // First open (pending)
    void showBootSourceChooser({ host: document.body, chooser });
    const first = document.querySelector('[data-pkc-region="boot-source-chooser"]');
    expect(first).not.toBeNull();

    // Second open — the previous overlay is unmounted, a fresh one mounts.
    void showBootSourceChooser({ host: document.body, chooser });
    const all = document.querySelectorAll('[data-pkc-region="boot-source-chooser"]');
    expect(all.length).toBe(1);
  });

  it('closeBootSourceChooser unmounts the overlay without resolving the promise', () => {
    const chooser = makeChooserDescriptor();
    void showBootSourceChooser({ host: document.body, chooser });
    expect(isBootSourceChooserOpen()).toBe(true);

    closeBootSourceChooser();

    expect(isBootSourceChooserOpen()).toBe(false);
    expect(document.querySelector('[data-pkc-region="boot-source-chooser"]')).toBeNull();
  });
});
