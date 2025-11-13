// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingTimeout: 60000 });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {}; // { roomId: { text, players: { socketId: {name, progress, finished, wpm, time} } } }

function createRoom(text) {
  const id = crypto.randomBytes(3).toString('hex');
  rooms[id] = { text, players: {}, createdAt: Date.now() };
  return id;
}

// simple route to create a room with custom text (for demo)
app.get('/create', (req, res) => {
  const text = req.query.text || 'default sample text for typing test';
  const id = createRoom(text);
  res.redirect(`/?room=${id}`);
});

io.on('connection', socket => {
  console.log('conn', socket.id);

  socket.on('join', ({ roomId, name }) => {
    if (!rooms[roomId]) return socket.emit('error', 'room not found');
    socket.join(roomId);
    rooms[roomId].players[socket.id] = { name, progress: 0, finished: false, wpm: 0, time: 0 };
    // send room info and current leaderboard
    socket.emit('roomInfo', { roomId, text: rooms[roomId].text });
    broadcastLeaderboard(roomId);
  });

  // throttled progress updates from client
  socket.on('progress', ({ roomId, progressPct }) => {
    const r = rooms[roomId];
    if (!r || !r.players[socket.id]) return;
    r.players[socket.id].progress = Math.max(r.players[socket.id].progress, progressPct);
    // broadcast a lightweight leaderboard (top 10 only)
    broadcastLeaderboard(roomId, { topN: 10 });
  });

  socket.on('finish', ({ roomId, timeSeconds, correctChars }) => {
    const r = rooms[roomId];
    if (!r || !r.players[socket.id]) return;
    r.players[socket.id].finished = true;
    r.players[socket.id].time = timeSeconds;
    // server-side compute WPM (simplified): words = correctChars / 5
    const wpm = Math.round((correctChars / 5) / (timeSeconds / 60));
    r.players[socket.id].wpm = wpm;
    broadcastLeaderboard(roomId, { final: true });
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      if (rooms[roomId].players[socket.id]) {
        delete rooms[roomId].players[socket.id];
        broadcastLeaderboard(roomId);
      }
    }
  });
});

function broadcastLeaderboard(roomId, opts = {}) {
  const r = rooms[roomId];
  if (!r) return;
  const list = Object.entries(r.players).map(([id, p]) => ({
    id, name: p.name, progress: p.progress, finished: p.finished, wpm: p.wpm, time: p.time
  }));
  // sort: finished first by time, then by progress desc
  list.sort((a,b) => {
    if (a.finished && b.finished) return a.time - b.time;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  const payload = { leaderboard: list, text: r.text };
  if (opts.topN) payload.leaderboard = list.slice(0, opts.topN);
  io.to(roomId).emit('leaderboard', payload);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening ${PORT}`));
