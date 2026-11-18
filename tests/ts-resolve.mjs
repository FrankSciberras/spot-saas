import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

export async function resolve(specifier, context, next) {
  const isAlias = specifier.startsWith('@/');
  if (isAlias || specifier.startsWith('.')) {
    const base = isAlias
      ? resolvePath(root, specifier.slice(2))
      : resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolvePath(base, 'index.ts')]) {
      if (existsSync(candidate) && !candidate.endsWith('/')) {
        try {
          return await next(pathToFileURL(candidate).href, context);
        } catch {
          /* try the next candidate */
        }
      }
    }
  }
  return next(specifier, context);
}
