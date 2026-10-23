const fs = require('fs');
const path = require('path');
const P = require('./paths');
const { getJSON, download } = require('./net');
const { run } = require('./java');
const metas = require('./metas');

function ensureProfilesFile() {
  const f = path.join(P.mc, 'launcher_profiles.json');
  if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify({ profiles: {}, settings: {}, version: 3 }));
}

const versionDirs = () => {
  const d = path.join(P.mc, 'versions');
  return fs.existsSync(d) ? fs.readdirSync(d) : [];
};

/** Azure Client (1.21.11 build): keep a Fabric API jar in the mods folder. Uses assets/fabric-api-1_21_11.jar if shipped, otherwise downloads it from Modrinth.
 *  The 1.8.9 build runs on Legacy Fabric and needs no Fabric API. */
async function ensureFabricApi(inst, onStatus) {
  if (metas.kindOf(inst) !== 'fabric') return;
  const mods = path.join(P.instanceDir(inst.id), 'mods');
  fs.mkdirSync(mods, { recursive: true });
  if (fs.readdirSync(mods).some((n) => /^fabric-api-.*\.jar$/i.test(n))) return;
  const dest = path.join(mods, `fabric-api-${inst.mcVersion}.jar`);
  const bundled = path.join(__dirname, '..', '..', 'assets', `fabric-api-${inst.mcVersion.replace(/\./g, '_')}.jar`);
  if (fs.existsSync(bundled)) { fs.copyFileSync(bundled, dest); return; }
  onStatus({ key: 'install_loader', loader: 'azure' });
  const vs = await getJSON(`https://api.modrinth.com/v2/project/fabric-api/version?loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(JSON.stringify([inst.mcVersion]))}`);
  const f = vs[0] && (vs[0].files.find((x) => x.primary) || vs[0].files[0]);
  if (!f) throw new Error('fabric_api_missing');
  await download(f.url, dest);
}

/** Azure Client: copy the bundled jar for this Minecraft version (assets/AzureClient-1_21_11.jar ...) into mods/azure-client.jar on every launch (locked, cannot be removed). */
function ensureAzureClient(inst) {
  const src = path.join(__dirname, '..', '..', 'assets', `AzureClient-${inst.mcVersion.replace(/\./g, '_')}.jar`);
  if (!fs.existsSync(src)) throw new Error('azure_jar_missing');
  const mods = path.join(P.instanceDir(inst.id), 'mods');
  fs.mkdirSync(mods, { recursive: true });
  const want = fs.readFileSync(src);
  let ok = false;
  for (const n of fs.readdirSync(mods)) {
    if (!/^azure-client.*\.jar(\.disabled)?$/i.test(n)) continue;
    const f = path.join(mods, n);
    if (n === 'azure-client.jar' && fs.statSync(f).size === want.length && fs.readFileSync(f).equals(want)) ok = true; // already the right build
    else fs.rmSync(f, { force: true });
  }
  if (!ok) fs.writeFileSync(path.join(mods, 'azure-client.jar'), want);
}

/** Make sure the mod loader is installed. Returns the version id MCLC should launch ("custom"), or null for vanilla. */
async function ensureLoader(inst, javaBin, onStatus, onLine) {
  const { loader, mcVersion: mc, loaderVersion: lv } = inst;
  if (loader === 'vanilla') return null;
  if (!lv) throw new Error('No loader version selected');
  ensureProfilesFile();

  if (loader === 'azure' && !metas.AZURE[mc]) throw new Error('azure_unsupported');
  const kind = metas.kindOf(inst);
  if (metas.META[kind]) {
    const id = metas.loaderId(inst);
    const dir = path.join(P.mc, 'versions', id);
    const file = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file)) {
      onStatus({ key: 'install_loader', loader });
      const json = await getJSON(`${metas.META[kind].list}/${encodeURIComponent(mc)}/${encodeURIComponent(lv)}/profile/json`);
      json.id = id;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(json, null, 2));
    }
    if (loader === 'azure') { await ensureFabricApi(inst, onStatus); ensureAzureClient(inst); }
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
