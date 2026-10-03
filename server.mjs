import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const html = await readFile(join(__dirname, 'public', 'index.html'));

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
    res.end(JSON.stringify({ok:true, system:'metatility-vs', version:'0.4.0', persistence:'supabase'}));
    return;
  }
  if (req.url === '/' || req.url?.startsWith('/?')) {
    res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(html);
    return;
  }
  res.writeHead(404, {'content-type':'text/plain; charset=utf-8'});
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => console.log(`Metatility VS v0.4 listening on ${PORT}`));
