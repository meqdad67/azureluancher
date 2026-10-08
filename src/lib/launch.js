const fs = require('fs');
const { spawn } = require('child_process');
const P = require('./paths');
const store = require('./store');
const accounts = require('./accounts');
const core = require('./core');
const { javaMajorFor } = require('./versions');
const { ensureJava } = require('./java');
const { ensureLoader } = require('./loaders');

const running = new Map(); // instanceId -> { proc, startedAt }
const isRunning = (id) => running.has(id);

async function launch(inst, emit) {
  if (running.has(inst.id) || inst.preparing) throw new Error('already_running');
  const d = store.get();
  const s = d.settings;
  const acc = d.accounts.find((a) => a.id === d.selectedAccount);
  if (!acc) throw new Error('no_account');

  const state = (st) => emit('state', { id: inst.id, state: st });
  const log = (line, kind = 'info') => emit('log', { id: inst.id, line, kind });
  const progress = (label, pct) => emit('progress', { id: inst.id, label, pct });
  inst.preparing = true;
  state('preparing');

  try {
    progress({ key: 'check_java' }, 0.02);
    const major = await javaMajorFor(inst.mcVersion);
    const java = await ensureJava(major, (st) => { log(`[Azure] Java ${st.major}: ${st.key}`); progress(st, 0.02 + 0.06 * (st.pct || 0)); });

    progress({ key: 'check_loader' }, 0.08);
    const versionId = (await ensureLoader(inst, java.java, (st) => { log(`[Azure] ${st.key} ${st.loader}`); progress(st, 0.1); }, (l) => log(l, 'installer'))) || inst.mcVersion;
    store.save();

    progress({ key: 'auth' }, 0.12);
    const auth = await accounts.getAuth(acc);

    const gameDir = P.instanceDir(inst.id);
    fs.mkdirSync(gameDir, { recursive: true });

    const prepared = await core.prepare(versionId, gameDir, (e) => {
      log(`[Azure] ${e.key} ${e.task}/${e.total}`, 'debug');
      progress(e, 0.15 + 0.8 * (e.key === 'dl_assets' ? 0.3 + 0.7 * (e.total ? e.task / e.total : 1) : 0.3 * (e.total ? e.task / e.total : 1)));
    });

    const maxRam = inst.ram && inst.ram > 0 ? inst.ram : s.maxRam;
    const minRam = Math.min(s.minRam || 512, maxRam);
    const extraJvm = [s.jvmArgs, inst.jvmArgs].filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
    const args = core.buildCommand({
      prepared, versionId, versionType: inst.mcType === 'snapshot' ? 'snapshot' : 'release',
      gameDir, auth, ramMax: maxRam, ramMin: minRam, extraJvm,
      window: s.fullscreen ? { fullscreen: true } : { width: s.width, height: s.height },
    });

    progress({ key: 'launching' }, 0.97);
    log(`[Azure] ${java.javaw} (-Xmx${maxRam}M) ${versionId}`);
    const proc = spawn(java.javaw, args, { cwd: gameDir, detached: true });
    const feed = (b) => b.toString().split(/\r?\n/).forEach((l) => l && log(l, 'game'));
    proc.stdout.on('data', feed);
    proc.stderr.on('data', feed);
    running.set(inst.id, { proc, startedAt: Date.now() });
    inst.preparing = false;
    inst.lastPlayed = Date.now();
    store.save();

    proc.on('error', (e) => { log(`[Azure] ERROR: ${e.message}`, 'error'); });
    proc.on('close', (code) => {
      const r = running.get(inst.id);
      running.delete(inst.id);
      if (r) { inst.playTime = (inst.playTime || 0) + Math.round((Date.now() - r.startedAt) / 1000); store.save(); }
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

function stop(id) {
  const r = running.get(id);
  if (r) { try { r.proc.kill(); } catch {} }
}

module.exports = { launch, stop, isRunning };
