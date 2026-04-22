/**
 * S1 — Archetype-aware default edit focus selector.
 *
 * Pure helper used by the post-render focus block in main.ts to
 * pick a better initial focus target than "always title input" when
 * BEGIN_EDIT transitions the app into editing phase. Returns the
 * `[data-pkc-field="…"]` CSS selector for the main body / description
 * field of the given archetype, or `null` when the archetype has no
 * clear body field. Callers are expected to fall back to the title
 * input whenever this helper returns `null` or the target is not
 * actually present in the DOM.
 *
 * Archetype map (scope kept minimal — extend as presenters acquire
 * new primary fields):
 *
 * - text / generic / opaque / folder: `textarea[data-pkc-field="body"]`
 *   The `textarea` qualifier is deliberate: the TEXTLOG editor carries
 *   a hidden `<input data-pkc-field="body">` for collectBody
 *   compatibility, and we must never focus that.
 * - todo: `textarea[data-pkc-field="todo-description"]`
 * - form: `textarea[data-pkc-field="form-note"]`
 * - textlog: `null`. Per-log focus is owned by B4 via
 *   `beginLogEdit` (see action-binder.ts), which runs synchronously
 *   after BEGIN_EDIT dispatch and wins over this block. Other
 *   BEGIN_EDIT entry points (keyboard Enter, programmatic) keep the
 *   legacy title-first behavior so they do not quietly land on the
 *   wrong row.
 * - attachment: `null` (metadata-only editor; title is the most
 *   meaningful target).
 * - undefined / unknown: `null`.
 */
export function preferredEditFocusSelector(archetype: string | undefined): string | null {
  switch (archetype) {
    case 'text':
    case 'generic':
    case 'opaque':
    case 'folder':
      return 'textarea[data-pkc-field="body"]';
    case 'todo':
      return 'textarea[data-pkc-field="todo-description"]';
    case 'form':
      return 'textarea[data-pkc-field="form-note"]';
    default:
      return null;
  }
}
