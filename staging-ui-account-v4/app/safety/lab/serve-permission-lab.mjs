import {readFileSync} from 'node:fs';import {spawn} from 'node:child_process';
const lab='/private/tmp/marginflow-permissions-lab',keys=JSON.parse(readFileSync(lab+'/local-status.json'));
if(keys.API_URL!=='http://127.0.0.1:55631')throw Error('Refusing non-lab endpoint');
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',process.argv.includes('--second')?'5192':'5191'],{cwd:lab+'/app',stdio:'inherit',env:{PATH:process.env.PATH,HOME:lab+'/home',VITE_SUPABASE_URL:'http://127.0.0.1:55639',VITE_SUPABASE_ANON_KEY:keys.ANON_KEY}});
child.on('exit',code=>process.exitCode=code);
