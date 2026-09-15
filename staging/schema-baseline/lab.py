#!/usr/bin/env python3
"""Local-only, fixed-identity schema laboratory. Never accepts a database URL."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

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
        # CLI output can include generated credentials. Never persist raw output.
        if LAB.is_dir():
            with (LAB / 'failure.log').open('a') as log:
                log.write(f'{args[0]} {args[1]} failed with exit code {result.returncode}; raw output omitted.\n')
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

def empty(allow_references=False):
    excluded = "AND tablename NOT IN ('plans','features','plan_features','internal_roles','internal_permissions','internal_role_permissions')" if allow_references else ""
    sql(f"""DO $$ DECLARE t record; n bigint; BEGIN
    FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','marginflow') {excluded} LOOP
      EXECUTE format('SELECT count(*) FROM %I.%I',t.schemaname,t.tablename) INTO n;
      IF n <> 0 THEN RAISE EXCEPTION 'Nonempty application table: %.%',t.schemaname,t.tablename; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM storage.objects) THEN RAISE EXCEPTION 'User or stored object found'; END IF;
    IF (SELECT count(*) FROM storage.buckets) <> 1 OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='marginflow-invoice-originals' AND NOT public) THEN RAISE EXCEPTION 'Expected exactly one empty private archive bucket'; END IF;
    END $$;""")

def check_schema():
    owned()
    image = run(['docker', 'inspect', CONTAINER, '--format', '{{.Config.Image}}']).strip()
    if image != MANIFEST['postgresImage']:
        raise RuntimeError('PostgreSQL image differs from the validated image.')
    extensions = json.loads(sql('SELECT json_object_agg(extname,extversion) FROM pg_extension;'))
    if extensions != MANIFEST['expectedExtensions']:
        raise RuntimeError('Managed extension versions differ from the reference.')
    actual = schema()
    if digest(actual.encode()) != MANIFEST['expectedSchemaSha256']:
        (LAB / 'actual-schema.sql').write_text(actual)
        raise RuntimeError('Schema differs from reviewed reference, including ACLs/Auth/Storage. No PASS.')


def reference_snapshot():
    # Include every column, UUID and timestamp to detect any change on repeated seed/test runs.
    values = {}
    for table in MANIFEST['referenceSeed']['expectedCounts']:
        values[table] = json.loads(sql(f"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM public.{table} t;"))
    return values


def reference_sql(mode):
    if mode not in ('seed', 'verify'):
        raise ValueError('Invalid reference mode')
    return ("SET marginflow.staging_reference_seed = 'mf-schema-baseline-84b36ad';\n"
            + f"SET marginflow.reference_mode = '{mode}';\n"
            + (HERE / 'reference-seed.sql').read_text())


def check_references():
    sql(reference_sql('verify'))
    counts = {name: len(rows) for name, rows in reference_snapshot().items()}
    if counts != MANIFEST['referenceSeed']['expectedCounts']:
        raise RuntimeError('Reference counts differ from the reviewed source.')
    return counts


def seed_reference():
    check_schema(); empty(allow_references=True)
    sql(reference_sql('seed'))
    counts = check_references()
    first = reference_snapshot()
    sql(reference_sql('seed'))
    if reference_snapshot() != first:
        raise RuntimeError('Seed is not idempotent: reference rows changed on the second application.')
    check_references(); empty(allow_references=True); check_schema()
    print('PASS: reference seed applied twice; exact rows/UUIDs/timestamps unchanged on repeat: ' + json.dumps(counts, sort_keys=True))


def verify():
    check_schema()
    before = reference_snapshot()
    seeded = any(before.values())
    empty(allow_references=seeded)
    if seeded:
        print('PASS: exact generic reference content/counts: ' + json.dumps(check_references(), sort_keys=True))
    else:
        print('PASS: clean schema baseline; no reference seed applied.')
    sql((HERE / 'cloud-first-test.sql').read_text())
    sql((HERE / 'archive-test.sql').read_text())
    if seeded:
        sql((HERE / 'onboarding-test.sql').read_text())
        print('PASS: synthetic authenticated onboarding, trial/entitlements and outsider rejection; ROLLBACK.')
    empty(allow_references=seeded)
    if reference_snapshot() != before:
        raise RuntimeError('Tests changed reference data.')
    check_schema()
    print('PASS: SQL tests rolled back; zero operational rows/Auth users/Storage objects; schema and references unchanged.')

def create():
    if LAB.exists() or LAB.is_symlink():
        raise RuntimeError('Lab path already exists. Inspect it; this command never resets or overwrites a lab.')
    for kind in ('container', 'volume'):
        if run(['docker', kind, 'ls', '-aq' if kind == 'container' else '-q', '--filter', 'label=com.supabase.cli.project=' + PROJECT]).strip():
            raise RuntimeError('Docker resources with the reserved lab identity already exist.')
    LAB.mkdir(mode=0o700)
    shutil.copytree(HERE / 'supabase', LAB / 'supabase')
    (LAB / 'schema-lab.json').write_text(json.dumps({'project': PROJECT, 'sourceHead': MANIFEST['sourceHead'], 'disposable': True}))
    run(['supabase', '--workdir', str(LAB), 'start', '--exclude', EXCLUDE])
    (LAB / 'start.log').write_text('Local Supabase startup passed. Raw output omitted because it can contain generated credentials.\n')
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
    parser.add_argument('action', choices=['create', 'seed-reference', 'verify', 'destroy'])
    parser.add_argument('--confirm-disposable', action='store_true')
    args = parser.parse_args()
    if args.action == 'destroy' and not args.confirm_disposable:
        parser.error('destroy requires --confirm-disposable; all fictitious lab data will be lost')
    originals(); local_docker()
    {'create': create, 'seed-reference': seed_reference, 'verify': verify, 'destroy': destroy}[args.action]()
