#!/usr/bin/env node
// Regenerates packages/db-types/src/database.ts from the LOCAL Supabase database.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, 'packages/db-types/src/database.ts');

const sql = execSync('supabase gen types typescript --local --schema public', {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
writeFileSync(target, sql);
console.log(`Wrote ${target}`);
