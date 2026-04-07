import type { Entry } from '../../core/model/record';
import type { DetailPresenter } from './detail-presenter';

/**
 * Form body schema (minimal validation archetype).
 * Fixed fields — NOT a dynamic schema engine.
 * Stored as JSON string in entry.body.
 */
export interface FormBody {
  name: string;
  note: string;
  checked: boolean;
}

export function parseFormBody(body: string): FormBody {
  try {
    const parsed = JSON.parse(body) as Partial<FormBody>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      note: typeof parsed.note === 'string' ? parsed.note : '',
      checked: parsed.checked === true,
    };
  } catch {
    return { name: '', note: '', checked: false };
  }
}

export function serializeFormBody(form: FormBody): string {
  return JSON.stringify({ name: form.name, note: form.note, checked: form.checked });
}

export const formPresenter: DetailPresenter = {
  renderBody(entry: Entry): HTMLElement {
    const form = parseFormBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-form-view';

    const nameEl = document.createElement('div');
    nameEl.className = 'pkc-form-field';
    const nameLabel = document.createElement('strong');
    nameLabel.textContent = 'Name: ';
    nameEl.appendChild(nameLabel);
    const nameValue = document.createElement('span');
    nameValue.className = 'pkc-form-value';
    nameValue.textContent = form.name || '(empty)';
    nameEl.appendChild(nameValue);
    container.appendChild(nameEl);

    const noteEl = document.createElement('div');
    noteEl.className = 'pkc-form-field';
    const noteLabel = document.createElement('strong');
    noteLabel.textContent = 'Note: ';
    noteEl.appendChild(noteLabel);
    const noteValue = document.createElement('span');
    noteValue.className = 'pkc-form-value';
    noteValue.textContent = form.note || '(empty)';
    noteEl.appendChild(noteValue);
    container.appendChild(noteEl);

    const checkedEl = document.createElement('div');
    checkedEl.className = 'pkc-form-field';
    const checkedLabel = document.createElement('strong');
    checkedLabel.textContent = 'Checked: ';
    checkedEl.appendChild(checkedLabel);
    const checkedValue = document.createElement('span');
    checkedValue.className = 'pkc-form-value';
    checkedValue.textContent = form.checked ? 'Yes' : 'No';
    checkedEl.appendChild(checkedValue);
    container.appendChild(checkedEl);

    return container;
  },

  renderEditorBody(entry: Entry): HTMLElement {
    const form = parseFormBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-form-editor';

    // Name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.setAttribute('data-pkc-field', 'form-name');
    nameInput.className = 'pkc-form-name-input';
    nameInput.value = form.name;
    nameInput.placeholder = 'Name';
    container.appendChild(nameInput);

    // Note textarea
    const noteArea = document.createElement('textarea');
    noteArea.setAttribute('data-pkc-field', 'form-note');
    noteArea.className = 'pkc-form-note-input';
    noteArea.value = form.note;
    noteArea.rows = 4;
    noteArea.placeholder = 'Note (optional)';
    container.appendChild(noteArea);

    // Checked checkbox
    const checkLabel = document.createElement('label');
    checkLabel.className = 'pkc-form-check-label';
    const checkInput = document.createElement('input');
    checkInput.type = 'checkbox';
    checkInput.setAttribute('data-pkc-field', 'form-checked');
    checkInput.className = 'pkc-form-checked-input';
    checkInput.checked = form.checked;
    checkLabel.appendChild(checkInput);
    const checkText = document.createTextNode(' Checked');
    checkLabel.appendChild(checkText);
    container.appendChild(checkLabel);

    return container;
  },

  collectBody(root: HTMLElement): string {
    const nameEl = root.querySelector<HTMLInputElement>('[data-pkc-field="form-name"]');
    const noteEl = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="form-note"]');
    const checkedEl = root.querySelector<HTMLInputElement>('[data-pkc-field="form-checked"]');
    const name = nameEl?.value ?? '';
    const note = noteEl?.value ?? '';
    const checked = checkedEl?.checked ?? false;
    return serializeFormBody({ name, note, checked });
  },
};
