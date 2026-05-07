/**
 * Canonical Fragment IR types (領域 10-6 ζ'' Phase 3c-B).
 *
 * Spec: docs/development/fragment-reference-ir-spec-2026-05.md §3.1
 *
 * Pure types — keeps imports cheap so converters can declare types
 * without dragging in the full converter registry.
 */

export type FragmentLocatorKind =
  | 'time'
  | 'time-range'
  | 'page'
  | 'page-range'
  | 'episode'
  | 'section'
  | 'text-quote'
  | 'asset-rect'
  | 'log'
  | 'custom';

/** Locator shape per kind. Discriminated by `locator_kind`. */
export type FragmentLocator =
  | { kind: 'time'; start_sec: number; end_sec?: never }
  | { kind: 'time-range'; start_sec: number; end_sec: number }
  | { kind: 'page'; page: number; end_page?: never }
  | { kind: 'page-range'; page: number; end_page: number }
  | { kind: 'episode'; episode: string | number; offset?: number }
  | { kind: 'section'; anchor: string }
  | { kind: 'text-quote'; exact: string; prefix?: string; suffix?: string }
  | { kind: 'asset-rect'; x: number; y: number; w: number; h: number }
  | { kind: 'log'; log_id: string }
  | { kind: 'custom'; data: Record<string, unknown> };

export interface CanonicalFragment {
  /** http(s) / asset:KEY / entry:LID URI of the source resource. */
  source: string;
  /** Discriminator that matches the active branch of `locator`. */
  locator_kind: FragmentLocatorKind;
  /** Locator data — see FragmentLocator union. */
  locator: FragmentLocator;
  /** "Open this in a browser" form, when reconstructable. */
  open_uri?: string;
  /** Display label; if absent, generators may format from locator. */
  label?: string;
  /** Optional comment / annotation by the user. */
  comment?: string;
}

/**
 * Plug-in interface for user-extensible converters.
 * Spec §3.3.
 */
export interface FragmentConverter {
  /** Convertor identifier — used by registry / debug overlays. */
  id: string;
  /** Match input (URI string + optional context) against this converter. */
  match(input: string, ctx?: { mime?: string }): boolean;
  /** Parse the input URI into a canonical fragment. Return null when
   *  the input is recognised as the converter's family but lacks a
   *  fragment (so the caller can downgrade gracefully). */
  toCanonical(input: string): CanonicalFragment | null;
  /** Reconstruct an open-able URI from a canonical fragment. */
  fromCanonical(c: CanonicalFragment): string | null;
  /** Pretty display label generator. Optional fallback. */
  formatLabel?(c: CanonicalFragment): string;
}
