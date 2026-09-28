// Test-only fault injection proxy. Both listen and upstream are fixed loopback addresses.
import http from 'node:http';
import { readFileSync, appendFileSync } from 'node:fs';
const base = '/private/tmp/marginflow-safety-lab';
http.createServer((req, res) => {
  const origin = ['http://127.0.0.1:5187', 'http://127.0.0.1:5188'].includes(req.headers.origin) ? req.headers.origin : 'http://127.0.0.1:5187';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,prefer,range,range-unit,x-supabase-api-version,accept-profile,content-profile');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS,HEAD');
  res.setHeader('Access-Control-Expose-Headers', 'content-range');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let mode = 'online'; try { mode = readFileSync(`${base}/network-mode`, 'utf8').trim(); } catch {}
  const invoiceWrite = req.url.startsWith('/rest/v1/rpc/persist_invoice_document');
  const cloudRead = req.method === 'GET' && req.url.startsWith('/rest/v1/');
  const record = status => appendFileSync(`${base}/requests.jsonl`, JSON.stringify({ at: new Date().toISOString(), method: req.method, path: req.url.split('?')[0], mode, status })+'\n');
  if (mode === 'offline' || (mode === 'fail-write' && invoiceWrite) || (mode === 'fail-reads' && cloudRead) || (mode === 'fail-snapshot' && req.url.startsWith('/rest/v1/marginflow_cloud_state'))) {
    record(503); res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'Safety lab: simulated connection interruption' })); return;
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: 55431, path: req.url, method: req.method, headers: { ...req.headers, host: '127.0.0.1:55431' } }, response => {
    record(response.statusCode);
    if (mode === 'lost-ack' && invoiceWrite) { response.resume(); res.destroy(); return; }
    const headers = { ...response.headers }; delete headers['access-control-allow-origin'];
    res.writeHead(response.statusCode, headers); response.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Local test backend unavailable'); });
  req.pipe(upstream);
}).listen(55439, '127.0.0.1', () => console.log('Lab proxy: 127.0.0.1:55439 -> 127.0.0.1:55431'));
