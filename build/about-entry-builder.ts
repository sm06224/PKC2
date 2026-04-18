/**
 * about-entry-builder: generates the __about__ entry for release builds.
 *
 * Called by release-builder.ts to create the system-about entry
 * injected into pkc-data. Source of truth: package.json fields.
 */

const ABOUT_LID = '__about__';

const MODULES_TO_REPORT = ['markdown-it'];

interface PkgJson {
  version: string;
  license?: string;
  author?: string | { name: string; url?: string };
  homepage?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface AboutEntry {
  lid: string;
  title: string;
  body: string;
  archetype: string;
  created_at: string;
  updated_at: string;
}

function resolveAuthor(pkg: PkgJson): { name: string; url: string } {
  if (!pkg.author) return { name: 'unknown', url: '' };
  if (typeof pkg.author === 'string') return { name: pkg.author, url: '' };
  return { name: pkg.author.name, url: pkg.author.url ?? '' };
}

function resolveModules(pkg: PkgJson): { name: string; version: string; license: string }[] {
  const deps = pkg.dependencies ?? {};
  return MODULES_TO_REPORT
    .filter((name) => name in deps)
    .map((name) => ({
      name,
      version: (deps[name] ?? '').replace(/^[\^~]/, ''),
      license: 'MIT',
    }));
}

export function buildAboutEntry(
  pkg: PkgJson,
  buildAt: string,
  sourceCommit: string,
): AboutEntry {
  const author = resolveAuthor(pkg);
  const modules = resolveModules(pkg);

  const payload = {
    type: 'pkc2-about' as const,
    version: pkg.version,
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
      url: pkg.homepage ?? '',
    },
    runtime: {
      offline: true,
      bundled: true,
      externalDependencies: false,
    },
    modules,
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
