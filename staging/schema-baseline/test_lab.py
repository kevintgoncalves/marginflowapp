import importlib.util
import json
from pathlib import Path
import tempfile
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

if __name__ == '__main__':
    unittest.main()
