/** Block pictures for instance icons: reads the textures straight from a Minecraft client jar the launcher already downloaded. */
const fs = require('fs');
const path = require('path');

const GRASS = [0x79, 0xc0, 0x5a], LEAF = [0x48, 0xb5, 0x18];
// [id, label, spec]. spec = texture name (all 3 faces) or { top, left, right?, tint:{top,left,right}, overlay:{face:[tex,tint]}, solid }
// left = front-left face, right = front-right face (defaults to left). Missing textures fall back to the other faces.
const S = (top, side, extra = {}) => ({ top, left: side, ...extra });
const WOOD = (w) => S(`${w}_log_top`, `${w}_log`);
const BLOCKS = [
  ['grass_block', 'Grass Block', S('grass_block_top', 'grass_block_side', { tint: { top: GRASS }, overlay: { left: ['grass_block_side_overlay', GRASS], right: ['grass_block_side_overlay', GRASS] } })],
  ['dirt', 'Dirt', 'dirt'], ['stone', 'Stone', 'stone'], ['cobblestone', 'Cobblestone', 'cobblestone'], ['mossy_cobblestone', 'Mossy Cobblestone', 'mossy_cobblestone'],
  ['oak_planks', 'Oak Planks', 'oak_planks'], ['spruce_planks', 'Spruce Planks', 'spruce_planks'], ['birch_planks', 'Birch Planks', 'birch_planks'], ['jungle_planks', 'Jungle Planks', 'jungle_planks'], ['acacia_planks', 'Acacia Planks', 'acacia_planks'], ['dark_oak_planks', 'Dark Oak Planks', 'dark_oak_planks'],
  ['oak_log', 'Oak Log', WOOD('oak')], ['spruce_log', 'Spruce Log', WOOD('spruce')], ['birch_log', 'Birch Log', WOOD('birch')], ['oak_leaves', 'Oak Leaves', S('oak_leaves', 'oak_leaves', { tint: { top: LEAF, left: LEAF, right: LEAF }, solid: true })],
  ['sand', 'Sand', 'sand'], ['red_sand', 'Red Sand', 'red_sand'], ['gravel', 'Gravel', 'gravel'], ['clay', 'Clay', 'clay'], ['sandstone', 'Sandstone', S('sandstone_top', 'sandstone')], ['glass', 'Glass', 'glass'], ['bricks', 'Bricks', 'bricks'],
  ['tnt', 'TNT', S('tnt_top', 'tnt_side')], ['bookshelf', 'Bookshelf', S('oak_planks', 'bookshelf')], ['obsidian', 'Obsidian', 'obsidian'], ['bedrock', 'Bedrock', 'bedrock'],
  ['crafting_table', 'Crafting Table', S('crafting_table_top', 'crafting_table_front', { right: 'crafting_table_side' })],
  ['furnace', 'Furnace', S('furnace_top', 'furnace_front', { right: 'furnace_side' })],
  ['diamond_block', 'Diamond Block', 'diamond_block'], ['gold_block', 'Gold Block', 'gold_block'], ['iron_block', 'Iron Block', 'iron_block'], ['emerald_block', 'Emerald Block', 'emerald_block'], ['lapis_block', 'Lapis Block', 'lapis_block'],
  ['redstone_block', 'Redstone Block', 'redstone_block'], ['coal_block', 'Coal Block', 'coal_block'], ['copper_block', 'Copper Block', 'copper_block'], ['netherite_block', 'Netherite Block', 'netherite_block'],
  ['diamond_ore', 'Diamond Ore', 'diamond_ore'], ['gold_ore', 'Gold Ore', 'gold_ore'], ['iron_ore', 'Iron Ore', 'iron_ore'], ['coal_ore', 'Coal Ore', 'coal_ore'], ['emerald_ore', 'Emerald Ore', 'emerald_ore'], ['lapis_ore', 'Lapis Ore', 'lapis_ore'], ['redstone_ore', 'Redstone Ore', 'redstone_ore'], ['copper_ore', 'Copper Ore', 'copper_ore'],
  ['netherrack', 'Netherrack', 'netherrack'], ['nether_bricks', 'Nether Bricks', 'nether_bricks'], ['soul_sand', 'Soul Sand', 'soul_sand'], ['glowstone', 'Glowstone', 'glowstone'], ['end_stone', 'End Stone', 'end_stone'], ['purpur_block', 'Purpur Block', 'purpur_block'],
  ['snow', 'Snow', 'snow'], ['ice', 'Ice', 'ice'], ['packed_ice', 'Packed Ice', 'packed_ice'], ['pumpkin', 'Pumpkin', S('pumpkin_top', 'pumpkin_side')], ['melon', 'Melon', S('melon_top', 'melon_side')], ['hay_block', 'Hay Bale', S('hay_block_top', 'hay_block_side')],
  ['white_wool', 'White Wool', 'white_wool'], ['red_wool', 'Red Wool', 'red_wool'], ['blue_wool', 'Blue Wool', 'blue_wool'], ['green_wool', 'Green Wool', 'green_wool'], ['yellow_wool', 'Yellow Wool', 'yellow_wool'], ['black_wool', 'Black Wool', 'black_wool'], ['orange_wool', 'Orange Wool', 'orange_wool'], ['pink_wool', 'Pink Wool', 'pink_wool'], ['purple_wool', 'Purple Wool', 'purple_wool'], ['cyan_wool', 'Cyan Wool', 'cyan_wool'],
  ['terracotta', 'Terracotta', 'terracotta'], ['prismarine', 'Prismarine', 'prismarine'], ['sea_lantern', 'Sea Lantern', 'sea_lantern'], ['slime_block', 'Slime Block', 'slime_block'], ['deepslate', 'Deepslate', 'deepslate'], ['amethyst_block', 'Amethyst Block', 'amethyst_block'],
  ['tuff', 'Tuff', 'tuff'], ['calcite', 'Calcite', 'calcite'], ['mud_bricks', 'Mud Bricks', 'mud_bricks'], ['mossy_stone_bricks', 'Mossy Stone Bricks', 'mossy_stone_bricks'],
];
const specOf = (s) => (typeof s === 'string' ? { top: s, left: s } : s);
const texNames = (s) => { const o = specOf(s), n = [o.top, o.left, o.right]; for (const v of Object.values(o.overlay || {})) n.push(v[0]); return n.filter((x) => typeof x === 'string'); };

const ENTRY = (f) => `assets/minecraft/textures/block/${f}.png`;

function loadYauzl() {
  try { return require('yauzl'); } catch {}
  try { return require(require.resolve('yauzl', { paths: [path.dirname(require.resolve('extract-zip'))] })); } catch {}
  throw new Error('zip_reader_missing');
}

/** Reads only the wanted entries of a zip/jar -> Map(entryName -> Buffer). */
function readEntries(jar, wanted) {
  const yauzl = loadYauzl();
  return new Promise((resolve, reject) => {
    yauzl.open(jar, { lazyEntries: true, autoClose: true }, (err, zf) => {
      if (err) return reject(err);
      const out = new Map();
      zf.on('error', reject);
      zf.on('end', () => resolve(out));
      zf.on('entry', (e) => {
        if (!wanted.has(e.fileName)) return zf.readEntry();
        zf.openReadStream(e, (er, st) => {
          if (er) return zf.readEntry();
          const chunks = [];
          st.on('data', (c) => chunks.push(c));
          st.on('end', () => { out.set(e.fileName, Buffer.concat(chunks)); zf.readEntry(); });
          st.on('error', () => zf.readEntry());
        });
      });
      zf.readEntry();
    });
  });
}

/** Newest downloaded vanilla client jar (or the one for `preferred` if it is downloaded). */
function findJar(preferred) {
  const P = require('./paths');
  const dir = path.join(P.mc, 'versions');
  let ids = []; try { ids = fs.readdirSync(dir); } catch {}
  const ok = ids.map((id) => ({ id, jar: path.join(dir, id, `${id}.jar`) })).filter((x) => fs.existsSync(x.jar));
  const pref = preferred && ok.find((x) => x.id === preferred);
  if (pref) return pref;
  ok.sort((a, b) => fs.statSync(b.jar).mtimeMs - fs.statSync(a.jar).mtimeMs);
  return ok[0] || null;
}

/** overlay (tinted, alpha) drawn over base -> new texture. */
function composite(base, over, tint) {
  const out = { w: base.w, h: base.h, data: Buffer.from(base.data) };
  for (let y = 0; y < base.h; y++) for (let x = 0; x < base.w; x++) {
    const i = (y * base.w + x) * 4, j = (Math.min(over.h - 1, Math.floor((y * over.w) / base.w)) * over.w + Math.floor((x * over.w) / base.w)) * 4, a = over.data[j + 3] / 255;
    if (!a) continue;
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(out.data[i + c] * (1 - a) + (over.data[j + c] * (tint ? tint[c] : 255) / 255) * a);
  }
  return out;
}

/** One block spec + decoded textures (Map name -> tex) -> { top, left, right } textures, or null when nothing is available. */
function facesOf(spec, tx) {
  const o = specOf(spec), get = (n) => (n ? tx.get(n) || null : null);
  let top = get(o.top), left = get(o.left), right = get(o.right) || left;
  const first = top || left || right;
  if (!first) return null;
  top = top || left || right; left = left || top; right = right || left;
  const ov = o.overlay || {};
  const withOv = (face, t) => { const e = ov[face], ot = e && get(e[0]); return ot ? composite(t, ot, e[1]) : t; };
  return { top, left: withOv('left', left), right: withOv('right', right) };
}

async function list(preferred) {
  const P = require('./paths');
  const { nativeImage } = require('electron');
  const { renderCube, encodePNG, bgraToTex } = require('./cube');
  const found = findJar(preferred);
  if (!found) throw new Error('no_game_jar');
  const cache = path.join(P.cache, `blocks3d-v1-${found.id.replace(/[^\w.-]/g, '_')}.json`);
  try { return JSON.parse(fs.readFileSync(cache, 'utf8')); } catch {}
  const names = new Set(); for (const b of BLOCKS) for (const n of texNames(b[2])) names.add(ENTRY(n));
  const files = await readEntries(found.jar, names);
  const tx = new Map();
  for (const [entry, buf] of files) {
    const img = nativeImage.createFromBuffer(buf), { width, height } = img.getSize();
    if (width && height) tx.set(entry.slice(entry.lastIndexOf('/') + 1, -4), bgraToTex(img.toBitmap(), width, height));
  }
  const items = [];
  for (const [id, label, spec] of BLOCKS) {
    const f = facesOf(spec, tx); if (!f) continue;
    const o = specOf(spec);
    const icon = renderCube(f, { size: 128, ss: 3, solid: !!o.solid, tint: o.tint });
    items.push({ name: id, label, url: 'data:image/png;base64,' + encodePNG(128, icon.data).toString('base64') });
    await new Promise((r) => setImmediate(r)); // let the launcher stay responsive between icons
  }
  if (!items.length) throw new Error('no_game_jar');
  try { fs.writeFileSync(cache, JSON.stringify(items)); } catch {}
  return items;
}

module.exports = { list, BLOCKS, readEntries, findJar, facesOf, specOf, texNames };
