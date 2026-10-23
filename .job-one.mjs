import pg from 'pg';

const c = new pg.Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55322/postgres' });
await c.connect();

const byId = await c.query(
  `select id, type, status, ref_id, created_at, finished_at, meta from public.jobs where id = 'b812bd66-f2e7-4dc2-959b-67fe6ffe9138'`,
);
console.log('by id:', byId.rows);

const covers = await c.query(`select count(*)::int as n from public.jobs where type = 'cover'`);
console.log('cover jobs total:', covers.rows[0].n);

const newest = await c.query(
  `select id, type, status, created_at from public.jobs where type = 'cover' order by created_at desc limit 3`,
);
console.table(newest.rows);

const cols = await c.query(
  `select column_name, column_default, is_nullable from information_schema.columns where table_name='jobs' and column_name in ('created_at','updated_at')`,
);
console.table(cols.rows);

await c.end();
