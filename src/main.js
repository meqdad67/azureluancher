const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
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
const { autoUpdater } = require('electron-updater');

let win;
const emit = (ch, payload) => {
  if (!win || win.isDestroyed()) return;
  win.webContents.send(ch, payload);
  if (ch === 'closed') { if (win.isMinimized()) win.restore(); setTimeout(() => tryInstall(), 3000); } // bring the launcher back when the game exits
};

function createWindow() {
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
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('maximize', () => emit('win-state', { maximized: true }));
  win.on('unmaximize', () => emit('win-state', { maximized: false }));
}

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { createWindow(); azure.startHeartbeat(); setupUpdater(); });
}
app.on('window-all-closed', () => { store.flush(); app.quit(); });

/* ---------- state ---------- */
const safeAccounts = () => store.get().accounts.map(({ refresh, ...a }) => a);
function getState() {
  const d = store.get();
  return {
    settings: d.settings,
    accounts: safeAccounts(),
    selectedAccount: d.selectedAccount,
    instances: d.instances,
    selectedInstance: d.selectedInstance,
    running: d.instances.filter((i) => game.isRunning(i.id)).map((i) => i.id),
    totalRam: store.totalMB,
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
    hue: Math.floor(Math.random() * 360),
    created: Date.now(), lastPlayed: 0, playTime: 0,
  };
  if (!inst.mcVersion) throw new Error('missing_version');
  d.instances.push(inst);
  d.selectedInstance = inst.id;
  fs.mkdirSync(P.instanceDir(inst.id), { recursive: true });
  store.save();
  return getState();
});
handle('instance:update', (id, patch) => {
  const inst = findInst(id);
  const critical = ['mcVersion', 'loader', 'loaderVersion'].some((k) => k in patch && patch[k] !== inst[k]);
  for (const k of ['name', 'mcVersion', 'mcType', 'loader', 'loaderVersion', 'loaderFull', 'ram', 'jvmArgs']) if (k in patch) inst[k] = patch[k];
  if (critical) delete inst.loaderId;
  store.save();
  return getState();
});
handle('instance:delete', (id) => {
  const d = store.get();
  if (game.isRunning(id)) throw new Error('already_running');
  d.instances = d.instances.filter((i) => i.id !== id);
  if (d.selectedInstance === id) d.selectedInstance = d.instances[0] ? d.instances[0].id : null;
  fs.rmSync(P.instanceDir(id), { recursive: true, force: true });
  store.save();
  return getState();
});
handle('instance:select', (id) => { store.get().selectedInstance = id; store.save(); });
handle('instance:folder', (id, sub) => { const dir = path.join(P.instanceDir(id), sub || ''); fs.mkdirSync(dir, { recursive: true }); return shell.openPath(dir); });

/* ---------- accounts ---------- */
handle('account:offline', (name) => { accounts.addOffline(name); return getState(); });
handle('account:microsoft', async () => { await accounts.addMicrosoft(); return getState(); });
handle('account:remove', (id) => { accounts.remove(id); return getState(); });
handle('account:select', (id) => { store.get().selectedAccount = id; store.save(); return getState(); });

/* ---------- game ---------- */
handle('game:launch', async (id, opts) => {
  const inst = findInst(id);
  const hide = store.get().settings.closeOnLaunch;
  game.launch(inst, emit, { join: !!(opts && opts.join) }).then(() => { if (hide && win) win.minimize(); }).catch((e) => emit('launch-error', { id, error: e.message }));
});
handle('game:stop', (id) => game.stop(id));

/* ---------- mods ---------- */
handle('mods:search', (id, q) => mods.search(findInst(id), q));
handle('mods:install', async (id, item) => {
  const files = await mods.install(findInst(id), item, (f) => emit('mod-status', { id, file: f }));
  return files;
});
handle('mods:list', (id, type) => mods.list(findInst(id), type));
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
