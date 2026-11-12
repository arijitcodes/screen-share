// Minimal signaling server: serves the page and relays WebRTC messages. Media never touches this server.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { WebSocketServer } = require('ws');

const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const server = http.createServer((req, res) => {
  if (req.url === '/lan') { // LAN IPv4 addresses, so the host page can build a link that other devices can open
    const ips = Object.values(os.networkInterfaces()).flat()
      .filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(ips));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // roomId -> { host: ws|null, viewers: Map<id, ws> }
const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));

wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const roomId = q.get('room');
  const role = q.get('role');
  if (!/^[0-9a-f-]{36}$/.test(roomId || '')) return ws.close();

  let room = rooms.get(roomId);
  if (!room) rooms.set(roomId, (room = { host: null, viewers: new Map(), max: 1 }));

  ws.id = randomUUID();
  if (role === 'host') {
    if (room.host) { send(ws, { type: 'error', msg: 'Room already has a host' }); return ws.close(); }
    room.host = ws;
    room.viewers.forEach((_, id) => send(ws, { type: 'viewer-joined', id }));
  } else {
    if (room.viewers.size >= room.max) { send(ws, { type: 'full' }); return ws.close(); }
    room.viewers.set(ws.id, ws);
    if (room.host) send(room.host, { type: 'viewer-joined', id: ws.id });
    else send(ws, { type: 'waiting' });
  }

  ws.on('message', (data) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (ws === room.host) {
      if (m.type === 'max') room.max = Math.min(Math.max(parseInt(m.n) || 1, 1), 50); // host sets viewer limit
      else if (m.type === 'stopped') room.viewers.forEach((v) => send(v, { type: 'stopped' }));
      else send(room.viewers.get(m.to), { ...m, from: 'host' });
    } else send(room.host, { ...m, from: ws.id });
  });

  ws.on('close', () => {
    if (ws === room.host) {
      room.host = null;
      room.viewers.forEach((v) => send(v, { type: 'host-left' }));
    } else {
      room.viewers.delete(ws.id);
      send(room.host, { type: 'viewer-left', id: ws.id });
    }
    if (!room.host && !room.viewers.size) rooms.delete(roomId);
  });
});

// Heartbeat so proxies never see the signaling socket as idle.
setInterval(() => wss.clients.forEach((c) => c.readyState === 1 && c.ping()), 25000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
