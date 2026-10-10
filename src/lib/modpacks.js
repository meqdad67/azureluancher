/** Modrinth modpack search/install + import of .mrpack / CurseForge .zip packs. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const P = require('./paths');
const store = require('./store');
const { getJSON, download, UA } = require('./net');

const MR = 'https://api.modrinth.com/v2';
const CF = 'https://api.curseforge.com/v1';
const enc = encodeURIComponent;

async function search({ query = '', offset = 0, sort = 'relevance' }) {
  const facets = enc(JSON.stringify([['project_type:modpack']]));
  const r = await getJSON(`${MR}/search?query=${enc(query)}&limit=20&offset=${offset}&index=${sort}&facets=${facets}`);
  return { total: r.total_hits, hits: r.hits.map((h) => ({ source: 'modrinth', id: h.project_id, title: h.title, description: h.description, icon: h.icon_url, downloads: h.downloads, author: h.author })) };
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}
function safeJoin(base, rel) {
  const p = path.resolve(base, rel);
  if (!p.startsWith(path.resolve(base) + path.sep)) throw new Error('unsafe path in modpack');
  return p;
}
function newInstance(name, mc, loader, lv, full) {
  const d = store.get();
  const inst = {
    id: crypto.randomBytes(5).toString('hex'), name: String(name || 'Modpack').slice(0, 40), mcVersion: mc,
    mcType: /^\d+\.\d+(\.\d+)?$/.test(mc) ? 'release' : 'snapshot', loader, loaderVersion: lv || '', loaderFull: full || '',
    ram: 0, jvmArgs: '', hue: Math.floor(Math.random() * 360), created: Date.now(), lastPlayed: 0, playTime: 0,
  };
  d.instances.push(inst); d.selectedInstance = inst.id;
  fs.mkdirSync(P.instanceDir(inst.id), { recursive: true });
  store.save();
  return inst;
}
const copyDir = (src, dst) => { if (fs.existsSync(src)) fs.cpSync(src, dst, { recursive: true, force: true }); };
const sha1 = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');

async function fromMrpack(tmp, idx, emit) {
  const dep = idx.dependencies || {};
  const mc = dep.minecraft;
  if (!mc) throw new Error('invalid modpack (no minecraft version)');
  let loader = 'vanilla', lv = '', full = '';
  if (dep['fabric-loader']) { loader = 'fabric'; lv = dep['fabric-loader']; }
  else if (dep['quilt-loader']) { loader = 'quilt'; lv = dep['quilt-loader']; }
  else if (dep.neoforge) { loader = 'neoforge'; lv = dep.neoforge; }
  else if (dep.forge) { loader = 'forge'; lv = dep.forge; full = `${mc}-${lv}`; }
  const inst = newInstance(idx.name, mc, loader, lv, full);
  const dir = P.instanceDir(inst.id);
  const files = (idx.files || []).filter((f) => !(f.env && f.env.client === 'unsupported'));
  let done = 0;
  emit({ key: 'files', task: 0, total: files.length, pct: 0.15 });
  await pool(files, 6, async (f) => {
    const dest = safeJoin(dir, f.path);
    await download(f.downloads[0], dest);
    if (f.hashes && f.hashes.sha1 && sha1(dest) !== f.hashes.sha1) throw new Error(`hash mismatch: ${f.path}`);
    emit({ key: 'files', task: ++done, total: files.length, pct: 0.15 + 0.8 * (done / files.length) });
  });
  emit({ key: 'overrides', pct: 0.97 });
  copyDir(path.join(tmp, 'overrides'), dir);
  copyDir(path.join(tmp, 'client-overrides'), dir);
  return inst;
}

async function fromCurseforge(tmp, man, emit) {
  const key = store.get().settings.curseforgeKey;
  if (!key) throw new Error('cf_key_missing');
  const mc = man.minecraft.version;
  const ml = (man.minecraft.modLoaders || []).find((m) => m.primary) || (man.minecraft.modLoaders || [])[0];
  let loader = 'vanilla', lv = '', full = '';
  const m = ml && /^(forge|fabric|neoforge|quilt)-(.+)$/.exec(ml.id);
  if (m) { loader = m[1]; lv = m[2]; if (loader === 'forge') full = `${mc}-${lv}`; }
  const inst = newInstance(man.name, mc, loader, lv, full);
  const dir = P.instanceDir(inst.id);
  const res = await fetch(`${CF}/mods/files`, { method: 'POST', headers: { 'x-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA }, body: JSON.stringify({ fileIds: man.files.map((f) => f.fileID) }) });
  if (!res.ok) throw new Error(`CurseForge HTTP ${res.status}`);
  const list = (await res.json()).data || [];
  let done = 0;
  emit({ key: 'files', task: 0, total: list.length, pct: 0.15 });
  await pool(list, 6, async (f) => {
    const url = f.downloadUrl || `https://edge.forgecdn.net/files/${Math.floor(f.id / 1000)}/${f.id % 1000}/${enc(f.fileName)}`;
    await download(url, safeJoin(path.join(dir, 'mods'), f.fileName));
    emit({ key: 'files', task: ++done, total: list.length, pct: 0.15 + 0.8 * (done / list.length) });
  });
  emit({ key: 'overrides', pct: 0.97 });
  copyDir(path.join(tmp, man.overrides || 'overrides'), dir);
  return inst;
}

async function importFile(file, emit = () => {}) {
  const extract = require('extract-zip');
  const tmp = path.join(P.cache, 'pack-' + crypto.randomBytes(4).toString('hex'));
  emit({ key: 'extract', pct: 0.08 });
  await extract(file, { dir: tmp });
  try {
    const mr = path.join(tmp, 'modrinth.index.json'), cf = path.join(tmp, 'manifest.json');
    if (fs.existsSync(mr)) return await fromMrpack(tmp, JSON.parse(fs.readFileSync(mr, 'utf8')), emit);
    if (fs.existsSync(cf)) return await fromCurseforge(tmp, JSON.parse(fs.readFileSync(cf, 'utf8')), emit);
    throw new Error('Unknown modpack format (need .mrpack or CurseForge .zip)');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

async function installFromModrinth(projectId, emit = () => {}) {
  emit({ key: 'download', pct: 0.02 });
  const versions = await getJSON(`${MR}/project/${projectId}/version`);
  if (!versions.length) throw new Error('no_compatible_version');
  const v = versions.find((x) => x.version_type === 'release') || versions[0];
  const f = v.files.find((x) => x.primary) || v.files[0];
  const dest = path.join(P.cache, f.filename);
  await download(f.url, dest, (p) => emit({ key: 'download', pct: 0.02 + 0.06 * p }));
  try { return await importFile(dest, emit); } finally { fs.rmSync(dest, { force: true }); }
}

module.exports = { search, importFile, installFromModrinth };
