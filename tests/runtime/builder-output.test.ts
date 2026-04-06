import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import type { ReleaseMeta } from '@runtime/release-meta';

const DIST = resolve(__dirname, '../../dist');
const PKC2_HTML = resolve(DIST, 'pkc2.html');

/**
 * These tests verify the built artifact (dist/pkc2.html).
 * They run AFTER `npm run build` has been executed.
 */

const htmlExists = existsSync(PKC2_HTML);

describe.skipIf(!htmlExists)('Builder output verification', () => {
  let html: string;
  let meta: ReleaseMeta;

  it('dist/pkc2.html exists', () => {
    expect(htmlExists).toBe(true);
    html = readFileSync(PKC2_HTML, 'utf8');
  });

  it('contains all required fixed IDs', () => {
    const ids = ['pkc-root', 'pkc-data', 'pkc-meta', 'pkc-core', 'pkc-styles', 'pkc-theme'];
    for (const id of ids) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('contains data-pkc-app attribute', () => {
    expect(html).toContain('data-pkc-app="pkc2"');
  });

  it('contains data-pkc-version attribute', () => {
    expect(html).toMatch(/data-pkc-version="[\d.]+"/);
  });

  it('contains data-pkc-kind attribute', () => {
    expect(html).toMatch(/data-pkc-kind="(dev|stage|product)"/);
  });

  it('contains data-pkc-timestamp attribute (14 digits)', () => {
    expect(html).toMatch(/data-pkc-timestamp="\d{14}"/);
  });

  it('pkc-meta contains valid JSON with all required fields', () => {
    const metaMatch = html.match(/<script id="pkc-meta" type="application\/json">([\s\S]*?)<\/script>/);
    expect(metaMatch).not.toBeNull();

    meta = JSON.parse(metaMatch![1]!);
    expect(meta.app).toBe('pkc2');
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(meta.schema).toBeGreaterThan(0);
    expect(['dev', 'stage', 'product']).toContain(meta.kind);
    expect(meta.timestamp).toMatch(/^\d{14}$/);
    expect(meta.build_at).toBeTruthy();
    expect(meta.source_commit).toBeTruthy();
    expect(meta.code_integrity).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(Array.isArray(meta.capabilities)).toBe(true);
  });

  it('code_integrity matches actual pkc-core content', () => {
    // Extract pkc-core content
    const coreMatch = html.match(/<script id="pkc-core">([\s\S]*?)<\/script>/);
    expect(coreMatch).not.toBeNull();

    const coreContent = coreMatch![1]!;
    const hash = createHash('sha256').update(coreContent, 'utf8').digest('hex');
    const expected = `sha256:${hash}`;

    expect(meta.code_integrity).toBe(expected);
  });

  it('pkc-data starts as empty JSON object', () => {
    const dataMatch = html.match(/<script id="pkc-data" type="application\/json">([\s\S]*?)<\/script>/);
    expect(dataMatch).not.toBeNull();
    expect(dataMatch![1]!.trim()).toBe('{}');
  });
});
