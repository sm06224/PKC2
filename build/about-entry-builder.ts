/**
 * about-entry-builder: generates the __about__ entry for release builds.
 *
 * Called by release-builder.ts to create the system-about entry
 * injected into pkc-data. Source of truth: package.json fields
 * (dependencies + devDependencies) with license resolved from each
 * module's node_modules/<name>/package.json.
 *
 * v2.2.0+ release-summary path: hardcoded `RELEASE_SUMMARY` table is
 * replaced by `loadRecentReleases()` which parses
 * `docs/release/CHANGELOG_v*.md` files at build time and surfaces
 * the latest 3 generations into `releases` (newest first).
 * `release` (singular) keeps the legacy backward-compat populated
 * with `releases[0]`.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { loadRecentReleases, type ParsedRelease } from './scripts/parse-changelog';

const ABOUT_LID = '__about__';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const NODE_MODULES = resolve(ROOT, 'node_modules');

interface PkgContributor {
  name?: string;
  role?: string;
  url?: string;
  email?: string;
}

interface PkgJson {
  version: string;
  description?: string;
  license?: string;
  author?: string | { name: string; url?: string; role?: string };
  homepage?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  contributors?: (string | PkgContributor)[];
}

interface AboutModule {
  name: string;
  version: string;
  license: string;
}

interface AboutContributor {
  name: string;
  role: string;
  url: string;
}

// Narrow archetype to the literal `'system-about'` so callers that
// push into a typed `Entry[]` (e.g. manual-builder since Phase 3)
// don't hit a string-widening error. release-builder's inferred
// container literal was unaffected by the previous wider `string`
// typing, and remains unaffected by this narrower one.
interface AboutEntry {
  lid: string;
  title: string;
  body: string;
  archetype: 'system-about';
  created_at: string;
  updated_at: string;
}

function resolveAuthor(pkg: PkgJson): { name: string; url: string; role: string } {
  if (!pkg.author) return { name: 'unknown', url: '', role: '' };
  if (typeof pkg.author === 'string') return { name: pkg.author, url: '', role: '' };
  return {
    name: pkg.author.name,
    url: pkg.author.url ?? '',
    role: pkg.author.role ?? '',
  };
}

function resolveContributors(pkg: PkgJson): AboutContributor[] {
  if (!Array.isArray(pkg.contributors)) return [];
  return pkg.contributors.map((c) => {
    if (typeof c === 'string') return { name: c, role: '', url: '' };
    return {
      name: c.name ?? 'unknown',
      role: c.role ?? '',
      url: c.url ?? '',
    };
  });
}

function stripRange(spec: string): string {
  return spec.replace(/^[\^~>=<\s]+/, '').trim();
}

function readModuleLicense(name: string): string {
  const pkgPath = resolve(NODE_MODULES, name, 'package.json');
  if (!existsSync(pkgPath)) return 'unknown';
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (typeof pkg.license === 'string' && pkg.license) return pkg.license;
    if (typeof pkg.license === 'object' && pkg.license?.type) return pkg.license.type;
    if (Array.isArray(pkg.licenses) && pkg.licenses[0]?.type) return pkg.licenses[0].type;
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function readModuleVersion(name: string, fallback: string): string {
  const pkgPath = resolve(NODE_MODULES, name, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (typeof pkg.version === 'string' && pkg.version) return pkg.version;
    } catch { /* fall through */ }
  }
  return stripRange(fallback);
}

function resolveModules(deps: Record<string, string> | undefined): AboutModule[] {
  if (!deps) return [];
  return Object.entries(deps)
    .map(([name, spec]) => ({
      name,
      version: readModuleVersion(name, spec),
      license: readModuleLicense(name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Repo-relative path of the CHANGELOG directory. The build script
 * runs from the repo root via tsx, so a fixed relative path works
 * for both vite build and direct invocation paths.
 */
const CHANGELOG_DIR = resolve(process.cwd(), 'docs/release');

/**
 * Maximum number of CHANGELOG generations to surface in About.
 * 3 is the user-direction default (2026-05-04) — keeps the About
 * scroll length sane while showing enough context for debug.
 */
const ABOUT_RELEASE_GENERATIONS = 3;

function shapeRelease(parsed: ParsedRelease): {
  version: string;
  highlights: string[];
  knownLimitations: string[];
  changelog: string;
} {
  return {
    version: parsed.version,
    highlights: [...parsed.highlights],
    knownLimitations: [...parsed.knownLimitations],
    changelog: parsed.changelogPath,
  };
}

/**
 * Pick the release block for a given semver from the CHANGELOG
 * snapshot. Returns an empty summary when the version is not in the
 * parsed set (typical for dev builds between tagged releases).
 */
function resolveRelease(
  releases: ParsedRelease[],
  version: string,
): {
  version?: string;
  highlights: string[];
  knownLimitations: string[];
  changelog?: string;
} {
  const hit = releases.find((r) => r.version === version);
  if (!hit) return { highlights: [], knownLimitations: [] };
  return shapeRelease(hit);
}

export function buildAboutEntry(
  pkg: PkgJson,
  buildAt: string,
  sourceCommit: string,
): AboutEntry {
  const author = resolveAuthor(pkg);
  const dependencies = resolveModules(pkg.dependencies);
  const devDependencies = resolveModules(pkg.devDependencies);
  const contributors = resolveContributors(pkg);
  // v2.2.0+: parse all CHANGELOG_v*.md files at build time and pick
  // the latest 3 generations for the About entry's `releases` array.
  // The current-version `release` (singular) is also populated for
  // backward-compat with v2.1.x About readers.
  const recentReleases = loadRecentReleases(CHANGELOG_DIR, ABOUT_RELEASE_GENERATIONS);
  const releases = recentReleases.map(shapeRelease);
  const release = resolveRelease(recentReleases, pkg.version);

  const payload = {
    type: 'pkc2-about' as const,
    version: pkg.version,
    description: pkg.description ?? '',
    build: {
      timestamp: buildAt,
      commit: sourceCommit,
      builder: 'vite+release-builder',
    },
    license: {
      name: pkg.license ?? 'unknown',
      url: pkg.homepage ? `${pkg.homepage}/blob/main/LICENSE` : '',
    },
    author: {
      name: author.name,
      url: author.url || (pkg.homepage ?? ''),
      role: author.role,
    },
    homepage: pkg.homepage ?? '',
    runtime: {
      offline: true,
      bundled: true,
      externalDependencies: false,
    },
    dependencies,
    devDependencies,
    contributors,
    release,
    releases,
  };

  return {
    lid: ABOUT_LID,
    title: 'About PKC2',
    body: JSON.stringify(payload),
    archetype: 'system-about',
    created_at: buildAt,
    updated_at: buildAt,
  };
}
