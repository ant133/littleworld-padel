// Palette: the FIXED 90-colour palette, OKLab helpers, the 32^3 nearest-colour LUT (as a 1024x32 RGBA image) and Bayer matrices.
// Pure data + maths: loads in Node (tools/load.js) and the browser. THREE is only touched inside buildLUT(THREE).
(function (HPO) {
  'use strict';

  // Ramps run dark -> light. World modules should pick colours from here (palette.ramps.*) or run hex through palette.snap(hex)
  // so surfaces land on exact palette entries; lit/shadowed faces then fall onto neighbouring steps of the same ramp.
  const RAMPS = {
    slate:      ['#0b1220', '#1c2a3c', '#36485e', '#5b6e86', '#8a9bb0', '#bcc9d8', '#e9eff5'],     // cool greys (metal, concrete, mesh)
    warmGrey:   ['#2a2220', '#4b403a', '#766a5f', '#a3978a', '#cfc5b5', '#fffaf0'],               // warm greys, last = brand cream
    white:      ['#ffffff'],
    blue:       ['#123954', '#14548f', '#177dc5', '#3050d8', '#3f9be0', '#7bbdf0', '#b6dcf8'],     // ink #123954, brand blue #177dc5; blue turf
    teal:       ['#07393b', '#0b5a5c', '#12807d', '#1fa598', '#22c4d8', '#55c7b4', '#9ae3d0'],                // teal turf, water, pool
    sky:        ['#4cc3ee', '#dff3ff'],                                                 // day sky
    terracotta: ['#4a1d14', '#7a2f1e', '#a8452a', '#cf6a3e', '#e8946a'],                // clay turf, roof tiles, brick
    green:      ['#07170d', '#0d2b1a', '#17462a', '#236a35', '#36903f', '#5db04a', '#3cd070', '#8fcc58', '#bfe58a', '#e3f4bf'], // grass, hedges, trees
    olive:      ['#66741f'],                                                                       // dry grass / olive
    skin:       ['#3b2218', '#6b4028', '#99623c', '#c68a5c', '#e0a97c', '#f0c8a0', '#fbe0c4'],     // skin tones
    yellow:     ['#6e4f0a', '#b07f10', '#e2ad1c', '#f7d23c', '#d8f24a', '#fff4b3'],                // golds, ball #d8f24a, brand highlight #fff4b3
    orange:     ['#f05a28', '#e8782a', '#f6a443', '#ffd9a0'],                                                 // oranges, sunset, peach
    red:        ['#4a0f1a', '#7e1a28', '#b32a35', '#dc4040', '#f07a6e', '#f7b3a8'],
    pink:       ['#5a1a4a', '#a8286a', '#e05a98', '#f7a8c8'],
    purple:     ['#1f1236', '#3a2468', '#5b3c9a', '#8466c4', '#9a52e0', '#b39ae0', '#dccff4'],
    night:      ['#050a1c', '#0c1b3d', '#1a2f63', '#5a7cc4'],                          // night sky / moonlit blues
    wood:       ['#52341e', '#7d5230', '#a87a48', '#d1a56c'],                           // trunks, benches, decks
    sand:       ['#a89560', '#d3bd84']                                                  // sand, stone, paths
  };
  const ORDER = ['slate', 'warmGrey', 'white', 'blue', 'teal', 'sky', 'terracotta', 'green', 'olive', 'skin', 'yellow', 'orange', 'red', 'pink', 'purple', 'night', 'wood', 'sand'];
  const COLORS = [];
  const RAMP_IDX = {};
  ORDER.forEach(function (k) { RAMP_IDX[k] = []; RAMPS[k].forEach(function (h) { RAMP_IDX[k].push(COLORS.length); COLORS.push(h.toLowerCase()); }); });

  // ---------- colour maths ----------
  function hexToRgb(h) {
    if (typeof h === 'number') return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
    if (h && typeof h === 'object' && 'r' in h) return [Math.round(h.r * 255), Math.round(h.g * 255), Math.round(h.b * 255)]; // THREE.Color
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) { return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1); }
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function delin(c) { c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); }
  // sRGB (0..255) -> OKLab [L,a,b]
  function srgbToOklab(r, g, b) {
    const R = lin(r), G = lin(g), B = lin(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function oklabToSrgb(L, a, b) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3), m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3), s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [delin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), delin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), delin(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
  }
  function hexToOklab(h) { const c = hexToRgb(h); return srgbToOklab(c[0], c[1], c[2]); }

  const RGB = COLORS.map(hexToRgb);
  const LAB = RGB.map(function (c) { return srgbToOklab(c[0], c[1], c[2]); });

  function nearestIndexRgb(r, g, b) {
    const q = srgbToOklab(r, g, b); let best = 0, bd = 1e9;
    for (let i = 0; i < LAB.length; i++) { const L = LAB[i], d = (L[0] - q[0]) * (L[0] - q[0]) + (L[1] - q[1]) * (L[1] - q[1]) + (L[2] - q[2]) * (L[2] - q[2]); if (d < bd) { bd = d; best = i; } }
    return best;
  }

  // ---------- Bayer matrices (standard maximally-dispersed ordered dither, values 0..n*n-1) ----------
  function bayer(n) {
    let m = [0];
    for (let size = 1; size < n; size *= 2) {
      const s2 = size * 2, out = new Array(s2 * s2);
      for (let y = 0; y < s2; y++) for (let x = 0; x < s2; x++) {
        const q = (x < size ? 0 : 1) + (y < size ? 0 : 2); // quadrant offsets [[0,2],[3,1]]
        out[y * s2 + x] = 4 * m[(y % size) * size + (x % size)] + [0, 2, 3, 1][q];
      }
      m = out;
    }
    return m;
  }
  const BAYER4 = bayer(4), BAYER8 = bayer(8);

  // ---------- LUT ----------
  // 32x32x32 cells -> 1024x64 RGBA image. Cell (r,g,b) lives at x = b*32 + r, y = g (rows 0..31 = NEAREST palette colour in OKLab,
  // rows 32..63 = SECOND-nearest). The post shader picks between the two with a Bayer threshold (true palette-ordered dither).
  let lutCache = null;
  function buildLUTData() {
    if (lutCache) return lutCache;
    const W = 1024, H = 64, data = new Uint8Array(W * H * 4);
    const n = COLORS.length;
    for (let b = 0; b < 32; b++) for (let g = 0; g < 32; g++) for (let r = 0; r < 32; r++) {
      const R = Math.round(r * 255 / 31), G = Math.round(g * 255 / 31), B = Math.round(b * 255 / 31);
      const q = srgbToOklab(R, G, B);
      let b1 = 0, d1 = 1e9, b2 = 0, d2 = 1e9;
      for (let i = 0; i < n; i++) {
        const L = LAB[i], dd = (L[0] - q[0]) * (L[0] - q[0]) + (L[1] - q[1]) * (L[1] - q[1]) + (L[2] - q[2]) * (L[2] - q[2]);
        if (dd < d1) { d2 = d1; b2 = b1; d1 = dd; b1 = i; } else if (dd < d2) { d2 = dd; b2 = i; }
      }
      const p = RGB[b1], s = RGB[b2];
      const o = ((g * W) + (b * 32 + r)) * 4, o2 = (((g + 32) * W) + (b * 32 + r)) * 4;
      data[o] = p[0]; data[o + 1] = p[1]; data[o + 2] = p[2]; data[o + 3] = 255;
      data[o2] = s[0]; data[o2 + 1] = s[1]; data[o2 + 2] = s[2]; data[o2 + 3] = 255;
    }
    lutCache = { width: W, height: H, data: data, nearestRows: 32 };
    return lutCache;
  }
  function bayerTexData() { // 8x8 RGBA (threshold in all channels): (i+0.5)/64
    const d = new Uint8Array(8 * 8 * 4);
    for (let i = 0; i < 64; i++) { const v = Math.round((BAYER8[i] + 0.5) / 64 * 255); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    return d;
  }

  const P = HPO.mod.palette = {
    COUNT: COLORS.length,
    COLORS: COLORS,                                  // 90 '#rrggbb' strings
    COLORS_NUM: COLORS.map(function (h) { return parseInt(h.slice(1), 16); }),
    RGB: RGB, LAB: LAB,
    ramps: RAMPS, rampIndex: RAMP_IDX,
    BAYER4: BAYER4, BAYER8: BAYER8,
    hexToRgb: hexToRgb, rgbToHex: rgbToHex, srgbToOklab: srgbToOklab, oklabToSrgb: oklabToSrgb, hexToOklab: hexToOklab,
    nearestIndex(hex) { const c = hexToRgb(hex); return nearestIndexRgb(c[0], c[1], c[2]); },
    snap(hex) { return COLORS[P.nearestIndex(hex)]; },            // -> '#rrggbb' (nearest palette colour in OKLab)
    snapNum(hex) { return P.COLORS_NUM[P.nearestIndex(hex)]; },    // -> 0xRRGGBB
    // ramp helper: palette.ramp('green', 3) -> hex of step 3 (clamped); palette.ramp('green') -> whole ramp
    ramp(name, i) { const r = RAMPS[name]; if (!r) return null; return i === undefined ? r.slice() : r[Math.max(0, Math.min(r.length - 1, i | 0))]; },
    // Quantisation helper used by tests: distance between two colours in OKLab
    deltaE(a, b) { const x = hexToOklab(a), y = hexToOklab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); },
    lutData: buildLUTData,
    bayerTexData: bayerTexData,
    // buildLUT(THREE) -> THREE.DataTexture (1024x64 = nearest block + second-nearest block) ; without THREE returns the raw {width,height,data}
    buildLUT(T) {
      const L = buildLUTData();
      if (!T) return L;
      const t = new T.DataTexture(L.data, L.width, L.height, T.RGBAFormat, T.UnsignedByteType);
      t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
      return t;
    },
    buildBayerTexture(T) {
      const t = new T.DataTexture(bayerTexData(), 8, 8, T.RGBAFormat, T.UnsignedByteType);
      t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false; t.wrapS = T.RepeatWrapping; t.wrapT = T.RepeatWrapping; t.flipY = false; t.needsUpdate = true;
      return t;
    },
    // Self-check used by tools/palette_check: exactly 90 distinct colours, no near-duplicates
    verify() {
      const seen = {}; let dup = 0, minDE = 9, pair = null;
      COLORS.forEach(function (h, i) {
        if (seen[h]) dup++; seen[h] = 1;
        for (let j = 0; j < i; j++) { const d = Math.hypot(LAB[i][0] - LAB[j][0], LAB[i][1] - LAB[j][1], LAB[i][2] - LAB[j][2]); if (d < minDE) { minDE = d; pair = [COLORS[j], COLORS[i]]; } }
      });
      return { count: COLORS.length, distinct: Object.keys(seen).length, duplicates: dup, minDeltaE: minDE, closestPair: pair };
    },
    init() { /* LUT is built lazily by render.init (needs THREE) */ }
  };
})(HPO);
