const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = 8080;
const DIR       = __dirname;
const DATA_FILE = path.join(__dirname, 'data.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

// ── data.json helpers ──
function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { coaches:[], athletes:[], expenses:[], contacts:[], documents:[], social:[] }; }
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

const SECTIONS = ['coaches','athletes','expenses','contacts','documents','social'];

const server = http.createServer(async (req, res) => {
  const url  = req.url.split('?')[0];
  const method = req.method;

  // CORS (for bot running locally)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── GET /api/all ── return entire data.json
  if (url === '/api/all' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readData()));
    return;
  }

  // ── POST /api/all ── save full snapshot from web app
  if (url === '/api/all' && method === 'POST') {
    const body = await parseBody(req);
    const current = readData();
    // Merge: for each section, union by id (web app wins for existing, keep bot additions)
    SECTIONS.forEach(sec => {
      if (!Array.isArray(body[sec])) return;
      const webItems = body[sec];
      const webIds   = new Set(webItems.map(i => i.id));
      const botOnly  = (current[sec] || []).filter(i => !webIds.has(i.id));
      current[sec]   = [...webItems, ...botOnly];
    });
    writeData(current);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── GET /api/:section ── return section array
  const getMatch = url.match(/^\/api\/([a-z]+)$/);
  if (getMatch && method === 'GET') {
    const sec = getMatch[1];
    if (!SECTIONS.includes(sec)) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readData()[sec] || []));
    return;
  }

  // ── POST /api/:section ── add single item (used by bot)
  const postMatch = url.match(/^\/api\/([a-z]+)$/);
  if (postMatch && method === 'POST') {
    const sec = postMatch[1];
    if (!SECTIONS.includes(sec)) { res.writeHead(404); res.end('Not found'); return; }
    const item = await parseBody(req);
    if (!item || !item.id) { res.writeHead(400); res.end('Bad request'); return; }
    const data = readData();
    data[sec] = data[sec] || [];
    // avoid duplicates
    if (!data[sec].find(i => i.id === item.id)) data[sec].push(item);
    writeData(data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, item }));
    return;
  }

  // ── DELETE /api/:section/:id ──
  const delMatch = url.match(/^\/api\/([a-z]+)\/(.+)$/);
  if (delMatch && method === 'DELETE') {
    const [, sec, id] = delMatch;
    if (!SECTIONS.includes(sec)) { res.writeHead(404); res.end('Not found'); return; }
    const data = readData();
    data[sec] = (data[sec] || []).filter(i => i.id !== id);
    writeData(data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── Static files ──
  const filePath = path.join(DIR, url === '/' ? 'index.html' : url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ✅  Сервер запущен!');
  console.log(`      http://localhost:${PORT}`);
  console.log('');
  console.log('  🤖  Запустить бота:  node bot.js');
  console.log('  🛑  Остановить:      Ctrl + C');
  console.log('');
});
