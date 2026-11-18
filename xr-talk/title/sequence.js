// The title screen before Sequence 1: a 1950s television on a sideboard in a dark room, running both
// sequences side by side (channel 1: Seeing, channel 2: Smelling), under "Brain Experiences ...Now
// In VR!". Next tunes it to channel 1, which fills the screen, and you fly into the picture: its
// last frame is the Sign's first one (tv/seeing-1.jpg is that view, taken with
// xr-dev/stills.mjs billboard 1).
//
// A sequence for ../shared/host.js (contract: ../plans/story.md) marked `intro` in index.html: it
// has no "Proceed?" question; exit() is the fly-in and the next sequence opens normally.
// Stills: node xr-dev/stills.mjs billboard 1 2 4 / smell 1 3 6, at 960x540 in tv/.
import * as THREE from 'three';
import { ease } from '../shared/walkthrough.js';
const here = (f) => new URL(f, import.meta.url).href;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const CSS = `
  #ui { position: fixed; left: 10px; top: 10px; background: #000b; padding: 10px 12px; border-radius: 8px; line-height: 1.5; }
  #ui h1 { font-size: 15px; margin: 0 8px 0 0; display: inline; }
  #ui .row { display: flex; align-items: center; gap: 4px; }
  #ui button { font: inherit; margin: 0; padding: 3px 10px; background: #333; color: #ddd; border: 1px solid #555; border-radius: 5px; cursor: pointer; }
`;
// cx: where the channel's half of the screen is centred on its still (0..1 across it)
const CHANNELS = [
  { name: 'SEEING', stills: [['seeing-1', 0.5], ['seeing-2', 0.44], ['seeing-3', 0.38]] },
  { name: 'SMELLING', stills: [['smelling-1', 0.45], ['smelling-2', 0.4], ['smelling-3', 0.5]] },
];
const HOLD = 4.5;   // seconds per still

export async function load(host) {
const { renderer } = host;
const root = document.createElement('div');
root.innerHTML = `<style>${CSS}</style><div id="ui"><div class="row"><h1 id="t">Brain Experiences</h1><button id="next" title="→ / A">tune in ▶</button></div></div>`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a10);
scene.fog = new THREE.Fog(0x0b0a10, 4, 9);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.02, 50);
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
const room = new THREE.Group(); scene.add(room);   // raised or lowered to your eye height in the headset

// ---------- textures drawn here
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function tex(c, repeat) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
// walnut: 1 m of grain per tile
const wood = tex(canvas(512, 512, (g, w, h) => {
  g.fillStyle = '#5b3a24'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) {
    const y = Math.random() * h, a = 2 + Math.random() * 6, f = 0.004 + Math.random() * 0.01, ph = Math.random() * 6;
    g.strokeStyle = Math.random() < 0.5 ? `rgba(30,16,8,${0.15 + Math.random() * 0.25})` : `rgba(140,96,60,${0.08 + Math.random() * 0.15})`;
    g.lineWidth = 0.5 + Math.random() * 2.5; g.beginPath();
    for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * f + ph) * a);
    g.stroke();
  }
}), [1, 1]);
// 1950s wallpaper: small four-point stars and dots on muted teal
const paper = tex(canvas(512, 512, (g, w, h) => {
  g.fillStyle = '#23403f'; g.fillRect(0, 0, w, h);
  const star = (x, y, r) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.18 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
  for (const [x, y, r] of [[96, 110, 34], [360, 70, 22], [250, 280, 40], [440, 380, 30], [120, 420, 24]]) { g.fillStyle = '#c9b27a33'; star(x, y, r); }
  g.fillStyle = '#e8d9a822'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3, 0, 7); g.fill(); }
}), [5, 2.5]);

// ---------- the room: a pool of light on the floor, wallpaper behind
const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.85 }));
floor.rotation.x = -Math.PI / 2; room.add(floor);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshStandardMaterial({ map: paper, roughness: 0.9 }));
wall.position.set(0, 2.5, -3.1); room.add(wall);
room.add(new THREE.HemisphereLight(0x8090b0, 0x201810, 0.35));
const spot = new THREE.SpotLight(0xffe2b0, 22, 8, 0.55, 0.6, 1.6);
spot.position.set(0.4, 3.4, -0.9); spot.target.position.set(0, 1.0, -2.5); room.add(spot, spot.target);

// ---------- the sideboard and the set
const walnut = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.45, metalness: 0.05 });
const dark = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.5 });
const brass = new THREE.MeshStandardMaterial({ color: 0xc8a25a, roughness: 0.3, metalness: 0.9 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.15, metalness: 1 });
const Z = -2.45, SC = V(0, 1.41, Z + 0.245);   // SC: the screen's centre, in the bezel's opening
{
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 0.5), walnut); top.position.set(0, 0.47, Z); room.add(top);
  // two sliding doors and their pulls
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.01), dark); d.position.set(s * 0.46, 0.47, Z + 0.255); room.add(d);
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.012), brass); pull.position.set(s * 0.1, 0.47, Z + 0.265); room.add(pull);
  }
  for (const x of [-0.85, 0.85]) for (const z of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.01, 0.16, 12), brass);
    leg.position.set(x, 0.08, Z + z); leg.rotation.z = Math.sign(x) * -0.12; room.add(leg);
  }
}
// the cabinet: a rounded box of walnut, a dark bezel with a rounded opening, the screen in it
const SW = 1.0, SH = 0.5625;   // the picture is 16:9
{
  const W = SW + 0.2, H = SH + 0.34, D = 0.48, y0 = 0.86;   // cabinet bottom on the sideboard (+ feet)
  const rr = (w, h, r) => { const s = new THREE.Shape(); s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); return s; };
  const cab = new THREE.Mesh(new THREE.ExtrudeGeometry(rr(W, H, 0.09), { depth: D - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 10 }), walnut);
  cab.position.set(0, y0 + H / 2, Z - D / 2 + 0.02); room.add(cab);
  // the bezel: the screen sits in its upper part, controls below
  const bez = rr(SW + 0.1, H - 0.08, 0.06); const hole = rr(SW + 0.012, SH + 0.012, 0.05);
  const holePath = new THREE.Path(hole.getPoints(16).map((p) => p.add(new THREE.Vector2(0, SC.y - (y0 + H / 2)))));
  bez.holes.push(holePath);
  const bezel = new THREE.Mesh(new THREE.ExtrudeGeometry(bez, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }), dark);
  bezel.position.set(0, y0 + H / 2, Z + D / 2 - 0.005); room.add(bezel);
  // below the screen: a speaker grille, a brass name plate, two knobs and a red pilot light
  const yc = y0 + 0.13;
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshStandardMaterial({ map: tex(canvas(256, 64, (g, w, h) => {
    g.fillStyle = '#2a2622'; g.fillRect(0, 0, w, h); g.fillStyle = '#7d6a4c';
    for (let y = 6; y < h; y += 8) for (let x = 6 + (y % 16 ? 4 : 0); x < w; x += 8) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
  })), roughness: 0.8 }));
  grille.position.set(-0.2, yc, Z + D / 2 + 0.022); room.add(grille);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.03), new THREE.MeshStandardMaterial({ map: tex(canvas(320, 60, (g, w, h) => {
    g.fillStyle = '#b8954f'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a2a12'; g.font = 'italic 700 34px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Neurovision', w / 2, h / 2 + 2);
  })), roughness: 0.35, metalness: 0.6 }));
  plate.position.set(0.18, yc + 0.035, Z + D / 2 + 0.022); room.add(plate);
  for (const x of [0.32, 0.44]) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 32), dark); knob.rotation.x = Math.PI / 2; knob.position.set(x, yc - 0.02, Z + D / 2 + 0.03); room.add(knob);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 24), chrome); cap.rotation.x = Math.PI / 2; cap.position.set(x, yc - 0.02, Z + D / 2 + 0.047); room.add(cap);
  }
  const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3a2a })); pilot.position.set(0.18, yc - 0.03, Z + D / 2 + 0.025); room.add(pilot);
  // short brass feet, and rabbit ears on top
  for (const x of [-0.45, 0.45]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.014, 0.06, 12), brass); f.position.set(x, 0.81, Z); room.add(f); }
  const base = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), dark); base.position.set(0.15, y0 + H + 0.02, Z - 0.05); room.add(base);
  for (const s of [-1, 1]) {
    const L = 0.42, a = 0.55, b = V(0.15, y0 + H + 0.02, Z - 0.05), up = V(s * Math.sin(a), Math.cos(a), 0);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, L, 8), chrome);
    rod.position.copy(b).addScaledVector(up, L / 2); rod.rotation.z = -s * a; room.add(rod);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), chrome); tip.position.copy(b).addScaledVector(up, L); room.add(tip);
  }
}

// ---------- the picture: two channels side by side on a curved tube, with scanlines, a little
// colour fringing, noise between stills, and the dark corners of a CRT. crt 1 -> 0 flattens it all
// on the way in, so the last frame is the plain still
const loader = new THREE.TextureLoader();
const stillTex = await Promise.all(CHANNELS.flatMap((c) => c.stills).map(([f]) => loader.loadAsync(here(`tv/${f}.jpg`)).then((t) => { t.colorSpace = THREE.SRGBColorSpace; return t; })));
let k = 0; for (const c of CHANNELS) for (const s of c.stills) s.push(stillTex[k++]);   // [file, cx, texture]
const U = {
  tA: { value: CHANNELS[0].stills[0][2] }, tB: { value: CHANNELS[1].stills[0][2] },
  cxA: { value: CHANNELS[0].stills[0][1] }, cxB: { value: CHANNELS[1].stills[0][1] },
  split: { value: 0.5 }, nA: { value: 0 }, nB: { value: 0 }, crt: { value: 1 }, on: { value: 0 }, time: { value: 0 },
};
const screenGeo = new THREE.PlaneGeometry(SW, SH, 32, 18);
{ const p = screenGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (SW / 2), y = p.getY(i) / (SH / 2); p.setZ(i, 0.035 * (1 - x * x * 0.6) * (1 - y * y * 0.6)); } }
const screen = new THREE.Mesh(screenGeo, new THREE.ShaderMaterial({
  uniforms: U, fog: false,
  // the page's renderer uses a logarithmic depth buffer: a shader of our own has to write depth the same way
  vertexShader: '#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n#include <logdepthbuf_vertex>\n}',
  fragmentShader: `
    #include <logdepthbuf_pars_fragment>
    uniform sampler2D tA, tB; uniform float cxA, cxB, split, nA, nB, crt, on, time; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      #include <logdepthbuf_fragment>
      vec2 c = vUv - 0.5, uv = 0.5 + c * (1.0 + crt * 0.1 * dot(c, c));
      // switching on: a bright line that opens into the picture
      float sx = max(0.003, smoothstep(0.0, 0.3, on)), sy = max(0.004, smoothstep(0.25, 1.0, on));
      vec2 q = (uv - 0.5) / vec2(sx, sy) + 0.5;
      if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { gl_FragColor = vec4(0.012, 0.014, 0.018, 1.0); return; }
      // a slow rolling band that shifts the lines a little
      float band = exp(-pow((fract(q.y - time * 0.07) - 0.5) * 18.0, 2.0)) * crt;
      q.x += band * 0.004;
      bool left = q.x < split;
      float w = left ? split : 1.0 - split, centre = left ? split * 0.5 : split + w * 0.5;
      vec2 iuv = vec2(clamp((left ? cxA : cxB) + q.x - centre, 0.0, 1.0), q.y);
      float ab = crt * 0.0022;
      vec3 col = left
        ? vec3(texture2D(tA, iuv + vec2(ab, 0.0)).r, texture2D(tA, iuv).g, texture2D(tA, iuv - vec2(ab, 0.0)).b)
        : vec3(texture2D(tB, iuv + vec2(ab, 0.0)).r, texture2D(tB, iuv).g, texture2D(tB, iuv - vec2(ab, 0.0)).b);
      float n = hash(floor(q * vec2(360.0, 200.0)) + floor(time * 30.0) * vec2(0.37, 0.91));
      col = mix(col, vec3(n * 0.9), clamp((left ? nA : nB) + crt * 0.008, 0.0, 1.0));
      col *= mix(1.0, 0.8 + 0.2 * sin(q.y * 3.14159 * 400.0), crt);                         // scanlines
      col *= mix(1.0, 0.94 + 0.06 * sin(time * 50.0) + band * 0.15, crt);                   // flicker
      col = mix(col, vec3(0.015), crt * (1.0 - smoothstep(0.0012, 0.0028, abs(q.x - split))) * step(split, 0.999));   // the seam
      col *= mix(1.0, smoothstep(0.78, 0.3, length(c * vec2(1.0, 1.25))), crt * 0.75);        // dark corners
      col += (1.0 - sy) * 0.9 * step(0.3, on);                                              // the switch-on line glows
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
}));
screen.position.copy(SC); room.add(screen);
// a glass sheen over the tube
const glass = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: tex(canvas(256, 144, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w * 0.6, h); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.02)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
})) }));
glass.position.copy(SC).add(V(0, 0, 0.04)); room.add(glass);
// the picture's light on the sideboard and the floor
const glow = new THREE.PointLight(0x9fb4ff, 0, 3.5, 1.5); glow.position.copy(SC).add(V(0, -0.1, 0.5)); room.add(glow);

// on-screen channel names, as a VCR would print them
const osd = (text) => {
  const c = canvas(512, 72, (g, w, h) => { g.font = '700 50px ui-monospace, "Courier New", monospace'; g.textBaseline = 'middle'; g.fillStyle = '#0a2a10'; g.fillText(text, 5, h / 2 + 3); g.fillStyle = '#7dff8e'; g.fillText(text, 2, h / 2); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4 * 72 / 512), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, opacity: 0 }));
  room.add(m); return m;
};
const OSD = CHANNELS.map((c, i) => { const m = osd(`CH ${i + 1}  ${c.name}`); m.position.set(SC.x - SW / 2 + 0.235 + i * SW / 2, SC.y + SH / 2 - 0.055, SC.z + 0.05); return m; });

// ---------- the title over the set: "Brain Experiences", and "...Now In VR!" in neon script below it
const title = (() => {
  const c = canvas(2048, 640, (g, w) => {
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    // line 1: sunset chrome with stripes, dark outline, a cyan shadow
    g.font = 'italic 900 210px "Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif';
    g.lineJoin = 'round';
    g.fillStyle = '#29d3e0'; g.fillText('Brain Experiences', w / 2 + 12, 262);
    g.lineWidth = 18; g.strokeStyle = '#1a0f2a'; g.strokeText('Brain Experiences', w / 2, 250);
    const gr = g.createLinearGradient(0, 80, 0, 260);
    gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.45, '#ffc65a'); gr.addColorStop(0.55, '#ff8a4c'); gr.addColorStop(1, '#e8418f');
    g.fillStyle = gr; g.fillText('Brain Experiences', w / 2, 250);
    g.save(); g.globalCompositeOperation = 'destination-out';   // thin bands cut out of the lower half
    for (let y = 196; y < 250; y += 15) g.fillRect(0, y, w, 4 + (y - 196) / 12);
    g.restore();
    // line 2: neon tube script
    g.font = 'italic 700 150px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive, serif';
    g.shadowColor = '#ff3fa4'; g.shadowBlur = 40; g.fillStyle = '#ffd1ec'; g.fillText('...Now In VR!', w / 2 + 120, 470);
    g.shadowBlur = 12; g.fillText('...Now In VR!', w / 2 + 120, 470);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9 * 640 / 2048), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, fog: false }));
  m.position.set(0, 2.38, Z + 0.1); room.add(m); return m;
})();
// and a quiet line on the sideboard: how to tune in
const hint = (() => {
  const c = canvas(1024, 96, (g, w, h) => { g.font = '600 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#e9dcc0'; g.fillText('A  /  →    tune in to channel 1', w / 2, h / 2); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8 * 96 / 1024), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, opacity: 0 }));
  m.position.set(0, 0.66, Z + 0.262); room.add(m); return m;
})();

// ---------- the loop
let t = 0, eyeH = 1.5, tuning = null;   // tuning: the way in, once Next is pressed
const chan = CHANNELS.map((c, i) => ({ i: 0, next: HOLD + i * HOLD / 2, n: 0 }));
const DESK = V(0, 1.5, 0.3);
// in the headset: the set at your eye height, and you a step closer to it than on the screen
function place(h) { room.position.y = THREE.MathUtils.clamp(h - 1.5, -0.35, 0.3); rig.position.set(0, 0, -0.7); }
function cut(ch, j) {   // change channel ch to its still j
  const s = CHANNELS[ch].stills[j]; chan[ch].i = j;
  (ch ? U.tB : U.tA).value = s[2]; (ch ? U.cxB : U.cxA).value = s[1];
}
function frame(raw, dt, time) {
  t += raw; U.time.value = time;
  U.on.value = Math.min(1, Math.max(0, (t - 0.4) / 1.1));
  const shown = Math.min(1, Math.max(0, (t - 1.6) / 0.8)) * (tuning ? Math.max(0, 1 - tuning.t / 0.5) : 1);
  for (const m of OSD) m.material.opacity = shown;
  hint.material.opacity = shown * (0.55 + 0.45 * Math.sin(time * 2.4) ** 2);
  // every few seconds a burst of noise and the next still, the two channels out of step
  chan.forEach((c, ch) => {
    if (tuning && ch === 0) return;
    if (t > c.next) { c.next = t + HOLD; c.n = 0.0001; }
    if (c.n > 0) { c.n += raw; if (c.n > 0.18 && !c.cut) { cut(ch, (c.i + 1) % CHANNELS[ch].stills.length); c.cut = true; } if (c.n > 0.5) { c.n = 0; c.cut = false; } }
    (ch ? U.nB : U.nA).value = c.n > 0 ? Math.sin(Math.min(1, c.n / 0.5) * Math.PI) * 0.9 : 0;
  });
  glow.intensity = U.on.value * (1.2 + 0.25 * Math.sin(time * 9) * U.crt.value);
  if (!renderer.xr.isPresenting && !tuning) { camera.position.copy(DESK); camera.lookAt(SC.clone().add(room.position).add(V(0, 0.18, 0))); }
  if (tuning) tune(raw);
}
// the way in: channel 1 cuts to the street, opens to the whole screen, and you fly into it
function tune(raw) {
  const T = tuning; T.t += raw;
  if (T.t < 0.45) U.nA.value = Math.sin(T.t / 0.45 * Math.PI) * 0.9;
  else { U.nA.value = 0; if (!T.cut) { cut(0, 0); T.cut = true; } }
  U.split.value = THREE.MathUtils.lerp(0.5, 1, ease(Math.min(1, Math.max(0, (T.t - 0.5) / 1.2))));
  const f = ease(Math.min(1, Math.max(0, (T.t - 1.1) / 2.4)));
  U.crt.value = 1 - ease(Math.min(1, Math.max(0, (T.t - 2.2) / 1.3)));
  screen.scale.z = U.crt.value;
  const sc = SC.clone().add(room.position);
  if (renderer.xr.isPresenting) {
    // the rig carries your head to just in front of the glass, at the picture's height
    const head = renderer.xr.getCamera().getWorldPosition(V()), want = sc.clone().add(V(0, 0, 0.2));
    if (!T.from) T.from = { rig: rig.position.clone(), off: head.clone().sub(rig.position) };
    rig.position.lerpVectors(T.from.rig, want.sub(T.from.off), f);
  } else {
    // close enough that the picture covers the window
    const tn = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), d = Math.min(SH / 2 / tn, SW / 2 / (tn * camera.aspect));
    if (!T.from) T.from = { pos: camera.position.clone(), look: SC.clone().add(room.position).add(V(0, 0.18, 0)) };
    camera.position.lerpVectors(T.from.pos, sc.clone().add(V(0, 0, d)), f);
    camera.lookAt(T.from.look.clone().lerp(sc, f));
  }
  if (T.t > 3.6) { const done = T.resolve; tuning.resolve = null; done?.(); }
}

const desk = camera.position.copy(DESK).clone();
const next = () => host.end();
root.querySelector('#next').onclick = next;
return {
  scene, camera, frame, ui: root,
  input: { next },
  start({ xr } = {}) { if (xr) { eyeH = xr; camera.position.set(0, 0, 0); place(eyeH); } },
  check: () => (tuning ? ['title: the camera is still moving'] : []),
  xr: {
    start() { camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0); },
    ready(h) { eyeH = h; place(h); },
    end() { camera.position.copy(desk); room.position.y = 0; rig.position.set(0, 0, 0); },
  },
  exit() { return new Promise((resolve) => { tuning = { t: 0, resolve }; }); },
};
}
