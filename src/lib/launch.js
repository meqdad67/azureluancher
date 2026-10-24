const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const { execFile } = require('child_process');

// G1 tuned for low frame-time spikes. Skipped when the user already picked another GC.
const FAST_JVM = ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=50', '-XX:+UnlockExperimentalVMOptions', '-XX:+DisableExplicitGC',
  '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40', '-XX:G1HeapRegionSize=16M', '-XX:G1ReservePercent=20', '-XX:InitiatingHeapOccupancyPercent=15', '-XX:+PerfDisableSharedMem'];
// Machines with little RAM: the big-heap tuning above (16M regions, 20% reserve, early marking) wastes memory and makes GC run constantly.
const LOW_JVM = ['-XX:+UseG1GC', '-XX:MaxGCPauseMillis=50', '-XX:+DisableExplicitGC', '-XX:+PerfDisableSharedMem'];
const GC_FLAG = /UseZGC|UseParallelGC|UseSerialGC|UseShenandoahGC|UseG1GC|UseConcMarkSweepGC/;

// Lightest sensible graphics, applied ONCE per instance (so later in-game changes stick).
const LIGHT = { renderDistance: '6', simulationDistance: '5', graphicsMode: '0', fancyGraphics: 'false', particles: '2', entityShadows: 'false', biomeBlendRadius: '0', mipmapLevels: '0', enableVsync: 'false', entityDistanceScaling: '0.5', maxFps: '260' };
const LIGHT_LOW = { ...LIGHT, renderDistance: '4' };
function applyLightOptions(gameDir, low) {
  const LIGHT_USED = low ? LIGHT_LOW : LIGHT;
  const f = require('path').join(gameDir, 'options.txt');
  let lines = [];
  try { lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean); } catch {}
  const seen = new Set();
  lines = lines.map((l) => { const k = l.split(':')[0]; if (k in LIGHT_USED) { seen.add(k); return `${k}:${LIGHT_USED[k]}`; } return l; });
  for (const k of Object.keys(LIGHT_USED)) if (!seen.has(k)) lines.push(`${k}:${LIGHT_USED[k]}`);
  fs.writeFileSync(f, lines.join('\n') + '\n');
}

// Windows: ask for the high-performance GPU for this javaw.exe (same as Settings > Graphics).
function preferDedicatedGpu(exe) {
  if (process.platform !== 'win32' || !exe) return;
  try { execFile('reg', ['add', 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences', '/v', exe, '/t', 'REG_SZ', '/d', 'GpuPreference=2;', '/f'], { windowsHide: true }, () => {}); } catch {}
}
const P = require('./paths');
const store = require('./store');
const accounts = require('./accounts');
const core = require('./core');
const { javaMajorFor } = require('./versions');
const { ensureJava } = require('./java');
const { ensureLoader } = require('./loaders');
const azure = require('./azure');
const skins = require('./skins');
const ram = require('./ram');

function joinArgs(mc) {
  const m = /^1\.(\d+)/.exec(mc);
  const minor = m ? parseInt(m[1], 10) : 99;
  const { host, port } = azure.SERVER;
  return minor >= 20 ? ['--quickPlayMultiplayer', `${host}:${port}`] : ['--server', host, '--port', String(port)];
}

const running = new Map(); // instanceId -> { proc, startedAt }
const isRunning = (id) => running.has(id);

async function launch(inst, emit, opts = {}) {
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
    const elyAgent = acc.type === 'elyby' ? await require('./authlib').agentArg() : null; // Ely.by sessions need authlib-injector
    try { await skins.prepare(inst, acc, (m) => log(m)); } catch (e) { log(`[Azure] skin step failed: ${e.message}`); }

    const gameDir = P.instanceDir(inst.id);
    fs.mkdirSync(gameDir, { recursive: true });

    const prepared = await core.prepare(versionId, gameDir, (e) => {
      log(`[Azure] ${e.key} ${e.task}/${e.total}`, 'debug');
      progress(e, 0.15 + 0.8 * (e.key === 'dl_assets' ? 0.3 + 0.7 * (e.total ? e.task / e.total : 1) : 0.3 * (e.total ? e.task / e.total : 1)));
    });

    const extraJvm = [s.jvmArgs, inst.jvmArgs].filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
    if (elyAgent) extraJvm.unshift(elyAgent);
    const useFast = s.optimizedJvm !== false && !extraJvm.some((a) => GC_FLAG.test(a));
    const rp = ram.plan({ totalMB: store.totalMB, want: inst.ram && inst.ram > 0 ? inst.ram : s.maxRam, minWant: s.minRam, lowSetting: s.lowRam, useFast });
    const { maxRam, minRam, low } = rp;
    if (rp.capped) log(`[Azure] RAM request capped to ${maxRam}MB (this PC has ${store.totalMB}MB; the rest is needed by Windows)`);
    if (s.highPerfGpu !== false) preferDedicatedGpu(java.javaw);
    const lvl = low ? 'low' : 'std';
    if (s.ultraLight !== false && inst.lightApplied !== lvl && !(inst.lightApplied === true && lvl === 'std')) { try { applyLightOptions(gameDir, low); inst.lightApplied = lvl; store.save(); } catch (e) { log(`[Azure] light options skipped: ${e.message}`); } }
    // one line with the machine facts, so slow-FPS reports can be diagnosed from the Console page
    try {
      require('electron').app.getGPUInfo('basic').then((g) => {
        const V = { 4318: 'NVIDIA', 32902: 'Intel', 4098: 'AMD' };
        const gpus = (g.gpuDevice || []).map((d) => (V[d.vendorId] || '0x' + Number(d.vendorId).toString(16)) + (d.active ? '*' : '')).join(', ') || '?';
        const c = os.cpus();
        log(`[Azure] CPU ${c[0] ? c[0].model.trim() : '?'} x${c.length} | RAM ${Math.round(os.totalmem() / 1073741824)}GB | game heap ${maxRam}MB (Xms ${minRam}MB) | low-RAM mode ${low ? 'on' : 'off'} | GPUs ${gpus} (*=active) | fast JVM ${useFast ? 'on' : 'off'}`);
      }).catch(() => {});
    } catch {}
    const w = inst.window;
    const args = core.buildCommand({
      prepared, versionId, versionType: inst.mcType === 'snapshot' ? 'snapshot' : 'release',
      gameDir, auth, ramMax: maxRam, ramMin: minRam, extraJvm: useFast ? [...(low ? LOW_JVM : FAST_JVM), ...extraJvm] : extraJvm, extraGame: opts.join ? joinArgs(inst.mcVersion) : [],
      window: w ? (w.fullscreen ? { fullscreen: true } : { width: w.width, height: w.height }) : (s.fullscreen ? { fullscreen: true } : { width: s.width, height: s.height }),
    });

    progress({ key: 'launching' }, 0.97);
    log(`[Azure] ${java.javaw} (-Xmx${maxRam}M) ${versionId}`);
    const proc = spawn(java.javaw, args, { cwd: gameDir, detached: true });
    let badJvm = false;
    const feed = (b) => b.toString().split(/\r?\n/).forEach((l) => { if (!l) return; if (useFast && /Unrecognized VM option|Could not create the Java Virtual Machine|Unrecognized option/.test(l)) badJvm = true; log(l, 'game'); });
    proc.stdout.on('data', feed);
    proc.stderr.on('data', feed);
    running.set(inst.id, { proc, startedAt: Date.now() });
    try { if (proc.pid) os.setPriority(proc.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL); } catch {} // game gets CPU before background apps
    azure.playing(acc);
    inst.preparing = false;
    inst.lastPlayed = Date.now();
    store.save();

    proc.on('error', (e) => { log(`[Azure] ERROR: ${e.message}`, 'error'); });
    proc.on('close', (code) => {
      const r = running.get(inst.id);
      running.delete(inst.id);
      if (!running.size) azure.playing(null);
      if (r) {
        const secs = Math.round((Date.now() - r.startedAt) / 1000);
        inst.playTime = (inst.playTime || 0) + secs;
        const d = store.get(); d.playLog = d.playLog || {};
        const k = new Date().toLocaleDateString('en-CA');
        const e = d.playLog[k] || { s: 0, n: 0, max: 0 };
        e.s += secs; e.n += 1; e.max = Math.max(e.max, secs); d.playLog[k] = e;
        for (const x of Object.keys(d.playLog).sort().slice(0, -60)) delete d.playLog[x]; // keep ~60 days
        store.save();
      }
      if (badJvm) { s.optimizedJvm = false; store.save(); log('[Azure] optimized JVM flags are not supported by this Java: turned them off, launch again', 'error'); }
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
