/** Azure server status (Server List Ping) + launcher heartbeat to the AzureLauncherLink plugin. */
const net = require('net');
const dns = require('dns').promises;
const crypto = require('crypto');
const store = require('./store');
const { UA } = require('./net');

const SERVER = { name: 'AzureSMP', host: 'AzureSMP.asrv.qzz.io', port: 25565 };

const varint = (n) => { const b = []; do { let x = n & 0x7f; n >>>= 7; if (n) x |= 0x80; b.push(x); } while (n); return Buffer.from(b); };
const readVarint = (buf, off) => { let r = 0, s = 0, b; do { if (off >= buf.length) return null; b = buf[off++]; r |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return [r, off]; };
const packet = (id, data) => { const body = Buffer.concat([varint(id), data]); return Buffer.concat([varint(body.length), body]); };
const flat = (d) => (typeof d === 'string' ? d : d ? (d.text || '') + (d.extra || []).map(flat).join('') : '');

async function target(host, port) {
  try { const s = await dns.resolveSrv('_minecraft._tcp.' + host); if (s.length) return { host: s[0].name, port: s[0].port }; } catch {}
  return { host, port };
}

async function ping(timeout = 5000) {
  const t = await target(SERVER.host, SERVER.port);
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const sock = net.connect(t.port, t.host);
    let buf = Buffer.alloc(0), done = false;
    const fin = (e, v) => { if (done) return; done = true; sock.destroy(); e ? reject(e) : resolve(v); };
    sock.setTimeout(timeout, () => fin(new Error('timeout')));
    sock.on('error', fin);
    sock.on('connect', () => {
      const h = Buffer.from(SERVER.host);
      sock.write(packet(0, Buffer.concat([varint(765), varint(h.length), h, Buffer.from([SERVER.port >> 8, SERVER.port & 255]), varint(1)])));
      sock.write(packet(0, Buffer.alloc(0)));
    });
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const len = readVarint(buf, 0); if (!len) return;
      if (buf.length < len[1] + len[0]) return;
      const id = readVarint(buf, len[1]);
      const sl = readVarint(buf, id[1]);
      try {
        const j = JSON.parse(buf.slice(sl[1], sl[1] + sl[0]).toString('utf8'));
        fin(null, { online: true, latency: Date.now() - start, players: { online: j.players ? j.players.online : 0, max: j.players ? j.players.max : 0 }, version: j.version ? j.version.name : '', motd: flat(j.description).replace(/§./g, '') });
      } catch (e) { fin(e); }
    });
  });
}

/* ---- heartbeat ---- */
let playingAcc = null, lastStats = null, timer = null;
function installId() {
  const d = store.get();
  if (!d.installId) { d.installId = crypto.randomBytes(8).toString('hex'); store.save(); }
  return d.installId;
}
const base = () => (store.get().settings.apiUrl || `http://${SERVER.host}:8765`).replace(/\/$/, '');

async function beat() {
  const s = store.get().settings;
  if (!s.shareWithServer) { lastStats = null; return null; }
  const q = { id: installId() };
  if (playingAcc) Object.assign(q, { playing: '1', name: playingAcc.name, uuid: playingAcc.uuid });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`${base()}/azure/hb?${new URLSearchParams(q)}`, { method: 'POST', signal: ctrl.signal, headers: { 'User-Agent': UA, 'X-Azure-Key': s.apiKey || '' } });
    lastStats = r.ok ? await r.json() : null;
  } catch { lastStats = null; }
  clearTimeout(to);
  return lastStats;
}

function startHeartbeat() { if (timer) return; beat(); timer = setInterval(beat, 30000); }
function playing(acc) { playingAcc = acc ? { name: acc.name, uuid: acc.uuid } : null; beat(); }

async function status() {
  const [p] = await Promise.allSettled([ping()]);
  return { name: SERVER.name, host: SERVER.host, server: p.status === 'fulfilled' ? p.value : { online: false }, launcher: lastStats };
}

module.exports = { SERVER, status, startHeartbeat, playing };
