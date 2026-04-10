/**
 * git-stamp: compute the git provenance stamp embedded into
 * dist/pkc2.html via `<script id="pkc-meta">.source_commit`.
 *
 * Format:
 *   clean worktree → "<short-sha>"           e.g. "20d7d30"
 *   dirty worktree → "<short-sha>+dirty"     e.g. "20d7d30+dirty"
 *   git unavailable → "unknown"
 *
 * The "+dirty" suffix exists because `build:release` is routinely
 * run before a commit (to update dist/ as part of the commit), so
 * the short sha it picks up from `git rev-parse HEAD` is the PREVIOUS
 * commit, not the commit that will be created. Without a dirty
 * marker, the artifact silently carries a stale commit stamp. We
 * don't try to predict the next sha — we just make the staleness
 * legible.
 *
 * Design notes:
 * - The runner is injected to keep this testable without shelling
 *   out for real. The default runner calls `child_process.execSync`.
 * - If `rev-parse` succeeds but `status` fails, we return the clean
 *   sha rather than an error marker: we know the sha, we just don't
 *   know the dirty state, so we report only what we have.
 * - Empty output from `rev-parse` is treated as unknown (belt-and-
 *   braces, since execSync will usually throw on failure anyway).
 */
import { execSync } from 'child_process';

/** Runs a shell command and returns its stdout as a string. */
export type GitStampRunner = (cmd: string) => string;

const defaultRunner: GitStampRunner = (cmd) =>
  execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();

/**
 * Compute the git stamp for the current worktree.
 * Returns "<sha>", "<sha>+dirty", or "unknown".
 */
export function computeGitStamp(runner: GitStampRunner = defaultRunner): string {
  let sha: string;
  try {
    sha = runner('git rev-parse --short HEAD').trim();
  } catch {
    return 'unknown';
  }
  if (!sha) return 'unknown';

  let porcelain: string;
  try {
    porcelain = runner('git status --porcelain').trim();
  } catch {
    // rev-parse worked, status didn't. Report the clean sha rather
    // than pretending the worktree is clean OR dirty.
    return sha;
  }

  return porcelain.length > 0 ? `${sha}+dirty` : sha;
}
