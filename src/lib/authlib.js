/** authlib-injector: lets the game authenticate against Ely.by instead of Mojang (-javaagent). Downloaded once, sha256-checked. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const P = require('./paths');
const { getJSON, download } = require('./net');

const API = 'https://authserver.ely.by/api/authlib-injector';
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

async function ensure() {
  const jar = path.join(P.cache, 'authlib-injector.jar'), meta = jar + '.sha256';
  try { if (fs.existsSync(jar) && fs.readFileSync(meta, 'utf8').trim() === sha(jar)) return jar; } catch {}
  const info = await getJSON('https://authlib-injector.yushi.moe/artifact/latest.json');
  const want = info && info.checksums && info.checksums.sha256;
  if (!info || !info.download_url || !want) throw new Error('authlib_missing');
  await download(info.download_url, jar);
  if (sha(jar) !== want) { fs.rmSync(jar, { force: true }); throw new Error('authlib_bad_hash'); }
  fs.writeFileSync(meta, want);
  return jar;
}
const agentArg = async () => `-javaagent:${await ensure()}=${API}`;
module.exports = { agentArg, ensure, API };
