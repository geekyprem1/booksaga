import pg from 'pg';

const c = new pg.Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55322/postgres' });
await c.connect();

for (let i = 0; i < 20; i++) {
  const { rows } = await c.query(
    `select id, status, left(coalesce(error,''),200) as error, created_at, finished_at
     from public.jobs where type = 'cover' order by created_at desc limit 1`,
  );
  const job = rows[0];
  console.log(new Date().toISOString().slice(11, 19), job.status, job.error ? `ERR: ${job.error}` : '', job.created_at);
  if (job.status === 'completed' || job.status === 'failed') break;
  await new Promise((r) => setTimeout(r, 5000));
}

const covers = await c.query(
  `select id, is_active, created_at from public.covers order by created_at desc limit 4`,
);
console.table(covers.rows);

await c.end();
