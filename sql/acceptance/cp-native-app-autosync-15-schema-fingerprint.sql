-- CP15: metadata only; excludes stored rows, credentials, owner ACLs and extensions.
WITH cols AS (
 SELECT n.nspname||'.'||c.relname||'.'||a.attname||':'||
   format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||
   coalesce(pg_get_expr(d.adbin,d.adrelid),'') AS s
 FROM pg_attribute a
 JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname IN ('auth','public','private') AND c.relkind='r'
  AND a.attnum>0 AND NOT a.attisdropped
),
constraints AS (
 SELECT n.nspname||'.'||c.relname||'.'||con.conname||':'||
 pg_get_constraintdef(con.oid) AS s
 FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','private','auth')
),
functions AS (
 SELECT n.nspname||'.'||p.proname||':'||pg_get_functiondef(p.oid) AS s
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private','auth')
),
rls AS (
 SELECT n.nspname||'.'||c.relname||':'||c.relrowsecurity||':'||
  c.relforcerowsecurity AS s
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','private','auth') AND c.relkind='r'
)
SELECT
 (SELECT md5(string_agg(s,E'\n' ORDER BY s)) FROM cols) AS columns_md5,
 (SELECT md5(string_agg(s,E'\n' ORDER BY s)) FROM constraints) AS constraints_md5,
 (SELECT md5(string_agg(s,E'\n' ORDER BY s)) FROM functions) AS functions_md5,
 (SELECT md5(string_agg(s,E'\n' ORDER BY s)) FROM rls) AS rls_md5;
