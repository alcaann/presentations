// The street shared by the vision pipelines (billboard/ = A, pharmacy/ = B; plans/vision.md §3.1).
// Plain three.js boxes and canvas text, no external assets. The viewer stands at the origin
// looking down -z; facades line both sides, blade signs stick out over the doors at shop height
// and face the viewer, the green billboard (A) hangs on the right. Lighting is fixed and even
// (the pupil steps in B must not be driven by light). Facades, windows, doors and road markings
// are instanced (a handful of draw calls in all) so the Quest's GPU has room for the anatomy.
//
//   import { makeStreet } from '../shared/street.js';
//   const street = makeStreet(THREE);  scene.add(street.group);
//   street.signs.get('apotek')   -> { mesh, kind, colour, text, centre: Vector3 (world) }
//   street.billboard             -> { mesh, centre, word }
//   street.setOpacity(0..1)      -> fades everything
//   street.zNear, street.zFar    -> the road's ends (spawn point at z = 0)

// every sign is invented: generic Norwegian shop words, no chain names, logos or colours
export const SIGNS = [
  // id,        text,        colour,   kind ('green' / 'cross' / 'plain'), side, z (m), y (m)
  ['kafe',      'KAFÉ',      '#b5651d', 'plain', -1,  -7,  3.0],
  ['optikk',    'OPTIKK',    '#2d6cdf', 'plain', +1,  -8,  3.1],
  ['blomster',  'BLOMSTER',  '#2e9e4f', 'green', -1, -12,  3.0],
  ['bakeri',    'BAKERI',    '#c8a165', 'plain', +1, -19,  3.0],
  ['forstehjelp', 'FØRSTEHJELP', '#d23b3b', 'cross', -1, -17, 3.2],
  ['antikk',    'ANTIKK',    '#7a5a3a', 'plain', +1, -24,  3.1],
  ['kiosk',     'KIOSK',     '#2e9e4f', 'green', -1, -23,  3.0],
  ['frisor',    'FRISØR',    '#8e44ad', 'plain', +1, -29,  3.0],
  ['apotek',    'APOTEK',    '#1f8f4e', 'cross', -1, -31,  3.1],
  ['sko',       'SKO',       '#444',    'plain', +1, -35,  3.0],
  ['bokhandel', 'BOKHANDEL', '#2e9e4f', 'green', -1, -38,  3.1],
  ['optiker',   'OPTIKER',   '#2d6cdf', 'plain', +1, -42,  3.0],
];
// A's billboard: one short, very common English word (the reading timings in A come from studies
// of common words in the reader's own language), an invented brand, green like the APOTEK cross
// the road runs from Z_NEAR (behind the spawn point at z = 0) to Z_FAR (ahead), room to walk both ways
export const Z_NEAR = 40, Z_FAR = -110;
export const BILLBOARD = { word: 'COLD', sub: 'new soda · from the mountains', colour: '#1f9d55', x: 4.3, y: 4.6, z: -15, w: 4.2, h: 2.1 };

function canvasTex(THREE, w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function signTexture(THREE, text, colour, kind) {
  return canvasTex(THREE, 512, 192, (g, w, h) => {
    g.fillStyle = kind === 'cross' ? '#fff' : colour; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#222'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    let x0 = 24;
    if (kind === 'cross') {   // a plain cross in the sign's colour, then the word
      const s = 120, cx = 30 + s / 2, cy = h / 2, a = s / 3;
      g.fillStyle = colour; g.fillRect(cx - a / 2, cy - s / 2, a, s); g.fillRect(cx - s / 2, cy - a / 2, s, a);
      x0 = 30 + s + 18;
    }
    g.fillStyle = kind === 'cross' ? colour : '#fff';
    let size = 96; g.font = `700 ${size}px system-ui, sans-serif`;
    while (g.measureText(text).width > w - x0 - 24 && size > 30) { size -= 4; g.font = `700 ${size}px system-ui, sans-serif`; }
    g.textBaseline = 'middle'; g.fillText(text, x0, h / 2 + 4);
  });
}

function billboardTexture(THREE) {
  const B = BILLBOARD;
  return canvasTex(THREE, 1024, 512, (g, w, h) => {
    g.fillStyle = B.colour; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0d5c32'; g.fillRect(0, h - 70, w, 70);
    g.fillStyle = '#e8fff2'; g.beginPath(); g.roundRect(70, 150, 120, 290, 30); g.fill(); g.fillRect(105, 90, 50, 70);
    g.fillStyle = B.colour; g.fillRect(70, 260, 120, 60);
    g.fillStyle = '#fff'; g.font = '800 250px system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillText(B.word, 260, 230);
    g.font = '500 50px system-ui, sans-serif'; g.fillText(B.sub, 265, 385);
    g.font = '500 30px system-ui, sans-serif'; g.fillStyle = '#cfe'; g.fillText('(invented brand)', 30, h - 35);
  });
}

export function makeStreet(THREE) {
  const group = new THREE.Group(); group.name = 'street';
  const mats = [];
  const mat = (o) => { const m = new THREE.MeshLambertMaterial(o); mats.push(m); return m; };
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); group.add(o); return o; };
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  const place = (x, y, z, sx, sy, sz, ry = 0, rx = 0) => M4.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, 0)), S.set(sx, sy, sz));

  // road and pavements
  const LEN = Z_NEAR - Z_FAR, MID = (Z_NEAR + Z_FAR) / 2, nMarks = Math.floor(LEN / 6);
  add(new THREE.PlaneGeometry(7, LEN), mat({ color: 0x3d4045 }), 0, 0.001, MID).rotation.x = -Math.PI / 2;
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(2.4, 0.15, LEN), mat({ color: 0x9a968e }), s * 4.7, 0.075, MID);
  const marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.15, 2.5), mat({ color: 0xe8e4d8 }), nMarks);
  for (let i = 0; i < nMarks; i++) marks.setMatrixAt(i, place(0, 0.003, Z_NEAR - 2 - i * 6, 1, 1, 1, 0, -Math.PI / 2));
  group.add(marks);

  // facades (instanced, one colour per block), windows and doors on the street side
  const facade = [0xc9b79c, 0xb08c74, 0xd8cdb8, 0x9e8f80, 0xc4a484, 0xa8b0a0, 0xd0c0a8];
  const blocks = [], wins = [], doors = [];
  let k = 0;
  for (const s of [-1, 1]) for (let z = Z_NEAR; z > Z_FAR; k++) {
    const len = 6 + (k * 7 % 3), hgt = 9 + (k * 5 % 4) * 1.5;
    blocks.push({ x: s * 7.9, y: hgt / 2, z: z - len / 2, len: len - 0.2, hgt, c: facade[k % facade.length] });
    for (let fl = 1; fl * 3 + 1 < hgt; fl++) for (let wz = z - 1.2; wz > z - len + 0.8; wz -= 1.8) wins.push([s * 5.89, fl * 3 + 1.6, wz, -s * Math.PI / 2]);
    doors.push([s * 5.89, 1.35, z - len / 2, -s * Math.PI / 2]);
    z -= len;
  }
  const fac = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat({ color: 0xffffff }), blocks.length);
  blocks.forEach((b, i) => { fac.setMatrixAt(i, place(b.x, b.y, b.z, 4, b.hgt, b.len)); fac.setColorAt(i, new THREE.Color(b.c)); });
  const win = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 1.3), mat({ color: 0x2b3440 }), wins.length);
  wins.forEach(([x, y, z, ry], i) => win.setMatrixAt(i, place(x, y, z, 1, 1, 1, ry)));
  const door = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 2.4), mat({ color: 0x4a3626 }), doors.length);
  doors.forEach(([x, y, z, ry], i) => door.setMatrixAt(i, place(x, y, z, 1, 1, 1, ry)));
  group.add(fac, win, door);

  // blade signs over the doors, facing the viewer (+z)
  const signs = new Map();
  const dark = mat({ color: 0x222222 });
  for (const [id, text, colour, kind, side, z, y] of SIGNS) {
    const m = add(new THREE.BoxGeometry(1.3, 0.48, 0.06), [dark, dark, dark, dark, mat({ map: signTexture(THREE, text, colour, kind) }), dark], side * 5.0, y, z);
    add(new THREE.BoxGeometry(0.9, 0.05, 0.05), dark, side * 5.55, y + 0.27, z);
    m.userData = { id, text, colour, kind };
    signs.set(id, { mesh: m, id, text, colour, kind, centre: new THREE.Vector3(side * 5.0, y, z) });
  }

  // the billboard (A): large, green, on the right, turned towards the viewer
  const B = BILLBOARD;
  const bb = add(new THREE.PlaneGeometry(B.w, B.h), mat({ map: billboardTexture(THREE), side: THREE.DoubleSide }), B.x, B.y, B.z);
  bb.lookAt(0, 1.6, 0);
  add(new THREE.BoxGeometry(0.15, B.y - B.h / 2, 0.15), dark, B.x, (B.y - B.h / 2) / 2, B.z);
  const billboard = { mesh: bb, centre: new THREE.Vector3(B.x, B.y, B.z), word: B.word };

  group.add(new THREE.HemisphereLight(0xf2f6ff, 0x6b6458, 1.6));

  // fading: materials only become transparent while faded (opaque draws are cheaper)
  let last = 1;
  function setOpacity(a) {
    if (Math.abs(a - last) < 0.002) return; last = a;
    for (const m of mats) { const t = a < 0.999; if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; } m.opacity = a; m.depthWrite = !t; }
    group.visible = a > 0.01;
  }
  return { group, signs, billboard, setOpacity, zNear: Z_NEAR, zFar: Z_FAR };
}
