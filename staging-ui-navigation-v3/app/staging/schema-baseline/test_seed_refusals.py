"""Negative integration tests against the marked local lab; all changes roll back."""
import importlib.util
from pathlib import Path
import subprocess

spec = importlib.util.spec_from_file_location('lab', Path(__file__).with_name('lab.py'))
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)
lab.originals(); lab.local_docker(); lab.check_schema(); lab.check_references()
before = lab.reference_snapshot()
body = lab.reference_sql('seed').replace('\nBEGIN;\n', '\n', 1)
assert body.endswith('COMMIT;\n')
body = body[:-len('COMMIT;\n')]
cases = [
    ('changed value', "UPDATE public.plans SET name='Synthetic forbidden drift' WHERE slug='pro';", 'Reference drift or partial seed'),
    ('partial references', "DELETE FROM public.internal_role_permissions WHERE role_key='billing' AND permission_key='plans.view';", 'Reference drift or partial seed'),
    ('Auth user present', "INSERT INTO auth.users(id,email) VALUES ('13000000-0000-4000-8000-000000000001','seed-refusal@example.test');", 'Auth users or Storage objects found'),
]
for name, mutation, expected in cases:
    # Never COMMIT, even if a regression accidentally accepts the invalid state.
    query = 'BEGIN;\n' + mutation + '\n' + body + '\nROLLBACK;\n'
    result = subprocess.run(['docker', 'exec', '-i', lab.CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-XAt', '-v', 'ON_ERROR_STOP=1'],input=query,text=True,capture_output=True,env=lab.ENV)
    if result.returncode != 3 or expected not in result.stderr:
        raise RuntimeError('Expected seed refusal did not occur: ' + name)
    if lab.reference_snapshot() != before:
        raise RuntimeError('Negative test changed persistent references')
    lab.empty(allow_references=True)
    print('PASS: seed refused ' + name + '; transaction rolled back.')
lab.check_schema(); lab.check_references()
