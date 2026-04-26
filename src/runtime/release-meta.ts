/**
 * ReleaseMeta: the type of the JSON in <script id="pkc-meta">.
 *
 * This describes "what this PKC2 artifact is" — identity, version,
 * provenance, integrity, and capability.
 *
 * Responsibility split:
 * - Builder generates all fields at build time (Stage 2)
 * - Runtime reads and optionally verifies at boot
 * - Source-side constants: APP_ID, SCHEMA_VERSION, BUILD_FEATURES
 *
 * This type lives in runtime/ (not core/) because it describes
 * the release artifact, which is a runtime/builder concern.
 *
 * Capability split (PR-B' / Decision D4, 2026-04-26):
 * - `BUILD_FEATURES` (this file) = build-side feature flags embedded
 *   in pkc-meta JSON, surfaced as `data-pkc-capabilities` DOM attr.
 *   Examples: 'core' / 'idb' / 'export'. NOT message-type names.
 * - `MESSAGE_CAPABILITIES` (`src/adapter/transport/capability.ts`) =
 *   transport-advertised message types in PongProfile, surfaced via
 *   pong responses to senders. Examples: 'record:offer' /
 *   'export:request'. Per spec `pkc-message-api-v1.md` §5.2.1.
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
   * Build-side feature flag list. Extensible.
   * Surfaced as `data-pkc-capabilities` DOM attribute for general
   * artifact introspection (devtools, embed harnesses).
   *
   * NOT a message-type advertisement. Sender-visible message types
   * are advertised via `PongProfile.capabilities` (`MESSAGE_CAPABILITIES`
   * in `src/adapter/transport/capability.ts`), which follows
   * `docs/spec/pkc-message-api-v1.md` §5.2.1 vocabulary.
   *
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
 *
 * Bumped to 2.1.1 (Phase 3 / Phase 2 Link migration tool v1 close):
 * v2.1.0 shipped the Link system foundation with the migration tool
 * listed as "designed but not implemented"; v2.1.1 promotes it to
 * fully implemented (scanner + preview UI + Apply all safe +
 * revision-backed undo + manual sync). schema_version is unchanged.
 * See docs/release/CHANGELOG_v2.1.1.md and
 * docs/development/versioning-policy.md.
 */
export const VERSION = '2.1.1' as const;

/**
 * Data schema version. Increment when Container shape changes
 * in a way that requires migration. Independent of semver.
 */
export const SCHEMA_VERSION = 1;

/**
 * Build-side feature flags. Extended as features are implemented.
 * Builder reads this to embed in pkc-meta JSON, and the renderer
 * surfaces it as the `data-pkc-capabilities` DOM attribute.
 *
 * IMPORTANT (PR-B' / Decision D4, 2026-04-26): This is **not**
 * a message-type advertisement. Sender-visible message types are
 * advertised via `MESSAGE_CAPABILITIES` (in
 * `src/adapter/transport/capability.ts`) and surfaced through
 * `PongProfile.capabilities` per spec `pkc-message-api-v1.md`
 * §5.2.1. The two lists serve different audiences (artifact
 * introspection vs. message-type negotiation) and follow
 * different vocabularies (kebab-case feature names vs. colon-
 * separated message-type names).
 *
 * `'record-offer'` was previously listed here for transport
 * advertisement; that responsibility moved to MESSAGE_CAPABILITIES.
 */
export const BUILD_FEATURES: readonly string[] = [
  'core',
  'idb',
  'export',
] as const;

/**
 * Backward-compatibility alias. Pre-PR-B' (2026-04-26) call sites
 * imported `CAPABILITIES`. Kept as a re-export so out-of-tree
 * tooling does not break, but prefer `BUILD_FEATURES` in new code.
 *
 * @deprecated Use `BUILD_FEATURES` for build-side flags or
 * `MESSAGE_CAPABILITIES` (from `@adapter/transport/capability`)
 * for sender-visible message types.
 */
export const CAPABILITIES = BUILD_FEATURES;
