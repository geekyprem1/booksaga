-- BookSaga 0004: reference data required in EVERY environment (local + production).
-- Inserted with ON CONFLICT DO NOTHING so later admin edits are never overwritten.
-- Source of truth in code: packages/shared/src/plans.ts and credits.ts (a DB test keeps them in sync).

insert into public.plans
  (code, name, level, is_downsell, price_usd, limits, grant_main_credits, grant_audio_credits, grant_agency_credits)
values
  ('fe',        'BookSaga Basic',       'FE',   false, 17.00,
    '{"maxSeries":3,"maxBooksPerSeries":5,"lengthPresets":["short","standard"]}'::jsonb, 300, 0, 0),
  ('oto1_lite', 'Unlimited Lite',       'OTO1', true,  27.00,
    '{"maxSeries":25,"maxBooksPerSeries":30,"lengthPresets":["short","standard","full"],"paperbackWrap":true,"boxSets":true}'::jsonb, 1000, 0, 0),
  ('oto1',      'Unlimited',            'OTO1', false, 47.00,
    '{"maxSeries":null,"maxBooksPerSeries":30,"lengthPresets":["short","standard","full"],"paperbackWrap":true,"boxSets":true}'::jsonb, 3000, 0, 0),
  ('oto2_lite', 'Done-For-You Lite',    'OTO2', true,  17.00,
    '{"templatesTier":"lite","dfyPacks":"lite"}'::jsonb, 0, 0, 0),
  ('oto2',      'Done-For-You',         'OTO2', false, 37.00,
    '{"templatesTier":"full","dfyPacks":"full"}'::jsonb, 0, 0, 0),
  ('oto3_lite', 'Audiobook Lite',       'OTO3', true,  27.00,
    '{"audiobook":true}'::jsonb, 0, 300, 0),
  ('oto3',      'Audiobook',            'OTO3', false, 47.00,
    '{"audiobook":true}'::jsonb, 0, 1000, 0),
  ('oto4_lite', 'Agency Lite',          'OTO4', true,  47.00,
    '{"maxClients":25}'::jsonb, 0, 0, 2000),
  ('oto4',      'Agency',               'OTO4', false, 67.00,
    '{"maxClients":100}'::jsonb, 0, 0, 5000),
  ('oto5_lite', 'Reseller Lite',        'OTO5', true,  67.00,
    '{"maxResellLicenses":50,"franchiseKit":true}'::jsonb, 0, 0, 0),
  ('oto5',      'Reseller + Franchise', 'OTO5', false, 97.00,
    '{"maxResellLicenses":100,"franchiseKit":true}'::jsonb, 0, 0, 0)
on conflict (code) do nothing;

insert into public.credit_costs (action, credits, pool)
values
  ('book_short',    10, 'main'),
  ('book_standard', 20, 'main'),
  ('book_full',     35, 'main'),
  ('cover',          2, 'main'),
  ('enhance',        1, 'main'),
  ('rewrite',        1, 'main'),
  ('metadata',       1, 'main'),
  ('arc_extend',     1, 'main'),
  ('audiobook',     15, 'audio')
on conflict (action) do nothing;

insert into public.app_settings (key, value)
values
  ('app',          '{"name":"BookSaga","support_email":"","support_url":""}'::jsonb),
  ('email',        '{"enabled":false}'::jsonb),
  ('integrations', '{"warriorplus":{"enabled":false},"jvzoo":{"enabled":false}}'::jsonb),
  ('maintenance',  '{"enabled":false,"message":""}'::jsonb),
  ('upgrade_urls', '{}'::jsonb),
  ('limits',       '{"daily_book_cap":10}'::jsonb),
  ('reseller_customer_main_credits', '100'::jsonb)
on conflict (key) do nothing;
