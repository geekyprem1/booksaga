import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Local development keeps one shared env file at the repo root (written by `pnpm env:local`).
// Next.js only reads env files from apps/web, so load the root one here. Variables that are
// already set (CI, Docker, production) always win.
const rootEnv = resolve(process.cwd(), '../../.env.local');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  output: 'standalone',
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    '@booksaga/shared',
    '@booksaga/db-types',
    '@booksaga/core',
    '@booksaga/exporters',
  ],
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: '12mb' } },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
