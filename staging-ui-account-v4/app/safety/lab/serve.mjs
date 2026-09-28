import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const lab = '/private/tmp/marginflow-safety-lab';
const keys = JSON.parse(readFileSync(`${lab}/local-status.json`, 'utf8'));
const anon = keys.ANON_KEY;
if (!anon || keys.API_URL !== 'http://127.0.0.1:55431') throw new Error('Expected isolated loopback Supabase status');
const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(process.argv.includes('--built') ? ['preview'] : []), '--port', process.argv.includes('--second') ? '5188' : '5187'], {
 cwd: `${lab}/app`, stdio: 'inherit',
 env: { PATH: process.env.PATH, HOME: `${lab}/home`, VITE_SUPABASE_URL: 'http://127.0.0.1:55439', VITE_SUPABASE_ANON_KEY: anon }
});
child.on('exit', code => { process.exitCode = code; });
