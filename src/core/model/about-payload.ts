export interface AboutPayload {
  type: 'pkc2-about';
  version: string;
  description: string;
  build: {
    timestamp: string;
    commit: string;
    builder: string;
  };
  license: {
    name: string;
    url: string;
  };
  author: {
    name: string;
    url: string;
    role: string;
  };
  homepage: string;
  runtime: {
    offline: boolean;
    bundled: boolean;
    externalDependencies: boolean;
  };
  dependencies: AboutModule[];
  devDependencies: AboutModule[];
  contributors: AboutContributor[];
  /**
   * Release summary surfaced in the About view. Additive since
   * v2.1.0 — older exports without this field fall back to an
   * empty summary rather than crashing.
   *
   * Keep entries user-facing and short; full detail lives in
   * `docs/release/CHANGELOG_v<version>.md`.
   */
  release?: AboutRelease;
}

export interface AboutRelease {
  highlights: string[];
  knownLimitations: string[];
  /**
   * Relative path (from the repo root) of the full changelog doc.
   * Advisory — not required to be fetched at runtime; shown as
   * plain text so users know where to look.
   */
  changelog?: string;
}

export interface AboutModule {
  name: string;
  version: string;
  license: string;
}

export interface AboutContributor {
  name: string;
  role: string;
  url: string;
}

export const DEFAULT_ABOUT_STUB: AboutPayload = {
  type: 'pkc2-about',
  version: 'unknown',
  description: '',
  build: { timestamp: 'unknown', commit: 'unknown', builder: 'unknown' },
  license: { name: 'unknown', url: '' },
  author: { name: 'unknown', url: '', role: '' },
  homepage: '',
  runtime: { offline: true, bundled: true, externalDependencies: false },
  dependencies: [],
  devDependencies: [],
  contributors: [],
};

function isValidModule(m: unknown): m is AboutModule {
  if (typeof m !== 'object' || m === null) return false;
  const o = m as Record<string, unknown>;
  return typeof o.name === 'string' && o.name !== ''
    && typeof o.version === 'string' && o.version !== ''
    && typeof o.license === 'string' && o.license !== '';
}

function isValidContributor(c: unknown): c is AboutContributor {
  if (typeof c !== 'object' || c === null) return false;
  const o = c as Record<string, unknown>;
  return typeof o.name === 'string' && o.name !== ''
    && typeof o.role === 'string'
    && typeof o.url === 'string';
}

export function isValidAboutPayload(p: unknown): p is AboutPayload {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  if (o.type !== 'pkc2-about') return false;
  if (typeof o.version !== 'string' || o.version === '') return false;
  if (typeof o.description !== 'string') return false;

  const build = o.build as Record<string, unknown> | undefined;
  if (typeof build !== 'object' || build === null) return false;
  if (typeof build.timestamp !== 'string' || build.timestamp === '') return false;
  if (typeof build.commit !== 'string' || build.commit === '') return false;
  if (typeof build.builder !== 'string' || build.builder === '') return false;

  const license = o.license as Record<string, unknown> | undefined;
  if (typeof license !== 'object' || license === null) return false;
  if (typeof license.name !== 'string' || license.name === '') return false;
  if (typeof license.url !== 'string') return false;

  const author = o.author as Record<string, unknown> | undefined;
  if (typeof author !== 'object' || author === null) return false;
  if (typeof author.name !== 'string' || author.name === '') return false;
  if (typeof author.url !== 'string') return false;
  if (typeof author.role !== 'string') return false;

  if (typeof o.homepage !== 'string') return false;

  const runtime = o.runtime as Record<string, unknown> | undefined;
  if (typeof runtime !== 'object' || runtime === null) return false;
  if (typeof runtime.offline !== 'boolean') return false;
  if (typeof runtime.bundled !== 'boolean') return false;
  if (typeof runtime.externalDependencies !== 'boolean') return false;

  if (!Array.isArray(o.dependencies)) return false;
  if (!Array.isArray(o.devDependencies)) return false;
  if (!Array.isArray(o.contributors)) return false;

  // `release` is optional (additive since v2.1.0). When present it
  // must be a well-formed shape; callers that need the narrowed
  // content should use `filterValidRelease` afterwards.
  if (o.release !== undefined && !isValidRelease(o.release)) return false;

  return true;
}

function isValidRelease(r: unknown): r is AboutRelease {
  if (typeof r !== 'object' || r === null) return false;
  const o = r as Record<string, unknown>;
  if (!Array.isArray(o.highlights)) return false;
  if (!Array.isArray(o.knownLimitations)) return false;
  if (o.changelog !== undefined && typeof o.changelog !== 'string') return false;
  return true;
}

/**
 * Narrow an `AboutRelease` to the subset of non-empty string bullets.
 * Permissive at parse time — invalid items are filtered rather than
 * rejecting the whole payload, so a malformed bullet cannot disable
 * the About release block.
 */
export function filterValidRelease(r: AboutRelease): AboutRelease {
  return {
    highlights: r.highlights.filter((h): h is string => typeof h === 'string' && h.length > 0),
    knownLimitations: r.knownLimitations.filter(
      (h): h is string => typeof h === 'string' && h.length > 0,
    ),
    ...(typeof r.changelog === 'string' && r.changelog.length > 0
      ? { changelog: r.changelog }
      : {}),
  };
}

export function filterValidModules(modules: unknown[]): AboutModule[] {
  return modules.filter(isValidModule);
}

export function filterValidContributors(contributors: unknown[]): AboutContributor[] {
  return contributors.filter(isValidContributor);
}

export function resolveAboutPayload(body: string | undefined): AboutPayload {
  if (!body) return DEFAULT_ABOUT_STUB;
  try {
    const parsed = JSON.parse(body);
    if (!isValidAboutPayload(parsed)) {
      console.warn('[PKC2] About entry payload invalid, using fallback');
      return DEFAULT_ABOUT_STUB;
    }
    return {
      ...parsed,
      dependencies: filterValidModules(parsed.dependencies),
      devDependencies: filterValidModules(parsed.devDependencies),
      contributors: filterValidContributors(parsed.contributors),
      ...(parsed.release ? { release: filterValidRelease(parsed.release) } : {}),
    };
  } catch {
    console.warn('[PKC2] About entry parse failed');
    return DEFAULT_ABOUT_STUB;
  }
}
