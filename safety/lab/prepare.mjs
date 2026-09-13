// Copies code only. Never imports .env, a linked project, or existing customer data.
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lab = '/private/tmp/marginflow-safety-lab';
const app = resolve(lab, 'app');
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
for (const name of paths) {
  if (name === 'vite.config.js') continue;
  if (name.split('/').some(p => p.startsWith('.env') || p === '.git' || p === '.temp')) continue;
  const dest = resolve(app, name);
  mkdirSync(dirname(dest), { recursive: true });
  if (!existsSync(dest) || !readFileSync(dest).equals(readFileSync(resolve(root, name)))) copyFileSync(resolve(root, name), dest);
}
mkdirSync(resolve(lab, 'home'), { recursive: true });
if (!existsSync(resolve(app, 'node_modules'))) symlinkSync(resolve(root, 'node_modules'), resolve(app, 'node_modules'));
// Fixed loopback target; CSP rejects external API connections, including AI calls.
writeFileSync(resolve(app, 'vite.config.js'), `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], envDir: '/private/tmp/marginflow-safety-lab/no-env',
preview: { host: '127.0.0.1', strictPort: true, headers: { 'Content-Security-Policy': "connect-src 'self' http://127.0.0.1:55439; form-action 'self'; object-src 'none'" } },
server: { host: '127.0.0.1', port: 5187, strictPort: true,
headers: { 'Content-Security-Policy': "connect-src 'self' http://127.0.0.1:55439 ws://127.0.0.1:5187; form-action 'self'; object-src 'none'" } } });\n`);
console.log(`Code copied to ${app}. No production configuration copied. Start only with the lab runner.`);
