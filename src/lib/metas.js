/** Fabric-style loader families: each has a meta server with /<mc> (version list) and /<mc>/<loader>/profile/json. */
const META = {
  fabric: { list: 'https://meta.fabricmc.net/v2/versions/loader', prefix: 'fabric-loader' },
  quilt: { list: 'https://meta.quiltmc.org/v3/versions/loader', prefix: 'quilt-loader' },
  legacyfabric: { list: 'https://meta.legacyfabric.net/v2/versions/loader', prefix: 'legacyfabric-loader' },
  ornithe: { list: 'https://meta.ornithemc.net/v3/versions/fabric-loader', prefix: 'ornithe-loader' },
};
const kindOf = (inst) => inst.loader;
const loaderId = (inst) => { const m = META[kindOf(inst)]; return m ? `${m.prefix}-${inst.loaderVersion}-${inst.mcVersion}` : inst.loaderId || null; };
module.exports = { META, kindOf, loaderId };
