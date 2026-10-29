import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const tag = process.argv[2] ?? 'container-check';
const generationE2e = process.argv.includes('--e2e');
if (!/^[a-zA-Z0-9_.-]+$/.test(tag)) throw new Error('Invalid image tag');
const suffix = `${process.pid}-${Date.now()}`;
const network = `booksaga-check-${suffix}`;
const names = { redis: `${network}-redis`, web: `${network}-web`, worker: `${network}-worker` };
const created = [];
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
docker('network', 'create', network);
try {
  docker('run', '-d', '--name', names.redis, '--network', network, 'redis:7-alpine');
  created.push(names.redis);
  for (const target of ['web', 'worker']) {
    const args = [
      'run',
      '-d',
      '--name',
      names[target],
      '--network',
      network,
      '--env-file',
      '.env.local',
      '-e',
      'NODE_ENV=production',
      '-e',
      'AI_MODE=mock',
      '-e',
      'NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:55321',
      '-e',
      `REDIS_URL=redis://${names.redis}:6379`,
      '-e',
      'APP_URL=https://booksaga.invalid',
    ];
    if (target === 'web') args.push('-p', '127.0.0.1:3200:3000');
    // Exclude the reaper queue so a disposable Redis cannot recover unrelated local jobs.
    if (target === 'worker') {
      args.push('-e', 'WORKER_QUEUES=text,image,export,audio', '--shm-size=1g');
      if (generationE2e) args.push('-p', '127.0.0.1:3301:3001');
    }
    args.push(`booksaga-${target}:${tag}`);
    docker(...args);
    created.push(names[target]);
  }
  let web;
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch('http://127.0.0.1:3200/api/healthz');
      if (response.ok) {
        web = {
          status: response.status,
          ...(await response.json()),
          hsts: response.headers.get('strict-transport-security'),
          frame: response.headers.get('x-frame-options'),
          nonceCsp: response.headers.get('content-security-policy')?.includes("'nonce-"),
        };
        break;
      }
    } catch {
      /* container is still starting */
    }
    await pause(500);
  }
  if (!web?.db || !web.redis || !web.nonceCsp || web.frame !== 'DENY' || !web.hsts)
    throw new Error('Web readiness/security headers failed');
  const login = await fetch('http://127.0.0.1:3200/login');
  if (!login.ok || !(await login.text()).includes('Sign in'))
    throw new Error('Standalone login render failed');
  let worker;
  for (let i = 0; i < 40; i++) {
    try {
      worker = JSON.parse(
        docker(
          'exec',
          names.worker,
          'node',
          '-e',
          "fetch('http://127.0.0.1:3001/healthz').then(async r=>{if(!r.ok)process.exit(1);console.log(JSON.stringify(await r.json()))}).catch(()=>process.exit(1))",
        ),
      );
      if (worker.ok) break;
    } catch {
      /* TypeScript worker imports can take longer than standalone web startup. */
    }
    await pause(500);
  }
  if (!worker?.ok || worker.aiMode !== 'mock') throw new Error('Worker startup/readiness failed');
  const files = JSON.parse(
    docker(
      'exec',
      names.web,
      'node',
      '-e',
      "const fs=require('node:fs');console.log(JSON.stringify(['/app/.env.local','/app/.env.production','/app/apps/web/.env.local'].map(p=>fs.existsSync(p))))",
    ),
  );
  if (files.some(Boolean)) throw new Error('An env file was copied into the image');
  if (generationE2e) {
    execFileSync(
      process.execPath,
      [
        resolve('apps/web/node_modules/@playwright/test/cli.js'),
        'test',
        'e2e/create-series.spec.ts',
        'e2e/roadmap.spec.ts',
        '--workers=1',
      ],
      {
        cwd: resolve('apps/web'),
        windowsHide: true,
        stdio: 'inherit',
        env: {
          ...process.env,
          AI_MODE: 'mock',
          APP_URL: 'http://localhost:3200',
          E2E_NO_SERVER: '1',
          NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321',
          WORKER_HEALTH_URL: 'http://127.0.0.1:3301/healthz',
        },
      },
    );
  }
  const report = {
    date: new Date().toISOString(),
    tag,
    web,
    standaloneLogin: true,
    workerStartupWithFencing: true,
    envFilesExcluded: true,
    paidGeneration: false,
    mockGenerationE2e: generationE2e,
    passed: true,
  };
  await writeFile('docs/CONTAINER_CHECK_REPORT.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  for (const name of created.filter((name) => name !== names.redis)) {
    try {
      execFileSync('docker', ['logs', '--tail', '20', name], {
        stdio: 'inherit',
        windowsHide: true,
      });
    } catch {
      /* preserve original failure */
    }
  }
  throw error;
} finally {
  for (const name of created.reverse()) {
    try {
      docker('rm', '-f', name);
    } catch {
      /* report cleanup errors through Docker only */
    }
  }
  docker('network', 'rm', network);
}
