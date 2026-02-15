/**
 * resolveRuntime.js — Locate the friday-runtime package directory.
 *
 * Tries three strategies in order:
 *   1. import.meta.resolve('friday-runtime/stdio')  — uses exports map
 *   2. createRequire().resolve('friday-runtime/package.json') — CJS fallback
 *   3. Monorepo relative path — for local development
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _runtimeDir;

try {
  const stdioUrl = import.meta.resolve('friday-runtime/stdio');
  _runtimeDir = path.dirname(fileURLToPath(stdioUrl));
} catch {
  try {
    const require = createRequire(import.meta.url);
    const runtimePkg = require.resolve('friday-runtime/package.json');
    _runtimeDir = path.dirname(runtimePkg);
  } catch {
    _runtimeDir = path.resolve(__dirname, '..', '..', 'runtime');
  }
}

export const runtimeDir = _runtimeDir;
