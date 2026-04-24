/**
 * about-entry-builder: generates the __about__ entry for release builds.
 *
 * Called by release-builder.ts to create the system-about entry
 * injected into pkc-data. Source of truth: package.json fields
 * (dependencies + devDependencies) with license resolved from each
 * module's node_modules/<name>/package.json.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

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
 * Release summary for the current user-visible version.
 *
 * Source of truth for the About view's highlights / known-limitations
 * block(v2.1.0+). Kept as a build-time constant so a stale dist/
 * HTML can still surface the summary offline without network or
 * runtime fetch. Full detail lives in
 * `docs/release/CHANGELOG_v<version>.md`; keep bullets short and
 * user-facing here.
 *
 * When bumping the semver, update this block together with the
 * CHANGELOG doc — `docs/development/versioning-policy.md` §3 codifies
 * the rule that About summary and changelog must stay in sync.
 */
const RELEASE_SUMMARY = {
  '2.1.0': {
    highlights: [
      'Link system: Copy link / paste conversion / External Permalink receive',
      'Tags: entry tags, Tag filter, Saved Search tag persistence, `tag:` parser',
      'Storage Profile: asset bytes + body bytes breakdown',
      'UI continuity: scroll / focus / caret restore, folder collapse persistence',
      'Data correctness: orphan asset cleanup persistence, IDB asset delete diff',
      'Relation / tree safety: structural cycle display rescue + reducer guard',
    ],
    knownLimitations: [
      'Link migration tool is designed (spec v1) but not implemented',
      'Card / embed presentation is not implemented yet',
      'Color tag is spec-only — implementation deferred to a future wave',
      'Cross-container resolver / P2P is not implemented',
      'OS protocol handler for `pkc://` is not implemented',
      'Full container footprint (body + relations + revisions) is not implemented — Storage Profile is asset-only',
    ],
    changelog: 'docs/release/CHANGELOG_v2.1.0.md',
  },
} as const;

/**
 * Look up the `release` block for a given semver. Falls back to an
 * empty summary when the version is not in `RELEASE_SUMMARY` (typical
 * for dev builds between tagged releases). We still emit the field
 * so consumers can count on the shape.
 */
function resolveRelease(version: string): {
  highlights: string[];
  knownLimitations: string[];
  changelog?: string;
} {
  const hit = (RELEASE_SUMMARY as Record<string, {
    highlights: readonly string[];
    knownLimitations: readonly string[];
    changelog: string;
  } | undefined>)[version];
  if (!hit) return { highlights: [], knownLimitations: [] };
  return {
    highlights: [...hit.highlights],
    knownLimitations: [...hit.knownLimitations],
    ...(hit.changelog ? { changelog: hit.changelog } : {}),
  };
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
  const release = resolveRelease(pkg.version);

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
