const fs = require('fs');
const path = require('path');
const P = require('./paths');
const { getJSON } = require('./net');

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const manifestCache = path.join(P.cache, 'version_manifest_v2.json');
let memo = null;

async function manifest() {
  if (memo) return memo;
  try {
    memo = await getJSON(MANIFEST);
    fs.writeFileSync(manifestCache, JSON.stringify(memo));
  } catch (e) {
    if (fs.existsSync(manifestCache)) memo = JSON.parse(fs.readFileSync(manifestCache, 'utf8'));
    else throw e;
  }
  return memo;
}

async function mcVersions() {
  const m = await manifest();
  return m.versions.map((v) => ({ id: v.id, type: v.type, url: v.url, releaseTime: v.releaseTime }));
}

async function javaMajorFor(mcVersion) {
  const m = await manifest();
  const v = m.versions.find((x) => x.id === mcVersion);
  if (!v) return 8;
  const file = path.join(P.cache, `mc-${mcVersion}.json`);
  let json;
  try { json = await getJSON(v.url); fs.writeFileSync(file, JSON.stringify(json)); }
  catch (e) { if (fs.existsSync(file)) json = JSON.parse(fs.readFileSync(file, 'utf8')); else throw e; }
  return (json.javaVersion && json.javaVersion.majorVersion) || 8;
}

/* ---- loader versions (newest first) ---- */
function neoPrefix(mc) {
  let m = /^1\.(\d+)(?:\.(\d+))?$/.exec(mc);
  if (m) return `${m[1]}.${m[2] || 0}.`;
  m = /^(\d+)\.(\d+)/.exec(mc);
  return m ? `${m[1]}.${m[2]}.` : null;
}

async function loaderVersions(loader, mc) {
  if (loader === 'vanilla') return [];
  if (loader === 'fabric') {
    const l = await getJSON(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}`);
    return l.map((x) => ({ id: x.loader.version, stable: !!x.loader.stable }));
  }
  if (loader === 'quilt') {
    const l = await getJSON(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}`);
    return l.map((x) => ({ id: x.loader.version, stable: !/beta|alpha|pre/i.test(x.loader.version) }));
  }
  if (loader === 'forge') {
    const meta = await getJSON('https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json');
    const list = meta[mc] || [];
    return list.slice().reverse().map((full) => ({ id: full.slice(mc.length + 1), full, stable: true }));
  }
  if (loader === 'neoforge') {
    const pre = neoPrefix(mc);
    if (!pre) return [];
    const r = await getJSON('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
    return (r.versions || []).filter((v) => v.startsWith(pre)).reverse()
      .map((v) => ({ id: v, stable: !/alpha|beta/.test(v) }));
  }
  return [];
}

module.exports = { mcVersions, javaMajorFor, loaderVersions };
