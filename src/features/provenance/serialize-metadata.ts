/**
 * Provenance metadata — canonical serialization for copy/export v1.
 *
 * Canonical spec: `docs/spec/provenance-relation-profile.md §2.2`
 * Dev doc:        `docs/development/provenance-metadata-copy-export-v1.md`
 *
 * Pure function, no DOM / no browser API. Produces a JSON string
 * suitable for clipboard copy. The output is deterministic across
 * renders for the same metadata input because keys are emitted in a
 * fixed priority order — identical to the viewer's display order:
 *
 *   1. conversion_kind         (required, profile §2.2.1)
 *   2. converted_at            (required, profile §2.2.1)
 *   3. source_content_hash     (recommended, profile §2.2.2)
 *   4. remaining keys, alphabetical
 *
 * The copied payload is RAW canonical metadata — never the viewer's
 * pretty-printed display form. This boundary keeps the viewer / copy
 * story simple: display is for reading, copy is for canonical paste.
 *
 * Non-string values, empty strings, and `undefined` are filtered out
 * (same defensive gate as the viewer).
 */

const PRIORITY_ORDER: readonly string[] = [
  'conversion_kind',
  'converted_at',
  'source_content_hash',
];

export function serializeProvenanceMetadataCanonical(
  metadata: Record<string, unknown> | undefined,
): string {
  const ordered: Record<string, string> = {};
  if (!metadata) return '{}';

  const stringEntries: [string, string][] = [];
  for (const key of Object.keys(metadata)) {
    const v = metadata[key];
    if (typeof v === 'string' && v.length > 0) stringEntries.push([key, v]);
  }
  if (stringEntries.length === 0) return '{}';

  stringEntries.sort((a, b) => {
    const ai = PRIORITY_ORDER.indexOf(a[0]);
    const bi = PRIORITY_ORDER.indexOf(b[0]);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a[0].localeCompare(b[0]);
  });

  for (const [key, value] of stringEntries) ordered[key] = value;
  return JSON.stringify(ordered, null, 2);
}
