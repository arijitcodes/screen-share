// Signaling server for the screen-share app.
// It serves the page and relays small WebRTC handshake messages between a room's host and its viewers.
// Video and audio never pass through here: they go directly browser <-> browser.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const ID_FORMAT = /^[0-9a-f-]{36}$/; // room ids and host tokens are both UUIDs
const MAX_VIEWERS_LIMIT = 50;

// Handshake message types each side may send. Anything else is dropped.
const HOST_RELAY = new Set(['offer', 'ice']);
const VIEWER_RELAY = new Set(['answer', 'ice']);

// ---------- Web server: serves the single page ----------
const pagePath = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, 'index.html')].find(fs.existsSync);
const page = fs.readFileSync(pagePath);

// /lan is only answered when the page was opened via localhost (not via your public domain).
const isLocalhost = (req) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');

const server = http.createServer((req, res) => {
  if (req.url === '/lan' && isLocalhost(req)) {
    const ips = Object.values(os.networkInterfaces()).flat()
      .filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(ips));
  }
  // Every other URL (/, /r/<uuid>) gets the same page; its script reads the URL to pick a mode.
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
});

// ---------- Signaling: rooms over WebSocket ----------
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
const rooms = new Map(); // roomId -> { host, hostToken, viewers: Map<id, ws>, max }

const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));
// Rebuild a handshake message from known fields only, and stamp who sent it.
const relayed = (m, from) => ({ type: m.type, sdp: m.sdp, candidate: m.candidate, from });

wss.on('connection', (ws, req) => {
  ws.on('error', () => {}); // a bad socket must never crash the process

  const q = new URL(req.url, 'http://x').searchParams;
  const roomId = q.get('room');
  const role = q.get('role') === 'host' ? 'host' : 'viewer';
  const token = q.get('token');
  if (!ID_FORMAT.test(roomId || '') || (role === 'host' && !ID_FORMAT.test(token || ''))) return ws.close();

  let room = rooms.get(roomId);
  if (!room) rooms.set(roomId, (room = { host: null, hostToken: null, viewers: new Map(), max: 1 }));

  ws.role = role;
  ws.id = randomUUID();
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));

  if (role === 'host') {
    // The first host sets the room's secret token; only that token may host it later.
    if (room.hostToken && room.hostToken !== token) {
      send(ws, { type: 'error', msg: 'This room already has a different host' });
      return ws.close();
    }
    room.hostToken = token;
    room.host?.terminate(); // same host reconnecting (e.g. page reload): replace the old socket
    room.host = ws;
    room.viewers.forEach((_, id) => send(ws, { type: 'viewer-joined', id }));
  } else {
    if (room.viewers.size >= room.max) { send(ws, { type: 'full' }); return ws.close(); }
    room.viewers.set(ws.id, ws);
    if (room.host) send(room.host, { type: 'viewer-joined', id: ws.id });
    else send(ws, { type: 'waiting' });
  }

  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (role === 'host') {
      if (ws !== room.host) return; // stale socket that was replaced
      if (m.type === 'max') room.max = Math.min(Math.max(parseInt(m.n) || 1, 1), MAX_VIEWERS_LIMIT);
      else if (m.type === 'stopped') room.viewers.forEach((v) => send(v, { type: 'stopped' }));
      else if (HOST_RELAY.has(m.type)) send(room.viewers.get(m.to), relayed(m, 'host'));
    } else if (VIEWER_RELAY.has(m.type)) {
      send(room.host, relayed(m, ws.id));
    }
  });

  ws.on('close', () => {
    if (role === 'host') {
      if (room.host !== ws) return; // already replaced by a newer host connection
      room.host = null;
      room.viewers.forEach((v) => send(v, { type: 'host-left' }));
    } else {
      room.viewers.delete(ws.id);
      send(room.host, { type: 'viewer-left', id: ws.id });
    }
    if (!room.host && !room.viewers.size) rooms.delete(roomId);
  });
});

// Heartbeat: keeps proxies from closing idle sockets and drops dead ones.
setInterval(() => wss.clients.forEach((c) => {
  if (!c.alive) return c.terminate();
  c.alive = false;
  c.ping();
}), 25000);

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
