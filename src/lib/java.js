const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');
const store = require('./store');
const { download } = require('./net');

function plat() {
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  return { os, arch, ext: os === 'windows' ? 'zip' : 'tar.gz' };
}

function findBin(dir, name) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.name === name && path.basename(d) === 'bin') return full;
    }
  }
  return null;
}

function pair(javaBin) {
  const dir = path.dirname(javaBin);
  const isWin = process.platform === 'win32';
  const java = path.join(dir, isWin ? 'java.exe' : 'java');
  const javaw = path.join(dir, isWin ? 'javaw.exe' : 'java');
  return { java: fs.existsSync(java) ? java : javaBin, javaw: fs.existsSync(javaw) ? javaw : javaBin };
}

/** Returns { java, javaw } for the requested major version, downloading a JRE if needed. */
async function ensureJava(major, onStatus) {
  const custom = store.get().settings.javaPath;
  if (custom && fs.existsSync(custom)) return pair(custom);

  const dest = path.join(P.runtime, `java-${major}`);
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  let bin = findBin(dest, exe);
  if (bin) return pair(bin);

  const { os, arch, ext } = plat();
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const archive = path.join(P.cache, `java-${major}.${ext}`);
  let ok = false, lastErr;
  for (const img of ['jre', 'jdk']) {
    try {
      const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${os}/${arch}/${img}/hotspot/normal/eclipse`;
      onStatus && onStatus({ key: 'dl_java', major, pct: 0 });
      await download(url, archive, (p) => onStatus && onStatus({ key: 'dl_java', major, pct: p }));
      ok = true; break;
    } catch (e) { lastErr = e; }
  }
  if (!ok) throw new Error(`Java ${major} download failed: ${lastErr && lastErr.message}`);

  onStatus && onStatus({ key: 'extract_java', major, pct: 1 });
  if (ext === 'zip') {
    const extract = require('extract-zip');
    await extract(archive, { dir: path.resolve(dest) });
  } else {
    const tar = require('tar');
    await tar.x({ file: archive, cwd: dest });
  }
  fs.rmSync(archive, { force: true });
  bin = findBin(dest, exe);
  if (!bin) throw new Error(`Java ${major} not found after extraction`);
  if (process.platform !== 'win32') { try { fs.chmodSync(bin, 0o755); } catch {} }
  return pair(bin);
}

function run(bin, args, onLine, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, windowsHide: true });
    const feed = (d) => d.toString().split(/\r?\n/).forEach((l) => l.trim() && onLine && onLine(l));
    p.stdout.on('data', feed);
    p.stderr.on('data', feed);
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`exit code ${c}`))));
  });
}

module.exports = { ensureJava, run };
