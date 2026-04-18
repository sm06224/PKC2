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
  };
  homepage: string;
  runtime: {
    offline: boolean;
    bundled: boolean;
    externalDependencies: boolean;
  };
  dependencies: AboutModule[];
  devDependencies: AboutModule[];
}

export interface AboutModule {
  name: string;
  version: string;
  license: string;
}

export const DEFAULT_ABOUT_STUB: AboutPayload = {
  type: 'pkc2-about',
  version: 'unknown',
  description: '',
  build: { timestamp: 'unknown', commit: 'unknown', builder: 'unknown' },
  license: { name: 'unknown', url: '' },
  author: { name: 'unknown', url: '' },
  homepage: '',
  runtime: { offline: true, bundled: true, externalDependencies: false },
  dependencies: [],
  devDependencies: [],
};

function isValidModule(m: unknown): m is AboutModule {
  if (typeof m !== 'object' || m === null) return false;
  const o = m as Record<string, unknown>;
  return typeof o.name === 'string' && o.name !== ''
    && typeof o.version === 'string' && o.version !== ''
    && typeof o.license === 'string' && o.license !== '';
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

  if (typeof o.homepage !== 'string') return false;

  const runtime = o.runtime as Record<string, unknown> | undefined;
  if (typeof runtime !== 'object' || runtime === null) return false;
  if (typeof runtime.offline !== 'boolean') return false;
  if (typeof runtime.bundled !== 'boolean') return false;
  if (typeof runtime.externalDependencies !== 'boolean') return false;

  if (!Array.isArray(o.dependencies)) return false;
  if (!Array.isArray(o.devDependencies)) return false;

  return true;
}

export function filterValidModules(modules: unknown[]): AboutModule[] {
  return modules.filter(isValidModule);
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
    };
  } catch {
    console.warn('[PKC2] About entry parse failed');
    return DEFAULT_ABOUT_STUB;
  }
}
