const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const P = require('./lib/paths');
const store = require('./lib/store');
const accounts = require('./lib/accounts');
const versions = require('./lib/versions');
const mods = require('./lib/mods');
const game = require('./lib/launch');
const azure = require('./lib/azure');
const packs = require('./lib/modpacks');
const skins = require('./lib/skins');
const ram = require('./lib/ram');
const { autoUpdater } = require('electron-updater');

let win;
// game output can be thousands of lines: send it in batches, not one IPC message per line
const os = require('os');
let forceGc = () => {};
try { require('v8').setFlagsFromString('--expose-gc'); forceGc = require('vm').runInNewContext('gc'); } catch {}
// every launcher process (main + Chromium helpers) runs below normal priority while the game is on
function launcherPriority(low) {
  try {
    const pri = low ? os.constants.priority.PRIORITY_BELOW_NORMAL : os.constants.priority.PRIORITY_NORMAL;
    os.setPriority(process.pid, pri);
    for (const m of app.getAppMetrics()) { try { os.setPriority(m.pid, pri); } catch {} }
  } catch {}
}
// a download can emit thousands of progress events: the UI only needs ~8 per second
const progT = new Map();
process.on('uncaughtException', (e) => { try { console.error('[Azure] uncaught', e); } catch {} });
process.on('unhandledRejection', (e) => { try { console.error('[Azure] unhandled', e); } catch {} });
let logBuf = [], logTimer = null, suspended = false, pendingClosed = null;
const flushLogs = () => { logTimer = null; if (win && !win.isDestroyed() && logBuf.length) { win.webContents.send('logs', logBuf); logBuf = []; } };
const anyRunning = () => store.get().instances.some((i) => game.isRunning(i.id));
const emit = (ch, payload) => {
  if (ch === 'log') { logBuf.push(payload); if (logBuf.length > 400) logBuf.splice(0, logBuf.length - 400); if (!logTimer && win && !win.isDestroyed()) logTimer = setTimeout(flushLogs, 150); return; }
  if (ch === 'closed') {
    setTimeout(() => tryInstall(), 3000);
    if (suspended && !anyRunning()) { pendingClosed = payload; createWindow(); return; } // game exited: bring the launcher back
  }
  if (ch === 'progress') {
    let e = progT.get(payload.id); if (!e) { e = { t: 0, timer: null, last: null }; progT.set(payload.id, e); }
    const now = Date.now();
    if (now - e.t < 120 && payload.pct < 1) {
      e.last = payload;
      if (!e.timer) e.timer = setTimeout(() => { e.timer = null; e.t = Date.now(); const p = e.last; e.last = null; if (p && win && !win.isDestroyed()) win.webContents.send('progress', p); }, 120);
      return;
    }
    e.t = now;
  }
  if (!win || win.isDestroyed()) return;
  win.webContents.send(ch, payload);
  if (ch === 'closed' && win.isMinimized()) win.restore();
};

let tray = null, quitting = false;
app.on('before-quit', () => { quitting = true; });
function showWin() { if (!win || win.isDestroyed()) { createWindow(); return; } if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function buildTray() {
  const ar = store.get().settings.language === 'ar';
  if (!tray) {
    const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('Azure Launcher');
    tray.on('click', showWin);
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: ar ? 'فتح اللانشر' : 'Open launcher', click: showWin },
    { type: 'separator' },
    { label: ar ? 'إغلاق اللانشر' : 'Quit launcher', click: () => { quitting = true; app.quit(); } },
  ]));
}

/* While the game runs the launcher window is destroyed (no GPU/RAM/CPU used); the tray icon and the
 * server heartbeat stay alive in the main process, and the window comes back when the game exits. */
function suspendLauncher() {
  if (!win || win.isDestroyed() || !anyRunning()) return;
  suspended = true;
  try { win.webContents.session.clearCache().catch(() => {}); } catch {}
  win.destroy(); win = null;
  if (tray) tray.setToolTip('Azure Launcher — playing');
  // let Chromium release the window, then drop memory and CPU priority
  setTimeout(() => { if (suspended) { launcherPriority(true); forceGc(); } }, 2500);
  setTimeout(() => { if (suspended) { launcherPriority(true); forceGc(); } }, 15000);
}

function createWindow() {
  if (suspended) launcherPriority(false);
  suspended = false;
  if (tray) tray.setToolTip('Azure Launcher');
  win = new BrowserWindow({
    width: 1220, height: 760, minWidth: 1000, minHeight: 660,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    backgroundColor: '#050a15',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.once('did-finish-load', () => { flushLogs(); if (pendingClosed && win && !win.isDestroyed()) { win.webContents.send('closed', pendingClosed); pendingClosed = null; } });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', (e) => { if (!quitting && store.get().settings.closeToTray) { e.preventDefault(); win.hide(); } }); // keep running in the tray
  // never stay frozen: reload the UI if it stops responding or its process dies
  let unresp = null;
  win.on('unresponsive', () => { clearTimeout(unresp); unresp = setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.reload(); }, 6000); });
  win.on('responsive', () => clearTimeout(unresp));
  win.webContents.on('render-process-gone', () => { if (win && !win.isDestroyed()) setTimeout(() => win && !win.isDestroyed() && win.webContents.reload(), 500); });
  win.on('maximize', () => emit('win-state', { maximized: true }));
  win.on('unmaximize', () => emit('win-state', { maximized: false }));
}

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on('second-instance', () => showWin());
  app.whenReady().then(() => { createWindow(); buildTray(); azure.startHeartbeat(); setupUpdater(); setTimeout(() => skins.syncOwn().catch(() => {}), 6000); });
}
app.on('window-all-closed', () => { if (suspended || anyRunning()) return; store.flush(); app.quit(); });

/* ---------- state ---------- */
const safeAccounts = () => store.get().accounts.map(({ refresh, ...a }) => ({ ...a, skinData: skins.dataUrl(a) }));
function getState() {
  const d = store.get();
  return {
    settings: d.settings,
    accounts: safeAccounts(),
    selectedAccount: d.selectedAccount,
    instances: d.instances.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)), // pinned first, otherwise creation order
    selectedInstance: d.selectedInstance,
    playLog: d.playLog || {},
    running: d.instances.filter((i) => game.isRunning(i.id)).map((i) => i.id),
    totalRam: store.totalMB,
    ramCap: ram.heapCap(store.totalMB),
    lowRam: ram.isLow(store.totalMB, d.settings.lowRam),
    platform: process.platform,
    version: app.getVersion(),
    dataDir: P.root,
  };
}
const findInst = (id) => {
  const i = store.get().instances.find((x) => x.id === id);
  if (!i) throw new Error('instance_not_found');
  return i;
};
const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => {
  try { return { ok: true, data: await fn(...a) }; }
  catch (err) { return { ok: false, error: err.message || String(err) }; }
});

/* ---------- window ---------- */
handle('win:min', () => win.minimize());
handle('win:max', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
handle('win:close', () => win.close());
handle('open:url', (u) => { if (/^https:\/\//.test(u)) shell.openExternal(u); });

/* ---------- state / settings ---------- */
handle('state:get', () => getState());
handle('settings:set', (patch) => {
  const s = store.get().settings;
  Object.assign(s, patch);
  s.maxRam = Math.max(512, Math.min(Number(s.maxRam) || 2048, store.totalMB));
  s.minRam = Math.max(256, Math.min(Number(s.minRam) || 512, s.maxRam));
  store.save();
  buildTray(); // language may have changed
  return store.get().settings;
});
handle('data:open', () => shell.openPath(P.root));
handle('java:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], title: 'java' });
  return r.canceled ? null : r.filePaths[0];
});

/* ---------- versions ---------- */
handle('mc:versions', () => versions.mcVersions());
handle('loader:versions', (loader, mc) => versions.loaderVersions(loader, mc));

/* ---------- instances ---------- */
/* Instance picture: pick an image, crop to a square, shrink to 128px so it stays small in the store. */
const okIcon = (v) => typeof v === 'string' && (v === '' || (/^data:image\/(png|jpeg|webp);base64,/.test(v) && v.length < 400000));
handle('instance:pickIcon', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const img = nativeImage.createFromPath(r.filePaths[0]);
  if (img.isEmpty()) throw new Error('bad_image');
  const { width: w, height: h } = img.getSize(), side = Math.min(w, h);
  const png = img.crop({ x: Math.floor((w - side) / 2), y: Math.floor((h - side) / 2), width: side, height: side }).resize({ width: 128, height: 128, quality: 'good' }).toPNG();
  return 'data:image/png;base64,' + png.toString('base64');
});
handle('blocks:list', (preferred) => require('./lib/blocks').list(preferred));
handle('instance:create', (data) => {
  const d = store.get();
  const inst = {
    id: crypto.randomBytes(5).toString('hex'),
    name: String(data.name || 'Minecraft').slice(0, 40),
    mcVersion: data.mcVersion,
    mcType: data.mcType || 'release',
    loader: data.loader || 'vanilla',
    loaderVersion: data.loaderVersion || '',
    loaderFull: data.loaderFull || '',
    ram: Number(data.ram) || 0,
    jvmArgs: data.jvmArgs || '',
    icon: okIcon(data.icon) ? data.icon : '',
    hue: Math.floor(Math.random() * 360),
    created: Date.now(), lastPlayed: 0, playTime: 0,
  };
  if (!inst.mcVersion) throw new Error('missing_version');
  d.instances.push(inst);
  d.selectedInstance = inst.id;
  fs.mkdirSync(P.instanceDir(inst.id), { recursive: true });
  // light graphics for a brand-new instance (only if Minecraft has not written its own options yet)
  try {
    const of = path.join(P.instanceDir(inst.id), 'options.txt');
    if (!fs.existsSync(of)) fs.writeFileSync(of, ['renderDistance:8', 'simulationDistance:8', 'graphicsMode:0', 'fancyGraphics:false', 'particles:2', 'entityShadows:false', 'biomeBlendRadius:1', 'mipmapLevels:2', 'enableVsync:false', 'maxFps:260', ''].join('\n'));
  } catch {}
  store.save();
  return getState();
});
handle('instance:update', (id, patch) => {
  const inst = findInst(id);
  const critical = ['mcVersion', 'loader', 'loaderVersion'].some((k) => k in patch && patch[k] !== inst[k]);
  for (const k of ['name', 'mcVersion', 'mcType', 'loader', 'loaderVersion', 'loaderFull', 'ram', 'jvmArgs']) if (k in patch) inst[k] = patch[k];
  if ('icon' in patch && okIcon(patch.icon)) inst.icon = patch.icon;
  if ('window' in patch) {
    const w = patch.window, n = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || lo));
    if (!w) delete inst.window;
    else inst.window = { width: n(w.width, 320, 7680), height: n(w.height, 240, 4320), fullscreen: !!w.fullscreen };
  }
  if (critical) delete inst.loaderId;
  store.save();
  return getState();
});
handle('instance:delete', async (id) => {
  const d = store.get();
  if (game.isRunning(id)) throw new Error('already_running');
  d.instances = d.instances.filter((i) => i.id !== id);
  if (d.selectedInstance === id) d.selectedInstance = d.instances[0] ? d.instances[0].id : null;
  store.save();
  await fs.promises.rm(P.instanceDir(id), { recursive: true, force: true }); // async: deleting a big world must not freeze the launcher
  return getState();
});
handle('instance:select', (id) => { store.get().selectedInstance = id; store.save(); });
handle('instance:folder', (id, sub) => { const dir = path.join(P.instanceDir(id), sub || ''); fs.mkdirSync(dir, { recursive: true }); return shell.openPath(dir); });
handle('instance:pin', (id) => { const i = findInst(id); if (i.pinned) delete i.pinned; else i.pinned = true; store.save(); return getState(); });
handle('instance:duplicate', async (id) => {
  const src = findInst(id);
  if (game.isRunning(id)) throw new Error('already_running');
  const d = store.get();
  const copy = { ...JSON.parse(JSON.stringify(src)), id: crypto.randomBytes(5).toString('hex'), name: String(src.name + ' (copy)').slice(0, 40), created: Date.now(), lastPlayed: 0, playTime: 0 };
  delete copy.pinned; delete copy.preparing;
  const from = P.instanceDir(src.id), to = P.instanceDir(copy.id);
  if (fs.existsSync(from)) await fs.promises.cp(from, to, { recursive: true }); else fs.mkdirSync(to, { recursive: true });
  d.instances.push(copy);
  store.save();
  return getState();
});
// zip of the instance's mods/config/resourcepacks/shaderpacks/options.txt (tar -a on Windows/macOS, zip on Linux)
handle('instance:export', async (id) => {
  const inst = findInst(id), dir = P.instanceDir(id);
  const items = ['mods', 'config', 'resourcepacks', 'shaderpacks', 'options.txt'].filter((n) => fs.existsSync(path.join(dir, n)));
  if (!items.length) throw new Error('export_empty');
  const r = await dialog.showSaveDialog(win, { defaultPath: (inst.name || 'instance').replace(/[\\/:*?"<>|]/g, '_') + '.zip', filters: [{ name: 'ZIP', extensions: ['zip'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.rmSync(r.filePath, { force: true });
  const { execFile } = require('child_process');
  const [cmd, args] = process.platform === 'linux' ? ['zip', ['-r', '-q', r.filePath, ...items]] : ['tar', ['-a', '-c', '-f', r.filePath, ...items]];
  await new Promise((resolve, reject) => execFile(cmd, args, { cwd: dir, windowsHide: true, maxBuffer: 1 << 20 }, (err, _o, se) => (err ? reject(new Error(err.code === 'ENOENT' ? 'export_tool_missing' : (se || err.message))) : resolve())));
  return r.filePath;
});
// repair: delete the game jar, natives and loader folder so the next launch downloads/extracts them again
handle('instance:repair', async (id) => {
  const inst = findInst(id);
  if (game.isRunning(id)) throw new Error('already_running');
  const safe = (v) => typeof v === 'string' && /^[\w.+-]+$/.test(v);
  const vroot = path.join(P.mc, 'versions'), rm = (p) => fs.promises.rm(p, { recursive: true, force: true });
  if (!safe(inst.mcVersion)) throw new Error('bad_path');
  await rm(path.join(vroot, inst.mcVersion, `${inst.mcVersion}.jar`));
  await rm(path.join(vroot, inst.mcVersion, 'natives'));
  const loaderDir = inst.loader === 'vanilla' ? null : require('./lib/metas').loaderId(inst);
  if (loaderDir && safe(loaderDir)) await rm(path.join(vroot, loaderDir));
  delete inst.loaderId;
  store.save();
  return true;
});

/* ---------- accounts ---------- */
handle('account:offline', (name) => { accounts.addOffline(name); return getState(); });
handle('account:microsoft', async () => { await accounts.addMicrosoft(); return getState(); });
handle('account:remove', (id) => { const a = store.get().accounts.find((x) => x.id === id); if (a) { const n = a.name; if (a.skin) azure.skinDelete(n).catch(() => {}); skins.clearSkin(a); } accounts.remove(id); return getState(); });
const findAcc = (id) => { const a = store.get().accounts.find((x) => x.id === id); if (!a) throw new Error('account_not_found'); return a; };
handle('skin:pick', async (id) => {
  const acc = findAcc(id);
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'PNG', extensions: ['png'] }] });
  if (!r.canceled) { skins.setSkin(acc, r.filePaths[0]); skins.syncOwn().catch(() => {}); }
  return getState();
});
handle('skin:clear', (id) => { const a = findAcc(id); const n = a.name; skins.clearSkin(a); azure.skinDelete(n).catch(() => {}); return getState(); });
handle('account:select', (id) => { store.get().selectedAccount = id; store.save(); return getState(); });

/* ---------- game ---------- */
handle('game:launch', async (id, opts) => {
  const inst = findInst(id);
  game.launch(inst, emit, { join: !!(opts && opts.join) }).then(() => { if (store.get().settings.suspendInGame !== false) suspendLauncher(); }).catch((e) => emit('launch-error', { id, error: e.message }));
});
handle('game:stop', (id) => game.stop(id));

/* ---------- mods ---------- */
handle('mods:search', (id, q) => mods.search(findInst(id), q));
handle('mods:install', async (id, item) => {
  const files = await mods.install(findInst(id), item, (f) => emit('mod-status', { id, file: f }));
  return files;
});
handle('mods:perf', (id) => mods.installPerf(findInst(id), (f) => emit('mod-status', { id, file: f })));
handle('mods:list', (id, type) => mods.listAsync(findInst(id), type));
handle('mods:toggle', (id, type, file) => mods.toggle(findInst(id), type, file));
handle('mods:remove', (id, type, file) => mods.remove(findInst(id), type, file));

handle('mods:addLocal', async (id, type) => {
  const inst = findInst(id);
  const exts = type === 'mod' ? ['jar'] : ['zip'];
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: exts.join(', '), extensions: exts }] });
  return r.canceled ? 0 : mods.addLocal(inst, type, r.filePaths);
});

/* ---------- modpacks ---------- */
const packProg = (e) => emit('pack-progress', e);
handle('packs:search', (q) => packs.search(q));
handle('packs:install', async (projectId) => packs.installFromModrinth(projectId, packProg));
handle('packs:importFile', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Modpack', extensions: ['mrpack', 'zip'] }] });
  return r.canceled ? null : packs.importFile(r.filePaths[0], packProg);
});

/* ---------- server panel ---------- */
handle('server:status', () => azure.status());

/* Minecraft news (right panel). Fetched here because the renderer's CSP blocks network requests. */
let newsCache = { at: 0, items: [] };
handle('news:get', async () => {
  if (newsCache.items.length && Date.now() - newsCache.at < 30 * 60 * 1000) return newsCache.items;
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch('https://launchercontent.mojang.com/news.json', { signal: ctrl.signal, headers: { 'User-Agent': 'AzureLauncher' } });
    if (!r.ok) throw new Error('news http ' + r.status);
    const j = await r.json();
    const base = 'https://launchercontent.mojang.com';
    const abs = (u) => (!u ? '' : /^https:\/\//.test(u) ? u : base + (u.startsWith('/') ? '' : '/') + u);
    const items = (j.entries || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8).map((e) => ({
      title: String(e.title || ''), date: e.date || '',
      image: abs((e.newsPageImage && e.newsPageImage.url) || (e.playPageImage && e.playPageImage.url)),
      link: /^https:\/\//.test(e.readMoreLink || '') ? e.readMoreLink : '',
    }));
    newsCache = { at: Date.now(), items }; return items;
  } finally { clearTimeout(to); }
});

/* ---------- auto update (GitHub Releases) ----------
 * The launcher updates itself when it is opened. The user may skip for the first 24 hours after the
 * release; after that the update is mandatory (downloaded and installed automatically). */
const DAY = 24 * 3600 * 1000;
let pending = null; // { version, deadline, forced, skipped, downloaded, downloading, pct }
const gameRunning = () => store.get().instances.some((i) => game.isRunning(i.id));
const upd = (extra) => emit('update', pending ? { version: pending.version, deadline: pending.deadline, forced: pending.forced, ...extra } : null);

function tryInstall() {
  if (!pending || !pending.downloaded || pending.skipped) return;
  if (gameRunning()) { upd({ state: 'waitGame' }); return; } // never kill a running session: install when the game closes
  upd({ state: 'installing' });
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500);
}
function startDownload() {
  if (!pending || pending.downloading || pending.downloaded) return;
  pending.downloading = true;
  upd({ state: 'downloading', pct: pending.pct || 0 });
  autoUpdater.downloadUpdate().catch(() => { pending.downloading = false; if (pending.forced) upd({ state: 'error' }); });
}
function force() {
  if (!pending) return;
  pending.forced = true; pending.skipped = false;
  if (pending.downloaded) tryInstall(); else startDownload();
}

function setupUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('update-available', (info) => {
    if (pending && pending.version === info.version) return;
    const d = store.get();
    d.updateSeen = d.updateSeen || {};
    if (!d.updateSeen[info.version]) d.updateSeen[info.version] = Date.now();
    store.save();
    const rel = Date.parse(info.releaseDate);
    const base = Number.isFinite(rel) ? rel : d.updateSeen[info.version];
    pending = { version: info.version, deadline: base + DAY, forced: false, skipped: false, downloaded: false, downloading: false, pct: 0 };
    if (Date.now() >= pending.deadline) pending.forced = true;
    startDownload();
  });
  autoUpdater.on('download-progress', (p) => { if (!pending) return; pending.pct = p.percent / 100; if (!pending.skipped) upd({ state: 'downloading', pct: pending.pct }); });
  autoUpdater.on('update-downloaded', () => { if (!pending) return; pending.downloaded = true; pending.downloading = false; tryInstall(); });
  autoUpdater.on('error', () => { if (!pending) return; pending.downloading = false; if (pending.forced) upd({ state: 'error' }); });
  const tick = () => {
    if (anyRunning()) return; // never check/download updates while a game is running
    if (pending && !pending.forced && Date.now() >= pending.deadline) force(); // skipping is only allowed for the first day
    autoUpdater.checkForUpdates().catch(() => {});
  };
  setTimeout(tick, 4000);
  setInterval(tick, 3600 * 1000);
}
handle('update:skip', () => {
  if (!pending || pending.forced || Date.now() >= pending.deadline) throw new Error('update_required');
  pending.skipped = true;
  emit('update', null);
});
handle('update:retry', () => { if (pending) { pending.downloading = false; force(); startDownload(); } });

/* ---------- instance page: worlds / screenshots / files ---------- */
const inInst = (id, rel) => {
  const base = path.resolve(P.instanceDir(id));
  const p = path.resolve(base, rel || '');
  if (p !== base && !p.startsWith(base + path.sep)) throw new Error('bad_path');
  return p;
};
async function listDir(dir) { try { return await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return []; } }
handle('inst:worlds', async (id) => {
  const dir = inInst(id, 'saves');
  const out = [];
  for (const e of await listDir(dir)) if (e.isDirectory()) { try { out.push({ name: e.name, mtime: (await fs.promises.stat(path.join(dir, e.name))).mtimeMs }); } catch {} }
  return out.sort((a, b) => b.mtime - a.mtime);
});
handle('inst:shots', async (id) => {
  const dir = inInst(id, 'screenshots');
  const out = [];
  for (const e of await listDir(dir)) {
    if (!e.isFile() || !/\.(png|jpe?g)$/i.test(e.name)) continue;
    try { out.push({ name: e.name, url: pathToFileURL(path.join(dir, e.name)).href, mtime: (await fs.promises.stat(path.join(dir, e.name))).mtimeMs }); } catch {}
  }
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, 80);
});
handle('inst:files', async (id, sub) => {
  const dir = inInst(id, sub);
  const out = [];
  for (const e of (await listDir(dir)).slice(0, 400)) {
    try { const st = await fs.promises.stat(path.join(dir, e.name)); out.push({ name: e.name, dir: e.isDirectory(), size: st.size, mtime: st.mtimeMs }); } catch {}
  }
  return out.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
});
handle('inst:open', (id, rel) => {
  const p = inInst(id, rel);
  if (!fs.existsSync(p)) fs.mkdirSync(/\.[a-z0-9]+$/i.test(p) ? path.dirname(p) : p, { recursive: true }); // e.g. a saves/ or screenshots/ folder that does not exist yet
  return shell.openPath(p);
});
