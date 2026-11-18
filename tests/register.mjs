// Lets `node --test` import the project's TypeScript directly:
//   node --import ./tests/register.mjs --test tests/xero-sync.test.mjs
// Node strips the types itself; this only teaches it the project's import
// style (no file extension, and "@/" for the repo root).
import { register } from 'node:module';
register('./ts-resolve.mjs', import.meta.url);
