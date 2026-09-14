#!/usr/bin/env python3
"""Local-only, fixed-identity schema laboratory. Never accepts a database URL."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
PROJECT = 'mf-schema-baseline-84b36ad'
LAB = Path('/tmp').resolve() / 'marginflow-schema-baseline-lab-84b36ad'
CONTAINER = 'supabase_db_' + PROJECT
EXCLUDE = 'studio,logflare,vector,edge-runtime,imgproxy'
ENV = {k: os.environ[k] for k in ('PATH', 'HOME', 'TMPDIR') if k in os.environ}
MANIFEST = json.loads((HERE / 'manifest.json').read_text())

def digest(data):
    return hashlib.sha256(data).hexdigest()

def run(args, *, data=None, cwd=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True, env=ENV, cwd=cwd)
    if result.returncode:
        # CLI startup logs may contain local keys. Keep full output only in the private lab.
        if LAB.is_dir():
            with (LAB / 'failure.log').open('a') as log:
                log.write(result.stdout + result.stderr)
        raise RuntimeError(f'{args[0]} {args[1]} failed ({result.returncode}); inspect {LAB}/failure.log')
    return result.stdout

def originals():
    paths = sorted((REPO / 'supabase/migrations').glob('*.sql'))
    actual = {p.name: digest(p.read_bytes()) for p in paths}
    if len(paths) != 44 or actual != MANIFEST['originalMigrations']:
        raise RuntimeError('Original migration paths/checksums differ. Stop; do not regenerate the manifest.')
    for name, expected in MANIFEST['artifacts'].items():
        if digest((HERE / name).read_bytes()) != expected:
            raise RuntimeError('Artifact checksum mismatch: ' + name)
    print('PASS: 44 original paths and SHA-256 hashes unchanged; staging artifacts verified.')

def local_docker():
    # Ignore all inherited DB/API credentials and Docker overrides. Reject remote contexts.
    endpoint = json.loads(run(['docker', 'context', 'inspect']))[0]['Endpoints']['docker']['Host']
    if not endpoint.startswith('unix://'):
        raise RuntimeError('Only a local Unix Docker socket is allowed.')
    if run(['supabase', '--version']).strip() != MANIFEST['cliVersion']:
        raise RuntimeError('CLI version differs from the validated version.')

def owned():
    marker = LAB / 'schema-lab.json'
    expected = {'project': PROJECT, 'sourceHead': MANIFEST['sourceHead'], 'disposable': True}
    if LAB.is_symlink() or not marker.is_file() or json.loads(marker.read_text()) != expected:
        raise RuntimeError('Missing or invalid disposable laboratory marker.')
    if (LAB / 'supabase/config.toml').read_bytes() != (HERE / 'supabase/config.toml').read_bytes():
        raise RuntimeError('Lab config differs; refusing to act on another target.')
    if (LAB / 'supabase/.temp/project-ref').exists():
        raise RuntimeError('Linked project detected; local-only operation refused.')

def sql(query):
    return run(['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-XAt', '-v', 'ON_ERROR_STOP=1'], data=query)

def schema():
    text = run(['docker', 'exec', CONTAINER, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--schema=public', '--schema=marginflow', '--schema=auth', '--schema=storage'])
    lines = [l for l in text.splitlines() if l.strip() and not l.startswith(('--', '\\restrict', '\\unrestrict'))]
    # ACL array order is irrelevant; definitions, ownership and default privileges remain exact.
    grants = sorted(l for l in lines if l.startswith(('GRANT ', 'REVOKE ')))
    return '\n'.join([l for l in lines if not l.startswith(('GRANT ', 'REVOKE '))] + grants) + '\n'

def empty():
    sql("""DO $$ DECLARE t record; n bigint; BEGIN
    FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','marginflow') LOOP
      EXECUTE format('SELECT count(*) FROM %I.%I',t.schemaname,t.tablename) INTO n;
      IF n <> 0 THEN RAISE EXCEPTION 'Nonempty application table: %.%',t.schemaname,t.tablename; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM storage.objects) THEN RAISE EXCEPTION 'User or stored object found'; END IF;
    IF (SELECT count(*) FROM storage.buckets) <> 1 OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='marginflow-invoice-originals' AND NOT public) THEN RAISE EXCEPTION 'Expected exactly one empty private archive bucket'; END IF;
    END $$;""")

def verify():
    owned()
    image = run(['docker', 'inspect', CONTAINER, '--format', '{{.Config.Image}}']).strip()
    if image != MANIFEST['postgresImage']:
        raise RuntimeError('PostgreSQL image differs from the validated image.')
    extensions = json.loads(sql('SELECT json_object_agg(extname,extversion) FROM pg_extension;'))
    if extensions != MANIFEST['expectedExtensions']:
        raise RuntimeError('Managed extension versions differ from the reference.')
    empty()
    actual = schema()
    if digest(actual.encode()) != MANIFEST['expectedSchemaSha256']:
        (LAB / 'actual-schema.sql').write_text(actual)
        raise RuntimeError('Schema differs from reviewed reference, including ACLs/Auth/Storage. No PASS.')
    print('PASS: exact normalized schema/ACL match; all application tables, Auth users and Storage objects empty.')
    sql((HERE / 'cloud-first-test.sql').read_text())
    sql((HERE / 'archive-test.sql').read_text())
    empty()
    if digest(schema().encode()) != MANIFEST['expectedSchemaSha256']:
        raise RuntimeError('Tests changed the schema.')
    print('PASS: cloud-first integration and archive RLS tests; transactions rolled back; empty state rechecked.')

def create():
    if LAB.exists() or LAB.is_symlink():
        raise RuntimeError('Lab path already exists. Inspect it; this command never resets or overwrites a lab.')
    for kind in ('container', 'volume'):
        if run(['docker', kind, 'ls', '-aq' if kind == 'container' else '-q', '--filter', 'label=com.supabase.cli.project=' + PROJECT]).strip():
            raise RuntimeError('Docker resources with the reserved lab identity already exist.')
    LAB.mkdir(mode=0o700)
    shutil.copytree(HERE / 'supabase', LAB / 'supabase')
    (LAB / 'schema-lab.json').write_text(json.dumps({'project': PROJECT, 'sourceHead': MANIFEST['sourceHead'], 'disposable': True}))
    result = run(['supabase', '--workdir', str(LAB), 'start', '--exclude', EXCLUDE])
    (LAB / 'start.log').write_text(result)
    print('PASS: clean Supabase replay completed at ' + str(LAB))
    verify()

def destroy():
    owned()
    # Supported CLI cleanup, scoped to this one disposable project; never --all.
    run(['supabase', '--workdir', str(LAB), 'stop', '--project-id', PROJECT, '--no-backup'])
    shutil.rmtree(LAB)
    print('Removed only the marked disposable schema lab and its volumes.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['create', 'verify', 'destroy'])
    parser.add_argument('--confirm-disposable', action='store_true')
    args = parser.parse_args()
    if args.action == 'destroy' and not args.confirm_disposable:
        parser.error('destroy requires --confirm-disposable; all fictitious lab data will be lost')
    originals(); local_docker()
    {'create': create, 'verify': verify, 'destroy': destroy}[args.action]()
