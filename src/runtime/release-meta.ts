/**
 * ReleaseMeta: the type of the JSON in <script id="pkc-meta">.
 *
 * This describes "what this PKC2 artifact is" — identity, version,
 * provenance, integrity, and capability.
 *
 * Responsibility split:
 * - Builder generates all fields at build time (Stage 2)
 * - Runtime reads and optionally verifies at boot
 * - Source-side constants: APP_ID, SCHEMA_VERSION, CAPABILITIES
 *
 * This type lives in runtime/ (not core/) because it describes
 * the release artifact, which is a runtime/builder concern.
 */

/** Release kind: dev / stage / product. */
export type ReleaseKind = 'dev' | 'stage' | 'product';

/**
 * ReleaseMeta: self-description of a PKC2 release artifact.
 */
export interface ReleaseMeta {
  /** Fixed app identifier. Always 'pkc2'. */
  app: 'pkc2';

  /** Semantic version (e.g. "2.0.0"). Code compatibility. */
  version: string;

  /** Data schema version. Independent of semver. Migration key. */
  schema: number;

  /** Release kind. */
  kind: ReleaseKind;

  /**
   * User-facing version timestamp (14-digit: YYYYMMDDHHmmss).
   * Combined with semver + kind, forms the triple version.
   */
  timestamp: string;

  /** ISO 8601 build time (machine-readable). */
  build_at: string;

  /**
   * Git provenance stamp of the source.
   *
   * Format:
   *   clean worktree  → "<short-sha>"          e.g. "20d7d30"
   *   dirty worktree  → "<short-sha>+dirty"    e.g. "20d7d30+dirty"
   *   git unavailable → "unknown"
   *
   * The "+dirty" marker is the build-side signal that `build:release`
   * was run against a modified worktree — typically because dist/
   * is being updated as part of the commit that will include it.
   * In that case the short-sha refers to the PREVIOUS commit, not
   * the commit that will be created, so treat "+dirty" as "one newer
   * commit than this sha, still being written".
   */
  source_commit: string;

  /**
   * SHA-256 hash of pkc-core content. Format: "sha256:<hex>".
   * Used for code tamper detection (warn, not block).
   * Data (pkc-data) changes do NOT affect this — only code changes do.
   */
  code_integrity: string;

  /**
   * Capability list. Extensible.
   * Used by PKC-Message / embed / sandbox to negotiate features.
   * Example: ['core', 'idb', 'export', 'clone']
   */
  capabilities: string[];
}

// ── Source-side constants ─────────────────────

/** Fixed app identifier. */
export const APP_ID = 'pkc2' as const;

/**
 * Source-side version (semver).
 * Builder may override in pkc-meta; this is the source default.
 */
export const VERSION = '2.0.0' as const;

/**
 * Data schema version. Increment when Container shape changes
 * in a way that requires migration. Independent of semver.
 */
export const SCHEMA_VERSION = 1;

/**
 * Current capabilities. Extended as features are implemented.
 * Builder reads this to embed in pkc-meta.
 */
export const CAPABILITIES: readonly string[] = [
  'core',
  'idb',
  'export',
  'record-offer',
] as const;
