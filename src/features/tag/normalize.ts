/**
 * Tag input normalizer (W1 Slice F — minimum scope).
 *
 * Enforces the R1-R8 rules from
 * `docs/spec/tag-data-model-v1-minimum-scope.md` §4.2 at every
 * write boundary. All write routes (chip UI add action, future
 * importer, future record:offer receiver) must pipe user-provided
 * strings through `normalizeTagInput` before appending to
 * `entry.tags`. Read paths never re-normalize — values are stored
 * already normalized.
 *
 * The normalizer is pure and lives in the features layer so the
 * core model stays free of input-validation logic. No DOM, no
 * random IDs, no time.
 */

/** Maximum UTF-16 code-unit length per single Tag value (Slice B §3.2). */
export const TAG_MAX_LENGTH = 64;

/** Maximum number of Tag values per entry (Slice B §3.2). */
export const TAG_MAX_COUNT = 32;

/**
 * Outcome of a single Tag input validation. A rejected result
 * carries a machine-readable `reason` the caller can use to drive
 * inline error UI; Slice F uses toasts / silent reject and does
 * not expose the reason to end users yet.
 */
export type TagNormalizeResult =
  | { ok: true; value: string }
  | { ok: false; reason: TagRejectReason };

export type TagRejectReason =
  | 'empty'            // R2: blank after trim
  | 'too-long'         // R3: > TAG_MAX_LENGTH
  | 'control-char'     // R4: contains \n / \r / \t / other C0 control
  | 'duplicate'        // R7: already in existingTags
  | 'cap-reached';     // R8: existingTags.length >= TAG_MAX_COUNT

/**
 * Validate and normalize a user-provided Tag string in the context
 * of an entry's existing tag list. Returns the final value to
 * store, or a reject reason.
 *
 * Inputs:
 * - `raw`: the raw user input (before trim).
 * - `existingTags`: the entry's current `tags` array. Used for
 *   duplicate + cap checks. Caller is responsible for ordering
 *   insertion at the end of this array — the normalizer does not
 *   mutate.
 *
 * Slice B R-rules applied here:
 *
 *   R1 trim             — whitespace at both ends stripped
 *   R2 empty reject     — empty after trim → `reason: 'empty'`
 *   R3 max-length       — > 64 chars → `reason: 'too-long'`
 *   R4 control-char     — any C0 / \t / \n / \r → `reason: 'control-char'`
 *   R5 NFC              — NOT applied in minimum scope (raw preserved)
 *   R6 case-sensitive   — stored as-entered
 *   R7 duplicate reject — already in existingTags → `reason: 'duplicate'`
 *   R8 cap-reached      — entry has 32 tags already → `reason: 'cap-reached'`
 *
 * Pure, side-effect-free.
 */
export function normalizeTagInput(
  raw: string,
  existingTags: readonly string[],
): TagNormalizeResult {
  // R8: cap-reached is checked BEFORE normalization so users see a
  // cap-reached error for anything they try to add when full, not
  // a more detailed R2/R3/R4 error that would be pointless if the
  // entry can't accept more tags anyway.
  if (existingTags.length >= TAG_MAX_COUNT) {
    return { ok: false, reason: 'cap-reached' };
  }

  // R1: trim — strip leading / trailing whitespace including full-
  // width space and line terminators. JavaScript `String.trim()` is
  // Unicode-aware under ECMAScript 2019+, which covers U+3000 and
  // ASCII whitespace; this matches Slice B §4.2 R1.
  const trimmed = raw.trim();

  // R2: empty reject
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  // R3: max-length (UTF-16 code units, matching `string.length`).
  if (trimmed.length > TAG_MAX_LENGTH) {
    return { ok: false, reason: 'too-long' };
  }

  // R4: control-character reject. Screens every C0 control code
  // (0x00-0x1F) plus DEL (0x7F). `\t`, `\n`, `\r` fall in this
  // range. Trim already removed leading/trailing whitespace, so any
  // remaining control character is embedded on purpose — reject.
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return { ok: false, reason: 'control-char' };
    }
  }

  // R7: duplicate. Case-sensitive raw `===` (R6 ties case-
  // sensitivity to the comparison here). `includes` is O(N) but N
  // <= TAG_MAX_COUNT (32), so linear scan is fine without a Set.
  if (existingTags.includes(trimmed)) {
    return { ok: false, reason: 'duplicate' };
  }

  return { ok: true, value: trimmed };
}
