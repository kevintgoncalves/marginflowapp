import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('schema_lab', Path(__file__).with_name('lab.py'))
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

class LocalOnlyGuards(unittest.TestCase):
    def test_remote_docker_rejected_before_cli(self):
        with patch.object(lab, 'run', return_value=json.dumps([{'Endpoints': {'docker': {'Host': 'tcp://remote:2376'}}}])) as run:
            with self.assertRaisesRegex(RuntimeError, 'local Unix'):
                lab.local_docker()
            self.assertEqual(run.call_count, 1)

    def test_destroy_without_marker_never_invokes_cli(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(lab, 'LAB', Path(folder)), patch.object(lab, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'marker'):
                lab.destroy()
            run.assert_not_called()

    def test_existing_directory_never_reset(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(lab, 'LAB', Path(folder)), patch.object(lab, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'already exists'):
                lab.create()
            run.assert_not_called()

    def test_linked_lab_refused(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(lab, 'LAB', Path(folder)):
            root = Path(folder)
            (root/'supabase/.temp').mkdir(parents=True)
            (root/'schema-lab.json').write_text(json.dumps({'project': lab.PROJECT, 'sourceHead': lab.MANIFEST['sourceHead'], 'disposable': True}))
            (root/'supabase/config.toml').write_bytes((lab.HERE/'supabase/config.toml').read_bytes())
            (root/'supabase/.temp/project-ref').write_text('synthetic-forbidden-ref')
            with self.assertRaisesRegex(RuntimeError, 'Linked project'):
                lab.owned()

    def test_credentials_not_in_child_environment(self):
        self.assertLessEqual(set(lab.ENV), {'PATH', 'HOME', 'TMPDIR'})

    def test_original_and_artifact_integrity(self):
        lab.originals()

    def test_seed_stops_before_sql_when_target_unowned(self):
        with patch.object(lab, 'check_schema', side_effect=RuntimeError('unowned')), patch.object(lab, 'sql') as sql:
            with self.assertRaisesRegex(RuntimeError, 'unowned'):
                lab.seed_reference()
            sql.assert_not_called()

    def test_seed_stops_before_insert_on_operational_data(self):
        with patch.object(lab, 'check_schema'), patch.object(lab, 'empty', side_effect=RuntimeError('operational')), patch.object(lab, 'sql') as sql:
            with self.assertRaisesRegex(RuntimeError, 'operational'):
                lab.seed_reference()
            sql.assert_not_called()

    def test_unknown_reference_mode_rejected(self):
        with self.assertRaises(ValueError):
            lab.reference_sql('anything-else')

    def test_generic_values_match_original_source_blocks(self):
        lines=(lab.REPO/'supabase/migrations/20260813090000_saas_foundation_4a.sql').read_text().splitlines()
        expected='\n'.join(lines[129:192])+'\n\n'+'\n'.join(lines[274:344])
        for table in sorted(lab.MANIFEST['referenceSeed']['expectedCounts'],key=len,reverse=True):
            expected=expected.replace('public.'+table,'pg_temp.ref_'+table)
        self.assertIn(expected,(lab.HERE/'reference-seed.sql').read_text())

    def test_failure_logs_do_not_persist_raw_cli_output(self):
        result=SimpleNamespace(returncode=1,stdout='sensitive-output-sentinel',stderr='sensitive-error-sentinel')
        with tempfile.TemporaryDirectory() as folder, patch.object(lab,'LAB',Path(folder)), patch.object(lab.subprocess,'run',return_value=result):
            with self.assertRaises(RuntimeError):
                lab.run(['supabase','start'])
            content=(Path(folder)/'failure.log').read_text()
            self.assertNotIn('sensitive-output-sentinel',content)
            self.assertNotIn('sensitive-error-sentinel',content)

if __name__ == '__main__':
    unittest.main()
