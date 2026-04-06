import type { Container } from '../model/container';

/**
 * PendingOfferRef: minimal reference for offer-related commands.
 * Avoids importing adapter types into core by using a structural type.
 */
export interface PendingOfferRef {
  offer_id: string;
  title: string;
  body: string;
  archetype: string;
  source_container_id: string | null;
  reply_to_id: string | null;
  received_at: string;
}

/**
 * ImportPreviewRef: summary of an import candidate for confirmation.
 * Structural type to avoid importing adapter types into core.
 */
export interface ImportPreviewRef {
  /** Title of the container to be imported. */
  title: string;
  /** Container ID of the import source. */
  container_id: string;
  /** Number of entries in the import. */
  entry_count: number;
  /** Number of revisions in the import. */
  revision_count: number;
  /** Schema version of the import. */
  schema_version: number;
  /** Source filename or description. */
  source: string;
  /** The validated Container, ready for replacement on confirm. */
  container: Container;
}

/**
 * SystemCommand: commands issued by the runtime or infrastructure,
 * not directly by the user.
 *
 * Examples: rehydrate completion, export finish, system-level errors.
 *
 * Naming: SYS_ prefix to distinguish from UserAction at a glance.
 * All type literals are string constants (minify-safe).
 */
export type SystemCommand =
  | { type: 'SYS_INIT_COMPLETE'; container: Container; embedded?: boolean }
  | { type: 'SYS_INIT_ERROR'; error: string }
  | { type: 'SYS_FINISH_EXPORT' }
  | { type: 'SYS_IMPORT_COMPLETE'; container: Container; source: string }
  | { type: 'SYS_IMPORT_PREVIEW'; preview: ImportPreviewRef }
  | { type: 'SYS_RECORD_OFFERED'; offer: PendingOfferRef }
  | { type: 'SYS_ERROR'; error: string };

/** Extract the type literal from a SystemCommand. */
export type SystemCommandType = SystemCommand['type'];
