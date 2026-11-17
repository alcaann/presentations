// The spectator link without a laptop server: WebRTC between the goggles' page and the laptop's page,
// both opened from GitHub Pages. PeerJS's free cloud server (0.peerjs.com) only introduces them: each
// page registers a name there, they swap the connection offer through it, and from then on the data
// channel runs device to device. If no direct path exists (client isolation on the Wi-Fi), PeerJS's
// default config also tries its own free relay (turn:eu-0/us-0.turn.peerjs.com), so the badge says
// which route was taken. Both devices need internet for the handshake, and again after a reload.
//
//   ?spectator=peer[:code]   the laptop: registers as tdt16-xrtalk-<code> and waits for the goggles
//   ?spectate=peer:<code>    the goggles: connect to that name and send the talk's state
//
// The code is short (5 characters), kept in the laptop browser's storage so it stays the same across
// reloads and days, and can be bookmarked on the goggles. Anyone who knows it could steer the laptop's
// view, so it is random, not a word.
//
//   parsePeer(value)      'peer' | 'peer:abc12' -> { code } (code may be ''), else null
//   newCode()             5 random characters, no look-alikes (0/o, 1/l/i)
//   routeOf(type)         ICE candidate type -> 'direct' | 'internet' | 'relay'
//   host({ code, onData, onStatus })   the laptop's side
//   join({ code, onStatus }) -> { send(obj) -> bool }   the goggles' side
//   badge(corner) -> set(state, text, detail)          a small status pill on the page

const PREFIX = 'tdt16-xrtalk-';
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function parsePeer(v) {
  const m = /^peer(?::([a-z0-9]{1,16}))?$/i.exec(v ?? '');
  return m ? { code: (m[1] ?? '').toLowerCase() } : null;
}

export function newCode(n = 5, rand = Math.random) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}

// host: a local address (same network, or IPv6 straight through); srflx/prflx: through the router's
// public address (STUN); relay: through a TURN server
export const routeOf = (type) => (type === 'host' ? 'direct' : type === 'relay' ? 'relay' : type ? 'internet' : null);
export const ROUTE_TEXT = { direct: 'direct, same network', internet: 'direct, via the internet', relay: 'through the PeerJS relay' };

let lib = null;
function loadPeer() {
  lib ??= new Promise((res, rej) => {
    if (window.Peer) return res(window.Peer);
    const s = document.createElement('script');
    s.src = new URL('./vendor/peerjs-1.5.4.min.js', import.meta.url).href;   // MIT, vendored: no CDN on the day
    s.onload = () => res(window.Peer); s.onerror = () => rej(new Error('peerjs did not load'));
    document.head.append(s);
  });
  return lib;
}

async function route(conn) {
  try {
    const stats = await conn.peerConnection.getStats();
    let pair = null;
    stats.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId); });
    if (!pair) stats.forEach((r) => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
    return routeOf(pair && stats.get(pair.localCandidateId)?.candidateType);
  } catch { return null; }
}

export async function host({ code, onData, onStatus }) {
  const Peer = await loadPeer();
  let peer = null, conn = null, retry = null;
  const again = (ms) => { clearTimeout(retry); retry = setTimeout(open, ms); };
  function open() {
    peer?.destroy();
    onStatus('connecting', 'reaching the PeerJS server…');
    peer = new Peer(PREFIX + code);
    peer.on('open', () => onStatus('waiting', `code ${code}: waiting for the goggles`));
    peer.on('connection', (c) => {
      conn?.close(); conn = c;   // the latest goggles page wins (it reloaded, or a second one)
      c.on('open', async () => {
        onStatus('linked', 'goggles linked');
        const r = await route(c); if (conn === c && r) onStatus('linked', 'goggles linked', ROUTE_TEXT[r]);
      });
      c.on('data', (d) => { if (conn === c) onData(d); });
      c.on('close', () => { if (conn === c) { conn = null; onStatus('waiting', `code ${code}: goggles gone, waiting`); } });
    });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });   // lost the server, not the goggles
    peer.on('error', (e) => {
      // the name is still held for a few seconds after this page reloads; the server or internet may be down
      if (e.type === 'unavailable-id') { onStatus('connecting', `code ${code} still held, retrying…`); again(3000); }
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) { onStatus('error', 'no PeerJS server (internet?)', 'retrying'); again(4000); }
      else onStatus('error', e.type || String(e));
    });
  }
  open();
}

export async function join({ code, onStatus }) {
  const Peer = await loadPeer();
  let peer = null, conn = null, retry = null;
  const again = (ms) => { clearTimeout(retry); retry = setTimeout(dial, ms); };
  function dial() {
    if (!peer || peer.destroyed || peer.disconnected) return start();
    onStatus('connecting', `calling the laptop (code ${code})…`);
    const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
    c.on('open', async () => {
      conn = c; onStatus('linked', 'laptop linked');
      const r = await route(c); if (conn === c && r) onStatus('linked', 'laptop linked', ROUTE_TEXT[r]);
    });
    c.on('close', () => { if (conn === c) conn = null; onStatus('waiting', 'laptop gone, calling again'); again(2000); });
    c.on('error', () => again(3000));
  }
  function start() {
    peer?.destroy();
    onStatus('connecting', 'reaching the PeerJS server…');
    peer = new Peer();   // the goggles need no fixed name
    peer.on('open', dial);
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') { onStatus('waiting', `no laptop with code ${code} yet`); again(3000); }
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) { onStatus('error', 'no PeerJS server (internet?)', 'retrying'); setTimeout(start, 4000); }
      else { onStatus('error', e.type || String(e)); again(4000); }
    });
  }
  start();
  return {
    // false while unlinked or while the channel is backed up (the caller keeps what it would have sent)
    send(obj) {
      const dc = conn?.dataChannel;
      if (!conn?.open || !dc || dc.bufferedAmount > 64 * 1024) return false;
      conn.send(obj); return true;
    },
  };
}

// a pill in a corner: a coloured dot and a line. Once linked and quiet for 6 s it shrinks to the dot,
// so it can stay on the shared screen; any change opens it again.
export function badge(corner = 'top-right') {
  const el = document.createElement('div');
  const [v, h] = corner.split('-');
  Object.assign(el.style, {
    position: 'fixed', [v]: '12px', [h]: '12px', zIndex: 2147483647,   // above the emulator's session canvas
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '6px 10px', borderRadius: '999px', background: 'rgba(12,16,24,0.82)', color: '#dde3ea',
    font: '13px system-ui', pointerEvents: 'none', transition: 'opacity .4s',
  });
  const dot = document.createElement('span');
  Object.assign(dot.style, { width: '10px', height: '10px', borderRadius: '50%', flex: 'none' });
  const txt = document.createElement('span');
  el.append(dot, txt); document.body.append(el);
  const COL = { connecting: '#9aa3ad', waiting: '#f0b84a', linked: '#4fd17a', live: '#4fd17a', error: '#ef5b5b' };
  let fold = null;
  return (state, text, detail) => {
    el.dataset.state = state;
    dot.style.background = COL[state] ?? '#9aa3ad';
    txt.textContent = detail ? `${text} · ${detail}` : text; txt.style.display = '';
    clearTimeout(fold);
    if (state === 'live') fold = setTimeout(() => { txt.style.display = 'none'; }, 6000);
  };
}
