#!/usr/bin/env python3
"""Run the existing npm build gates in a copy with no .env or remote credentials."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[2]
DEST = Path(tempfile.mkdtemp(prefix='marginflow-schema-build-'))
ENV = {k: os.environ[k] for k in ('PATH', 'HOME', 'TMPDIR') if k in os.environ}
ENV.update(VITE_SUPABASE_URL='http://127.0.0.1:55931', VITE_SUPABASE_ANON_KEY='schema-build-placeholder-not-a-credential')
files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=REPO, env=ENV).decode().split('\0')
for name in files:
    if not name or any(p.startswith('.env') for p in Path(name).parts) or name.startswith('node_modules/'):
        continue
    source = REPO / name
    if source.is_symlink():
        raise RuntimeError('Tracked symlink requires review: ' + name)
    if source.is_file():
        target = DEST / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
# Keep Vite's temporary cache in the disposable copy, not the original node_modules.
(DEST / 'node_modules').mkdir()
for entry in (REPO / 'node_modules').iterdir():
    if entry.name.startswith('.vite'):
        continue
    (DEST / 'node_modules' / entry.name).symlink_to(entry.resolve(), target_is_directory=entry.is_dir())
with (DEST / 'validation.log').open('x') as log:
    result = subprocess.run(['npm', 'run', 'build'], cwd=DEST, env=ENV, stdout=log, stderr=subprocess.STDOUT)
for line in (DEST / 'validation.log').read_text().splitlines():
    if any(term in line for term in ('# tests', '# pass', '# fail', 'Data safety', 'Staging/local', 'built in', 'error', 'Error')):
        print(line)
print('Private build evidence:', DEST / 'validation.log')
raise SystemExit(result.returncode)
