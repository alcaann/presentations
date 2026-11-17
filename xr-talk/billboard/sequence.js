// A, "the sign that grabs you" (plans/vision.md): a green billboard in a street, followed from the
// eye to meaning. Z-Anatomy meshes (CC BY-SA 4.0) from parts.json -> billboard.glb
// (xr-dev/export.sh billboard); steps, quotes and sources in steps.json; the street in
// ../shared/street.js, panels and VR input in ../shared/walkthrough.js.
// Areas the atlas has no mesh for (V4, visual word form area, mid-fusiform, right TPJ, ventral
// striatum, optic radiation) are markers, labelled "approximate"; how each is placed is written
// next to it below (by the published description, not by coordinates: the atlas is not in MNI space).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeStreet } from '../shared/street.js';
import { textCanvas, canvasPlane, setMap, ease } from '../shared/walkthrough.js';
const here = (f) => new URL(f, import.meta.url).href;   // files next to this module, whatever page loads it
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const CSS = `
  #ui { position: fixed; left: 10px; top: 10px; max-width: min(460px, calc(100vw - 20px)); max-height: calc(100vh - 20px); overflow: auto; background: #000b; padding: 10px 12px; border-radius: 8px; line-height: 1.5; }
  #ui h1 { font-size: 15px; margin: 0 0 4px; } #ui p { margin: 4px 0; }
  #ui .q { color: #9ab; font-style: italic; } #ui .src { color: #889; font-size: 12px; }
  #ui button { font: inherit; margin: 6px 4px 0 0; padding: 3px 10px; background: #333; color: #ddd; border: 1px solid #555; border-radius: 5px; cursor: pointer; }
`;
const UI = `<div id="ui"><h1 id="t">loading…</h1><p id="x"></p><p class="q" id="q"></p><p class="src" id="s"></p>
  <button id="prev">◀ back</button><button id="next">next ▶</button>
  <p class="src">VR: A / right trigger next · B / left trigger back · right stick turns you · left stick walks (first step, epilogue) or floats you around the model, grip returns · desktop: ← → steps, drag looks, ↑ ↓ walk / float, R returns · ?stats for frame rate</p></div>`;

// A sequence for shared/host.js (the contract is in plans/story.md): load() builds everything and
// returns the scene, camera and hooks; the page owns the renderer, the VR session and the loop
export async function load(host) {
const { renderer, signal } = host;
const root = document.createElement('div'); root.innerHTML = `<style>${CSS}</style>` + UI;
const $ = (id) => root.querySelector('#' + id);   // this sequence's own panel (ids are only unique within it)
const [STEPS, PARTS] = await Promise.all(['steps.json', 'parts.json'].map((f) => fetch(here(f)).then((r) => r.json())));

// ---------- camera, street
const scene = new THREE.Scene();
const SKY = new THREE.Color(0xa9c8e8), DARK = new THREE.Color(0x0b0d12);
scene.background = SKY.clone();
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.01, 200);
camera.position.set(0, 1.5, 0);
// the viewer's rig: walking in the street moves the rig, never the head pose itself
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
const street = makeStreet(THREE); scene.add(street.group);
const anatLight = new THREE.DirectionalLight(0xffffff, 1.2); anatLight.position.set(1, 2, 2); scene.add(anatLight);
// The street's sky light, taken out of the street so the number of lights never changes (a change
// recompiles every material, a stall mid-shot; an extra light, even dark, costs every pixel). Off
// while the street is hidden, as before. On the way out to Sequence 2 the two lights become its two
// (its sky light, and its sun from his front: he faces -z here), so his face looks the same on both
// sides of the cut.
const sky = street.light; scene.attach(sky);
const SKY_ST = { a: sky.color.clone(), b: sky.groundColor.clone(), i: 1.6 }, SKY_2 = { a: new THREE.Color(0xffffff), b: new THREE.Color(0x334455), i: 1.4 };
const SUN_ST = anatLight.position.clone(), SUN_2 = V(-1, 2, -2);

// ---------- the model: world <- stage (placement) <- spin (orientation) <- anatomy
const stage = new THREE.Group(), spin = new THREE.Group(), anat = new THREE.Group();
scene.add(stage); stage.add(spin); spin.add(anat);
const gltf = await new GLTFLoader().loadAsync(here('billboard.glb'));
anat.add(gltf.scene);
const meshes = new Map();
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  o.material = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7, transparent: true });
  o.userData.op = 0; o.userData.target = 0; o.visible = false;
  meshes.set(o.userData.za_name ?? o.name, o);
});
// "you": Juan's dressed MakeHuman man with a coffee (../smell/person.glb, CC0, made by
// smell/export_person.py), fitted so his nose tip sits on the atlas's: the anatomy is inside his head
const personGltf = await new GLTFLoader().loadAsync(here('../smell/person.glb'));
anat.add(personGltf.scene);
const person = [];
personGltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  const m = o.material; m.transparent = true;
  // hair, eyebrows, lashes: cut-out edges instead of blending (no dark sorting patches)
  if (m.map && m.alphaTest === 0 && /hair|eyebrow|eyelash|short/i.test(o.name + m.name)) { m.alphaTest = 0.4; m.depthWrite = true; }
  o.userData = { ...o.userData, base: m.color.clone(), op: 0, target: 0, person: true, ownEyes: o.name === 'low-poly' };
  o.visible = false; person.push(o);
});
const nameOf = (m) => m.userData.za_name ?? m.name;
const named = (ns) => ns.map((n) => meshes.get(n)).filter(Boolean);
const role = {};
for (const [k, v] of Object.entries({ ...PARTS.groups, ...PARTS.targets })) {
  role[k] = named(v);
  role[k + '_l'] = named(v.filter((n) => n.endsWith('.l')));
  role[k + '_r'] = named(v.filter((n) => n.endsWith('.r')));
}
for (const k of Object.keys(PARTS.targets)) if (!role[k].length) console.warn('no meshes for role', k);
const PAINT = [[/^(Sclera)/, 0xf4f1ea], [/^(Cornea|Anterior chamber)/, 0xcfe8ff], [/^Iris/, 0x4f7896], [/^Lens/, 0xe8f4ff],
  [/^Vitreous/, 0xbfd9ef], [/^Retina/, 0xf0a986]]   // a pale, peachy retina: no red cup when you are inside the eye;
for (const [k, c] of Object.entries({ head: 0xe3b49a, skull: 0xeee4cf, brain: 0xd8c2c6, pathway: 0xffd24d })) for (const m of role[k]) m.material.color.set(c);
for (const [n, m] of meshes) for (const [re, c] of PAINT) if (re.test(n)) m.material.color.set(c);
for (const m of meshes.values()) m.userData.base = m.material.color.clone();
// the eye is entered later: its walls must show from the inside too
for (const m of role.eye) m.material.side = THREE.DoubleSide;

gltf.scene.updateMatrixWorld(true);
const boxOf = (ms) => { const b = new THREE.Box3(); ms.forEach((m) => b.expandByObject(m)); return b; };
const cen = (ms) => boxOf(ms).getCenter(V());

// ---------- anchors (anatomy space, metres; +z = front, +y = up, +x = body's left, so .r is at -x)
const A = {};
for (const k of ['cornea', 'lens', 'retina', 'iris']) A[k] = cen(role[k + '_r']);
A.eye_r = cen(named(['Sclera.r'])); A.eye_l = cen(named(['Sclera.l']));
A.nerve_r = cen(role.optic_nerve_r); A.nerve_l = cen(role.optic_nerve_l); A.optic_nerve = A.nerve_r;
A.chiasm = cen(role.chiasm);
A.optic_tract_l = cen(role.optic_tract_l);
A.lgn_l = cen(role.lgn_l); A.lgn_r = cen(role.lgn_r); A.sc_l = cen(role.sc_l); A.sc = cen(role.sc);
for (const s of ['l', 'r']) {
  A['v1_' + s] = cen(named(['Calcarine sulcus.' + s]));
  A['it_' + s] = cen(role['it_' + s]);
  A['fusiform_' + s] = cen(role['fusiform_' + s]);
}
A.v1 = A.v1_l; A.it = A.it_l; A.fusiform = A.fusiform_l;
for (const k of ['amygdala', 'hippocampus', 'ofc', 'parahippocampal']) { A[k + '_l'] = cen(role[k + '_l']); A[k] = A[k + '_l']; }
A.ifg_r = cen(role.ifg_r);
const TEMPORAL_L = boxOf([...role.it_l, ...role.fusiform_l]);   // the underside of the left temporal lobe (cards in step 6)
A.head = cen([...role.head, ...role.skull]);
A.you = V(A.head.x, boxOf(role.head).max.y, A.head.z);
// splenium: the back end of the corpus callosum, where the right half's view crosses to the left (Cohen 2000)
{ const cc = boxOf(named(['Corpus callosum'])); A.splenium = V((cc.min.x + cc.max.x) / 2, cc.min.y + 0.35 * (cc.max.y - cc.min.y), cc.min.z + 0.006); }
// Markers placed by the published description, along each fusiform gyrus's front-back extent:
//  V4: "early visual processing ... in the inferior occipitotemporal region and presumably coincident
//      with area V4" (Cohen 2000) -> the back end (12 %) of the fusiform, both sides
//  visual word form area: "the middle portion of the left fusiform gyrus" (Cohen 2000) -> 45 %, left
//  mid-fusiform: in front of it, "preceding the traditional visual word form area" (Woolnough 2021) -> 60 %
function along(s, f) { const b = boxOf(role['fusiform_' + s]); return V((b.min.x + b.max.x) / 2, b.min.y + 0.35 * (b.max.y - b.min.y), b.min.z + f * (b.max.z - b.min.z)); }
A.v4_l = along('l', 0.12); A.v4_r = along('r', 0.12); A.v4 = A.v4_l;
A.vwfa = along('l', 0.45); A.midfus = along('l', 0.6);
//  ventral striatum: the nucleus accumbens, where the front of the caudate meets the putamen, underneath
{ const c = boxOf(named(['Caudate nucleus.l'])), p = boxOf(named(['Putamen.l']));
  A.striatum = V((c.max.x + p.min.x) / 2, Math.min(c.min.y, p.min.y) + 0.004, Math.min(c.max.z, p.max.z) - 0.004); }
//  right TPJ: between the supramarginal gyrus and the superior temporal gyrus (Corbetta & Shulman's "temporoparietal cortex")
A.tpj_r = cen(named(['Supramarginal gyrus.r'])).lerp(cen(named(['Superior temporal gyrus (Lateral part).r'])), 0.5);
//  optic radiation: no mesh; a drawn route from the LGN, out and back, to the calcarine sulcus
const RAD = [A.lgn_l, A.lgn_l.clone().add(V(0.012, 0.004, -0.02)), A.v1_l.clone().lerp(A.lgn_l, 0.45).add(V(0.012, 0.006, 0)), A.v1_l];
A.radiation = new THREE.CatmullRomCurve3(RAD).getPointAt(0.5);

const schem = new THREE.Group(); anat.add(schem);
const drawn = (m, color) => { m.visible = false; m.userData = { op: 0, target: 0, base: new THREE.Color(color), drawn: true }; schem.add(m); return m; };
const marker = (pos, color, r = 0.0035) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, transparent: true, opacity: 0 })); m.position.copy(pos); return drawn(m, color); };
role.v4_l = [marker(A.v4_l, 0x6fd3ff)]; role.v4_r = [marker(A.v4_r, 0x6fd3ff)]; role.v4 = [...role.v4_l, ...role.v4_r];
role.vwfa = [marker(A.vwfa, 0xffb347, 0.0045)]; role.midfus = [marker(A.midfus, 0xff7a45, 0.004)];
role.tpj_r = [marker(A.tpj_r, 0xc38bff, 0.006)]; role.striatum = [marker(A.striatum, 0x7be38f, 0.004)];
role.radiation = [drawn(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(RAD), 40, 0.0016, 8), new THREE.MeshStandardMaterial({ color: 0xffd24d, emissive: 0xffd24d, emissiveIntensity: 0.3, transparent: true, opacity: 0 })), 0xffd24d)];
role.you = []; role.person = person;
const SCHEM = schem.children;

// eyes turn about their own centres (saccade): each eye's meshes go under a pivot
const pivots = {};
for (const s of ['r', 'l']) {
  const p = new THREE.Group(); p.position.copy(A['eye_' + s]); anat.add(p); p.updateMatrixWorld(true);
  for (const m of role['eyeball_' + s]) p.attach(m);
  pivots[s] = p;
}

// ---------- "you" stands in the street for the whole walkthrough, at true size (the atlas is in
// metres, feet at y = 0), 1.6 m ahead of the spawn point and a little to the left, facing down the street
const STAND = { x: -0.55, dist: 1.6, yaw: Math.PI };
spin.position.copy(A.head); anat.position.copy(A.head).negate(); spin.rotation.set(0, STAND.yaw, 0);
stage.position.set(STAND.x - A.head.x, 0, -STAND.dist - A.head.z);
scene.updateMatrixWorld(true);
const W = (p) => anat.localToWorld(p.clone());   // anatomy point -> world
// where the billboard is, seen from "you", in anatomy space (for the eyes)
function billboardDir() {
  return street.billboard.centre.clone().sub(W(A.head)).normalize().applyQuaternion(spin.quaternion.clone().invert());
}
let eyeH = 1.5;

// ---------- the one take (from step 2 on). The world never moves or scales, the viewer does: the rig
// that carries your head flies, turns and shrinks (rig.scale), so the eye and the brain are entered
// at their true size. A step's shot is a list of keys { pos: where your head goes, look: what you
// face, s: your size (1 = normal), dur: seconds to get there, hold: seconds to stay there, person /
// street: fades that start with that key }, in world space. Going forward plays the whole shot,
// going back goes straight to the step's last key. Turning is rate-limited (comfort in the headset).
const hl = V(0, 1.5, 0);   // your head inside the rig, latched when a shot starts
const at = (p, x = 0, y = 0, z = 0) => W(p.clone().add(V(x, y, z)));   // anatomy point + offset (+x body's left, +y up, +z front)
const eyeMid = A.eye_r.clone().lerp(A.eye_l, 0.5), lgnMid = A.lgn_l.clone().lerp(A.lgn_r, 0.5);
const vent = A.v1_l.clone().lerp(A.it_l, 0.5), mean = A.amygdala_l.clone().lerp(A.ofc_l, 0.4);
const radMid = A.lgn_l.clone().lerp(A.v1_l, 0.5);
const V1VIEW = () => ({ pos: at(radMid, 0.09, 0.025, 0), look: W(A.lgn_l.clone().lerp(A.v1_l, 0.7)), s: 1 / 7 });
const SIDE = () => ({ pos: at(vent, 0.2, 0.02, 0), look: W(vent.clone().add(V(0, -0.015, 0))), s: 1 / 3.2 });
const OVER = () => ({ pos: at(A.head, 0, 0.075, -0.175), look: W(A.head.clone().add(V(0, -0.005, 0.03))), s: 1 / 3.2 });
const BB = () => street.billboard.centre.clone();
const shoulder = () => at(A.head, -0.3, 0.12, -0.6);   // over his right shoulder, looking where he looks
// the signal's route inside the head, eye to V1, each point with what you face there
const ROUTE = () => [
  { pos: at(A.cornea, 0, 0, 0.025), look: W(A.eye_r), s: 1 / 16, street: 0 },
  { pos: at(A.eye_r, 0, 0, 0.002), look: W(A.nerve_r), s: 1 / 30 },
  { pos: at(A.nerve_r, 0, 0.004, 0), look: W(A.chiasm), s: 1 / 30 },        // just above the nerve, not inside it
  { pos: at(A.chiasm, 0, 0.005, 0.004), look: W(A.optic_tract_l), s: 1 / 25 },
  { pos: at(A.optic_tract_l, 0, 0.004, 0), look: W(A.lgn_l), s: 1 / 25 },
  { pos: at(A.lgn_l, 0, 0.004, 0), look: W(RAD[2]), s: 1 / 25 },
  { pos: at(RAD[1], 0, 0.002, 0), look: W(RAD[2]), s: 1 / 25 },
  { pos: at(RAD[2], 0, 0.002, 0), look: W(A.v1_l), s: 1 / 25 },
];
const SHOTS = {
  // leaving the sequence (host: Proceed? -> yes): round to his front and up to his face, which fills the
  // view as the street goes dark; the next sequence opens on the same man's face. air: at your full
  // size but at his eye height, not standing on the street
  _exit: () => [
    { pos: at(A.head, -0.6, 0.04, 0.05), look: W(A.head), s: 1, dur: 2.5, air: true, person: 1 },
    // face to face at a comfortable distance (closer felt queasy in the headset), then the street goes
    { pos: at(eyeMid, 0, 0, 0.8), look: W(eyeMid), s: 1, dur: 2.5, air: true },
    { pos: at(eyeMid, 0, 0, 0.45), look: W(eyeMid), s: 1, dur: 2.5, air: true, street: 0 },
  ],
  street: () => [{ pos: V(0, hl.y, 0), look: V(0, hl.y, -10), s: 1, dur: 2.5, person: 1, street: 1 }],
  light: () => [
    // what reaches his eyes: the street from where he stands
    { pos: at(eyeMid, 0, 0, 0.08), look: BB(), s: 1, dur: 3, hold: 2.5, person: 1, street: 1 },
    // back out over his shoulder, then round to his right side and in on the right eye
    { pos: shoulder(), look: BB(), s: 1, dur: 3 },
    { pos: at(A.eye_r, -0.45, 0.03, 0.08), look: W(A.eye_r), s: 0.6, dur: 3, person: 0.15, street: 0.22 },
    { pos: at(A.eye_r, -0.095, 0, 0), look: W(A.eye_r), s: 1 / 6, dur: 2.5 },
  ],
  nerve: () => {
    const r = ROUTE();
    return [
      // round to the front of the eye, in through the pupil, out of the back along the optic nerve
      { pos: at(A.eye_r, -0.07, 0, 0.07), look: W(A.eye_r), s: 1 / 8, dur: 2 },
      { ...r[0], dur: 2, person: 0 }, { ...r[1], dur: 2 }, { ...r[2], dur: 2 },
      { pos: r[3].pos, look: W(lgnMid), s: 1 / 20, dur: 2 },
      // up into the brain behind and above the thalamus, looking down and forward: both eyes, the
      // crossing, both tracts and the thalamus in one view, body's left on your left
      { pos: at(lgnMid, 0, 0.04, -0.06), look: W(A.chiasm.clone().lerp(lgnMid, 0.3)), s: 1 / 14, dur: 3, street: 0 },
    ];
  },
  // turn to the left and back off to the side of the left hemisphere: thalamus, the optic radiation
  // fanning backwards, and V1 at the back, side by side
  v1: () => [{ ...V1VIEW(), dur: 3.5 }],
  capture: () => [
    // where V1 was seen from, turn to the signs (the street comes back), then back straight out to
    // behind his shoulder; as you start backing off he is there again, see-through, his brain showing
    { pos: V1VIEW().pos, look: BB(), s: 1 / 7, dur: 2.5, hold: 0.05, person: 0, street: 1 },   // the turn and the backing off are two moves
    { pos: at(A.head, -0.3, 0.12, -1.0), look: BB(), s: 1, dur: 4, person: 0.3, fast: true },
  ],
  object: () => [
    { pos: at(A.head, 0.05, 0.06, -0.5), look: W(A.head), s: 0.6, dur: 2, street: 0.22 },
    // the left hemisphere from the side, a little above: the stream runs from V1 (back) to IT (front),
    // with the three cards (what each stage responds to) just below the temporal lobe
    { ...SIDE(), dur: 2.5 },
  ],
  // from here to the end of the story one view: from behind and above, the whole brain
  word: () => [{ ...OVER(), dur: 3 }],
  meaning: () => [{ ...OVER(), dur: 1 }],
  recap: () => [{ ...OVER(), dur: 1 }],
  // the epilogue: back out of his head, which turns solid again, to stand behind him in the street
  familiar: () => {
    const end = at(A.head, -0.35, 0.12, -0.95);
    return [{ pos: OVER().pos.lerp(end, 0.4), look: W(A.head), s: 0.6, dur: 1.8 },
      { pos: end, look: W(A.head).lerp(BB(), 0.12), s: 1, dur: 2.5, person: 1, street: 1 }];
  },
};
const shot = { runs: [], i: 0, t: 0, active: false, last: null, fired: new Set(), yawLeft: 0 };
let viewPitch = 0;
const YAW_RATE = 1.4;   // rad/s
const runDur = (r) => r.hold ?? r.keys.reduce((b, k) => b + k.dur, 0);
const AIM = 0.16;       // you face a little right of the subject: it sits left of centre, the panel on the right
const pose = () => { const p = camera.getWorldPosition(V()), f = camera.getWorldDirection(V()); return { pos: p, look: p.clone().add(f), s: rig.scale.x }; };
function startShot(step, direct) {
  const make = SHOTS[step.id]; if (!make) { shot.active = false; return; }
  hl.copy(camera.position);
  let keys = make();
  if (direct) keys = [{ ...keys[keys.length - 1], dur: 2, hold: 0 }];
  // at normal size you stand on the street: your own eye height, never floating above it
  for (const k of keys) if (k.s === 1 && !k.air) k.pos.y = hl.y;
  // runs end at holds: each run eases in and out once and passes through its keys without stopping
  const runs = []; let cur = { keys: [] };
  for (const k of keys) { cur.keys.push(k); if (k.hold) { runs.push(cur, { hold: k.hold }); cur = { keys: [] }; } }
  if (cur.keys.length) runs.push(cur);
  Object.assign(shot, { runs, i: 0, t: 0, active: true, last: pose(), fired: new Set(), home: keys.at(-1).pos });
}
function setViewer(P, L, s, raw) {
  const d = L.clone().sub(P), h = Math.hypot(d.x, d.z);
  if (h > 1e-6) {
    let dy = Math.atan2(-d.x, -d.z) - (idx && !exiting ? AIM : 0) - rig.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const max = YAW_RATE * raw; rig.rotation.y += THREE.MathUtils.clamp(dy, -max, max); shot.yawLeft = Math.abs(dy) - max;
  }
  rig.scale.setScalar(s);
  rig.position.copy(P).sub(hl.clone().multiplyScalar(s).applyAxisAngle(V(0, 1, 0), rig.rotation.y));
  viewPitch = Math.atan2(d.y, h);
  if (!renderer.xr.isPresenting) camera.rotation.x = viewPitch;   // in the headset your head pitches
}
function fire(k) {
  if (shot.fired.has(k)) return; shot.fired.add(k);
  if (k.person != null) setPerson(k.person);
  if (k.street != null) streetTarget = k.street;
  if (k.fast) fadeBoost = 1;   // this key's fades are quick
}
function runShot(raw) {
  if (!shot.active) return;
  const r = shot.runs[shot.i];
  if (!r) {   // done: finish turning, then hand the view back to you
    setViewer(shot.last.pos, shot.last.look, shot.last.s, raw);
    if (shot.yawLeft <= 0.002) shot.active = false;
    return;
  }
  shot.t += raw;
  if (r.hold != null) { setViewer(shot.last.pos, shot.last.look, shot.last.s, raw); if (shot.t >= r.hold) { shot.i++; shot.t = 0; } return; }
  if (!r.pts) {
    const from = shot.last;
    r.pts = [from.pos, ...r.keys.map((k) => k.pos)]; r.looks = [from.look, ...r.keys.map((k) => k.look)];
    r.ss = [from.s, ...r.keys.map((k) => k.s)]; r.durs = r.keys.map((k) => k.dur); r.T = r.durs.reduce((a, b) => a + b, 0);
    r.curve = r.pts.length > 2 ? new THREE.CatmullRomCurve3(r.pts, false, 'centripetal') : null;
  }
  const u = ease(Math.min(1, shot.t / r.T)) * r.T;
  let seg = 0, acc = 0;
  while (seg < r.durs.length - 1 && acc + r.durs[seg] < u) { acc += r.durs[seg]; seg++; }
  const f = Math.min(1, (u - acc) / r.durs[seg]);
  for (let j = 0; j <= seg; j++) fire(r.keys[j]);   // fades start with their key
  const pos = r.curve ? r.curve.getPoint((seg + f) / (r.pts.length - 1)) : r.pts[0].clone().lerp(r.pts[1], f);
  const lk = r.looks[seg].clone().lerp(r.looks[seg + 1], f);
  const s = Math.exp(THREE.MathUtils.lerp(Math.log(r.ss[seg]), Math.log(r.ss[seg + 1]), f));
  setViewer(pos, lk, s, raw);
  if (shot.t >= r.T) { shot.last = { pos: r.pts.at(-1), look: r.looks.at(-1), s: r.ss.at(-1) }; shot.i++; shot.t = 0; }
}

// ---------- text panel: title, two lines of text, a time tag. Quotes and sources are one press away
// (X on the left controller, S on the keyboard), not on the panel itself.
const PANEL_W = 0.52;
// the panel draws above the part labels (12) so a label can never hide its text
const panel = canvasPlane(THREE, null, PANEL_W, 13); rig.add(panel);
let showSources = false;
function setPanel(step) {
  let lines;
  if (showSources) {
    lines = [{ text: 'Sources for this step', font: '600 54px system-ui', color: '#fff', lh: 70 }];
    for (const q of step.quotes ?? []) lines.push({ text: '“' + q + '”', font: 'italic 34px system-ui', color: '#9bc', lh: 46 });
    for (const k of step.src ?? []) lines.push({ text: STEPS.sources[k]?.full ?? k, font: '28px system-ui', color: '#aab3c2', lh: 38 });
    lines.push({ text: 'X / S: back to the step', font: '28px system-ui', color: '#667', lh: 38 });
  } else {
    lines = [{ text: step.title, font: '600 64px system-ui', color: '#fff', lh: 80 }, { text: step.text, font: '46px system-ui', color: '#e4e8f0', lh: 60 }];
    if (step.time) lines.push({ text: '⏱ ' + step.time, font: '600 38px system-ui', color: '#ffd88a', lh: 52 });
    lines.push({ text: `${idx + 1} / ${STEPS.steps.length}` + (step.src?.length ? '   ·   X / S: sources' : ''), font: '28px system-ui', color: '#667', lh: 38 });
  }
  setMap(THREE, panel, textCanvas(lines, 1100, 40), PANEL_W);
}
const toggleSources = () => { showSources = !showSources; setPanel(STEPS.steps[idx]); };

// ---------- labels with leader lines
const labels = new THREE.Group(); scene.add(labels);
const LABEL = {
  you: 'You', cornea: 'Cornea', lens: 'Lens', retina: 'Retina', iris: 'Iris', optic_nerve: 'Optic nerve', chiasm: 'Optic chiasm',
  optic_tract_l: 'Optic tract (left)', lgn_l: 'Lateral geniculate body (thalamus)', sc_l: 'Superior colliculus', sc: 'Superior colliculus (midbrain)',
  radiation: 'Optic radiation', v1_l: 'Primary visual cortex, V1', v1: 'Primary visual cortex, V1 (both sides)',
  tpj_r: 'Right temporoparietal junction (approximate)', ifg_r: 'Right inferior frontal gyrus', v4: 'V4 (approximate)',
  fusiform: 'Fusiform gyrus', it: 'Inferior temporal cortex', vwfa: 'Visual word form area (approximate)', midfus: 'Mid-fusiform (approximate)',
  amygdala: 'Amygdala', hippocampus: 'Hippocampus', ofc: 'Orbitofrontal cortex', striatum: 'Ventral striatum (approximate)',
  parahippocampal: 'Parahippocampal gyrus',
};
function setLabels(step) {
  labels.clear();
  (step.labels ?? [...(step.highlight ?? []), ...(step.dim ?? [])]).forEach((k, i) => {
    if (!A[k]) return;
    // the tag is as wide as its text (same text size as a 900 px / 0.22 m tag)
    const font = '600 40px system-ui', g = document.createElement('canvas').getContext('2d'); g.font = font;
    const w = Math.ceil(g.measureText(LABEL[k] ?? k).width) + 2 * 18 + 4;
    const sp = canvasPlane(THREE, textCanvas([{ text: LABEL[k] ?? k, font, color: step.dim?.includes(k) ? '#99a' : '#ffd88a', lh: 50 }], w, 18), 0.22 * w / 900, 12);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V()]), new THREE.LineBasicMaterial({ color: 0xffd88a, depthTest: false }));
    line.renderOrder = 12; sp.userData = { anchor: k, slot: i, line }; labels.add(sp, line);
  });
}

// ---------- signals along anatomy routes
const pulses = new THREE.Group(); anat.add(pulses);
let paths = [];
function route(a, b) {
  if (a.startsWith('eye_') && b === 'chiasm') { const s = a.slice(4); return [A['eye_' + s].clone().add(V(0, 0, -0.011)), A['nerve_' + s], A.chiasm]; }
  if (a === 'chiasm' && b === 'lgn_l') return [A.chiasm, A.optic_tract_l, A.lgn_l];
  // the branch to the superior colliculus leaves the tract before the LGN and passes beside it
  // (inside it, towards the midline), not through it
  if (a === 'chiasm' && b === 'sc_l') { const by = A.lgn_l.clone().lerp(A.sc_l, 0.5).add(V(-0.004, 0.004, 0)); return [A.chiasm, A.optic_tract_l, by, A.sc_l]; }
  if (a === 'lgn_l' && b === 'radiation') return RAD.slice(0, 2);
  if (a === 'radiation' && b === 'v1_l') return RAD.slice(1);
  return [A[a], A[b]];
}
function setAnim(step) {
  pulses.clear(); paths = [];
  const a = step.anim ?? '';
  if (a === 'rays') {
    // light from the billboard's direction through cornea and lens onto the retina: up and to the
    // right in the world lands low and on the nose side (+x for the right eye), inverted and reversed
    const c = A.eye_r, dir = billboardDir(), hit = c.clone().add(V(0.0075, -0.0045, -0.008));
    for (const off of [-0.002, 0, 0.002]) paths.push({ pts: [c.clone().addScaledVector(dir, 0.05).add(V(0, off, 0)), A.cornea.clone().add(V(0, off, 0)), A.lens, hit], color: 0xfff3b0, n: 5, size: 0.0007, speed: 0.5 });
  }
  if (a.startsWith('pulse:')) for (const chain of a.slice(6).split(';')) {
    const hops = chain.split('>');
    for (let h = 0; h < hops.length - 1; h++) for (const dst of hops[h + 1].split(',')) {
      for (const src of hops[h] === 'eyes' ? ['eye_r', 'eye_l'] : [hops[h]]) {
        const pts = route(src, dst);
        if (pts.every(Boolean)) paths.push({ pts, color: 0xffb347, n: 5, size: 0.0016, speed: 0.4 });
        else console.warn('no route', src, dst);
      }
    }
  }
  for (const p of paths) {
    p.curve = new THREE.CatmullRomCurve3(p.pts.map((v) => v.clone()));
    p.dots = Array.from({ length: p.n }, (_, i) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(p.size, 10, 8), new THREE.MeshBasicMaterial({ color: p.color, depthTest: false }));
      d.renderOrder = 9; d.userData.phase = i / p.n; pulses.add(d); return d;
    });
  }
}

// ---------- "What is it?": what each stage of the ventral stream responds to, drawn from the billboard
// itself. Kravitz 2013: orientation selectivity in V1, "more complex stimuli (angles)" in V2,
// "successively more complex representations" up to objects in inferior temporal cortex.
const cards = new THREE.Group(); anat.add(cards); cards.visible = false;
{
  const src = street.billboard.mesh.material.map.image, SW = 256, SH = 128;
  // edges: a plain gradient filter on the billboard's own picture
  const small = document.createElement('canvas'); small.width = SW; small.height = SH;
  const sg = small.getContext('2d'); sg.drawImage(src, 0, 0, SW, SH);
  const px = sg.getImageData(0, 0, SW, SH).data, lum = (x, y) => { const i = (y * SW + x) * 4; return 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]; };
  const edges = document.createElement('canvas'); edges.width = SW; edges.height = SH;
  const eg = edges.getContext('2d'), out = eg.createImageData(SW, SH);
  for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
    const gx = lum(x + 1, y) - lum(x - 1, y), gy = lum(x, y + 1) - lum(x, y - 1), on = Math.hypot(gx, gy) > 60, i = (y * SW + x) * 4;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = 235; out.data[i + 3] = on ? 255 : 0;
  }
  eg.putImageData(out, 0, 0);
  const card = (title, draw) => {
    const c = document.createElement('canvas'); c.width = 520; c.height = 340; const g = c.getContext('2d');
    g.fillStyle = 'rgba(12,16,24,0.92)'; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 24); g.fill();
    g.fillStyle = '#ffd88a'; g.font = '600 34px system-ui, sans-serif'; g.fillText(title, 22, 48);
    draw(g, 20, 72, 480, 240); return c;
  };
  // the corners of the billboard, its bottom band and the bottle (where two edges meet at an angle)
  const ANGLES = [[0, 0, 1, 1], [1024, 0, -1, 1], [0, 512, 1, -1], [1024, 512, -1, -1], [0, 442, 1, -1], [1024, 442, -1, -1],
    [105, 90, 1, 1], [155, 90, -1, 1], [70, 440, 1, -1], [190, 440, -1, -1]];
  // a row under the left temporal lobe, back (V1) to front (IT), towards you (you look from the left, below)
  const tb = TEMPORAL_L, y = tb.min.y - 0.022, x = tb.max.x + 0.03, z0 = A.v1_l.z, z1 = tb.max.z - 0.01;
  const C = [
    { at: V(x, y, z0), c: card('V1: short edges', (g, x, y, w, h) => g.drawImage(edges, x, y, w, h)) },
    { at: V(x, y, (z0 + z1) / 2), c: card('Further on: angles', (g, x, y, w, h) => {
      g.globalAlpha = 0.3; g.drawImage(edges, x, y, w, h); g.globalAlpha = 1; g.strokeStyle = '#ffd88a'; g.lineWidth = 5;
      for (const [ax, ay, dx, dy] of ANGLES) { const X = x + ax / 1024 * w, Y = y + ay / 512 * h; g.beginPath(); g.moveTo(X + dx * 26, Y); g.lineTo(X, Y); g.lineTo(X, Y + dy * 26); g.stroke(); }
    }) },
    { at: V(x, y, z1), c: card('Inferior temporal: a sign', (g, x, y, w, h) => g.drawImage(src, x, y, w, h)) },
  ];
  for (const { at: p, c } of C) { const m = canvasPlane(THREE, c, Math.min(0.034, (z1 - z0) / 2.3), 11); m.position.copy(p); cards.add(m); }
}

// ---------- the eye-jump step: what stands out. A glowing frame behind the billboard, faint ones behind the shop signs
const frames = { userData: { list: [] } };
{
  const frame = (mesh, w, h, z, op) => {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: op, depthWrite: false }));
    f.position.z = z; f.userData.op = op; mesh.add(f); frames.userData.list.push(f);
  };
  frame(street.billboard.mesh, 4.2 + 0.5, 2.1 + 0.5, -0.03, 0.85);
  for (const s of street.signs.values()) frame(s.mesh, 1.3 + 0.24, 0.48 + 0.24, -0.04, 0.3);
}
let framesOn = false;
const setFrames = (on) => { framesOn = on; for (const f of frames.userData.list) f.visible = on; };
setFrames(false);

// ---------- steps
let idx = 0, gaze = 'ahead', gazeDelay = 0, streetOp = 1, streetTarget = 1, fadeBoost = 0, personLevel = 1;
// inside the head (the route steps) the brain is thinner: its many see-through layers otherwise fog the view
const OPACITY = (f) => ({ head: f === 'street' ? 0.3 : 0, skull: f === 'street' ? 0.12 : 0.05, eye: 0.85, pathway: 0.9, brain: f === 'street' ? 0.25 : f === 'pathway' ? 0.04 : 0.14 });
const INSIDE = ['skull', 'brain', 'pathway', 'eye'];
// the person: opaque, or see-through (< 1) with his own painted eyes hidden so the real eyeballs show;
// while he is opaque nothing inside him shows
function setPerson(level) {
  personLevel = level;
  for (const m of person) m.userData.target = m.userData.ownEyes && level < 1 ? 0 : level;
  for (const r of INSIDE) for (const m of role[r]) m.userData.target = level >= 1 ? 0 : m.userData.want;
}
function apply(step, how) {
  const show = new Set(step.show ?? []), hl_ = new Set(step.highlight ?? []), dim = new Set(step.dim ?? []);
  const op = OPACITY(step.focus), closeUp = step.focus === 'eye';
  for (const m of meshes.values()) { m.userData.target = 0; m.material.color.copy(m.userData.base); m.material.emissive.set(0); }
  for (const m of SCHEM) m.userData.target = 0;
  for (const r of INSIDE) if (show.has(r)) for (const m of role[r]) m.userData.target = op[r];
  for (const m of meshes.values()) {
    const n = nameOf(m);
    if (m.userData.target && /^(Vitreous body|Anterior chamber|Cornea)/.test(n)) m.userData.target = Math.min(m.userData.target, 0.35);
    // the eye stays soft: a ghostly white, a pale retina (no staring white ball, no red cup)
    if (/^Sclera/.test(n)) m.userData.target = Math.min(m.userData.target, closeUp ? 0.15 : 0.25);
    if (/^Retina/.test(n)) m.userData.target = Math.min(m.userData.target, 0.45);
    if (closeUp && n.endsWith('.l')) m.userData.target = 0;
  }
  for (const k of hl_) for (const m of role[k] ?? []) {
    if (closeUp && nameOf(m).endsWith('.l')) continue;
    const soft = /^(Retina|Sclera)/.test(nameOf(m));   // shells around the eye: see-through, so the light path shows
    m.userData.target = soft ? 0.45 : 1;
    if (!m.userData.drawn && !soft) { m.material.emissive.set(0xffa040); m.material.emissiveIntensity = closeUp ? 0.15 : 0.4; }
  }
  for (const k of dim) for (const m of role[k] ?? []) { m.userData.target = 0.5; m.material.emissive?.set(0x4060a0); m.material.emissiveIntensity = 0.4; }
  for (const r of INSIDE) for (const m of role[r]) m.userData.want = m.userData.target;
  // a shot played forwards fades him and the street itself, at its keys; until then they stay as they are
  const keyed = how === 'next' ? (SHOTS[step.id]?.() ?? []) : [];
  setPerson(keyed.some((k) => k.person != null) ? personLevel : show.has('person') ? (step.person ?? 1) : 0);
  // deep inside the head the street (at its true, now enormous size) would only get in the way
  if (!keyed.some((k) => k.street != null)) streetTarget = step.focus === 'street' ? 1 : step.focus === 'pathway' ? 0 : 0.22;
  cards.visible = !!step.cards; setFrames(step.signs === 'salience');
  showSources = false;
  setPanel(step); setLabels(step); setAnim(step);
  if (how) startShot(step, how === 'back');
  gaze = step.gaze ?? 'ahead';
  // the eyes jump once the camera has arrived
  gazeDelay = gaze === 'saccade' ? (shot.active ? shot.runs.reduce((a, r) => a + runDur(r), 0) : 0) + 0.6 : 0;
  $('t').textContent = step.title; $('x').textContent = step.text;
  $('q').textContent = (step.quotes ?? []).map((q) => '“' + q + '”').join(' ');
  $('s').textContent = (step.src ?? []).map((k) => STEPS.sources[k]?.full ?? k).join(' — ');
}
function go(d) { if (idx + d >= STEPS.steps.length) { host.end(); return; } const j = Math.max(0, idx + d); if (j === idx) return; idx = j; apply(STEPS.steps[idx], d > 0 ? 'next' : 'back'); }
$('next').onclick = () => go(1); $('prev').onclick = () => go(-1);
addEventListener('keydown', (e) => { if (e.key === 's') toggleSources(); }, { signal });   // ← → are routed by the page
let drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => drag = { x: e.clientX, y: e.clientY }, { signal });
addEventListener('pointerup', () => drag = null, { signal });
addEventListener('pointermove', (e) => { if (!drag || shot.active) return; look((e.clientX - drag.x) * 0.005, (e.clientY - drag.y) * 0.005); drag = { x: e.clientX, y: e.clientY }; }, { signal });
// first-person controls: right stick (VR) or drag (desktop) turns you, always (not while the camera
// is moving); in the first step and the epilogue the left stick (VR) or ↑ ↓ (desktop) also walks, the way you face
const WALK = 1.6, fwd = V(), side = V(), headA = V(), headB = V();
function look(dyaw, dpitch) {
  // yaw turns the rig about your head, so turning never slides you sideways
  camera.getWorldPosition(headA); rig.rotation.y += dyaw; rig.updateMatrixWorld(true);
  camera.getWorldPosition(headB); rig.position.sub(headB).add(headA);
  // pitch only on the desktop: in the headset your head does that
  if (!renderer.xr.isPresenting) camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x + dpitch, -1.2, 1.2);
}
const stickTurn = (dy) => { if (!shot.active) look(-dy, 0); };
// in the steps in between, once the camera has stopped, the left stick (↑ ↓) floats you the way you
// look, at a speed that suits your size, and only so far from the step's view (LEASH metres as you
// see them); grip or a stick click (R on the desktop) glides you back to it
const FLOAT = 0.6, LEASH = 1.2, offset = V();
function move(sx, sy, dt) {
  if (shot.active) return;
  if (idx !== 0 && !STEPS.steps[idx].epilogue) {
    const s = rig.scale.x;
    camera.getWorldDirection(fwd); side.set(-fwd.z, 0, fwd.x).normalize();
    rig.position.addScaledVector(fwd, sy * FLOAT * s * dt).addScaledVector(side, sx * FLOAT * s * dt);
    if (!shot.home) return;
    camera.getWorldPosition(headA); offset.copy(headA).sub(shot.home);
    const over = offset.length() - LEASH * s; if (over > 0) rig.position.addScaledVector(offset.normalize(), -over);
    return;
  }
  // the camera inside the rig, not the headset's raw pose: that one ignores the right stick's turns
  camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) return; fwd.normalize();
  side.set(-fwd.z, 0, fwd.x);
  rig.position.addScaledVector(fwd, sy * WALK * dt).addScaledVector(side, sx * WALK * dt);
  rig.position.x = THREE.MathUtils.clamp(rig.position.x, -5.2, 5.2); rig.position.z = THREE.MathUtils.clamp(rig.position.z, street.zFar + 4, street.zNear - 4);
}
const keys = new Set();
addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { keys.add(e.key); e.preventDefault(); } }, { signal });
addEventListener('keyup', (e) => keys.delete(e.key), { signal });
const recentre = () => { if (!shot.active) startShot(STEPS.steps[idx], true); };
addEventListener('keydown', (e) => { if (e.key === 'r') recentre(); }, { signal });

// ---------- gaze lines from "you" to the billboard, and the eyes' jump
const gazeLine = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([V(), V(), V(), V()]), new THREE.LineDashedMaterial({ color: 0xffe08a, dashSize: 0.08, gapSize: 0.05 }));
gazeLine.renderOrder = 8; scene.add(gazeLine);
const qAhead = new THREE.Quaternion();
function lookQuat() {
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), billboardDir());
  const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w))), max = THREE.MathUtils.degToRad(30);
  return ang > max ? new THREE.Quaternion().slerp(q, max / ang) : q;
}

// ---------- self-check for xr-dev/shots.mjs: is every labelled part inside the view, once settled?
const viewCam = () => (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera);
const check = () => {
  const step = STEPS.steps[idx], out = [];
  if (shot.active) out.push(`step ${step.id}: the camera is still moving`);
  for (const k of step.labels ?? step.highlight ?? []) {
    if (!A[k] && !role[k]?.length) { out.push(`step ${step.id}: "${k}" has no anchor or meshes`); continue; }
    if (!A[k]) continue;
    const p = anat.localToWorld(A[k].clone()).project(viewCam());
    if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || p.z > 1) out.push(`step ${step.id}: "${k}" is outside the view`);
  }
  return out;
};

// ---------- loop
const camPos = V();
let exiting = null, leaving = false;   // exiting: resolves exit() once the camera has reached his face
// raw: real seconds (camera moves and fades: slow frames must not stretch them), dt: capped (sticks)
function frame(raw, dt, time) {
  if (keys.size) move(0, (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0), dt);
  runShot(raw);
  if (exiting && !shot.active) {
    // where his eyes are and which way he faces, in your room (the rig's space): the next sequence
    // puts its man exactly there, so the cut does not show
    rig.updateMatrixWorld(true);
    const inv = rig.matrixWorld.clone().invert(), eyes = W(eyeMid).applyMatrix4(inv);
    const front = W(eyeMid.clone().add(V(0, 0, 1))).applyMatrix4(inv).sub(eyes);
    const done = exiting; exiting = null; done({ eyes, yaw: Math.atan2(front.x, front.z) });
  }
  if (leaving) {
    const k = 1 - streetOp;
    sky.color.lerpColors(SKY_ST.a, SKY_2.a, k); sky.groundColor.lerpColors(SKY_ST.b, SKY_2.b, k); sky.intensity = THREE.MathUtils.lerp(SKY_ST.i, SKY_2.i, k);
    anatLight.position.lerpVectors(SUN_ST, SUN_2, k); anatLight.intensity = THREE.MathUtils.lerp(1.2, 1.6, k);
  } else sky.intensity = streetOp > 0.01 ? SKY_ST.i : 0;
  const fk = fadeBoost > 0 ? 3 : 1; fadeBoost -= raw;
  streetOp += (streetTarget - streetOp) * Math.min(1, raw * 3 * fk); street.setOpacity(streetOp);
  scene.background.copy(DARK).lerp(SKY, streetOp);
  const fade = (m) => { const u = m.userData; u.op += (u.target - u.op) * Math.min(1, raw * 4 * fk); m.material.opacity = u.op; m.visible = u.op > 0.02; m.material.depthWrite = u.op > 0.95; };
  meshes.forEach(fade); SCHEM.forEach(fade); person.forEach(fade);
  if (gazeDelay > 0) gazeDelay -= raw;
  const looking = gaze === 'billboard' || (gaze === 'saccade' && gazeDelay <= 0);
  const qEye = looking ? lookQuat() : qAhead;
  for (const s of ['r', 'l']) pivots[s].quaternion.slerp(qEye, Math.min(1, raw * 20));
  gazeLine.visible = looking && streetOp > 0.5;
  if (gazeLine.visible) {
    const pts = []; for (const s of ['r', 'l']) pts.push(anat.localToWorld(A['eye_' + s].clone()), street.billboard.centre.clone());
    gazeLine.geometry.setFromPoints(pts); gazeLine.computeLineDistances();
  }
  // signals draw over everything, so they wait until he is see-through
  const opaque = person[0].userData.op > 0.9;
  pulses.visible = !opaque;
  for (const p of paths) for (const d of p.dots) d.position.copy(p.curve.getPointAt((time * p.speed + d.userData.phase) % 1));
  if (framesOn) { const k = 0.75 + 0.25 * Math.sin(time * 4); for (const f of frames.userData.list) f.material.opacity = f.userData.op * (f.userData.op > 0.5 ? k : 1) * streetOp; }
  camera.getWorldPosition(camPos);
  // the panel rides with you (it is part of the rig, so it keeps its size however small you are): in
  // the street below the billboard, later just right of what you are looking at
  if (idx === 0) panel.position.set(hl.x + 0.3, eyeH - 0.28, hl.z - 0.95);
  else { const p = THREE.MathUtils.clamp(viewPitch, -0.5, 0.5); panel.position.set(hl.x + 0.45, hl.y + Math.sin(p) * 0.85 - 0.06, hl.z - Math.cos(p) * 0.85); }
  panel.lookAt(camPos);
  for (const c of cards.children) c.lookAt(camPos);
  // labels: hidden while the camera flies; sized and spaced for your current size
  const s = rig.scale.x;
  labels.visible = !shot.active || shot.runs[shot.i]?.hold != null;
  labels.children.forEach((sp) => {
    if (!sp.userData.anchor) return;
    // while he is solid the parts inside him are hidden, and so are their tags
    const hide = opaque && sp.userData.anchor !== 'you'; sp.visible = !hide; sp.userData.line.visible = !hide;
    sp.userData.base ??= sp.scale.clone(); sp.scale.copy(sp.userData.base).multiplyScalar(s);
    const w = anat.localToWorld(A[sp.userData.anchor].clone()), i = sp.userData.slot, side = i % 2 ? -1 : 1;
    sp.position.set(w.x + side * 0.17 * s, w.y + (0.06 + Math.floor(i / 2) * 0.055) * s, w.z + 0.05 * s); sp.lookAt(camPos);
    sp.userData.line.geometry.setFromPoints([sp.position.clone().add(V(-side * sp.scale.x / 2, 0, 0)), w]);
  });
}

const desk = camera.position.clone();
return {
  scene, camera, frame, check, ui: root,
  input: { next: () => go(1), back: () => go(-1), info: toggleSources, move, turn: stickTurn, recentre },
  start() { apply(STEPS.steps[0]); },
  // in the headset camera.position is the head pose; going in part-way jumps to the step's view, from your real head
  xr: {
    start() { camera.position.set(0, 0, 0); },
    ready(h) { eyeH = h; if (!exiting) apply(STEPS.steps[idx], idx ? 'back' : undefined); },
    end() { camera.position.copy(desk); },
  },
  exit() {
    return new Promise((resolve) => {
      exiting = resolve; leaving = true;
      panel.visible = false; labels.clear(); pulses.clear(); paths = []; cards.visible = false; setFrames(false);
      gaze = 'ahead';   // he looks ahead: at you, as you come up to his face
      startShot({ id: '_exit' });
    });
  },
};
}
