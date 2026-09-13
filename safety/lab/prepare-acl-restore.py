# Generates a reviewable ACL restoration script only; does not apply SQL. Fixed lab containers.
import subprocess,json,pathlib
source='supabase_db_marginflow-safety-phase1-lab';target='supabase_db_marginflow-safety-restore'
q="""SELECT coalesce(json_agg(t),'[]') FROM (
SELECT n.nspname AS schema,c.relname AS name,CASE WHEN c.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END AS kind,
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS role,a.privilege_type,a.is_grantable,'' AS args
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a
WHERE n.nspname='public' AND c.relkind IN ('r','S','v','m')
UNION ALL
SELECT n.nspname,p.proname,'FUNCTION',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable,pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
WHERE n.nspname='public')t"""
def read(c):return json.loads(subprocess.check_output(['docker','exec',c,'psql','-U','postgres','-X','-At','-c',q]))
def keyed(rows):return {(r['schema'],r['name'],r['kind'],r['role'],r['privilege_type'],r['is_grantable'],r['args']) for r in rows}
def quote(s):return '"'+s.replace('"','""')+'"'
a,b=keyed(read(source)),keyed(read(target));sql=['BEGIN;']
for schema,name,kind,role,priv,grantable,args in sorted(b-a):
 sql.append(f'REVOKE {priv} ON {kind} {quote(schema)}.{quote(name)}{("("+args+")") if kind=="FUNCTION" else ""} FROM {"PUBLIC" if role=="PUBLIC" else quote(role)};')
for schema,name,kind,role,priv,grantable,args in sorted(a-b):
 sql.append(f'GRANT {priv} ON {kind} {quote(schema)}.{quote(name)}{("("+args+")") if kind=="FUNCTION" else ""} TO {"PUBLIC" if role=="PUBLIC" else quote(role)}'+(' WITH GRANT OPTION' if grantable else '')+';')
sql.append('COMMIT;')
with pathlib.Path('/private/tmp/marginflow-safety-lab/backup-v2/exact-source-acl-new.sql').open('x') as out: out.write('\n'.join(sql)+'\n')
print('Prepared exact source ACL restoration:',len(b-a),'surplus grants removed,',len(a-b),'source grants restored')
