const https = require('https');

const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_KEY;
const GITHUB_PAT       = process.env.GITHUB_PAT;
const REPO             = 'Grame90/nextjs-boilerplate';
const BACKUP_FILE      = 'atletikpro-db.json';

const SECTIONS = ['athletes','coaches','expenses','contacts','documents','social',
  'competitions','inventory','users','coordinators','management','records',
  'licenses','schedule','tracking','raceplan'];

function sbRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const url = new URL(SUPABASE_URL + path);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function ghRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${GITHUB_PAT}`,
        'User-Agent': 'atletikpro-sync',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method === 'GET') {
    const { status, body } = await sbRequest('GET', '/rest/v1/ak_data?select=section,id,data');
    if (status !== 200) { res.status(500).json({ error: 'fetch failed', detail: body }); return; }

    const result = {};
    SECTIONS.forEach(s => result[s] = []);
    (body || []).forEach(row => {
      if (result[row.section] !== undefined) {
        result[row.section].push({ id: row.id, ...row.data });
      }
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.status(200).json(result);
    return;
  }

  if (req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const incoming = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    for (const section of SECTIONS) {
      const items = incoming[section];
      if (!Array.isArray(items)) continue;

      // Get existing IDs for this section
      const { body: existing } = await sbRequest('GET',
        `/rest/v1/ak_data?select=id&section=eq.${encodeURIComponent(section)}`);
      const existingIds = new Set((existing || []).map(r => r.id));
      const newIds = new Set(items.map(i => i.id).filter(Boolean));

      // Delete removed items
      const toDelete = [...existingIds].filter(id => !newIds.has(id));
      if (toDelete.length) {
        const ids = toDelete.map(id => `"${id}"`).join(',');
        await sbRequest('DELETE',
          `/rest/v1/ak_data?section=eq.${encodeURIComponent(section)}&id=in.(${ids})`);
      }

      // Upsert all items
      if (items.length) {
        const rows = items
          .filter(item => item && item.id)
          .map(({ id, ...data }) => ({
            section,
            id,
            data,
            updated_at: new Date().toISOString()
          }));
        if (rows.length) {
          await sbRequest('POST', '/rest/v1/ak_data', rows);
        }
      }
    }

    // Daily backup to GitHub (fire-and-forget)
    if (GITHUB_PAT) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const bkPath = `/repos/${REPO}/contents/backups/atletikpro-${today}.json`;
        const { body: bkBody } = await ghRequest('GET', bkPath);
        const bkSha = bkBody && bkBody.sha ? bkBody.sha : undefined;
        await ghRequest('PUT', bkPath, {
          message: `backup: daily snapshot ${today}`,
          content: Buffer.from(JSON.stringify(incoming)).toString('base64'),
          ...(bkSha ? { sha: bkSha } : {})
        });
      } catch {}
    }

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).end();
};
