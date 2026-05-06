const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GITHUB_PAT   = process.env.GITHUB_PAT;
const REPO         = 'Grame90/nextjs-boilerplate';

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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async function(event) {
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  // ── List backups from GitHub
  if (method === 'GET' && params.action === 'backups') {
    if (!GITHUB_PAT) return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'GitHub PAT not configured' }) };
    const { status, body } = await ghRequest('GET', `/repos/${REPO}/contents/backups`);
    if (status !== 200) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'GitHub error', detail: body }) };
    const files = (Array.isArray(body) ? body : [])
      .filter(f => f.name.endsWith('.json'))
      .map(f => ({ name: f.name, date: f.name.replace('atletikpro-','').replace('.json',''), sha: f.sha, size: f.size }))
      .sort((a, b) => b.date.localeCompare(a.date));
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(files) };
  }

  // ── Get specific backup content from GitHub
  if (method === 'GET' && params.action === 'backup' && params.date) {
    if (!GITHUB_PAT) return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'GitHub PAT not configured' }) };
    const path = `/repos/${REPO}/contents/backups/atletikpro-${params.date}.json`;
    const { status, body } = await ghRequest('GET', path);
    if (status !== 200) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Backup not found' }) };
    const content = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(content) };
  }

  if (method === 'GET') {
    const { status, body } = await sbRequest('GET', '/rest/v1/ak_data?select=section,id,data&limit=10000');
    if (status !== 200) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'fetch failed', detail: body }) };
    }

    const result = {};
    SECTIONS.forEach(s => result[s] = []);
    (body || []).forEach(row => {
      if (result[row.section] !== undefined) {
        result[row.section].push({ id: row.id, ...row.data });
      }
    });

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
      body: JSON.stringify(result)
    };
  }

  if (method === 'POST') {
    const incoming = JSON.parse(event.body || '{}');

    for (const section of SECTIONS) {
      const items = incoming[section];
      if (!Array.isArray(items)) continue;

      const { body: existing } = await sbRequest('GET',
        `/rest/v1/ak_data?select=id&section=eq.${encodeURIComponent(section)}`);
      const existingIds = new Set((existing || []).map(r => r.id));
      const newIds = new Set(items.map(i => i.id).filter(Boolean));

      const toDelete = [...existingIds].filter(id => !newIds.has(id));
      if (toDelete.length) {
        const ids = toDelete.map(id => `"${id}"`).join(',');
        await sbRequest('DELETE',
          `/rest/v1/ak_data?section=eq.${encodeURIComponent(section)}&id=in.(${ids})`);
      }

      if (items.length) {
        const rows = items
          .filter(item => item && item.id)
          .map(({ id, ...data }) => ({
            section, id, data,
            updated_at: new Date().toISOString()
          }));
        if (rows.length) {
          await sbRequest('POST', '/rest/v1/ak_data', rows);
        }
      }
    }

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

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, headers: CORS, body: '' };
};
