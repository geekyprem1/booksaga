import { spawn } from 'node:child_process';

const tag = process.argv[2] ?? 'local';
if (!/^[a-zA-Z0-9_.-]+$/.test(tag)) throw new Error('Invalid image tag');
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}
for (const target of ['web', 'worker']) {
  const args = ['build', '-f', `docker/Dockerfile.${target}`, '-t', `booksaga-${target}:${tag}`];
  if (target === 'web') {
    for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'])
      args.push('--build-arg', `${key}=${process.env[key]}`);
  }
  args.push('.');
  await new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${target} image build failed (${code})`)),
    );
  });
}
