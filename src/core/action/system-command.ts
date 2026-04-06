import type { Container } from '../model/container';

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
  | { type: 'SYS_INIT_COMPLETE'; container: Container }
  | { type: 'SYS_INIT_ERROR'; error: string }
  | { type: 'SYS_FINISH_EXPORT' }
  | { type: 'SYS_IMPORT_COMPLETE'; container: Container; source: string }
  | { type: 'SYS_ERROR'; error: string };

/** Extract the type literal from a SystemCommand. */
export type SystemCommandType = SystemCommand['type'];
