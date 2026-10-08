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

/** Make sure the mod loader is installed. Returns the version id MCLC should launch ("custom"), or null for vanilla. */
async function ensureLoader(inst, javaBin, onStatus, onLine) {
  const { loader, mcVersion: mc, loaderVersion: lv } = inst;
  if (loader === 'vanilla') return null;
  if (!lv) throw new Error('No loader version selected');
  ensureProfilesFile();

  if (loader === 'fabric' || loader === 'quilt') {
    const base = loader === 'fabric'
      ? `https://meta.fabricmc.net/v2/versions/loader/${mc}/${lv}/profile/json`
      : `https://meta.quiltmc.org/v3/versions/loader/${mc}/${lv}/profile/json`;
    const id = loader === 'fabric' ? `fabric-loader-${lv}-${mc}` : `quilt-loader-${lv}-${mc}`;
    const dir = path.join(P.mc, 'versions', id);
    const file = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file)) {
      onStatus({ key: 'install_loader', loader });
      const json = await getJSON(base);
      json.id = id;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(json, null, 2));
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
