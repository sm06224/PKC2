/**
 * Extract every `entry:` reference embedded in a markdown source.
 *
 * Features layer — pure function, no DOM access. Complements
 * `parseEntryRef` (single-string parser) by providing a bulk scanner
 * over arbitrary markdown bodies.
 *
 * Recognised forms (anything `parseEntryRef` can understand):
 *
 *   - `entry:<lid>`                    bare reference
 *   - `entry:<lid>#log/<id>`           log-entry fragment
 *   - `entry:<lid>#log/<a>..<b>`       log-range fragment
 *   - `entry:<lid>#day/<yyyy-mm-dd>`   day fragment
 *   - `entry:<lid>#log/<id>/<slug>`    heading fragment
 *   - `entry:<lid>#<legacy-id>`        legacy fragment
 *
 * All fragment variants contribute the same LID to the output set —
 * callers that need the full parsed form should route through
 * `parseEntryRef` on each match.
 *
 * Matches both the transclusion / image form `![alt](entry:lid)` and
 * the ordinary link form `[label](entry:lid)`. A bare `entry:lid`
 * token in plain prose is also matched so that hand-authored notes
 * pull in their referenced entries when a subset export runs.
 */
export function extractEntryReferences(markdown: string): Set<string> {
  const refs = new Set<string>();
  if (typeof markdown !== 'string' || markdown.length === 0) return refs;
  // LID tokens are `[A-Za-z0-9_-]+` per `parseEntryRef`. Any following
  // `#…` fragment is optional; we don't need to capture it here
  // because this scanner only returns target LIDs.
  const RE = /entry:([A-Za-z0-9_-]+)/g;
  for (const m of markdown.matchAll(RE)) {
    const lid = m[1];
    if (typeof lid === 'string' && lid.length > 0) refs.add(lid);
  }
  return refs;
}
