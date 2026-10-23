import pg from 'pg';

const c = new pg.Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55322/postgres' });
await c.connect();

const jobs = await c.query(`
  select id, type, status, left(coalesce(error,''), 400) as error, created_at
  from public.jobs
  order by created_at desc limit 6
`);
console.table(jobs.rows);

const usage = await c.query(`
  select purpose, provider, model, round(cost_usd::numeric,6) as cost, created_at
  from public.ai_usage_log order by created_at desc limit 5
`);
console.table(usage.rows);

await c.end();
