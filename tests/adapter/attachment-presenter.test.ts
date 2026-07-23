/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseAttachmentBody,
  serializeAttachmentBody,
  estimateSize,
  resolveDisplaySize,
  generateAssetKey,
  isLegacyFormat,
  attachmentPresenter,
  collectAssetData,
  classifyPreviewType,
  isPreviewableImage,
  isPdf,
  isHtml,
  isSvg,
  previewModeLabel,
  SANDBOX_ATTRIBUTES,
  SANDBOX_DESCRIPTIONS,
  setAttachmentLightSourceHint,
} from '@adapter/ui/attachment-presenter';
import { drainAssetMisses, resetAssetMisses } from '../../src/features/asset/asset-miss-recorder';
import type { Entry } from '@core/model/record';
import { registerPresenter, getPresenter } from '@adapter/ui/detail-presenter';

// #956: 「asset_key あり・bytes なし」の既定解釈が「非常駐(読み込み待ち)」に
// 変わったため、Light export の表示を検証する test は hint を明示 ON にする。
beforeEach(() => {
  setAttachmentLightSourceHint(false);
  resetAssetMisses();
});
afterEach(() => {
  setAttachmentLightSourceHint(false);
  resetAssetMisses();
});

// "SGVsbG8=" is base64 for "Hello" (5 bytes)
const HELLO_B64 = 'SGVsbG8=';

/** Legacy format: data in body */
function makeLegacyEntry(body: string = `{"name":"test.txt","mime":"text/plain","data":"${HELLO_B64}"}`): Entry {
  return {
    lid: 'att1', title: 'My File', body,
    archetype: 'attachment', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
}

/** New format: asset_key + size, no data in body */
function makeNewFormatEntry(assetKey = 'ast-test-key'): Entry {
  return {
    lid: 'att2', title: 'My File',
    body: JSON.stringify({ name: 'test.txt', mime: 'text/plain', size: 5, asset_key: assetKey }),
    archetype: 'attachment', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('Attachment Presenter', () => {
  // ── parse / serialize ─────────────────

  describe('parseAttachmentBody', () => {
    it('parses legacy format (with data)', () => {
      const result = parseAttachmentBody(`{"name":"doc.pdf","mime":"application/pdf","data":"AQID"}`);
      expect(result).toEqual({ name: 'doc.pdf', mime: 'application/pdf', data: 'AQID' });
    });

    it('parses new format (with asset_key and size)', () => {
      const result = parseAttachmentBody(`{"name":"doc.pdf","mime":"application/pdf","size":1024,"asset_key":"ast-123"}`);
      expect(result).toEqual({ name: 'doc.pdf', mime: 'application/pdf', size: 1024, asset_key: 'ast-123' });
    });

    it('returns defaults for invalid JSON', () => {
      const result = parseAttachmentBody('not json');
      expect(result).toEqual({ name: '', mime: 'application/octet-stream' });
    });

    it('returns defaults for empty string', () => {
      const result = parseAttachmentBody('');
      expect(result).toEqual({ name: '', mime: 'application/octet-stream' });
    });

    it('handles partial fields', () => {
      const result = parseAttachmentBody('{"name":"file.bin"}');
      expect(result).toEqual({ name: 'file.bin', mime: 'application/octet-stream' });
    });

    it('handles mixed old+new fields gracefully', () => {
      const result = parseAttachmentBody('{"name":"f","mime":"text/plain","data":"AA==","asset_key":"ast-x","size":1}');
      expect(result.data).toBe('AA==');
      expect(result.asset_key).toBe('ast-x');
      expect(result.size).toBe(1);
    });
  });

  describe('serializeAttachmentBody', () => {
    it('serializes new format (metadata only)', () => {
      const body = serializeAttachmentBody({ name: 'a.txt', mime: 'text/plain', size: 5, asset_key: 'ast-k' });
      const parsed = JSON.parse(body);
      expect(parsed).toEqual({ name: 'a.txt', mime: 'text/plain', size: 5, asset_key: 'ast-k' });
      expect(parsed.data).toBeUndefined();
    });

    it('serializes legacy format when data is present', () => {
      const body = serializeAttachmentBody({ name: 'a.txt', mime: 'text/plain', data: HELLO_B64 });
      const parsed = JSON.parse(body);
      expect(parsed.data).toBe(HELLO_B64);
    });

    it('omits undefined fields', () => {
      const body = serializeAttachmentBody({ name: 'a.txt', mime: 'text/plain' });
      const parsed = JSON.parse(body);
      expect(parsed).toEqual({ name: 'a.txt', mime: 'text/plain' });
      expect('size' in parsed).toBe(false);
      expect('asset_key' in parsed).toBe(false);
      expect('data' in parsed).toBe(false);
    });

    it('parse → serialize → parse round-trip (new format)', () => {
      const original = { name: 'img.png', mime: 'image/png', size: 100, asset_key: 'ast-abc' };
      const serialized = serializeAttachmentBody(original);
      const parsed = parseAttachmentBody(serialized);
      expect(parsed).toEqual(original);
    });

    it('parse → serialize → parse round-trip (legacy format)', () => {
      const original = { name: 'img.png', mime: 'image/png', data: 'iVBORw0KGgo=' };
      const serialized = serializeAttachmentBody(original);
      const parsed = parseAttachmentBody(serialized);
      expect(parsed).toEqual(original);
    });
  });

  // ── estimateSize / resolveDisplaySize ─────────────────

  it('estimateSize returns 0 for empty string', () => {
    expect(estimateSize('')).toBe(0);
  });

  it('estimateSize calculates correctly for "SGVsbG8=" (Hello = 5 bytes)', () => {
    expect(estimateSize(HELLO_B64)).toBe(5);
  });

  it('estimateSize handles no-padding base64', () => {
    expect(estimateSize('AQID')).toBe(3);
  });

  describe('resolveDisplaySize', () => {
    it('prefers size field when present', () => {
      expect(resolveDisplaySize({ name: 'f', mime: 'm', size: 999 })).toBe(999);
    });

    it('falls back to estimating from data', () => {
      expect(resolveDisplaySize({ name: 'f', mime: 'm', data: HELLO_B64 })).toBe(5);
    });

    it('returns 0 when neither size nor data', () => {
      expect(resolveDisplaySize({ name: 'f', mime: 'm' })).toBe(0);
    });
  });

  // ── isLegacyFormat ─────────────────

  describe('isLegacyFormat', () => {
    it('returns true for data-in-body without asset_key', () => {
      expect(isLegacyFormat({ name: 'f', mime: 'm', data: 'AA==' })).toBe(true);
    });

    it('returns false for new format with asset_key', () => {
      expect(isLegacyFormat({ name: 'f', mime: 'm', size: 1, asset_key: 'ast-x' })).toBe(false);
    });

    it('returns false when data and asset_key both present', () => {
      expect(isLegacyFormat({ name: 'f', mime: 'm', data: 'AA==', asset_key: 'ast-x' })).toBe(false);
    });

    it('returns false when neither data nor asset_key', () => {
      expect(isLegacyFormat({ name: 'f', mime: 'm' })).toBe(false);
    });
  });

  // ── generateAssetKey ─────────────────

  it('generateAssetKey produces string with ast- prefix', () => {
    const key = generateAssetKey();
    expect(key).toMatch(/^ast-/);
    expect(key.length).toBeGreaterThan(6);
  });

  it('generateAssetKey produces unique keys', () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateAssetKey()));
    expect(keys.size).toBe(10);
  });

  // ── renderBody ─────────────────

  describe('renderBody', () => {
    it('shows file info (legacy format)', () => {
      const el = attachmentPresenter.renderBody(makeLegacyEntry());
      expect(el.className).toBe('pkc-attachment-view');
      expect(el.querySelector('.pkc-attachment-filename')!.textContent).toBe('test.txt');
      expect(el.querySelector('.pkc-attachment-mime-badge')!.textContent).toBe('text/plain');
      expect(el.querySelector('.pkc-attachment-size-badge')!.textContent).toBe('5 B');
    });

    it('shows file info (new format with size)', () => {
      const el = attachmentPresenter.renderBody(makeNewFormatEntry());
      expect(el.querySelector('.pkc-attachment-filename')!.textContent).toBe('test.txt');
      expect(el.querySelector('.pkc-attachment-size-badge')!.textContent).toBe('5 B');
    });

    it('shows empty state for empty name', () => {
      const el = attachmentPresenter.renderBody(makeLegacyEntry('{}'));
      expect(el.querySelector('.pkc-attachment-empty')!.textContent).toBe('No file attached');
      expect(el.querySelector('.pkc-attachment-filename')).toBeNull();
    });

    it('shows no size badge when no data and no size', () => {
      const el = attachmentPresenter.renderBody(makeLegacyEntry('{"name":"x","mime":"text/plain"}'));
      expect(el.querySelector('.pkc-attachment-size-badge')).toBeNull();
    });

    it('shows stripped notice when asset_key exists but no data (light export)', () => {
      setAttachmentLightSourceHint(true);
      const entry = makeLegacyEntry('{"name":"photo.jpg","mime":"image/jpeg","asset_key":"ast-123"}');
      const el = attachmentPresenter.renderBody(entry);
      expect(el.querySelector('.pkc-attachment-stripped')!.textContent).toBe('Data not included (Light export)');
    });

    // ── #956: 非常駐(lazy loading 未回復)は Light export と区別する ──

    it('#956: non-resident (not light) shows a loading badge instead of the Light-export notice', () => {
      const entry = makeLegacyEntry('{"name":"app.html","mime":"text/html","asset_key":"ast-h1"}');
      const el = attachmentPresenter.renderBody(entry);
      expect(el.querySelector('.pkc-attachment-stripped')).toBeNull();
      const pending = el.querySelector('[data-pkc-region="attachment-loading"]');
      expect(pending).not.toBeNull();
      expect(pending!.textContent).toContain('読み込み中');
    });

    it('#956: non-resident (not light) records an asset miss for ALL mime types (HTML too)', () => {
      const entry = makeLegacyEntry('{"name":"app.html","mime":"text/html","asset_key":"ast-h2"}');
      attachmentPresenter.renderBody(entry);
      expect(drainAssetMisses()).toContain('ast-h2');
    });

    it('#956: non-resident (not light) keeps the action row (Download + 🌐 Open for HTML)', () => {
      const entry = makeLegacyEntry('{"name":"app.html","mime":"text/html","asset_key":"ast-h3"}');
      const el = attachmentPresenter.renderBody(entry);
      expect(el.querySelector('[data-pkc-region="attachment-actions"]')).not.toBeNull();
      expect(el.querySelector('[data-pkc-action="download-attachment"]')).not.toBeNull();
      expect(el.querySelector('[data-pkc-action="open-html-attachment"]')).not.toBeNull();
    });

    it('P1s2-c(#967): 巨大 media asset は base64 miss を記録せず registry 経由で表示する(deferred 撤去)', () => {
      const entry = makeLegacyEntry(
        '{"name":"rec.webm","mime":"video/webm","asset_key":"ast-big","size":300000000}',
      );
      const el = attachmentPresenter.renderBody(entry);
      // base64 の working-set には引き込まない(スラッシング条件の根絶)
      expect(drainAssetMisses()).not.toContain('ast-big');
      // 「操作時に読み込み」の deferred 案内は撤去 — loading 表示に統一
      // (registry の URL 供給で自動的に preview へ収束する)
      expect(el.querySelector('[data-pkc-region="attachment-deferred"]')).toBeNull();
      expect(el.querySelector('[data-pkc-region="attachment-loading"]')).not.toBeNull();
      // action row は出る(click 経路の on-demand 読みが担う)
      expect(el.querySelector('[data-pkc-action="download-attachment"]')).not.toBeNull();
    });

    it('P1s2-c(#967): media 系はサイズに依らず registry の wanted に載る(サイズ閾値なし)', () => {
      const entry = makeLegacyEntry(
        '{"name":"rec.webm","mime":"video/webm","asset_key":"ast-big-2","size":300000000}',
      );
      attachmentPresenter.renderBody(entry);
      // registry へ wanted が記録され、drain 側で URL 供給される契約
      // (getAssetUrl の miss 記録は registry テストで検証済み — ここでは
      //  base64 miss に落ちていないことを固定する)
      expect(drainAssetMisses()).not.toContain('ast-big-2');
    });

    it('HTML / TEXT 変換系は従来どおり base64 自動回復対象(サイズ閾値なし)', () => {
      const entry = makeLegacyEntry(
        '{"name":"app.html","mime":"text/html","asset_key":"ast-small","size":200000}',
      );
      const el = attachmentPresenter.renderBody(entry);
      expect(drainAssetMisses()).toContain('ast-small');
      expect(el.querySelector('[data-pkc-region="attachment-loading"]')).not.toBeNull();
      expect(el.querySelector('[data-pkc-region="attachment-deferred"]')).toBeNull();
    });

    it('#956: true light export does NOT record a miss and hides the action row', () => {
      setAttachmentLightSourceHint(true);
      const entry = makeLegacyEntry('{"name":"app.html","mime":"text/html","asset_key":"ast-h4"}');
      const el = attachmentPresenter.renderBody(entry);
      expect(drainAssetMisses()).not.toContain('ast-h4');
      expect(el.querySelector('[data-pkc-region="attachment-actions"]')).toBeNull();
      expect(el.querySelector('[data-pkc-region="attachment-loading"]')).toBeNull();
    });

    it('#956: resident asset renders no loading badge and records no miss', () => {
      const entry = makeLegacyEntry('{"name":"app.html","mime":"text/html","asset_key":"ast-h5"}');
      const el = attachmentPresenter.renderBody(entry, { 'ast-h5': 'PGh0bWw+' });
      expect(el.querySelector('[data-pkc-region="attachment-loading"]')).toBeNull();
      expect(drainAssetMisses()).not.toContain('ast-h5');
    });

    it('shows size when asset_key exists with size field', () => {
      const entry = makeLegacyEntry('{"name":"photo.jpg","mime":"image/jpeg","asset_key":"ast-123","size":5000}');
      const el = attachmentPresenter.renderBody(entry);
      expect(el.querySelector('.pkc-attachment-size-badge')!.textContent).toBe('4.9 KB');
    });

    it('shows download button when data is available (legacy)', () => {
      const el = attachmentPresenter.renderBody(makeLegacyEntry());
      const btn = el.querySelector('[data-pkc-action="download-attachment"]');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('Download');
    });

    it('exposes a "🌐 Open in New Window" button at action-row level for HTML attachments', () => {
      const entry = makeLegacyEntry(
        '{"name":"page.html","mime":"text/html","data":"PHA+b2s8L3A+","size":12}',
      );
      const el = attachmentPresenter.renderBody(entry);
      const actionRow = el.querySelector('[data-pkc-region="attachment-actions"]');
      expect(actionRow).not.toBeNull();
      const openBtn = actionRow!.querySelector('[data-pkc-action="open-html-attachment"]');
      expect(openBtn).not.toBeNull();
      expect(openBtn!.getAttribute('data-pkc-lid')).toBe('att1');
      expect(openBtn!.textContent).toContain('Open in New Window');
    });

    it('does NOT show the open-in-new-window button for non-HTML attachments (PDF)', () => {
      const entry = makeLegacyEntry(
        '{"name":"doc.pdf","mime":"application/pdf","data":"JVBERi0xLjQK","size":12}',
      );
      const el = attachmentPresenter.renderBody(entry);
      const openBtn = el.querySelector('[data-pkc-action="open-html-attachment"]');
      expect(openBtn).toBeNull();
      // The download button is still present.
      expect(el.querySelector('[data-pkc-action="download-attachment"]')).not.toBeNull();
    });

    it('hides the open-in-new-window button when the HTML data has been stripped (light export)', () => {
      setAttachmentLightSourceHint(true);
      const entry = makeLegacyEntry(
        '{"name":"page.html","mime":"text/html","asset_key":"ast-html","size":100}',
      );
      // No assets provided → data not available, action row is suppressed.
      const el = attachmentPresenter.renderBody(entry);
      expect(el.querySelector('[data-pkc-region="attachment-actions"]')).toBeNull();
      expect(el.querySelector('[data-pkc-action="open-html-attachment"]')).toBeNull();
    });

    it('hides download button when asset_key has no data (even with size)', () => {
      // asset_key with size but no data = light export, data not available for download
      setAttachmentLightSourceHint(true);
      const entry = makeLegacyEntry('{"name":"photo.jpg","mime":"image/jpeg","asset_key":"ast-123","size":5000}');
      const el = attachmentPresenter.renderBody(entry);
      const btn = el.querySelector('[data-pkc-action="download-attachment"]');
      expect(btn).toBeNull();
    });

    it('hides download button when data is stripped (light export)', () => {
      setAttachmentLightSourceHint(true);
      const entry = makeLegacyEntry('{"name":"photo.jpg","mime":"image/jpeg","asset_key":"ast-123"}');
      const el = attachmentPresenter.renderBody(entry);
      const btn = el.querySelector('[data-pkc-action="download-attachment"]');
      expect(btn).toBeNull();
    });

    // ── new-format with assets context (critical regression fix) ──

    it('shows download button when asset_key has data in container.assets', () => {
      const entry = makeLegacyEntry('{"name":"photo.jpg","mime":"image/jpeg","asset_key":"ast-123","size":5000}');
      const assets = { 'ast-123': 'base64data' };
      const el = attachmentPresenter.renderBody(entry, assets);
      const btn = el.querySelector('[data-pkc-action="download-attachment"]');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('Download');
    });

    it('does not show stripped notice when data exists in container.assets', () => {
      const entry = makeLegacyEntry('{"name":"photo.jpg","mime":"image/jpeg","asset_key":"ast-123","size":5000}');
      const assets = { 'ast-123': 'base64data' };
      const el = attachmentPresenter.renderBody(entry, assets);
      expect(el.querySelector('.pkc-attachment-stripped')).toBeNull();
    });

    it('shows preview placeholder when data exists in container.assets', () => {
      const entry = makeLegacyEntry('{"name":"photo.png","mime":"image/png","asset_key":"ast-123","size":100}');
      const assets = { 'ast-123': 'base64data' };
      const el = attachmentPresenter.renderBody(entry, assets);
      const preview = el.querySelector('[data-pkc-region="attachment-preview"]');
      expect(preview).not.toBeNull();
    });

    it('still shows stripped notice when asset_key has no data in container.assets', () => {
      setAttachmentLightSourceHint(true);
      const entry = makeLegacyEntry('{"name":"photo.jpg","mime":"image/jpeg","asset_key":"ast-123","size":5000}');
      const assets = { 'ast-other': 'irrelevant' };
      const el = attachmentPresenter.renderBody(entry, assets);
      expect(el.querySelector('.pkc-attachment-stripped')!.textContent).toBe('Data not included (Light export)');
    });

    it('shows image preview placeholder for image types', () => {
      const entry = makeLegacyEntry('{"name":"photo.png","mime":"image/png","data":"iVBOR","size":100}');
      const el = attachmentPresenter.renderBody(entry);
      const preview = el.querySelector('[data-pkc-region="attachment-preview"]');
      expect(preview).not.toBeNull();
    });

    it('does not show image preview for non-image types', () => {
      const el = attachmentPresenter.renderBody(makeLegacyEntry());
      const preview = el.querySelector('[data-pkc-region="attachment-preview"]');
      expect(preview).toBeNull();
    });

    it('does not show image preview when data is stripped', () => {
      const entry = makeLegacyEntry('{"name":"photo.png","mime":"image/png","asset_key":"ast-123"}');
      const el = attachmentPresenter.renderBody(entry);
      const preview = el.querySelector('[data-pkc-region="attachment-preview"]');
      expect(preview).toBeNull();
    });
  });

  // ── preview mode badge ─────────────────

  describe('preview mode badge', () => {
    it('shows Inline badge for image types', () => {
      const entry = makeLegacyEntry('{"name":"photo.png","mime":"image/png","data":"iVBOR","size":100}');
      const el = attachmentPresenter.renderBody(entry);
      const badge = el.querySelector('[data-pkc-region="preview-mode"]');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe('Inline');
    });

    it('shows Sandbox badge for HTML types', () => {
      const entry = makeLegacyEntry('{"name":"page.html","mime":"text/html","data":"PCFET0NUWVBF","size":100}');
      const el = attachmentPresenter.renderBody(entry);
      const badge = el.querySelector('[data-pkc-region="preview-mode"]');
      expect(badge!.textContent).toBe('Sandbox');
    });

    it('shows PDF Viewer badge for PDF', () => {
      const entry = makeLegacyEntry('{"name":"doc.pdf","mime":"application/pdf","data":"JVBER","size":100}');
      const el = attachmentPresenter.renderBody(entry);
      const badge = el.querySelector('[data-pkc-region="preview-mode"]');
      expect(badge!.textContent).toBe('PDF Viewer');
    });

    it('shows Video badge for video types', () => {
      const entry = makeLegacyEntry('{"name":"clip.mp4","mime":"video/mp4","data":"AAAA","size":100}');
      const el = attachmentPresenter.renderBody(entry);
      const badge = el.querySelector('[data-pkc-region="preview-mode"]');
      expect(badge!.textContent).toBe('Video');
    });

    it('shows Audio badge for audio types', () => {
      const entry = makeLegacyEntry('{"name":"song.mp3","mime":"audio/mpeg","data":"AAAA","size":100}');
      const el = attachmentPresenter.renderBody(entry);
      const badge = el.querySelector('[data-pkc-region="preview-mode"]');
      expect(badge!.textContent).toBe('Audio');
    });

    it('shows No Preview badge for unsupported types', () => {
      const entry = makeLegacyEntry('{"name":"data.bin","mime":"application/octet-stream","data":"AAAA","size":100}');
      const el = attachmentPresenter.renderBody(entry);
      const badge = el.querySelector('[data-pkc-region="preview-mode"]');
      expect(badge!.textContent).toBe('No Preview');
    });

    it('shows Sandbox badge for SVG', () => {
      const entry = makeLegacyEntry('{"name":"icon.svg","mime":"image/svg+xml","data":"PHN2Zz4=","size":100}');
      const el = attachmentPresenter.renderBody(entry);
      const badge = el.querySelector('[data-pkc-region="preview-mode"]');
      expect(badge!.textContent).toBe('Sandbox');
    });
  });

  // ── no-preview fallback message ─────────────────

  describe('no-preview fallback message', () => {
    it('shows fallback message for unsupported MIME with data available', () => {
      const entry = makeLegacyEntry('{"name":"data.bin","mime":"application/octet-stream","data":"AAAA","size":100}');
      const el = attachmentPresenter.renderBody(entry);
      const msg = el.querySelector('[data-pkc-region="no-preview"]');
      expect(msg).not.toBeNull();
      expect(msg!.textContent).toContain('Preview is not available');
      expect(msg!.textContent).toContain('Download');
    });

    it('does not show fallback for previewable types', () => {
      const entry = makeLegacyEntry('{"name":"photo.png","mime":"image/png","data":"iVBOR","size":100}');
      const el = attachmentPresenter.renderBody(entry);
      expect(el.querySelector('[data-pkc-region="no-preview"]')).toBeNull();
    });

    it('does not show fallback when data is stripped (Light export)', () => {
      const entry = makeLegacyEntry('{"name":"data.bin","mime":"application/octet-stream","asset_key":"ast-123"}');
      const el = attachmentPresenter.renderBody(entry);
      expect(el.querySelector('[data-pkc-region="no-preview"]')).toBeNull();
    });

    it('does not show fallback for empty attachment', () => {
      const el = attachmentPresenter.renderBody(makeLegacyEntry('{}'));
      expect(el.querySelector('[data-pkc-region="no-preview"]')).toBeNull();
    });
  });

  // ── renderEditorBody ─────────────────

  describe('renderEditorBody', () => {
    it('creates file input and hidden fields (legacy format)', () => {
      const el = attachmentPresenter.renderEditorBody(makeLegacyEntry());
      expect(el.querySelector('[data-pkc-field="attachment-file"]')).not.toBeNull();
      expect(el.querySelector<HTMLInputElement>('[data-pkc-field="attachment-name"]')!.value).toBe('test.txt');
      expect(el.querySelector<HTMLInputElement>('[data-pkc-field="attachment-mime"]')!.value).toBe('text/plain');
      // Legacy: data field is pre-populated for migration
      expect(el.querySelector<HTMLInputElement>('[data-pkc-field="attachment-data"]')!.value).toBe(HELLO_B64);
      // Legacy: no asset_key
      expect(el.querySelector<HTMLInputElement>('[data-pkc-field="attachment-asset-key"]')!.value).toBe('');
    });

    it('creates hidden fields (new format)', () => {
      const el = attachmentPresenter.renderEditorBody(makeNewFormatEntry('ast-test-key'));
      expect(el.querySelector<HTMLInputElement>('[data-pkc-field="attachment-asset-key"]')!.value).toBe('ast-test-key');
      // New format: data field is empty (asset is in container.assets)
      expect(el.querySelector<HTMLInputElement>('[data-pkc-field="attachment-data"]')!.value).toBe('');
    });

    it('shows current file info when file exists', () => {
      const el = attachmentPresenter.renderEditorBody(makeLegacyEntry());
      const current = el.querySelector('.pkc-attachment-current');
      expect(current).not.toBeNull();
      expect(current!.textContent).toContain('test.txt');
    });

    it('hides current info for empty attachment', () => {
      const el = attachmentPresenter.renderEditorBody(makeLegacyEntry('{}'));
      expect(el.querySelector('.pkc-attachment-current')).toBeNull();
    });
  });

  // ── collectBody ─────────────────

  describe('collectBody', () => {
    it('collects metadata-only body (no data field)', () => {
      const editor = attachmentPresenter.renderEditorBody(makeNewFormatEntry('ast-key1'));
      const root = document.createElement('div');
      root.appendChild(editor);
      const body = attachmentPresenter.collectBody(root);
      const parsed = JSON.parse(body);
      expect(parsed.name).toBe('test.txt');
      expect(parsed.mime).toBe('text/plain');
      expect(parsed.asset_key).toBe('ast-key1');
      expect(parsed.size).toBe(5);
      expect(parsed.data).toBeUndefined();
    });

    it('returns defaults when fields not found', () => {
      const root = document.createElement('div');
      const body = attachmentPresenter.collectBody(root);
      const parsed = JSON.parse(body);
      expect(parsed.name).toBe('');
      expect(parsed.mime).toBe('application/octet-stream');
    });

    it('legacy entry collectBody produces migration-ready body', () => {
      const editor = attachmentPresenter.renderEditorBody(makeLegacyEntry());
      // Simulate: action-binder would generate asset_key before collectBody
      // For legacy, the asset_key field is empty, so collectBody won't include it
      const root = document.createElement('div');
      root.appendChild(editor);
      const body = attachmentPresenter.collectBody(root);
      const parsed = JSON.parse(body);
      // No asset_key from legacy (action-binder handles migration)
      expect(parsed.data).toBeUndefined();
    });
  });

  // ── collectAssetData ─────────────────

  describe('collectAssetData', () => {
    it('returns key+data when both fields have values', () => {
      const root = document.createElement('div');
      const keyField = document.createElement('input');
      keyField.type = 'hidden';
      keyField.setAttribute('data-pkc-field', 'attachment-asset-key');
      keyField.value = 'ast-abc';
      root.appendChild(keyField);
      const dataField = document.createElement('input');
      dataField.type = 'hidden';
      dataField.setAttribute('data-pkc-field', 'attachment-data');
      dataField.value = HELLO_B64;
      root.appendChild(dataField);

      const result = collectAssetData(root);
      expect(result).toEqual({ key: 'ast-abc', data: HELLO_B64 });
    });

    it('returns null when data is empty', () => {
      const root = document.createElement('div');
      const keyField = document.createElement('input');
      keyField.type = 'hidden';
      keyField.setAttribute('data-pkc-field', 'attachment-asset-key');
      keyField.value = 'ast-abc';
      root.appendChild(keyField);
      const dataField = document.createElement('input');
      dataField.type = 'hidden';
      dataField.setAttribute('data-pkc-field', 'attachment-data');
      dataField.value = '';
      root.appendChild(dataField);

      expect(collectAssetData(root)).toBeNull();
    });

    it('returns null when key is empty', () => {
      const root = document.createElement('div');
      const keyField = document.createElement('input');
      keyField.type = 'hidden';
      keyField.setAttribute('data-pkc-field', 'attachment-asset-key');
      keyField.value = '';
      root.appendChild(keyField);
      const dataField = document.createElement('input');
      dataField.type = 'hidden';
      dataField.setAttribute('data-pkc-field', 'attachment-data');
      dataField.value = HELLO_B64;
      root.appendChild(dataField);

      expect(collectAssetData(root)).toBeNull();
    });

    it('returns null when fields not found', () => {
      const root = document.createElement('div');
      expect(collectAssetData(root)).toBeNull();
    });
  });

  // ── backward compatibility ─────────────────

  describe('backward compatibility', () => {
    it('legacy body renders correctly in view', () => {
      const entry = makeLegacyEntry();
      const el = attachmentPresenter.renderBody(entry);
      expect(el.querySelector('.pkc-attachment-filename')!.textContent).toBe('test.txt');
      expect(el.querySelector('.pkc-attachment-size-badge')!.textContent).toBe('5 B');
    });

    it('new format body renders correctly in view', () => {
      const entry = makeNewFormatEntry();
      const el = attachmentPresenter.renderBody(entry);
      expect(el.querySelector('.pkc-attachment-filename')!.textContent).toBe('test.txt');
      expect(el.querySelector('.pkc-attachment-size-badge')!.textContent).toBe('5 B');
    });

    it('legacy entry editor pre-populates data for migration', () => {
      const el = attachmentPresenter.renderEditorBody(makeLegacyEntry());
      // Data field should be pre-populated with legacy data
      const dataField = el.querySelector<HTMLInputElement>('[data-pkc-field="attachment-data"]');
      expect(dataField!.value).toBe(HELLO_B64);
    });

    it('new format entry editor leaves data field empty', () => {
      const el = attachmentPresenter.renderEditorBody(makeNewFormatEntry());
      const dataField = el.querySelector<HTMLInputElement>('[data-pkc-field="attachment-data"]');
      expect(dataField!.value).toBe('');
    });
  });

  // ── presenter registry ─────────────────

  it('getPresenter returns attachmentPresenter when registered', () => {
    registerPresenter('attachment', attachmentPresenter);
    expect(getPresenter('attachment')).toBe(attachmentPresenter);
  });
});

describe('MIME type classification', () => {
  describe('isPreviewableImage', () => {
    it('recognizes safe image types', () => {
      expect(isPreviewableImage('image/png')).toBe(true);
      expect(isPreviewableImage('image/jpeg')).toBe(true);
      expect(isPreviewableImage('image/gif')).toBe(true);
      expect(isPreviewableImage('image/webp')).toBe(true);
    });
    it('excludes SVG (treated as sandboxed content)', () => {
      expect(isPreviewableImage('image/svg+xml')).toBe(false);
    });
    it('rejects non-image types', () => {
      expect(isPreviewableImage('application/pdf')).toBe(false);
      expect(isPreviewableImage('video/mp4')).toBe(false);
    });
  });

  describe('isSvg', () => {
    it('recognizes SVG MIME type', () => {
      expect(isSvg('image/svg+xml')).toBe(true);
    });
    it('is case insensitive', () => {
      expect(isSvg('Image/SVG+XML')).toBe(true);
    });
    it('rejects non-SVG types', () => {
      expect(isSvg('image/png')).toBe(false);
      expect(isSvg('text/html')).toBe(false);
      expect(isSvg('application/svg')).toBe(false);
    });
  });

  describe('isPdf', () => {
    it('recognizes PDF', () => {
      expect(isPdf('application/pdf')).toBe(true);
    });
    it('rejects non-PDF', () => {
      expect(isPdf('text/plain')).toBe(false);
    });
  });

  describe('isHtml', () => {
    it('recognizes HTML', () => {
      expect(isHtml('text/html')).toBe(true);
    });
    it('rejects non-HTML', () => {
      expect(isHtml('text/plain')).toBe(false);
    });
  });

  describe('classifyPreviewType', () => {
    it('classifies safe images', () => {
      expect(classifyPreviewType('image/png')).toBe('image');
      expect(classifyPreviewType('image/jpeg')).toBe('image');
    });
    it('classifies SVG as html (sandboxed)', () => {
      expect(classifyPreviewType('image/svg+xml')).toBe('html');
    });
    it('classifies PDF', () => {
      expect(classifyPreviewType('application/pdf')).toBe('pdf');
    });
    it('classifies video', () => {
      expect(classifyPreviewType('video/mp4')).toBe('video');
    });
    it('classifies audio', () => {
      expect(classifyPreviewType('audio/mpeg')).toBe('audio');
    });
    it('classifies HTML', () => {
      expect(classifyPreviewType('text/html')).toBe('html');
    });
    it('returns none for unknown types', () => {
      expect(classifyPreviewType('application/octet-stream')).toBe('none');
      expect(classifyPreviewType('text/plain')).toBe('none');
    });
  });

  describe('previewModeLabel', () => {
    it('returns correct labels for all types', () => {
      expect(previewModeLabel('image')).toBe('Inline');
      expect(previewModeLabel('pdf')).toBe('PDF Viewer');
      expect(previewModeLabel('video')).toBe('Video');
      expect(previewModeLabel('audio')).toBe('Audio');
      expect(previewModeLabel('html')).toBe('Sandbox');
      expect(previewModeLabel('none')).toBe('No Preview');
    });
  });

  describe('sandbox_allow field', () => {
    it('parseAttachmentBody reads sandbox_allow array', () => {
      const body = JSON.stringify({
        name: 'test.html',
        mime: 'text/html',
        asset_key: 'ast-1',
        sandbox_allow: ['allow-scripts', 'allow-forms'],
      });
      const parsed = parseAttachmentBody(body);
      expect(parsed.sandbox_allow).toEqual(['allow-scripts', 'allow-forms']);
    });

    it('parseAttachmentBody returns undefined when sandbox_allow absent', () => {
      const body = JSON.stringify({ name: 'test.html', mime: 'text/html' });
      const parsed = parseAttachmentBody(body);
      expect(parsed.sandbox_allow).toBeUndefined();
    });

    it('parseAttachmentBody filters non-string values in sandbox_allow', () => {
      const body = JSON.stringify({
        name: 'test.html',
        mime: 'text/html',
        sandbox_allow: ['allow-scripts', 42, null, 'allow-forms'],
      });
      const parsed = parseAttachmentBody(body);
      expect(parsed.sandbox_allow).toEqual(['allow-scripts', 'allow-forms']);
    });

    it('serializeAttachmentBody includes sandbox_allow when non-empty', () => {
      const body = serializeAttachmentBody({
        name: 'test.html',
        mime: 'text/html',
        sandbox_allow: ['allow-scripts'],
      });
      const parsed = JSON.parse(body);
      expect(parsed.sandbox_allow).toEqual(['allow-scripts']);
    });

    it('serializeAttachmentBody omits sandbox_allow when empty', () => {
      const body = serializeAttachmentBody({
        name: 'test.html',
        mime: 'text/html',
        sandbox_allow: [],
      });
      const parsed = JSON.parse(body);
      expect(parsed.sandbox_allow).toBeUndefined();
    });

    it('serializeAttachmentBody omits sandbox_allow when undefined', () => {
      const body = serializeAttachmentBody({
        name: 'test.html',
        mime: 'text/html',
      });
      const parsed = JSON.parse(body);
      expect(parsed.sandbox_allow).toBeUndefined();
    });

    it('SANDBOX_ATTRIBUTES contains the expected values', () => {
      expect(SANDBOX_ATTRIBUTES).toContain('allow-scripts');
      expect(SANDBOX_ATTRIBUTES).toContain('allow-forms');
      expect(SANDBOX_ATTRIBUTES).toContain('allow-popups');
      expect(SANDBOX_ATTRIBUTES).toContain('allow-modals');
      expect(SANDBOX_ATTRIBUTES).toContain('allow-same-origin');
      expect(SANDBOX_ATTRIBUTES).toContain('allow-top-navigation');
      expect(SANDBOX_ATTRIBUTES).toContain('allow-top-navigation-by-user-activation');
      expect(SANDBOX_ATTRIBUTES).toContain('allow-top-navigation-to-custom-protocols');
      expect(SANDBOX_ATTRIBUTES).toContain('allow-pointer-lock');
      expect(SANDBOX_ATTRIBUTES).toContain('allow-presentation');
      expect(SANDBOX_ATTRIBUTES.length).toBe(10);
    });

    it('SANDBOX_DESCRIPTIONS has a description for every attribute', () => {
      for (const attr of SANDBOX_ATTRIBUTES) {
        expect(SANDBOX_DESCRIPTIONS[attr]).toBeTruthy();
      }
    });

    it('sandbox_allow round-trips through parse/serialize', () => {
      const original = {
        name: 'app.html',
        mime: 'text/html',
        asset_key: 'ast-1',
        sandbox_allow: ['allow-scripts', 'allow-popups'],
      };
      const serialized = serializeAttachmentBody(original);
      const parsed = parseAttachmentBody(serialized);
      expect(parsed.sandbox_allow).toEqual(['allow-scripts', 'allow-popups']);
      expect(parsed.name).toBe('app.html');
      expect(parsed.asset_key).toBe('ast-1');
    });
  });
});
