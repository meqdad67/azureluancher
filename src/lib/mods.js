const fs = require('fs');
const path = require('path');
const P = require('./paths');
const store = require('./store');
const { getJSON, download } = require('./net');

const MR = 'https://api.modrinth.com/v2';
const CF = 'https://api.curseforge.com/v1';
const TYPE_DIR = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };
const CF_CLASS = { mod: 6, resourcepack: 12, shader: 6552 };
const CF_LOADER = { forge: 1, fabric: 4, quilt: 4, neoforge: 6 };

const enc = encodeURIComponent;
const dirFor = (inst, type) => path.join(P.instanceDir(inst.id), TYPE_DIR[type] || 'mods');
const metaFile = (inst) => path.join(P.instanceDir(inst.id), 'azure-meta.json');
function readMeta(inst) { try { return JSON.parse(fs.readFileSync(metaFile(inst), 'utf8')); } catch { return {}; } }
function writeMeta(inst, m) { fs.mkdirSync(P.instanceDir(inst.id), { recursive: true }); fs.writeFileSync(metaFile(inst), JSON.stringify(m, null, 2)); }
function remember(inst, type, file, info) { const m = readMeta(inst); m[`${type}:${file}`] = info; writeMeta(inst, m); }

function loaderList(inst) {
  if (inst.loader === 'quilt') return ['quilt', 'fabric'];
  return [inst.loader];
}
const cfKey = () => {
  const k = store.get().settings.curseforgeKey;
  if (!k) throw new Error('cf_key_missing');
  return { 'x-api-key': k };
};

/* ---------------- search ---------------- */
async function search(inst, { source, type = 'mod', query = '', offset = 0, sort = 'relevance' }) {
  if (source === 'curseforge') {
    const h = cfKey();
    const sortField = { relevance: query ? 1 : 2, downloads: 6, updated: 3 }[sort] || 2;
    let url = `${CF}/mods/search?gameId=432&classId=${CF_CLASS[type]}&searchFilter=${enc(query)}&gameVersion=${enc(inst.mcVersion)}&sortField=${sortField}&sortOrder=desc&pageSize=20&index=${offset}`;
    if (type === 'mod' && CF_LOADER[inst.loader]) url += `&modLoaderType=${CF_LOADER[inst.loader]}`;
    const r = await getJSON(url, h);
    return {
      total: r.pagination ? r.pagination.totalCount : r.data.length,
      hits: r.data.map((m) => ({
        source: 'curseforge', id: String(m.id), title: m.name, description: m.summary,
        icon: m.logo && m.logo.thumbnailUrl, downloads: m.downloadCount,
        author: (m.authors && m.authors[0] && m.authors[0].name) || '',
      })),
    };
  }
  const facets = [[`project_type:${type}`], [`versions:${inst.mcVersion}`]];
  if (type === 'mod' && inst.loader !== 'vanilla') facets.push(loaderList(inst).map((l) => `categories:${l}`));
  const index = { relevance: 'relevance', downloads: 'downloads', updated: 'updated' }[sort] || 'relevance';
  const r = await getJSON(`${MR}/search?query=${enc(query)}&limit=20&offset=${offset}&index=${index}&facets=${enc(JSON.stringify(facets))}`);
  return {
    total: r.total_hits,
    hits: r.hits.map((h) => ({
      source: 'modrinth', id: h.project_id, title: h.title, description: h.description,
      icon: h.icon_url, downloads: h.downloads, author: h.author,
    })),
  };
}

/* ---------------- install ---------------- */
async function installModrinth(inst, type, projectId, seen, onStatus) {
  if (seen.has('mr:' + projectId)) return [];
  seen.add('mr:' + projectId);
  let q = `${MR}/project/${projectId}/version?game_versions=${enc(JSON.stringify([inst.mcVersion]))}`;
  if (type === 'mod' && inst.loader !== 'vanilla') q += `&loaders=${enc(JSON.stringify(loaderList(inst)))}`;
  const versions = await getJSON(q);
  if (!versions.length) throw new Error('no_compatible_version');
  const v = versions.find((x) => x.version_type === 'release') || versions[0];
  const file = v.files.find((f) => f.primary) || v.files[0];
  const dest = path.join(dirFor(inst, type), file.filename);
  onStatus && onStatus(file.filename);
  if (!fs.existsSync(dest)) await download(file.url, dest);
  let proj = {};
  try { proj = await getJSON(`${MR}/project/${projectId}`); } catch {}
  remember(inst, type, file.filename, { title: proj.title || v.name, icon: proj.icon_url || '', source: 'modrinth', projectId, version: v.version_number });
  const installed = [file.filename];
  if (type === 'mod') {
    for (const d of v.dependencies || []) {
      if (d.dependency_type === 'required' && d.project_id) {
        try { installed.push(...await installModrinth(inst, type, d.project_id, seen, onStatus)); } catch {}
      }
    }
  }
  return installed;
}

async function installCurseforge(inst, type, modId, seen, onStatus) {
  if (seen.has('cf:' + modId)) return [];
  seen.add('cf:' + modId);
  const h = cfKey();
  let url = `${CF}/mods/${modId}/files?gameVersion=${enc(inst.mcVersion)}&pageSize=10`;
  if (type === 'mod' && CF_LOADER[inst.loader]) url += `&modLoaderType=${CF_LOADER[inst.loader]}`;
  const r = await getJSON(url, h);
  const f = (r.data || []).find((x) => x.releaseType === 1) || (r.data || [])[0];
  if (!f) throw new Error('no_compatible_version');
  const link = f.downloadUrl || `https://edge.forgecdn.net/files/${Math.floor(f.id / 1000)}/${f.id % 1000}/${enc(f.fileName)}`;
  const dest = path.join(dirFor(inst, type), f.fileName);
  onStatus && onStatus(f.fileName);
  if (!fs.existsSync(dest)) await download(link, dest);
  let proj = {};
  try { proj = (await getJSON(`${CF}/mods/${modId}`, h)).data || {}; } catch {}
  remember(inst, type, f.fileName, { title: proj.name || f.displayName, icon: proj.logo && proj.logo.thumbnailUrl, source: 'curseforge', projectId: String(modId), version: f.displayName });
  const installed = [f.fileName];
  if (type === 'mod') {
    for (const d of f.dependencies || []) {
      if (d.relationType === 3) { try { installed.push(...await installCurseforge(inst, type, d.modId, seen, onStatus)); } catch {} }
    }
  }
  return installed;
}

async function install(inst, { source, type = 'mod', id }, onStatus) {
  const seen = new Set();
  return source === 'curseforge' ? installCurseforge(inst, type, id, seen, onStatus) : installModrinth(inst, type, id, seen, onStatus);
}

/* ---------------- installed ---------------- */
function list(inst, type = 'mod') {
  const dir = dirFor(inst, type);
  if (!fs.existsSync(dir)) return [];
  const meta = readMeta(inst);
  return fs.readdirSync(dir)
    .filter((f) => /\.(jar|zip)(\.disabled)?$/i.test(f))
    .map((f) => {
      const clean = f.replace(/\.disabled$/, '');
      const st = fs.statSync(path.join(dir, f));
      const m = meta[`${type}:${clean}`] || {};
      return { file: f, name: m.title || clean.replace(/\.(jar|zip)$/i, ''), icon: m.icon || '', version: m.version || '', source: m.source || 'local', size: st.size, enabled: !f.endsWith('.disabled') };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toggle(inst, type, file) {
  const dir = dirFor(inst, type);
  const to = file.endsWith('.disabled') ? file.slice(0, -9) : file + '.disabled';
  fs.renameSync(path.join(dir, file), path.join(dir, to));
}

function remove(inst, type, file) {
  fs.rmSync(path.join(dirFor(inst, type), file), { force: true });
  const m = readMeta(inst);
  delete m[`${type}:${file.replace(/\.disabled$/, '')}`];
  writeMeta(inst, m);
}

function addLocal(inst, type, files) {
  const dir = dirFor(inst, type);
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const f of files) {
    const name = path.basename(f);
    fs.copyFileSync(f, path.join(dir, name));
    remember(inst, type, name, { title: name.replace(/\.(jar|zip)$/i, ''), icon: '', source: 'local', version: '' });
    n++;
  }
  return n;
}

module.exports = { search, install, list, toggle, remove, addLocal, TYPE_DIR };
