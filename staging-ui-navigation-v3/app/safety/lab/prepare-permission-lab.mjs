// Code-only test copy. No production configuration or archived datasets are copied.
import {execFileSync} from 'node:child_process';import {mkdirSync,existsSync,copyFileSync,writeFileSync,symlinkSync,renameSync} from 'node:fs';import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),lab='/private/tmp/marginflow-permissions-lab',app=lab+'/app';
if(existsSync(app+'/src/labourSeedData.js')){
 mkdirSync(lab+'/quarantined-code',{recursive:true,mode:0o700});
 renameSync(app+'/src/labourSeedData.js',lab+'/quarantined-code/'+Date.now()+'-labourSeedData.js');
}
for(const name of execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean)){
 if(name==='vite.config.js'||name.split('/').some(p=>p.startsWith('.env')||p==='.git'||p==='.temp')||!existsSync(resolve(root,name)))continue;
 mkdirSync(dirname(resolve(app,name)),{recursive:true});copyFileSync(resolve(root,name),resolve(app,name));
}
mkdirSync(lab+'/home',{recursive:true});if(!existsSync(app+'/node_modules'))symlinkSync(root+'/node_modules',app+'/node_modules');
writeFileSync(app+'/vite.config.js',`import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';export default defineConfig({plugins:[react()],envDir:'${lab}/no-env',server:{host:'127.0.0.1',strictPort:true,headers:{'Content-Security-Policy':"connect-src 'self' http://127.0.0.1:55639 ws://127.0.0.1:5191 ws://127.0.0.1:5192; object-src 'none'; form-action 'self'"}}});`);
console.log('Prepared code-only permission lab.');
