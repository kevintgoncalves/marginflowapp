// Build through all package gates, using only the isolated lab configuration.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const lab = '/private/tmp/marginflow-safety-lab';
const keys = JSON.parse(readFileSync(`${lab}/local-status.json`, 'utf8'));
if (!keys.ANON_KEY || keys.API_URL !== 'http://127.0.0.1:55431') throw new Error('Expected isolated loopback Supabase status');
const result = spawnSync('npm', ['run', 'build'], { cwd: `${lab}/app`, stdio: 'inherit', env: { PATH: process.env.PATH, HOME: `${lab}/home`, VITE_SUPABASE_URL: 'http://127.0.0.1:55439', VITE_SUPABASE_ANON_KEY: keys.ANON_KEY } });
process.exitCode = result.status ?? 1;
