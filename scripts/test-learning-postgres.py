"""New local database per run. Schema only, synthetic rows; never resets any DB."""
import datetime, json, pathlib, subprocess
root = pathlib.Path(__file__).resolve().parents[1]
container = 'supabase_db_marginflow'
database = 'mf_learning_test_' + datetime.datetime.now().strftime('%Y%m%d%H%M%S')
output = root / '.local-review' / database
output.mkdir(parents=True, mode=0o700)
def run(args, data=None):
    return subprocess.run(args, input=data, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
endpoint = run(['docker','context','inspect','--format','{{.Endpoints.docker.Host}}']).decode().strip()
assert endpoint.startswith('unix://'), 'Remote Docker context refused'
labels = json.loads(run(['docker','inspect','--format','{{json .Config.Labels}}',container]))
assert labels.get('com.supabase.cli.project') == 'marginflow', 'Wrong local container'
psql = ['docker','exec','-i',container,'psql','-X','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1']
schema = run(['docker','exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only'])
(output/'schema.sql').write_bytes(schema)
run(['docker','exec',container,'createdb','-U','supabase_admin','-T','template0',database])
try:
    (output/'restore.log').write_bytes(run(psql+['--single-transaction'],schema))
    files = ['supabase/migrations/20260929230000_scoped_learning_confirmation.sql'] + [
        'supabase/tests/learning_staging_'+name+'.sql' for name in ['fixture','persistence','reopen','invoice']]
    for name in files:
        (output/(pathlib.Path(name).stem+'.log')).write_bytes(run(psql,(root/name).read_bytes()))
    print('PASS: migration, rollback, acknowledgement, split history, reconnect, restaurant/non-member isolation, invoice retry.')
    print('Local synthetic database preserved: '+database)
    print('Evidence: '+str(output))
except subprocess.CalledProcessError as e:
    (output/'failure.log').write_bytes(e.stderr)
    print('FAIL. New test database preserved. See '+str(output/'failure.log'))
    raise SystemExit(1)
