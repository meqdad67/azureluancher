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
    accent: '#2f8bff',
    width: 1280,
    height: 720,
    fullscreen: false,
  },
  accounts: [],
  selectedAccount: null,
  instances: [],
  selectedInstance: null,
});

let data = defaults();
try {
  const raw = JSON.parse(fs.readFileSync(P.data, 'utf8'));
  data = { ...data, ...raw, settings: { ...data.settings, ...(raw.settings || {}) } };
} catch {}

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = P.data + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, P.data);
  }, 150);
}
function flush() {
  clearTimeout(timer);
  fs.writeFileSync(P.data, JSON.stringify(data, null, 2));
}
module.exports = { get: () => data, save, flush, totalMB };
