BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format('SELECT %L, count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), %L ORDER BY to_jsonb(t)::text), %L)) FROM %I.%I t;', schemaname||'.'||tablename, '', '', schemaname, tablename)
FROM pg_tables WHERE schemaname='public' ORDER BY tablename
\gexec
DO $$
DECLARE fk record; bad bigint; predicate text; nonnull text;
BEGIN
 FOR fk IN SELECT * FROM pg_constraint WHERE contype='f' AND connamespace IN ('public'::regnamespace,'storage'::regnamespace,'auth'::regnamespace) LOOP
  SELECT string_agg(format('c.%I = p.%I',ca.attname,pa.attname),' AND '), string_agg(format('c.%I IS NOT NULL',ca.attname),' AND ')
  INTO predicate,nonnull
  FROM unnest(fk.conkey,fk.confkey) AS pair(cnum,pnum)
  JOIN pg_attribute ca ON ca.attrelid=fk.conrelid AND ca.attnum=pair.cnum
  JOIN pg_attribute pa ON pa.attrelid=fk.confrelid AND pa.attnum=pair.pnum;
  EXECUTE format('SELECT count(*) FROM %s c WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)',fk.conrelid::regclass,nonnull,fk.confrelid::regclass,predicate) INTO bad;
  IF bad <> 0 THEN RAISE EXCEPTION 'Foreign key % has % orphan rows',fk.conname,bad; END IF;
 END LOOP;
END $$;
COMMIT;
