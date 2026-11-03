// Render core: low-res scene target -> depth outline + OKLab palette snap + Bayer dither -> pixelated canvas.
// Also: materials (cutaway screen-door, glass, floodlight pool), cutaway system, TOD lighting rigs, orthographic camera + pointer input.
// See docs/API_render.md for the API (superset of docs/VISUAL_CONTRACT.md section 2).
(function (HPO) {
  'use strict';
  const U = HPO.util;
  const EL = 40 * Math.PI / 180;
  const YAW0 = Math.PI / 4;           // yaw of quarter-turn index 0
  const CAM_D = 140;                  // camera distance from its target (orthographic: only affects clipping/fog)
  const MODES = ['follow', 'club', 'close', 'top', 'free'];
  const ZOOM_MAX = 18;                // orthographic half-height can shrink to well under a metre
  const FOLLOW_HALF = 11.5;           // TV follow: visible half-height in metres at zoom 1 (landscape)

  // ---------- time-of-day presets ----------
  const TOD = {
    day:    { night: 0,    lamps: 0,   indoor: false, skyTop: 0x4cc3ee, skyBottom: 0xdff3ff, fog: 0xcdeeff, sun: 0xfff2d0, sunI: 0.78, amb: 0xdbe9ff, ground: 0xa89878, ambI: 0.62, sunDir: [-0.5, 1.0, 0.6] },
    dusk:   { night: 0.45, lamps: 0.7, indoor: false, skyTop: 0x3a2468, skyMid: 0xd84a70, skyBottom: 0xff9e6b, fog: 0xe0a07c, sun: 0xff9a58, sunI: 0.72, amb: 0xc8a8d8, ground: 0x6a4a50, ambI: 0.5,  sunDir: [-1.0, 0.5, 0.4] },
    night:  { night: 1,    lamps: 1,   indoor: false, skyTop: 0x050a1c, skyBottom: 0x1a2f63, fog: 0x14244e, sun: 0x6f90ff, sunI: 0.26, amb: 0x3f58a8, ground: 0x151c3c, ambI: 0.34,  sunDir: [-0.3, 1.0, 0.2] },
    indoor: { night: 0.2,  lamps: 1,   indoor: true,  skyTop: 0x1c2a3c, skyBottom: 0x36485e, fog: 0x2c3a50, sun: 0xfff0dd, sunI: 0.5,  amb: 0xfff0dd, ground: 0x8a7a60, ambI: 0.85, sunDir: [0.0, 1.0, 0.1] }
  };
  const TOD_TWEEN = 3.0; // seconds

  // ---------- GLSL ----------
  const GLSL_BAYER = [
    'float hpoB2(vec2 p){ p = mod(p, 2.0); return p.x < 0.5 ? (p.y < 0.5 ? 0.0 : 3.0) : (p.y < 0.5 ? 2.0 : 1.0); }',
    'float hpoBayer(vec2 p){ p = floor(p); return (hpoB2(p) * 16.0 + hpoB2(floor(p * 0.5)) * 4.0 + hpoB2(floor(p * 0.25)) + 0.5) / 64.0; }'
  ].join('\n');

  const POST_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const POST_FS = [
    'precision highp float;',
    'uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tLUT; uniform sampler2D tBayer;',
    'uniform vec2 uRes; uniform float uHasDepth; uniform float uRaw; uniform float uDither; uniform float uOutline; uniform float uThr; uniform float uRange; uniform vec3 uInk;',
    'varying vec2 vUv;',
    'float dep(vec2 uv){ return texture2D(tDepth, uv).x * uRange; }',
    // positive when the neighbour in direction d is closer than the linear continuation of this pixel's surface
    'float edgeDir(vec2 d, float dc){',
    '  vec2 u1 = vUv + d; vec2 u2 = vUv - d;',
    '  if (texture2D(tColor, u1).a < 0.5) return 0.0;', // dithered (cutaway) pixels never outline their holes
    '  float e = dc - dep(u1);',
    '  if (texture2D(tColor, u2).a >= 0.5) e -= (dep(u2) - dc);',
    '  return e;',
    '}',
    'vec4 lutAt(vec3 c, float row){',
    '  vec3 i = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5);',
    '  return texture2D(tLUT, vec2((i.b * 32.0 + i.r + 0.5) / 1024.0, (i.g + row + 0.5) / 64.0));',
    '}',
    'void main(){',
    '  vec3 c = texture2D(tColor, vUv).rgb;',
    '  if (uRaw > 0.5) { gl_FragColor = vec4(c, 1.0); return; }',
    '  float edge = 0.0;',
    '  if (uHasDepth > 0.5 && uOutline > 0.0) {',
    '    float dc = dep(vUv); vec2 px = 1.0 / uRes;',
    '    edge = max(max(edgeDir(vec2(px.x, 0.0), dc), edgeDir(vec2(-px.x, 0.0), dc)), max(edgeDir(vec2(0.0, px.y), dc), edgeDir(vec2(0.0, -px.y), dc)));',
    '  }',
    '  float isEdge = step(uThr, edge) * step(0.001, uOutline);',
    '  float lum = dot(c, vec3(0.299, 0.587, 0.114));',
    '  if (isEdge > 0.5) c = mix(c * 0.3, uInk, 0.55);',
    '  vec4 p1 = lutAt(c, 0.0); vec4 p2 = lutAt(c, 32.0);',
    '  vec3 d = p2.rgb - p1.rgb;',
    '  float f = clamp(dot(c - p1.rgb, d) / max(dot(d, d), 1e-5), 0.0, 1.0);',
    '  f = clamp((f - 0.18) / 0.64, 0.0, 1.0);', // dead zone: colours already close to a palette entry stay flat
    '  float t = texture2D(tBayer, gl_FragCoord.xy / 8.0).r;',
    '  float strength = uDither * mix(0.4, 1.0, smoothstep(0.05, 0.45, lum)) * (1.0 - isEdge);',
    '  float th = mix(0.5, t, clamp(strength, 0.0, 1.0));',
    '  gl_FragColor = vec4(f > th ? p2.rgb : p1.rgb, 1.0);',
    '}'
  ].join('\n');

  const SKY_FS = [
    'precision highp float;',
    'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform float uNight; varying vec2 vUv;',
    'float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'void main(){',
    '  float t = smoothstep(0.0, 1.0, vUv.y);',
    '  vec3 col = t < 0.5 ? mix(uBot, uMid, t * 2.0) : mix(uMid, uTop, t * 2.0 - 1.0);',
    '  vec2 cell = floor(gl_FragCoord.xy);',
    '  float st = step(0.9985, hsh(cell)) * uNight * smoothstep(0.3, 0.75, vUv.y) * (0.45 + 0.55 * hsh(cell + 7.0));',
    '  gl_FragColor = vec4(col + vec3(st), 1.0);',
    '}'
  ].join('\n');

  // ---------- material patching (shared compile hook so programs are shared) ----------
  function hpoCompile(shader) {
    const h = this._hpo, U2 = R._U, lambert = !!this.isMeshLambertMaterial;
    shader.uniforms.uFade = h.uFade;
    let vs = shader.vertexShader, fs = shader.fragmentShader;
    let fadeCode = '  if ( uFade < 0.999 && hpoBayer( gl_FragCoord.xy ) >= uFade ) discard;\n';
    fs = fs.replace('#include <common>', '#include <common>\nuniform float uFade;\n' + GLSL_BAYER);
    fs = fs.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + fadeCode);
    if (lambert) {
      shader.uniforms.uLamps = U2.uLamps; shader.uniforms.uFloodDirV = U2.uFloodDirV; shader.uniforms.uFloodCol = U2.uFloodCol; shader.uniforms.uFloodC = U2.uFloodC;
      vs = vs.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vVN; varying float vFl; uniform vec3 uFloodDirV;');
      vs = vs.replace('#include <project_vertex>', [
        '#include <project_vertex>',
        'vec4 hp4 = vec4( transformed, 1.0 );',
        '#ifdef USE_INSTANCING',
        '  hp4 = instanceMatrix * hp4;',
        '#endif',
        'vWP = ( modelMatrix * hp4 ).xyz;',
        'vec3 hn = normalize( transformedNormal );',
        'vVN = hn;',
        'vFl = max( dot( hn, uFloodDirV ), 0.0 );'
      ].join('\n'));
      fs = fs.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vVN; varying float vFl; uniform float uLamps; uniform vec3 uFloodCol; uniform vec4 uFloodC;');
      fs = fs.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', [
        '{',
        '  vec2 hq = (vWP.xz - uFloodC.xy) / uFloodC.zw;',
        '  float fm = ((1.0 - smoothstep(0.6, 1.3, length(hq))) + 0.2 * (1.0 - smoothstep(0.9, 2.4, length(hq)))) * (1.0 - smoothstep(8.0, 20.0, vWP.y)) * uLamps;',
        '  outgoingLight += diffuseColor.rgb * uFloodCol * fm * (0.22 + 0.78 * vFl);',
        '}',
        'float hpoA = diffuseColor.a;',
        '#ifdef HPO_GLASS',
        '  float fr = 1.0 - abs( vVN.z ); fr = fr * fr;',
        '  float sh = smoothstep(0.93, 1.0, sin((vWP.x + vWP.z) * 0.9 + vWP.y * 1.7));',
        '  outgoingLight = mix(outgoingLight, vec3(1.0), clamp(fr * 0.55 + sh * 0.2, 0.0, 0.7));',
        '  hpoA = clamp(diffuseColor.a * (0.7 + 2.2 * fr) + sh * 0.1, 0.0, 0.85);',
        '#endif',
        'if ( uFade < 0.999 ) hpoA = 0.25;',
        'gl_FragColor = vec4( outgoingLight, hpoA );'
      ].join('\n'));
    } else {
      fs = fs.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', 'gl_FragColor = vec4( outgoingLight, uFade < 0.999 ? 0.25 : diffuseColor.a );');
    }
    shader.vertexShader = vs; shader.fragmentShader = fs;
  }

  function patch(m, o) {
    if (m._hpo) return m;
    m._hpo = { uFade: { value: 1 } };
    if (o && o.glass) {
      m.defines = Object.assign({}, m.defines, { HPO_GLASS: 1 });
      if (m.side === 0) m.side = R.THREE.DoubleSide;
    }
    if (m.transparent) { // keep destination alpha: the post pass reads alpha as the "dithered occluder" marker
      const T = R.THREE;
      m.blending = T.CustomBlending; m.blendEquation = T.AddEquation; m.blendSrc = T.SrcAlphaFactor; m.blendDst = T.OneMinusSrcAlphaFactor;
      m.blendEquationAlpha = T.AddEquation; m.blendSrcAlpha = T.ZeroFactor; m.blendDstAlpha = T.OneFactor;
    }
    m.onBeforeCompile = hpoCompile;
    m.needsUpdate = true;
    return m;
  }

  // ---------- helpers ----------
  const tmpV = {}, tmpBox = {}, tmpM4 = {};
  function ang(a, b) { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; }
  function K(dt, rate) { return 1 - Math.exp(-dt * rate); }

  const R = HPO.mod.render = {
    THREE: null, renderer: null, scene: null, camera: null, groups: {}, todParams: null,
    pixelSize: 2, cameraMode: 'club', yawIndex: 0, container: null, ready: false, raw: false, tod: 'day',
    followId: null, followBall: true, aspect: 1.6, t: 0,
    _mats: {}, _hooks: [], _glows: [], _cutEntries: [], _frame: 0,
    view: { yaw: YAW0, yawT: YAW0, yawK: 0, el: EL, elT: EL, half: 36, halfT: 36, zoom: 1, freeBase: 14, target: null, tTarget: null },
    _U: null, _quality: 'high', pointLightCap: 0.12, _plights: null,

    init(ctx) {
      const T = R.THREE = ctx.THREE || window.THREE;
      const opts = ctx.opts || {};
      const cont = R.container = opts.container || document.getElementById('stage') || document.body;
      R.PAL = HPO.mod.palette;
      R._U = {
        uLamps: { value: 0 }, uFloodDirV: { value: new T.Vector3(0, 1, 0) }, uFloodCol: { value: new T.Color(0.95, 0.88, 0.7) },
        uFloodC: { value: new T.Vector4(0, 0, 12.5, 7.5) }
      };
      try {
        R.renderer = new T.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
      } catch (e) { U.logError('render:init', e); cont.textContent = 'WebGL is not available in this browser.'; return; }
      const r = R.renderer;
      r.setPixelRatio(1);
      r.autoClear = true; r.setClearColor(0x000000, 0);
      r.info.autoReset = false;
      r.shadowMap.type = T.PCFShadowMap; r.shadowMap.autoUpdate = false;
      const cs = getComputedStyle(cont); if (cs.position === 'static') cont.style.position = 'relative';
      cont.style.overflow = 'hidden';
      const cv = r.domElement;
      cv.style.cssText = 'display:block;position:absolute;left:0;top:0;image-rendering:pixelated;image-rendering:crisp-edges;image-rendering:pixelated;touch-action:none;outline:none';
      cont.appendChild(cv);

      R.scene = new T.Scene();
      R.camera = new T.OrthographicCamera(-10, 10, 10, -10, 10, 300);
      R.scene.add(R.camera);
      ['world', 'court', 'island', 'club', 'actors', 'fx', 'overlay'].forEach(function (n) { R.groups[n] = new T.Group(); R.groups[n].name = n; (n === 'world' ? R.scene : R.groups.world).add(R.groups[n]); });

      // lights: hemisphere + one shadowed sun (flood pool is injected into Lambert materials, see hpoCompile)
      R.lights = { hemi: new T.HemisphereLight(0xffffff, 0x888888, 0.6), sun: new T.DirectionalLight(0xffffff, 0.8) };
      R.scene.add(R.lights.hemi, R.lights.sun, R.lights.sun.target);
      R.lights.sun.target.position.set(0, 0, -8);
      const sh = R.lights.sun.shadow; sh.mapSize.set(1024, 1024); sh.camera.left = -38; sh.camera.right = 38; sh.camera.top = 38; sh.camera.bottom = -38; sh.camera.near = 1; sh.camera.far = 260; sh.bias = -0.0006; sh.normalBias = 0.04;
      R.scene.fog = new T.Fog(0xffffff, CAM_D - 10, CAM_D + 190);

      // sky: camera-attached gradient quad (+ stars at night) rendered first, never writes depth
      R._skyU = { uTop: { value: new T.Color() }, uMid: { value: new T.Color() }, uBot: { value: new T.Color() }, uNight: { value: 0 } };
      R._sky = new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShaderMaterial({ uniforms: R._skyU, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: SKY_FS, depthTest: false, depthWrite: false, fog: false }));
      R._sky.frustumCulled = false; R._sky.renderOrder = -1000; R._sky.position.z = -280; R.camera.add(R._sky);

      // post pass resources
      R._hasDepth = !!(r.capabilities.isWebGL2 || r.extensions.has('WEBGL_depth_texture'));
      R._lutTex = R.PAL ? R.PAL.buildLUT(T) : null;
      R._bayerTex = R.PAL ? R.PAL.buildBayerTexture(T) : null;
      R._postU = {
        tColor: { value: null }, tDepth: { value: null }, tLUT: { value: R._lutTex }, tBayer: { value: R._bayerTex }, uRes: { value: new T.Vector2(1, 1) },
        uHasDepth: { value: R._hasDepth ? 1 : 0 }, uRaw: { value: R.PAL ? 0 : 1 }, uDither: { value: 0.8 }, uOutline: { value: 1 }, uThr: { value: 0.4 }, uRange: { value: 290 },
        uInk: { value: new T.Color(0x123954).multiplyScalar(0.75) }
      };
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
      g.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
      R._postMat = new T.ShaderMaterial({ uniforms: R._postU, vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false });
      const pm = new T.Mesh(g, R._postMat); pm.frustumCulled = false;
      R._postScene = new T.Scene(); R._postScene.add(pm);
      R._postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      R.view.target = new T.Vector3(0, 0, 0); R.view.tTarget = new T.Vector3(0, 0, 0);
      R._tmp = { v: new T.Vector3(), v2: new T.Vector3(), right: new T.Vector3(), up: new T.Vector3(), fwdH: new T.Vector3(), dirC: new T.Vector3(), ray: new T.Raycaster(), ndc: new T.Vector2(), plane: new T.Plane(new T.Vector3(0, 1, 0), 0), hit: new T.Vector3() };
      R._glowTex = null;

      // time of day (instant at boot; forwarded to the world modules on boot:ready, when they are initialised)
      R._P = { cur: R._mkParams(), from: R._mkParams(), to: R._mkParams(), t: 1 };
      R.todParams = R._P.cur;
      R._setTod(opts.venue === 'indoor' ? 'indoor' : (opts.tod || 'day'), true);

      // the whole club is tiny on a phone: start on the TV follow camera instead
      if (HPO.cfg.mobile) R.cameraMode = 'follow';

      // quality
      R._quality = HPO.cfg.mobile ? 'low' : 'high';
      R._applyQuality(true);

      R._bindInput();
      R.resize();
      window.addEventListener('resize', R.resize);
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(R.resize).observe(cont);
      HPO.BUS.on('boot:ready', function () { R.ready = true; R._forwardTod(); R._syncOutsideCollisions(); R._last = performance.now(); requestAnimationFrame(R._loop); });
    },

    _syncOutsideCollisions() {
      const T = R.THREE, triangles = [], v = new T.Vector3(), instance = new T.Matrix4(), world = new T.Matrix4();
      R.groups.world.updateWorldMatrix(true, true);
      ['court', 'island', 'club'].forEach(key => R.groups[key].traverseVisible(o => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || o.isSkinnedMesh) return;
        const mat = o.material;
        if (Array.isArray(mat) || mat.opacity < 0.9 || (mat.userData && mat.userData.glass)) return;
        const g = o.geometry, pos = g.attributes.position, index = g.index, count = index ? index.count : pos.count;
        for (let j = 0; j < (o.isInstancedMesh ? o.count : 1); j++) {
          if (o.isInstancedMesh) { o.getMatrixAt(j, instance); world.multiplyMatrices(o.matrixWorld, instance); } else world.copy(o.matrixWorld);
          for (let i = 0; i + 2 < count; i += 3) {
            const tri = [];
            for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(world); tri.push(v.x, v.y, v.z); }
            const xs = [tri[0], tri[3], tri[6]], ys = [tri[1], tri[4], tri[7]], zs = [tri[2], tri[5], tri[8]];
            if (Math.min(...xs) > 18 || Math.max(...xs) < -18 || Math.min(...zs) > 12 || Math.max(...zs) < -12 || Math.max(...ys) < -0.3) continue;
            if (xs.every(x => Math.abs(x) < 9.95) && zs.every(z => Math.abs(z) < 4.95)) continue;
            triangles.push(tri);
          }
        }
      }));
      HPO.mod.court.setOutsideTriangles(triangles);
    },

    // ================= materials =================
    mat(hex, o) {
      o = o || {};
      const T = R.THREE;
      const tr = !!(o.transparent || o.glass || (o.opacity !== undefined && o.opacity < 1));
      const key = hex + '|' + (o.emissive || 0) + '|' + (o.emissiveIntensity === undefined ? 1 : o.emissiveIntensity) + '|' + (tr ? (o.opacity === undefined ? (o.glass ? 0.28 : 0.5) : o.opacity) : 1) + '|' + (o.side || 0) + '|' + (o.glass ? 1 : 0) + '|' + (o.unlit ? 1 : 0) + '|' + (o.map ? o.map.uuid : '');
      if (R._mats[key]) return R._mats[key];
      const m = o.unlit ? new T.MeshBasicMaterial({ color: hex, map: o.map || null }) : new T.MeshLambertMaterial({ color: hex, map: o.map || null });
      if (o.emissive && !o.unlit) { m.emissive = new T.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity === undefined ? 1 : o.emissiveIntensity; }
      if (tr) { m.transparent = true; m.opacity = o.opacity === undefined ? (o.glass ? 0.28 : 0.5) : o.opacity; m.depthWrite = false; }
      if (o.side) m.side = o.side;
      m.userData.glass = !!o.glass; m.userData.cutaway = !!o.cutaway;
      patch(m, { glass: !!o.glass });
      R._mats[key] = m; return m;
    },
    matInstanced(hex, o) { return R.mat(hex, o); },  // InstancedMesh uses the same materials (USE_INSTANCING handled in the patch)
    patch(material, o) { return patch(material, o); }, // make a foreign Lambert/Basic material cutaway-/flood-capable
    snap(hex) { return R.PAL ? R.PAL.snapNum(hex) : hex; },
    canvasTex(w, h, draw) {
      const T = R.THREE, c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); draw(g, w, h);
      const t = new T.CanvasTexture(c); t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false; return t;
    },
    box(w, h, d, hex, o) { return new R.THREE.Mesh(new R.THREE.BoxGeometry(w, h, d), R.mat(hex, o)); },
    onFrame(fn) { R._hooks.push(fn); },

    // soft additive glow sprite, visible only when lamps > 0 (low quality hides them)
    addPointGlow(pos, colour, radius, o) {
      const T = R.THREE; o = o || {};
      if (!R._glowTex) {
        R._glowTex = R.canvasTex(64, 64, function (g, w, h) {
          const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
          gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
        });
        R._glowTex.magFilter = T.LinearFilter; R._glowTex.minFilter = T.LinearFilter;
      }
      const sm = new T.SpriteMaterial({ map: R._glowTex, color: colour === undefined ? 0xfff2c0 : colour, blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0 });
      const s = new T.Sprite(sm); s.position.set(pos.x || 0, pos.y || 0, pos.z || 0); const rr = (radius || 1) * 2; s.scale.set(rr, rr, 1);
      s.visible = false; s.userData.glowBase = o.intensity === undefined ? 0.9 : o.intensity; s.userData.always = !!o.always;
      (o.parent || R.groups.fx).add(s); R._glows.push(s); return s;
    },

    // ================= cutaway =================
    cutaway: {
      enabled: true,
      add(obj, o) {
        o = o || {};
        const role = o.role || 'prop', D = { stand: 0.22, building: 0.25, wall: 0.2, tree: 0.3, prop: 0.55, light: 0.05, roof: 0.15 };
        for (let i = 0; i < R._cutEntries.length; i++) if (R._cutEntries[i].obj === obj) { R._cutEntries[i].role = role; return; }
        const e = { obj: obj, role: role, fadeTo: o.fadeTo === undefined ? (D[role] === undefined ? 0.4 : D[role]) : o.fadeTo, lift: o.lift === undefined ? (role === 'roof' ? 9 : 0) : o.lift,
          fade: 1, liftCur: 0, baseY: obj.position.y, box: new R.THREE.Box3(), boxAge: 1e9, meshes: [], swapped: false, skip: false, nChildren: -1 };
        R._cutEntries.push(e);
        R.cutaway.refresh(obj);
      },
      remove(obj) {
        for (let i = R._cutEntries.length - 1; i >= 0; i--) {
          const e = R._cutEntries[i]; if (e.obj !== obj) continue;
          R._cutSwap(e, false); e.obj.position.y = e.baseY; R._cutEntries.splice(i, 1);
        }
      },
      refresh(obj) { R._cutEntries.forEach(function (e) { if (!obj || e.obj === obj) { e.boxAge = 1e9; e.nChildren = -1; } }); },
      setEnabled(b) { R.cutaway.enabled = !!b; },
      list() { return R._cutEntries.map(function (e) { return { role: e.role, name: e.obj.name, fade: e.fade, lift: e.liftCur, skipped: e.skip }; }); }
    },
    _cutScan(e) { // (re)collect meshes + their cutaway clones
      const keep = [];
      e.obj.traverse(function (o) {
        if (!o.isMesh || !o.material) return;
        const arr = Array.isArray(o.material);
        if (arr) return; // multi-material meshes are left alone
        let rec = null;
        for (let i = 0; i < e.meshes.length; i++) if (e.meshes[i].mesh === o) { rec = e.meshes[i]; break; }
        const cur = o.material;
        if (rec && (cur === rec.orig || cur === rec.clone)) { keep.push(rec); return; }
        if (cur.userData && cur.userData.glass) return; // glass is never faded
        const clone = cur.clone(); patch(clone, { glass: false }); clone.userData = {};
        keep.push({ mesh: o, orig: cur, clone: clone });
      });
      e.meshes = keep;
      e.nChildren = e.obj.children.length;
    },
    _cutSwap(e, on) {
      for (let i = 0; i < e.meshes.length; i++) {
        const r = e.meshes[i];
        if (on) {
          const c = r.clone, s = r.orig;
          c.color.copy(s.color); if (s.emissive) { c.emissive.copy(s.emissive); c.emissiveIntensity = s.emissiveIntensity; }
          c.opacity = s.opacity; c.map = s.map; c.side = s.side;
          r.mesh.material = c;
        } else r.mesh.material = r.orig;
      }
      e.swapped = on;
    },
    _cutBox(e) {
      const T = R.THREE, b = e.box; b.makeEmpty();
      e.obj.updateWorldMatrix(true, true);
      if (!tmpBox.b) { tmpBox.b = new T.Box3(); tmpM4.m = new T.Matrix4(); tmpV.c = new T.Vector3(); }
      e.obj.traverse(function (o) {
        if (!o.isMesh || !o.geometry) return;
        const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
        if (o.isInstancedMesh) {
          for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, tmpM4.m); tmpM4.m.premultiply(o.matrixWorld);
            tmpBox.b.copy(g.boundingBox).applyMatrix4(tmpM4.m); b.union(tmpBox.b);
          }
        } else { tmpBox.b.copy(g.boundingBox).applyMatrix4(o.matrixWorld); b.union(tmpBox.b); }
      });
      if (!b.isEmpty()) { b.min.y -= e.liftCur; b.max.y -= e.liftCur; } // always the un-lifted box (no flip-flop)
      e.skip = b.isEmpty() || (e.role !== 'roof' && b.min.x < 0 && b.max.x > 0 && b.min.z < 0 && b.max.z > 0 && b.min.y < 1 && b.max.y > 1); // encloses the court centre: not a sensible occluder
      e.boxAge = 0;
    },
    _updateCutaway(dt) {
      const list = R._cutEntries; if (!list.length) return;
      const T = R.THREE, cd = R._tmp.dirC, enabled = R.cutaway.enabled;
      // sample points: fixed court grid + live ball/players
      let np = 0; const P = R._cutPts || (R._cutPts = new Float32Array(3 * 64));
      if (!R._cutGrid) {
        const g = []; [-9, -4.5, 0, 4.5, 9].forEach(function (x) { [-4.5, 0, 4.5].forEach(function (z) { g.push(x, 0.8, z, x, 1.8, z); }); });
        [-8, 0, 8].forEach(function (x) { g.push(x, 4.5, 0); });
        R._cutGrid = g;
      }
      const G = R._cutGrid; for (let i = 0; i < G.length; i++) P[i] = G[i]; np = G.length / 3;
      const nFixed = np;
      const bs = HPO.mod.ball && HPO.mod.ball.state; if (bs && bs.p) { P[np * 3] = bs.p.x; P[np * 3 + 1] = Math.max(0.2, bs.p.y); P[np * 3 + 2] = bs.p.z; np++; }
      const pl = HPO.mod.players && HPO.mod.players.list;
      if (pl) for (let i = 0; i < pl.length && np < 60; i++) { const p = pl[i].pos; if (!p) continue; P[np * 3] = p.x; P[np * 3 + 1] = 0.9; P[np * 3 + 2] = p.z; np++; P[np * 3] = p.x; P[np * 3 + 1] = 1.9; P[np * 3 + 2] = p.z; np++; }
      const dx = cd.x, dy = cd.y, dz = cd.z, kf = K(dt, 5.5);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.nChildren !== e.obj.children.length) { R._cutScan(e); e.boxAge = 1e9; }
        e.boxAge++;
        if (e.boxAge > 300) { R._cutBox(e); }
        let need = 0;
        if (enabled && !e.skip && e.obj.visible) {
          const b = e.box; let hits = 0, liveHit = false;
          for (let s = 0; s < np; s++) {
            const px = P[s * 3], py = P[s * 3 + 1], pz = P[s * 3 + 2];
            let tmin = 0, tmax = 1e9, ok = true, t1, t2, sw;
            if (Math.abs(dx) < 1e-9) { if (px < b.min.x || px > b.max.x) ok = false; } else { t1 = (b.min.x - px) / dx; t2 = (b.max.x - px) / dx; if (t1 > t2) { sw = t1; t1 = t2; t2 = sw; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; }
            if (ok) { if (Math.abs(dy) < 1e-9) { if (py < b.min.y || py > b.max.y) ok = false; } else { t1 = (b.min.y - py) / dy; t2 = (b.max.y - py) / dy; if (t1 > t2) { sw = t1; t1 = t2; t2 = sw; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; } }
            if (ok) { if (Math.abs(dz) < 1e-9) { if (pz < b.min.z || pz > b.max.z) ok = false; } else { t1 = (b.min.z - pz) / dz; t2 = (b.max.z - pz) / dz; if (t1 > t2) { sw = t1; t1 = t2; t2 = sw; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; } }
            if (ok && tmax > 0.05 && tmin < tmax) { if (s < nFixed) hits++; else liveHit = true; }
          }
          need = liveHit || (e.role === 'light' && hits > 0) ? 1 : Math.min(1, hits / nFixed * 4);
        }
        const fT = 1 - need * (1 - e.fadeTo), lT = need * e.lift;
        e.fade += (fT - e.fade) * kf; if (e.fade > 0.995) e.fade = 1;
        e.liftCur += (lT - e.liftCur) * kf; if (e.liftCur < 0.01) e.liftCur = 0;
        const active = e.fade < 0.999;
        if (active !== e.swapped) R._cutSwap(e, active);
        if (active) for (let m = 0; m < e.meshes.length; m++) {
          const r = e.meshes[m];
          if (r.mesh.material !== r.clone) { if (r.mesh.material !== r.orig) { e.nChildren = -1; } continue; }
          const c = r.clone, s = r.orig; c.color.copy(s.color); if (s.emissive) { c.emissive.copy(s.emissive); c.emissiveIntensity = s.emissiveIntensity; }
          c._hpo.uFade.value = e.fade;
        }
        // lift (owner must not touch obj.position.y while registered; wrap in a Group instead)
        if (Math.abs(e.obj.position.y - (e.baseY + (e._lastLift || 0))) > 1e-3) e.baseY = e.obj.position.y - (e._lastLift || 0);
        e.obj.position.y = e.baseY + e.liftCur; e._lastLift = e.liftCur;
      }
    },

    // ================= time of day / lighting =================
    _mkParams() {
      const T = R.THREE;
      return { tod: 'day', night: 0, lamps: 0, indoor: false, sunI: 1, ambI: 1, sunDir: new T.Vector3(0, 1, 0), skyTop: new T.Color(), skyMid: new T.Color(), skyBottom: new T.Color(), fog: new T.Color(), ambient: new T.Color(), ground: new T.Color(), sunColor: new T.Color() };
    },
    _loadPreset(out, p, tod) {
      out.tod = tod; out.night = p.night; out.lamps = p.lamps; out.indoor = p.indoor; out.sunI = p.sunI; out.ambI = p.ambI;
      out.sunDir.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
      out.skyTop.setHex(p.skyTop); out.skyBottom.setHex(p.skyBottom); if (p.skyMid !== undefined) out.skyMid.setHex(p.skyMid); else out.skyMid.lerpColors(out.skyTop, out.skyBottom, 0.5); out.fog.setHex(p.fog); out.ambient.setHex(p.amb); out.ground.setHex(p.ground); out.sunColor.setHex(p.sun);
    },
    _copyParams(a, b) {
      a.night = b.night; a.lamps = b.lamps; a.sunI = b.sunI; a.ambI = b.ambI; a.sunDir.copy(b.sunDir);
      a.skyTop.copy(b.skyTop); a.skyMid.copy(b.skyMid); a.skyBottom.copy(b.skyBottom); a.fog.copy(b.fog); a.ambient.copy(b.ambient); a.ground.copy(b.ground); a.sunColor.copy(b.sunColor);
    },
    _blend(out, a, b, k) {
      out.night = U.lerp(a.night, b.night, k); out.lamps = U.lerp(a.lamps, b.lamps, k); out.sunI = U.lerp(a.sunI, b.sunI, k); out.ambI = U.lerp(a.ambI, b.ambI, k);
      out.sunDir.lerpVectors(a.sunDir, b.sunDir, k).normalize();
      out.skyTop.lerpColors(a.skyTop, b.skyTop, k); out.skyMid.lerpColors(a.skyMid, b.skyMid, k); out.skyBottom.lerpColors(a.skyBottom, b.skyBottom, k); out.fog.lerpColors(a.fog, b.fog, k);
      out.ambient.lerpColors(a.ambient, b.ambient, k); out.ground.lerpColors(a.ground, b.ground, k); out.sunColor.lerpColors(a.sunColor, b.sunColor, k);
    },
    _setTod(tod, instant) {
      const P = R._P, p = TOD[tod] || TOD.day; if (!TOD[tod]) tod = 'day';
      R.tod = tod;
      R._loadPreset(P.to, p, tod);
      P.cur.tod = tod; P.cur.indoor = p.indoor;
      if (instant) { R._copyParams(P.cur, P.to); P.t = 1; } else { R._copyParams(P.from, P.cur); P.t = 0; }
      R._applyLights();
    },
    _applyLights() {
      const p = R.todParams, L = R.lights;
      L.hemi.color.copy(p.ambient); L.hemi.groundColor.copy(p.ground); L.hemi.intensity = p.ambI;
      L.sun.color.copy(p.sunColor); L.sun.intensity = p.sunI;
      L.sun.position.set(0, 0, -8).addScaledVector(p.sunDir, 110);
      R.scene.fog.color.copy(p.fog);
      R._skyU.uTop.value.copy(p.skyTop); R._skyU.uMid.value.copy(p.skyMid); R._skyU.uBot.value.copy(p.skyBottom); R._skyU.uNight.value = p.indoor ? 0 : p.night;
      R._U.uLamps.value = p.lamps;
      R._postU.uInk.value.setHex(p.night > 0.5 ? 0x0b1220 : 0x123954).multiplyScalar(0.8);
    },
    _forwardTod() {
      HPO.initOrder.forEach(function (n) { const m = HPO.mod[n]; if (m && m.setTimeOfDay && /^world/.test(n)) { try { m.setTimeOfDay(R.tod, R.todParams); } catch (e) { U.logError('setTimeOfDay:' + n, e); } } });
    },
    setTimeOfDay(tod) {
      if (!TOD[tod]) return;
      if (tod === R.tod && R._P.t >= 1) return;
      R._setTod(tod, !R.ready);
      if (R.ready) { R._forwardTod(); }
      HPO.BUS.emit('ui:setting', { key: 'tod', value: tod });
    },
    get quality() { return R._quality; },
    set quality(q) { R.setQuality(q); },
    setQuality(q) { R._quality = q === 'low' ? 'low' : 'high'; R._applyQuality(false); },
    _applyQuality(first) {
      const low = R._quality === 'low', on = !low;
      if (R.renderer.shadowMap.enabled !== on) {
        R.renderer.shadowMap.enabled = on; R.lights.sun.castShadow = on;
        if (!first) R.scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.needsUpdate = true; }); });
        R._cutEntries.forEach(function (e) { e.meshes.forEach(function (r) { r.clone.needsUpdate = true; }); });
      }
      R.lights.sun.castShadow = on;
    },

    // ================= settings =================
    setPixelSize(n) { R.pixelSize = U.clamp(Math.round(n) || 2, 1, 6); R.resize(); },
    debugRaw(v) { R.raw = v === undefined ? !R.raw : !!v; if (R._postU) R._postU.uRaw.value = (R.raw || !R.PAL) ? 1 : 0; },
    setOutline(v) { if (R._postU) R._postU.uOutline.value = v ? 1 : 0; },
    setDither(v) { if (R._postU) R._postU.uDither.value = U.clamp(v, 0, 1); },
    setGlassOpacity(v) { const m = HPO.mod.worldCourt; if (m && m.setOptions) m.setOptions({ glassOpacity: v }); },
    setRoof(v) { ['worldCourt', 'worldClub'].forEach(function (n) { const m = HPO.mod[n]; if (m && m.setOptions) m.setOptions({ showRoof: v }); }); },
    stats() { return { fps: R._fps || 0, drawCalls: R._calls || 0, tris: R._tris || 0 }; },

    // ================= camera API =================
    setCameraMode(m) {
      if (MODES.indexOf(m) < 0 || m === R.cameraMode) return;
      const v = R.view, prev = R.cameraMode;
      R.cameraMode = m;
      if (m === 'free') { v.freeBase = v.halfT * v.zoom; v.tTarget.copy(v.target); }
      else { v.zoom = 1; if (prev === 'free') { v.yawK = Math.round((v.yaw - YAW0) / (Math.PI / 2)); R.yawIndex = ((v.yawK % 4) + 4) % 4; } }
      HPO.BUS.emit('cam:mode', { mode: m });
    },
    rotate(dir) {
      const v = R.view;
      if (R.cameraMode === 'free') { v.yawK = Math.round((v.yawT - YAW0) / (Math.PI / 2)); }
      v.yawK += dir > 0 ? 1 : -1; R.yawIndex = ((v.yawK % 4) + 4) % 4;
      if (R.cameraMode === 'free') v.yawT = YAW0 + v.yawK * Math.PI / 2;
    },
    zoom(d) { R.view.zoom = U.clamp(R.view.zoom * Math.pow(1.12, d), 0.45, ZOOM_MAX); }, // delta > 0 zooms IN
    resetView() { const v = R.view; v.zoom = 1; v.yawK = 0; R.yawIndex = 0; R.followId = null; R.followBall = true; v.tTarget.set(0, 0, 0); R.setCameraMode(HPO.cfg.mobile ? 'follow' : 'club'); },
    followPlayer(id) { R.followId = id || null; if (id) R.setCameraMode('follow'); },
    setFollowBall(b) { R.followBall = !!b; if (b) R.followId = null; },
    pan(dx, dz) { R._toFree(); const v = R.view; v.tTarget.x = U.clamp(v.tTarget.x + dx, -70, 70); v.tTarget.z = U.clamp(v.tTarget.z + dz, -70, 70); },
    orbit(dy) { R._toFree(); R.view.yawT += dy; R.view.yaw += dy; },
    _toFree() { if (R.cameraMode !== 'free') R.setCameraMode('free'); },

    project(v, out) {
      const cv = R.renderer.domElement, p = R._tmp.v2.copy(v).project(R.camera), w = cv.clientWidth, h = cv.clientHeight;
      out = out || {}; out.x = (p.x * 0.5 + 0.5) * w; out.y = (-p.y * 0.5 + 0.5) * h; out.visible = p.z > -1 && p.z < 1 && p.x > -1.05 && p.x < 1.05 && p.y > -1.05 && p.y < 1.05; return out;
    },
    pickCourt(cx, cy) {
      const r = R.renderer.domElement.getBoundingClientRect(), t = R._tmp;
      t.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      t.ray.setFromCamera(t.ndc, R.camera);
      return t.ray.ray.intersectPlane(t.plane, t.hit) ? { x: t.hit.x, z: t.hit.z } : null;
    },

    // ================= size =================
    resize() {
      if (!R.renderer) return;
      // Each low-res pixel must cover a whole number of device pixels. Stretching to a fractional scale (e.g. 3 css px at a
      // 2.6 device ratio) makes nearest-neighbour upscaling drop or double rows, which shows as stripes on phones.
      const T = R.THREE, c = R.container, dpr = Math.max(1, window.devicePixelRatio || 1);
      const W = Math.max(16, Math.round(c.clientWidth * dpr)), H = Math.max(16, Math.round(c.clientHeight * dpr));
      const N = Math.max(1, Math.round(R.pixelSize * dpr));
      const lw = Math.ceil(W / N), lh = Math.ceil(H / N), cssW = lw * N / dpr, cssH = lh * N / dpr;
      R.aspect = lw / lh; R._cssN = N;
      if (lw === R._lw && lh === R._lh && R._rt) { R.renderer.domElement.style.width = cssW + 'px'; R.renderer.domElement.style.height = cssH + 'px'; return; }
      R._lw = lw; R._lh = lh;
      R.renderer.setSize(lw, lh, false);
      const cv = R.renderer.domElement; cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
      if (R._rt) { R._rt.dispose(); if (R._rt.depthTexture) R._rt.depthTexture.dispose(); }
      const rt = new T.WebGLRenderTarget(lw, lh, { minFilter: T.NearestFilter, magFilter: T.NearestFilter, format: T.RGBAFormat, type: T.UnsignedByteType, depthBuffer: true, stencilBuffer: false });
      if (R._hasDepth) { const dt = new T.DepthTexture(lw, lh); dt.type = T.UnsignedIntType; dt.format = T.DepthFormat; dt.minFilter = T.NearestFilter; dt.magFilter = T.NearestFilter; rt.depthTexture = dt; }
      R._rt = rt;
      R._postU.tColor.value = rt.texture; R._postU.tDepth.value = rt.depthTexture; R._postU.uRes.value.set(lw, lh);
    },

    // ================= camera update =================
    _basis(yaw, el) { // right/up vectors and direction towards the camera
      const t = R._tmp, sy = Math.sin(yaw), cy = Math.cos(yaw), se = Math.sin(el), ce = Math.cos(el);
      t.right.set(cy, 0, -sy); t.up.set(-sy * se, ce, -cy * se); t.dirC.set(sy * ce, se, cy * ce); t.fwdH.set(-sy, 0, -cy);
    },
    _fit(pts, yaw, el, margin, out) { // fit points (flat xyz array) to the viewport -> out {half, cx, cy} in view space
      R._basis(yaw, el);
      const t = R._tmp; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < pts.length; i += 3) {
        const x = pts[i] * t.right.x + pts[i + 1] * t.right.y + pts[i + 2] * t.right.z, y = pts[i] * t.up.x + pts[i + 1] * t.up.y + pts[i + 2] * t.up.z;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      out.half = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / R.aspect) * margin; out.cx = (x0 + x1) / 2; out.cy = (y0 + y1) / 2; return out;
    },
    _fitPts() {
      if (R._pts) return R._pts;
      const club = [], close = [], top = [];
      for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; club.push(Math.cos(a) * 47, 0, Math.sin(a) * 47, Math.cos(a) * 44, -6, Math.sin(a) * 44); }
      club.push(0, -14, 0, -22, 15, -34, 22, 15, -34, -16, 15, -11, 16, 15, 11, 16, 15, -11, -16, 15, 11);
      [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { [0, 4.2].forEach(function (y) { close.push(sx * 11.2, y, sz * 6.4); }); top.push(sx * 12, 0, sz * 7); }); });
      R._pts = { club: club, close: close, top: top }; return R._pts;
    },
    _followPoint(out) {
      const bs = HPO.mod.ball && HPO.mod.ball.state, pl = HPO.mod.players && HPO.mod.players.list;
      let mx = 0, mz = 0, n = 0;
      if (pl) for (let i = 0; i < pl.length; i++) { if (pl[i].pos) { mx += pl[i].pos.x; mz += pl[i].pos.z; n++; } }
      if (n) { mx /= n; mz /= n; }
      let x = mx, z = mz;
      const fp = R.followId && HPO.mod.players && HPO.mod.players.byId && HPO.mod.players.byId[R.followId];
      if (fp && fp.pos) { x = fp.pos.x; z = fp.pos.z; if (bs && bs.p && bs.state !== 'dead') { x = x * 0.8 + bs.p.x * 0.2; z = z * 0.8 + bs.p.z * 0.2; } }
      else if (R.followBall && bs && bs.p && bs.state !== 'dead') { x = bs.p.x * 0.65 + mx * 0.35; z = bs.p.z * 0.65 + mz * 0.35; }
      out.set(U.clamp(x, -9, 9), 0, U.clamp(z, -7.5, 7.5)); // the walk-on queue stands outside the sideline (z = 6.9)
    },
    _updateCamera(dt) {
      const v = R.view, cam = R.camera, t = R._tmp, mode = R.cameraMode, pts = R._fitPts();
      const top = mode === 'top';
      // yaw / elevation targets
      if (mode !== 'free') v.yawT = (top ? 0 : YAW0) + v.yawK * Math.PI / 2;
      v.elT = top ? 89 * Math.PI / 180 : EL;
      let baseHalf, kT = 4;
      const f = R._fitOut || (R._fitOut = { half: 1, cx: 0, cy: 0 });
      if (mode === 'club') { R._fit(pts.club, v.yawT, v.elT, 1.02, f); baseHalf = f.half; v.tTarget.copy(t.right).multiplyScalar(f.cx).addScaledVector(t.up, f.cy); }
      else if (mode === 'close') { R._fit(pts.close, v.yawT, v.elT, 1.08, f); baseHalf = f.half; v.tTarget.copy(t.right).multiplyScalar(f.cx).addScaledVector(t.up, f.cy); }
      else if (mode === 'top') { R._fit(pts.top, v.yawT, v.elT, 1.06, f); baseHalf = f.half; v.tTarget.set(0, 0, 0).addScaledVector(t.right, f.cx).addScaledVector(t.up, f.cy); }
      else if (mode === 'follow') { R._followPoint(v.tTarget); baseHalf = FOLLOW_HALF * Math.max(1, 1.5 / R.aspect) * (HPO.cfg.mobile ? 0.55 : 1); kT = 3; }
      else { baseHalf = v.freeBase; kT = 10; }
      v.halfT = baseHalf / v.zoom;
      v.target.lerp(v.tTarget, K(dt, kT));
      if (mode !== 'free') { /* yaw tween */ }
      v.yaw += (v.yawT - v.yaw) * K(dt, 7); if (Math.abs(v.yawT - v.yaw) < 1e-4) v.yaw = v.yawT;
      v.el += (v.elT - v.el) * K(dt, 5);
      v.half += (v.halfT - v.half) * K(dt, 6); if (Math.abs(v.halfT - v.half) < 1e-4 * v.half) v.half = v.halfT;
      R._basis(v.yaw, v.el);
      // snap the camera to the low-res pixel grid so static scenery does not crawl
      const ppw = 2 * v.half / (R._lh || 400), tgt = t.v.copy(v.target);
      const tx = tgt.dot(t.right), ty = tgt.dot(t.up);
      tgt.addScaledVector(t.right, Math.round(tx / ppw) * ppw - tx).addScaledVector(t.up, Math.round(ty / ppw) * ppw - ty);
      cam.position.copy(tgt).addScaledVector(t.dirC, CAM_D);
      cam.up.set(0, 1, 0); cam.lookAt(tgt);
      const hw = v.half * R.aspect;
      cam.left = -hw; cam.right = hw; cam.top = v.half; cam.bottom = -v.half; cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      R._sky.scale.set(hw * 2.05, v.half * 2.05, 1);
      R._postU.uThr.value = Math.max(0.16, ppw * 2.6); R._postU.uRange.value = cam.far - cam.near;
      R._U.uFloodDirV.value.set(-0.25, 1, 0.2).normalize().transformDirection(cam.matrixWorldInverse);
    },

    // ================= input =================
    _bindInput() {
      const cv = R.renderer.domElement, ptrs = new Map(); let orbited = false, pinch = 0, moved = false, tdown = 0, startX = 0, startY = 0, multi = false;
      cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      cv.addEventListener('wheel', function (e) { e.preventDefault(); R.zoom(-Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 100 + 0.5)); }, { passive: false });
      function mpp() { return 2 * R.view.half / (cv.clientHeight || 1); }
      function panPx(dx, dy) {
        R._toFree(); const v = R.view, t = R._tmp, m = mpp();
        R._basis(v.yaw, v.el);
        v.tTarget.addScaledVector(t.right, -dx * m).addScaledVector(t.fwdH, dy * m / Math.max(0.3, Math.sin(v.el)));
        v.tTarget.x = U.clamp(v.tTarget.x, -70, 70); v.tTarget.z = U.clamp(v.tTarget.z, -70, 70);
      }
      cv.addEventListener('pointerdown', function (e) {
        try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey });
        if (ptrs.size === 1) { moved = false; multi = false; tdown = performance.now(); startX = e.clientX; startY = e.clientY; } else { multi = true; const a = Array.from(ptrs.values()); pinch = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
      });
      cv.addEventListener('pointermove', function (e) {
        const p = ptrs.get(e.pointerId); if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
        if (ptrs.size >= 2) {
          const a = Array.from(ptrs.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
          if (pinch > 0 && d > 0) { R.zoom(Math.log(d / pinch) / Math.log(1.12)); } pinch = d; moved = true;
          panPx(dx * 0.5, dy * 0.5); return;
        }
        if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
        moved = true;
        if (p.button === 2 || p.shift || e.shiftKey || (e.buttons & 2)) panPx(dx, dy);
        else { R._toFree(); R.view.yawT -= dx * 0.006; R.view.yaw = R.view.yawT; orbited = true; }
      });
      function up(e) {
        const had = ptrs.delete(e.pointerId);
        if (ptrs.size < 2) pinch = 0;
        if (orbited && ptrs.size === 0) { // an orthographic view of the court only looks right at a true isometric yaw: settle on the nearest quarter turn
          const v = R.view; v.yawK = Math.round((v.yawT - YAW0) / (Math.PI / 2)); v.yawT = YAW0 + v.yawK * Math.PI / 2; R.yawIndex = ((v.yawK % 4) + 4) % 4; orbited = false;
        }
        if (!had || e.type === 'pointercancel') return;
        if (!moved && !multi && ptrs.size === 0 && performance.now() - tdown < 600) {
          const h = R.pickCourt(e.clientX, e.clientY);
          if (h && Math.abs(h.x) <= 10.5 && Math.abs(h.z) <= 5.5) HPO.BUS.emit('ui:setting', { key: 'canvasClick', value: { x: h.x, z: h.z, clientX: e.clientX, clientY: e.clientY } });
        }
      }
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    },

    // ================= frame =================
    renderNow(dt) { // update camera/cutaway/lighting and draw one frame (used by the loop and by tests)
      dt = dt === undefined ? 1 / 60 : dt;
      const P = R._P;
      if (P.t < 1) {
        P.t = Math.min(1, P.t + dt / TOD_TWEEN); const k = P.t * P.t * (3 - 2 * P.t);
        R._blend(P.cur, P.from, P.to, k); if (P.t >= 1) R._copyParams(P.cur, P.to);
        R._applyLights();
      }
      R._updateCamera(dt);
      R._updateCutaway(dt);
      // Per-vertex point/spot lights from world modules light whole stands through Gouraud interpolation; the flood pool in the
      // materials replaces them, so clamp them to a faint accent (R.pointLightCap).
      if ((R._frame % 60) === 0) { R._plights = []; R.scene.traverse(function (o) { if (o.isPointLight || o.isSpotLight) R._plights.push(o); }); }
      if (R._plights) for (let i = 0; i < R._plights.length; i++) if (R._plights[i].intensity > R.pointLightCap) R._plights[i].intensity = R.pointLightCap;
      const lamps = R.todParams.lamps, low = R._quality === 'low';
      for (let i = 0; i < R._glows.length; i++) { const s = R._glows[i], o = lamps * s.userData.glowBase; s.material.opacity = o; s.visible = o > 0.03 && (!low || s.userData.always); }
      const r = R.renderer;
      R._frame++;
      if (r.shadowMap.enabled && (R._frame & 1) === 0) r.shadowMap.needsUpdate = true;
      r.info.reset();
      r.setRenderTarget(R._rt);
      r.render(R.scene, R.camera);
      R._calls = r.info.render.calls; R._tris = r.info.render.triangles;
      r.setRenderTarget(null);
      r.render(R._postScene, R._postCam);
    },
    debugReadPixels() { // test helper: renders a frame and returns the canvas pixels (RGBA, bottom-up)
      R.renderNow(0.0001);
      const gl = R.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); return { width: w, height: h, data: buf };
    },

    _loop(now) {
      requestAnimationFrame(R._loop);
      const raw = Math.max(1e-3, (now - (R._last || now)) / 1000); R._last = now;
      const dt = Math.min(0.1, raw); R.t += dt;
      R._fps = R._fps ? R._fps * 0.92 + (1 / raw) * 0.08 : 60;
      try {
        const M = HPO.mod.match; if (M && M.advance) M.advance(dt);
        const a = HPO.mod.actors; if (a && a.sync) a.sync(M && M.acc ? M.acc / HPO.cfg.SIM_DT : 0, dt);
        HPO.initOrder.concat(['replay', 'commentary']).forEach(function (n) {
          const m = HPO.mod[n];
          if (m && m.update && (/^world/.test(n) || n === 'crowd' || n === 'fx' || n === 'ceremony' || n === 'callouts' || n === 'audio' || n === 'ui' || n === 'replay')) { try { m.update(dt, R.t); } catch (e) { U.logError('update:' + n, e); } }
        });
        for (let i = 0; i < R._hooks.length; i++) R._hooks[i](dt, R.t);
        R.renderNow(dt);
      } catch (e) { U.logError('render:frame', e); }
    }
  };
})(HPO);
