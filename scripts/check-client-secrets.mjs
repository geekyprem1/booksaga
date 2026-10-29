import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = 'apps/web/.next/static';
const privateKeys = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEXT_API_KEY',
  'OPENROUTER_API_KEY',
  'REPLICATE_API_TOKEN',
  'SETTINGS_ENCRYPTION_KEY',
];
const values = privateKeys.flatMap((name) =>
  process.env[name]?.length > 8 ? [{ name, value: process.env[name] }] : [],
);
if (!values.some(({ name }) => name === 'SUPABASE_SERVICE_ROLE_KEY'))
  throw new Error('Load a server env file to check actual secrets.');
let checked = 0;
const leaks = [];
async function walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(?:js|json|map)$/.test(entry.name)) {
      const source = await readFile(path, 'utf8');
      checked++;
      for (const { name, value } of values)
        if (source.includes(value)) leaks.push(`${name}: ${relative(root, path)}`);
    }
  }
}
await walk(root);
if (leaks.length) throw new Error(`Private values found in browser bundles:\n${leaks.join('\n')}`);
console.log(`Checked ${checked} browser assets: no configured private secret values found.`);
