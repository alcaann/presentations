// One page, several sequences, one VR session: the page owns the renderer, the VR button and
// session, controller and keyboard input, the loop, and the "Proceed to …?" question between
// sequences, which then hand over without a cut (the next opens on the frame the last one ended on). Each sequence is a module whose load(host) returns
// its own scene and camera and a few hooks (the contract is in plans/story.md):
//
//   { scene, camera, frame(raw, dt, time), start({ enter, xr }), ui, check(),
//     input: { next, back, info, move, turn, recentre }, xr: { start(), ready(eyeH), end() },
//     exit(): Promise<{ eyes, yaw }> (ends on his face; where it is in your room), stop() }
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
import { parsePeer, newCode, host as peerHost, join as peerJoin, badge } from './peerlink.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export async function runStory(SEQS, { startAt = 0 } = {}) {
  const params = new URLSearchParams(location.search);
  // Spectator view: the headset page (?spectate[=http://localhost:8798]) sends its head pose and every
  // button press to the laptop's server; the laptop page (?spectator) runs the same talk in an emulated
  // headset (IWER, one eye, a wide 16:9 view), replays the presses and follows the head without its roll,
  // smoothed. So the audience sees a clean, steady picture at the projector's resolution.
  // =peer[:code] on either side swaps the laptop server for WebRTC (shared/peerlink.js): both pages can
  // then come from GitHub Pages, and a corner badge says whether the other device is linked.
  const SPECTATE = params.has('spectate'), SPECTATOR = params.has('spectator');
  if (params.has('emulate') || SPECTATOR) await import('../xr-dev/emulate.js');
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

  let active = null, at = -1, busy = false, popup = null, eyeH = 1.5, specSize = null;
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
  // The next sequence is set up and its shaders compiled while the current one is still on screen,
  // then they swap from one frame to the next: no black in between
  async function start(i, opts = {}) {
    const seq = await load(i), xr = renderer.xr.isPresenting;
    seq.camera.aspect = innerWidth / innerHeight; seq.camera.updateProjectionMatrix();
    if (xr) seq.xr?.start?.();
    seq.start?.({ ...opts, xr: xr ? eyeH : null });
    seq.frame(0, 0, clock.elapsedTime);   // what its first frame shows, so that is what gets compiled
    await renderer.compileAsync(seq.scene, seq.camera).catch(() => {});
    spinner.visible = false;
    if (active) drop(active);
    active = seq; at = i;
    if (seq.ui) $('seq-ui').replaceChildren(seq.ui);
    seq.camera.add(spinner);
    resize();
  }

  // while the next sequence is still loading (you stay on his face): a small turning ring, no words
  const spinner = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.lineWidth = 10; g.lineCap = 'round';
    for (let i = 0; i < 12; i++) { g.strokeStyle = `rgba(170,185,205,${0.12 + 0.8 * i / 11})`; g.beginPath(); g.arc(64, 64, 44, i * Math.PI / 6, i * Math.PI / 6 + 0.3); g.stroke(); }
    const m = canvasPlane(THREE, c, 0.03, 1001); m.position.set(0, 0, -0.25); m.visible = false; return m;
  })();

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
    // up to his face as the street goes dark; exit() tells where his eyes are in your room and which
    // way he faces, and the next sequence opens on the same face in the same place
    const face = await active.exit?.();
    const slow = setTimeout(() => { spinner.visible = true; }, 400);   // only if it is still loading
    try { await load(i + 1); } catch (e) {
      console.warn(`${SEQS[i + 1].title}: no module yet (${e.message}), opening its page`);
      location.href = new URL(SEQS[i + 1].fallback, location.href).href; return;
    }
    clearTimeout(slow);
    await start(i + 1, { enter: 'face', face });
    busy = false;
  }

  // ---------- input: to the question while it is up, else to the sequence (nothing during a change)
  const toRaw = (name, a) => { if (!busy && !popup) active?.input?.[name]?.(...a); };
  const navRaw = (d) => { if (popup) answer(d > 0); else toRaw(d > 0 ? 'next' : 'back', []); };
  const outbox = [];   // presses for the spectator (?spectate)
  const rec = (e) => { if (SPECTATE) outbox.push(e); };
  // the spectator ignores its own keys while it copies the goggles; taken over (G), it is a normal page
  let following = false;
  const to = (name) => (...a) => { if (following) return; rec({ k: name, a }); toRaw(name, a); };
  const nav = (d) => { if (following) return; rec({ k: 'nav', d }); navRaw(d); };
  const xrInput = makeXRInput(renderer, { next: () => nav(1), back: () => nav(-1), info: to('info'), move: to('move'), turn: to('turn'), recentre: to('recentre') });
  // the rehearsal page (presentation/tools/rehearse.py --talk) steps the talk on its stage with ← →
  if (params.has('rehearse')) addEventListener('message', (e) => { if (e.data?.talkNav) nav(e.data.talkNav); });
  addEventListener('keydown', (e) => {
    if (following || e.target.closest?.('input')) return;
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

  // ---------- spectator view: the sender (headset) and the follower (laptop)
  const spectate = await (async () => {
    if (!SPECTATE) return () => {};
    const peer = parsePeer(params.get('spectate'));
    let send, setBadge = null, live = false;
    if (peer) {
      // the goggles hold the name: the code from the URL, else the one these goggles used before, else a
      // new one; written into the URL so a reload keeps it. Shown large until the laptop dials in.
      let code = peer.code;
      if (!code) { try { code = localStorage.getItem('xrtalk-goggles-code') || ''; } catch {} }
      code ||= newCode();
      try { localStorage.setItem('xrtalk-goggles-code', code); } catch {}
      const u = new URL(location.href); u.searchParams.set('spectate', `peer:${code}`); history.replaceState(null, '', u);
      const card = document.createElement('div');
      Object.assign(card.style, { position: 'fixed', left: '50%', top: '38%', transform: 'translate(-50%,-50%)', zIndex: 40, padding: '18px 28px',
        borderRadius: '16px', background: 'rgba(12,16,24,0.9)', color: '#c9d1db', font: '18px system-ui', textAlign: 'center', lineHeight: 1.5 });
      card.innerHTML = 'On the laptop, type this code in the spectator:<br>'
        + `<span style="font:600 72px ui-monospace,monospace;color:#fff;letter-spacing:.12em">${code}</span>`;
      document.body.append(card);
      setBadge = params.get('badge') === '0' ? () => {} : badge('top-right');
      const link = await peerHost({ code, other: 'laptop', onStatus: (st, t, d) => { live = false; setBadge(st, t, d); card.style.display = st === 'linked' ? 'none' : ''; } });
      send = (msg) => link.send(msg);
    } else {
      const url = (params.get('spectate') || 'http://localhost:8798').replace(/\/$/, '') + '/spectate';
      let inFlight = false;
      send = (msg) => {
        if (inFlight) return false;
        inFlight = true;   // text/plain: a simple request, no CORS preflight
        fetch(url, { method: 'POST', body: JSON.stringify(msg), headers: { 'Content-Type': 'text/plain' } })
          .catch(() => {}).finally(() => { inFlight = false; });
        return true;
      };
    }
    let next = 0;
    const p = V(), q = new THREE.Quaternion(), sc = V();
    return (time) => {
      if (time < next) return;
      next = time + 0.05;
      // the presses go out with the message that carries them; while unlinked they wait in the outbox
      const n = outbox.length;
      const msg = { t: time, seq: at, step: active?.step?.() ?? null, busy, popup: !!popup, events: outbox.slice(0, n) };
      if (renderer.xr.isPresenting) { renderer.xr.getCamera().matrix.decompose(p, q, sc); msg.pose = { p: p.toArray(), q: q.toArray() }; msg.eyeH = eyeH; }
      if (!send(msg)) return;
      outbox.splice(0, n);
      if (setBadge && !!msg.pose !== live) { live = !!msg.pose; setBadge(live ? 'live' : 'linked', live ? 'sending to the laptop' : 'laptop linked'); }
    };
  })();
  // The follower. It never blocks the page: the talk loads at once (seen behind the waiting card), and the
  // emulated session starts on the goggles' first pose. G, or the button bottom right, takes over: the
  // laptop stops copying the goggles, leaves the emulated session, puts the current step back at its own
  // desktop view and steps with the arrow keys like the normal page. G again follows the goggles, which
  // brings the laptop back to their step. For when the goggles die mid-talk.
  let pageReady = false, specKick = () => {};
  const follow = (() => {
    if (!SPECTATOR) return () => {};
    const xd = window.xrDevice, cv = renderer.domElement;
    xd.stereoEnabled = false;                                   // one view over the whole canvas
    xd.fovy = (Number(params.get('fov')) || 70) * Math.PI / 180; // vertical field of view
    const style = document.createElement('style');
    style.textContent = 'body.spec-follow #seq-ui, body.spec #vr, body.spec-follow #proceed { display: none !important; }'
      + ' body.spec { background: #000; } body.spec-follow:not(.spec-mouse) { cursor: none; }'
      + ' #spec-wait { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.88); color: #8b93a1; font: 18px system-ui; }'
      + ' #spec-toggle { position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; font: 600 14px system-ui; padding: 8px 14px; border-radius: 999px;'
      + ' border: 0; background: rgba(12,16,24,0.85); color: #dde3ea; cursor: pointer; opacity: 0; transition: opacity .3s; }'
      + ' body.spec-mouse #spec-toggle, body.spec:not(.spec-follow) #spec-toggle { opacity: 1; }';
    document.head.append(style);
    document.body.classList.add('spec');
    const wait = document.createElement('div'); wait.id = 'spec-wait'; wait.textContent = 'Spectator: waiting for the headset (open the talk on it and Enter VR)…';
    const btn = document.createElement('button'); btn.id = 'spec-toggle';
    document.body.append(wait, btn);
    let mouseT = null;   // the button and the cursor show while the mouse moves, so they stay off the shared screen
    addEventListener('mousemove', () => { document.body.classList.add('spec-mouse'); clearTimeout(mouseT); mouseT = setTimeout(() => document.body.classList.remove('spec-mouse'), 2500); });

    const peer = parsePeer(params.get('spectator'));
    let spec = params.get('spectator') ?? '', setBadge = () => {}, live = false, poseAt = 0, entering = false;
    const tp = V(0, 1.6, 0), tq = new THREE.Quaternion(), sp = V(0, 1.6, 0), sq = new THREE.Quaternion(), e = new THREE.Euler();
    let last = null, have = false, drift = 0, away = 0;
    const onMsg = (m) => {
      last = m;
      if (following) for (const x of m.events ?? []) { if (x.k === 'nav') navRaw(x.d); else toRaw(x.k, x.a ?? []); }
      if (m.pose) {
        tp.fromArray(m.pose.p); e.setFromQuaternion(tq.fromArray(m.pose.q), 'YXZ'); e.z = 0; tq.setFromEuler(e);   // no roll
        have = true; poseAt = performance.now();
        if (!live) { live = true; setBadge('live', 'goggles in VR'); }
        if (following && !renderer.xr.isPresenting) enter();
      }
    };

    // the emulated session, at the goggles' current pose; then a fixed 16:9 canvas. The emulator (IWER) sizes
    // the canvas to the window when the session starts and three.js keeps that size, so a preview that later
    // went fullscreen showed it small in the middle; the loop holds specSize and CSS fits it to the page.
    async function enter() {
      if (entering || !pageReady || renderer.xr.isPresenting) return;
      entering = true;
      sp.copy(tp); sq.copy(tq); xd.position.set(sp.x, sp.y, sp.z); xd.quaternion.set(sq.x, sq.y, sq.z, sq.w);
      try {
        await vr.onclick?.();
        await new Promise((r) => (renderer.xr.isPresenting ? r() : renderer.xr.addEventListener('sessionstart', r, { once: true })));
      } finally { entering = false; }
      if (!following) return leave();   // taken over while it was starting
      wait.style.display = 'none';
      const W = Math.min(3840, Math.max(1920, Math.round(screen.width * devicePixelRatio)));
      specSize = [W, Math.round(W * 9 / 16)];
      Object.assign(cv.style, { width: '100%', height: '100%' });
      document.body.style.overflow = 'hidden';
    }
    async function leave() {
      specSize = null;
      const ses = renderer.xr.getSession();
      if (ses) await new Promise((r) => { renderer.xr.addEventListener('sessionend', r, { once: true }); ses.end().catch(r); });
      Object.assign(cv.style, { width: '', height: '' }); resize();
      // the step again, now on the desktop: its own camera view, not wherever the head was
      if (!busy && active?.jump && active.step) active.jump(active.step());
    }
    function setMode(f) {
      following = f; drift = away = 0;
      document.body.classList.toggle('spec-follow', f);
      btn.textContent = f ? 'Following the goggles · G: take over' : 'Laptop in control (← →) · G: follow the goggles';
      if (f) { if (have && performance.now() - poseAt < 2000) enter(); else wait.style.display = ''; }
      else { wait.style.display = 'none'; leave(); }
    }
    addEventListener('keydown', (ev) => { if ((ev.key === 'g' || ev.key === 'G') && !ev.target.closest?.('input')) setMode(!following); });
    btn.onclick = () => setMode(!following);
    setMode(true);
    specKick = () => { if (following && have && performance.now() - poseAt < 2000) enter(); };

    if (peer) (async () => {
      // the laptop dials the goggles' code: from the URL, else typed here (the box remembers the last one);
      // then written into the URL, so a reload (or the drift reload below) dials it again by itself
      let code = peer.code;
      if (!code) {
        let prev = ''; try { prev = localStorage.getItem('xrtalk-join') || ''; } catch {}
        wait.innerHTML = '<form id="spec-code" style="text-align:center;line-height:1.8">Spectator: type the code the goggles show<br>'
          + `<input autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="16" value="${prev.replace(/[^a-z0-9]/g, '')}" `
          + 'style="font:600 56px ui-monospace,monospace;width:6.5em;text-align:center;letter-spacing:.12em;padding:4px 10px;border-radius:12px;border:1px solid #3a4250;background:#171a21;color:#fff">'
          + '<br><button style="font:600 18px system-ui;padding:8px 18px;border-radius:8px;border:0;background:#2d6cdf;color:#fff;cursor:pointer">Connect</button></form>';
        wait.style.cursor = 'auto';
        const f = wait.querySelector('form'), inp = f.querySelector('input'); inp.focus(); inp.select();
        code = await new Promise((res) => { f.onsubmit = (ev) => { ev.preventDefault(); const c = inp.value.trim().toLowerCase().replace(/[^a-z0-9]/g, ''); if (c) res(c); else inp.focus(); }; });
      }
      try { localStorage.setItem('xrtalk-join', code); } catch {}
      spec = `peer:${code}`;
      const u = new URL(location.href); u.searchParams.set('spectator', spec); history.replaceState(null, '', u);
      wait.innerHTML = `Spectator: calling the goggles (code <b style="color:#e8edf3">${code}</b>), then waiting for them to Enter VR… · G: present from the laptop`;
      setBadge = params.get('badge') === '0' ? () => {} : badge('top-right');
      peerJoin({ code, other: 'goggles', onData: onMsg, onStatus: (st, t, d) => { live = false; setBadge(st, t, d); } });
    })();
    else {
      const es = new EventSource(spec.replace(/\/$/, '') + '/spectate/events');
      es.onmessage = (ev) => onMsg(JSON.parse(ev.data));
    }

    return (real) => {
      if (live && performance.now() - poseAt > 2000) { live = false; setBadge('linked', following ? 'goggles linked, not in VR · G: take over' : 'goggles linked, not in VR'); }
      if (!following || !renderer.xr.isPresenting) return;
      const k = 1 - Math.exp(-real * (Number(params.get('smooth')) || 5));   // higher = follows faster
      sp.lerp(tp, k); sq.slerp(tq, k);
      xd.position.set(sp.x, sp.y, sp.z); xd.quaternion.set(sq.x, sq.y, sq.z, sq.w);
      // a press lost on the way: if the step differs for a while, jump to the headset's step;
      // if the sequence differs, reopen at the headset's sequence
      if (!last || busy || popup || last.busy || last.popup) { drift = away = 0; return; }
      if (last.seq !== at) { away += real; if (away > 3) location.search = `?spectator=${encodeURIComponent(spec)}&seq=${last.seq + 1}`; return; }
      away = 0;
      if (last.step != null && active?.step && last.step !== active.step()) { drift += real; if (drift > 1.5) { active.jump(last.step); drift = 0; } } else drift = 0;
    };
  })();

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
  // the ring is drawn for the first time mid-transition: compile and upload it now, so that first frame
  // is not a white square
  spinner.visible = true; renderer.compile(active.scene, active.camera); renderer.initTexture(spinner.material.map); spinner.visible = false;
  renderer.setAnimationLoop(() => {
    const real = Math.min(clock.getDelta(), 0.5), raw = real * speed, dt = Math.min(raw, 0.05), time = clock.elapsedTime;
    if (!SPECTATOR) xrInput(dt);
    else if (specSize && renderer.xr.isPresenting) { const c = renderer.domElement; if (c.width !== specSize[0] || c.height !== specSize[1]) { c.width = specSize[0]; c.height = specSize[1]; } }
    follow(real); spectate(time);
    active.frame(raw, dt, time);
    if (spinner.visible) spinner.rotation.z -= real * 5;
    renderer.render(active.scene, active.camera);
    if (stats) { frames++; fpsT += real; if (fpsT > 1) { stats.textContent = `${(frames / fpsT).toFixed(0)} fps · ${renderer.info.render.calls} draw calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris`; frames = 0; fpsT = 0; } }
  });
  // the spectator enters its emulated session once the talk is loaded and the goggles' pose is in
  pageReady = true; specKick();
}
