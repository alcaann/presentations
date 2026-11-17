// Pieces every vision walkthrough needs (billboard/ = A, pharmacy/ = B), so B doesn't start as a
// copy of A. smell/ predates this module and keeps its own copy.
//
//   textCanvas(lines, w, pad)            canvas with wrapped text rows on a dark rounded panel
//   canvasPlane(THREE, canvas, width)    a camera-facing plane showing a canvas (no depth test)
//   setMap(THREE, mesh, canvas, width)   swap a plane's canvas, keep its aspect
//   ease(t)                              ease-in-out for 0..1
//   setupVR(THREE, renderer, camera, button, { onStart, onEnd })
//   makeXRInput(renderer, { next, back, turn, info, move })  -> call every frame with dt: A / right
//                                           trigger next, B / left trigger back, X info, right stick turns,
//                                           left stick walks (move(sideways, forward, dt), -1..1 each)

export function textCanvas(lines, w = 1024, pad = 36) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const wrap = (txt, font, max) => { g.font = font; const out = []; let cur = '';
    for (const word of txt.split(' ')) { const t = cur ? cur + ' ' + word : word; if (g.measureText(t).width > max && cur) { out.push(cur); cur = word; } else cur = t; }
    if (cur) out.push(cur); return out; };
  const rows = [];
  for (const L of lines) for (const r of wrap(L.text, L.font, w - 2 * pad)) rows.push({ ...L, text: r });
  c.width = w; c.height = pad * 2 + rows.reduce((a, r) => a + r.lh, 0);
  g.fillStyle = 'rgba(12,16,24,0.9)'; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 28); g.fill();
  let y = pad; for (const r of rows) { g.font = r.font; g.fillStyle = r.color; g.textBaseline = 'top'; g.fillText(r.text, pad, y); y += r.lh; }
  return c;
}

export function canvasPlane(THREE, c, width, order = 10) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }));
  m.renderOrder = order; m.visible = false;
  if (c && c.width) setMap(THREE, m, c, width);
  return m;
}

export function setMap(THREE, mesh, c, width) {
  mesh.material.map?.dispose();
  mesh.material.map = new THREE.CanvasTexture(c); mesh.material.map.colorSpace = THREE.SRGBColorSpace;
  mesh.scale.set(width, width * c.height / c.width, 1); mesh.material.needsUpdate = true; mesh.visible = true;
}

export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export async function setupVR(THREE, renderer, camera, button, { onStart, onEnd } = {}) {
  if (navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) {
    button.disabled = false;
    button.onclick = async () => renderer.xr.setSession(await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] }));
  } else button.textContent = 'VR not available';
  const desk = camera.position.clone();
  renderer.xr.addEventListener('sessionstart', () => {
    camera.position.set(0, 0, 0);
    // the headset's eye height arrives with the first poses
    setTimeout(() => onStart?.(renderer.xr.getCamera().getWorldPosition(new THREE.Vector3()).y || 1.5), 300);
  });
  renderer.xr.addEventListener('sessionend', () => { camera.position.copy(desk); onEnd?.(); });
}

export function makeXRInput(renderer, { next, back, turn, info, move, recentre }) {
  const prev = {};
  return (dt) => {
    const session = renderer.xr.getSession(); if (!session) return;
    for (const src of session.inputSources) {
      const gp = src.gamepad; if (!gp) continue; const h = src.handedness;
      const edge = (i, f) => { const k = h + i, p = !!gp.buttons[i]?.pressed; if (p && !prev[k]) f(); prev[k] = p; };
      if (h === 'right') { edge(4, next); edge(5, back); edge(0, next); }
      if (h === 'left') { edge(0, back); if (info) edge(4, info); }   // X: the step's sources
      if (recentre) { edge(1, recentre); edge(3, recentre); }   // grip or stick click, either hand
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      if (h === 'right' && gp.axes.length >= 4) {
        const sx = dz(gp.axes[2]), sy = dz(gp.axes[3]);
        // only a moved stick turns the model, so a step's own turn is never overridden
        if (sx || sy) turn(sx * 1.8 * dt, sy * 1.2 * dt);
      }
      if (h === 'left' && move && gp.axes.length >= 4) {
        const sx = dz(gp.axes[2]), sy = dz(gp.axes[3]);
        if (sx || sy) move(sx, -sy, dt);   // stick forward reads as -1
      }
    }
  };
}
