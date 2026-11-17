// One page, several sequences, one VR session: the page owns the renderer, the VR button and
// session, controller and keyboard input, the loop, a black fade around your head and the
// "Proceed to …?" question between sequences. Each sequence is a module whose load(host) returns
// its own scene and camera and a few hooks (the contract is in plans/story.md):
//
//   { scene, camera, frame(raw, dt, time), start({ enter, xr }), ui, check(),
//     input: { next, back, info, move, turn, recentre }, xr: { start(), ready(eyeH), end() },
//     exit(): Promise (ends close up on his face), stop() }
//
// raw: real seconds since the last frame (camera moves, fades), dt: the same capped at 0.05 s
// (sticks). Sequences call host.end() when Next is pressed on their last step.
//
//   runStory([{ title, module, fallback }], { startAt })   module: path from the page
//
// A sequence that cannot be loaded as a module yet (fallback: its own page) is opened as a page
// instead: the VR session ends there and Enter VR has to be pressed again.
import * as THREE from 'three';
import { canvasPlane, textCanvas, makeXRInput } from './walkthrough.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export async function runStory(SEQS, { startAt = 0 } = {}) {
  const params = new URLSearchParams(location.search);
  if (params.has('emulate')) await import('../xr-dev/emulate.js');
  // ?speed=4: camera flights and fades run 4x faster (headless test runs render in software)
  const speed = Math.max(0.1, Number(params.get('speed')) || 1);
  const $ = (id) => document.getElementById(id);

  // log depth: the smell dive spans 1 cm to 1 km; clipping: the man is cut at the neck there
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.localClippingEnabled = true;
  document.body.prepend(renderer.domElement);

  let active = null, at = -1, busy = false, popup = null, eyeH = 1.5;
  const loaded = new Map();
  function load(i) {
    if (!loaded.has(i)) {
      const s = SEQS[i], ctrl = new AbortController();
      const host = { renderer, params, speed, signal: ctrl.signal, title: s.title, end: () => ended(i) };
      loaded.set(i, import(new URL(s.module, location.href).href).then((m) => m.load(host)).then((seq) => Object.assign(seq, { ctrl })));
    }
    return loaded.get(i);
  }
  // a sequence that is left is dropped: listeners, panel, GPU memory
  function drop(seq) {
    seq.stop?.(); seq.ctrl.abort(); seq.ui?.remove();
    seq.scene.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [o.material ?? []].flat()) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); }
    });
  }
  async function start(i, opts = {}) {
    const seq = await load(i);
    if (active) drop(active);
    active = seq; at = i;
    if (seq.ui) $('seq-ui').replaceChildren(seq.ui);
    seq.camera.add(lid, spinner);
    resize();
    const xr = renderer.xr.isPresenting;
    if (xr) seq.xr?.start?.();
    seq.start?.({ ...opts, xr: xr ? eyeH : null });
  }

  // ---------- black around your head (scene changes happen behind it)
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8), new THREE.MeshBasicMaterial({ color: 0, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  lid.renderOrder = 1000; lid.visible = false;
  // while the next sequence is still loading behind the black: a turning ring, no words
  const spinner = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.lineWidth = 10; g.lineCap = 'round';
    for (let i = 0; i < 12; i++) { g.strokeStyle = `rgba(170,185,205,${0.12 + 0.8 * i / 11})`; g.beginPath(); g.arc(64, 64, 44, i * Math.PI / 6, i * Math.PI / 6 + 0.3); g.stroke(); }
    const m = canvasPlane(THREE, c, 0.03, 1001); m.position.set(0, 0, -0.25); m.visible = false; return m;
  })();
  const fade = { v: 0, to: 0, rate: 2, done: null };
  const fadeTo = (to, secs) => new Promise((r) => { if (fade.v === to) r(); else Object.assign(fade, { to, rate: 1 / secs, done: r }); });

  // ---------- between sequences: Proceed? (in front of you in the scene; also as buttons on the desktop)
  function ended(i) {
    if (busy || popup || i !== at || i + 1 >= SEQS.length) return;
    const cam = active.camera, k = cam.getWorldScale(V()).x, p = cam.getWorldPosition(V()), f = cam.getWorldDirection(V());
    f.y = 0; f.normalize();
    const c = textCanvas([
      { text: `${SEQS[i].title}: the end`, font: '600 44px system-ui', color: '#9ab', lh: 62 },
      { text: `Proceed to ${SEQS[i + 1].title}?`, font: '600 66px system-ui', color: '#fff', lh: 86 },
      { text: 'A / →: yes        B / ←: not yet', font: '40px system-ui', color: '#ffd88a', lh: 56 },
    ], 1100, 48);
    const m = canvasPlane(THREE, c, 0.62 * k, 20);
    m.position.copy(p).addScaledVector(f, 0.8 * k); m.position.y -= 0.05 * k; m.lookAt(p);
    active.scene.add(m);
    const el = document.createElement('div'); el.id = 'proceed';
    el.innerHTML = `<p>Proceed to <b>${SEQS[i + 1].title}</b>?</p><button id="yes">Yes</button><button id="no">Not yet</button>`;
    document.body.append(el);
    el.querySelector('#yes').onclick = () => answer(true); el.querySelector('#no').onclick = () => answer(false);
    popup = { m, el, i };
    load(i + 1).catch(() => {});   // start loading the next one while you decide
  }
  function answer(yes) {
    const { m, el, i } = popup; m.removeFromParent(); m.material.map?.dispose(); el.remove(); popup = null;
    if (yes) transition(i);
  }
  async function transition(i) {
    busy = true;
    await active.exit?.();          // up to his face, the street goes dark
    await fadeTo(1, 0.6);
    spinner.visible = true;
    try { await load(i + 1); } catch (e) {
      console.warn(`${SEQS[i + 1].title}: no module yet (${e.message}), opening its page`);
      location.href = new URL(SEQS[i + 1].fallback, location.href).href; return;
    }
    spinner.visible = false;
    await start(i + 1, { enter: 'face' });   // it opens on his face, on black
    await fadeTo(0, 0.8);
    busy = false;
  }

  // ---------- input: to the question while it is up, else to the sequence (nothing during a change)
  const to = (name) => (...a) => { if (!busy && !popup) active?.input?.[name]?.(...a); };
  const nav = (d) => { if (popup) answer(d > 0); else to(d > 0 ? 'next' : 'back')(); };
  const xrInput = makeXRInput(renderer, { next: () => nav(1), back: () => nav(-1), info: to('info'), move: to('move'), turn: to('turn'), recentre: to('recentre') });
  addEventListener('keydown', (e) => {
    if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) nav(1);
    if (['ArrowLeft', 'PageUp'].includes(e.key)) nav(-1);
  });

  // ---------- VR
  const vr = $('vr');
  if (navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) {
    vr.disabled = false;
    vr.onclick = async () => renderer.xr.setSession(await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] }));
  } else vr.textContent = 'VR not available';
  renderer.xr.addEventListener('sessionstart', () => {
    active?.xr?.start?.();
    // the headset's eye height arrives with the first poses
    setTimeout(() => { eyeH = renderer.xr.getCamera().getWorldPosition(V()).y || 1.5; active?.xr?.ready?.(eyeH); }, 300);
  });
  renderer.xr.addEventListener('sessionend', () => active?.xr?.end?.());

  // ---------- loop
  function resize() {
    if (active) { active.camera.aspect = innerWidth / innerHeight; active.camera.updateProjectionMatrix(); }
    if (!renderer.xr.isPresenting) renderer.setSize(innerWidth, innerHeight);   // (the headset sets its own)
  }
  addEventListener('resize', resize);
  window.xrCheck = () => active?.check?.() ?? [];
  const clock = new THREE.Clock(), stats = params.has('stats') ? $('stats') : null;
  if (stats) stats.style.display = 'block';
  let frames = 0, fpsT = 0;
  // ?enter=face: open the first sequence as if coming from the one before (to work on that opening)
  await start(startAt, { enter: params.get('enter') ?? undefined });
  // the black and the ring are drawn for the first time mid-transition: compile and upload them now,
  // so that first frame is not a white square
  lid.visible = spinner.visible = true; renderer.compile(active.scene, active.camera); renderer.initTexture(spinner.material.map);
  lid.visible = spinner.visible = false;
  renderer.setAnimationLoop(() => {
    const real = Math.min(clock.getDelta(), 0.5), raw = real * speed, dt = Math.min(raw, 0.05), time = clock.elapsedTime;
    xrInput(dt);
    active.frame(raw, dt, time);
    if (fade.v !== fade.to) {
      fade.v = fade.to > fade.v ? Math.min(fade.to, fade.v + raw * fade.rate) : Math.max(fade.to, fade.v - raw * fade.rate);
      if (fade.v === fade.to) { fade.done?.(); fade.done = null; }
    }
    lid.material.opacity = fade.v; lid.visible = fade.v > 0;
    if (spinner.visible) spinner.rotation.z -= real * 5;
    renderer.render(active.scene, active.camera);
    if (stats) { frames++; fpsT += real; if (fpsT > 1) { stats.textContent = `${(frames / fpsT).toFixed(0)} fps · ${renderer.info.render.calls} draw calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris`; frames = 0; fpsT = 0; } }
  });
}
