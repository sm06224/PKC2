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

interface AboutEntry {
  lid: string;
  title: string;
  body: string;
  archetype: string;
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

export function buildAboutEntry(
  pkg: PkgJson,
  buildAt: string,
  sourceCommit: string,
): AboutEntry {
  const author = resolveAuthor(pkg);
  const dependencies = resolveModules(pkg.dependencies);
  const devDependencies = resolveModules(pkg.devDependencies);
  const contributors = resolveContributors(pkg);

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
