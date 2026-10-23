/** Isometric 3-face block icons drawn in plain JS (no electron / canvas): affine map per face + supersampling.
 *  A texture is { w, h, data } with data = RGBA bytes (row-major). Faces: top, left (front-left), right (front-right). */
const zlib = require('zlib');

// Hexagon silhouette inside a SIZE x SIZE icon (true isometric: width = sqrt(3) * a, height = 2 * a).
function geometry(size) {
  const a = size * 0.47, hw = a * Math.sqrt(3) / 2, cx = size / 2, cy = size / 2;
  return {
    T: [cx, cy - a], UR: [cx + hw, cy - a / 2], LR: [cx + hw, cy + a / 2],
    B: [cx, cy + a], LL: [cx - hw, cy + a / 2], UL: [cx - hw, cy - a / 2], C: [cx, cy],
  };
}

// each face: origin point + two edge vectors (texture x axis, texture y axis); shade = brightness like Minecraft
function faces(g, shade) {
  const v = (p, q) => [q[0] - p[0], q[1] - p[1]];
  return [
    { name: 'top', o: g.UL, ex: v(g.UL, g.T), ey: v(g.UL, g.C), shade: shade.top },
    { name: 'left', o: g.UL, ex: v(g.UL, g.C), ey: v(g.UL, g.LL), shade: shade.left },
    { name: 'right', o: g.C, ex: v(g.C, g.UR), ey: v(g.C, g.B), shade: shade.right },
  ].map((f) => { const det = f.ex[0] * f.ey[1] - f.ex[1] * f.ey[0]; return { ...f, det }; });
}

/** tex: { top, left, right } textures (right defaults to left). opts: { size=128, ss=3, shade, solid, tint:{top,left,right} } */
function renderCube(tex, opts = {}) {
  const size = opts.size || 128, ss = opts.ss || 3;
  const shade = opts.shade || { top: 1, left: 0.8, right: 0.6 };
  const g = geometry(size), F = faces(g, shade);
  const T = { top: tex.top, left: tex.left || tex.top, right: tex.right || tex.left || tex.top };
  const tint = opts.tint || {};
  const out = Buffer.alloc(size * size * 4);
  const n = ss * ss;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, gg = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss, py = y + (sy + 0.5) / ss;
          for (const f of F) {
            const dx = px - f.o[0], dy = py - f.o[1];
            const u = (dx * f.ey[1] - dy * f.ey[0]) / f.det;   // along texture x
            const v = (f.ex[0] * dy - f.ex[1] * dx) / f.det;   // along texture y
            if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
            const t = T[f.name];
            const tx = Math.min(t.w - 1, Math.floor(u * t.w)), ty = Math.min(t.h - 1, Math.floor(v * t.w)); // square frame (animated strips: first frame)
            const i = (Math.min(ty, t.h - 1) * t.w + tx) * 4;
            let tr = t.data[i], tg = t.data[i + 1], tb = t.data[i + 2], ta = t.data[i + 3];
            const tn = tint[f.name];
            if (opts.solid) { if (ta < 128) { tr = 0x20; tg = 0x40; tb = 0x10; } ta = 255; } // leaves: opaque like "fast" graphics
            if (tn) { tr = (tr * tn[0]) / 255; tg = (tg * tn[1]) / 255; tb = (tb * tn[2]) / 255; }
            const k = ta / 255;
            r += tr * f.shade * k; gg += tg * f.shade * k; b += tb * f.shade * k; a += k;
            break;
          }
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) { out[o] = Math.min(255, Math.round(r / a)); out[o + 1] = Math.min(255, Math.round(gg / a)); out[o + 2] = Math.min(255, Math.round(b / a)); out[o + 3] = Math.round((a / n) * 255); }
    }
  }
  return { size, data: out };
}

/** Straight RGBA -> PNG file bytes (8-bit, filter 0). */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const bgraToTex = (bgra, w, h) => { const d = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h * 4; i += 4) { d[i] = bgra[i + 2]; d[i + 1] = bgra[i + 1]; d[i + 2] = bgra[i]; d[i + 3] = bgra[i + 3]; } return { w, h, data: d }; };

module.exports = { renderCube, encodePNG, bgraToTex, geometry };
