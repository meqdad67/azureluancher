const fs = require('fs');
const path = require('path');
const P = require('./paths');
const { getJSON, download } = require('./net');
const { run } = require('./java');

function ensureProfilesFile() {
  const f = path.join(P.mc, 'launcher_profiles.json');
  if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify({ profiles: {}, settings: {}, version: 3 }));
}

const versionDirs = () => {
  const d = path.join(P.mc, 'versions');
  return fs.existsSync(d) ? fs.readdirSync(d) : [];
};

/** Azure Client: copy the bundled Fabric API jar (for MC 26.1) into the instance's mods folder. No download needed. */
const FABRIC_API_NAME = 'fabric-api-0.155.3+26.1.2.jar';
function ensureFabricApi(inst) {
  const src = path.join(__dirname, '..', '..', 'assets', 'fabric-api.jar');
  const mods = path.join(P.instanceDir(inst.id), 'mods');
  fs.mkdirSync(mods, { recursive: true });
  for (const n of fs.readdirSync(mods)) {
    if (/^fabric-api-.*\.jar$/i.test(n) && n !== FABRIC_API_NAME) fs.rmSync(path.join(mods, n), { force: true });
  }
  const dest = path.join(mods, FABRIC_API_NAME);
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) fs.copyFileSync(src, dest);
}

/** Azure Client: copy the bundled mod into the instance's mods folder on every launch (locked, cannot be removed). */
function ensureAzureClient(inst) {
  const src = path.join(__dirname, '..', '..', 'assets', 'azure-client.jar');
  const mods = path.join(P.instanceDir(inst.id), 'mods');
  fs.mkdirSync(mods, { recursive: true });
  const size = fs.statSync(src).size;
  let ok = false;
  for (const n of fs.readdirSync(mods)) {
    if (!/^azure-client.*\.jar(\.disabled)?$/i.test(n)) continue;
    const f = path.join(mods, n);
    if (n === 'azure-client.jar' && fs.statSync(f).size === size) ok = true; // already the current file: skip the 17 MB copy
    else fs.rmSync(f, { force: true });
  }
  if (!ok) fs.copyFileSync(src, path.join(mods, 'azure-client.jar'));
}

/** Make sure the mod loader is installed. Returns the version id MCLC should launch ("custom"), or null for vanilla. */
async function ensureLoader(inst, javaBin, onStatus, onLine) {
  const { loader, mcVersion: mc, loaderVersion: lv } = inst;
  if (loader === 'vanilla') return null;
  if (!lv) throw new Error('No loader version selected');
  ensureProfilesFile();

  if (loader === 'fabric' || loader === 'quilt' || loader === 'azure') {
    const fabricLike = loader !== 'quilt';
    const base = fabricLike
      ? `https://meta.fabricmc.net/v2/versions/loader/${mc}/${lv}/profile/json`
      : `https://meta.quiltmc.org/v3/versions/loader/${mc}/${lv}/profile/json`;
    const id = fabricLike ? `fabric-loader-${lv}-${mc}` : `quilt-loader-${lv}-${mc}`;
    const dir = path.join(P.mc, 'versions', id);
    const file = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file)) {
      onStatus({ key: 'install_loader', loader });
      const json = await getJSON(base);
      json.id = id;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(json, null, 2));
    }
    // Azure Client: always keep the Fabric API jar matching this Minecraft version in the instance's mods folder.
    if (loader === 'azure') {
      ensureFabricApi(inst);
      ensureAzureClient(inst);
    }
    return id;
  }

  // forge / neoforge: run the official installer headless
  if (inst.loaderId && fs.existsSync(path.join(P.mc, 'versions', inst.loaderId, `${inst.loaderId}.json`))) return inst.loaderId;

  let url, label;
  if (loader === 'forge') {
    const full = inst.loaderFull || `${mc}-${lv}`;
    url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`;
    label = `forge-${full}`;
  } else {
    url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${lv}/neoforge-${lv}-installer.jar`;
    label = `neoforge-${lv}`;
  }
  const jar = path.join(P.cache, `${label}-installer.jar`);
  onStatus({ key: 'dl_loader', loader, pct: 0 });
  if (!fs.existsSync(jar)) await download(url, jar, (p) => onStatus({ key: 'dl_loader', loader, pct: p }));

  const before = new Set(versionDirs());
  onStatus({ key: 'install_loader', loader });
  await run(javaBin, ['-jar', jar, '--installClient', P.mc], onLine, P.mc);
  const created = versionDirs().filter((d) => !before.has(d) && d !== mc);
  const id = created.find((d) => d.toLowerCase().includes(loader)) || created[0];
  if (!id) throw new Error('Loader installer finished but no version was created');
  inst.loaderId = id;
  return id;
}

module.exports = { ensureLoader };
