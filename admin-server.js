import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PHOTOS_DIR = path.join(__dirname, 'src/content/photos');
const PORT = 3333;

function readPhotos() {
  return fs.readdirSync(PHOTOS_DIR)
    .filter(f => f.endsWith('.yaml'))
    .map(file => {
      const content = fs.readFileSync(path.join(PHOTOS_DIR, file), 'utf8');
      const data = yaml.load(content);
      return { file, ...data };
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function savePhoto(file, updates) {
  const filePath = path.join(PHOTOS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const data = yaml.load(content);
  Object.assign(data, updates);
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1 }));
}

function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const obj = {};
      for (const [k, v] of params) obj[k] = v;
      resolve(obj);
    });
  });
}

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, sans-serif; background: #050b1a; color: #edf4ff; padding: 2rem; }
  h1 { font-size: 1.4rem; margin-bottom: 1.5rem; color: #748fff; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
  .card { background: #0f1f3d; border: 1px solid #243a65; border-radius: 0.8rem; padding: 1rem; }
  .thumb { width: 100%; aspect-ratio: 3/2; object-fit: cover; border-radius: 0.5rem; margin-bottom: 0.75rem; }
  .title { font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem; }
  .meta { font-size: 0.78rem; color: #9fb2d4; margin-bottom: 0.75rem; }
  a.edit { display: inline-block; padding: 0.35rem 0.9rem; background: #748fff22; border: 1px solid #748fff55; border-radius: 999px; color: #748fff; font-size: 0.8rem; text-decoration: none; }
  a.edit:hover { background: #748fff33; }
  form label { display: block; font-size: 0.8rem; color: #9fb2d4; margin-bottom: 0.3rem; margin-top: 1rem; }
  form input, form textarea { width: 100%; background: #050b1a; border: 1px solid #243a65; border-radius: 0.5rem; color: #edf4ff; padding: 0.5rem 0.75rem; font-size: 0.9rem; font-family: inherit; }
  form textarea { min-height: 80px; resize: vertical; }
  form input:focus, form textarea:focus { outline: none; border-color: #748fff; }
  .hint { font-size: 0.72rem; color: #9fb2d4; margin-top: 0.25rem; }
  .actions { margin-top: 1.5rem; display: flex; gap: 0.75rem; align-items: center; }
  button[type=submit] { padding: 0.5rem 1.4rem; background: #748fff; border: none; border-radius: 999px; color: #050b1a; font-weight: 600; font-size: 0.9rem; cursor: pointer; }
  button[type=submit]:hover { background: #9fb2ff; }
  a.back { color: #9fb2d4; font-size: 0.85rem; text-decoration: none; }
  a.back:hover { color: #edf4ff; }
  .saved { background: #1a3d1a; border: 1px solid #2d6b2d; border-radius: 0.5rem; padding: 0.75rem 1rem; margin-bottom: 1.5rem; font-size: 0.85rem; color: #7aff7a; }
`;

function listPage(photos, saved) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Admin Photos</title><style>${CSS}</style></head><body>
  <h1>Admin — ${photos.length} photos</h1>
  ${saved ? `<div class="saved">✓ "${saved}" sauvegardée.</div>` : ''}
  <div class="grid">
    ${photos.map(p => `
      <div class="card">
        <img class="thumb" src="${p.url}" alt="${p.title}" onerror="this.style.display='none'">
        <div class="title">${p.title}</div>
        <div class="meta">
          ${p.tags?.length ? p.tags.map(t => `#${t}`).join(' ') : '<em>pas de tags</em>'}<br>
          ${p.description ? p.description.slice(0, 60) + (p.description.length > 60 ? '…' : '') : '<em>pas de description</em>'}
        </div>
        <a class="edit" href="/edit/${p.file}">Modifier →</a>
      </div>
    `).join('')}
  </div>
</body></html>`;
}

function editPage(photo, file) {
  const tags = Array.isArray(photo.tags) ? photo.tags.join(', ') : (photo.tags || '');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Modifier — ${photo.title}</title><style>${CSS}</style></head><body>
  <a class="back" href="/">← Retour</a>
  <h1 style="margin-top:1rem">${photo.title}</h1>
  ${photo.url ? `<img class="thumb" src="${photo.url}" alt="${photo.title}" style="max-width:400px;margin:1rem 0">` : ''}
  <form method="POST" action="/save/${file}">
    <label>Description</label>
    <textarea name="description">${photo.description || ''}</textarea>
    <label>Tags <span class="hint">séparés par des virgules</span></label>
    <input name="tags" value="${tags}" placeholder="lyon, sport, portrait">
    <label>Appareil photo</label>
    <input name="exif_camera" value="${photo.exif?.camera || ''}">
    <label>Objectif</label>
    <input name="exif_lens" value="${photo.exif?.lens || ''}">
    <label>Réglages (ex: f/2.8 1/500s)</label>
    <input name="exif_settings" value="${photo.exif?.settings || ''}">
    <label>ISO</label>
    <input name="exif_iso" value="${photo.exif?.iso || ''}">
    <label>Note interne (0–5)</label>
    <input name="rating" type="number" min="0" max="5" step="0.1" value="${photo.rating || ''}">
    <div class="actions">
      <button type="submit">Sauvegarder</button>
      <a class="back" href="/">Annuler</a>
    </div>
  </form>
</body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/') {
    const saved = url.searchParams.get('saved');
    const photos = readPhotos();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(listPage(photos, saved));

  } else if (req.method === 'GET' && url.pathname.startsWith('/edit/')) {
    const file = path.basename(url.pathname.replace('/edit/', ''));
    const filePath = path.join(PHOTOS_DIR, file);
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
    const photo = yaml.load(fs.readFileSync(filePath, 'utf8'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(editPage(photo, file));

  } else if (req.method === 'POST' && url.pathname.startsWith('/save/')) {
    const file = path.basename(url.pathname.replace('/save/', ''));
    const body = await parseBody(req);
    const tags = body.tags ? body.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const updates = {
      description: body.description || undefined,
      tags,
      rating: body.rating ? parseFloat(body.rating) : undefined,
      exif: {
        camera: body.exif_camera || undefined,
        lens: body.exif_lens || undefined,
        settings: body.exif_settings || undefined,
        iso: body.exif_iso || undefined,
      }
    };
    // Clean up empty exif
    if (!Object.values(updates.exif).some(Boolean)) delete updates.exif;
    savePhoto(file, updates);
    const photo = yaml.load(fs.readFileSync(path.join(PHOTOS_DIR, file), 'utf8'));
    res.writeHead(302, { Location: `/?saved=${encodeURIComponent(photo.title)}` });
    res.end();

  } else {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n  Admin photos → http://localhost:${PORT}\n`);
});
