/**
 * Per-account custom skin. It is shown on the player's own client and on the clients of other Azure Launcher users only
 * (through the shared skin library on the Azure server); players who do not use the launcher never see it.
 * Old note: visible ONLY on launcher clients.
 * It works through the CustomSkinLoader mod (installed automatically from Modrinth): the skin PNG is copied to
 * <instance>/CustomSkinLoader/LocalSkin/skins/<playerName>.png. Nothing is sent to the server, so other players never see it.
 * Accounts without a chosen skin are never touched.
 */
const fs = require('fs');
const path = require('path');
const P = require('./paths');
const store = require('./store');
const mods = require('./mods');

const DIR = path.join(P.root, 'skins');
fs.mkdirSync(DIR, { recursive: true });
const fileOf = (acc) => path.join(DIR, `${acc.id}.png`);

function validate(buf) {
  if (buf.length < 33 || buf.length > 1024 * 1024) throw new Error('skin_invalid');
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error('skin_invalid');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w < 64 || w > 1024 || w % 64 || !(h === w || h * 2 === w)) throw new Error('skin_invalid'); // 64x64, 64x32 or HD multiples
}

const crypto = require('crypto');
const azure = require('./azure');
const CACHE = path.join(P.root, 'skin-cache');
const hashOf = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12); // same as the plugin

function setSkin(acc, src) {
  const buf = fs.readFileSync(src);
  validate(buf);
  fs.writeFileSync(fileOf(acc), buf);
  acc.skin = true;
  acc.skinHash = hashOf(buf);
  acc.skinSynced = '';
  store.save();
}

function clearSkin(acc) {
  try { fs.rmSync(fileOf(acc), { force: true }); } catch {}
  acc.skin = false; acc.skinHash = ''; acc.skinSynced = '';
  store.save();
}

const urlCache = new Map();
function dataUrl(acc) {
  if (!acc.skin) return null;
  const f = fileOf(acc);
  try {
    const st = fs.statSync(f), c = urlCache.get(f);
    if (c && c.m === st.mtimeMs && c.s === st.size) return c.u;
    const u = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    urlCache.set(f, { m: st.mtimeMs, s: st.size, u });
    return u;
  } catch { return null; }
}

/** Uploads the accounts' skins to the Azure server library so other launcher users can see them. */
async function syncOwn() {
  if (store.get().settings.shareWithServer === false) return;
  for (const acc of store.get().accounts) {
    if (!acc.skin || !fs.existsSync(fileOf(acc)) || acc.skinSynced === acc.skinHash) continue;
    const r = await azure.skinUpload(acc.name, fs.readFileSync(fileOf(acc)));
    if (r === 'ok') { acc.skinSynced = acc.skinHash; store.save(); }
  }
}

/** Downloads the skins of the other launcher users into a local cache. Works from the cache when the server is unreachable. */
async function syncOthers(acc, log) {
  fs.mkdirSync(CACHE, { recursive: true });
  const idxFile = path.join(CACHE, 'index.json');
  let idx = {};
  try { idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')); } catch {}
  const me = acc.name.toLowerCase();
  const run = !azure.reachable() ? Promise.resolve() : (async () => {
    const list = await azure.skinList();
    if (list) {
      const names = new Set();
      for (const e of list) {
        if (!/^[A-Za-z0-9_]{3,16}$/.test(e.n) || e.n.toLowerCase() === me) continue;
        names.add(e.n);
        const f = path.join(CACHE, `${e.n}.png`);
        if (idx[e.n] === e.h && fs.existsSync(f)) continue;
        try {
          const buf = await azure.skinFetch(e.n, e.s);
          validate(buf);
          if (hashOf(buf) !== e.h) throw new Error('hash mismatch');
          fs.writeFileSync(f, buf);
          idx[e.n] = e.h;
        } catch (er) { log(`[Azure] skin of ${e.n} not downloaded: ${er.message}`); }
      }
      for (const n of Object.keys(idx)) if (!names.has(n)) { fs.rmSync(path.join(CACHE, `${n}.png`), { force: true }); delete idx[n]; } // removed on the server
    }
    fs.writeFileSync(idxFile, JSON.stringify(idx));
  })();
  await Promise.race([run.catch(() => {}), new Promise((r) => setTimeout(r, 2500))]); // never hold the launch for long (the rest finishes in the background)
  return Object.keys(idx).filter((n) => n.toLowerCase() !== me && fs.existsSync(path.join(CACHE, `${n}.png`))).map((n) => ({ name: n, file: path.join(CACHE, `${n}.png`) }));
}

async function ensureCsl(inst, log) {
  if (mods.list(inst, 'mod').some((m) => /customskinloader/i.test(m.file) && m.enabled)) return true;
  try {
    log('[Azure] installing CustomSkinLoader (needed to show custom skins)...');
    await mods.install(inst, { source: 'modrinth', type: 'mod', id: 'customskinloader' });
    return true;
  } catch (e) { log('[Azure] could not install CustomSkinLoader (' + e.message + ') - launching without custom skins'); return false; }
}

/**
 * Called before every launch. Puts into <instance>/CustomSkinLoader/LocalSkin/skins/ :
 *  - the account's own custom skin (if it chose one), and
 *  - the skins of the other Azure Launcher users (if "see launcher skins" is on),
 * and removes only the files this launcher wrote earlier. Accounts without a chosen skin are never changed.
 */
async function prepare(inst, acc, log) {
  const st = store.get().settings;
  const dir = path.join(P.instanceDir(inst.id), 'CustomSkinLoader', 'LocalSkin', 'skins');
  inst.skinFiles = inst.skinFiles || [];
  const modded = inst.loader !== 'vanilla';
  const own = !!acc.skin && fs.existsSync(fileOf(acc));
  if (own && !modded) log('[Azure] a custom skin needs a mod loader (Fabric / Forge / Quilt / NeoForge) - skipped');

  let others = [];
  if (modded && st.shareWithServer !== false && st.seeLauncherSkins !== false) others = await syncOthers(acc, log);

  const want = new Map();
  if (modded && (own || others.length)) {
    if (!(await ensureCsl(inst, log))) return;
    if (own) want.set(acc.name, fileOf(acc));
    for (const o of others) want.set(o.name, o.file);
  }

  if (want.size) fs.mkdirSync(dir, { recursive: true });
  for (const [name, src] of want) {
    const target = path.join(dir, `${name}.png`);
    const mine = inst.skinFiles.includes(name);
    if (fs.existsSync(target) && !mine) continue; // a file the user put there himself: leave it alone
    fs.copyFileSync(src, target);
    if (!mine) inst.skinFiles.push(name);
  }
  for (const name of [...inst.skinFiles]) {
    if (want.has(name)) continue;
    fs.rmSync(path.join(dir, `${name}.png`), { force: true });
    inst.skinFiles = inst.skinFiles.filter((n) => n !== name);
  }
  store.save();
}

module.exports = { setSkin, clearSkin, dataUrl, prepare, syncOwn, _validate: validate };
