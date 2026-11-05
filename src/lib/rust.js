'use strict';
/* Rust runtime: the Rust build of Minecraft 26.3 (open source, MIT: github.com/horizon-rust/horizon).
 * Nothing of Minecraft is bundled. The build is downloaded from the project's releases, and its resources
 * are created on the player's own PC from the official 26.3 files (the player must own Java Edition).
 * NOTE: asset names / flags are best guesses from the project's README: adjust pickAsset()/launch() after
 * checking https://github.com/horizon-rust/horizon/releases */
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const P = require('./paths');
const { ensureJava } = require('./java');
const store = require('./store');

const REPO = 'horizon-rust/horizon';
const MC = '26.3';
const DIR = path.join(P.root, 'rust');
const EXE = process.platform === 'win32' ? '.exe' : '';
const PLAT = { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform];
const UA = { 'User-Agent': 'AzureLauncher' };
const running = new Map(); // instance id -> child process

const getJson = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error('http_' + r.status); return r.json(); };

async function download(url, dest, onPct) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok || !r.body) throw new Error('http_' + r.status);
  const total = Number(r.headers.get('content-length')) || 0;
  let got = 0, last = 0;
  const src = Readable.fromWeb(r.body);
  src.on('data', (c) => { got += c.length; const n = Date.now(); if (total && onPct && n - last > 200) { last = n; onPct(got / total); } });
  await pipeline(src, fs.createWriteStream(dest));
}

function find(dir, name, depth = 4) {
  if (depth < 0 || !fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name === name) return p;
    if (e.isDirectory()) { const r = find(p, name, depth - 1); if (r) return r; }
  }
  return null;
}
const bin = (n) => find(DIR, n + EXE);

function pickAsset(rel) {
  const list = (rel.assets || []).filter((a) => {
    const n = a.name.toLowerCase();
    return n.includes(PLAT) && !n.includes('launcher') && !n.includes('server') && /\.(zip|tar\.gz)$/.test(n);
  });
  return list.find((a) => a.name.toLowerCase().includes('client')) || list[0] || null;
}

async function install(onPct) {
  const rels = await getJson(`https://api.github.com/repos/${REPO}/releases?per_page=30`);
  let asset = null;
  for (const rel of rels) { if (String(rel.tag_name).startsWith('launcher@')) continue; asset = pickAsset(rel); if (asset) break; }
  if (!asset) throw new Error('rust_asset_not_found');
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, asset.name);
  await download(asset.browser_download_url, file, onPct);
  if (file.endsWith('.zip')) await require('extract-zip')(file, { dir: DIR });
  else await require('tar').x({ file, cwd: DIR });
  fs.rmSync(file, { force: true });
  if (process.platform !== 'win32') for (const n of ['horizon-client', 'horizon-prepare']) { const b = bin(n); if (b) fs.chmodSync(b, 0o755); }
  if (!bin('horizon-client')) throw new Error('rust_client_missing');
}

// builds the game's resources from the player's own 26.3 files (needs vanilla 26.3 installed + Java 25)
async function prepare(log) {
  if (!fs.existsSync(path.join(P.mc, 'versions', MC, `${MC}.jar`))) throw new Error('need_vanilla_26_3');
  const prep = bin('horizon-prepare');
  if (!prep) throw new Error('rust_not_installed');
  const java = await ensureJava(25, (st) => log(`[Azure] Java ${st.major}: ${st.key}`));
  const manifest = await getJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
  const v = manifest.versions.find((x) => x.id === MC);
  if (!v) throw new Error('mc_version_missing');
  const raw = Buffer.from(await (await fetch(v.url)).arrayBuffer());
  const meta = JSON.parse(raw.toString('utf8'));
  // horizon-prepare wants Mojang's version json byte-exact at <its folder>/.local/minecraft/26.3/manifest.json
  const base = path.dirname(prep);
  const mdir = path.join(base, '.local', 'minecraft', MC);
  fs.mkdirSync(mdir, { recursive: true });
  fs.writeFileSync(path.join(mdir, 'manifest.json'), raw);
  const vj = path.join(P.mc, 'versions', MC, MC + '.json');
  const have = fs.existsSync(vj) ? require('crypto').createHash('sha1').update(fs.readFileSync(vj)).digest('hex') : '';
  if (have !== v.sha1) { fs.mkdirSync(path.dirname(vj), { recursive: true }); fs.writeFileSync(vj, raw); }
  const server = meta.downloads.server;
  const jar = path.join(DIR, 'server.jar');
  if (!fs.existsSync(jar)) await download(server.url, jar);
  const javaHome = path.dirname(path.dirname(java.java));
  await new Promise((resolve, reject) => execFile(prep, ['--prepare', '--server-jar', jar], {
    cwd: base, windowsHide: true, maxBuffer: 1 << 24,
    env: { ...process.env, HORIZON_MINECRAFT_DIR: P.mc, JAVA_HOME: javaHome, PATH: path.dirname(java.java) + path.delimiter + process.env.PATH },
  }, (err, _o, se) => (err ? reject(new Error(String(se || err.message).slice(0, 400))) : resolve())));
  fs.writeFileSync(path.join(DIR, '.prepared'), String(Date.now()));
}

const status = () => ({ installed: !!bin('horizon-client'), prepared: fs.existsSync(path.join(DIR, '.prepared')) });
const isRunning = (id) => running.has(id);
const stop = (id) => { const c = running.get(id); if (c) { try { c.kill(); } catch {} } };

// Passes the account selected in the launcher to horizon-client (name + UUID).
// Flag names are detected from the client's own --help output, so an unknown flag is never sent.
function accountArgs(exe, acc) {
  if (!acc) return { args: [], env: {} };
  let help = '';
  try {
    help = require('child_process').execFileSync(exe, ['--help'], { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { help = String((e && e.stdout) || '') + String((e && e.stderr) || ''); }
  const has = (f) => new RegExp('(^|[\\s,|])' + f + '(?=[\\s=,|]|$)', 'm').test(help);
  const args = [];
  const nameFlag = ['--username', '--player-name', '--player', '--name'].find(has);
  const uuidFlag = ['--uuid', '--player-uuid'].find(has);
  if (nameFlag) args.push(nameFlag, acc.name);
  if (uuidFlag && acc.uuid) args.push(uuidFlag, acc.uuid);
  return { args, env: { HORIZON_USERNAME: acc.name, HORIZON_UUID: acc.uuid || '' } };
}

async function launch(inst, emit) {
  if (running.has(inst.id) || inst.preparing) throw new Error('already_running');
  const state = (st) => emit('state', { id: inst.id, state: st });
  const log = (line, kind = 'info') => emit('log', { id: inst.id, line, kind });
  const progress = (label, pct) => emit('progress', { id: inst.id, label, pct });
  inst.preparing = true;
  state('preparing');
  try {
    if (!status().installed) {
      log('[Azure] downloading the Rust build...');
      await install((p) => progress({ key: 'dl_rust' }, 0.05 + 0.6 * p));
    }
    if (!status().prepared) { progress({ key: 'prep_rust' }, 0.7); log('[Azure] preparing game files from your Minecraft 26.3...'); await prepare(log); }
    const exe = bin('horizon-client');
    const cwd = P.instanceDir(inst.id);
    fs.mkdirSync(cwd, { recursive: true });
    progress({ key: 'launching' }, 0.97);
    const st = store.get();
    const acc = (st.accounts || []).find((a) => a.id === st.selectedAccount);
    const ac = accountArgs(exe, acc);
    log(`[Azure] account: ${acc ? acc.name : 'none'} (${ac.args.length ? 'passed' : 'client has no account flag'})`);
    const child = spawn(exe, ['--resources', path.join(path.dirname(exe), '.local', 'horizon-client', MC), '--game-dir', P.mc, ...ac.args], { cwd: path.dirname(exe), windowsHide: true, env: { ...process.env, ...ac.env, HORIZON_MINECRAFT_DIR: P.mc } });
    const startedAt = Date.now();
    running.set(inst.id, child);
    inst.preparing = false;
    inst.lastPlayed = startedAt;
    const feed = (b) => String(b).split(/\r?\n/).forEach((l) => l && log(l, 'game'));
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', (e) => log(`[Azure] ERROR: ${e.message}`, 'error'));
    child.on('close', (code) => {
      running.delete(inst.id);
      inst.playTime = (inst.playTime || 0) + Math.round((Date.now() - startedAt) / 1000);
      require('./store').save();
      log(`[Azure] exit code ${code}`, code === 0 ? 'info' : 'error');
      state('idle');
      emit('closed', { id: inst.id, code });
    });
    progress({ key: 'running' }, 1);
    state('running');
    emit('started', { id: inst.id });
  } catch (e) {
    inst.preparing = false;
    state('idle');
    log(`[Azure] ERROR: ${e.message}`, 'error');
    throw e;
  }
}

module.exports = { status, launch, isRunning, stop, MC };
