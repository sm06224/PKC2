import { describe, it, expect } from 'vitest';
import { computeGitStamp, type GitStampRunner } from '../../build/git-stamp';

/**
 * Runner factory that dispatches on command string, and throws if an
 * unexpected command is issued. This catches regressions where the
 * implementation starts calling extra git commands we haven't
 * accounted for.
 */
function runnerOf(responses: Record<string, string | (() => string)>): GitStampRunner {
  return (cmd: string) => {
    const response = responses[cmd];
    if (response === undefined) throw new Error(`unexpected command: ${cmd}`);
    return typeof response === 'function' ? response() : response;
  };
}

describe('computeGitStamp', () => {
  it('returns the short HEAD sha on a clean worktree', () => {
    const runner = runnerOf({
      'git rev-parse --short HEAD': 'abc1234\n',
      'git status --porcelain': '',
    });
    expect(computeGitStamp(runner)).toBe('abc1234');
  });

  it('appends +dirty when status --porcelain reports a modified file', () => {
    const runner = runnerOf({
      'git rev-parse --short HEAD': 'abc1234\n',
      'git status --porcelain': ' M src/foo.ts\n',
    });
    expect(computeGitStamp(runner)).toBe('abc1234+dirty');
  });

  it('treats untracked files as dirty (porcelain ?? prefix)', () => {
    const runner = runnerOf({
      'git rev-parse --short HEAD': 'abc1234\n',
      'git status --porcelain': '?? new.ts\n',
    });
    expect(computeGitStamp(runner)).toBe('abc1234+dirty');
  });

  it('treats multiple changed files as dirty', () => {
    const runner = runnerOf({
      'git rev-parse --short HEAD': 'deadbee\n',
      'git status --porcelain': ' M a.ts\n M b.ts\n?? c.ts\n',
    });
    expect(computeGitStamp(runner)).toBe('deadbee+dirty');
  });

  it('strips trailing whitespace from the sha', () => {
    const runner = runnerOf({
      'git rev-parse --short HEAD': '  deadbee  \n',
      'git status --porcelain': '',
    });
    expect(computeGitStamp(runner)).toBe('deadbee');
  });

  it('returns "unknown" when git rev-parse throws (not a git repo)', () => {
    const runner = runnerOf({
      'git rev-parse --short HEAD': () => {
        throw new Error('fatal: not a git repository');
      },
    });
    expect(computeGitStamp(runner)).toBe('unknown');
  });

  it('returns "unknown" when rev-parse returns an empty string', () => {
    const runner = runnerOf({
      'git rev-parse --short HEAD': '\n',
    });
    expect(computeGitStamp(runner)).toBe('unknown');
  });

  it('returns the clean sha (no +dirty) when rev-parse succeeds but status fails', () => {
    // This path documents the "partial-information" fallback:
    // if we know the sha but not the dirty state, we report the
    // sha rather than inventing a dirty marker.
    const runner = runnerOf({
      'git rev-parse --short HEAD': 'abc1234\n',
      'git status --porcelain': () => {
        throw new Error('git status: pipe broken');
      },
    });
    expect(computeGitStamp(runner)).toBe('abc1234');
  });

  it('never appends +dirty when porcelain is the empty string (not whitespace)', () => {
    const runner = runnerOf({
      'git rev-parse --short HEAD': 'feed1ba\n',
      'git status --porcelain': '',
    });
    expect(computeGitStamp(runner)).toBe('feed1ba');
  });

  it('treats a porcelain output of just whitespace as clean', () => {
    // `.trim()` is applied before the length check, so lone
    // whitespace from a buggy git wrapper is NOT misread as dirty.
    const runner = runnerOf({
      'git rev-parse --short HEAD': 'feed1ba\n',
      'git status --porcelain': '   \n',
    });
    expect(computeGitStamp(runner)).toBe('feed1ba');
  });
});
