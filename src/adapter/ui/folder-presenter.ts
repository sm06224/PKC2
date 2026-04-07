import type { DetailPresenter } from './detail-presenter';
import type { Entry } from '../../core/model/record';

/**
 * Folder presenter: minimal body rendering for folder entries.
 *
 * Folders primarily serve as structural containers.
 * The body is an optional description/notes field.
 */
export const folderPresenter: DetailPresenter = {
  renderBody(entry: Entry): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'pkc-folder-view';

    if (entry.body) {
      const desc = document.createElement('pre');
      desc.className = 'pkc-view-body';
      desc.textContent = entry.body;
      wrapper.appendChild(desc);
    } else {
      const empty = document.createElement('div');
      empty.className = 'pkc-folder-empty';
      empty.textContent = 'Folder (no description)';
      wrapper.appendChild(empty);
    }

    return wrapper;
  },

  renderEditorBody(entry: Entry): HTMLElement {
    const bodyArea = document.createElement('textarea');
    bodyArea.value = entry.body;
    bodyArea.setAttribute('data-pkc-field', 'body');
    bodyArea.className = 'pkc-editor-body';
    bodyArea.rows = 4;
    bodyArea.placeholder = 'Optional folder description…';
    return bodyArea;
  },

  collectBody(root: HTMLElement): string {
    const bodyEl = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    return bodyEl?.value ?? '';
  },
};
