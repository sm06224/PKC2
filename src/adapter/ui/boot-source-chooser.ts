/**
 * Boot source chooser — one-shot modal that runs during boot when
 * BOTH embedded pkc-data AND an IndexedDB default container are
 * present. Prompts the user to pick which one to open this session.
 *
 * See `docs/development/boot-container-source-policy-revision.md`.
 *
 * Contract:
 *   - Pure view layer. No dispatcher, no reducer, no persistence.
 *   - Returns a Promise<ChooserChoice> that resolves on click.
 *   - Safe to call once per boot. Not re-entrant.
 *   - If already mounted (defensive), the previous overlay is removed
 *     and replaced — but `boot()` calls this exactly once.
 *   - Uses existing CSS tokens (pkc-text-replace-* family) for the
 *     overlay / card styling to avoid new class definitions.
 */
import type { BootSource, ChooserChoice } from '../platform/pkc-data-source';

const OVERLAY_CLASS = 'pkc-text-replace-overlay';
const CARD_CLASS = 'pkc-text-replace-card';
const ACTIONS_CLASS = 'pkc-text-replace-actions';

const DATA_REGION = 'boot-source-chooser';
const ACTION_PICK_PKC_DATA = 'boot-source-pick-pkc-data';
const ACTION_PICK_IDB = 'boot-source-pick-idb';

let activeOverlay: HTMLElement | null = null;

export interface BootSourceChooserOptions {
  /**
   * Host element the overlay attaches to. Usually `document.body`.
   * Tests can pass a test-local container to keep the DOM scoped.
   */
  host: HTMLElement;
  /**
   * Chooser data stashed by `chooseBootSource` when source === 'chooser'.
   * Passed through so the caller can display contextual hints (entry
   * counts, titles) without re-reading anything.
   */
  chooser: BootSource;
}

/**
 * Summary info about a container for display in the chooser.
 */
interface SourceSummary {
  title: string;
  entryCount: number;
  containerId: string;
  updatedAt: string;
}

function summarizePkcData(chooser: BootSource): SourceSummary | null {
  const pkc = chooser.pkcData;
  if (!pkc) return null;
  return {
    title: pkc.container.meta.title || '(untitled)',
    entryCount: pkc.container.entries.length,
    containerId: pkc.container.meta.container_id,
    updatedAt: pkc.container.meta.updated_at,
  };
}

function summarizeIdb(chooser: BootSource): SourceSummary | null {
  const idb = chooser.idbContainer;
  if (!idb) return null;
  return {
    title: idb.meta.title || '(untitled)',
    entryCount: idb.entries.length,
    containerId: idb.meta.container_id,
    updatedAt: idb.meta.updated_at,
  };
}

/**
 * Mount the chooser overlay and resolve with the user's choice.
 *
 * Focus lands on the "Open embedded" button so keyboard users can
 * confirm with Enter. There is no Escape path — the user must pick
 * one source, the boot cannot proceed without a container. The
 * overlay is non-dismissible by backdrop click for the same reason.
 */
export function showBootSourceChooser(
  options: BootSourceChooserOptions,
): Promise<ChooserChoice> {
  // Defensive: unmount any previous overlay before constructing the new
  // one. Not expected during normal boot flow but cheap insurance.
  unmount();

  const { host, chooser } = options;
  const pkcSummary = summarizePkcData(chooser);
  const idbSummary = summarizeIdb(chooser);

  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  overlay.setAttribute('data-pkc-region', DATA_REGION);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Choose container source');

  const card = document.createElement('div');
  card.className = CARD_CLASS;

  const title = document.createElement('h2');
  title.className = 'pkc-text-replace-title';
  title.textContent = 'どちらのコンテナを開きますか？';
  card.appendChild(title);

  const explain = document.createElement('p');
  explain.className = 'pkc-boot-chooser-explain';
  explain.textContent =
    'この HTML には埋め込みコンテナがあり、ブラウザの IndexedDB には'
    + '別のコンテナが保存されています。どちらをこのセッションで開くか'
    + '選んでください。埋め込み側を選んでも IndexedDB は書き換わりません。';
  card.appendChild(explain);

  card.appendChild(renderSourceBlock('HTML 埋め込みコンテナ', pkcSummary, 'viewer'));
  card.appendChild(renderSourceBlock('IndexedDB のコンテナ', idbSummary, 'writable'));

  const actions = document.createElement('div');
  actions.className = ACTIONS_CLASS;

  const pickIdbBtn = document.createElement('button');
  pickIdbBtn.type = 'button';
  pickIdbBtn.className = 'pkc-btn';
  pickIdbBtn.setAttribute('data-pkc-action', ACTION_PICK_IDB);
  pickIdbBtn.textContent = 'IndexedDB を開く';

  const pickEmbeddedBtn = document.createElement('button');
  pickEmbeddedBtn.type = 'button';
  pickEmbeddedBtn.className = 'pkc-btn pkc-btn-primary';
  pickEmbeddedBtn.setAttribute('data-pkc-action', ACTION_PICK_PKC_DATA);
  pickEmbeddedBtn.textContent = '埋め込みを開く (view-only)';

  actions.appendChild(pickIdbBtn);
  actions.appendChild(pickEmbeddedBtn);
  card.appendChild(actions);

  overlay.appendChild(card);
  host.appendChild(overlay);
  activeOverlay = overlay;

  return new Promise<ChooserChoice>((resolve) => {
    const pick = (choice: ChooserChoice): void => {
      unmount();
      resolve(choice);
    };
    pickIdbBtn.addEventListener('click', () => pick('idb'));
    pickEmbeddedBtn.addEventListener('click', () => pick('pkc-data'));

    // Preferred default: pkc-data (the HTML the user just opened). This
    // matches the S-24 semantic and lets Enter confirm the "view what
    // this HTML contains" expectation.
    pickEmbeddedBtn.focus();
  });
}

/**
 * Build a <section> describing one candidate source. `kind` is
 * informational only ('viewer' for pkc-data, 'writable' for IDB).
 */
function renderSourceBlock(
  label: string,
  summary: SourceSummary | null,
  kind: 'viewer' | 'writable',
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'pkc-boot-chooser-source';
  section.setAttribute('data-pkc-kind', kind);

  const heading = document.createElement('h3');
  heading.className = 'pkc-boot-chooser-label';
  heading.textContent = label;
  section.appendChild(heading);

  if (!summary) {
    const missing = document.createElement('p');
    missing.className = 'pkc-boot-chooser-missing';
    missing.textContent = '(情報が取得できませんでした)';
    section.appendChild(missing);
    return section;
  }

  const info = document.createElement('dl');
  info.className = 'pkc-boot-chooser-info';
  appendRow(info, 'Title', summary.title);
  appendRow(info, 'Entries', String(summary.entryCount));
  appendRow(info, 'Container ID', summary.containerId);
  appendRow(info, 'Updated', summary.updatedAt);
  section.appendChild(info);

  return section;
}

function appendRow(dl: HTMLElement, k: string, v: string): void {
  const dt = document.createElement('dt');
  dt.textContent = k;
  const dd = document.createElement('dd');
  dd.textContent = v;
  dl.appendChild(dt);
  dl.appendChild(dd);
}

/** Unmount the overlay if present. Safe to call redundantly. */
export function closeBootSourceChooser(): void {
  unmount();
}

/** True while the overlay is on screen. */
export function isBootSourceChooserOpen(): boolean {
  return activeOverlay !== null;
}

function unmount(): void {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}
