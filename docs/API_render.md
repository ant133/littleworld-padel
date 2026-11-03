# API_render.md — `HPO.mod.render` (src/10_render_core.js) and `HPO.mod.palette` (src/01_palette.js)

Superset of VISUAL_CONTRACT §2. Everything in §2 works as written, with the notes/additions below.

## Pipeline
scene -> low-res `WebGLRenderTarget` (colour + depth texture, `ceil(w/N) x ceil(h/N)`) -> fullscreen pass -> low-res canvas shown with integer CSS upscale (`image-rendering: pixelated`; the canvas can overhang the container by < N px, container gets `overflow:hidden`).
Fullscreen pass: depth outline (a pixel is outlined when a neighbour is closer than the linear continuation of its own surface; drawn on the FAR side, ink-tinted; glass/transparent/dithered pixels never outline) -> OKLab nearest-palette LUT (32^3, 90 colours) -> two-colour palette ordered dither (Bayer 8x8; dead zone so colours already near a palette entry stay flat; strength reduced in darks).
Sky = camera-attached gradient quad (top / mid / bottom + stars at night), so glass/glows composite over it naturally.
Shadows: one sun/moon directional light, 1024 map, refreshed every 2nd frame, only objects with `castShadow/receiveShadow` (set by world modules). Off when `quality === 'low'`.

## Additions
| API | Notes |
|---|---|
| `render.zoom(delta)` | **delta > 0 zooms IN** (x1.12^delta). Wheel/pinch call it. Zoom resets to 1 on mode change (except into `free`). |
| `render.mat(hex, o)` | `o`: `emissive, emissiveIntensity, transparent, opacity, side, glass, cutaway, map, unlit` (`unlit:true` = MeshBasicMaterial). Glass: default opacity 0.28, DoubleSide, no depth write, view-angle (fresnel) alpha + faint sheen streaks, keeps destination alpha. All Lambert mats get the night/indoor floodlight pool (driven by `todParams.lamps`). `render.matInstanced = mat` (InstancedMesh works with the same materials). |
| `render.patch(material)` | Make a foreign `MeshLambertMaterial`/`MeshBasicMaterial` cutaway/flood capable. |
| `render.snap(hex)` | Nearest palette colour as `0xRRGGBB`. Prefer `HPO.mod.palette.ramps.*` / `palette.ramp(name,i)` so surfaces land on exact palette steps (flat, no dither noise). |
| `render.addPointGlow(pos, colour, radius, {intensity, always, parent})` | Additive sprite, opacity = `todParams.lamps * intensity`, hidden by day and in `quality:'low'` (unless `always`). Returns the Sprite. |
| `render.cutaway.add(obj, {role, fadeTo, lift})` | roles + default fadeTo: stand .22, building .25, wall .2, tree .3, prop .55, light .05, roof .15 (roof also lifts 9 m). `light` is for floodlight masts and heads: any court-grid ray overlap makes them nearly transparent, so they never hide play. A roof is never skipped by the "encloses the court centre" rule. `lift` (metres) optional for any role. Also `remove`, `setEnabled(bool)`, `refresh(obj?)`, `list()`. |
| `render.quality = 'high'\|'low'` / `setQuality` | low: shadows off, glows hidden (auto on `HPO.cfg.mobile`). |
| `render.setOutline(bool)`, `render.setDither(0..1)`, `render.debugRaw(bool)` | debugRaw bypasses palette + dither + outline. |
| `render.renderNow(dt)`, `render.debugReadPixels()` | test helpers (draw one frame / read canvas pixels, RGBA bottom-up). |
| `render.project(v, out?)` | optional `out` object to avoid allocation; coordinates are relative to the canvas/container top-left. |
| `render.view` | `{yaw, el, half, zoom, target, ...}` live camera state (read-only for others). |

### todParams (live object, tweened ~3 s on change; same object forever)
`{tod, night, lamps, indoor, sunI, ambI, sunDir:Vector3 (normalised, towards the light), skyTop, skyMid, skyBottom, fog, ambient, ground, sunColor : THREE.Color}`.
World modules get `setTimeOfDay(tod, p)` once per change (after `boot:ready` for the first time) and should read `p.lamps` / `p.night` each frame.
Indoor venue: `render.setTimeOfDay('indoor')` (init does it automatically when `opts.venue === 'indoor'`).

### Cutaway rules (important for world builders)
- Register **each occluder piece separately** (near stand, near wall, near tree). A group whose bounding box encloses the court centre is ignored (skipped, listed with `skipped:true` in `cutaway.list()`).
- Occlusion = rays from a grid of court points + live ball/player positions towards the camera vs the object's un-lifted AABB (InstancedMesh aware; recomputed every 5 s / when children change; call `cutaway.refresh(obj)` after changing geometry).
- While an occluder is fading, its meshes are swapped to per-object cloned materials (screen-door Bayer discard, depth still written for the opaque part); colour/emissive are re-synced from the original every frame. Do not replace `mesh.material` while registered without expecting a re-scan.
- Lift moves `obj.position.y` (baseY tracked); do not animate `position.y` of a registered object yourself, wrap it in a Group.
- Glass materials (`userData.glass`) are never faded. Ball and players are never registered, and live ball/player points force occluders to fade.

### Camera
Modes: `follow` (rally centroid = ball .65 / players .35; `followPlayer(id)` biases to that player and switches to follow; `setFollowBall(false)` -> players centroid), `club` (fits a r=47 island + clubhouse/mast heights, aspect-aware), `close` (fits the court enclosure), `top` (89 deg, yaw base 0 so the long axis is horizontal), `free`.
Pointer: left-drag orbit, right/shift-drag or two-finger pan, wheel/pinch zoom; any drag in a non-free mode switches to `free` (emits `cam:mode`). On release the yaw snaps to the nearest isometric quarter turn (`view.yawK`, `render.yawIndex` 0-3), so opposite court edges stay parallel and the court never looks skewed. The camera is orthographic at 40 deg elevation; `features_browser.js` checks parallelism at eight yaws. A click (no drag, <600 ms) inside the court rectangle (|x|<=10.5, |z|<=5.5) emits `ui:setting {key:'canvasClick', value:{x,z,clientX,clientY}}`.
Camera target is snapped to the low-res pixel grid so static scenery does not crawl.

### Palette (`HPO.mod.palette`)
`COLORS` (90 `#rrggbb`), `COLORS_NUM`, `ramps`/`ramp(name,i)` (slate, warmGrey, white, blue, teal, sky, terracotta, green, olive, skin, yellow, orange, red, pink, purple, night, wood, sand), OKLab helpers (`srgbToOklab`, `oklabToSrgb`, `hexToOklab`, `deltaE`), `nearestIndex/snap/snapNum`, `buildLUT(THREE)` (1024x64 RGBA: rows 0-31 nearest, 32-63 second-nearest), `buildBayerTexture(THREE)`, `BAYER4/BAYER8`, `verify()` (count/distinct/min deltaE). Node: `require('./tools/load').load({noboot:true}).mod.palette.verify()`.

### Point lights
World-module PointLight/SpotLight intensities are clamped to `render.pointLightCap` (default 0.12) each frame: Lambert is per-vertex in r128, so big lights wash whole stands white. Night/indoor lighting comes from the flood pool in the materials (`todParams.lamps`).
