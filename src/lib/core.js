/**
 * Azure core: resolves a Minecraft version (vanilla or modded, with inheritsFrom),
 * downloads libraries / assets / client jar, extracts natives and builds the java command line.
 * Works with vanilla, snapshots, Fabric, Quilt, Forge and NeoForge version JSONs.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('./paths');
const { getJSON, download } = require('./net');
const { mcVersions } = require('./versions');

const OS = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
const ARCH = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'x86' : 'x64';

/* ---------- helpers ---------- */
function ruleOk(rules, features = {}) {
  if (!rules || !rules.length) return true;
  let ok = false;
  for (const r of rules) {
    let m = true;
    if (r.os) {
      if (r.os.name && r.os.name !== OS) m = false;
      if (r.os.arch && r.os.arch !== ARCH) m = false;
      if (r.os.version && !new RegExp(r.os.version).test(os.release())) m = false;
    }
    if (r.features) for (const [k, v] of Object.entries(r.features)) if (!!features[k] !== !!v) m = false;
    if (m) ok = r.action === 'allow';
  }
  return ok;
}

function mavenPath(name) {
  let n = name, ext = 'jar';
  if (n.includes('@')) [n, ext] = n.split('@');
  const [g, a, v, c] = n.split(':');
  return `${g.replace(/\./g, '/')}/${a}/${v}/${a}-${v}${c ? '-' + c : ''}.${ext}`;
}
const libKey = (l) => { const [g, a, , c] = l.name.split('@')[0].split(':'); return `${g}:${a}:${c || ''}`; };

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
  }));
}
async function dl(url, dest, tries = 3) {
  let err;
  for (let t = 0; t < tries; t++) { try { return await download(url, dest); } catch (e) { err = e; } }
  throw err;
}
const have = (dest, size) => fs.existsSync(dest) && (!size || fs.statSync(dest).size === size);

/* ---------- version resolution ---------- */
async function loadVersion(id) {
  const file = path.join(P.mc, 'versions', id, `${id}.json`);
  let json;
  if (fs.existsSync(file)) json = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    const v = (await mcVersions()).find((x) => x.id === id);
    if (!v) throw new Error(`Version JSON not found: ${id}`);
    json = await getJSON(v.url);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(json));
  }
  if (!json.inheritsFrom) { json._jarId = json.id; return json; }
  const parent = await loadVersion(json.inheritsFrom);
  const libs = [...(json.libraries || [])];
  const seen = new Set(libs.map(libKey));
  for (const l of parent.libraries || []) if (!seen.has(libKey(l))) libs.push(l);
  const merged = { ...parent, ...json, libraries: libs, _jarId: parent._jarId };
  if (parent.arguments || json.arguments) {
    merged.arguments = {
      game: [...((parent.arguments || {}).game || []), ...((json.arguments || {}).game || [])],
      jvm: [...((parent.arguments || {}).jvm || []), ...((json.arguments || {}).jvm || [])],
    };
  }
  if (json.minecraftArguments && !json.arguments) delete merged.arguments;
  merged.downloads = parent.downloads;
  merged.assetIndex = parent.assetIndex;
  merged.assets = parent.assets;
  merged.javaVersion = json.javaVersion || parent.javaVersion;
  merged.logging = json.logging || parent.logging;
  return merged;
}

/* ---------- prepare (download everything) ---------- */
async function prepare(versionId, gameDir, onProgress = () => {}) {
  const v = await loadVersion(versionId);
  const libDir = path.join(P.mc, 'libraries');
  const jobs = [];
  const classpath = [];
  const natives = [];

  for (const lib of v.libraries || []) {
    if (!ruleOk(lib.rules)) continue;
    let art = lib.downloads && lib.downloads.artifact;
    if (lib.natives && lib.natives[OS]) {
      const key = lib.natives[OS].replace('${arch}', ARCH === 'x86' ? '32' : '64');
      const cls = lib.downloads && lib.downloads.classifiers && lib.downloads.classifiers[key];
      const rel = cls ? cls.path : mavenPath(`${lib.name}:${key}`);
      const url = cls ? cls.url : (lib.url || 'https://libraries.minecraft.net/') + rel;
      const dest = path.join(libDir, rel);
      jobs.push({ url, dest, size: cls && cls.size });
      natives.push(dest);
      if (!lib.downloads || !lib.downloads.artifact) continue; // old natives-only entry
    } else if (lib.natives) continue;
    if (!art) {
      const rel = mavenPath(lib.name);
      art = { path: rel, url: lib.url ? lib.url.replace(/\/?$/, '/') + rel : 'https://libraries.minecraft.net/' + rel, size: 0 };
    }
    const dest = path.join(libDir, art.path);
    if (art.url) jobs.push({ url: art.url, dest, size: art.size });
    if (!classpath.includes(dest)) classpath.push(dest);
  }

  // client jar
  const jarId = v._jarId;
  const clientJar = path.join(P.mc, 'versions', jarId, `${jarId}.jar`);
  if (v.downloads && v.downloads.client) jobs.push({ url: v.downloads.client.url, dest: clientJar, size: v.downloads.client.size });
  classpath.push(clientJar);

  // logging config
  let logArg = null;
  const lc = v.logging && v.logging.client;
  if (lc && lc.file) {
    const dest = path.join(P.mc, 'assets', 'log_configs', lc.file.id);
    jobs.push({ url: lc.file.url, dest, size: lc.file.size });
    logArg = lc.argument.replace('${path}', dest);
  }

  // libraries + jar
  let done = 0;
  const todo = jobs.filter((j) => !have(j.dest, j.size));
  onProgress({ key: 'dl_libraries', task: 0, total: todo.length });
  await pool(todo, 12, async (j) => {
    await dl(j.url, j.dest);
    onProgress({ key: 'dl_libraries', task: ++done, total: todo.length });
  });

  // assets
  const assetsRoot = path.join(P.mc, 'assets');
  const idxFile = path.join(assetsRoot, 'indexes', `${v.assetIndex.id}.json`);
  if (!have(idxFile, v.assetIndex.size)) await dl(v.assetIndex.url, idxFile);
  const index = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
  const objs = Object.entries(index.objects || {});
  const missing = objs.filter(([, o]) => !have(path.join(assetsRoot, 'objects', o.hash.slice(0, 2), o.hash), o.size));
  done = 0;
  onProgress({ key: 'dl_assets', task: 0, total: missing.length });
  await pool(missing, 24, async ([, o]) => {
    const p2 = o.hash.slice(0, 2);
    await dl(`https://resources.download.minecraft.net/${p2}/${o.hash}`, path.join(assetsRoot, 'objects', p2, o.hash));
    if (++done % 25 === 0 || done === missing.length) onProgress({ key: 'dl_assets', task: done, total: missing.length });
  });
  let gameAssets = assetsRoot;
  const copyTo = (dir) => {
    for (const [name, o] of objs) {
      const dest = path.join(dir, name);
      if (fs.existsSync(dest)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(assetsRoot, 'objects', o.hash.slice(0, 2), o.hash), dest);
    }
  };
  if (index.virtual) { gameAssets = path.join(assetsRoot, 'virtual', v.assetIndex.id); copyTo(gameAssets); }
  if (index.map_to_resources) { gameAssets = path.join(gameDir, 'resources'); copyTo(gameAssets); }

  // natives
  const nativesDir = path.join(P.mc, 'versions', versionId, 'natives');
  const mark = path.join(nativesDir, '.azure-done');
  if (natives.length && !fs.existsSync(mark)) {
    const extract = require('extract-zip');
    fs.mkdirSync(nativesDir, { recursive: true });
    for (const n of natives) { try { await extract(n, { dir: path.resolve(nativesDir) }); } catch {} }
    fs.rmSync(path.join(nativesDir, 'META-INF'), { recursive: true, force: true });
    fs.writeFileSync(mark, '1');
  }
  fs.mkdirSync(nativesDir, { recursive: true });

  return { v, classpath, nativesDir, assetsRoot, gameAssets, logArg };
}

/* ---------- command line ---------- */
const subst = (s, vars) => s.replace(/\$\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
function expand(list, vars, features) {
  const out = [];
  for (const a of list || []) {
    if (typeof a === 'string') out.push(subst(a, vars));
    else if (ruleOk(a.rules, features)) for (const x of Array.isArray(a.value) ? a.value : [a.value]) out.push(subst(x, vars));
  }
  return out;
}

function buildCommand({ prepared, versionId, versionType, gameDir, auth, ramMax, ramMin, extraJvm, extraGame, window }) {
  const { v, classpath, nativesDir, assetsRoot, gameAssets, logArg } = prepared;
  const features = { has_custom_resolution: !!(window && window.width) };
  const vars = {
    auth_player_name: auth.name,
    auth_uuid: auth.uuid,
    auth_access_token: auth.access_token,
    auth_session: auth.access_token,
    auth_xuid: (auth.meta && auth.meta.xuid) || '0',
    clientid: auth.client_token || '0',
    user_type: (auth.meta && auth.meta.type) || 'msa',
    user_properties: auth.user_properties || '{}',
    version_name: versionId,
    version_type: versionType || 'release',
    game_directory: gameDir,
    assets_root: assetsRoot,
    game_assets: gameAssets,
    assets_index_name: v.assetIndex.id,
    resolution_width: (window && window.width) || 854,
    resolution_height: (window && window.height) || 480,
    natives_directory: nativesDir,
    launcher_name: 'AzureLauncher',
    launcher_version: '1.0.0',
    classpath: classpath.join(path.delimiter),
    classpath_separator: path.delimiter,
    library_directory: path.join(P.mc, 'libraries'),
  };

  let jvm, game;
  if (v.arguments) {
    jvm = expand(v.arguments.jvm, vars, features);
    game = expand(v.arguments.game, vars, features);
  } else {
    jvm = [`-Djava.library.path=${nativesDir}`, '-Dminecraft.launcher.brand=AzureLauncher', '-Dminecraft.launcher.version=1.0.0', '-cp', vars.classpath];
    if (OS === 'osx') jvm.unshift('-XstartOnFirstThread');
    game = subst(v.minecraftArguments || '', vars).split(' ').filter(Boolean);
    if (window && window.width) game.push('--width', String(window.width), '--height', String(window.height));
  }
  if (window && window.fullscreen) game.push('--fullscreen');
  if (extraGame && extraGame.length) game.push(...extraGame);
  if (logArg) jvm.push(logArg);

  const mem = [`-Xmx${ramMax}M`, `-Xms${ramMin}M`];
  return [...mem, ...(extraJvm || []), ...jvm, v.mainClass, ...game];
}

module.exports = { prepare, buildCommand, loadVersion };
