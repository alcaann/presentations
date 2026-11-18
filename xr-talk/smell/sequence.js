// Smell walkthrough: Z-Anatomy meshes (CC BY-SA 4.0), steps and sources in steps.json,
// mesh roles in parts.json (both written next to this page; parts.json by export_smell.py).
// Things the atlas has no mesh for (olfactory epithelium, piriform cortex, receptor cells,
// glomeruli) are drawn here as schematic shapes and labelled as such.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const here = (f) => new URL(f, import.meta.url).href;   // files next to this module, whatever page loads it
const CSS = `
  #ui { position: fixed; left: 10px; top: 10px; max-width: min(460px, calc(100vw - 20px)); background: #000b; padding: 10px 12px; border-radius: 8px; line-height: 1.5; }
  #ui h1 { font-size: 15px; margin: 0 0 4px; } #ui p { margin: 4px 0; }
  #ui .q { color: #9ab; font-style: italic; } #ui .src { color: #889; font-size: 12px; }
  #ui button { font: inherit; margin: 6px 4px 0 0; padding: 3px 10px; background: #333; color: #ddd; border: 1px solid #555; border-radius: 5px; cursor: pointer; }
  #ui:not(.open) .more { display: none; }   /* compact by default: the 3D panel already shows the text */
  #ui h1 { display: inline; margin-right: 8px; } #ui .row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  #ui .row button { margin: 0; } #ui #more { background: none; border-color: #444; color: #99a; }
`;
const UI = `<div id="ui"><div class="row"><h1 id="t">loading…</h1><button id="prev">◀</button><button id="next">▶</button><button id="more" title="text, sources and controls (T)">text ▾</button></div>
  <div class="more"><p id="x"></p><p class="q" id="q"></p><p class="src" id="s"></p>
  <p class="src">VR: A next · B back · hold Y: leave VR · right stick turns the model · desktop: ← → steps · click the view, then the mouse looks around (Esc frees it) · right-drag turns the model · I J K L move, ; up, / down (Shift faster) · R back to the step's view · T text · X (left controller) / S: the step's sources on the panel</p></div></div>`;

// Sequence 2 (and 3) of the one-page talk, for ../shared/host.js (contract: ../plans/story.md). The
// page owns the renderer, the VR session, the controllers and the loop; index.html runs it alone.
// ?emulate is handled by the page.
export async function load(host) {
const { renderer, signal, params } = host;
const root = document.createElement('div'); root.innerHTML = `<style>${CSS}</style>` + UI;
const $ = (id) => root.querySelector('#' + id);   // this sequence's own panel (ids are only unique within it)
// ?atlas=github: the same walkthrough on meshes from the public Z-Anatomy atlas (parts-github.json,
// smell-github.glb, made by ../xr-dev/export.sh) instead of the original atlas
const ATLAS = params.get('atlas') === 'github' ? '-github' : '';
const [STEPS, PARTS] = await Promise.all(['steps.json', `parts${ATLAS}.json`].map((f) => fetch(here(f)).then((r) => r.json())));

// ---------- camera rig (the renderer is the page's: log depth for the dive, which spans 1 cm to 1 km,
// and local clipping, for the person cut at the neck while the cup is up at his nose)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);
// desktop camera stands where the headset would (standing eye height, origin), with a wide
// field of view, so desktop checks show roughly what the headset shows
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.01, 100000);
camera.rotation.order = 'YXZ';   // yaw, then pitch: what mouse look and the shots use
const DESK_EYE = new THREE.Vector3(0, 1.5, 0);
camera.position.copy(DESK_EYE);
// the rig: identity, except when this sequence starts inside a running VR session (after Sequence 1),
// where it puts your head back at the origin facing -z, as Enter VR does on this page alone
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(1, 2, 2); scene.add(sun);

// ---------- the model: world <- stage (placement tween) <- spin (user turns it) <- anatomy
const stage = new THREE.Group(), spin = new THREE.Group(), anat = new THREE.Group();
scene.add(stage); stage.add(spin); spin.add(anat);
const gltf = await new GLTFLoader().loadAsync(here(`smell${ATLAS}.glb`));
anat.add(gltf.scene);

const meshes = new Map();   // name -> mesh
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  o.material = new THREE.MeshStandardMaterial({ color: o.material.color ?? 0xcccccc, roughness: 0.7, transparent: true, depthWrite: true });
  o.userData.base = o.material.color.clone();
  o.userData.op = 0; o.userData.target = 0; o.visible = false;
  meshes.set(o.userData.za_name ?? o.name, o);   // export_smell.py stores the atlas name
});
const named = (names) => names.map((n) => meshes.get(n)).filter(Boolean);
const role = {};             // role -> [mesh]
for (const [k, v] of Object.entries({ ...PARTS.groups, ...PARTS.targets })) role[k] = named(v);
for (const [k, v] of Object.entries(role)) if (!v.length) console.warn('no meshes for role', k);
// colours by role (the export carries no materials); later roles win for shared meshes
const COLOR = { body: 0xe3b49a, skull: 0xeee4cf, airway: 0xe58f8f, brain: 0xd8c2c6, pathway: 0xffd24d, ethmoid: 0xf2e6c8 };
for (const [k, c] of Object.entries(COLOR)) for (const m of role[k] ?? []) { m.material.color.set(c); m.userData.base = m.material.color.clone(); }

// ---------- the person: a dressed MakeHuman man about to drink a coffee (person.glb, CC0, made by
// export_person.py and fitted so his nose tip sits on the atlas's). He is the "body" role, in place
// of the atlas skin, which stays unused in smell.glb.
// the underside of the frontal lobe (gyrus rectus, orbital gyri, olfactory sulcus), which rests on the
// olfactory bulb and tract: missing from smell.glb's brain, so taken from the public Z-Anatomy atlas
// (brain-underside.glb, parts-underside.json; the two atlases agree to ~2 mm here)
{
  const g = await new GLTFLoader().loadAsync(here('brain-underside.glb'));
  anat.add(g.scene);
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.material = new THREE.MeshStandardMaterial({ color: COLOR.brain, roughness: 0.7, transparent: true, depthWrite: true });
    o.userData = { ...o.userData, base: o.material.color.clone(), op: 0, target: 0 }; o.visible = false;
    meshes.set(o.userData.za_name ?? o.name, o); role.brain.push(o);
  });
}
const personGltf = await new GLTFLoader().loadAsync(here('person.glb'));
anat.add(personGltf.scene);
role.body = [];
personGltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  const m = o.material;
  m.transparent = true;   // so it can fade
  // hair, eyebrows and lashes: cut-out edges instead of blending, so they don't sort wrongly (dark patches)
  if (m.map && m.alphaTest === 0 && /hair|eyebrow|eyelash|short/i.test(o.name + m.name)) { m.alphaTest = 0.4; m.depthWrite = true; }
  o.userData = { ...o.userData, base: m.color.clone(), op: 0, target: 0 }; o.visible = false;
  meshes.set('(person) ' + o.name, o); role.body.push(o);
});
for (const n of PARTS.groups.body) { const m = meshes.get(n); if (m) { m.removeFromParent(); meshes.delete(n); } }
personGltf.scene.updateMatrixWorld(true);
role.cup = ['mug', 'mug_handle', 'coffee'].map((n) => meshes.get('(person) ' + n)).filter(Boolean);
// the face we fly up to: skin (cut at the neck while the cup is held up, see cupLift), eyes, brows, lashes, hair
role.face = ['body', 'low-poly', 'eyebrow001', 'eyelashes01', 'short02'].map((n) => meshes.get('(person) ' + n)).filter(Boolean);
for (const m of role.face) m.userData.rate = 10;   // the skin goes quickly as you pass the nostril
const skin = meshes.get('(person) body');
// the headset he turns out to be wearing at the end: "VR Headset" by J-Toastie (Poly Pizza, CC BY 3.0),
// seated on his eyes. Its model faces +x and is ~1.1 units wide; a real visor is ~19 cm wide.
role.headset = [];
const HS_PARTS = [];   // its meshes in its own frame (front +x), for the small copies on the pipeline boards
{
  const hs = (await new GLTFLoader().loadAsync(here('headset.glb'))).scene;
  const eyes = new THREE.Box3().setFromObject(meshes.get('(person) low-poly'));
  const k = 0.165, g = new THREE.Group(); g.add(hs);
  hs.rotation.y = -Math.PI / 2; hs.scale.setScalar(k);                 // its +x (front) -> our +z
  hs.position.set(0, eyes.getCenter(new THREE.Vector3()).y - 0.15 * k - 0.006, eyes.max.z + 0.004 + 0.05 * k);
  anat.add(g); g.updateMatrixWorld(true);
  // slide it straight back until it rests on his face (brow and cheeks): the smallest gap between the
  // headset and the skin in front of the face, measured on a 5 mm grid
  {
    const inv = anat.matrixWorld.clone().invert(), v = new THREE.Vector3(), front = new Map(), key = (x, y) => Math.round(x / 0.005) + ',' + Math.round(y / 0.005);
    const sk = meshes.get('(person) body'), M = inv.clone().multiply(sk.matrixWorld), P = sk.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); if (v.z < 0.04 || v.y < 1.55) continue; const k = key(v.x, v.y); front.set(k, Math.max(front.get(k) ?? -9, v.z)); }
    let gap = Infinity;
    hs.traverse((o) => { if (!o.isMesh) return; const T = inv.clone().multiply(o.matrixWorld), Q = o.geometry.attributes.position; for (let i = 0; i < Q.count; i++) { v.fromBufferAttribute(Q, i).applyMatrix4(T); const f = front.get(key(v.x, v.y)); if (f !== undefined && v.z > f - 0.03) gap = Math.min(gap, v.z - f); } });
    if (isFinite(gap)) hs.position.z -= gap + 0.0015;   // a little into the soft face pad
    console.info('headset moved back', (gap * 1000).toFixed(1), 'mm onto the face');
  }
  hs.updateMatrixWorld(true); const hsInv = hs.matrixWorld.clone().invert();
  hs.traverse((o) => {
    if (!o.isMesh) return;
    HS_PARTS.push({ geo: o.geometry, mat: o.material.clone(), M: hsInv.clone().multiply(o.matrixWorld) });
    const m = o.material; m.transparent = true;
    o.userData = { base: m.color.clone(), op: 0, target: 0 }; o.visible = false;
    meshes.set('(headset) ' + o.name, o); role.headset.push(o);
  });
}
const neckCut = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.47), neckCutW = new THREE.Plane();   // anatomy space, and its world copy
const cup = new THREE.Group(); anat.add(cup);
{
  const coffee = personGltf.scene.getObjectByName('coffee');
  if (coffee) cup.position.copy(new THREE.Box3().setFromObject(coffee).getCenter(new THREE.Vector3()));
}
// steam: soft puffs rising from the coffee, drifting and fading; they fade out with the body
const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const steam = [];
for (let i = 0; i < 28; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0, color: 0xe8eef5 }));
  sp.userData = { phase: i / 28, seed: Math.random() * 6.28 }; cup.add(sp); steam.push(sp);
}
const cupMesh = meshes.get('(person) mug') ?? role.body[0];
// the plume leans towards his nostril as it rises (in the cup group's frame, i.e. anatomy space)
const toNose = new THREE.Vector3();
function steamTick(time) {
  toNose.copy(V0).sub(cup.position); const rise = Math.min(0.24, Math.max(0.08, toNose.y - 0.003)); toNose.y = 0;   // stops at the nostril: above it the puffs would sit inside the nose
  const k = cupMesh.userData.op;
  for (const sp of steam) {
    const u = (time * 0.22 + sp.userData.phase) % 1, s = sp.userData.seed;   // u: 0 at the coffee, 1 at the top
    const lean = (s % 1 < 0.6 ? 0.85 : 0.25) * u * u;   // most puffs drift to the nose, some go straight up
    sp.position.set(toNose.x * lean + Math.sin(s + time * 0.9 + u * 5) * 0.01 * (0.4 + u * 2), 0.005 + u * rise, toNose.z * lean + Math.cos(s * 1.7 + time * 0.7) * 0.01 * (0.4 + u * 2));
    sp.scale.setScalar(0.015 + u * 0.045);
    sp.material.opacity = k * 0.33 * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 1.5;
    sp.visible = k > 0.02;
  }
}

// bounding boxes in anatomy space (before any placement)
gltf.scene.updateMatrixWorld(true);
const boxOf = (ms) => { const b = new THREE.Box3(); ms.forEach((m) => b.expandByObject(m)); return b; };
// extreme vertex of a role along an axis: the bulb is the front tip of the olfactory nerve
function extreme(ms, axis, sign) {
  let best = null, bv = -Infinity; const v = new THREE.Vector3();
  for (const m of ms) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      const s = sign * v[axis];
      if (s > bv) { bv = s; best = v.clone(); }
    }
  }
  return best;
}

const sstep0 = (x) => (x = Math.min(1, Math.max(0, x)), x * x * (3 - 2 * x));
// ---------- anchors: points the labels, arrows and pulses use (anatomy space)
const A = {};
const cen = (r) => boxOf(role[r]).getCenter(new THREE.Vector3());
A.body = boxOf(role.body.length ? role.body : [...meshes.values()]).getCenter(new THREE.Vector3());
A.head = boxOf([...role.skull, ...role.brain]).getCenter(new THREE.Vector3());
A.nose = cen('nose');
// The cribriform plate: the atlas has the ethmoid as one object, so the plate is cut out of it here:
// the thin horizontal top of the bone, beside the midline crest (crista galli, which stands higher).
// Its height is where the bone's up-facing surface clusters (measured: 1.593-1.597 m; the crest top
// is at 1.605 m). The cut-out becomes its own role, "cribriform"; the rest of the ethmoid is a ghost.
const eth = boxOf(role.ethmoid);
{
  const src = role.ethmoid[0], g = src.geometry.index ? src.geometry.toNonIndexed() : src.geometry.clone();
  const M = src.matrixWorld, inv = anat.matrixWorld.clone().invert(), toAnat = inv.clone().multiply(M);
  const p = g.attributes.position, v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(toAnat);
  // the plate's height: the most common height of up-facing vertices off the midline
  const hist = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(toAnat); n.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize();
    if (n.y > 0.8 && Math.abs(v.x - (eth.min.x + eth.max.x) / 2) > 0.002) { const k = Math.round(v.y * 1000); hist.set(k, (hist.get(k) ?? 0) + 1); }
  }
  const plateY = [...hist].sort((a, b) => b[1] - a[1])[0][0] / 1000, mid = (eth.min.x + eth.max.x) / 2;
  const keep = [];
  for (let t = 0; t < p.count; t += 3) {
    let ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      v.fromBufferAttribute(p, t + k).applyMatrix4(toAnat);
      ok = Math.abs(v.y - plateY) < 0.0045 && Math.abs(v.x - mid) < 0.013 && !(Math.abs(v.x - mid) < 0.0025 && v.y > plateY + 0.002);
    }
    if (ok) for (let k = 0; k < 3; k++) keep.push(...v.fromBufferAttribute(p, t + k).toArray());
  }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3)); cg.applyMatrix4(toAnat); cg.computeVertexNormals();
  // The plate itself is modelled, not the raw triangles: a thin plate with rounded edges on each side of
  // the midline crest (crista galli), sized to the cut-out and perforated like a sieve ("cribriform";
  // the olfactory nerve fibres pass through these holes). The hole count and size are drawn, not measured.
  const cb0 = new THREE.Box3().setFromBufferAttribute(cg.attributes.position), TH = 0.0009;
  const halves = [-1, 1].map((sd) => {
    const x0 = 0.0013, x1 = Math.min(0.0115, Math.max(Math.abs(cb0.min.x - mid), Math.abs(cb0.max.x - mid))), z0 = cb0.min.z + 0.002, z1 = cb0.max.z - 0.002, rr = 0.002;
    const sh = new THREE.Shape(), X = (x) => sd * x;   // shape in (x, -z), extruded upwards
    sh.moveTo(X(x0), -z0); sh.lineTo(X(x1 - rr), -z0); sh.quadraticCurveTo(X(x1), -z0, X(x1), -z0 - rr);
    sh.lineTo(X(x1), -z1 + rr); sh.quadraticCurveTo(X(x1), -z1, X(x1 - rr), -z1); sh.lineTo(X(x0), -z1); sh.lineTo(X(x0), -z0);
    for (let x = x0 + 0.0016; x < x1 - 0.0012; x += 0.0021) for (let z = z0 + 0.0016; z < z1 - 0.0012; z += 0.0026) {
      const hp = new THREE.Path(), jx = (Math.random() - 0.5) * 0.0006, jz = (Math.random() - 0.5) * 0.0008;
      hp.absellipse(X(x + jx), -(z + jz), 0.00045, 0.0006, 0, Math.PI * 2, sd < 0); sh.holes.push(hp);
    }
    const eg = new THREE.ExtrudeGeometry(sh, { depth: TH, bevelEnabled: true, bevelThickness: 0.00025, bevelSize: 0.00025, bevelSegments: 2, curveSegments: 6 });
    eg.rotateX(-Math.PI / 2); eg.translate(mid, plateY - TH / 2, 0); return eg;
  });
  const cm = new THREE.Mesh(mergeGeometries(halves), new THREE.MeshStandardMaterial({ color: 0xf1e4c4, roughness: 0.75, transparent: true }));
  // keep (positions) were collected in the bone's local space before applyMatrix4 above
  cm.userData = { base: cm.material.color.clone(), op: 0, target: 0 }; cm.visible = false;
  anat.add(cm); meshes.set('(cribriform plate)', cm); role.cribriform = [cm];
  A.cribriform = cb0.getCenter(new THREE.Vector3()); A.cribriform.y = plateY;
  console.info('cribriform plate cut from the ethmoid at y =', plateY, ':', keep.length / 9, 'triangles');
}
// The atlas draws the olfactory bulb ~7 mm above the plate (measured), but it rests on it: bend the nerve
// down at the front so the bulb lies on the plate, tapering to no change at the back end of the tract.
{
  const ms = role.olfactory ?? [], v = new THREE.Vector3();
  for (const m of ms) {   // plain float copies first (the exported positions may be stored compressed, as integers)
    const g = new THREE.BufferGeometry(), P = m.geometry.attributes.position, arr = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) arr.set([P.getX(i), P.getY(i), P.getZ(i)], i * 3);
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); if (m.geometry.index) g.setIndex(m.geometry.index.clone()); m.geometry = g;
  }
  for (const m of ms) { m.updateWorldMatrix(true, false); m.geometry.applyMatrix4(anat.matrixWorld.clone().invert().multiply(m.matrixWorld)); m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); anat.add(m); m.updateMatrixWorld(true); }   // now in anatomy space, directly under anat
  let zF = -9, zB = 9, low = 9;
  for (const m of ms) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); zF = Math.max(zF, v.z); zB = Math.min(zB, v.z); } }
  for (const m of ms) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (v.z > zF - 0.008) low = Math.min(low, v.y); } }
  const drop = low - (A.cribriform.y + 0.0007);   // to just on top of the plate
  for (const m of ms) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const w = sstep0((v.z - zB) / (zF - zB) * 1.6 - 0.3); p.setY(i, v.y - drop * w); }
    p.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere();
  }
  console.info('olfactory bulb lowered by', (drop * 1000).toFixed(1), 'mm onto the plate');
}
A.epithelium = new THREE.Vector3(A.cribriform.x, A.cribriform.y - 0.0025, A.cribriform.z);   // it lines the roof, just under the plate
A.nostril = new THREE.Vector3(A.nose.x, boxOf(role.nose).min.y + 0.005, boxOf(role.nose).max.z - 0.01);
A.bulb = extreme(role.olfactory, 'z', +1);       // front tip
A.tractEnd = extreme(role.olfactory, 'z', -1);   // back end, where the tract splits
for (const r of ['amygdala', 'entorhinal', 'hippocampus', 'hypothalamus', 'thalamus', 'orbitofrontal']) A[r] = cen(r);
// piriform cortex: no mesh in the atlas; it lies where the olfactory tract meets the temporal
// lobe, just in front of and above the amygdala (schematic placement)
A.piriform = A.tractEnd.clone().lerp(A.amygdala, 0.55);
A.brain = boxOf(role.brain).getCenter(new THREE.Vector3());
for (const side of ['amygdala', 'entorhinal', 'hippocampus', 'thalamus', 'orbitofrontal']) {
  // most targets come in left/right pairs; aim labels at the right-hand one (+x) for clarity
  const ms = role[side].filter((m) => boxOf([m]).getCenter(new THREE.Vector3()).x > A.brain.x);
  if (ms.length) A[side] = boxOf(ms).getCenter(new THREE.Vector3());
}

// schematic shapes: epithelium patch (both sides of the septum) and a piriform marker
const schem = new THREE.Group(); anat.add(schem);
const mkSchem = (geo, color, pos) => {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, transparent: true, opacity: 0 }));
  m.position.copy(pos); m.visible = false; m.userData = { op: 0, target: 0, base: new THREE.Color(color), schematic: true }; schem.add(m); return m;
};
role.epithelium = [-1, 1].map((s) => mkSchem(new THREE.BoxGeometry(0.008, 0.002, 0.018), 0xffc34d, A.epithelium.clone().add(new THREE.Vector3(s * 0.006, 0, 0))));
role.piriform = [mkSchem(new THREE.SphereGeometry(0.007, 20, 12), 0xff7a45, A.piriform)];
// pathway = the olfactory nerve/bulb/tract + the schematic shapes; the ethmoid is its own role
role.pathway = [...role.olfactory, ...role.epithelium, ...role.piriform];

// ---------- the nasal cavity we fly through (schematic, built here, not from the atlas): one side's
// air space, from the person's own nostril (measured on person.glb) up into the cavity, back to the
// throat and down the windpipe, with a wet pink lining and three conchae (turbinates) on the outer
// wall. While you are inside it the atlas bones and cartilage are hidden, so nothing cuts the view.
// Sizes follow the atlas: floor ~1.547 m, roof just under the cribriform plate, septum ~3 mm off the
// midline, about 11 mm wide. The olfactory cleft at the top is drawn wider than life, for room.
const RCOL = [0xff5d5d, 0x5ed66b, 0x5d8dff, 0xffcf4a, 0xd06bff];   // receptor types (the room uses them too)
const SIDE = -1;                                       // the side the cup is on (x < 0)
const ROOF = A.cribriform.y - 0.0015;                  // the cavity's roof, under the plate
const CAV_E = 1.5, CEIL = 2.75, MUCUS = 0.95, ROOM = 9; // the room (see below): desktop eye height, ceiling, mucus, radius
const DIVE_S = { S1: 20, S2: 75, K: 800, D2: 0.85 };   // head scale at the nostril, under the roof; room/roof (the room ends 60,000x life size); roof spot ahead
const ROOF_GAP = 0.3 / (DIVE_S.S2 * DIVE_S.K);        // the cavity's roof sits 30 cm above the room's ceiling, so the ceiling shows
// where the room's view ends up (desktop): on the roof under the plate, half a millimetre down
const zEnd = A.cribriform.z + DIVE_S.D2 / DIVE_S.S2;   // the route's end: the roof spot is D2 ahead of it
const camFinal = new THREE.Vector3(SIDE * 0.0085, ROOF - ROOF_GAP - (CEIL - CAV_E) / (DIVE_S.S2 * DIVE_S.K), A.cribriform.z + DIVE_S.D2 / (DIVE_S.S2 * DIVE_S.K));
// the nostril opening and the vestibule's axis, aimed at the room so you can look back down through it
const V0 = new THREE.Vector3(SIDE * 0.009, 1.5555, 0.1055);
const VD = camFinal.clone().sub(V0).normalize();
const VB = new THREE.Vector3(1, 0, 0).cross(VD).normalize(), VA = VD.clone().cross(VB).normalize();
A.nostril = V0.clone();
const tab = (t, z) => {                                // piecewise linear in z (tables run front to back)
  if (z >= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (z >= t[i][0]) { const [za, va] = t[i - 1], [zb, vb] = t[i]; return vb + (va - vb) * (z - zb) / (za - zb); }
  return t[t.length - 1][1];
};
const ROOF_T = [[0.095, 1.577], [0.088, 1.581], [0.076, ROOF], [0.040, ROOF], [0.030, 1.586], [0.022, 1.576]];
const FLOOR_T = [[0.095, 1.5535], [0.086, 1.548], [0.030, 1.547], [0.022, 1.551]];
const XC_T = [[0.095, 0.0080], [0.086, 0.0085], [0.030, 0.0085], [0.022, 0.0070]];
const W_T = [[0.095, 0.0040], [0.088, 0.0055], [0.030, 0.0055], [0.022, 0.0050]];
const sstep = (x) => (x = Math.min(1, Math.max(0, x)), x * x * (3 - 2 * x));
const win = (z, a, b) => sstep((z - a) / 0.008) * sstep((b - z) / 0.008);
const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
function cavOffset(z, th) {                            // a point of the cross-section at z: [x offset, y offset], centre height
  const yt = tab(ROOF_T, z), yb = tab(FLOOR_T, z), hh = (yt - yb) / 2, c = Math.cos(th), sn = Math.sin(th);
  const v = Math.sign(sn) * Math.abs(sn) ** 0.35, f = (v + 1) / 2;
  const w = tab(W_T, z) - 0.0012 * Math.max(0, (f - 0.6) / 0.4);
  let a = w * Math.sign(c) * Math.abs(c) ** 0.55;
  // conchae: three shelves on the outer wall (inferior, middle, superior)
  if (c > 0) a *= 1 - 0.4 * (bump(f, 0.25, 0.07) * win(z, 0.035, 0.09) + bump(f, 0.52, 0.07) * win(z, 0.04, 0.082) + 0.8 * bump(f, 0.76, 0.06) * win(z, 0.035, 0.066));
  return [SIDE * a, hh * v, (yt + yb) / 2];
}
// the throat: from the back of the cavity (the choana) down to the windpipe
const PHX = new THREE.CatmullRomCurve3([[SIDE * 0.007, 1.5635, 0.022], [SIDE * 0.005, 1.562, 0.012], [SIDE * 0.002, 1.558, 0.002], [0, 1.548, -0.006], [0, 1.53, -0.01], [0, 1.505, -0.008], [0, 1.48, -0.002], [0, 1.44, 0], [0, 1.40, 0]].map((q) => new THREE.Vector3(...q)));
function mucosaTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#c45a66'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {                      // mottling
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,190,190,0.07)' : 'rgba(110,20,40,0.07)';
    g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 3 + Math.random() * 14, 0, 7); g.fill();
  }
  const vessel = (x, y, a, w, n) => {                  // a branching vessel, wrapping round the tile
    for (let k = 0; k < n && w > 0.3; k++) {
      const nx = x + Math.cos(a) * 6, ny = y + Math.sin(a) * 6;
      g.strokeStyle = `rgba(105,8,28,${0.25 + w * 0.12})`; g.lineWidth = w;
      for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(nx + ox, ny + oy); g.stroke(); }
      x = (nx + 512) % 512; y = (ny + 512) % 512; a += (Math.random() - 0.5) * 0.5; w *= 0.985;
      if (Math.random() < 0.04) vessel(x, y, a + (Math.random() < 0.5 ? 0.7 : -0.7), w * 0.7, n - k);
    }
  };
  for (let i = 0; i < 14; i++) vessel(Math.random() * 512, Math.random() * 512, Math.random() * 6.3, 2.6, 90);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const mucosaTex = mucosaTexture();
function mucosa(key, glsl, skinRGB) {                  // wet lining; glsl: where this tube is cut open for another; skinRGB: blend from skin (attribute "blend")
  const m = new THREE.MeshPhysicalMaterial({ map: mucosaTex, roughness: 0.6, specularIntensity: 0.35, clearcoat: 0.3, clearcoatRoughness: 0.55,   /* a soft wet sheen: the headlamp sits at your eye, so a sharp one glares on whatever faces you */ side: THREE.DoubleSide, transparent: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying vec3 vNrm;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position; vNrm = objectNormal;');
    // projected from three sides (triplanar), one 7 mm tile everywhere, instead of the stretched UVs
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying vec3 vNrm;').replace('void main() {', 'void main() {\n' + glsl)
      .replace('#include <map_fragment>', `vec3 tw = pow(abs(normalize(vNrm)), vec3(4.0)); tw /= tw.x + tw.y + tw.z; vec3 tp = vLoc / 0.007;
  diffuseColor *= texture2D(map, tp.yz) * tw.x + texture2D(map, tp.xz) * tw.y + texture2D(map, tp.xy) * tw.z;
  // MAPDONE`);
    if (skinRGB) {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float blend; varying float vBlend;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = blend;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBlend;')
        .replace('// MAPDONE', `// MAPDONE\n  diffuseColor.rgb = mix(vec3(${skinRGB.r.toFixed(4)}, ${skinRGB.g.toFixed(4)}, ${skinRGB.b.toFixed(4)}), diffuseColor.rgb, vBlend);`);
    }
  };
  m.customProgramCacheKey = () => key; return m;
}
const gl3 = (v) => `vec3(${v.x.toFixed(6)}, ${v.y.toFixed(6)}, ${v.z.toFixed(6)})`;
function gridMesh(rings, mat, cap, rowBlend) {         // rings: arrays of points, one ring per row
  const NT = rings[0].length, pos = [], uv = [], idx = [], bl = [];
  let len = 0;
  rings.forEach((r, i) => {
    if (i) len += r[0].distanceTo(rings[i - 1][0]);
    r.forEach((q, j) => { pos.push(q.x, q.y, q.z); uv.push(j / NT * 5, len / 0.007); });
    pos.push(r[0].x, r[0].y, r[0].z); uv.push(5, len / 0.007);   // seam copy, for the texture
    if (rowBlend) for (let j = 0; j <= NT; j++) bl.push(rowBlend[i]);
  });
  const W = NT + 1;
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < NT; j++) { const a = i * W + j; idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1); }
  if (cap) {                                           // close the first ring with a fan
    const c = rings[0].reduce((s, q) => s.add(q), new THREE.Vector3()).multiplyScalar(1 / NT), ci = pos.length / 3;
    pos.push(c.x, c.y, c.z); uv.push(2.5, 0); if (rowBlend) bl.push(rowBlend[0]);
    for (let j = 0; j < NT; j++) idx.push(ci, j, j + 1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (rowBlend) g.setAttribute('blend', new THREE.Float32BufferAttribute(bl, 1));
  g.setIndex(idx); g.computeVertexNormals(); return new THREE.Mesh(g, mat);
}
role.cavity = [];
{
  const NT = 72, rings = [];
  for (let i = 0; i <= 64; i++) {                      // the cavity, front to back
    const z = 0.095 + (0.022 - 0.095) * i / 64, xc = SIDE * tab(XC_T, z);
    rings.push(Array.from({ length: NT }, (_, j) => { const [ox, oy, ym] = cavOffset(z, j / NT * Math.PI * 2); return new THREE.Vector3(xc + ox, ym + oy, z); }));
  }
  const last = Array.from({ length: NT }, (_, j) => cavOffset(0.022, j / NT * Math.PI * 2));
  const ax = new THREE.Vector3(1, 0, 0), t = new THREE.Vector3(), b = new THREE.Vector3(), a = new THREE.Vector3();
  for (let i = 1; i <= 44; i++) {                      // then the throat, morphing from the cavity's last ring to a circle
    const u = i / 44, C = PHX.getPointAt(u); PHX.getTangentAt(u, t);
    b.crossVectors(ax, t).normalize(); a.crossVectors(t, b).normalize();
    const m = sstep(u / 0.12), r = 0.0075 + 0.001 * u;   // round before it turns down, or the tall section folds into itself
    rings.push(last.map(([ox, oy], j) => { const th = j / NT * Math.PI * 2, px = ox * (1 - m) + SIDE * r * Math.cos(th) * m, py = oy * (1 - m) + r * Math.sin(th) * m; return C.clone().addScaledVector(a, px).addScaledVector(b, py); }));
  }
  // cut where the vestibule comes in (an elliptic hole around its axis, in the front wall)
  const cav = gridMesh(rings, mucosa('cav', `{ vec3 q = vLoc - ${gl3(V0)}; float s = dot(q, ${gl3(VD)}); vec3 r = q - ${gl3(VD)} * s;
    float g = 0.9 * (0.68 + 0.32 * smoothstep(0.006, 0.014, s));   // a bit smaller than the tube there, so the wall overlaps its edge (no see-through crescent)
    float da = dot(r, ${gl3(VA)}) / (0.003 * g), db = dot(r, ${gl3(VB)}) / (0.0046 * g); if (s > 0.0 && s < 0.03 && da * da + db * db < 1.0 && vLoc.z > 0.0925) discard; }`), true);
  // the nostrils: his skin is opened at both (see openNostrils below) and each opening is lined with a
  // short pink tube with hairs. On the cup side the tube runs up into the cavity (the part inside the
  // cavity is cut away); on the other side it is a short blind tube. Below the skin the tubes are cut off.
  const mir = (v) => new THREE.Vector3(-v.x, v.y, v.z);
  const NOS = [{ v0: V0, d: VD, a: VA, b: VB, main: true }, { v0: mir(V0), d: mir(VD), a: mir(VA), b: mir(VB), main: false }];
  const ring = (n, s, g) => { const C = n.v0.clone().addScaledVector(n.d, s); return Array.from({ length: NT }, (_, j) => { const th = j / NT * Math.PI * 2; return C.clone().addScaledVector(n.a, 0.003 * g * Math.cos(th)).addScaledVector(n.b, 0.0046 * g * Math.sin(th)); }); };
  const gOf = (s) => 0.68 + 0.32 * sstep((s - 0.006) / 0.008);   // narrow through the nose tip, wider above
  // where each tube meets the skin: for every point round the rim, the skin's height along the tube's
  // axis (measured on the mesh), so the tube starts exactly on the skin, with no gap and nothing sticking out
  // The rim: the hole in his skin is a bit wider than the tube's mouth. For every point round the hole's
  // edge we measure where his skin is (and its colour, from his texture), and a rounded lip rolls from
  // there inward and up into the tube, starting in his skin colour and turning to the lining's pink.
  const HOLE = 1.35;                                    // hole radius / tube-mouth radius
  const skinTex = (() => { const im = skin.material.map?.image; if (!im) return null;
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    return { g, w: c.width, h: c.height }; })();
  const measureRim = (n) => {
    const rc = new THREE.Raycaster(), side = skin.material.side; skin.material.side = THREE.DoubleSide;
    const col = [0, 0, 0]; let nc = 0;
    const rim = Array.from({ length: NT }, (_, j) => {
      const th = j / NT * Math.PI * 2, g = gOf(0) * HOLE * 0.985;   // just inside the skin's cut edge, so the lip tucks under it
      const P = n.v0.clone().addScaledVector(n.a, 0.003 * g * Math.cos(th)).addScaledVector(n.b, 0.0046 * g * Math.sin(th));
      rc.set(P.clone().addScaledVector(n.d, -0.008), n.d); rc.far = 0.02;
      const hit = rc.intersectObject(skin).find((h) => h.distance - 0.008 > -0.008 && h.distance - 0.008 < 0.012);
      if (hit?.uv && skinTex) { const d = skinTex.g.getImageData(Math.floor(hit.uv.x * skinTex.w) % skinTex.w, Math.floor(hit.uv.y * skinTex.h) % skinTex.h, 1, 1).data; col[0] += d[0]; col[1] += d[1]; col[2] += d[2]; nc++; }
      return hit ? hit.distance - 0.008 : 0;
    });
    skin.material.side = side;
    const rgb = nc ? new THREE.Color().setRGB(col[0] / nc / 255, col[1] / nc / 255, col[2] / nc / 255, THREE.SRGBColorSpace) : new THREE.Color(0xd9a68c);
    if (skin.material.color) rgb.multiply(skin.material.color);
    return { rim, rgb };
  };
  cav.userData = { base: cav.material.color.clone(), op: 0, target: 0, rate: 8 }; cav.visible = false;
  anat.add(cav); meshes.set('(cavity)', cav); role.cavity.push(cav);
  const nostrilMeshes = [];
  for (const n of NOS) {
    const { rim, rgb } = measureRim(n), s1 = n.main ? 0.022 : 0.0075;   // the blind one is short: longer, it comes out through the side of the nose
    const at = (sv, g, th) => n.v0.clone().addScaledVector(n.d, sv).addScaledVector(n.a, 0.003 * g * Math.cos(th)).addScaledVector(n.b, 0.0046 * g * Math.sin(th));
    const LIP = 0.0014, rings = [], blend = [];
    // the lip: a quarter roll from the skin's edge (B, going inward) to the tube wall above (T, going up)
    for (let k = 0; k <= 6; k++) {
      const f = k / 6 * Math.PI / 2;
      rings.push(rim.map((sB, j) => {
        const th = j / NT * Math.PI * 2, B = at(sB, gOf(0) * HOLE * 0.985, th), T = at(sB + LIP, gOf(0), th);
        const v = n.d.clone().multiplyScalar(T.clone().sub(B).dot(n.d)), h = T.clone().sub(B).sub(v);
        return B.addScaledVector(h, Math.sin(f)).addScaledVector(v, 1 - Math.cos(f));
      }));
      blend.push(0.15 * k / 6);
    }
    // then the tube, from the lip up
    for (let i = 1; i <= 24; i++) {
      const u = (i / 24) ** 1.3;
      rings.push(rim.map((sB, j) => { const sv = sB + LIP + (s1 - sB - LIP) * u; return at(sv, gOf(sv), j / NT * Math.PI * 2); }));
      blend.push(0.15 + 0.85 * sstep(u * (s1 - 0.0) / 0.006));
    }
    const tube = n.main ? gridMesh(rings, mucosa('vest', 'if (vLoc.z < 0.0948) discard;', rgb), false, blend)
                        : gridMesh(rings.reverse(), mucosa('vest2', '', rgb), true, blend.reverse());   // closed at the top
    // nostril hairs (vibrissae), growing from the wall and pointing out and down
    const hairs = [], h = new THREE.ConeGeometry(0.00011, 1, 4, 1); h.translate(0, 0.5, 0);
    const Mh = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < 45; k++) {
      const s = 0.002 + Math.random() * (n.main ? 0.006 : 0.004), th = Math.random() * Math.PI * 2, g = gOf(s) * 0.97;
      const rad = new THREE.Vector3().addScaledVector(n.a, Math.cos(th)).addScaledVector(n.b, Math.sin(th) * 1.5).normalize();
      const base = n.v0.clone().addScaledVector(n.d, s).addScaledVector(n.a, 0.003 * g * Math.cos(th)).addScaledVector(n.b, 0.0046 * g * Math.sin(th));
      const dir = rad.clone().multiplyScalar(-0.3).addScaledVector(n.d, -0.95).add(new THREE.Vector3().randomDirection().multiplyScalar(0.25)).normalize();
      hairs.push(h.clone().applyMatrix4(Mh.compose(base, q.setFromUnitVectors(Y, dir), new THREE.Vector3(1, 0.002 + Math.random() * 0.0025, 1))));
    }
    const hair = new THREE.Mesh(mergeGeometries(hairs), new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.6, transparent: true }));
    for (const [nm, m] of [[n.main ? 'vestibule' : 'nostril, other side', tube], [n.main ? 'nose hairs' : 'nose hairs, other side', hair]]) {
      m.userData = { base: m.material.color.clone(), op: 0, target: 0, rate: 8 }; m.visible = false;
      anat.add(m); meshes.set(`(${nm})`, m); nostrilMeshes.push(m); if (n.main) role.cavity.push(m);
    }
  }
  // open his nostrils: cut the skin where the tubes come through (both sides, mirror images)
  {
    const toAnat = { value: skin.matrixWorld.clone() };   // the skin's own space -> anatomy space (anat is at the origin now)
    const hole = (n) => `inHole(vLoc, ${gl3(n.v0)}, ${gl3(n.d)}, ${gl3(n.a)}, ${gl3(n.b)}, ${n.main ? '0.012' : '0.007'})`;   // only as deep as the tube, or it opens the side of the nose
    skin.material.onBeforeCompile = (sh) => {
      sh.uniforms.uToAnat = toAnat;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uToAnat; varying vec3 vLoc;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = (uToAnat * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLoc;
bool inHole(vec3 p, vec3 v0, vec3 d, vec3 a, vec3 b, float sMax) {
  vec3 q = p - v0; float s = dot(q, d); vec3 r = q - d * s;
  float g = max(0.68 * 1.35, 0.92 * (0.68 + 0.32 * smoothstep(0.006, 0.014, s)));   // as wide as the lip's outer edge
  float da = dot(r, a) / (0.003 * g), db = dot(r, b) / (0.0046 * g);
  return s > -0.004 && s < sMax && da * da + db * db < 1.0;
}`).replace('void main() {', `void main() {\n  if (${hole(NOS[0])} || ${hole(NOS[1])}) discard;`);
    };
    skin.material.customProgramCacheKey = () => 'skin-nostrils';
    skin.material.needsUpdate = true;
  }
  role.body.push(...nostrilMeshes); role.face.push(...nostrilMeshes);   // they show with his skin
}

// ---------- in steps 2-3 he holds the cup up in front of his nose (the hand is left out: the skin is
// cut at the neck), on the line from the room down through the nostril, so from the roof you see it
const cupLift = { v: 0, target: 0, parts: [] };
{
  const coffee = personGltf.scene.getObjectByName('coffee');
  const c0 = new THREE.Box3().setFromObject(coffee).getCenter(new THREE.Vector3());
  const c1 = V0.clone().addScaledVector(VD, -0.10 / VD.y);   // on the vestibule's axis, 10 cm below the nostril
  const delta = c1.clone().sub(c0);
  for (const m of role.cup) {
    const w = m.getWorldPosition(new THREE.Vector3()).add(delta);
    cupLift.parts.push({ m, p0: m.position.clone(), p1: m.parent.worldToLocal(w) });
  }
  cupLift.c0 = cup.position.clone(); cupLift.c1 = cup.position.clone().add(delta);
}
function cupTick(fdt) {
  cupLift.v += (cupLift.target - cupLift.v) * Math.min(1, fdt * 2.5);
  const e = sstep(cupLift.v);
  for (const p of cupLift.parts) p.m.position.lerpVectors(p.p0, p.p1, e);
  cup.position.lerpVectors(cupLift.c0, cupLift.c1, e);
  const cut = cupLift.v > 0.01 || cupLift.neck;   // no arm or hand while the cup is up, or in the sliced view
  if (cut) neckCutW.copy(neckCut).applyMatrix4(anat.matrixWorld);
  if ((skin.material.clippingPlanes?.length ?? 0) !== (cut ? 2 : 1)) skin.material.clippingPlanes = cut ? [cutPlaneW, neckCutW] : [cutPlaneW];
}

// ---------- the air you breathe in with the coffee smell: dots from the cup into the nostril. Some
// reach the roof (the olfactory epithelium) and stop there; most go on, back and down the throat to the
// lungs. Coloured dots are odorant molecules, pale ones air. Schematic: not to scale, and the share
// that reaches the roof is not measured here. Time runs slower the more you are zoomed in, so the dots
// keep a watchable speed at any size.
const stream = { op: 0, target: 0 };
const streamParts = [];
let streamPts, streamCol, streamGeo;
{
  const top = cupLift.c1.clone().add(new THREE.Vector3(0, 0.004, 0));
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const inPath = [top, top.clone().lerp(V0, 0.45).add(P(0, 0.008, 0)), V0.clone().addScaledVector(VD, -0.012), V0.clone(), V0.clone().addScaledVector(VD, 0.012), V0.clone().addScaledVector(VD, 0.024)];
  const pIn = (pts) => { let L = 0, Lin = 0; for (let i = 1; i < pts.length; i++) { L += pts[i].distanceTo(pts[i - 1]); if (i === 3) Lin = L; } return Lin / L; };
  const olf = [...inPath, V0.clone().addScaledVector(VD, 0.045), new THREE.Vector3(SIDE * 0.0085, ROOF - 0.0012, A.cribriform.z + 0.004), new THREE.Vector3(SIDE * 0.0085, ROOF - 0.0003, A.cribriform.z)];   // ends on the roof, ahead of the room's eye
  const lung = (s) => [...inPath, P(SIDE * 0.0085, 1.562, 0.074), P(SIDE * 0.0085, 1.561, 0.05), P(SIDE * 0.008, 1.562, 0.03), ...PHX.points.slice(1).map((q) => q.clone()),
    P(0, 1.37, -0.005), P(s * 0.02, 1.345, -0.012), P(s * 0.045, 1.31, -0.01), P(s * 0.065, 1.28, -0.005)];
  const branches = [olf, lung(-1), lung(1)].map((pts) => ({ curve: new THREE.CatmullRomCurve3(pts), pin: pIn(pts), crash: pts === olf }));
  branches.forEach((b) => b.len = b.curve.getLength());
  const N = 700; streamPts = new Float32Array(N * 3); streamCol = new Float32Array(N * 4);   // rgba
  const air = new THREE.Color(0x9fd8ff);
  for (let i = 0; i < N; i++) {
    const r = Math.random(), br = r < 0.3 ? branches[0] : r < 0.65 ? branches[1] : branches[2];
    const col = Math.random() < 0.4 ? new THREE.Color(RCOL[i % RCOL.length]) : air;
    streamParts.push({ br, p: Math.random(), off: new THREE.Vector3().randomDirection().multiplyScalar(Math.cbrt(Math.random())), speed: 0.75 + Math.random() * 0.5, hold: 0, col });
  }
  streamGeo = new THREE.BufferGeometry();
  streamGeo.setAttribute('position', new THREE.BufferAttribute(streamPts, 3)); streamGeo.setAttribute('color', new THREE.BufferAttribute(streamCol, 4));
  const pm = new THREE.PointsMaterial({ size: 0.0045, map: puffTex, vertexColors: true, transparent: true, depthWrite: false, opacity: 0 });   // normal blending: piled-up dots don't turn into a white glow
  const pts = new THREE.Points(streamGeo, pm); pts.frustumCulled = false; pts.visible = false; anat.add(pts); stream.points = pts;
}
// ---------- the head's inside made to fit the person
// The atlas skull is ~1 cm longer at the back than his head (it stuck out of the skin there, the brain
// ~3 mm). Pull the skull and brain in towards the head's centre only in the directions where they would
// come within ~5 mm (the scalp) of his skin, smoothly; everywhere else they are left as they are.
{
  const inv = anat.matrixWorld.clone().invert(), v = new THREE.Vector3(), C = new THREE.Vector3(0, 1.62, -0.005);
  const NA = 36, NE = 18, D = Math.PI / NE;
  const coord = (p) => { const d = p.clone().sub(C), r = d.length(); return [(Math.atan2(d.x, d.z) + Math.PI) / D, (Math.asin(Math.max(-1, Math.min(1, d.y / r))) + Math.PI / 2) / D, r]; };
  const grid = (fill) => Array.from({ length: NA }, () => new Array(NE).fill(fill));
  const skinR = grid(Infinity), boneR = grid(0);
  const scan = (ms, keep, f) => { for (const m of ms) { m.updateWorldMatrix(true, false); const M = inv.clone().multiply(m.matrixWorld), P = m.geometry.attributes.position; for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); if (!keep(v)) continue; const [a, e, r] = coord(v); f(Math.min(NA - 1, Math.floor(a)), Math.min(NE - 1, Math.floor(e)), r); } } };
  scan([skin], (q) => q.y > 1.6 || q.z < -0.02, (a, e, r) => { skinR[a][e] = Math.min(skinR[a][e], r); });   // the scalp (not the face, not the mouth inside)
  scan([...(role.skull ?? []), ...(role.brain ?? [])], () => true, (a, e, r) => { boneR[a][e] = Math.max(boneR[a][e], r); });
  let k = grid(1);
  for (let a = 0; a < NA; a++) for (let e = 0; e < NE; e++) if (isFinite(skinR[a][e]) && boneR[a][e] > 0) k[a][e] = Math.min(1, (skinR[a][e] - 0.005) / boneR[a][e]);
  for (let it = 0; it < 3; it++) {                   // smooth (taking the smaller of a bin and its neighbours' mean, so nothing pokes out)
    const n = grid(1);
    for (let a = 0; a < NA; a++) for (let e = 0; e < NE; e++) { let sum = 0, c = 0; for (const [da, de] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const ee = e + de; if (ee < 0 || ee >= NE) continue; sum += k[(a + da + NA) % NA][ee]; c++; } n[a][e] = Math.min(k[a][e] + 0.02, sum / c); }
    k = n;
  }
  const at = (fa, fe) => {                           // bilinear, wrapping round in azimuth
    fa -= 0.5; fe = Math.max(0, Math.min(NE - 1.001, fe - 0.5)); const a0 = Math.floor(fa), e0 = Math.floor(fe), ta = fa - a0, te = fe - e0, A0 = (a0 + NA) % NA, A1 = (a0 + 1) % NA;
    return (k[A0][e0] * (1 - ta) + k[A1][e0] * ta) * (1 - te) + (k[A0][e0 + 1] * (1 - ta) + k[A1][e0 + 1] * ta) * te;
  };
  let most = 1;
  for (const m of [...(role.skull ?? []), ...(role.brain ?? [])]) {
    const P = m.geometry.attributes.position;
    if (!(P.array instanceof Float32Array) || P.normalized) { const g = m.geometry.clone(), arr = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) arr.set([P.getX(i), P.getY(i), P.getZ(i)], i * 3); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); m.geometry = g; }
    const Q = m.geometry.attributes.position, M = inv.clone().multiply(m.matrixWorld), Mi = M.clone().invert();
    for (let i = 0; i < Q.count; i++) {
      v.fromBufferAttribute(Q, i).applyMatrix4(M); const [a, e] = coord(v), f = at(a, e); if (f >= 0.9999) continue; most = Math.min(most, f);
      v.sub(C).multiplyScalar(f).add(C).applyMatrix4(Mi); Q.setXYZ(i, v.x, v.y, v.z);
    }
    Q.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere();
  }
  console.info('skull and brain pulled in to fit the head: at most to', (most * 100).toFixed(0) + '%');
}
// The olfactory groove and the brain on it. In the atlas, 15 mm off the midline (where the cut shows the
// brain and the frontal bone), the roof of the orbit and the brain on it sit ~1 cm above the bulb, so the cut
// showed a tall wall of bone between the brain and the bulb. In life the straight gyrus rests on the bulb, and
// the groove's side wall is a few mm high (the Keros types: 1-3, 4-7, up to 16 mm). So in the strip the cut
// shows (13-24 mm off the midline, over the plate) the orbital roof is lowered to the groove's rim and the
// brain's underside to just above it; the change fades out within ~1 cm in every direction.
const GROOVE_RIM = A.cribriform.y + 0.010;
// the frontal bone's floor 15 mm off the midline, (z, y), measured 2026-11-17
const FRONTAL15 = [[0.080, 1.6232], [0.076, 1.6198], [0.072, 1.6165], [0.068, 1.6118], [0.064, 1.6123], [0.060, 1.6129], [0.056, 1.6171], [0.052, 1.6134], [0.048, 1.6172], [0.044, 1.6161], [0.040, 1.6103], [0.036, 1.6075], [0.032, 1.6099]];
const f15 = (z) => {                                  // smoothed, interpolated in z
  const a = FRONTAL15.map(([zz], i, s) => [zz, (s[Math.max(0, i - 1)][1] + s[i][1] + s[Math.min(s.length - 1, i + 1)][1]) / 3]).reverse();
  if (z <= a[0][0]) return a[0][1]; if (z >= a.at(-1)[0]) return a.at(-1)[1];
  const i = a.findIndex(([zz]) => zz > z), t = (z - a[i - 1][0]) / (a[i][0] - a[i - 1][0]); return a[i - 1][1] + t * (a[i][1] - a[i - 1][1]);
};
const grooveZ = (z) => sstep0((z - 0.024) / 0.01) * sstep0((0.084 - z) / 0.01);   // over the plate (z 0.040-0.070), fading out
const grooveX = (x) => { const ax = Math.abs(x); return sstep0((ax - 0.010) / 0.003) * sstep0((0.034 - ax) / 0.010); };
const roofDrop = (z) => Math.min(0.012, Math.max(0, f15(z) - GROOVE_RIM)) * grooveZ(z);
{
  const inv = anat.matrixWorld.clone().invert(), v = new THREE.Vector3(), za = (m) => m.userData.za_name || m.name;
  const shift = (ms, drop, floor, band) => {
    let most = 0;
    for (const m of ms) {
      const M = inv.clone().multiply(m.matrixWorld), Mi = M.clone().invert(), P = m.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(M);
        const d = drop(v.z) * grooveX(v.x) * (1 - sstep0((v.y - floor(v.z)) / band)); if (d <= 0) continue;
        v.y -= d; most = Math.max(most, d); v.applyMatrix4(Mi); P.setXYZ(i, v.x, v.y, v.z);
      }
      P.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere();
    }
    return most;
  };
  // the brain's underside 13-17 mm off the midline, per 2.5 mm of z
  const bins = new Map();
  for (const m of role.brain ?? []) {
    const M = inv.clone().multiply(m.matrixWorld), P = m.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); const ax = Math.abs(v.x); if (ax < 0.013 || ax > 0.017) continue; const k = Math.round(v.z / 0.0025); bins.set(k, Math.min(bins.get(k) ?? Infinity, v.y)); }
  }
  const bot = (z) => { const k = Math.round(z / 0.0025); const ys = [k - 1, k, k + 1].map((j) => bins.get(j)).filter((y) => y !== undefined); return ys.length ? Math.min(...ys) : GROOVE_RIM; };
  const r = shift((role.skull ?? []).filter((m) => /^Frontal bone/.test(za(m))), roofDrop, (z) => f15(z) + 0.004, 0.02);
  const b = shift(role.brain ?? [], (z) => Math.min(0.012, Math.max(0, bot(z) - GROOVE_RIM - 0.0012)) * grooveZ(z), bot, 0.025);
  console.info('olfactory groove: orbital roof lowered by up to', (r * 1000).toFixed(1), 'mm, the brain\'s underside by up to', (b * 1000).toFixed(1), 'mm');
}
// The mouth. MakeHuman models its inside as a pouch whose roof reaches ~2 cm higher than a palate would,
// up into the nasal cavity: squash it down so its roof is the palate's underside. And draw what the
// atlas copy has no usable mesh for (the maxilla and palatine walls cross our wider-than-life cavity):
// the hard palate (bone, the nasal floor above, the roof of the mouth below), the soft palate behind it,
// and the tongue. Sizes from the cavity floor; shapes simplified.
const inPouch = (p, k = 1) => ((p.x / 0.022) ** 2 + ((p.y - 1.545) / 0.04) ** 2 + ((p.z - 0.04) / 0.048) ** 2) < k * k;
// the whole mouth, cheeks and the front behind the lips included (the pouch above is its middle)
const inMouth = (p, k = 1) => ((p.x / 0.032) ** 2 + ((p.y - 1.545) / 0.04) ** 2 + ((p.z - 0.042) / 0.05) ** 2) < k * k;
const PAL = { top: 1.5462, under: 1.5405, front: 0.091, back: 0.040 };   // y of the nasal floor side / mouth side, z of its ends
role.mouth = [];
{
  const M = anat.matrixWorld.clone().invert().multiply(skin.matrixWorld), Mi = M.clone().invert(), P = skin.geometry.attributes.position, v = new THREE.Vector3();
  const NM = new THREE.Matrix3().getNormalMatrix(M), Nrm = skin.geometry.attributes.normal, nv = new THREE.Vector3(), MC = new THREE.Vector3(0, 1.545, 0.042);
  const lo = 1.505, hi = 1.578, to = PAL.under - 0.0008; let n = 0;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(M);
    if (!inMouth(v, 1.12) || v.y <= lo) continue;
    nv.fromBufferAttribute(Nrm, i).applyMatrix3(NM);
    if (!inPouch(v, 1.05) && nv.dot(MC.clone().sub(v)) <= 0) continue;   // beyond the middle, only the mouth's inside (its normals face in), not the cheeks' or the lips' outside
    const w = sstep0((0.088 - v.z) / 0.01);          // not the lips' outer surface
    v.y -= w * (v.y - lo) * (1 - (to - lo) / (hi - lo)); v.applyMatrix4(Mi); P.setXYZ(i, v.x, v.y, v.z); n++;
  }
  P.needsUpdate = true; skin.geometry.computeVertexNormals(); skin.geometry.computeBoundingSphere();
  const mk = (geo, color, name, rough = 0.6) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: rough, transparent: true }));
    m.name = name; m.userData = { base: m.material.color.clone(), op: 0, target: 0 }; m.visible = false;
    anat.add(m); meshes.set(name, m); role.mouth.push(m); return m;
  };
  const sideways = (pts, w, bevel) => {              // a sagittal outline (z, y), given width across x
    const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 2 * w, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 });
    g.rotateY(-Math.PI / 2); g.translate(w, 0, 0); return g;   // shape x -> anatomy z, extrusion -> anatomy x
  };
  const { top, under, front, back } = PAL, b = 0.0006;
  // hard palate: thin at the back, thick at the front where it carries the upper teeth's sockets
  mk(sideways([[back + b, top - b], [front - 0.004, top - b], [front - b, top - 0.002], [front - 0.001, under - 0.008], [front - 0.006, under - 0.009], [front - 0.012, under - 0.002], [back + 0.004, under + b], [back + b, under + 0.0015]], 0.019, b), 0xf1e4c4, '(hard palate)', 0.75);
  // soft palate: hangs down and back from the hard palate's back edge, ending in the uvula
  const sp = new THREE.CatmullRomCurve3([[back - 0.0002, (top + under) / 2 - 0.0005, 0], [back - 0.007, under - 0.003, 0], [back - 0.013, under - 0.011, 0], [back - 0.017, under - 0.019, 0]].map((q) => new THREE.Vector3(...q))).getPoints(14);
  const thick = (f) => 0.0028 * (1 - 0.5 * f), up = [], down = [];
  sp.forEach((q, i) => { const t = sp[Math.min(i + 1, sp.length - 1)].clone().sub(sp[Math.max(i - 1, 0)]).normalize(), nrm = new THREE.Vector2(-t.y, t.x), h = thick(i / (sp.length - 1)); up.push([q.x + nrm.x * h, q.y + nrm.y * h]); down.unshift([q.x - nrm.x * h, q.y - nrm.y * h]); });
  mk(sideways([...up, ...down], 0.014, 0.0012), 0xc4616a, '(soft palate)');
  // tongue: a rounded muscle filling the floor of the mouth, its back curving down into the throat
  const tg = new THREE.SphereGeometry(1, 40, 24), tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) { v.fromBufferAttribute(tp, i); const zz = v.z, yy = v.y; v.set(v.x * 0.021, yy * (yy > 0 ? 0.0115 : 0.009), zz * 0.033); v.y -= 0.004 * Math.max(0, -zz) ** 2 * 2; v.add(new THREE.Vector3(0, under - 0.0135, 0.057)); tp.setXYZ(i, v.x, v.y, v.z); }
  tg.computeVertexNormals();
  mk(tg, 0xb84a56, '(tongue)', 0.5);
  console.info('mouth: pouch roof lowered (', n, 'vertices ), palate, soft palate and tongue drawn');
}

// The skull floor around the plate, drawn (the atlas's ethmoid and sphenoid are one tangle each, and
// left out of the cut). Traced from the atlas bones' profile 5 mm off the midline (measured 2026-11-17):
// the plate lies ~1 cm below the floor of the skull in front of and behind it, in a trough (the
// olfactory fossa) where the bulb lies; behind it the floor runs over the sphenoid body (with its
// sinus): the planum, the dip of the sella, the dorsum, and the clivus sloping down to the spine.
role.base = [];
{
  const pb = new THREE.Box3().setFromObject(role.cribriform[0]).applyMatrix4(anat.matrixWorld.clone().invert());
  const pTop = pb.max.y, pBot = pb.min.y, z0 = pb.min.z, z1 = pb.max.z, rim = A.cribriform.y + 0.010;
  const mk = (shape, holes, x0, x1, name) => {
    const sh = new THREE.Shape(shape.map(([z, y]) => new THREE.Vector2(z, y)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0004, bevelSegments: 2, curveSegments: 8 });
    g.rotateY(-Math.PI / 2); g.translate(x1, 0, 0);   // shape x -> z, extrusion from x1 down to x0
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf1e4c4, roughness: 0.75, transparent: true }));
    m.name = name; m.userData = { base: m.material.color.clone(), op: 0, target: 0 }; m.visible = false;
    anat.add(m); meshes.set(name, m); role.base.push(m); return m;
  };
  // in front: the floor steps down from the frontal bone to the plate's front edge
  mk([[0.083, rim - 0.0015], [z1 + 0.005, rim - 0.003], [z1 + 0.0012, pTop + 0.002], [z1, pTop], [z1, pBot], [z1 + 0.004, pBot - 0.0005], [0.083, rim - 0.006]], [], -0.016, 0.016, '(skull floor, front)');
  // behind: up from the plate's back edge to the planum, the sella, the dorsum, the clivus; the sphenoid body below, hollowed by its sinus
  mk([[z0, pTop], [z0 - 0.0006, pTop + 0.003], [z0 - 0.004, rim - 0.0015], [0.027, rim - 0.0012], [0.022, 1.6], [0.018, 1.5945], [0.0125, 1.594], [0.009, 1.5995], [0.0065, 1.6008], [0.0045, 1.5925],
      [-0.004, 1.5805], [-0.013, 1.5665], [-0.015, 1.5635], [-0.006, 1.574], [0.004, 1.577], [0.02, 1.578], [0.026, 1.5825], [0.031, 1.5875], [z0 - 0.002, pBot - 0.0006], [z0, pBot]],
     [[[0.0075, 1.5805], [0.023, 1.581], [0.0285, 1.5865], [0.03, 1.5925], [0.025, 1.5965], [0.019, 1.5905], [0.012, 1.5895], [0.008, 1.5875]]], -0.016, 0.016, '(skull floor, back)');
  // behind the bulb: the groove's side wall (the lateral lamella), from the plate up to the orbital roof,
  // whose floor here (15 mm off the midline, where the frontal bone is cut) was lowered to the rim above
  const top = FRONTAL15.map(([z]) => [z, f15(z) - roofDrop(z) + 0.0012]);   // just inside the bone
  mk([[0.085, top[0][1] + 0.002], [0.085, pBot - 0.002], [z0 - 0.002, pBot - 0.0008], [z0 - 0.004, rim - 0.004], [0.027, rim - 0.004], [0.027, Math.min(1.6105, top.at(-1)[1])],
      ...top.slice().reverse()], [], -0.0163, -0.0153, '(olfactory fossa wall)');   // just behind the brain's cut (15 mm), in front of the eye
}

// ---------- the textbook cut (step "Through the skull"): the head sliced front to back through the
// cup-side nasal cavity, the half facing you removed, as in Patrick J. Lynch's "Head Olfactory Nerve
// Labeled" (Wikimedia Commons, CC BY 2.5). Kept simple, like the drawing: skin, the bones around the
// nose, the cavity, a faint brain, and the olfactory nerve in yellow. Each cut part is filled flat (its
// back faces in one colour) and edged with a smooth rounded rim, so you can tell the parts apart.
const CUT_X = SIDE * 0.005;                          // through the cavity, between the septum and the turbinates
const CUT_PARK = -SIDE * 1;                          // a metre away on the far side: nothing is cut
const cutPlane = new THREE.Plane(new THREE.Vector3(SIDE, 0, 0), -SIDE * CUT_PARK);   // anatomy space; keeps the cup side
// the brain is cut ~1 cm deeper than the rest, as illustrators do, so the bulb and tract (which lie
// off the midline, under the frontal lobe) show on top of it
const BRAIN_DEEPER = 0.010, DEEP = () => (role.skull ?? []).filter((m) => /^(Frontal bone|Left parietal|Parietal|Occipital)/.test(nameOf(m))), cutBrain = new THREE.Plane(), cutBrainW = new THREE.Plane();
const cutPlaneW = new THREE.Plane(), cutMid = new THREE.Plane(new THREE.Vector3(SIDE, 0, 0), 0), cutMidW = new THREE.Plane();   // the pathway is cut only at the midline, so the cup-side bulb shows whole
const cutState = { x: CUT_PARK, target: CUT_PARK, fill: 0, on: { value: 0 }, driven: false };
// the bones the drawing keeps: the vault (cut ~1 cm deeper, with the brain) and the bridge of the nose. Left out: the maxilla, palatine and sphenoid walls, which would run through the drawn cavity
// (wider than life); the drawn hard palate stands in for them.
const CUT_BONES = /^(Frontal bone|Nasal bone|Left parietal|Parietal|Occipital|Temporal)/;
const nameOf = (m) => m.userData.za_name || m.name;
for (const m of [...(role.skull ?? []), ...(role.nose ?? []), ...role.base, ...(role.cribriform ?? [])]) m.userData.rate = 2;   // bones come in gently when the cut opens
const CAP = { bone: 0xf1e4c4, plate: 0xe8cf8e, brain: 0xb7949e, flesh: 0xc98272, eye: 0xf0ece6, nerve: 0xf2c53d };
function capColor(m) {
  if (role.face.includes(m) || role.body.includes(m)) return /low-poly/.test(m.name) ? CAP.eye : CAP.flesh;
  if (role.brain?.includes(m)) return CAP.brain;
  if (role.olfactory?.includes(m)) return CAP.nerve;
  if (m.name === '(tongue)' || m.name === '(soft palate)') return 0x9c3a46;
  return CAP.bone;
}
{
  const own = ['(cavity)', '(vestibule)', '(nostril, other side)', '(nose hairs)', '(nose hairs, other side)'].map((n) => meshes.get(n));
  // only closed parts are filled; bones are open shells (their inside would fill as a flat sheet), so
  // they show both sides lit instead: you see into the half that is left
  const filled = new Set([skin, meshes.get('(person) low-poly'), ...(role.brain ?? []), ...role.mouth, ...role.base, ...(role.cribriform ?? [])]);
  for (const m of [...(role.skull ?? []), ...(role.nose ?? [])]) m.material.side = THREE.DoubleSide;
  const skip = new Set([...own, ...role.cup, ...role.epithelium, ...role.piriform]);
  anat.traverse((o) => {
    if (!(o.isMesh || o.isPoints) || !o.material) return;
    const m = o.material;
    m.clippingPlanes = o === skin ? m.clippingPlanes : [cutPlaneW];
    if (!o.isMesh || skip.has(o) || !filled.has(o)) return;
    // closed parts: the inside shows in a flat colour while the cut is on (dissolving in), and not at all otherwise
    const col = new THREE.Color(capColor(o)), prev = m.onBeforeCompile, key = m.customProgramCacheKey?.bind(m);
    m.side = THREE.DoubleSide;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.uniforms.uCutOn = cutState.on; sh.uniforms.uCapCol = { value: col };   // a uniform: the compiled program is shared between parts
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uCutOn; uniform vec3 uCapCol;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  if (!gl_FrontFacing) {
    if (fract(sin(dot(floor(gl_FragCoord.xy / 3.0), vec2(12.9898, 78.233))) * 43758.5453) >= uCutOn) discard;
    gl_FragColor = vec4(uCapCol, gl_FragColor.a);
  }`);
    };
    m.customProgramCacheKey = () => (key ? key() : '') + '|cap';
    m.needsUpdate = true;
  });
  for (const m of [...(role.olfactory ?? []), ...role.epithelium]) m.material.clippingPlanes = [cutMidW];   // (the plate is cut with the bones)
  for (const m of [...(role.brain ?? []), ...DEEP()]) m.material.clippingPlanes = [cutBrainW];
}
// Where the slice crosses each part: the crossing segments are joined into lines, smoothed, and drawn
// as one continuous tube per line (a rounded rim on the cut face). Measured once, at the final cut.
// `uGrow` draws them in along their length, so the rims spread over the cut when it opens.
const cutStrokes = new THREE.Group(); cutStrokes.visible = false; anat.add(cutStrokes);
const cutStroke = { grow: 0, target: 0, uGrow: { value: 0 }, uFib: { value: 0 } };
function growMat(color, uni, emiss = 0.35) {           // lit, but mostly its flat colour, like the fill next to it
  const c = new THREE.Color(color), m = new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(emiss), roughness: 0.7 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrow = uni;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aU; varying float vU;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvU = aU;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGrow; varying float vU;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vU > uGrow) discard;');
  };
  m.customProgramCacheKey = () => 'grow';
  return m;
}
function tubeAlong(lines, r, seg = 10) {             // lines: [{pts, u0, u1}] in the plane x = const; one geometry
  const pos = [], nor = [], uu = [], idx = []; const t = new THREE.Vector3(), n1 = new THREE.Vector3(1, 0, 0), n2 = new THREE.Vector3(), q = new THREE.Vector3();
  for (const { pts, u0 = 0, u1 = 1, rs } of lines) {
    let L = 0; const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(L += pts[i].distanceTo(pts[i - 1]));
    const base = pos.length / 3;
    pts.forEach((p, i) => {
      t.subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]).normalize();
      const a = Math.abs(t.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : n1; n2.crossVectors(t, a).normalize(); const b = new THREE.Vector3().crossVectors(n2, t);
      const rr = rs ? rs(acc[i] / (L || 1)) : r;
      for (let k = 0; k <= seg; k++) {
        const th = k / seg * Math.PI * 2; q.copy(b).multiplyScalar(Math.cos(th)).addScaledVector(n2, Math.sin(th));
        pos.push(p.x + q.x * rr, p.y + q.y * rr, p.z + q.z * rr); nor.push(q.x, q.y, q.z); uu.push(u0 + (u1 - u0) * acc[i] / (L || 1));
      }
      if (i) for (let k = 0; k < seg; k++) { const a0 = base + (i - 1) * (seg + 1) + k, b0 = a0 + seg + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('aU', new THREE.Float32BufferAttribute(uu, 1)); g.setIndex(idx);
  return g;
}
{
  const bones = (ms) => ms.filter((m) => CUT_BONES.test(nameOf(m)));
  const deep = new Set(DEEP()), X2 = CUT_X + SIDE * BRAIN_DEEPER;
  const groups = [
    { ms: bones([...(role.skull ?? []), ...(role.nose ?? [])]).filter((m) => !deep.has(m)), color: CAP.bone, r: 0.0010, minL: 0.006 },
    { ms: [...deep], color: CAP.bone, r: 0.0010, minL: 0.006, x: X2 },
    { ms: [...(role.brain ?? [])], color: 0x9a7684, r: 0.0009, minL: 0.006, x: X2 },   // the brain, cut with the vault
    { ms: [meshes.get('(hard palate)')], color: CAP.bone, r: 0.0010, minL: 0.004 },
    { ms: [meshes.get('(soft palate)'), meshes.get('(tongue)')], color: 0x8e3440, r: 0.0008, minL: 0.004 },   // the frontal bone is cut deeper, with the brain
    { ms: [skin], color: 0xb46a5c, r: 0.0008, minL: 0.01 },
    { ms: [meshes.get('(cavity)'), meshes.get('(vestibule)')], color: 0xd65f72, r: 0.0008, minL: 0.004 },
    { ms: [...(role.cribriform ?? []), ...role.base], color: CAP.bone, r: 0.0010, minL: 0.002 },
  ];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], off = -SIDE * 0.0002;   // a hair towards you, on top of the cut
  const E = 2e-6, key = (p) => Math.round(p.y / E) + ',' + Math.round(p.z / E);
  function chains(segs) {                            // join the segments that share ends into lines
    const adj = new Map(), at = new Map(), used = new Set(), ek = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    for (const [a, b] of segs) { const ka = key(a), kb = key(b); if (ka === kb) continue; at.set(ka, a); at.set(kb, b); for (const [x, y] of [[ka, kb], [kb, ka]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push(y); } }
    const starts = [...adj.keys()].sort((a, b) => (adj.get(a).length === 1 ? 0 : 1) - (adj.get(b).length === 1 ? 0 : 1));
    const out = [];
    for (const s of starts) for (const n0 of adj.get(s)) {
      if (used.has(ek(s, n0))) continue;
      const line = [s]; let cur = n0; used.add(ek(s, n0));
      for (;;) { line.push(cur); const nx = adj.get(cur).find((n) => !used.has(ek(cur, n))); if (nx === undefined) break; used.add(ek(cur, nx)); cur = nx; }
      out.push(line.map((k) => at.get(k)));
    }
    return out;
  }
  function smooth(pts, it = 3) {                     // Chaikin corner cutting; closed lines stay closed
    const closed = pts.length > 3 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-5;
    for (let r = 0; r < it; r++) {
      const o = closed ? [] : [pts[0]], n = pts.length - 1;
      for (let i = 0; i < n; i++) { o.push(pts[i].clone().lerp(pts[i + 1], 0.25), pts[i].clone().lerp(pts[i + 1], 0.75)); }
      if (closed) o.push(o[0].clone()); else o.push(pts[n]);
      pts = o;
    }
    return pts;
  }
  const len = (p) => p.reduce((a, q, i) => (i ? a + q.distanceTo(p[i - 1]) : 0), 0);
  for (const g of groups) {
    const segs = [];
    for (const m of g.ms) {
      if (!m) continue;
      m.updateWorldMatrix(true, false);
      const T = anat.matrixWorld.clone().invert().multiply(m.matrixWorld), P = m.geometry.attributes.position, I = m.geometry.index;
      const n = I ? I.count : P.count, at = (k) => (I ? I.getX(k) : k);
      let hit = 0;
      for (let t = 0; t < n; t += 3) {
        for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(P, at(t + k)).applyMatrix4(T);
        const d = v.map((p) => p.x - (g.x ?? CUT_X)), pts = [];
        for (let k = 0; k < 3; k++) { const a = k, b = (k + 1) % 3; if ((d[a] < 0) !== (d[b] < 0)) { const [lo, hi] = key(v[a]) < key(v[b]) ? [a, b] : [b, a]; pts.push(v[lo].clone().lerp(v[hi], d[lo] / (d[lo] - d[hi]))); } }
        if (pts.length === 2 && !(m === skin && inMouth(pts[0].clone().add(pts[1]).multiplyScalar(0.5), 1.1))) { segs.push(pts); hit++; }   // (the mouth's lining: the tongue and palate outline it)
      }
      m.userData.cutHit = hit;
    }
    // the crumbs of small, cut-through details are left out: only lines of some length
    const lines = chains(segs).filter((p) => len(p) > g.minL).map((p) => smooth(p).map((q) => (q.x = (g.x ?? CUT_X) + off, q)));
    if (!lines.length) continue;
    const L = lines.map(len), tot = Math.max(...L);
    // every line grows from its start, the longest over the whole time, short ones as fast
    const tube = new THREE.Mesh(tubeAlong(lines.map((pts, i) => ({ pts, u0: 0, u1: L[i] / tot })), g.r), growMat(g.color, cutStroke.uGrow));
    tube.frustumCulled = false; cutStrokes.add(tube);
  }
}
// The olfactory nerves (drawn, as in the textbook figure): bundles of axons that hang from the
// underside of the plate into the roof of the cavity, branching as they go. They grow in after the rims.
{
  const pb = new THREE.Box3().setFromObject(role.cribriform[0]).applyMatrix4(anat.matrixWorld.clone().invert());
  const top = pb.min.y, z0 = pb.min.z + 0.002, z1 = pb.max.z - 0.002, x = CUT_X + SIDE * 0.0012, depth = 0.011;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lines = [];
  const branch = (p, dir, L, r, lvl) => {
    const pts = [p.clone()]; let q = p.clone(), d = dir.clone();
    const n = 6; for (let i = 0; i < n; i++) { d.z += (rnd() - 0.5) * 0.5; d.normalize(); q = q.clone().addScaledVector(d, L / n); pts.push(q); }
    const sm = new THREE.CatmullRomCurve3(pts).getPoints(16);
    const u = (pp) => (top - pp.y) / depth;
    lines.push({ pts: sm, u0: u(sm[0]), u1: u(sm[sm.length - 1]), rs: (f) => r * (1 - 0.6 * f) });
    if (lvl < 2) for (const k of [0.45, 0.75]) if (rnd() < 0.8) {
      const s = sm[Math.round(k * (sm.length - 1))], side = rnd() < 0.5 ? -1 : 1;
      branch(s, new THREE.Vector3(0, -1, side * (0.5 + rnd() * 0.5)).normalize(), L * (0.45 + rnd() * 0.2), r * 0.6, lvl + 1);
    }
  };
  const N = 13;
  for (let i = 0; i < N; i++) {
    const z = z0 + (z1 - z0) * (i + 0.5) / N + (rnd() - 0.5) * 0.0008;
    branch(new THREE.Vector3(x, top + 0.0004, z), new THREE.Vector3(0, -1, (rnd() - 0.5) * 0.3).normalize(), depth * (0.55 + rnd() * 0.35), 0.00028, 0);
  }
  const fib = new THREE.Mesh(tubeAlong(lines, 0.0003, 6), growMat(CAP.nerve, cutStroke.uFib, 0.45));
  fib.frustumCulled = false; fib.name = '(olfactory nerves, drawn)'; cutStrokes.add(fib);
}
function cutTick(fdt) {
  if (!cutState.driven) {                            // a step change without its own timeline: slide in, then fill and draw
    cutState.x += (cutState.target - cutState.x) * Math.min(1, fdt * 3.5);
    const at = cutStroke.target && Math.abs(cutState.x - CUT_X) < 0.003, inHead = cutStroke.target && Math.abs(cutState.x) < 0.08;
    cutStroke.grow = at ? Math.min(1, cutStroke.grow + fdt / 1.6) : Math.max(0, cutStroke.grow - fdt / 0.4);
    cutState.fill = inHead ? Math.min(1, cutState.fill + fdt / 0.8) : Math.max(0, cutState.fill - fdt / 0.4);
  }
  cutState.on.value = cutState.fill;
  cutStroke.uGrow.value = cutStroke.grow; cutStroke.uFib.value = Math.max(0, cutStroke.grow * 1.8 - 0.8) * 1.05;
  cutStrokes.visible = cutStroke.grow > 0.001;
  cutPlane.constant = -SIDE * cutState.x;
  cutPlaneW.copy(cutPlane).applyMatrix4(anat.matrixWorld);
  cutBrain.normal.copy(cutPlane.normal); cutBrain.constant = cutPlane.constant - BRAIN_DEEPER * cutState.fill; cutBrainW.copy(cutBrain).applyMatrix4(anat.matrixWorld);
  cutMid.constant = -SIDE * (SIDE < 0 ? Math.max(cutState.x, 0) : Math.min(cutState.x, 0));
  cutMidW.copy(cutMid).applyMatrix4(anat.matrixWorld);
}

// ---------- the zoom (step "Olfactory bulb"): Chabacano's close-up ("Olfactory system", Wikimedia
// Commons) as a block at the plate: receptor neurons in the epithelium, one receptor type per colour,
// send their axons up through the plate's holes, and all axons of a type meet in one glomerulus of the
// bulb, where a mitral cell takes the signal on along the tract. Schematic: sizes much larger than
// life, three types for ~350, a few cells for millions.
const ZTYPES = [0x2f6fd0, 0xd8393c, 0x3fa34d];
role.zoom = [];
const ZOOM = { pulses: [], glom: [], odor: [] };
{
  const u = 0.001, c = A.cribriform, xf = CUT_X + 0.0006, xb = xf - 3 * u, xm = (xf + xb) / 2, xc = xf + 0.00025;   // xc: cells drawn on the front face
  const Y0 = c.y - 0.6 * u, Yp = Y0 + 1.2 * u, Yb = Yp + 0.1 * u, zF = c.z + 4 * u, zB = c.z - 4 * u;
  Object.assign(ZOOM, { u, Y0, Yp, Yb, zF, zB, xf, c });
  const reg = (m, name) => { m.name = name; m.material.transparent = true; m.userData = { base: m.material.color.clone(), emis: m.material.emissive?.clone(), op: 0, target: 0, schematic: true }; m.visible = false; anat.add(m); meshes.set(name, m); role.zoom.push(m); return m; };
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...extra });
  const slab = (y0, y1, z0, z1, color, name, r = 0.25 * u) => {
    const w = z0 - z1, h = y1 - y0, sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const g = new THREE.ExtrudeGeometry(sh, { depth: xf - xb, bevelEnabled: false, curveSegments: 6 });
    g.rotateY(-Math.PI / 2); g.translate(xf, (y0 + y1) / 2, (z0 + z1) / 2);   // shape x -> z (front at +z), extrusion -> -x
    return reg(new THREE.Mesh(g, std(color)), name);
  };
  slab(Y0 - 2 * u, Y0, zF, zB, 0xe9a07e, '(zoom) epithelium');
  slab(Y0 + 0.02 * u, Yp, zF, zB, 0xe6cf98, '(zoom) bone');
  const mucus = slab(Y0 - 2.35 * u, Y0 - 2 * u, zF, zB, 0x9cc7e0, '(zoom) mucus', 0.15 * u); mucus.userData.max = 0.55;
  // the bulb: a rounded yellow body over the plate that narrows into the tract towards the back
  {
    const sh = new THREE.Shape(), y0 = Yb, y1 = Yb + 3.3 * u, zt = zB - 5 * u;
    sh.moveTo(zF - 0.3 * u, y0); sh.lineTo(zB, y0); sh.bezierCurveTo(zB - 1.5 * u, y0, zB - 2 * u, y0 + 0.9 * u, zt, y0 + 1.2 * u); sh.lineTo(zt, y0 + 2.2 * u);
    sh.bezierCurveTo(zB - 2 * u, y0 + 2.4 * u, zB - 1 * u, y1, zB, y1); sh.lineTo(zF - 1.6 * u, y1); sh.bezierCurveTo(zF, y1, zF + 0.4 * u, y0 + 1.2 * u, zF - 0.3 * u, y0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: xf - xb - 0.4 * u, bevelEnabled: true, bevelThickness: 0.2 * u, bevelSize: 0.2 * u, bevelSegments: 4, curveSegments: 16 });
    g.rotateY(-Math.PI / 2); g.translate(xf - 0.2 * u, 0, 0);
    reg(new THREE.Mesh(g, std(0xebd43c)), '(zoom) bulb');
  }
  const types = [0, 1, 2, 1, 0, 2, 0, 2, 1], N = types.length;
  const glomZ = [c.z + 2.3 * u, c.z + 0.1 * u, c.z - 2.1 * u], glomY = Yb + 1.15 * u, gr = 0.42 * u;
  const lines = ZTYPES.map(() => []), V = (z, y, x = xc) => new THREE.Vector3(x, y, z);
  types.forEach((t, i) => {
    const z = zF - 0.45 * u - i * (8 * u - 0.9 * u) / (N - 1), sy = Y0 - 1.15 * u;
    const soma = reg(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), std(ZTYPES[t], { emissive: ZTYPES[t], emissiveIntensity: 0.15 })), `(zoom) receptor neuron ${i}`);
    soma.scale.set(0.16 * u, 0.36 * u, 0.16 * u); soma.position.copy(V(z, sy));
    lines[t].push({ pts: [V(z, sy - 0.3 * u), V(z, Y0 - 2 * u)] });                                    // dendrite to the surface
    for (const a of [-0.5, -0.2, 0.15, 0.45]) lines[t].push({ pts: [V(z, Y0 - 2 * u), V(z + a * 0.6 * u, Y0 - 2.32 * u)] });   // cilia, in the mucus
    const ax = new THREE.CatmullRomCurve3([V(z, sy + 0.3 * u), V(z, Y0 - 0.1 * u), V(z, Yp + 0.15 * u), V((z + glomZ[t]) / 2, Yb + 0.35 * u), V(glomZ[t] + (z - glomZ[t]) * 0.15, glomY - gr * 0.9)], false, 'centripetal');
    lines[t].push({ pts: ax.getPoints(24) });
    ZOOM.pulses.push({ curve: ax, t, kind: 'axon' });
  });
  ZTYPES.forEach((col, t) => {
    const g = reg(new THREE.Mesh(new THREE.SphereGeometry(gr, 20, 14), std(col, { emissive: col, emissiveIntensity: 0.1, transparent: true, opacity: 0.6 })), `(zoom) glomerulus ${t}`);
    g.position.copy(V(glomZ[t], glomY, xc - 0.1 * u)); g.userData.max = 0.75; ZOOM.glom.push(g);
    const mz = glomZ[t] - 0.35 * u, my = glomY + 1.25 * u;
    const ms = reg(new THREE.Mesh(new THREE.ConeGeometry(0.28 * u, 0.55 * u, 3), std(col, { emissive: col, emissiveIntensity: 0.15 })), `(zoom) mitral cell ${t}`);
    ms.position.copy(V(mz, my)); ms.rotation.x = Math.PI / 2 * 0; 
    lines[t].push({ pts: new THREE.CatmullRomCurve3([V(mz, my - 0.25 * u), V(glomZ[t] - 0.1 * u, glomY + 0.6 * u), V(glomZ[t], glomY + gr * 0.6)]).getPoints(10) });   // its dendrite into the glomerulus
    const out = new THREE.CatmullRomCurve3([V(mz, my + 0.25 * u), V(mz - 0.6 * u, my + 0.55 * u), V(zB, Yb + 2.55 * u + t * 0.22 * u), V(zB - 5 * u, Yb + 1.45 * u + t * 0.22 * u)]);
    lines[t].push({ pts: out.getPoints(30) });                                                          // its axon, back along the tract
    ZOOM.pulses.push({ curve: out, t, kind: 'mitral' });
  });
  ZTYPES.forEach((col, t) => reg(new THREE.Mesh(tubeAlong(lines[t], 0.045 * u, 6), std(col, { emissive: col, emissiveIntensity: 0.2 })), `(zoom) fibres ${t}`));
  // pores in the bone where the axons pass
  const pg = new THREE.CylinderGeometry(0.17 * u, 0.17 * u, 0.02 * u, 16); pg.rotateZ(Math.PI / 2);
  const pores = new THREE.InstancedMesh(pg, std(0x7a6440), N); let k = 0;
  for (const p of ZOOM.pulses) if (p.kind === 'axon') { const q = p.curve.points[2]; pores.setMatrixAt(k++, new THREE.Matrix4().makeTranslation(xf + 0.01 * u, (Y0 + Yp) / 2, q.z)); }
  reg(pores, '(zoom) pores');
  // pulses and odorants (animated in zoomTick)
  for (const p of ZOOM.pulses) { p.dot = new THREE.Mesh(new THREE.SphereGeometry(p.kind === 'axon' ? 0.13 * u : 0.17 * u, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); p.dot.visible = false; anat.add(p.dot); }
  ZTYPES.forEach((col, t) => { const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 * u), new THREE.MeshBasicMaterial({ color: col })); o.visible = false; anat.add(o); ZOOM.odor.push(o); });
  A.zEpi = V(zF - 0.3 * u, Y0 - 1.6 * u); A.zBone = V(zB + 0.5 * u, (Y0 + Yp) / 2); A.zBulb = V(zB - 1 * u, Yb + 3 * u);
  A.zGlom = V(glomZ[2], glomY); A.zMitral = V(glomZ[0] - 0.35 * u, glomY + 1.3 * u); A.zCell = V(zF - 0.45 * u, Y0 - 1.15 * u);
  A.zoom = new THREE.Vector3(xf, c.y + 0.2 * u, c.z - 2.6 * u);   // a little behind the block's middle: it sits left of the text
}
const PERIOD = 4.5;
function zoomTick(time) {                            // one receptor type at a time: odorant binds, its axons fire, its glomerulus lights, its mitral cell passes it on
  const on = (role.zoom[0]?.userData.op ?? 0) > 0.6, { u, Y0, xf } = ZOOM;
  for (const p of ZOOM.pulses) p.dot.visible = false;
  for (const o of ZOOM.odor) o.visible = false;
  if (!on) return;
  const f = (time % (PERIOD * 3)) / PERIOD, t = Math.floor(f), ph = f - t;
  ZOOM.glom.forEach((g, i) => { g.material.emissiveIntensity = i === t && ph > 0.55 && ph < 0.85 ? 0.9 : 0.1; });
  const o = ZOOM.odor[t]; if (ph < 0.25) { o.visible = true; o.position.set(xf + 0.3 * u, Y0 - 3.4 * u + ph / 0.25 * 1.1 * u, ZOOM.c.z + 3 * u - t * 3 * u); o.rotation.y = time * 2; }
  for (const p of ZOOM.pulses) {
    if (p.t !== t) continue;
    const s = p.kind === 'axon' ? (ph - 0.22) / 0.38 : (ph - 0.62) / 0.36;
    if (s < 0 || s > 1) continue;
    p.dot.visible = true; p.dot.position.copy(p.curve.getPointAt(s));
  }
}
// ---------- inside the goggles: the steps after "But how do we see this?" fly into his headset, where the
// pipeline from the models to the GPU stands as a board, 1/80 of its size (so it fits in the visor), at the
// headset's centre. They zoom in 80x (FOCUS.models/load/site), and he and the headset fade out half way in (apply, "inside").
let ROBOT = null;   // the three.js robot's parts (built with the pipeline board, moved by robotTick)
const GOG = { c: new THREE.Vector3(), k: 1 / 80, off: new THREE.Vector3(-0.2, 0.2, 0) };
{ anat.updateMatrixWorld(true); const inv = anat.matrixWorld.clone().invert(), b = new THREE.Box3(); for (const m of role.headset) b.union(new THREE.Box3().setFromObject(m).applyMatrix4(inv)); b.getCenter(GOG.c); }
const gogAt = (x, y, z = 0) => GOG.c.clone().add(new THREE.Vector3(x, y, z).add(GOG.off).multiplyScalar(GOG.k));   // board spot -> anatomy space
// ---------- the pipeline (last step, "How it was built": from the models and the sensors to the lenses): the stages from pipeline.json around the man,
// in one of four styles to choose from (?blocks=A cards, B inside the headset, C stack, D frame loop). Life size, in his space.
// The pipeline steps show C (stack) and then B (inside the headset); ?blocks=A or D swaps the first one
// for the other prototypes.
const PIPE_STYLE = (params.get('blocks') ?? '').toUpperCase();
const PIPE_STYLES = ['C', 'B', ...(['A', 'D'].includes(PIPE_STYLE) ? [PIPE_STYLE] : [])];
const PIPE = await fetch(here('pipeline.json')).then((r) => r.json()).catch(() => ({ stages: [], devices: {}, layers: {} }));
const pipeFace = [], pipeMove = []; let pipeRole = null;
// the WebXR and OpenXR logos, unaltered (credits in pipeline.json, models.load.note); a missing one falls back to its name
const LOGOS = Object.fromEntries(await Promise.all(['webxr', 'openxr'].map(async (k) => {
  const img = new Image(); img.src = here(`logos/${k}.svg`);
  return [k, await img.decode().then(() => img, () => null)];
})));
{
  const reg = (m, name) => { m.name = '(pipe) ' + name; m.material.transparent = true; m.userData = { base: m.material.color.clone(), emis: m.material.emissive?.clone(), op: 0, target: 0, schematic: true }; m.visible = false; anat.add(m); meshes.set(m.name, m); role[pipeRole].push(m); return m; };
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
  const text = (lines, w, at, name, face = true) => {   // a text card; faces you unless it is printed on something
    const c = textCanvas(lines, 1024, 34), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = reg(new THREE.Mesh(new THREE.PlaneGeometry(w, w * c.height / c.width), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })), name);
    m.position.copy(at); if (face) pipeFace.push(m); return m;
  };
  const card = (st) => [{ text: st.title, font: '700 54px system-ui', color: '#ffd88a', lh: 66 }, ...st.lines.map((l) => ({ text: l, font: '40px system-ui', color: '#dde', lh: 52 }))];
  const V = (x, y, z) => new THREE.Vector3(x, y, z), tube = (pts, r, color, name) => reg(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, r, 8), std(color)), name);
  const packets = (curve, color, n, speed, name) => { for (let k = 0; k < n; k++) { const m = reg(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.025), std(color, { emissive: color, emissiveIntensity: 0.8 })), name + ' packet ' + k); pipeMove.push({ m, curve, ph: k / n, speed }); } };
  const st = PIPE.stages ?? [];
  for (const S of PIPE_STYLES) {
  pipeRole = 'pipe' + S; role[pipeRole] = [];
  if (S === 'A') {
    // A · cards: one panel per stage on an arc around him, joined by a path on the floor
    const R = 1.05, pts = [];
    st.forEach((s, i) => {
      const th = (-115 + 230 * i / Math.max(1, st.length - 1)) * Math.PI / 180, x = R * Math.sin(th), z = 0.1 + R * Math.cos(th), h = 1.25 + (i % 2) * 0.32;
      text(card(s), 0.5, V(x, h, z), 'card ' + s.id);
      tube([V(x, 0.01, z), V(x, h - 0.1, z)], 0.006, 0x8899aa, 'post ' + s.id);
      pts.push(V(x, 0.015, z));
    });
    if (pts.length > 1) { const path = new THREE.CatmullRomCurve3(pts); tube(path.getPoints(80), 0.012, 0xffb347, 'path'); packets(path, 0xffd88a, 5, 0.08, 'path'); }
  } else if (S === 'B') {
    // B · inside the headset: the setup laptop on a table to his left, and the headset taken apart beside
    // him, in the order a frame goes through it (sensors → CPU → GPU → displays and lenses → eyes)
    const dev = {}, on = (d) => st.filter((s) => s.on === d).map((s) => s.title);
    reg(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.45), std(0x6b5440)), 'table').position.set(0.8, 0.73, 0.45);
    for (const [dx, dz] of [[-0.32, -0.19], [0.32, -0.19], [-0.32, 0.19], [0.32, 0.19]]) reg(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.72, 0.03), std(0x4a3a2c)), 'leg').position.set(0.8 + dx, 0.36, 0.45 + dz);
    reg(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.018, 0.24), std(0x2b2f36)), 'laptop base').position.set(0.75, 0.755, 0.5);
    const term = textCanvas([{ text: '$ python3 -m http.server 8798', font: '34px monospace', color: '#7CFC8A', lh: 46 }, { text: '$ adb reverse tcp:8798 tcp:8798', font: '34px monospace', color: '#7CFC8A', lh: 46 }, { text: '$ adb shell am start -d localhost:8798', font: '34px monospace', color: '#7CFC8A', lh: 46 }], 900, 30);
    const tt = new THREE.CanvasTexture(term); tt.colorSpace = THREE.SRGBColorSpace;
    const lid = reg(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.012), std(0x2b2f36)), 'laptop lid');
    lid.position.set(0.75, 0.87, 0.385); lid.rotation.set(-0.25, -0.5, 0, 'YXZ');
    const scr = reg(new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), new THREE.MeshBasicMaterial({ map: tt })), 'laptop screen');
    scr.position.copy(lid.position).add(new THREE.Vector3(0, 0, 0.007).applyEuler(lid.rotation)); scr.rotation.copy(lid.rotation);
    dev.laptop = V(0.75, 1.15, 0.45);
    const cab = new THREE.CatmullRomCurve3([V(0.6, 0.77, 0.47), V(0.45, 0.5, 0.42), V(0.25, 0.85, 0.3), V(0.13, 1.35, 0.13), V(0.095, 1.6, 0.04)]);
    tube(cab.getPoints(60), 0.006, 0x222222, 'cable'); packets(cab, 0xffb347, 3, 0.2, 'files');
    // the headset, taken apart: Y is the frame's path, Z its depth; drawn 1.5× in a group, nearer to you
    const n0 = role[pipeRole].length;
    const Y = 1.38, Z = 0.42, X = { sensors: -1.8, cpu: -1.47, gpu: -1.17, display: -0.86, lens: -0.74, eye: -0.63 };
    const plate = reg(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.02), std(0x22252b)), 'front plate'); plate.position.set(X.sensors, Y, Z);
    for (const [dx, dy] of [[-0.075, 0.04], [0.075, 0.04], [-0.075, -0.04], [0.075, -0.04], [-0.03, 0], [0.03, 0]]) reg(new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), std(0x111111, { emissive: 0x335577, emissiveIntensity: 0.6 })), 'camera').position.set(X.sensors + dx, Y + dy, Z + 0.014);
    reg(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.018, 0.01), std(0x2e8b57)), 'motion sensor').position.set(X.sensors, Y - 0.045, Z + 0.014);
    reg(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.15, 0.012), std(0x2f6b3a)), 'board').position.set((X.cpu + X.gpu) / 2, Y, Z);
    for (const k of ['cpu', 'gpu']) {
      reg(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.016), std(0x1a1a1a)), k).position.set(X[k], Y, Z + 0.012);
      text([{ text: k.toUpperCase(), font: '700 60px system-ui', color: '#ffffff', lh: 70 }], 0.07, V(X[k], Y, Z + 0.022), k + ' print', false);
    }
    for (const dy of [0.042, -0.042]) {
      reg(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.075, 0.075), std(0x0e1a2a, { emissive: 0x3d6fb0, emissiveIntensity: 0.9 })), 'display').position.set(X.display, Y + dy, Z);
      const ln = reg(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24), std(0xcfe8ff)), 'lens'); ln.userData.max = 0.6; ln.position.set(X.lens, Y + dy, Z); ln.rotation.z = Math.PI / 2;
      reg(new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), std(0xf4f4f4)), 'eye').position.set(X.eye, Y + dy, Z);
    }
    const frame = new THREE.CatmullRomCurve3([V(X.sensors, Y, Z + 0.05), V(X.cpu, Y + 0.02, Z + 0.05), V(X.gpu, Y + 0.02, Z + 0.05), V(X.display, Y, Z + 0.05), V(X.eye, Y, Z + 0.05)]);
    tube(frame.getPoints(60), 0.005, 0xffb347, 'frame path'); packets(frame, 0xffd88a, 4, 0.5, 'frame');
    const back = new THREE.CatmullRomCurve3([V(X.eye, Y - 0.06, Z), V(-0.9, 0.85, Z + 0.05), V(-1.55, 0.85, Z + 0.05), V(X.sensors, Y - 0.08, Z)]);
    tube(back.getPoints(60), 0.004, 0x6f7f95, 'head moves'); packets(back, 0x9fd3ff, 2, 0.5, 'head moves');
    text([{ text: 'your head moves → a new pose', font: '600 42px system-ui', color: '#9fd3ff', lh: 52 }], 0.34, V(-1.22, 0.76, Z + 0.06), 'loop label');
    dev.sensors = V(X.sensors, 1.68, Z); dev.cpu = V(X.cpu - 0.03, 1.9, Z); dev.chip = V(X.cpu - 0.05, 1.08, Z); dev.gpu = V(X.gpu + 0.2, 1.08, Z); dev.display = V(X.display + 0.05, 1.68, Z);
    { const hg = new THREE.Group(), k = 1.5; anat.add(hg); hg.scale.setScalar(k); hg.position.set(-1.3 + 1.2 * k, 1.38 - 1.3 * k, 0.6 - 0.42 * k);
      for (const m of role[pipeRole].slice(n0)) if (!/table|leg|laptop/.test(m.name)) hg.add(m);
      for (const [kk, at] of Object.entries(dev)) if (kk !== 'laptop') hg.add(text([{ text: PIPE.devices?.[kk] ?? kk, font: '700 44px system-ui', color: '#9fd3ff', lh: 56 }, ...on(kk).map((t) => ({ text: t, font: '40px system-ui', color: '#ffd88a', lh: 50 }))], 0.32, at, 'device ' + kk)); }
    for (const [k, at] of Object.entries({ laptop: dev.laptop })) text([{ text: PIPE.devices?.[k] ?? k, font: '700 44px system-ui', color: '#9fd3ff', lh: 56 }, ...on(k).map((t) => ({ text: t, font: '40px system-ui', color: '#ffd88a', lh: 50 }))], 0.32, at, 'device ' + k);
  } else if (S === 'D') {
    // D · the frame loop: the four stages that repeat every frame on a ring beside him, packets going
    // round; the stages that happen once (setup, load, enter) as cards in a column on his other side
    const C = V(-1.05, 1.35, 0.35), R = 0.42, fr = st.filter((s) => s.when === 'frame'), pre = st.filter((s) => s.when !== 'frame');
    const ring = new THREE.CatmullRomCurve3(Array.from({ length: 48 }, (_, k) => { const a = Math.PI / 2 - 2 * Math.PI * k / 48; return V(C.x + R * Math.cos(a), C.y + R * Math.sin(a), C.z); }), true);
    tube(ring.getPoints(120), 0.01, 0xffb347, 'loop'); packets(ring, 0xffd88a, 6, 0.12, 'loop');
    fr.forEach((s, i) => { const a = Math.PI / 2 - 2 * Math.PI * i / fr.length, c = Math.cos(a), sn = Math.sin(a); text(card(s), 0.42, V(C.x + (R + 0.12) * c * 1.35, C.y + (R + 0.1) * sn, C.z + 0.02), 'station ' + s.id); });
    text([{ text: PIPE.loop ?? '', font: '700 46px system-ui', color: '#ffd88a', lh: 56 }], 0.3, V(C.x, C.y, C.z), 'loop centre');
    text([{ text: 'once, before the loop', font: '700 46px system-ui', color: '#9fd3ff', lh: 56 }], 0.4, V(0.95, 1.95, -0.15), 'once title');
    pre.forEach((s, i) => text(card(s), 0.45, V(0.95, 1.7 - i * 0.33, -0.15), 'card ' + s.id));
  } else {
    // C · stack: the software layers on each device, as two towers, and the tunnel between them
    const tower = (layers, x, name, c0, c1) => {
      const H = 0.12, G = 0.025;
      layers.forEach((l, i) => {
        const col = new THREE.Color(c0).lerp(new THREE.Color(c1), i / Math.max(1, layers.length - 1)), y = 0.1 + i * (H + G) + H / 2;
        reg(new THREE.Mesh(new THREE.BoxGeometry(0.55, H, 0.32), std(col)), name + ' ' + i).position.set(x, y, 0.15);
        text([{ text: l, font: '600 44px system-ui', color: '#ffffff', lh: 54 }], 0.5, V(x, y, 0.312), name + ' label ' + i, false);
      });
      return (i) => 0.1 + i * (H + G) + H / 2;
    };
    const hy = tower(PIPE.layers?.headset ?? [], 0.85, 'headset layer', 0x31415a, 0x6fa8dc), ly = tower(PIPE.layers?.laptop ?? [], -0.9, 'laptop layer', 0x3d3d3d, 0x8f8f8f);
    text([{ text: 'Quest 3', font: '700 54px system-ui', color: '#9fd3ff', lh: 64 }], 0.3, V(0.85, hy((PIPE.layers?.headset ?? []).length) + 0.02, 0.15), 'tower title headset');
    text([{ text: 'Laptop', font: '700 54px system-ui', color: '#cccccc', lh: 64 }], 0.3, V(-0.9, ly((PIPE.layers?.laptop ?? []).length) + 0.02, 0.15), 'tower title laptop');
    const hb = Math.max(0, (PIPE.layers?.headset ?? []).findIndex((l) => /browser/i.test(l)));   // the tunnel ends at the browser's floor
    const br = new THREE.CatmullRomCurve3([V(-0.62, ly(2), 0.3), V(-0.2, ly(2) + 0.15, 0.75), V(0.3, hy(hb) + 0.15, 0.75), V(0.57, hy(hb), 0.3)]);
    tube(br.getPoints(60), 0.012, 0xffb347, 'tunnel'); packets(br, 0xffd88a, 5, 0.15, 'tunnel');
    text([{ text: 'adb reverse, over USB-C or Wi-Fi', font: '600 42px system-ui', color: '#ffd88a', lh: 52 }, { text: 'the headset opens localhost:8798', font: '38px system-ui', color: '#dde', lh: 48 }], 0.45, V(0, Math.max(ly(2), hy(hb)) + 0.32, 0.8), 'tunnel label');
    const up = new THREE.CatmullRomCurve3([V(0.85, hy((PIPE.layers?.headset ?? []).length - 1) + 0.08, 0.15), V(0.55, 1.75, 0.2), V(0.12, 1.66, 0.12)]);
    tube(up.getPoints(40), 0.006, 0x6fa8dc, 'to the headset'); packets(up, 0x9fd3ff, 3, 0.3, 'frames');
  }
  }
  // M · the models, top down (the step before the stack): the four raw sources with a preview each,
  // then what we keep of them, then how they were made lighter; a look inside a .blend on the right.
  // A board to his right, facing you; the previews are the shipped .glb files, loaded a second time.
  pipeRole = 'pipeM'; role.pipeM = [];
  const MD = PIPE.models;
  if (MD) {
    const gog = new THREE.Group(); gog.position.copy(GOG.c); gog.scale.setScalar(GOG.k); anat.add(gog);
    const board = new THREE.Group(); board.position.copy(GOG.off); gog.add(board);
    const white = (t, size = 40, weight = 400, color = '#ffffff') => ({ text: t, font: `${weight} ${size}px system-ui`, color, lh: Math.round(size * 1.3) });
    const keep = (m, name, max = 1) => {   // reg, but the mesh stays in its preview's hierarchy
      m.name = '(pipe) ' + name; m.material = m.material.clone(); m.material.transparent = true;
      m.userData = { base: m.material.color.clone(), emis: m.material.emissive?.clone(), op: 0, target: 0, schematic: true, max }; m.visible = false; meshes.set(m.name, m); role.pipeM.push(m);
    };
    const skin = new Set(PARTS.groups.body ?? []), brain = new Set(PARTS.groups.brain ?? []);
    const XS = [-1.1, 0, 1.1], ldr = new GLTFLoader();
    // a column can name several .glb files (the atlas: ours plus the newer release's brain underside): one preview
    const previews = await Promise.all(MD.columns.map(async (c) => {
      const g = new THREE.Group();
      for (const f of [].concat(c.glb)) { const sc = await ldr.loadAsync(here(f)).then((r) => r.scene).catch(() => null); if (sc) { sc.traverse((o) => { o.userData.file = f; }); g.add(sc); } }
      return g.children.length ? g : null;
    }));
    MD.columns.forEach((c, i) => {
      const x = XS[i], sc = previews[i];
      if (sc) {
        const ms = []; sc.traverse((o) => { if (o.isMesh) ms.push(o); });
        for (const m of ms) {
          const za = m.userData.za_name ?? m.name;
          if (!m.material || Array.isArray(m.material)) continue;
          if (c.id === 'atlas') {
            m.material = new THREE.MeshStandardMaterial({ color: skin.has(za) ? 0xd9a58a : brain.has(za) || m.userData.file === 'brain-underside.glb' ? 0xe3a0a6 : 0xeee3cc, roughness: 0.6, side: THREE.DoubleSide });
            keep(m, `model ${c.id} ${za}`, skin.has(za) ? 0.18 : 1);
          } else keep(m, `model ${c.id} ${m.name}`);
        }
        // fit the preview in a 0.5 m box, standing on y 1.85
        sc.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(sc), sz = b.getSize(new THREE.Vector3()), ctr = b.getCenter(new THREE.Vector3());
        const k = Math.min(0.5 / sz.y, 0.7 / Math.max(sz.x, sz.z));
        sc.scale.setScalar(k); sc.position.set(x - ctr.x * k, 1.85 - b.min.y * k, -ctr.z * k);
        if (c.id === 'headset') sc.rotation.y = -0.6;
        board.add(sc);
        if (k > 1.5) text([white(`shown ${k.toFixed(0)}× larger`, 40, 400, '#aab')], 0.3, V(x, 1.8, 0.05), `scale ${c.id}`, false);
      }
      text([white(c.name, 58, 700), ...c.raw.map((l) => white(l, 46))], 0.84, V(x, 1.6, 0), `raw ${c.id}`, false);
      text(c.keep.map((l) => white(l, 46)), 0.84, V(x, 1.03, 0), `keep ${c.id}`, false);
      text(c.lighter.map((l) => white(l, 46, l.startsWith('→') ? 700 : 400, l.startsWith('→') ? '#ffd88a' : '#ffffff')), 0.84, V(x, 0.4, 0), `lighter ${c.id}`, false);
      for (const [j, y0, y1] of [[1, 1.42, 1.27], [2, 0.86, 0.71]]) {   // (names must be unique: meshes is keyed by name)
        const cv = new THREE.CatmullRomCurve3([V(x, y0, 0), V(x, y1, 0)]);
        tube(cv.getPoints(4), 0.008, 0xffb347, `arrow ${j} ${c.id}`); packets(cv, 0xffd88a, 2, 0.4, `arrow ${j} ${c.id}`);
        reg(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.05, 16), std(0xffb347)), `arrow head ${j} ${c.id}`).position.set(x, y1 - 0.02, 0);
        role.pipeM.at(-1).rotation.x = Math.PI;
      }
    });
    MD.rows.forEach((r, i) => text([white(r, 120, 700)], 0.7, V(-2.0, [1.85, 1.03, 0.4][i], 0), `row ${i}`, false));
    pipeRole = 'pipeMB'; role.pipeMB = [];   // the look inside a .blend: its own role, the next step swaps it out
    const nb = (s) => s.replace(/^ +/, (m) => ' '.repeat(m.length));
    text([white(MD.blend.title, 46, 700), ...MD.blend.lines.map((l) => ({ text: nb(l) || ' ', font: '29px monospace', color: l.startsWith('glTF') || l.startsWith('No edges') ? '#ffd88a' : '#e8e8e8', lh: 38 }))], 1.2, V(2.35, 1.3, 0), 'blend sample', false);
    // L · who loads the files (step pipeline-load): the bracket under the three columns runs into a pipe going
    // down (the GLTFLoader add-on) to a three.js tile below. W · our website (step pipeline-site): a matryoshka
    // drawn round the whole scene, cut open so the tile shows inside it, labelled "imported"; the step zooms out.
    pipeRole = 'pipeL'; role.pipeL = [];
    const LD = MD.load;
    if (LD) {
      const by = 0.16, bx0 = -1.55, bx1 = 1.55, TY = -1.2;
      tube([V(bx0, by + 0.07, 0), V(bx0, by + 0.01, 0), V(bx0 + 0.02, by, 0), V(0, by, 0), V(bx1 - 0.02, by, 0), V(bx1, by + 0.01, 0), V(bx1, by + 0.07, 0)], 0.009, 0xffffff, 'bracket');
      text([white(LD.bracket, 60, 700)], 0.75, V(-0.75, by - 0.08, 0.01), 'bracket label', false);
      // a one-line name on a dark pill that fits it, h tall, in its thing's colour (the arm, the block it names)
      const pill = (txt, color, h, at, name) => {
        const c = document.createElement('canvas'), g = c.getContext('2d'), font = '700 64px system-ui'; g.font = font;
        c.width = Math.ceil(g.measureText(txt).width) + 56; c.height = 96; g.fillStyle = 'rgba(12,16,24,0.88)'; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 40); g.fill();
        g.strokeStyle = color; g.lineWidth = 5; g.stroke(); g.font = font; g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(txt, 28, 50);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const m = reg(new THREE.Mesh(new THREE.PlaneGeometry(h * c.width / c.height, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })), name);
        m.position.copy(at); m.renderOrder = 2; m.userData.max = 1; return m;
      };
      // a logo on a white plate, h tall, in place of a name pill (it lights up the same way); no logo: the pill
      const CROP = { openxr: [90, 55, 1255, 390] };   // the OpenXR file has wide margins
      const plate = (k, h, at, name, fallback, color) => {
        const img = LOGOS[k]; if (!img) return pill(fallback, color, h, at, name);
        const [sx, sy, sw, sh] = CROP[k] ?? [0, 0, img.naturalWidth, img.naturalHeight], ih = 150, pad = 24;
        const c = document.createElement('canvas'), g = c.getContext('2d'); c.height = ih + 2 * pad; c.width = Math.round(ih * sw / sh) + 2 * pad + 16;
        g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 34); g.fill();
        g.drawImage(img, sx, sy, sw, sh, pad + 8, pad, c.width - 2 * pad - 16, ih);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        const m = reg(new THREE.Mesh(new THREE.PlaneGeometry(h * c.width / c.height, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })), name);
        m.position.copy(at); m.renderOrder = 2; m.userData.max = 1; return m;
      };
      // the headset he wears (headset.glb), small, w wide, turned yaw from facing you
      const miniHeadset = (at, w, yaw, name, see = 0) => {   // see > 0: a see-through shell at that opacity
        const box = new THREE.Box3();
        for (const p of HS_PARTS) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox.clone().applyMatrix4(p.M)); }
        const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3()), k = w / size.z;   // its width runs along z (it faces +x)
        const T = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -Math.PI / 2 + yaw), V(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(-mid.x, -mid.y, -mid.z));
        HS_PARTS.forEach((p, i) => { const m = reg(new THREE.Mesh(p.geo, p.mat.clone()), `${name} ${i}`); if (see) { m.userData.max = see; m.userData.glass = true; } T.clone().multiply(p.M).decompose(m.position, m.quaternion, m.scale); });
        return size.y * k;   // its height
      };
      // the three.js tile: a dark rounded slab, the logo's six triangles raised in white (files/icon.svg, MIT)
      const S = 0.62, rr = 0.07, sh = new THREE.Shape();
      sh.moveTo(-S / 2 + rr, -S / 2); sh.lineTo(S / 2 - rr, -S / 2); sh.quadraticCurveTo(S / 2, -S / 2, S / 2, -S / 2 + rr); sh.lineTo(S / 2, S / 2 - rr); sh.quadraticCurveTo(S / 2, S / 2, S / 2 - rr, S / 2);
      sh.lineTo(-S / 2 + rr, S / 2); sh.quadraticCurveTo(-S / 2, S / 2, -S / 2, S / 2 - rr); sh.lineTo(-S / 2, -S / 2 + rr); sh.quadraticCurveTo(-S / 2, -S / 2, -S / 2 + rr, -S / 2);
      reg(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 4, curveSegments: 10 }), std(0xeef1f5, { roughness: 0.25, metalness: 0.05 })), 'three.js tile').position.set(0, TY, -0.03);
      const LOGO = [[[0.3174, 0.0966], [0.1269, 0.868], [0.8908, 0.6481]], [[0.5087, 0.7581], [0.6039, 0.3722], [0.2222, 0.4822]], [[0.414, 0.4299], [0.3667, 0.6216], [0.5563, 0.5671]], [[0.3194, 0.813], [0.3667, 0.6213], [0.177, 0.6758]], [[0.6987, 0.7037], [0.7459, 0.5121], [0.5563, 0.5665]], [[0.414, 0.4298], [0.4613, 0.2381], [0.2716, 0.2925]]];
      const frame = (t, w) => {   // a triangle's outline of width w: the triangle grown and shrunk about its incentre
        const [A, B, C] = t.map(([x, y]) => new THREE.Vector2(x - 0.509, y - 0.482)), a = B.distanceTo(C), b = A.distanceTo(C), c = A.distanceTo(B), p = a + b + c;
        const I = new THREE.Vector2((a * A.x + b * B.x + c * C.x) / p, (a * A.y + b * B.y + c * C.y) / p), r = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / p;
        const off = (k) => [A, B, C].map((P) => I.clone().add(P.clone().sub(I).multiplyScalar((r + k) / r)));
        const s = new THREE.Shape(off(w / 2)); s.holes.push(new THREE.Path(off(-w / 2))); return s;
      };
      const lg = new THREE.ExtrudeGeometry(LOGO.map((t) => frame(t, 0.024)), { depth: 0.02, bevelEnabled: false }); lg.scale(0.42, 0.42, 1);
      reg(new THREE.Mesh(lg, std(0x101216, { roughness: 0.4 })), 'three.js logo').position.set(0, TY + 0.06, 0.03);
      { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d'); g.font = '800 92px system-ui'; g.fillStyle = '#101216'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(LD.logo, 256, 68);
        const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;   // printed on the tile, like the GPU's name on its lid
        reg(new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.085), new THREE.MeshBasicMaterial({ map: tx })), 'three.js name').position.set(0, TY - 0.225, 0.035); }
      // ---- three.js as a robot with arms (animated by robotTick). Arms reach with two joints (shoulder on the
      // tile, elbow, a two-finger claw); everything moves in the board's plane, just in front of it.
      const AZ = 0.09, ARMC = 0xdfe3e8, DARK = 0x2a2e35;
      const arm = (sx, sy, a, b, bend, name, col = ARMC, label = null) => {   // label: a pill that rides on the elbow
        const M = (g, c, n, extra = {}) => reg(new THREE.Mesh(g, std(c, extra)), name + ' ' + n);
        const base = M(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 24), DARK, 'base', { metalness: 0.5, roughness: 0.4 }); base.rotation.x = Math.PI / 2; base.position.set(sx, sy, AZ - 0.03);
        const up = M(new THREE.CylinderGeometry(0.022, 0.027, 1, 16), col, 'upper', { metalness: 0.25, roughness: 0.35 });
        const fo = M(new THREE.CylinderGeometry(0.017, 0.022, 1, 16), col, 'fore', { metalness: 0.25, roughness: 0.35 });
        const el = M(new THREE.SphereGeometry(0.036, 16, 12), DARK, 'elbow', { metalness: 0.5, roughness: 0.4 });
        const wr = M(new THREE.SphereGeometry(0.028, 16, 12), col, 'wrist');
        const fa = M(new THREE.BoxGeometry(0.014, 0.065, 0.024), DARK, 'finger a'), fb = M(new THREE.BoxGeometry(0.014, 0.065, 0.024), DARK, 'finger b');
        const S = new THREE.Vector2(sx, sy);
        const seg = (m, p, q) => { m.position.set((p.x + q.x) / 2, (p.y + q.y) / 2, AZ); m.scale.set(1, p.distanceTo(q), 1); m.rotation.set(0, 0, Math.atan2(q.y - p.y, q.x - p.x) - Math.PI / 2); };
        return (T, grip = 0) => {               // reach for T (the claw's grip point); grip 0 open .. 1 closed
          const th = Math.atan2(T.y - S.y, T.x - S.x), reach = 0.055;   // the claw's fingers reach past the wrist
          const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, S.distanceTo(T) - reach));
          const al = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
          const E = new THREE.Vector2(sx + a * Math.cos(th + bend * al), sy + a * Math.sin(th + bend * al)), W = new THREE.Vector2(sx + d * Math.cos(th), sy + d * Math.sin(th));
          seg(up, S, E); seg(fo, E, W); el.position.set(E.x, E.y, AZ); wr.position.set(W.x, W.y, AZ);
          if (label) { const o = new THREE.Vector2(E.x, E.y - TY).normalize(); label.position.set(E.x + o.x * (0.08 + label.scale.x * label.geometry.parameters.width / 2), E.y + o.y * 0.09, AZ + 0.04); }
          const open = 0.012 + 0.03 * (1 - grip), c = Math.cos(th), s = Math.sin(th);
          for (const [f, k] of [[fa, 1], [fb, -1]]) { f.position.set(W.x + c * 0.04 - s * open * k, W.y + s * 0.04 + c * open * k, AZ); f.rotation.set(0, 0, th - Math.PI / 2); }
        };
      };
      const ROB = { TY, CY: -2.75, P2: (x, y) => new THREE.Vector2(x, y) };
      // one colour per job: the arm, its claw and its name share it
      const COL = { grab: [0xf2c66d, '#ffd88a'], push: [0x6fb7e8, '#7fd1ff'], pose: [0xa98ce8, '#c4a3ff'], draw: [0x6cc58f, '#8fe0a8'] };
      ROB.lab = {};
      ROB.lab.grab = pill(LD.grab, COL.grab[1], 0.085, V(0, 0, 0), 'grab label');
      ROB.lab.push = pill(LD.push, COL.push[1], 0.085, V(0, 0, 0), 'push label');
      ROB.grab = arm(-0.27, TY + 0.27, 0.55, 0.55, -1, 'grab arm', COL.grab[0], ROB.lab.grab);   // up to the files (GLTFLoader)
      ROB.push = arm(0.27, TY - 0.27, 0.55, 0.55, 1, 'push arm', COL.push[0], ROB.lab.push);     // down into the GPU (WebGL)
      ROB.loadArms = role.pipeL.filter((m) => / (grab|push) arm /.test(m.name));   // faded back while the per-frame arms work
      // the four files as blocks, waiting under the bracket
      ROB.cubes = [0xeee3cc, 0xe3a0a6, 0x9b4a4a, 0xf4f4f4].map((c, j) => reg(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.085), std(c, { roughness: 0.4 })), 'file block ' + j));
      ROB.pile = ROB.cubes.map((_, j) => ROB.P2(-0.66 + 0.11 * j, 0.05));
      // H · the GPU chip (hardware: the website matryoshka leaves it out)
      pipeRole = 'pipeH'; role.pipeH = [];
      const CY = ROB.CY;
      // the chip: a square package, gold pads round its edge, a metal lid with the die under it
      reg(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.035), std(0x1c3a2c, { roughness: 0.6 })), 'gpu package').position.set(0, CY, -0.02);
      for (let k = 0; k < 4; k++) for (let j = 0; j < 12; j++) {
        const t = -0.27 + j * 0.049, along = k % 2 === 0, sgn = k < 2 ? 1 : -1;
        reg(new THREE.Mesh(new THREE.BoxGeometry(along ? 0.022 : 0.04, along ? 0.04 : 0.022, 0.006), std(0xd8b04a, { metalness: 0.8, roughness: 0.3 })), `gpu pad ${k} ${j}`).position.set(along ? t : sgn * 0.285, CY + (along ? sgn * 0.285 : t), 0.0);
      }
      reg(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.03), std(0xb9c0c9, { metalness: 0.85, roughness: 0.28 })), 'gpu lid').position.set(0, CY, 0.01);
      { const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d'); g.font = '800 170px system-ui'; g.fillStyle = '#4a515c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GPU', 256, 132);
        const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;   // printed on the lid: no card behind it
        reg(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: tx })), 'gpu print').position.set(0, CY, 0.0265); }
      pill(LD.gpu, '#ffffff', 0.085, V(-0.62, CY, 0.05), 'gpu label');
      ROB.lid = role.pipeH.find((m) => m.name.endsWith('gpu lid'));
      // G · every frame: WebXR on the left gives the pose, the robot updates (its gear), the draw arm pushes two
      // draw jobs into the GPU, and the frame rides to the displays on the right
      pipeRole = 'pipeG'; role.pipeG = [];
      ROB.lab.pose = pill(LD.pose, COL.pose[1], 0.085, V(0, 0, 0), 'pose label');
      ROB.lab.draw = pill(LD.draw, COL.draw[1], 0.085, V(0, 0, 0), 'draw label');
      ROB.pose = arm(-0.33, TY, 0.62, 0.55, -1, 'pose arm', COL.pose[0], ROB.lab.pose);   // elbow up, clear of the draw arm
      ROB.draw = arm(-0.27, TY - 0.27, 0.55, 0.55, -1, 'draw arm', COL.draw[0], ROB.lab.draw);
      const XB = ROB.P2(-1.62, TY);
      reg(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.08), std(0x5a43a0, { roughness: 0.35, metalness: 0.2 })), 'webxr block').position.set(XB.x, XB.y, 0);
      for (const dx of [-0.12, 0.12]) for (const dy of [-0.07, 0.07]) reg(new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), std(0x0d1117, { emissive: 0x335577, emissiveIntensity: 0.6 })), `webxr camera ${dx} ${dy}`).position.set(XB.x + dx, XB.y + dy, 0.045);
      ROB.lab.xr = plate('webxr', 0.1, V(XB.x, XB.y + 0.24, 0.05), 'webxr label', LD.xr, COL.pose[1]);
      // OpenXR (plans/pipeline.md, "Under WebXR"): the layer under WebXR, inside the browser. The pose comes up
      // through it into WebXR; the finished frame goes back down through it (the gate on the conveyor)
      const OXR = [0x1f9e8f, '#5fe0cf'], OXL = LD.openxr?.name ?? 'OpenXR';
      reg(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.1), std(OXR[0], { roughness: 0.35, metalness: 0.2 })), 'openxr slab').position.set(XB.x, XB.y - 0.26, 0);
      ROB.lab.oxr = plate('openxr', 0.12, V(XB.x, XB.y - 0.26, 0.056), 'openxr label', OXL, OXR[1]);   // its logo on its face
      ROB.XB = XB;
      const gear = reg(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.02, 6, 9), std(0xffb347, { metalness: 0.4, roughness: 0.35 })), 'update gear'); gear.position.set(0.36, TY + 0.36, 0.05); ROB.gear = gear;
      ROB.lab.update = pill(LD.update, '#ffb347', 0.075, V(0.58, TY + 0.36, 0.05), 'update label');
      const DB = ROB.P2(1.62, CY);
      // the displays and lenses inside the headset itself (a small copy of the one he wears, its shell see-through):
      // one device, where the frame goes in and the pose comes from
      const HW = 0.72, hh = miniHeadset(V(DB.x, DB.y + 0.01, -0.06), HW, 0.15, 'quest', 0.3);
      ROB.panels = [-0.13, 0.13].map((dx) => { const m = reg(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), std(0x23324a, { emissive: 0x6fa8dc, emissiveIntensity: 0.2 })), 'display panel ' + dx); m.position.set(DB.x + dx, DB.y, 0.025); return m; });
      for (const dx of [-0.13, 0.13]) { const l = reg(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 32), std(0xcfe8ff, { roughness: 0.1 })), 'lens ' + dx); l.position.set(DB.x + dx, DB.y, 0.06); l.rotation.x = Math.PI / 2; l.userData.max = 0.45; l.userData.glass = true; }
      ROB.lab.show = pill(LD.show, '#ffffff', 0.085, V(DB.x, DB.y + hh / 2 + 0.1, 0.12), 'displays label');
      tube([V(0.36, CY, -0.01), V(DB.x - HW / 2 + 0.02, CY, -0.01)], 0.008, 0x8a93a0, 'conveyor');
      { const GX = 1.0, w = 0.28, h = 0.2, t = 0.024;   // the frame passes through it on its way to the displays
        for (const [n, x, y, bw, bh] of [['top', GX, CY + h / 2, w, t], ['bottom', GX, CY - h / 2, w, t], ['left', GX - w / 2, CY, t, h], ['right', GX + w / 2, CY, t, h]])
          reg(new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.05), std(OXR[0], { roughness: 0.35, metalness: 0.2 })), 'openxr gate ' + n).position.set(x, y, 0.1);
        ROB.lab.oxr2 = plate('openxr', 0.085, V(GX, CY + h / 2 + 0.09, 0.05), 'openxr gate label', OXL, OXR[1]);
        // the slab and the gate are one layer: a teal rail joins them. The gate is the headset's door: frames go in
        // through it, poses come out of it and ride the rail up to WebXR
        const YR = CY - 0.45, line = (...p) => { const c = new THREE.CurvePath(); for (let i = 1; i < p.length; i++) c.add(new THREE.LineCurve3(p[i - 1], p[i])); return c; };
        const rail = line(V(GX, CY - h / 2 - 0.012, 0.1), V(GX, YR + 0.05, 0.1), V(GX, YR, 0), V(XB.x, YR, 0), V(XB.x, TY - 0.335, 0));
        reg(new THREE.Mesh(new THREE.TubeGeometry(rail, 128, 0.014, 8), std(OXR[0], { roughness: 0.35, metalness: 0.2 })), 'openxr rail');
        packets(line(V(GX, CY - h / 2 - 0.012, 0.12), V(GX, YR + 0.05, 0.12), V(GX, YR, 0.02), V(XB.x, YR, 0.02), V(XB.x, TY - 0.335, 0.02)), COL.pose[0], 4, 0.12, 'openxr rail pose'); }
      // the things the arms carry: the pose, the two draw jobs (left and right eye), the finished frame
      const tag = (txt, w, h, bg, name) => { const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * h / w); const g = c.getContext('2d'); g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 30); g.fill(); g.fillStyle = '#fff'; g.font = `800 ${Math.round(c.height * 0.55)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, c.width / 2, c.height / 2 + 4);
        const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return reg(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tx })), name); };
      ROB.poseTok = tag('pose', 0.14, 0.07, '#6a4fc0', 'pose token'); ROB.L = tag('L', 0.08, 0.08, '#2f8f5b', 'draw token L'); ROB.R = tag('R', 0.08, 0.08, '#2f8f5b', 'draw token R');
      ROB.img = tag('frame', 0.18, 0.11, '#7a3b4a', 'frame token');
      // X · one road to the headset (step pipeline-openxr), left of the WebXR block: our page (three.js on WebXR in
      // the browser) and native apps made with Unity or Unreal all plug into the same OpenXR layer over the
      // headset's runtime; poses come up through it (violet), finished frames go down (green)
      pipeRole = 'pipeX'; role.pipeX = [];
      { const OX = LD.openxr ?? {}, XC = -3.65, XY = TY - 0.95, HT = 0.13, GP = 0.02;
        reg(new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.22, 0.1), std(0x1a1d23, { roughness: 0.4 })), 'runtime block').position.set(XC, XY - 0.3, 0);
        pill(OX.runtime ?? 'Headset runtime (Horizon OS)', '#ffffff', 0.075, V(XC, XY - 0.3, 0.06), 'runtime label');
        // under the runtime, the device it runs on
        const hh = miniHeadset(V(XC, XY - 0.6, 0.02), 0.5, 0.35, 'runtime headset');
        pill(OX.device ?? 'Quest 3', '#9fd3ff', 0.065, V(XC, XY - 0.6 - hh / 2 - 0.09, 0.3), 'runtime headset label');
        tube([V(XC, XY - 0.41, 0), V(XC, XY - 0.6 + hh / 2 - 0.02, 0)], 0.01, 0x8a93a0, 'runtime to headset');
        reg(new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.18, 0.12), std(OXR[0], { roughness: 0.35, metalness: 0.2 })), 'openxr bar').position.set(XC, XY, 0);
        plate('openxr', 0.14, V(XC, XY, 0.07), 'openxr bar label', OXL, OXR[1]);
        // the rows line up what does the same job: three.js with Unity and Unreal (what you write in), WebXR in the
        // browser with their OpenXR plug-in (what talks to OpenXR; the browser is the program OpenXR sees)
        (OX.rows ?? []).forEach((r, k) => { const m = pill(r, '#9aa6b5', 0.055, V(0, 0, 0.06), `row label ${k}`); m.position.set(XC - 1.0 - m.geometry.parameters.width / 2, XY + 0.08 + GP + HT / 2 + (1 - k) * (HT + GP), 0.06); });
        const apps = OX.apps ?? [['three.js (our page)', 'WebXR, in Quest Browser'], ['Unity', 'OpenXR plug-in'], ['Unreal Engine', 'OpenXR plug-in']];
        let top = XY;
        apps.forEach((col, j) => {
          const x = XC + (j - 1) * 0.64, c = j === 0 ? 0x3a4f6e : 0x3b3e46;
          [...col].reverse().forEach((name, k) => {   // bottom up: the part that plugs into OpenXR first
            const y = XY + 0.08 + GP + HT / 2 + k * (HT + GP);
            reg(new THREE.Mesh(new THREE.BoxGeometry(0.54, HT, 0.1), std(c, { roughness: 0.45 })), `app ${j} ${k}`).position.set(x, y, 0);
            const lb = pill(name, j === 0 && k === col.length - 1 ? '#ffd88a' : '#ffffff', 0.06, V(x, y, 0.06), `app label ${j} ${k}`), lw = lb.geometry.parameters.width;
            if (lw > 0.5) lb.scale.setScalar(0.5 / lw);   // long names shrink to fit their box
          });
          const ct = XY + 0.08 + col.length * (HT + GP); top = Math.max(top, ct);
          const upC = new THREE.CatmullRomCurve3([V(x - 0.21, XY - 0.3, 0.09), V(x - 0.21, ct, 0.09)]), dnC = new THREE.CatmullRomCurve3([V(x + 0.21, ct, 0.09), V(x + 0.21, XY - 0.3, 0.09)]);
          tube(upC.getPoints(4), 0.005, COL.pose[0], `app pose line ${j}`); packets(upC, COL.pose[0], 3, 0.35, `app pose ${j}`);
          tube(dnC.getPoints(4), 0.005, COL.draw[0], `app frame line ${j}`); packets(dnC, COL.draw[0], 3, 0.35, `app frame ${j}`);
        });
        text([white(OX.title ?? 'One road to the headset', 60, 800), white(OX.sub ?? 'pose up, frame down: the same calls, whichever engine', 40, 400, '#c8d0dc')], 1.9, V(XC, top + 0.36, 0), 'one road title', false);
      }
      ROBOT = ROB;
      pipeRole = 'pipeL';
      // W · the website: a matryoshka round everything, its front half glass, the back half opened towards you
      pipeRole = 'pipeW'; role.pipeW = [];
      const H = 13, R = 0.62 * H, base = 0.4 - 0.3 * H, prof = [[0, 0], [0.42, 0], [0.5, 0.08], [0.52, 0.3], [0.44, 0.48], [0.3, 0.58], [0.35, 0.68], [0.34, 0.83], [0.22, 0.96], [0, 1]];
      const pts = new THREE.SplineCurve(prof.map(([r, y]) => new THREE.Vector2(r * R, y * H))).getPoints(60), cx = -0.1;
      const back = reg(new THREE.Mesh(new THREE.LatheGeometry(pts, 64, Math.PI / 2, Math.PI), std(0xb3322e, { roughness: 0.45, side: THREE.DoubleSide })), 'website doll'); back.position.set(cx, base, 0);
      const glass = reg(new THREE.Mesh(new THREE.LatheGeometry(pts, 64, -Math.PI / 2, Math.PI), std(0xe0584c, { roughness: 0.2, side: THREE.DoubleSide })), 'website doll glass'); glass.position.set(cx, base, 0); glass.userData.max = 0.1; glass.userData.glass = true;   // never hides what is behind it
      for (const sx of [-1, 1]) tube(pts.map((q) => V(cx + sx * q.x, base + q.y, 0)), 0.05, 0xe8c15a, 'website doll rim ' + sx);
      for (const f of [0.4, 0.58]) { const r0 = new THREE.SplineCurve(prof.map(([r, y]) => new THREE.Vector2(y, r))).getPoint(0).x; const rr2 = pts.reduce((m, q) => Math.abs(q.y - f * H) < Math.abs(m.y - f * H) ? q : m).x;
        const ring = reg(new THREE.Mesh(new THREE.TorusGeometry(rr2, 0.05, 8, 64, Math.PI), std(0xe8c15a)), 'website doll band ' + f); ring.position.set(cx, base + f * H, 0); ring.rotation.set(Math.PI / 2, 0, Math.PI); void r0; }
      const fy = base + 0.79 * H, fr = pts.reduce((m, q) => Math.abs(q.y - 0.79 * H) < Math.abs(m.y - 0.79 * H) ? q : m).x;
      // the face: a cap on the head (a sphere of the head's radius there), framed by the scarf's trim; small features
      const FA = 0.42, onHead = (dx, dy, lift) => { const r = fr + lift, z = Math.sqrt(Math.max(0, r * r - dx * dx - dy * dy)); return V(cx + dx, fy + dy, z); };
      const cap = reg(new THREE.Mesh(new THREE.SphereGeometry(fr + 0.04, 48, 16, 0, 2 * Math.PI, 0, FA), std(0xf7e3cf, { roughness: 0.55 })), 'website doll face');
      cap.position.set(cx, fy, 0); cap.rotation.x = Math.PI / 2; cap.scale.set(0.92, 1, 1.0);
      const trim = reg(new THREE.Mesh(new THREE.TorusGeometry((fr + 0.04) * Math.sin(FA), 0.012 * H, 10, 64), std(0xf3d36b, { metalness: 0.4, roughness: 0.35 })), 'website doll trim');
      trim.position.set(cx, fy, (fr + 0.04) * Math.cos(FA)); trim.scale.set(0.92, 1, 1);
      const dot = (r, color, dx, dy, name, sy = 1) => { const m = reg(new THREE.Mesh(new THREE.CircleGeometry(r, 24), std(color, { roughness: 0.5 })), name); m.position.copy(onHead(dx, dy, 0.07)); m.lookAt(m.position.clone().add(m.position.clone().sub(V(cx, fy, 0)))); m.scale.y = sy; return m; };
      for (const sx of [-1, 1]) { dot(0.011 * H, 0x23262e, sx * 0.038 * H, 0.012 * H, 'website doll eye ' + sx, 1.25); dot(0.021 * H, 0xec8f96, sx * 0.062 * H, -0.03 * H, 'website doll cheek ' + sx, 0.85); }
      dot(0.014 * H, 0xc8323c, 0, -0.06 * H, 'website doll lips', 0.55);
      text([white(LD.site, 110, 800), ...LD.siteLines.map((l) => white(l, 56))], 7.5, V(cx, base + H + 1.9, 0), 'website title', false);
      text([white('← ' + LD.imported, 150, 800, '#ffd88a')], 1.6, V(1.15, TY, 0.05), 'imported', false);
    }
    for (const m of [...role.pipeM, ...role.pipeMB, ...role.pipeL, ...(role.pipeW ?? []), ...(role.pipeG ?? []), ...(role.pipeH ?? []), ...(role.pipeX ?? [])]) if (m.parent === anat) board.add(m);
  }
}
// the three.js robot at work: on the load step its GLTFLoader arm carries the file blocks into three.js and its
// WebGL arm pushes them into the GPU, one after another; on the frame step the per-frame arms run a loop,
// slowed down. Elsewhere the arms rest.
const ez = (x) => (x = Math.min(1, Math.max(0, x)), x * x * (3 - 2 * x)), seg2 = (u, a, b) => ez((u - a) / (b - a));
const mix2 = (p, q, e) => new THREE.Vector2(p.x + (q.x - p.x) * e, p.y + (q.y - p.y) * e);
function robotTick(time) {
  const R = ROBOT; if (!R || !role.pipeL?.[0]?.visible) return;
  const id = STEPS.steps[idx].id, P = R.P2, TY = R.TY, CY = R.CY;
  if (R.step !== id) {
    R.step = id; R.t0 = time;
    // every frame, the loading arms (done after the first load) stand back almost invisible; as glass they hide nothing
    for (const m of R.loadArms) { m.userData.max = id === 'pipeline-frame' ? 0.12 : 1; m.userData.glass = id === 'pipeline-frame'; }
  }
  const t = time - R.t0, put = (m, p, sc = 1) => { m.position.set(p.x, p.y, 0.1); m.scale.setScalar(Math.max(1e-4, sc)); };
  const hide = (m) => m.scale.setScalar(1e-4);
  const RG = P(-0.62, -0.62), RP = P(0.62, TY - 0.55), RQ = P(-0.82, TY + 0.3), RD = P(-0.62, TY - 0.6);
  const D1 = P(-0.05, TY + 0.36), B = P(0.1, TY - 0.36), G = P(0.05, CY + 0.33);
  // rest unless working
  let grab = [RG, 0], push = [RP, 0], pose = [RQ, 0], draw = [RD, 0];
  R.cubes.forEach((c, j) => put(c, R.pile[j]));
  for (const m of [R.poseTok, R.L, R.R, R.img]) hide(m);
  R.oxrUp = R.oxrDown = false;
  R.lid.material.emissive.set(0x7fd1ff); R.lid.material.emissiveIntensity = 0;
  if (id === 'pipeline-load') {
    const per = 2.6, n = R.cubes.length, tt = t % (n * per + 1.4), k = Math.floor(tt / per), u = (tt - k * per) / per;
    R.cubes.forEach((c, j) => { if (j < k) hide(c); });
    if (k < n) {
      const c = R.cubes[k], src = R.pile[k];
      const g = u < 0.25 ? mix2(RG, src, seg2(u, 0, 0.25)) : u < 0.3 ? src : u < 0.55 ? mix2(src, D1, seg2(u, 0.3, 0.55)) : u < 0.6 ? D1 : mix2(D1, RG, seg2(u, 0.6, 0.85));
      grab = [g, u > 0.24 && u < 0.6 ? seg2(u, 0.24, 0.3) : 0];
      const p = u < 0.55 ? RP : u < 0.7 ? mix2(RP, B, seg2(u, 0.55, 0.7)) : u < 0.95 ? mix2(B, G, seg2(u, 0.7, 0.95)) : mix2(G, RP, seg2(u, 0.95, 1));
      push = [p, u > 0.68 && u < 0.95 ? seg2(u, 0.68, 0.72) : 0];
      if (u < 0.3) put(c, src); else if (u < 0.6) put(c, g); else if (u < 0.7) put(c, mix2(D1, P(0, TY), seg2(u, 0.6, 0.7)), 1 - seg2(u, 0.6, 0.7));
      else if (u < 0.95) put(c, p); else put(c, mix2(G, P(0, CY), seg2(u, 0.95, 1)), 1 - seg2(u, 0.95, 1));
      if (u > 0.93) R.lid.material.emissiveIntensity = 0.6 * Math.sin(Math.PI * seg2(u, 0.93, 1));
    } else R.cubes.forEach(hide);
  } else if (id === 'pipeline-frame') {
    R.cubes.forEach(hide);
    const u = (t % 3.2) / 3.2, X = P(-1.36, TY), RB = P(-0.42, TY), PL = P(-0.12, TY - 0.4), G2 = P(-0.06, CY + 0.33);
    const q = u < 0.2 ? mix2(RQ, X, seg2(u, 0, 0.2)) : u < 0.25 ? X : u < 0.45 ? mix2(X, RB, seg2(u, 0.25, 0.45)) : mix2(RB, RQ, seg2(u, 0.47, 0.65));
    pose = [q, u > 0.19 && u < 0.46 ? seg2(u, 0.19, 0.25) : 0];
    if (u > 0.02 && u <= 0.12) put(R.poseTok, mix2(P(R.XB.x, TY - 0.26), X, seg2(u, 0.02, 0.12)));   // up from OpenXR into WebXR
    if (u > 0.12 && u < 0.25) put(R.poseTok, X);
    R.oxrUp = u > 0.01 && u < 0.14; R.oxrDown = u > 0.88 && u < 0.95;   // the frame passes the OpenXR gate else if (u >= 0.25 && u < 0.47) put(R.poseTok, q, u < 0.45 ? 1 : 1 - seg2(u, 0.45, 0.47));
    const d = u < 0.45 ? RD : u < 0.53 ? mix2(RD, PL, seg2(u, 0.45, 0.53)) : u < 0.63 ? mix2(PL, G2, seg2(u, 0.53, 0.63)) : u < 0.7 ? mix2(G2, PL, seg2(u, 0.63, 0.7)) : u < 0.8 ? mix2(PL, G2, seg2(u, 0.7, 0.8)) : mix2(G2, RD, seg2(u, 0.8, 0.95));
    const carrying = (u > 0.53 && u < 0.63) || (u > 0.7 && u < 0.8);
    draw = [d, carrying ? 1 : 0];
    if (u > 0.47 && u < 0.53) put(R.L, PL); else if (u >= 0.53 && u < 0.64) put(R.L, d, u < 0.63 ? 1 : 0);
    if (u > 0.6 && u < 0.7) put(R.R, PL); else if (u >= 0.7 && u < 0.81) put(R.R, d, u < 0.8 ? 1 : 0);
    if ((u > 0.6 && u < 0.66) || (u > 0.78 && u < 0.84)) R.lid.material.emissiveIntensity = 0.5;
    if (u > 0.84) put(R.img, mix2(P(0.36, CY), P(1.62, CY), seg2(u, 0.84, 0.98)), u < 0.98 ? 1 : 0);
    const lit = u > 0.97 || u < 0.08 ? 1 : 0;
    for (const m of R.panels) m.material.emissiveIntensity = 0.2 + 0.9 * lit;
    R.gearFast = u > 0.4 && u < 0.62; R.gear.rotation.z -= R.gearFast ? 0.25 : 0.02;
  }
  R.grab(...grab); R.push(...push); R.pose(...pose); R.draw(...draw);
  // the names of what is working now are bright, the others dim, so each name reads with its action
  const work = (p) => p[0] !== RG && p[0] !== RP && p[0] !== RQ && p[0] !== RD;
  const on = { grab: work(grab), push: work(push), pose: work(pose), xr: work(pose), draw: work(draw),
    update: id === 'pipeline-frame' && R.gearFast, show: R.panels[0].material.emissiveIntensity > 0.5, oxr: R.oxrUp, oxr2: R.oxrDown };
  const back = id === 'pipeline-frame' ? { grab: 1, push: 1 } : {};
  for (const [k, m] of Object.entries(R.lab)) { const u = m.userData; u.max += ((back[k] ? 0.08 : on[k] ? 1 : 0.35) - u.max) * 0.15; }
}
function pipeTick(time) {
  for (const p of pipeMove) p.m.position.copy(p.curve.getPointAt((time * p.speed + p.ph) % 1));
  for (const m of pipeFace) if (m.visible) m.lookAt(camPos);
}
const tq = new THREE.Vector3();
function streamTick(dt, time) {
  stream.op += (stream.target - stream.op) * Math.min(1, dt * 3);
  stream.points.visible = stream.op > 0.01; if (!stream.points.visible) return;
  stream.points.material.opacity = stream.op;
  const rate = stage.scale.x ** -0.75, sniff = 0.45 + 1.1 * Math.max(0, Math.sin(time * 2.1)) ** 2;   // slower when zoomed in; a sniff rhythm
  streamParts.forEach((q, i) => {
    let fade = 1;
    if (q.hold > 0) { q.hold -= dt; fade = Math.max(0, q.hold / 0.6); if (q.hold <= 0) q.p = 0; }
    else {
      q.p += dt * 0.09 * q.speed * sniff * rate / q.br.len;
      if (q.p >= 1) { if (q.br.crash) { q.p = 1; q.hold = 0.6; } else q.p = 0; }
    }
    q.br.curve.getPointAt(Math.min(1, q.p), tq);
    const spread = q.p < q.br.pin ? 0.0028 + 0.022 * (1 - q.p / q.br.pin) ** 2 : 0.0022;   // wide over the cup, narrow inside
    if (q.br.crash) {                                  // the ones that reach the roof spread out over it and stop there
      const r = sstep((q.p - 0.85) / 0.15);
      tq.x += q.off.x * (spread + 0.0012 * r); tq.z += q.off.z * (spread + 0.0015 * r); tq.y = Math.min(ROOF - ROOF_GAP, tq.y + q.off.y * spread * (1 - r));
    } else tq.addScaledVector(q.off, spread);
    streamPts.set([tq.x, tq.y, tq.z], i * 3);
    const k = fade * Math.min(1, q.p * 12);
    streamCol.set([q.col.r, q.col.g, q.col.b, k], i * 4);
  });
  streamGeo.attributes.position.needsUpdate = true; streamGeo.attributes.color.needsUpdate = true;
}

window.smell = { THREE, meshes, role, A, scene, anat, camera, stage, get shotFor() { return shotFor; }, get STEPS() { return STEPS; }, get placementFor() { return placementFor; }, get DIVE_T() { return DIVE_T; }, get DIVE() { return DIVE; }, get V0() { return V0; }, get look() { return look; }, get EXIT() { return EXIT; }, get OUT() { return OUT; }, get place() { return place; }, get micro() { return micro_; } };   // for poking at it from the console

// ---------- placement per focus: which anatomy point sits where in front of the viewer
const FOCUS = {
  body: { at: A.body, scale: 1, dist: 1.4 },
  head: { at: A.head, scale: 2.2, dist: 0.75 },
  upper: { at: A.head.clone().lerp(cen('airway'), 0.45), scale: 1.3, dist: 0.8 },
  // head steps turn the model to a near-side view (yaw), so the route nose -> skull -> under the
  // brain runs across the view instead of straight away from it
  nose: { at: A.nose.clone().lerp(A.epithelium, 0.5), scale: 6, dist: 0.6, yaw: -Math.PI * 0.42 },
  // the fly-in: the epithelium comes right up to your eyes while the head grows ~12x around you
  dive: { at: A.epithelium, scale: 75, dist: 0.03, yaw: -Math.PI * 0.42 },
  cribriform: { at: A.cribriform, scale: 6, dist: 0.6, yaw: -Math.PI * 0.42 },
  // the close-up block at the plate (Chabacano's inset), ~70x
  zoom: { at: A.zoom, scale: 70, dist: 0.6, yaw: -Math.PI / 2 },
  // the end: his head, three-quarters from the front, with the headset on
  // the pipeline: the man life size, standing, the blocks around him
  models: { at: gogAt(0.2, 1.3), scale: 1 / GOG.k, dist: 3.1 },              // inside the goggles: the board, life size
  load: { at: gogAt(0, -1.35), scale: 1 / GOG.k, dist: 3.0 },   // the robot, with the files above and the GPU below   // down the loader pipe to the three.js tile, the columns still above
  frame: { at: gogAt(0, -2.0), scale: 1 / GOG.k, dist: 3.2 },   // every frame: the robot down to the headset under the conveyor
  openxr: { at: gogAt(-3.8, -2.15), scale: 1 / GOG.k, dist: 3.0 },   // one road to the headset, left of the robot
  site: { at: gogAt(-0.1, 3.0), scale: 0.12 / GOG.k, dist: 1.9 },    // out until the website matryoshka round it all is in view   // the models board, to his right; he stands at its left
  stage: { at: new THREE.Vector3(0, 1.05, 0.15), scale: 1, dist: 2.4, yaw: -Math.PI * 0.18, floor: true },
  outro: { at: new THREE.Vector3(0, A.head.y - 0.13, 0.0), scale: 1.5, dist: 0.85, yaw: -Math.PI * 0.4 },   // from his side: head and upper body, the pipeline slides go around him
  // the textbook cut: straight from the side (face to the left), framed nose to ear, brow to chin
  cut: { at: new THREE.Vector3(CUT_X, 1.588, 0.026), scale: 6, dist: 0.7, yaw: -Math.PI / 2 },   // the plate a little below your eyes
  bulb: { at: A.bulb.clone().lerp(A.tractEnd, 0.3), scale: 5, dist: 0.6, yaw: -Math.PI * 0.42 },
  brain: { at: A.brain.clone().lerp(A.piriform, 0.4), scale: 3.2, dist: 0.65, yaw: -Math.PI * 0.42 },
};
let eyeH = 1.5;   // set from the headset when VR starts
const place = { from: null, to: null, t: 1 };
// the soles' height in anatomy space, measured once. (It used to be the body's box in world space, which
// includes wherever the model is right now: pressing Next/Back mid-glide then aimed the glide off by that
// much, and each quick press added to it, until the model was metres off.)
let FEET_Y = null;
function feetY() {
  if (FEET_Y !== null) return FEET_Y;
  anat.updateMatrixWorld(true); const inv = anat.matrixWorld.clone().invert(), b = new THREE.Box3(), bb = new THREE.Box3();
  for (const m of role.body.length ? role.body : [...meshes.values()]) { if (!m.geometry) continue; m.geometry.computeBoundingBox(); b.union(bb.copy(m.geometry.boundingBox).applyMatrix4(inv.clone().multiply(m.matrixWorld))); }
  return (FEET_Y = b.min.y);
}
function placementFor(f) {
  const F = FOCUS[f] ?? FOCUS.body;
  const floor = f === 'body' || F.floor, scale = F.scale, y = floor ? 0 : eyeH - 0.1;
  // anatomy point F.at goes to (0, y, -dist); the body step stands the model on the floor
  const pos = floor ? new THREE.Vector3(-F.at.x, -feetY(), -F.dist - F.at.z)
                           : new THREE.Vector3(-F.at.x * scale, y - F.at.y * scale, -F.dist - F.at.z * scale);
  return { pos, scale };
}

// ---------- text: a floating panel next to the model, and labels with leader lines
function textCanvas(lines, w = 1024, pad = 36) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const wrap = (txt, font, max) => { g.font = font; const out = []; let cur = '';
    for (const word of txt.split(' ')) { const t = cur ? cur + ' ' + word : word; if (g.measureText(t).width > max && cur) { out.push(cur); cur = word; } else cur = t; }
    if (cur) out.push(cur); return out; };
  const rows = [];
  for (const L of lines) for (const r of wrap(L.text, L.font, w - 2 * pad)) rows.push({ ...L, text: r });
  c.width = w; c.height = pad * 2 + rows.reduce((a, r) => a + r.lh, 0);
  g.fillStyle = 'rgba(12,16,24,0.88)'; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 28); g.fill();
  let y = pad; for (const r of rows) { g.font = r.font; g.fillStyle = r.color; g.textBaseline = 'top'; g.fillText(r.text, pad, y); y += r.lh; }
  return c;
}
const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }));
if (params.has('still')) panel.layers.set(31);   // ?still: no text panel (stills for the title screen, ../title/tv/)
panel.renderOrder = 10; scene.add(panel);
// Quotes and sources are one press away (X on the left controller, S on the keyboard), as in ../billboard/:
// steps.json `sources` is { key: { short, full } }, each step's `src` lists keys and `quotes` the quoted lines.
let showSources = false;
const srcOf = (k) => STEPS.sources[k] ?? { short: k, full: k };
function setPanel(step) {
  const has = !!(step.src?.length || step.quotes?.length);
  const lines = [];
  if (showSources && has) {
    lines.push({ text: 'Sources for this step', font: '600 56px system-ui', color: '#fff', lh: 72 });
    for (const q of step.quotes ?? []) lines.push({ text: '“' + q + '”', font: 'italic 34px system-ui', color: '#9bc', lh: 46 });
    for (const k of step.src ?? []) lines.push({ text: srcOf(k).full, font: '28px system-ui', color: '#aab3c2', lh: 38 });
    lines.push({ text: 'X / S: back to the step', font: '26px system-ui', color: '#667', lh: 34 });
  } else {
    lines.push({ text: step.title, font: '600 56px system-ui', color: '#fff', lh: 72 }, { text: step.text, font: '44px system-ui', color: '#dde', lh: 60 });
    lines.push({ text: `${idx + 1} / ${STEPS.steps.length}` + (has ? '   ·   X / S: sources (' + (step.src ?? []).map((k) => srcOf(k).short).join(', ') + ')' : ''), font: '30px system-ui', color: '#8a93a3', lh: 40 });
  }
  const c = textCanvas(lines);
  panel.material.map?.dispose(); panel.material.map = new THREE.CanvasTexture(c); panel.material.map.colorSpace = THREE.SRGBColorSpace;
  const W = step.panel?.[2] ?? (step.scene ? 1.25 : 0.5);   // bigger in the room, where it floats ~2 m away (steps.json `panel`: [right, up, width])
  panel.userData = { W, aspect: c.height / c.width }; panel.scale.set(W, W * c.height / c.width, 1); panel.material.needsUpdate = true;
}
const labels = new THREE.Group(); scene.add(labels);
const LABEL = {
  nose: 'Nose', epithelium: 'Olfactory epithelium (schematic)', ethmoid: 'Ethmoid bone', cribriform: 'Cribriform plate (top of the ethmoid)',
  olfactory: 'Olfactory nerve, bulb and tract', piriform: 'Piriform cortex (schematic)', amygdala: 'Amygdala',
  entorhinal: 'Entorhinal cortex (parahippocampal gyrus)', hippocampus: 'Hippocampus', hypothalamus: 'Hypothalamus',
  thalamus: 'Thalamus', orbitofrontal: 'Orbitofrontal cortex',
  zCell: 'Receptor neurons: one receptor type each (colour)', zBone: 'Cribriform plate (bone)', zGlom: 'Glomeruli: one per receptor type',
  zMitral: 'Mitral cells: on along the tract', zEpi: 'Olfactory epithelium', zBulb: 'Olfactory bulb',
};
const ANCHOR = { olfactory: 'bulb', cribriform: 'cribriform', nose: 'nostril' };
function setLabels(step) {
  labels.clear();
  const keys = [...(step.highlight ?? []), ...(step.dim ?? [])];
  keys.forEach((k, i) => {
    const c = textCanvas([{ text: LABEL[k] ?? k, font: '600 40px system-ui', color: step.dim?.includes(k) ? '#99a' : '#ffd88a', lh: 50 }], 760, 18);
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    sp.material.map.colorSpace = THREE.SRGBColorSpace; sp.renderOrder = 11;
    const W = 0.22; sp.scale.set(W, W * c.height / c.width, 1);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffd88a, depthTest: false }));
    line.renderOrder = 11;
    sp.userData = { anchor: ANCHOR[k] ?? k, slot: i, line }; labels.add(sp, line);
  });
}

// ---------- pulses: dots travelling along anatomy-space paths (airflow, signals)
const pulses = new THREE.Group(); anat.add(pulses);
let paths = [];
function setAnim(step) {
  pulses.clear(); paths = [];
  const a = step.anim ?? '';
  if (a === 'airflow') paths.push({ pts: [A.nostril, A.nose.clone().add(new THREE.Vector3(0, 0.004, -0.02)), A.epithelium], color: 0x8fd3ff, n: 14, size: 0.0022 });
  if (a.startsWith('signal:')) for (const chain of a.slice(7).split(';')) {
    const [from, to] = chain.split('>').length > 2 ? [null, null] : chain.split('>');
    const hops = chain.split('>');
    for (let h = 0; h < hops.length - 1; h++) for (const dst of hops[h + 1].split(',')) {
      const src = hops[h] === 'olfactory' ? 'bulb' : hops[h];
      paths.push({ pts: src === 'bulb' ? [A.bulb, A.tractEnd, A[dst]] : [A[src], A[dst]], color: 0xffb347, n: 6, size: 0.0035 });
    }
  }
  for (const p of paths) {
    p.curve = new THREE.CatmullRomCurve3(p.pts.map((v) => v.clone()));
    p.dots = Array.from({ length: p.n }, (_, i) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(p.size, 10, 8), new THREE.MeshBasicMaterial({ color: p.color }));
      d.userData.phase = i / p.n; pulses.add(d); return d;
    });
  }
}

// ---------- close-up insets (schematic): receptors on cilia, convergence on glomeruli
const inset = new THREE.Group(); scene.add(inset);
const TYPES = [0xff5d73, 0x5dd39e, 0x5db7ff];
let insetTick = () => {};
function setInset(kind) {
  inset.clear(); insetTick = () => {};
  if (!kind) return;
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshBasicMaterial({ color: 0x10151f, transparent: true, opacity: 0.92 }));
  inset.add(frame);
  const cap = textCanvas([{ text: kind === 'receptors' ? 'Close-up (schematic): one receptor type per neuron' : 'Close-up (schematic): same receptor → same glomerulus', font: '600 34px system-ui', color: '#ccd', lh: 44 }], 900, 16);
  const capM = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4 * cap.height / cap.width), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cap), transparent: true }));
  capM.position.set(0, 0.135, 0.001); inset.add(capM);
  const neurons = [];
  for (let i = 0; i < 9; i++) {
    const t = i % 3, x = -0.16 + i * 0.04;
    const n = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, kind === 'receptors' ? 0.05 : 0.03, 4, 8), new THREE.MeshStandardMaterial({ color: TYPES[t], emissive: TYPES[t], emissiveIntensity: 0.1 }));
    n.position.set(x, kind === 'receptors' ? -0.04 : -0.07, 0.01); inset.add(n); neurons.push({ n, t });
    if (kind === 'receptors') for (let c = -1; c <= 1; c++) {
      const cil = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.03), n.material);
      cil.position.set(x + c * 0.006, 0.01, 0.01); cil.rotation.z = c * 0.35; inset.add(cil);
    }
  }
  if (kind === 'receptors') {
    const mucus = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.05), new THREE.MeshBasicMaterial({ color: 0x6fa8c8, transparent: true, opacity: 0.25 }));
    mucus.position.set(0, 0.015, 0.005); inset.add(mucus);
    const odor = Array.from({ length: 6 }, (_, k) => {
      const t = k % 3, o = new THREE.Mesh(new THREE.OctahedronGeometry(0.007), new THREE.MeshBasicMaterial({ color: TYPES[t] }));
      o.userData = { t, x: -0.16 + (t + 3 * (k % 3)) * 0.04, ph: k / 6 }; inset.add(o); return o;
    });
    insetTick = (time) => odor.forEach((o) => {
      const p = (time * 0.25 + o.userData.ph) % 1;
      o.position.set(o.userData.x + Math.sin(p * 9 + o.userData.ph * 20) * 0.01 * (1 - p), 0.11 - p * 0.09, 0.015);
      const hit = p > 0.85; neurons.filter((q) => Math.abs(q.n.position.x - o.userData.x) < 1e-3).forEach((q) => q.n.material.emissiveIntensity = hit ? 0.9 : 0.1);
    });
  } else {
    const glom = TYPES.map((c, t) => { const g = new THREE.Mesh(new THREE.SphereGeometry(0.02, 20, 14), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.2 })); g.position.set(-0.09 + t * 0.09, 0.07, 0.01); inset.add(g); return g; });
    for (const { n, t } of neurons) {
      const geo = new THREE.BufferGeometry().setFromPoints([n.position.clone().add(new THREE.Vector3(0, 0.02, 0)), glom[t].position]);
      inset.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: TYPES[t] })));
    }
    insetTick = (time) => glom.forEach((g, t) => { g.material.emissiveIntensity = 0.2 + 0.7 * Math.max(0, Math.sin(time * 2 - t * 2)); });
  }
}

// ---------- steps
let idx = 0;
const ROLE_LIST = ['body', 'face', 'cup', 'cavity', 'airway', 'nose', 'skull', 'brain', 'pathway', 'ethmoid', 'cribriform', 'mouth', 'zoom', 'headset', 'base', 'pipeA', 'pipeB', 'pipeC', 'pipeD', 'pipeM', 'pipeMB', 'pipeL', 'pipeW', 'pipeG', 'pipeH', 'pipeX'];
// ---------- inside the nose: the olfactory epithelium as a room you stand in (schematic, not to scale)
// The roof is the epithelium (supporting cells, with the receptor neurons' knobs poking through); cilia
// hang from each knob into a mucus layer; odorant molecules rise from the air below, dissolve in the
// mucus and bind a cilium of their own receptor type, and that neuron fires. One receptor type per
// neuron (OpenStax A&P 14.1); colours stand for receptor types (humans have ~350, here 5).
const micro = new THREE.Group(); micro.visible = false; scene.add(micro);
const microMats = [];
const mmat = (m, op) => { m.transparent = true; m.userData.op = op; m.opacity = 0; microMats.push(m); return m; };
{
  // no ceiling sheet of its own: beyond the cells the cavity's real roof, 30 cm up, is the ceiling
  // supporting cells: a hexagonal tiling of soft domes
  const hex = new THREE.SphereGeometry(0.26, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); hex.scale(1, 0.35, 1);
  const pts = []; for (let i = -24; i <= 24; i++) for (let j = -24; j <= 24; j++) {
    const x = i * 0.46 + (j % 2) * 0.23, z = j * 0.4;
    if (Math.hypot(x, z) < ROOM * 1.25) pts.push([x, z]);
  }
  const tiles = new THREE.InstancedMesh(hex, mmat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), 1), pts.length);
  const M = new THREE.Matrix4(), c = new THREE.Color();
  pts.forEach(([x, z], k) => { M.makeTranslation(x, CEIL + 0.05, z); tiles.setMatrixAt(k, M); tiles.setColorAt(k, c.setHSL(0.97, 0.35, 0.36 + Math.random() * 0.08)); });
  micro.add(tiles);
  // the mucus layer under the roof, and its lower surface
  const muc = new THREE.Mesh(new THREE.BoxGeometry(400, MUCUS, 400), mmat(new THREE.MeshStandardMaterial({ color: 0x8cc8ee, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide }), 0.13));
  muc.position.y = CEIL - MUCUS / 2; muc.renderOrder = 2; micro.add(muc);
}
// receptor neurons: a knob through the roof and 7 cilia lying out in the mucus
const neurons = [];
{
  const ciliaByType = RCOL.map(() => []);
  let tries = 0;
  while (neurons.length < 70 && tries++ < 5000) {
    const r = Math.sqrt(Math.random()) * ROOM, a = Math.random() * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (neurons.some((n) => Math.hypot(n.x - x, n.z - z) < 0.75)) continue;
    const t = neurons.length % RCOL.length;
    const mat = mmat(new THREE.MeshStandardMaterial({ color: 0xf2d6c9, emissive: RCOL[t], emissiveIntensity: 0.15, roughness: 0.5 }), 1);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), mat); knob.position.set(x, CEIL - 0.1, z); micro.add(knob);
    const tips = [];
    for (let k = 0; k < 7; k++) {
      const d = new THREE.Vector3(Math.cos(a + k * 0.9 + Math.random() * 0.4), 0, Math.sin(a + k * 0.9 + Math.random() * 0.4));
      const L = 0.9 + Math.random() * 0.6, sag = 0.35 + Math.random() * 0.35;
      const p0 = knob.position.clone(), curve = new THREE.CatmullRomCurve3([p0, p0.clone().add(new THREE.Vector3(0, -0.25, 0)).addScaledVector(d, 0.2),
        p0.clone().add(new THREE.Vector3(0, -sag, 0)).addScaledVector(d, L * 0.6), p0.clone().add(new THREE.Vector3(0, -sag - 0.08, 0)).addScaledVector(d, L)]);
      ciliaByType[t].push(new THREE.TubeGeometry(curve, 14, 0.011, 5, false));
      tips.push(curve.getPoint(1));
    }
    neurons.push({ x, z, t, knob, mat, tips, flash: 0 });
  }
  ciliaByType.forEach((gs, t) => {
    const m = new THREE.Mesh(mergeGeometries(gs), mmat(new THREE.MeshStandardMaterial({ color: new THREE.Color(RCOL[t]).lerp(new THREE.Color(0xffffff), 0.45), emissive: RCOL[t], emissiveIntensity: 0.25, roughness: 0.6 }), 1));
    micro.add(m);
  });
}
// odorants: each kind fits several receptor types, and each receptor type senses several kinds
// (Biology 2e 36.3: "Some receptors detect more than one odor, and many odors can be detected by more
// than one receptor"). A molecule's atoms show the colours of the receptor types it fits.
const KINDS = [[0, 2], [1, 2, 3], [0, 4], [3, 4], [1, 4], [0, 1, 3]];
const odorants = [];
function spawnOdorant(o, first) {
  // they come up from below (the nostril is down there, behind you); about half fly on, back towards the
  // throat and the lungs, before they reach the mucus
  const r = Math.sqrt(Math.random()) * ROOM * 0.6, a = Math.random() * Math.PI * 2;
  o.g.position.set(Math.cos(a) * r, first ? -3 + Math.random() * (CEIL - MUCUS + 3) : -3 - Math.random() * 3, Math.sin(a) * r + 2);
  o.g.visible = true; o.g.scale.setScalar(1); o.state = 'rise'; o.carrier = null; o.hold = 0; o.speed = 0.35 + Math.random() * 0.3;
  o.passAt = Math.random() < 0.5 ? -1 + Math.random() * 2.2 : null;
}
for (let i = 0; i < 24; i++) {
  const kind = KINDS[i % KINDS.length], g = new THREE.Group();
  const atoms = Math.max(kind.length + 1, 3 + (i % 3)), P = [new THREE.Vector3()];
  for (let k = 1; k < atoms; k++) P.push(P[Math.floor(Math.random() * k)].clone().add(new THREE.Vector3().randomDirection().multiplyScalar(0.11)));
  P.forEach((q, k) => {
    const col = RCOL[kind[k % kind.length]];
    const sph = new THREE.Mesh(new THREE.SphereGeometry(k ? 0.04 : 0.055, 12, 8), mmat(new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.3 }), 1));
    sph.position.copy(q); g.add(sph);
  });
  micro.add(g); const o = { g, kind }; spawnOdorant(o, true); odorants.push(o);
}
// odorant-binding proteins: carriers in the mucus that pick odorants up and take them to the cilia
// (A&P 2e 14.1: the odorants "bind to proteins that keep them dissolved in the mucus" and are carried
// to the dendrites; "the odorant-protein complex binds to a receptor protein")
const carriers = [];
{
  const geo = new THREE.IcosahedronGeometry(0.1, 2), pp = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pp.count; i++) { v.fromBufferAttribute(pp, i); v.multiplyScalar(1 + 0.18 * Math.sin(v.x * 40) * Math.cos(v.y * 33 + v.z * 21)); pp.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  const mat = mmat(new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.55, emissive: 0x334455, emissiveIntensity: 0.4 }), 0.95);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(geo, mat), r = Math.sqrt(Math.random()) * ROOM * 0.7, a = Math.random() * Math.PI * 2;
    m.position.set(Math.cos(a) * r, CEIL - MUCUS * (0.25 + Math.random() * 0.6), Math.sin(a) * r); micro.add(m);
    carriers.push({ m, state: 'free', cargo: null, target: null, hold: 0, seed: Math.random() * 6 });
  }
}
function tipFor(kind, p) {                       // a cilium of one of the kind's receptor types, near p
  const t = kind[Math.floor(Math.random() * kind.length)];
  let best = null, bd = 1e9;
  for (const n of neurons) if (n.t === t) for (const tip of n.tips) { const d = tip.distanceToSquared(p); if (d < bd) { bd = d; best = { n, tip }; } }
  return best;
}
// air streaming through the cavity below the mucus
const AIR = 500, airPos = new Float32Array(AIR * 3);
for (let i = 0; i < AIR; i++) airPos.set([(Math.random() - 0.5) * ROOM * 1.6, -4 + Math.random() * (CEIL - MUCUS + 3.8), (Math.random() - 0.5) * ROOM * 2.4], i * 3);
const airGeo = new THREE.BufferGeometry(); airGeo.setAttribute('position', new THREE.BufferAttribute(airPos, 3));
micro.add(new THREE.Points(airGeo, mmat(new THREE.PointsMaterial({ color: 0x9fd8ff, size: 0.025, depthWrite: false }), 0.45)));
// labels in the room
function roomLabel(text, pos, w = 2.6) {   // w: the widest it may get, in metres; the card fits its text
  const PX = 0.0026, font = '600 40px system-ui', g = document.createElement('canvas').getContext('2d'); g.font = font;
  const cw = Math.min(Math.round(w / PX), Math.ceil(g.measureText(text).width) + 2 * 22 + 4);
  const c = textCanvas([{ text, font, color: '#ffe2a8', lh: 50 }], cw, 22);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(c.width * PX, c.height * PX), mmat(new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }), 0.95));
  m.material.userData.late = true;   // shown once the room is mostly in (they draw over everything)
  m.material.map.colorSpace = THREE.SRGBColorSpace; m.renderOrder = 12; m.position.copy(pos); m.userData.face = true; micro.add(m); return m;
}
// short names only, each next to its thing: the explanation is the step's text
roomLabel('Olfactory epithelium', new THREE.Vector3(-1.6, CEIL - 0.25, -3.2));
roomLabel('Mucus', new THREE.Vector3(1.9, CEIL - MUCUS + 0.12, -2.6));
roomLabel('Cilia with receptors (colour = type)', new THREE.Vector3(-2.4, CEIL - 0.85, -1.6));
roomLabel('Binding proteins (white)', new THREE.Vector3(2.3, CEIL - MUCUS + 0.45, -1.7));
roomLabel('Odorants', new THREE.Vector3(-0.9, 0.85, -2.4));
roomLabel('↓ to the throat', new THREE.Vector3(0.6, -1.2, -6));
roomLabel('Behind you: the nostril', new THREE.Vector3(2.4, -0.2, 2.6));
roomLabel(`${(DIVE_S.S2 * DIVE_S.K).toLocaleString('en')}× life size · schematic`, new THREE.Vector3(-1.7, -0.1, -2.6));
const micro_ = { op: 0, target: 0 };
function microTick(dt, time) {
  micro_.op += (micro_.target - micro_.op) * Math.min(1, dt * 4);
  if (micro_.target === 0 && micro_.op < 0.01) { micro_.op = 0; scene.fog = null; }
  const grown = Math.min(1, Math.max(0, (micro.scale.x - 0.012) / 0.1));   // hidden while it is a tiny box at the roof
  micro.visible = micro_.op * grown > 0.005;
  if (!micro.visible) return;
  for (const m of microMats) m.opacity = grown * m.userData.op * (m.userData.late ? Math.max(0, micro_.op * 2 - 1) : micro_.op) * (micro.scale.x > 0.6 || !m.userData.late ? 1 : 0);
  // air drifts along the cavity
  for (let i = 0; i < AIR; i++) { let z = airPos[i * 3 + 2] - dt * 1.2; if (z < -ROOM * 1.2) z += ROOM * 2.4; airPos[i * 3 + 2] = z; }   // back, towards the throat
  airGeo.attributes.position.needsUpdate = true;
  for (const n of neurons) { n.flash = Math.max(0, n.flash - dt * 0.8); n.mat.emissiveIntensity = 0.15 + n.flash * 2.2; }
  for (const o of odorants) {
    const p = o.g.position; o.g.rotation.x += dt * 0.7; o.g.rotation.y += dt * 0.5;
    if (o.state === 'rise') {
      p.y += o.speed * dt; p.x += Math.sin(time * 0.8 + o.kind[0]) * dt * 0.12; p.z -= dt * 0.25;
      if (o.passAt !== null && p.y > o.passAt) o.state = 'pass';
      if (p.y > CEIL - MUCUS + 0.05) o.state = 'dissolved';            // in the mucus: wait for a carrier
    } else if (o.state === 'dissolved') {
      p.y = Math.min(p.y + dt * 0.03, CEIL - 0.45);
      if (!o.carrier) {
        let best = null, bd = 1e9;
        for (const c of carriers) if (c.state === 'free') { const d = c.m.position.distanceToSquared(p); if (d < bd) { bd = d; best = c; } }
        if (best) { best.state = 'fetch'; best.cargo = o; o.carrier = best; }
      }
    } else if (o.state === 'carried') {
      p.copy(o.carrier.m.position).add(new THREE.Vector3(0, -0.13, 0));
    } else if (o.state === 'pass') {                                 // on with the airstream, to the throat
      p.z -= dt * 1.6; p.y -= dt * 0.35; o.g.scale.setScalar(Math.max(0, 1 + (p.z + 4) / 10));
      if (p.z < -14) spawnOdorant(o, false);
    } else if (o.state === 'bound' && (o.hold -= dt) < 0) spawnOdorant(o, false);
  }
  for (const c of carriers) {
    const q = c.m.position; c.m.rotation.y += dt * 0.3;
    const go = (to, v) => { const d = to.clone().sub(q), L = d.length(); if (L > 1e-4) q.addScaledVector(d, Math.min(1, v * dt / L)); return L; };
    if (c.state === 'free') { q.x += Math.sin(time * 0.3 + c.seed) * dt * 0.05; q.z += Math.cos(time * 0.25 + c.seed) * dt * 0.05; }
    else if (c.state === 'fetch') {
      if (go(c.cargo.g.position.clone().add(new THREE.Vector3(0, 0.13, 0)), 0.55) < 0.05) {
        c.cargo.state = 'carried'; c.target = tipFor(c.cargo.kind, q); c.state = c.target ? 'deliver' : 'free';
      }
    } else if (c.state === 'deliver') {
      if (go(c.target.tip.clone().add(new THREE.Vector3(0, 0.12, 0)), 0.35) < 0.05) {
        const o = c.cargo; o.state = 'bound'; o.hold = 1.3; o.g.position.copy(c.target.tip); o.carrier = null;
        c.target.n.flash = 1; c.state = 'rest'; c.hold = 1.5; c.cargo = null;
      }
    } else if (c.state === 'rest' && (c.hold -= dt) < 0) c.state = 'free';
  }
  camera.getWorldPosition(camPos);
  for (const ch of micro.children) if (ch.userData.face) ch.lookAt(camPos);
}

// ---------- the dive: in through the nostril and up the nasal cavity to the olfactory roof
// You are the camera and you fly the route itself: the model is placed so the route's current point
// is at your eyes, turned so the route runs straight ahead, and grown from 20x to 75x life size. At the
// end the head and the room grow together about one spot on the roof, which is the room's ceiling.
// One timeline, T from 0 (the nose view) to its end (in the room): Next plays it forward, Back plays
// it backward, so the way out is the way in. The route stays inside the cavity built above.
const DIVE = { active: false, done: true, dir: 1, T: 0, last: 0, curve: null, E: new THREE.Vector3(), fwd: new THREE.Vector3(), camFree: false };
const DIVE_T = { approach: 1.6, route: 3.4, zoom: 3.0, settle: 1.8 };
const DIVE_TT = () => DIVE_T.approach + DIVE_T.route + DIVE_T.zoom + DIVE_T.settle;
const headlamp = new THREE.PointLight(0xfff2e0, 0, 0, 0); camera.add(headlamp);   // lights the cavity walls
const OUTSIDE = 2;                                   // the step the dive starts from (the nose view)
function rebase(at) {                                // move the turning pivot to `at` without moving anything
  const at0 = spin.position.clone(), sc = stage.scale.x;
  const r0 = at.clone().sub(at0).applyQuaternion(spin.quaternion).add(at0);
  stage.position.add(r0.multiplyScalar(sc)).sub(at.clone().multiplyScalar(sc));
  spin.position.copy(at); anat.position.copy(at).negate();
}
function diveSetup(keepE) {
  if (!keepE) {
    if (renderer.xr.isPresenting) { camera.getWorldPosition(DIVE.E); camera.getWorldDirection(DIVE.fwd); DIVE.fwd.y = 0; DIVE.fwd.normalize(); }
    else { DIVE.E.set(0, eyeH, 0); DIVE.fwd.set(0, 0, -1); }
  }
  const { S2, D2 } = DIVE_S, endY = ROOF - ROOF_GAP - (CEIL - DIVE.E.y) / S2, x = SIDE * 0.0085;
  DIVE.curve = new THREE.CatmullRomCurve3([
    V0.clone().addScaledVector(VD, -0.035),            // outside, below and in front of the nostril
    V0.clone().addScaledVector(VD, -0.015),
    V0.clone(),                                        // the nostril
    V0.clone().addScaledVector(VD, 0.012),             // up the vestibule
    V0.clone().addScaledVector(VD, 0.022),             // into the cavity
    new THREE.Vector3(x, endY, zEnd + 0.010),
    new THREE.Vector3(x, endY, zEnd)]);                // level, under the roof
  DIVE.P = DIVE.E.clone().addScaledVector(DIVE.fwd, D2); DIVE.P.y = CEIL;     // the roof spot: ahead and up
  DIVE.B = new THREE.Vector3(DIVE.E.x, 0, DIVE.E.z);                         // the room's origin
  micro.rotation.set(0, Math.atan2(-DIVE.fwd.x, -DIVE.fwd.z), 0);
  const yaw = Math.atan2(-DIVE.fwd.x, -DIVE.fwd.z);
  DIVE.Cd = pose(DIVE.E, yaw, 0); DIVE.Cu = poseLook(DIVE.E, DIVE.P);
}
function viewRot(u) {                                // turns the route's direction at u to straight ahead
  const f = DIVE.curve.getTangent(Math.min(u, 0.999)).normalize();
  const ref = new THREE.Vector3(0, 0.35, 1).normalize();          // the face's front stays "up" when climbing
  const up = ref.clone().addScaledVector(f, -ref.dot(f)).normalize(), right = new THREE.Vector3().crossVectors(f, up);
  const wf = DIVE.fwd, wu = new THREE.Vector3(0, 1, 0), wr = new THREE.Vector3().crossVectors(wf, wu);
  const Ba = new THREE.Matrix4().makeBasis(right, up, f.clone().negate()), Bw = new THREE.Matrix4().makeBasis(wr, wu, wf.clone().negate());
  return new THREE.Quaternion().setFromRotationMatrix(Bw.multiply(Ba.transpose()));
}
const ease = (t) => (t = Math.min(1, Math.max(0, t)), t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
function placeRoute(p, q, sc, W) { spin.position.copy(p); anat.position.copy(p).negate(); spin.quaternion.copy(q); stage.scale.setScalar(sc); stage.position.copy(W.clone().addScaledVector(p, -sc)); }
function placeAt(T) {                                // the model (and the room) at time T of the dive
  const { approach: A, route: R, zoom: Z } = DIVE_T, { S1, S2, K } = DIVE_S;
  let m = 1 / K;
  if (T < A) {                                       // swing round to face the nostril from below
    const e = ease(T / A);
    placeRoute(DIVE.curve.getPoint(0), DIVE.q0.clone().slerp(viewRot(0), e), DIVE.s0 * (S1 / DIVE.s0) ** e, DIVE.W0.clone().lerp(DIVE.E, e));
  } else if (T < A + R) {                            // fly the route, growing from S1 to S2
    const u = ease((T - A) / R);
    placeRoute(DIVE.curve.getPoint(u), viewRot(u), S1 * (S2 / S1) ** u, DIVE.E);
  } else {                                           // into the roof: head and room grow together about it
    placeRoute(DIVE.curve.getPoint(1), viewRot(1), S2, DIVE.E);
    const k = K ** ease((T - A - R) / Z); m = k / K;
    stage.position.copy(DIVE.P.clone().add(stage.position.clone().sub(DIVE.P).multiplyScalar(k))); stage.scale.setScalar(S2 * k);
  }
  micro.scale.setScalar(m); micro.position.copy(DIVE.P.clone().add(DIVE.B.clone().sub(DIVE.P).multiplyScalar(m)));
}
function camAt(T) {                                  // the desktop camera along the same timeline
  const { approach: A, route: R, zoom: Z, settle: S } = DIVE_T;
  if (T < A) setPose(DIVE.C0, DIVE.Cd, ease(T / (A * 0.9)));
  else if (T < A + R) setPose(DIVE.Cd, DIVE.Cu, ease(((T - A) / R - 0.55) / 0.45));   // look up at the roof as you arrive
  else if (T < A + R + Z) setPose(DIVE.Cu, DIVE.Cu, 0);
  else setPose(DIVE.Cu, DIVE.Croom, ease((T - A - R - Z) / S));
}
const camA = new THREE.Vector3();
function diveTargets(T) {                            // what shows, as a function of T and of where you are
  const { approach: A, route: R } = DIVE_T;
  if (T < A * 0.3) { for (const [m, v] of DIVE.outside) m.userData.target = v; micro_.target = 0; headlamp.intensity = 0; return; }
  for (const m of meshes.values()) m.userData.target = 0;
  for (const m of [...role.epithelium, ...role.piriform]) m.userData.target = 0;
  // his face is solid until you are up inside the nostril, then it goes (from inside you'd only see its back)
  camA.copy(camera.getWorldPosition(new THREE.Vector3())).applyMatrix4(anat.matrixWorld.clone().invert());
  const outside = T < DIVE_T.approach || camA.clone().sub(V0).dot(VD) < 0.006;   // (while swinging round to the nostril you are always outside)
  for (const m of role.face) m.userData.target = outside ? 1 : 0;
  for (const m of [...role.cup, ...role.cavity]) m.userData.target = 1;
  for (const m of role.headset) m.userData.target = outside && DIVE.headset ? 1 : 0;   // on the way out at the end, he wears it
  micro_.target = T > A + R ? 1 : 0;
  stream.target = T > A + R ? 0 : 1;   // in the room its own molecules take over (the dots would be huge this close)
  headlamp.intensity = 1.5;
  if (micro_.target && !scene.fog) scene.fog = new THREE.Fog(0x1a0c10, 4000, 90000);
}
function diveStart(dir) {
  DIVE.headset = false;
  const outsideStep = STEPS.steps[OUTSIDE];
  setTargets(outsideStep);
  DIVE.outside = new Map([...meshes.values(), ...role.epithelium, ...role.piriform].map((m) => [m, m.userData.target]));
  if (dir > 0) {                                     // from where things are now
    diveSetup(false);
    scene.updateMatrixWorld(true);
    const P0 = DIVE.curve.getPoint(0);
    rebase(P0); scene.updateMatrixWorld(true);
    DIVE.W0 = P0.clone().applyMatrix4(anat.matrixWorld); DIVE.q0 = spin.quaternion.clone(); DIVE.s0 = stage.scale.x;
    DIVE.C0 = curPose(); DIVE.Croom = shotFor(STEPS.steps[OUTSIDE + 1]); DIVE.T = 0;
  } else {                                           // from the room, back out to the nose view
    diveSetup(true);
    const P0 = DIVE.curve.getPoint(0), F = FOCUS[outsideStep.focus], pl = placementFor(outsideStep.focus);
    const R = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, F.yaw ?? 0, 0));
    DIVE.W0 = pl.pos.clone().add(P0.clone().sub(F.at).applyQuaternion(R).add(F.at).multiplyScalar(pl.scale)); DIVE.q0 = R; DIVE.s0 = pl.scale;
    DIVE.C0 = shotFor(outsideStep); DIVE.Croom = curPose(); DIVE.T = DIVE_TT();
  }
  DIVE.dir = dir; DIVE.active = true; DIVE.done = false; DIVE.camFree = renderer.xr.isPresenting; DIVE.last = performance.now() / 1000;
  place.mode = 'dive';
}
function diveFinish() {
  DIVE.active = false;
  if (DIVE.dir > 0) { DIVE.done = true; return; }   // in the room
  // back at the nose view: hand over to the normal placement (a short glide absorbs any difference)
  DIVE.done = true; headlamp.intensity = 0; micro_.target = 0;
  const step = STEPS.steps[OUTSIDE], F = FOCUS[step.focus];
  rebase(F.at);
  place.from = { pos: stage.position.clone(), scale: stage.scale.x, q: spin.quaternion.clone() };
  place.to = { ...placementFor(step.focus), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, F.yaw ?? 0, 0)) };
  place.dur = 0.6; place.t = 0; place.t0 = performance.now() / 1000; place.mode = 'glide';
  setTargets(step); micro.scale.setScalar(1);
}
function diveTick() {
  if (!DIVE.active) return;
  const now = performance.now() / 1000, TT = DIVE_TT();
  DIVE.T = Math.min(TT, Math.max(0, DIVE.T + DIVE.dir * (now - DIVE.last))); DIVE.last = now;
  if (!DIVE.camFree && !renderer.xr.isPresenting) camAt(DIVE.T);
  placeAt(DIVE.T); scene.updateMatrixWorld(true);
  diveTargets(DIVE.T);
  if ((DIVE.dir > 0 && DIVE.T >= TT) || (DIVE.dir < 0 && DIVE.T <= 0)) diveFinish();
}
function diveCancel() {                              // jumping elsewhere mid-dive
  // the room goes too: whatever comes next turns it back on if it wants it (fast presses back from the
  // pipeline left it showing over the man, 2026-11-17)
  DIVE.active = false; DIVE.done = true; headlamp.intensity = 0; micro_.target = 0; scene.fog = null;
}
// back into the room from the next step: the reverse of leaving it, a straight zoom down onto the roof
function roomEntry(prev) {
  diveSetup(false);
  place.cur = { pos: stage.position.clone(), scale: stage.scale.x, q: spin.quaternion.clone(), at: spin.position.clone() };
  DIVE.T = DIVE_TT(); placeAt(DIVE.T);                // where the dive ends
  const end = { pos: stage.position.clone(), scale: stage.scale.x, q: spin.quaternion.clone(), at: spin.position.clone() };
  // ... but start from where we are: put that back, with the same pivot
  stage.position.copy(place.cur.pos); stage.scale.setScalar(place.cur.scale); spin.quaternion.copy(place.cur.q);
  spin.position.copy(place.cur.at); anat.position.copy(place.cur.at).negate();
  rebase(end.at);
  place.from = { pos: stage.position.clone(), scale: stage.scale.x, q: spin.quaternion.clone() }; place.to = end;
  place.dur = 1.6; place.t = 0; place.t0 = performance.now() / 1000; place.mode = 'glide';
  place.onHalf = () => { diveTargets(DIVE.T); };     // the cavity and the room come in for the last stretch
  micro.scale.setScalar(1); micro.position.copy(DIVE.B); stream.target = 0;
  DIVE.active = false; DIVE.done = true; DIVE.dir = 1;
}
// Out of the room into the textbook cut, as one reversible timeline: zoom back out of the room to
// under the roof (the dive's own end, played backward), then the half of the head on the septum side
// is sliced away right next to you, the cut rims and the nerves draw in, and you back out through the
// opening and turn to look at the cut from the side. Back plays it the other way.
const EXIT = { active: false, dir: 1, T: 0, last: 0, RATE: 1.6, B: 4.2, phase: '' };
const EXIT_Z = () => (DIVE_T.zoom + DIVE_T.settle) / EXIT.RATE, EXIT_TT = () => EXIT_Z() + EXIT.B;
const cutStep = () => STEPS.steps.find((s) => s.cut);
function exitStart(dir) {
  const cs = cutStep(), F = FOCUS[cs.focus];
  diveSetup(dir > 0);                                // forward: the room you are in; back: from where you are now
  DIVE.Croom = shotFor(STEPS.steps[OUTSIDE + 1]);
  // the end is the cut step's own placement, written as the anatomy point at your eyes
  const pl = placementFor(cs.focus), R = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, F.yaw ?? 0, 0));
  const Wat = pl.pos.clone().add(F.at.clone().multiplyScalar(pl.scale));
  const p1 = DIVE.E.clone().sub(Wat).divideScalar(pl.scale).applyQuaternion(R.clone().invert()).add(F.at);
  const p0 = DIVE.curve.getPoint(1);
  EXIT.p0 = p0; EXIT.q0 = viewRot(1); EXIT.q1 = R; EXIT.s1 = pl.scale; EXIT.pl = pl; EXIT.F = F;
  EXIT.path = new THREE.CatmullRomCurve3([p0, new THREE.Vector3(CUT_X - SIDE * 0.006, p0.y - 0.002, p0.z), p1]);   // out through the opening first
  EXIT.Cend = shotFor(cs);
  if (dir < 0) rebase(p1);
  EXIT.T = dir > 0 ? 0 : EXIT_TT(); EXIT.dir = dir; EXIT.active = true; EXIT.phase = ''; EXIT.last = performance.now() / 1000;
  DIVE.active = false; place.mode = 'exit'; cutState.driven = true;
}
const clamp01 = (x) => Math.min(1, Math.max(0, x));
function exitTick() {
  if (!EXIT.active) return;
  const now = performance.now() / 1000, TZ = EXIT_Z(), TT = EXIT_TT();
  EXIT.T = Math.min(TT, Math.max(0, EXIT.T + EXIT.dir * (now - EXIT.last))); EXIT.last = now;
  const desk = !DIVE.camFree && !renderer.xr.isPresenting;
  if (EXIT.T < TZ) {                                 // the room, shrinking back to the roof
    const dT = DIVE_TT() - EXIT.T * EXIT.RATE;
    if (EXIT.phase !== 'room') { EXIT.phase = 'room'; scene.fog = null; }
    cutState.x = CUT_PARK; cutState.fill = 0; cutStroke.grow = 0;
    if (desk) camAt(dT);
    placeAt(dT); scene.updateMatrixWorld(true); diveTargets(dT);
  } else {
    const u = (EXIT.T - TZ) / EXIT.B;
    if (EXIT.phase !== 'cut') {                      // the room goes, the drawing's parts come
      EXIT.phase = 'cut'; scene.fog = null; micro_.target = 0; stream.target = 0; EXIT.bones = false;
      setTargets(cutStep());
    }
    // bones and brain come once you are out of the cavity (inside it, they would poke through its walls)
    if ((u > 0.3) !== EXIT.bones) { EXIT.bones = u > 0.3; setTargets(cutStep()); }
    if (!EXIT.bones) for (const m of [...(role.skull ?? []), ...(role.nose ?? []), ...(role.brain ?? []), ...role.base, ...(role.cribriform ?? [])]) m.userData.target = 0;
    // the slice sweeps in from the far side up to the cut, then the fill dissolves in and the rims draw
    cutState.x = CUT_X + (-SIDE * 0.03) * (1 - ease(clamp01(u / 0.14)));
    cutState.fill = clamp01((u - 0.08) / 0.3); cutStroke.grow = clamp01((u - 0.12) / 0.6);
    headlamp.intensity = 1.5 * (1 - clamp01(u / 0.45));
    // you back out through the opening, shrinking the head, and turn to see the cut from the side
    const v = ease(clamp01((u - 0.1) / 0.9)), w = ease(clamp01((u - 0.22) / 0.78));
    placeRoute(EXIT.path.getPoint(v), EXIT.q0.clone().slerp(EXIT.q1, w), DIVE_S.S2 * (EXIT.s1 / DIVE_S.S2) ** v, DIVE.E);
    micro.scale.setScalar(1 / DIVE_S.K);
    if (desk) setPose(DIVE.Cu, EXIT.Cend, ease(clamp01((u - 0.1) / 0.85)));
    scene.updateMatrixWorld(true);
  }
  if (EXIT.dir > 0 && EXIT.T >= TT) {                // at the cut: hand over to the normal placement
    EXIT.active = false; cutState.driven = false; headlamp.intensity = 0;
    rebase(EXIT.F.at); place.from = place.to = { ...EXIT.pl, q: EXIT.q1.clone() }; place.t = 1; place.mode = 'glide';
  } else if (EXIT.dir < 0 && EXIT.T <= 0) {          // back in the room, as the dive leaves it
    EXIT.active = false; cutState.driven = false; DIVE.T = DIVE_TT(); DIVE.done = true; DIVE.dir = 1; place.mode = 'dive';
  }
}
// The way out, as one reversible timeline: from the close-up back down through the plate into the
// cavity (the cut closes behind you), back down the cavity to the nostril, then straight out along the
// nostril, up to face him (he is wearing a VR headset), and round to his side for the overview the
// pipeline slides start from. Back plays it the other way, into the close-up.
const OUT = { active: false, dir: 1, T: 0, last: 0, B1: 3.6, SEG: [1.4, 2.2, 2.6], phase: '' };
const OUT_R = () => DIVE_T.route, OUT_B3 = () => OUT.SEG.reduce((a, b) => a + b), OUT_TT = () => OUT.B1 + OUT_R() + OUT_B3();
const stepById = (id) => STEPS.steps.find((s) => s.id === id);
function outStart(dir) {
  const zs = stepById('bulb'), fs = stepById('headset'), ns = STEPS.steps[OUTSIDE];
  diveSetup(false);
  // the close-up's placement, as the anatomy point at your eyes (as for the cut, see exitStart)
  const Fz = FOCUS[zs.focus], pz = placementFor(zs.focus), Rz = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Fz.yaw ?? 0, 0));
  const Wz = pz.pos.clone().add(Fz.at.clone().multiplyScalar(pz.scale));
  const p1 = DIVE.E.clone().sub(Wz).divideScalar(pz.scale).applyQuaternion(Rz.clone().invert()).add(Fz.at);
  const p0 = DIVE.curve.getPoint(1);
  Object.assign(OUT, { zs, fs, Fz, pz, Rz, q0: viewRot(1), path: new THREE.CatmullRomCurve3([p0, new THREE.Vector3(CUT_X - SIDE * 0.006, p0.y - 0.002, p0.z), p1]), Cz: shotFor(zs) });
  // after the nostril, keyframes of where your eyes are in his anatomy (and how he is turned and scaled):
  // just outside the nostril (the route's start), further out along the nostril's axis, face to face
  // at his eye level, and the final step's own placement (seen from his side)
  const Ff = FOCUS[fs.focus], pf = placementFor(fs.focus), Rf = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Ff.yaw ?? 0, 0));
  const Wfat = pf.pos.clone().add(Ff.at.clone().multiplyScalar(pf.scale));
  const eyes = new THREE.Box3().setFromObject(meshes.get('(person) low-poly')).applyMatrix4(anat.matrixWorld.clone().invert()), eyeY = (eyes.min.y + eyes.max.y) / 2;
  const yawF = Math.atan2(-DIVE.fwd.x, -DIVE.fwd.z), Rface = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawF, 0)), sFace = 2.6;
  OUT.K = [
    { e: DIVE.curve.getPoint(0), q: viewRot(0), s: DIVE_S.S1 },
    { e: V0.clone().addScaledVector(VD, -0.065), q: viewRot(0), s: 7 },
    { e: new THREE.Vector3(0, eyeY + 0.004, 0.12 + 0.8 / sFace), q: Rface, s: sFace },
    { e: DIVE.E.clone().sub(Wfat).divideScalar(pf.scale).applyQuaternion(Rf.clone().invert()).add(Ff.at), q: Rf, s: pf.scale },
  ];
  OUT.Kpath = new THREE.CatmullRomCurve3(OUT.K.map((k) => k.e));
  Object.assign(OUT, { Ff, pf, Rf });
  setTargets(fs); DIVE.outside = new Map([...meshes.values(), ...role.epithelium, ...role.piriform].map((m) => [m, m.userData.target]));   // what shows once you are out
  for (const m of role.headset) DIVE.outside.set(m, 0);   // (it comes during the pull-back, see outTick)
  setTargets(zs);
  OUT.T = dir > 0 ? 0 : OUT_TT(); OUT.dir = dir; OUT.active = true; OUT.phase = ''; OUT.last = performance.now() / 1000;
  if (EXIT.active) exitCancel(); DIVE.active = false; DIVE.headset = false; place.mode = 'out'; cutState.driven = true;
}
function outTick() {
  if (!OUT.active) return;
  const now = performance.now() / 1000, R2 = OUT_R(), TT = OUT_TT();
  OUT.T = Math.min(TT, Math.max(0, OUT.T + OUT.dir * (now - OUT.last))); OUT.last = now;
  const desk = !DIVE.camFree && !renderer.xr.isPresenting, T = OUT.T;
  if (T < OUT.B1) {                                  // the close-up <-> under the roof (as the cut's opening, backwards)
    const u = 1 - T / OUT.B1;
    if (OUT.phase !== 'up') { OUT.phase = 'up'; scene.fog = null; micro_.target = 0; cupLift.target = 1; }
    if (u > 0.55) setTargetsOnce('bulb'); else { lastOnce = ''; diveTargets(DIVE_T.approach + DIVE_T.route); }
    micro_.target = 0; stream.target = u < 0.3 ? 1 : 0;
    cutState.x = CUT_X + (-SIDE * 0.03) * (1 - ease(clamp01(u / 0.14))); cutState.fill = 0; cutStroke.grow = 0;
    headlamp.intensity = 1.5 * (1 - clamp01((u - 0.3) / 0.4));
    const v = ease(clamp01((u - 0.1) / 0.9)), w = ease(clamp01((u - 0.22) / 0.78));
    placeRoute(OUT.path.getPoint(v), OUT.q0.clone().slerp(OUT.Rz, w), DIVE_S.S2 * (OUT.pz.scale / DIVE_S.S2) ** v, DIVE.E);
    if (desk) setPose(DIVE.Cu, OUT.Cz, ease(clamp01((u - 0.1) / 0.85)));
  } else if (T < OUT.B1 + R2) {                      // down the cavity to the nostril: the dive's route, backwards
    const dT = DIVE_T.approach + R2 - (T - OUT.B1);
    if (OUT.phase !== 'route') { OUT.phase = 'route'; cutState.x = CUT_PARK; }
    cupLift.target = dT > DIVE_T.approach + 0.4 * R2 ? 1 : 0;   // the cup goes back down before you come out (or you would fly through it)
    cutState.x = CUT_PARK; cutState.fill = 0; cutStroke.grow = 0;
    if (desk) camAt(dT);
    placeAt(dT); diveTargets(dT);
  } else {                                           // straight out, up to face him, round to his side
    let t = T - OUT.B1 - R2, i = 0; while (i < 2 && t > OUT.SEG[i]) t -= OUT.SEG[i++];
    const l = ease(clamp01(t / OUT.SEG[i])), a = OUT.K[i], b = OUT.K[i + 1];
    if (OUT.phase !== 'head') { OUT.phase = 'head'; setTargets(OUT.fs); headlamp.intensity = 0; stream.target = 0; }
    cupLift.target = 0; cutState.x = CUT_PARK;
    for (const m of role.headset) m.userData.target = i >= 1 ? 1 : 0;   // once you are out from under his nose
    placeRoute(OUT.Kpath.getPoint((i + l) / 3), a.q.clone().slerp(b.q, l), a.s * (b.s / a.s) ** l, DIVE.E);
    if (desk) setPose(DIVE.Cd, DIVE.Cd, 0);
  }
  scene.updateMatrixWorld(true);
  if (OUT.dir > 0 && T >= TT) {                      // at his head: the normal placement takes over
    OUT.active = false; cutState.driven = false; rebase(OUT.Ff.at); place.from = place.to = { ...OUT.pf, q: OUT.Rf.clone() }; place.t = 1; place.mode = 'glide';
  } else if (OUT.dir < 0 && T <= 0) {               // back at the close-up
    OUT.active = false; cutState.driven = false; headlamp.intensity = 0; setTargets(OUT.zs);
    rebase(OUT.Fz.at); place.from = place.to = { ...OUT.pz, q: OUT.Rz.clone() }; place.t = 1; place.mode = 'glide';
  }
}
let lastOnce = '';
function setTargetsOnce(id) { if (lastOnce !== id + OUT.phase) { lastOnce = id + OUT.phase; setTargets(stepById(id)); } }
function outCancel() { OUT.active = false; cutState.driven = false; headlamp.intensity = 0; place.mode = 'glide'; }
function exitCancel() { EXIT.active = false; cutState.driven = false; headlamp.intensity = 0; place.mode = 'glide'; micro_.target = 0; scene.fog = null; }
const pose = (pos, yaw, pitch) => ({ pos: pos.clone(), yaw, pitch });
const poseLook = (pos, at) => { const v = at.clone().sub(pos); return pose(pos, Math.atan2(-v.x, -v.z), Math.atan2(v.y, Math.hypot(v.x, v.z))); };
const curPose = () => pose(camera.position, look.yaw, look.pitch);
function setPose(a, b, e) {
  camera.position.lerpVectors(a.pos, b.pos, e);
  const dy = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
  look.yaw = a.yaw + dy * e; look.pitch = a.pitch + (b.pitch - a.pitch) * e;
  camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
}

// ---------- desktop camera shots: each step frames its model, panel and close-up in the centre.
// Default: computed from what the step shows; a step can set its own: "cam": {"pos": [x,y,z], "look": [x,y,z]}
// (world metres; the viewer starts at (0, 1.5, 0) looking down -z). Not used in VR: there your head is the camera.
const camTween = { t: 1, from: null, to: null };
const look = { yaw: 0, pitch: 0 };   // the desktop camera's heading (mouse look, shots)
function shotFor(step) {
  if (step.cam) {
    const pos = new THREE.Vector3(...step.cam.pos), lookAt = new THREE.Vector3(...step.cam.look), v = lookAt.clone().sub(pos);
    return { pos, lookAt, yaw: Math.atan2(-v.x, -v.z), pitch: Math.atan2(v.y, Math.hypot(v.x, v.z)) };
  }
  const F = FOCUS[step.focus] ?? FOCUS.body, to = placementFor(step.focus), yaw = F.yaw ?? 0;
  // the parts the step is about (its highlights; else what it shows, minus the ghosted context)
  const keys = step.highlight?.length ? step.highlight : step.show.filter((r) => step.focus === 'body' ? r === 'body' : !['skull', 'body'].includes(r));
  scene.updateMatrixWorld(true);   // the step just reset the spin: refresh every world matrix before measuring
  const inv = anat.matrixWorld.clone().invert();
  const box = new THREE.Box3(), q = new THREE.Vector3(), rot = new THREE.Matrix4().makeRotationY(yaw);
  for (const k of keys) for (const m of role[k] ?? []) {
    const b = new THREE.Box3().setFromObject(m);   // anatomy space (anat/spin/stage transforms are folded out below)
    b.applyMatrix4(inv);
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      q.set(x, y, z).sub(F.at).applyMatrix4(rot).add(F.at).multiplyScalar(to.scale).add(to.pos);   // where it will be
      box.expandByPoint(q);
    }
  }
  // the panel (right of the focus point) and the close-up (left), as placed in the render loop
  const c = new THREE.Vector3(0, step.focus === 'body' ? 1.1 : eyeH - 0.1, -F.dist);
  const ph = panel.scale.y / 2;
  box.expandByPoint(new THREE.Vector3(c.x + 0.25, c.y + 0.05 - ph, c.z + 0.1)).expandByPoint(new THREE.Vector3(c.x + 0.76, c.y + 0.05 + ph, c.z + 0.1));
  if (step.inset) box.expandByPoint(new THREE.Vector3(c.x - 0.74, c.y - 0.17, c.z + 0.1)).expandByPoint(new THREE.Vector3(c.x - 0.30, c.y + 0.17, c.z + 0.1));
  const L = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), th = tv * camera.aspect;
  const d = Math.max(0.5, 1.2 * Math.max(size.x / 2 / th, size.y / 2 / tv) + size.z / 2);
  const pos = L.clone().add(new THREE.Vector3(0, d * 0.12, d)), v = L.clone().sub(pos);
  return { pos, lookAt: L, yaw: Math.atan2(-v.x, -v.z), pitch: Math.atan2(v.y, Math.hypot(v.x, v.z)) };
}
function goToShot(step, arc = 0) {
  if (renderer.xr.isPresenting) return;
  camTween.from = curPose(); camTween.to = shotFor(step); camTween.t = 0; camTween.t0 = performance.now() / 1000;
  camTween.dur = step.scene ? 2.0 : 1.8; camTween.arc = arc;
}
// the side a transition's camera arc swings to: fixed per pair of steps, so going back retraces it
// (the arc's side is measured from the direction of travel, which flips, hence the sign)
const arcFor = (prev, i) => prev === null ? 0 : (Math.min(prev, i) % 2 ? 1 : -1) * (i > prev ? 1 : -1);
// The glide swings round what it looks at: the camera arcs out to one side (alternating left and
// right from step to step) while it keeps its eyes on a point that slides to the new subject.
function camTick(dt) {
  if (camTween.t >= 1 || renderer.xr.isPresenting) return;
  camTween.t = Math.min(1, (performance.now() / 1000 - camTween.t0) / (camTween.dur ?? 1.3));
  const t = camTween.t, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2, a = camTween.from, b = camTween.to;
  const dist = b.lookAt.distanceTo(a.pos);
  const fwd0 = new THREE.Vector3(-Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), -Math.cos(a.yaw) * Math.cos(a.pitch));
  const target = a.pos.clone().addScaledVector(fwd0, dist).lerp(b.lookAt, e);
  const travel = b.pos.clone().sub(a.pos); travel.y = 0;
  const side = travel.lengthSq() > 1e-6 ? new THREE.Vector3(-travel.z, 0, travel.x).normalize() : new THREE.Vector3(1, 0, 0);
  const bump = Math.sin(Math.PI * e), amp = camTween.arc * (0.25 + 0.45 * Math.min(1.5, a.pos.distanceTo(b.pos)));
  camera.position.lerpVectors(a.pos, b.pos, e).addScaledVector(side, bump * amp).add(new THREE.Vector3(0, bump * amp * 0.25, 0));
  camera.lookAt(target);
  look.yaw = camera.rotation.y; look.pitch = camera.rotation.x;
  if (t >= 1) camera.rotation.set(b.pitch, b.yaw, 0, 'YXZ'), look.yaw = b.yaw, look.pitch = b.pitch;
}

function setTargets(step) {
  const show = new Set(step.show), hl = new Set(step.highlight ?? []), dim = new Set(step.dim ?? []);
  // context opacities: the body and skull stay ghostly once we are inside the head
  const ctx = { body: step.focus === 'body' ? 1 : 0, face: 0.2, cup: 1, cavity: 0.3, airway: 0.55, nose: 0.6, skull: step.focus === 'body' ? 1 : 0.12, brain: 0.16, pathway: 0.9, ethmoid: 0.35, cribriform: 0.9, mouth: 1, zoom: 1, headset: 1, base: 1, pipeA: 1, pipeB: 1, pipeC: 1, pipeD: 1, pipeM: 1, pipeMB: 1, pipeL: 1, pipeW: 1, pipeG: 1, pipeH: 1, pipeX: 1 };
  if (step.id === 'headset' || step.id.startsWith('pipeline')) Object.assign(ctx, { body: 1, face: 1 });   // the whole man again
  if (PIPE_STYLES.length > 2 && show.delete('pipeC')) show.add('pipe' + PIPE_STYLE);   // ?blocks=A or D: that prototype instead of C
  if (step.cut) Object.assign(ctx, { face: 1, cavity: 1, nose: 1, skull: 1, brain: 1, ethmoid: 0 });   // the cut view is a drawing: a few bones, the brain cut too
  const uncut = (m) => step.cut && (([...(role.skull ?? []), ...(role.nose ?? [])].includes(m) && (!m.userData.cutHit || !CUT_BONES.test(nameOf(m))))
    || /low-poly|eyebrow|eyelash/.test(m.name));   // (the eyes sit behind the drawn skull floor)
  for (const m of meshes.values()) m.userData.target = 0;
  for (const r of [...role.epithelium, ...role.piriform]) r.userData.target = 0;
  for (const r of ROLE_LIST) if (show.has(r)) for (const m of role[r] ?? []) m.userData.target = uncut(m) ? 0 : ctx[r];
  // the dressed person is opaque: nothing inside him shows until he fades
  if (step.focus === 'body') for (const r of ROLE_LIST) if (!['body', 'face', 'cup'].includes(r)) for (const m of role[r] ?? []) if (!role.body.includes(m)) m.userData.target = 0;
  for (const m of meshes.values()) m.material.color.copy(m.userData.base), m.userData.emis ? m.material.emissive.copy(m.userData.emis) : m.material.emissive?.set(0);
  for (const k of hl) for (const m of role[k] ?? []) {
    m.userData.target = 1;
    if (!m.userData.schematic) { m.material.emissive.set(0xffa040); m.material.emissiveIntensity = 0.35; }
  }
  // the epithelium patch only makes sense while we are at the nose
  if (!['nose', 'cribriform', 'dive'].includes(step.focus)) for (const m of role.epithelium) m.userData.target = 0;   // (the cut draws the nerves instead)
  // and the piriform marker only once the signal has reached the brain
  if (!['brain'].includes(step.focus)) for (const m of role.piriform) m.userData.target = 0;
  for (const k of dim) for (const m of role[k] ?? []) { m.userData.target = 0.5; m.material.emissive.set(0x4060a0); m.material.emissiveIntensity = 0.4; }
}
// A step change: from step `prev` (null at the start). Every transition has a reverse that retraces
// it: the glides are symmetric, the camera arcs out on the same side both ways, and the dive into the
// nose plays its own timeline backward.
function apply(step, prev = null) {
  const i = STEPS.steps.indexOf(step), from = prev === null ? null : STEPS.steps[prev];
  stream.target = step.stream ? 1 : 0; cupLift.target = step.stream ? 1 : 0;
  cutState.target = step.cut ? CUT_X : CUT_PARK; cutStroke.target = step.cut && step.focus !== 'zoom' ? 1 : 0; cupLift.neck = !!(step.stream || step.cut);
  showSources = false; setPanel(step); setLabels(step); setAnim(step); setInset(step.inset);
  if (step.scene) labels.clear();   // the room has its own labels
  $('t').textContent = step.title; $('x').textContent = step.text; $('q').textContent = (step.quotes ?? []).map((q) => '“' + q + '”').join(' ');
  $('s').textContent = (step.src ?? []).map((k) => srcOf(k).full).join(' — ');
  camTween.t = 1;
  if (EXIT.active && ((step.cut && prev === i - 1) || (step.scene && prev === i + 1))) { EXIT.dir = step.cut ? 1 : -1; EXIT.last = performance.now() / 1000; return; }   // turned round mid-way
  if (OUT.active && ((step.id === 'headset' && prev === i - 1) || (step.id === 'bulb' && prev === i + 1))) { OUT.dir = step.id === 'headset' ? 1 : -1; OUT.last = performance.now() / 1000; return; }
  if (OUT.active) outCancel();
  if (step.id === 'headset' && from?.id === 'bulb') { if (DIVE.active) diveCancel(); outStart(1); return; }   // down, out of the nose, and back to his head
  if (step.id === 'bulb' && from?.id === 'headset') { outStart(-1); return; }
  if (EXIT.active) exitCancel();
  if (step.cut && from?.scene && prev === i - 1 && !DIVE.active) { exitStart(1); return; }       // out of the room by cutting the head open
  if (step.scene && from?.cut && prev === i + 1) { if (DIVE.active) diveCancel(); exitStart(-1); return; }   // and back in
  if (step.scene && prev === i - 1) { if (DIVE.active) DIVE.dir = 1; else diveStart(1); return; }     // into the nose
  if (from?.scene && prev === i + 1 && i === OUTSIDE) { if (DIVE.active) DIVE.dir = -1; else diveStart(-1); return; }   // back out
  if (DIVE.active) diveCancel();
  if (step.scene) {                                  // into the room from elsewhere (the next step): zoom down onto the roof
    roomEntry();
    camTween.from = curPose(); camTween.to = shotFor(step); camTween.t = 0; camTween.t0 = performance.now() / 1000; camTween.dur = 1.8;
    camTween.arc = arcFor(prev, i);
    setTargets(step);                                // the anatomy goes as you zoom in; the cavity and room come at the half
    return;
  }
  const crossing = !!step.inside !== !!from?.inside, before = crossing ? new Map([...meshes.values()].map((m) => [m, m.userData.target])) : null;
  setTargets(step);
  if (from?.scene) { micro_.target = 0; headlamp.intensity = 0; scene.fog = null; }
  if (!step.scene) { micro_.target = 0; scene.fog = null; }   // an ordinary glide never shows the room
  // Move the turning pivot to the new focus point without a jump, then glide: position, a zoom that
  // grows by a constant factor per second, and the turn.
  const F = FOCUS[step.focus] ?? FOCUS.body;
  // the zoom turns about its pivot: normally the new focus point; out of the goggles, the point inside them we
  // leave from, so the way out retraces the way in (the end placement is corrected for that pivot)
  const P = crossing && !step.inside ? (FOCUS[from.focus] ?? F).at : F.at, qTo = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, F.yaw ?? 0, 0));
  rebase(P);
  place.from = { pos: stage.position.clone(), scale: stage.scale.x, q: spin.quaternion.clone() };
  place.to = { ...placementFor(step.focus), q: qTo };
  if (P !== F.at) place.to.pos.sub(F.at.clone().sub(P).applyQuaternion(qTo).add(P).sub(F.at).multiplyScalar(place.to.scale));
  place.dur = from?.scene ? 1.6 : 1.4; place.t = 0; place.t0 = performance.now() / 1000; place.mode = 'glide'; place.onHalf = null;
  if (crossing) {                                    // into or out of his goggles: what goes away waits until half way (what comes, comes now:
    // going in, the board is inside the visor, hidden by the headset; going out, he is round you as you leave)
    const want = new Map(); for (const [m, t] of before) if (m.userData.target < t) { want.set(m, m.userData.target); m.userData.target = t; }
    place.dur = 2.2; place.onHalf = () => { for (const [m, t] of want) m.userData.target = t; };
  }
  goToShot(step, crossing ? 0 : arcFor(prev, i)); if (crossing) camTween.dur = place.dur;   // in and out of the goggles: straight, in step with the zoom
}
function go(d) { if (idx + d >= STEPS.steps.length) { host.end(); return; } const prev = idx; idx = Math.max(0, Math.min(STEPS.steps.length - 1, idx + d)); if (idx !== prev) apply(STEPS.steps[idx], prev); }
$('next').onclick = () => go(1); $('prev').onclick = () => go(-1);
const toggleText = () => { const on = $('ui').classList.toggle('open'); $('more').textContent = on ? 'text ▴' : 'text ▾'; try { localStorage.setItem('smell-text', on ? '1' : ''); } catch {} };
$('more').onclick = toggleText;
try { if (localStorage.getItem('smell-text')) toggleText(); } catch {}
addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 't') toggleText(); if (e.key.toLowerCase() === 's') toggleSources(); }, { signal });
const toggleSources = () => { showSources = !showSources; setPanel(STEPS.steps[idx]); };
// ← → are routed by the page (input.next / input.back)

// desktop, like a first-person game: click the view to capture the mouse, then moving it turns your
// head (Esc lets the mouse go). Right-drag (or Shift+drag) turns the model.
// Free view: I/K forward/back, J/L left/right, ; up, / down (Shift = faster), R back to the start.
let drag = null;
const cv = renderer.domElement;
cv.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
cv.addEventListener('pointerdown', (e) => {
  if (e.button === 2 || e.shiftKey) { drag = { x: e.clientX, y: e.clientY }; return; }
  if (e.button === 0 && document.pointerLockElement !== cv && !renderer.xr.isPresenting) cv.requestPointerLock?.();
}, { signal });
addEventListener('pointerup', () => drag = null, { signal });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === cv) {
    camTween.t = 1; DIVE.camFree = true;
    look.yaw -= e.movementX * 0.0022; look.pitch = Math.max(-1.5, Math.min(1.5, look.pitch - e.movementY * 0.0022));
    camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
  } else if (drag) {
    spin.rotation.y += (e.clientX - drag.x) * 0.01; spin.rotation.x += (e.clientY - drag.y) * 0.01;
    drag.x = e.clientX; drag.y = e.clientY;
  }
}, { signal });
const hint = Object.assign(document.createElement('div'), { textContent: 'click the view to look around with the mouse · Esc to let go' });
Object.assign(hint.style, { position: 'fixed', left: '50%', bottom: '14px', transform: 'translateX(-50%)', font: '13px system-ui', color: '#aab', background: 'rgba(0,0,0,.55)', padding: '5px 12px', borderRadius: '6px', pointerEvents: 'none' });
root.append(hint);
document.addEventListener('pointerlockchange', () => {
  const on = document.pointerLockElement === cv;
  hint.textContent = on ? '+' : 'click the view to look around with the mouse · Esc to let go';
  Object.assign(hint.style, on ? { left: '50%', top: '50%', bottom: 'auto', transform: 'translate(-50%,-50%)', background: 'none', font: '20px system-ui', color: 'rgba(255,255,255,.6)' }
    : { top: 'auto', bottom: '14px', transform: 'translateX(-50%)', background: 'rgba(0,0,0,.55)', font: '13px system-ui', color: '#aab' });
}, { signal });
const held = new Set();
const FLY = { i: [0, 0, -1], k: [0, 0, 1], j: [-1, 0, 0], l: [1, 0, 0], ';': [0, 1, 0], '/': [0, -1, 0] };
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k in FLY) { held.add(k); e.preventDefault(); }
  if (k === 'r' && !DIVE.active) goToShot(STEPS.steps[idx]);
}, { signal });
addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()), { signal });
addEventListener('blur', () => held.clear(), { signal });
let fast = false;
addEventListener('keydown', (e) => fast = e.shiftKey, { signal }); addEventListener('keyup', (e) => fast = e.shiftKey, { signal });
const flyV = new THREE.Vector3(), yawQ = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
function fly(dt) {
  if (!held.size || renderer.xr.isPresenting) return;
  camTween.t = 1; DIVE.camFree = true;   // you took over
  flyV.set(0, 0, 0);
  for (const k of held) flyV.add(tmp.fromArray(FLY[k]));
  if (!flyV.lengthSq()) return;
  // horizontal moves follow where you face (yaw only), so looking down doesn't make I sink
  const v = flyV.y; flyV.y = 0; flyV.applyQuaternion(yawQ.setFromAxisAngle(UP, look.yaw)); flyV.y = v;
  camera.position.addScaledVector(flyV.normalize(), (fast ? 2.4 : 0.6) * dt);
}

// ---------- XR: the page owns the session and the controllers (A / B: next / back, the
// right stick turns the model: input.turn)
const turnModel = (dx, dy) => { spin.rotation.y += dx; spin.rotation.x += dy; };

// ---------- loop
const camPos = new THREE.Vector3(), camQ = new THREE.Quaternion(), tmp = new THREE.Vector3();
function frame(raw, dt, time) {
  const fdt = Math.min(raw, 0.3);   // fdt: fades keep wall-clock pace when frames drop
  faceTick(raw); fly(dt); camTick(dt);
  // placement tween (ease in-out over ~1.2 s)
  if (place.mode === 'dive') diveTick();
  else if (place.mode === 'exit') exitTick();
  else if (place.mode === 'out') outTick();
  else if (place.to && place.t < 1) {
    place.t = Math.min(1, (performance.now() / 1000 - place.t0) / place.dur); const e = place.t < 0.5 ? 2 * place.t * place.t : 1 - (-2 * place.t + 2) ** 2 / 2;
    const a = place.from, b = place.to, at = spin.position, sc = a.scale * (b.scale / a.scale) ** e;
    // the focus point travels in a straight line while the zoom is geometric: a steady fly-in
    const w = a.pos.clone().addScaledVector(at, a.scale).lerp(b.pos.clone().addScaledVector(at, b.scale), e);
    stage.position.copy(w.addScaledVector(at, -sc)); stage.scale.setScalar(sc);
    spin.quaternion.slerpQuaternions(a.q, b.q, e);
    if (place.onHalf && place.t > 0.5) { place.onHalf(); place.onHalf = null; }
  }
  microTick(fdt, time);
  // opacity fades (~0.8 s)
  const fade = (m) => { const u = m.userData; u.op += (u.target - u.op) * Math.min(1, fdt * (u.rate ?? 4)); m.material.opacity = u.op * (u.max ?? 1); m.visible = u.op > 0.02; m.material.depthWrite = u.op > 0.95 && !u.glass; };
  meshes.forEach(fade); [...role.epithelium, ...role.piriform].forEach(fade);
  cutTick(fdt); cupTick(fdt); steamTick(time); streamTick(fdt, time); zoomTick(time);
  // pulses
  for (const p of paths) for (const d of p.dots) d.position.copy(p.curve.getPointAt((time * 0.35 + d.userData.phase) % 1));
  // panel to the right of the model, labels around it, inset to the left: all face the viewer
  camera.getWorldPosition(camPos); camera.getWorldQuaternion(camQ);
  const centre = STEPS.steps[idx].scene ? tmp.set(0.55, eyeH - 0.2, -1.4)    // in the room: ahead, lower right
    : tmp.set(0, place.to?.pos ? (STEPS.steps[idx].focus === 'body' ? 1.1 : eyeH - 0.1) : 1.2, -((FOCUS[STEPS.steps[idx].focus] ?? FOCUS.body).dist));
  const po = STEPS.steps[idx].panel ?? [0.5, 0.05];   // steps.json `panel`: [right, up] from the focus, in metres
  // in VR a board far away (steps.json `panelNear`: [right, below your eyes, ahead, width], metres) gets its text
  // close, low like notes on a lectern: readable at a glance down, and under the board, not over it
  const near = renderer.xr.isPresenting && STEPS.steps[idx].panelNear, PW = near ? near[3] : panel.userData.W;
  if (near) panel.position.set(near[0], eyeH - near[1], -near[2]); else panel.position.set(centre.x + po[0], centre.y + po[1], centre.z + 0.1);
  if (PW) panel.scale.set(PW, PW * panel.userData.aspect, 1);
  panel.lookAt(camPos);
  panel.visible = faceHold <= 0 && !DIVE.active && !EXIT.active && !OUT.active && (!STEPS.steps[idx].scene || DIVE.done);   // no text in your face during the dive
  // (and none while the opening holds on his face: the panel has no text until the first step is applied)
  labels.visible = !DIVE.active && !EXIT.active && !OUT.active;
  inset.position.set(centre.x - 0.52, centre.y, centre.z + 0.1); inset.lookAt(camPos); insetTick(time); pipeTick(time); robotTick(time);
  labels.children.forEach((sp) => {
    if (!sp.userData.anchor) return;
    const a = A[sp.userData.anchor]; if (!a) return;
    const w = a.clone().applyMatrix4(anat.matrixWorld);
    const i = sp.userData.slot, side = i % 2 ? -1 : 1;
    sp.position.set(w.x + side * 0.17, w.y + 0.06 + Math.floor(i / 2) * 0.06, w.z + 0.05); sp.lookAt(camPos);
    sp.userData.line.geometry.setFromPoints([sp.position.clone().add(new THREE.Vector3(-side * 0.1, 0, 0)), w]);
  });
}

// Coming from Sequence 1 (enter: 'face'): the first frame is the end of Sequence 1, his face filling
// the view (eyes 0.45 m ahead, at your eye height, straight on, on black); the first step then glides
// back out from it. In VR your head is first put back at the origin facing -z (the rig), as on this
// page alone, and the model is placed in front of it; on the desktop the camera is.
const FACE = 0.45;   // as far as Sequence 1 ends from his face (closer felt queasy in the headset)
function enterOnFace(xr, face) {
  const eyes = new THREE.Box3().setFromObject(meshes.get('(person) low-poly'));   // both eyes, in world
  const E = anat.worldToLocal(eyes.getCenter(new THREE.Vector3()));               // -> anatomy space
  if (xr) {
    const m = renderer.xr.getCamera().matrix, p = new THREE.Vector3(), q = new THREE.Quaternion();
    m.decompose(p, q, new THREE.Vector3());   // your head in the room (the pose, before any rig)
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q), yaw = Math.atan2(-f.x, -f.z);
    rig.rotation.set(0, -yaw, 0); rig.position.set(-p.x, 0, -p.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
    rig.updateMatrixWorld(true);
    // his eyes where Sequence 1 left them in your room, facing the same way (else straight ahead of you)
    const at = face ? rig.localToWorld(face.eyes.clone()) : new THREE.Vector3(0, p.y, -FACE);
    spin.quaternion.identity(); rebase(E); stage.scale.setScalar(1);
    if (face) spin.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), face.yaw - yaw);
    stage.position.copy(at).sub(E);   // the pivot is at E: E lands on `at` however he is turned
    eyeH = p.y || eyeH;
  } else {
    const P = placementFor('body'); rebase(E); spin.quaternion.identity(); stage.scale.setScalar(P.scale);
    stage.position.copy(P.pos);   // unturned, where the pivot is does not matter
    scene.updateMatrixWorld(true);
    const w = anat.localToWorld(E.clone());
    camera.position.set(w.x, w.y, w.z + FACE); camera.rotation.set(0, 0, 0, 'YXZ'); look.yaw = 0; look.pitch = 0;
  }
  // he is already there (the first step's look, without its fades); the pull back waits FACE_HOLD
  // seconds of frames, so the first frames, which can be slow, do not eat it
  idx = 0; setTargets(STEPS.steps[0]);
  for (const m of [...role.body, ...role.cup]) m.userData.op = m.userData.target;
  faceHold = FACE_HOLD;
}
const FACE_HOLD = 0.8;
let faceHold = 0;
function faceTick(raw) {
  if (faceHold <= 0) return;
  faceHold -= Math.min(raw, 0.1);
  if (faceHold > 0) return;
  apply(STEPS.steps[0]);
  place.dur = 3; camTween.dur = 3;   // a slow pull back
}

// compile every material once now, hidden parts included, so a step that shows new parts for the first
// time (the pipeline boards: hundreds of meshes) doesn't stall while the GPU compiles their shaders.
// Asynchronously: in the one-page talk this runs while Sequence 1 is still on screen (the headset's
// view must not freeze); this scene is not drawn until load() returns, so the parts can stay shown.
{ const hidden = []; scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine) && !o.visible) { o.visible = true; hidden.push(o); } });
  await renderer.compileAsync(scene, camera).catch((e) => console.warn('precompile:', e));
  for (const o of hidden) o.visible = false; }

return {
  // for the spectator view (../shared/host.js): which step, and a jump to one when it has drifted
  step: () => idx, jump: (i) => { const prev = idx; idx = i; apply(STEPS.steps[i], prev); },
  scene, camera, frame, ui: root,
  input: { next: () => { if (faceHold <= 0) go(1); }, back: () => { if (faceHold <= 0) go(-1); }, turn: turnModel, info: () => toggleSources() },
  // ?step=N (as the panel counts, 1 = first) or ?step=<id> opens that step directly; &blocks=A|B|C picks
  // the style of the pipeline blocks in the last step
  start({ enter, xr, face } = {}) {
    if (xr) camera.position.set(0, 0, 0);
    if (enter === 'face') return enterOnFace(!!xr, face);
    const q = params.get('step');
    if (q) { const n = Number(q); idx = Number.isFinite(n) ? n - 1 : STEPS.steps.findIndex((st) => st.id === q); idx = Math.max(0, Math.min(STEPS.steps.length - 1, idx)); }
    apply(STEPS.steps[idx]);
  },
  xr: {
    start() { hint.style.display = 'none'; document.exitPointerLock?.(); camera.position.set(0, 0, 0); },
    ready() { eyeH = camera.getWorldPosition(new THREE.Vector3()).y || 1.5; apply(STEPS.steps[idx]); },
    end() { hint.style.display = ''; camera.position.copy(DESK_EYE); rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); },
  },
  stop() { delete window.smell; },
};
}
