const fs = require('fs');
const os = require('os');
const P = require('./paths');

const totalMB = Math.floor(os.totalmem() / 1048576);
const defaults = () => ({
  settings: {
    language: 'ar',
    maxRam: Math.min(4096, Math.max(1024, Math.floor(totalMB / 2 / 256) * 256)),
    minRam: 512,
    javaPath: '',
    jvmArgs: '',
    closeOnLaunch: false,
    showSnapshots: true,
    showOld: false,
    curseforgeKey: '',
    accent: '#1bd96a',
    width: 1280,
    height: 720,
    fullscreen: false,
    shareWithServer: true,
    seeLauncherSkins: true,
    perfMode: true,
    edition: 'java',
    noLag: false,
    closeToTray: false,
    suspendInGame: true,
    optimizedJvm: true,
    highPerfGpu: true,
    ultraLight: true,
    lowRam: 'auto',
    apiUrl: '',
    apiKey: '',
    terminalLaunch: false,
  },
  accounts: [],
  selectedAccount: null,
  instances: [],
  selectedInstance: null,
  playLog: {},
});

let data = defaults();
try {
  const raw = JSON.parse(fs.readFileSync(P.data, 'utf8'));
  data = { ...data, ...raw, settings: { ...data.settings, ...(raw.settings || {}) } };
} catch {}
// the old default blue accent becomes the new default green
if (data.settings.accent === '#2f8bff') data.settings.accent = '#1bd96a';
// Azure Client mode was removed: keep those instances working as normal Fabric (Legacy Fabric on 1.8.9)
for (const i of data.instances || []) if (i && i.loader === 'azure') i.loader = i.mcVersion === '1.8.9' ? 'legacyfabric' : 'fabric';

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = P.data + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, P.data);
  }, 150);
}
function flush() {
  clearTimeout(timer);
  fs.writeFileSync(P.data, JSON.stringify(data));
}
module.exports = { get: () => data, save, flush, totalMB };
