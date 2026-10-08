const crypto = require('crypto');
const { safeStorage } = require('electron');
const store = require('./store');

function enc(t) {
  try { if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(t).toString('base64'); } catch {}
  return 'raw:' + Buffer.from(t).toString('base64');
}
function dec(t) {
  if (!t) return '';
  const [kind, body] = [t.slice(0, t.indexOf(':')), t.slice(t.indexOf(':') + 1)];
  if (kind === 'enc') return safeStorage.decryptString(Buffer.from(body, 'base64'));
  return Buffer.from(body, 'base64').toString();
}

function offlineUUID(name) {
  const h = crypto.createHash('md5').update('OfflinePlayer:' + name).digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

function upsert(acc) {
  const d = store.get();
  const i = d.accounts.findIndex((a) => a.id === acc.id);
  if (i >= 0) d.accounts[i] = { ...d.accounts[i], ...acc }; else d.accounts.push(acc);
  if (!d.selectedAccount) d.selectedAccount = acc.id;
  store.save();
  return acc;
}

function addOffline(name) {
  name = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error('invalid_name');
  const uuid = offlineUUID(name);
  return upsert({ id: 'off-' + uuid, type: 'offline', name, uuid });
}

async function addMicrosoft() {
  const { Auth } = require('msmc');
  const auth = new Auth('select_account');
  const xbox = await auth.launch('electron');
  const mc = await xbox.getMinecraft();
  const uuid = mc.profile.id;
  return upsert({ id: 'ms-' + uuid, type: 'microsoft', name: mc.profile.name, uuid, refresh: enc(xbox.save()) });
}

/** Returns an MCLC-compatible authorization object. */
async function getAuth(acc) {
  if (acc.type === 'offline') {
    return { access_token: '0', client_token: '0', uuid: acc.uuid, name: acc.name, user_properties: '{}', meta: { type: 'mojang', demo: false } };
  }
  const { Auth } = require('msmc');
  const auth = new Auth('select_account');
  const xbox = await auth.refresh(dec(acc.refresh));
  const mc = await xbox.getMinecraft();
  acc.refresh = enc(xbox.save());
  acc.name = mc.profile.name;
  store.save();
  return mc.mclc();
}

function remove(id) {
  const d = store.get();
  d.accounts = d.accounts.filter((a) => a.id !== id);
  if (d.selectedAccount === id) d.selectedAccount = d.accounts[0] ? d.accounts[0].id : null;
  store.save();
}

module.exports = { addOffline, addMicrosoft, getAuth, remove };
