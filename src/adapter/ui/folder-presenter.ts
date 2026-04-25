import type { DetailPresenter } from './detail-presenter';
import type { Entry } from '../../core/model/record';
import { renderMarkdown, hasMarkdownSyntax } from '../../features/markdown/markdown-render';
import {
  resolveAssetReferences,
  hasAssetReferences,
} from '../../features/markdown/asset-resolver';
import { expandTransclusions } from './transclusion';
import { hydrateCardPlaceholders } from './card-hydrator';

/**
 * Folder presenter: minimal body rendering for folder entries.
 *
 * Folders primarily serve as structural containers.
 * The body is an optional description/notes field.
 *
 * Slice 3: the description is markdown-rendered when the body contains
 * markdown syntax (headings, lists, asset/entry refs, transclusions).
 * Plain-text bodies keep the `<pre class="pkc-view-body">` render so
 * legacy folders without intentional markdown read unchanged.
 *
 * The editor path is unchanged — folders still edit through a plain
 * textarea over the raw `entry.body` string.
 */
export const folderPresenter: DetailPresenter = {
  renderBody(
    entry: Entry,
    assets?: Record<string, string>,
    mimeByKey?: Record<string, string>,
    nameByKey?: Record<string, string>,
    entries?: Entry[],
    currentContainerId?: string,
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'pkc-folder-view';

    if (!entry.body) {
      const empty = document.createElement('div');
      empty.className = 'pkc-folder-empty';
      empty.textContent = 'Folder (no description)';
      wrapper.appendChild(empty);
      return wrapper;
    }

    // Resolve `asset:` references before passing to markdown-it so image
    // embeds and non-image chips both work in the folder description.
    let source = entry.body;
    if (assets && mimeByKey && hasAssetReferences(source)) {
      source = resolveAssetReferences(source, { assets, mimeByKey, nameByKey });
    }

    if (hasMarkdownSyntax(source)) {
      const desc = document.createElement('div');
      desc.className = 'pkc-view-body pkc-md-rendered';
      desc.innerHTML = renderMarkdown(source, { currentContainerId });
      if (entries) {
        expandTransclusions(desc, {
          entries,
          assets,
          mimeByKey,
          nameByKey,
          hostLid: entry.lid,
        });
        hydrateCardPlaceholders(desc, {
          entries,
          currentContainerId: currentContainerId ?? '',
        });
      }
      wrapper.appendChild(desc);
      return wrapper;
    }

    // Plain-text description: keep the legacy `<pre>` shape so
    // whitespace-sensitive notes read the same as before Slice 3.
    const desc = document.createElement('pre');
    desc.className = 'pkc-view-body';
    desc.textContent = entry.body;
    wrapper.appendChild(desc);
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
