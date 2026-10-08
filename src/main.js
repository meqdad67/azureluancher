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

let win;
const emit = (ch, payload) => {
  if (!win || win.isDestroyed()) return;
  win.webContents.send(ch, payload);
  if (ch === 'closed' && win.isMinimized()) win.restore(); // bring the launcher back when the game exits
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
  app.whenReady().then(createWindow);
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
handle('game:launch', async (id) => {
  const inst = findInst(id);
  const hide = store.get().settings.closeOnLaunch;
  game.launch(inst, emit).then(() => { if (hide && win) win.minimize(); }).catch((e) => emit('launch-error', { id, error: e.message }));
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
