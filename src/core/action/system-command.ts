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
  | { type: 'SYS_RECORD_OFFERED'; offer: PendingOfferRef }
  | { type: 'SYS_ERROR'; error: string };

/** Extract the type literal from a SystemCommand. */
export type SystemCommandType = SystemCommand['type'];
