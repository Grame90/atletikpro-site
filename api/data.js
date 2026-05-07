const https = require('https');

const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_KEY;
const GITHUB_PAT       = process.env.GITHUB_PAT;
const REPO             = 'Grame90/nextjs-boilerplate';
const BACKUP_FILE      = 'atletikpro-db.json';

const SECTIONS = ['athletes','coaches','expenses','contacts','documents','social',
  'competitions','inventory','users','coordinators','management','records',
  'licenses','schedule','tracking','raceplan'];

const VALID_SECTIONS = new Set(SECTIONS);
const MAX_BODY_BYTES  = 10 * 1024 * 1024; // 10 MB
const MAX_ITEMS       = 5000;             // per section

function validatePost(incoming) {
  // 1. Must be a plain object
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return 'Body must be a JSON object';
  }
  for (const [section, items] of Object.entries(incoming)) {
    // 2. Only known sections allowed
    if (!VALID_SECTIONS.has(section)) {
      return `Unknown section: "${section}"`;
    }
    if (!Array.isArray(items)) continue;
    // 3. Reasonable item count
    if (items.length > MAX_ITEMS) {
      return `Section "${section}" exceeds ${MAX_ITEMS} items (got ${items.length})`;
    }
    // 4. Every item must have a non-empty string id
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || typeof item !== 'object') {
        return `Section "${section}", item #${i}: must be an object`;
      }
      if (typeof item.id !== 'string' || !item.id.trim()) {
        return `Section "${section}", item #${i}: missing or invalid id`;
      }
    }
  }
  // 5. Never allow wiping all users (would lock everyone out)
  if (Array.isArray(incoming.users) && incoming.users.length === 0) {
    return 'Cannot delete all users — at least one must remain';
  }
  return null; // valid
}

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

function sbStorageUpload(filePath, buffer, contentType, bucket) {
  bucket = bucket || 'photos';
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Content-Type': contentType || 'image/jpeg',
        'Content-Length': buffer.length,
        'x-upsert': 'true'
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
    req.write(buffer);
    req.end();
  });
}

async function ensurePhotoBucket() {
  const { status } = await sbRequest('GET', '/storage/v1/bucket/photos');
  if (status !== 200) {
    await sbRequest('POST', '/storage/v1/bucket', {
      id: 'photos', name: 'photos', public: true,
      file_size_limit: 5242880
    });
  }
}

async function ensureDocsBucket() {
  const { status } = await sbRequest('GET', '/storage/v1/bucket/documents');
  if (status !== 200) {
    await sbRequest('POST', '/storage/v1/bucket', {
      id: 'documents', name: 'documents', public: true,
      file_size_limit: 20971520
    });
  }
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

function httpsGet(url, redirects) {
  if ((redirects || 0) > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(httpsGet(res.headers.location, (redirects || 0) + 1));
        } else {
          resolve({ status: res.statusCode, text: d });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function parseWaHtml(html) {
  try {
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return null;
    const root = JSON.parse(m[1]);
    const c = root?.props?.pageProps?.competitor;
    if (!c) return null;
    const out = {};
    const bd = c.basicData;
    if (bd) {
      if (bd.birthDate) {
        // WA may return "DD MON YYYY" or ISO "YYYY-MM-DD" — normalize to ISO
        const d = new Date(bd.birthDate);
        out.bdate = isNaN(d) ? bd.birthDate : d.toISOString().slice(0, 10);
      }
      if (bd.countryCode) out.country = bd.countryCode;
      if (bd.givenName || bd.familyName) out.fullName = [bd.givenName, bd.familyName].filter(Boolean).join(' ');
    }
    const pb = c.personalBests?.results;
    if (Array.isArray(pb) && pb.length) {
      out.personalBests = pb.map(r => ({
        event: r.discipline,
        mark: r.mark,
        date: r.date,
        venue: r.venue
      }));
    }
    if (Array.isArray(c.honours) && c.honours.length) {
      out.honours = c.honours.map(h => ({
        category: h.categoryName,
        competition: h.competitionName,
        event: h.disciplineName,
        place: h.place,
        year: h.year
      }));
    }
    return out;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method === 'GET') {
    const urlObj = new URL(req.url, 'http://localhost');
    if (urlObj.searchParams.get('action') === 'wa_fetch') {
      const waUrl = urlObj.searchParams.get('url') || '';
      try {
        const u = new URL(waUrl);
        if (!u.hostname.includes('worldathletics.org')) {
          res.status(400).json({ error: 'Only worldathletics.org URLs allowed' }); return;
        }
        const { status, text } = await httpsGet(waUrl);
        if (status !== 200) {
          res.status(404).json({ error: 'WA page not found', status }); return;
        }
        const parsed = parseWaHtml(text);
        res.status(200).json({ ok: !!parsed, parsed });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
      return;
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      res.status(503).json({ error: 'Server env vars not configured' }); return;
    }
    const { status, body } = await sbRequest('GET', '/rest/v1/ak_data?select=section,id,data&limit=10000');
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
    const urlObj = new URL(req.url, 'http://localhost');

    // ── Photo upload to Supabase Storage ──────────────────────────────────
    if (urlObj.searchParams.get('action') === 'upload_photo') {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        res.status(503).json({ error: 'Server env vars not configured' }); return;
      }
      let body;
      try {
        if (req.body !== undefined) {
          body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        } else {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        }
      } catch { res.status(400).json({ error: 'Invalid JSON' }); return; }

      const { base64, filename } = body || {};
      if (!base64) { res.status(400).json({ error: 'Missing base64 field' }); return; }

      const match = base64.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) { res.status(400).json({ error: 'Invalid base64 format' }); return; }

      const contentType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 5 * 1024 * 1024) {
        res.status(413).json({ error: 'Photo too large (max 5 MB)' }); return;
      }

      try {
        await ensurePhotoBucket();
        const safeFile = (filename || 'photo').replace(/[^a-z0-9._-]/gi, '_').slice(0, 80);
        const filePath = `${Date.now()}-${safeFile}`;
        const { status, body: uploadBody } = await sbStorageUpload(filePath, buffer, contentType);
        if (status !== 200 && status !== 201) {
          res.status(500).json({ error: 'Storage upload failed', detail: uploadBody }); return;
        }
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/photos/${filePath}`;
        res.status(200).json({ ok: true, url: publicUrl });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
      return;
    }
    // ── Document upload to Supabase Storage ──────────────────────────────
    if (urlObj.searchParams.get('action') === 'upload_document') {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        res.status(503).json({ error: 'Server env vars not configured' }); return;
      }
      let body;
      try {
        if (req.body !== undefined) {
          body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        } else {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        }
      } catch { res.status(400).json({ error: 'Invalid JSON' }); return; }

      const { base64, filename } = body || {};
      if (!base64) { res.status(400).json({ error: 'Missing base64 field' }); return; }

      const match = base64.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) { res.status(400).json({ error: 'Invalid base64 format' }); return; }

      const contentType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 20 * 1024 * 1024) {
        res.status(413).json({ error: 'File too large (max 20 MB)' }); return;
      }

      try {
        await ensureDocsBucket();
        const safeFile = (filename || 'document').replace(/[^a-z0-9._-]/gi, '_').slice(0, 120);
        const filePath = `${Date.now()}-${safeFile}`;
        const { status, body: uploadBody } = await sbStorageUpload(filePath, buffer, contentType, 'documents');
        if (status !== 200 && status !== 201) {
          res.status(500).json({ error: 'Storage upload failed', detail: uploadBody }); return;
        }
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/documents/${filePath}`;
        res.status(200).json({ ok: true, url: publicUrl });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        res.status(413).json({ error: `Request too large (max ${MAX_BODY_BYTES / 1024 / 1024} MB)` }); return;
      }
      chunks.push(chunk);
    }

    let incoming;
    try {
      // vercel dev pre-parses JSON body into req.body; production uses raw stream
      if (req.body !== undefined) {
        incoming = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } else {
        incoming = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      }
    } catch {
      res.status(400).json({ error: 'Invalid JSON' }); return;
    }

    const validationError = validatePost(incoming);
    if (validationError) {
      res.status(400).json({ error: validationError }); return;
    }

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
