const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const root = path.join(app.getPath('appData'), '.azurelauncher');
const P = {
  root,
  mc: path.join(root, 'minecraft'),          // shared libraries / assets / versions
  instances: path.join(root, 'instances'),
  runtime: path.join(root, 'runtime'),
  cache: path.join(root, 'cache'),
  data: path.join(root, 'launcher-data.json'),
};
for (const d of [P.root, P.mc, P.instances, P.runtime, P.cache]) fs.mkdirSync(d, { recursive: true });
P.instanceDir = (id) => path.join(P.instances, id);
module.exports = P;
