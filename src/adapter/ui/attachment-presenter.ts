import type { Entry } from '../../core/model/record';
import type { DetailPresenter } from './detail-presenter';

/**
 * Attachment body schema (minimal file-like archetype).
 * Data is stored as base64 in entry.body — NOT as Blob or ArrayBuffer.
 *
 * Constraints:
 * - base64 encoding inflates size ~33%; keep files small (< 1 MB recommended)
 * - Large attachments will increase HTML export size and memory usage
 * - No streaming, chunking, or external storage
 * - Single file per entry
 */
export interface AttachmentBody {
  name: string;
  mime: string;
  data: string; // base64-encoded
}

export function parseAttachmentBody(body: string): AttachmentBody {
  try {
    const parsed = JSON.parse(body) as Partial<AttachmentBody>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      mime: typeof parsed.mime === 'string' ? parsed.mime : 'application/octet-stream',
      data: typeof parsed.data === 'string' ? parsed.data : '',
    };
  } catch {
    return { name: '', mime: 'application/octet-stream', data: '' };
  }
}

export function serializeAttachmentBody(attachment: AttachmentBody): string {
  return JSON.stringify({ name: attachment.name, mime: attachment.mime, data: attachment.data });
}

/** Estimate decoded byte size from base64 string length. */
export function estimateSize(base64: string): number {
  if (!base64) return 0;
  // base64: 4 chars = 3 bytes, minus padding
  const padding = (base64.match(/=+$/) ?? [''])[0]!.length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const attachmentPresenter: DetailPresenter = {
  renderBody(entry: Entry): HTMLElement {
    const att = parseAttachmentBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-attachment-view';

    const nameEl = document.createElement('div');
    nameEl.className = 'pkc-attachment-field';
    const nameLabel = document.createElement('strong');
    nameLabel.textContent = 'File: ';
    nameEl.appendChild(nameLabel);
    const nameValue = document.createElement('span');
    nameValue.className = 'pkc-attachment-name';
    nameValue.textContent = att.name || '(no file)';
    nameEl.appendChild(nameValue);
    container.appendChild(nameEl);

    const mimeEl = document.createElement('div');
    mimeEl.className = 'pkc-attachment-field';
    const mimeLabel = document.createElement('strong');
    mimeLabel.textContent = 'Type: ';
    mimeEl.appendChild(mimeLabel);
    const mimeValue = document.createElement('span');
    mimeValue.className = 'pkc-attachment-mime';
    mimeValue.textContent = att.mime;
    mimeEl.appendChild(mimeValue);
    container.appendChild(mimeEl);

    const sizeEl = document.createElement('div');
    sizeEl.className = 'pkc-attachment-field';
    const sizeLabel = document.createElement('strong');
    sizeLabel.textContent = 'Size: ';
    sizeEl.appendChild(sizeLabel);
    const sizeValue = document.createElement('span');
    sizeValue.className = 'pkc-attachment-size';
    sizeValue.textContent = att.data ? formatSize(estimateSize(att.data)) : '(empty)';
    sizeEl.appendChild(sizeValue);
    container.appendChild(sizeEl);

    return container;
  },

  renderEditorBody(entry: Entry): HTMLElement {
    const att = parseAttachmentBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-attachment-editor';

    // Current file info
    if (att.name) {
      const current = document.createElement('div');
      current.className = 'pkc-attachment-current';
      current.textContent = `Current: ${att.name} (${att.mime}, ${formatSize(estimateSize(att.data))})`;
      container.appendChild(current);
    }

    // File input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.setAttribute('data-pkc-field', 'attachment-file');
    fileInput.className = 'pkc-attachment-file-input';
    container.appendChild(fileInput);

    // Hidden fields to hold current/new data
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

    const dataField = document.createElement('input');
    dataField.type = 'hidden';
    dataField.setAttribute('data-pkc-field', 'attachment-data');
    dataField.value = att.data;
    container.appendChild(dataField);

    // When file is selected, read and populate hidden fields
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      nameField.value = file.name;
      mimeField.value = file.type || 'application/octet-stream';
      const reader = new FileReader();
      reader.onload = () => {
        // result is "data:<mime>;base64,<data>" — extract the base64 part
        const result = reader.result as string;
        const base64 = result.split(',')[1] ?? '';
        dataField.value = base64;
      };
      reader.readAsDataURL(file);
    });

    return container;
  },

  collectBody(root: HTMLElement): string {
    const nameEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-name"]');
    const mimeEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-mime"]');
    const dataEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-data"]');
    const name = nameEl?.value ?? '';
    const mime = mimeEl?.value ?? 'application/octet-stream';
    const data = dataEl?.value ?? '';
    return serializeAttachmentBody({ name, mime, data });
  },
};
