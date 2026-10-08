const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const UA = 'AzureLauncher/1.0 (github.com/azure-launcher)';

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  return res.json();
}

async function download(url, dest, onProgress) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} - ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let got = 0;
  const src = Readable.fromWeb(res.body);
  src.on('data', (c) => { got += c.length; if (onProgress && total) onProgress(got / total, got, total); });
  const tmp = dest + '.part';
  await pipeline(src, fs.createWriteStream(tmp));
  fs.renameSync(tmp, dest);
  return dest;
}

module.exports = { getJSON, download, UA };
