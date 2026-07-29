// =============================================================================
// ESLINT CONFIG (flat config)
// =============================================================================
// Next 16 removed the `next lint` command, so linting now runs ESLint directly
// (`npm run lint` -> `eslint .`). That command needs a config file to exist,
// which is why this one does — before it, `npm run lint` silently did nothing.
//
// The rules come straight from eslint-config-next, same set `next lint` used to
// apply: core-web-vitals (React/Next correctness + perf) plus the TypeScript
// rules.
// =============================================================================

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const config = [
  {
    // Build output, vendored copies and the separate Expo app are not ours to
    // lint. `.claude/worktrees` holds full clones of this repo — without this
    // every finding would be reported twice.
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'node_modules/**',
      'public/**',
      'mobile/**',
      '.claude/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    // Plain Node scripts and the Next config run as CommonJS, so `require()` is
    // correct there — the TypeScript ESM rule does not apply to them.
    files: ['scripts/**/*.js', '*.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];

export default config;
