import type { Entry } from '../../core/model/record';
import type { DetailPresenter } from './detail-presenter';
import { classifyFileSize, fileSizeWarningMessage } from './guardrails';

/**
 * Attachment body schema (file-like archetype).
 *
 * New format (body-assets separation):
 *   body = { name, mime, size, asset_key }
 *   container.assets[asset_key] = base64 data
 *
 * Legacy format (backward compatibility):
 *   body = { name, mime, data }
 *   data is base64-encoded, stored directly in body
 *
 * parseAttachmentBody handles both formats transparently.
 * On next save, legacy format is migrated to new format (lazy migration).
 */
export interface AttachmentBody {
  name: string;
  mime: string;
  size?: number;
  asset_key?: string;
  data?: string; // legacy: base64-encoded. new format: absent
}

export function parseAttachmentBody(body: string): AttachmentBody {
  try {
    const parsed = JSON.parse(body) as Partial<AttachmentBody>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      mime: typeof parsed.mime === 'string' ? parsed.mime : 'application/octet-stream',
      size: typeof parsed.size === 'number' ? parsed.size : undefined,
      asset_key: typeof parsed.asset_key === 'string' ? parsed.asset_key : undefined,
      data: typeof parsed.data === 'string' ? parsed.data : undefined,
    };
  } catch {
    return { name: '', mime: 'application/octet-stream' };
  }
}

/**
 * Serialize attachment body as metadata-only JSON (new format).
 * Does NOT include data — data goes to container.assets.
 */
export function serializeAttachmentBody(att: AttachmentBody): string {
  const obj: Record<string, unknown> = { name: att.name, mime: att.mime };
  if (att.size !== undefined) obj.size = att.size;
  if (att.asset_key !== undefined) obj.asset_key = att.asset_key;
  // Include data only if present (legacy round-trip support)
  if (att.data !== undefined) obj.data = att.data;
  return JSON.stringify(obj);
}

/** Estimate decoded byte size from base64 string length. */
export function estimateSize(base64: string): number {
  if (!base64) return 0;
  const padding = (base64.match(/=+$/) ?? [''])[0]!.length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Resolve the display size for an attachment.
 * Prefers stored size field; falls back to estimating from data.
 */
export function resolveDisplaySize(att: AttachmentBody): number {
  if (att.size !== undefined) return att.size;
  if (att.data) return estimateSize(att.data);
  return 0;
}

/**
 * Generate an asset key for a new attachment.
 */
export function generateAssetKey(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `ast-${ts}-${rand}`;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Check whether the attachment body uses legacy format (data in body).
 */
export function isLegacyFormat(att: AttachmentBody): boolean {
  return att.data !== undefined && att.asset_key === undefined;
}

/**
 * Check if a MIME type is an image type that browsers can display.
 */
export function isPreviewableImage(mime: string): boolean {
  return /^image\/(png|jpeg|gif|webp|svg\+xml|bmp|ico)$/i.test(mime);
}

/**
 * Check if a MIME type is a video/audio type that browsers can play.
 */
export function isPreviewableMedia(mime: string): boolean {
  return /^(video\/(mp4|webm|ogg)|audio\/(mp3|mpeg|ogg|wav|webm))$/i.test(mime);
}

/**
 * Check if a MIME type is PDF.
 */
export function isPdf(mime: string): boolean {
  return mime === 'application/pdf';
}

/**
 * Check if a MIME type is HTML.
 */
export function isHtml(mime: string): boolean {
  return /^text\/html$/i.test(mime);
}

/**
 * Classify a MIME type for preview rendering.
 */
export function classifyPreviewType(mime: string): 'image' | 'pdf' | 'video' | 'audio' | 'html' | 'none' {
  if (isPreviewableImage(mime)) return 'image';
  if (isPdf(mime)) return 'pdf';
  if (/^video\//i.test(mime)) return 'video';
  if (/^audio\//i.test(mime)) return 'audio';
  if (isHtml(mime)) return 'html';
  return 'none';
}

export const attachmentPresenter: DetailPresenter = {
  renderBody(entry: Entry): HTMLElement {
    const att = parseAttachmentBody(entry.body);
    const root = document.createElement('div');
    root.className = 'pkc-attachment-view';

    const hasFile = !!att.name;
    const displaySize = resolveDisplaySize(att);
    // Data availability: asset_key with no data means Light export (stripped)
    const dataAvailable = !!(att.data || att.asset_key);
    const dataStripped = !!att.asset_key && !att.data;

    if (!hasFile) {
      const empty = document.createElement('div');
      empty.className = 'pkc-attachment-empty';
      empty.textContent = 'No file attached';
      root.appendChild(empty);
      return root;
    }

    // File info card
    const card = document.createElement('div');
    card.className = 'pkc-attachment-card';

    // File icon + name row
    const nameRow = document.createElement('div');
    nameRow.className = 'pkc-attachment-name-row';
    const icon = document.createElement('span');
    icon.className = 'pkc-attachment-icon';
    icon.textContent = isPreviewableImage(att.mime) ? '\ud83d\uddbc' : '\ud83d\udcc4';
    nameRow.appendChild(icon);
    const nameText = document.createElement('span');
    nameText.className = 'pkc-attachment-filename';
    nameText.textContent = att.name;
    nameRow.appendChild(nameText);
    card.appendChild(nameRow);

    // Meta row: type + size
    const metaRow = document.createElement('div');
    metaRow.className = 'pkc-attachment-meta';
    const mimeSpan = document.createElement('span');
    mimeSpan.className = 'pkc-attachment-mime-badge';
    mimeSpan.textContent = att.mime;
    metaRow.appendChild(mimeSpan);
    if (displaySize > 0) {
      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'pkc-attachment-size-badge';
      sizeSpan.textContent = formatSize(displaySize);
      metaRow.appendChild(sizeSpan);
    }
    if (dataStripped) {
      const stripped = document.createElement('span');
      stripped.className = 'pkc-attachment-stripped';
      stripped.textContent = 'Data not included (Light export)';
      metaRow.appendChild(stripped);
    }
    card.appendChild(metaRow);

    // Download button
    if (dataAvailable && !dataStripped) {
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'pkc-btn pkc-attachment-download';
      downloadBtn.setAttribute('data-pkc-action', 'download-attachment');
      downloadBtn.setAttribute('data-pkc-lid', entry.lid);
      downloadBtn.textContent = 'Download';
      card.appendChild(downloadBtn);
    }

    root.appendChild(card);

    // Preview area (deferred — action-binder populates with actual data)
    const previewType = classifyPreviewType(att.mime);
    if (previewType !== 'none' && dataAvailable && !dataStripped) {
      const previewContainer = document.createElement('div');
      previewContainer.className = 'pkc-attachment-preview';
      previewContainer.setAttribute('data-pkc-region', 'attachment-preview');
      previewContainer.setAttribute('data-pkc-lid', entry.lid);
      previewContainer.setAttribute('data-pkc-preview-type', previewType);
      const placeholder = document.createElement('div');
      placeholder.className = 'pkc-attachment-preview-placeholder';
      placeholder.textContent = 'Loading preview…';
      previewContainer.appendChild(placeholder);
      root.appendChild(previewContainer);
    }

    return root;
  },

  renderEditorBody(entry: Entry): HTMLElement {
    const att = parseAttachmentBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-attachment-editor';

    // Current file info
    const displaySize = resolveDisplaySize(att);
    if (att.name) {
      const current = document.createElement('div');
      current.className = 'pkc-attachment-current';
      current.textContent = `Current: ${att.name} (${att.mime}, ${formatSize(displaySize)})`;
      container.appendChild(current);
    }

    // File input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.setAttribute('data-pkc-field', 'attachment-file');
    fileInput.className = 'pkc-attachment-file-input';
    container.appendChild(fileInput);

    // Hidden fields for metadata
    const nameField = document.createElement('input');
    nameField.type = 'hidden';
    nameField.setAttribute('data-pkc-field', 'attachment-name');
    nameField.value = att.name;
    container.appendChild(nameField);

    const mimeField = document.createElement('input');
    mimeField.type = 'hidden';
    mimeField.setAttribute('data-pkc-field', 'attachment-mime');
    mimeField.value = att.mime;
    container.appendChild(mimeField);

    // Asset key: preserve existing or empty for new
    const assetKeyField = document.createElement('input');
    assetKeyField.type = 'hidden';
    assetKeyField.setAttribute('data-pkc-field', 'attachment-asset-key');
    assetKeyField.value = att.asset_key ?? '';
    container.appendChild(assetKeyField);

    // Asset data: holds base64 data for new/changed files.
    // For legacy entries, pre-populate with existing data for migration on save.
    // For new-format entries, leave empty (asset already in container.assets).
    const dataField = document.createElement('input');
    dataField.type = 'hidden';
    dataField.setAttribute('data-pkc-field', 'attachment-data');
    dataField.value = isLegacyFormat(att) ? (att.data ?? '') : '';
    container.appendChild(dataField);

    // Size field
    const sizeField = document.createElement('input');
    sizeField.type = 'hidden';
    sizeField.setAttribute('data-pkc-field', 'attachment-size');
    sizeField.value = String(displaySize);
    container.appendChild(sizeField);

    // Size warning element (shown when file exceeds thresholds)
    const sizeWarning = document.createElement('div');
    sizeWarning.setAttribute('data-pkc-region', 'attachment-size-warning');
    sizeWarning.style.display = 'none';
    container.appendChild(sizeWarning);

    // When file is selected, read and populate hidden fields
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      nameField.value = file.name;
      mimeField.value = file.type || 'application/octet-stream';
      // Generate new asset key for new file
      assetKeyField.value = generateAssetKey();

      // Show file size warning if needed
      const warningMsg = fileSizeWarningMessage(file.size);
      const level = classifyFileSize(file.size);
      if (warningMsg) {
        sizeWarning.textContent = warningMsg;
        sizeWarning.className = level === 'heavy'
          ? 'pkc-guardrail-warning pkc-guardrail-heavy'
          : 'pkc-guardrail-warning pkc-guardrail-soft';
        sizeWarning.style.display = '';
      } else {
        sizeWarning.style.display = 'none';
        sizeWarning.textContent = '';
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] ?? '';
        dataField.value = base64;
        sizeField.value = String(estimateSize(base64));
      };
      reader.readAsDataURL(file);
    });

    return container;
  },

  /**
   * Collect body as metadata-only JSON.
   * Data is NOT included in body — it's in the separate attachment-data field,
   * extracted by the action-binder and written to container.assets.
   */
  collectBody(root: HTMLElement): string {
    const nameEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-name"]');
    const mimeEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-mime"]');
    const assetKeyEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-asset-key"]');
    const sizeEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-size"]');

    const name = nameEl?.value ?? '';
    const mime = mimeEl?.value ?? 'application/octet-stream';
    const asset_key = assetKeyEl?.value || undefined;
    const size = sizeEl?.value ? Number(sizeEl.value) : undefined;

    const body: AttachmentBody = { name, mime };
    if (size !== undefined && size > 0) body.size = size;
    if (asset_key) body.asset_key = asset_key;
    return serializeAttachmentBody(body);
  },
};

/**
 * Extract asset data from the editor DOM for the action-binder.
 * Returns { key, data } if there's asset data to write, or null.
 */
export function collectAssetData(root: HTMLElement): { key: string; data: string } | null {
  const assetKeyEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-asset-key"]');
  const dataEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-data"]');
  const key = assetKeyEl?.value;
  const data = dataEl?.value;
  if (key && data) {
    return { key, data };
  }
  return null;
}
