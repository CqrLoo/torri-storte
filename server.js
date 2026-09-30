const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 4;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MODES = ['race', 'survival', 'puzzle'];
const SETS = ['mix', ...MODES];
const ROUND_OPTIONS = [1, 3, 5, 7];
const STRUCTURES = {
  race: ['torre', 'gemella', 'larga'],
  survival: ['torre', 'gemella', 'larga'],
  puzzle: ['torre', 'gemella', 'larga'],
};
const DARK_SPELLS = ['maledetto', 'ghiaccio', 'nebbia'];
const THEMES = ['canyon', 'alpi', 'ghiaccio'];
const POINTS = [5, 3, 2, 1];
const ROUND_LIMIT = 4 * 60 * 1000;
const PAUSE = 7000;
const RESULTS = ['won', 'dead', 'done'];

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/planck', express.static(path.join(__dirname, 'node_modules/planck/dist')));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });
const rooms = new Map();

const pick = list => list[Math.floor(Math.random() * list.length)];
const num = v => (Number.isFinite(v) ? v : 0);

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => pick(LETTERS)).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(name) {
  return String(name ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Anonimo';
}

function playerList(room) {
  return [...room.players.values()].map(({ id, name, points }) => ({ id, name, points }));
}

function broadcastLobby(room) {
  io.to(room.code).emit('lobby', {
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    settings: room.settings,
    players: playerList(room),
  });
}

function standings(room) {
  return playerList(room).sort((a, b) => b.points - a.points);
}

function endCup(room) {
  clearTimeout(room.timer);
  room.state = 'lobby';
  io.to(room.code).emit('cupOver', { standings: standings(room) });
  broadcastLobby(room);
}

function nextRound(room) {
  clearTimeout(room.timer);
  if (room.players.size < 2) return endCup(room);
  room.round += 1;
  room.mode = room.schedule[room.round - 1];
  room.state = 'playing';
  room.order = 0;
  room.players.forEach(p => Object.assign(p, { result: null, score: 0, height: 0, order: 0, progress: 0 }));
  io.to(room.code).emit('round', {
    round: room.round,
    total: room.schedule.length,
    mode: room.mode,
    structure: pick(STRUCTURES[room.mode]),
    theme: pick(THEMES),
    players: playerList(room),
  });
  room.timer = setTimeout(() => endRound(room), ROUND_LIMIT);
}

function startCup(room) {
  const { set, rounds } = room.settings;
  const offset = Math.floor(Math.random() * MODES.length);
  room.schedule = Array.from({ length: rounds }, (_, i) => (set === 'mix' ? MODES[(offset + i) % MODES.length] : set));
  room.round = 0;
  room.players.forEach(p => { p.points = 0; });
  nextRound(room);
}

function endRound(room) {
  if (room.state !== 'playing') return;
  clearTimeout(room.timer);
  room.state = 'pause';
  const metric = p => (room.mode === 'race' ? p.height : p.score);
  const tier = p => (p.result === 'won' ? 0 : room.mode !== 'puzzle' && p.result === 'dead' ? 2 : 1);
  const players = [...room.players.values()].sort((a, b) => {
    if (tier(a) !== tier(b)) return tier(a) - tier(b);
    if (tier(a) === 0) return a.order - b.order;
    if (tier(a) === 2) return b.order - a.order;
    return metric(b) - metric(a) || (a.order || Infinity) - (b.order || Infinity);
  });
  const ranking = players.map((p, i) => {
    const gained = POINTS[i] ?? 0;
    p.points += gained;
    return { id: p.id, name: p.name, place: i + 1, gained, points: p.points, score: metric(p), result: p.result };
  });
  const last = room.round >= room.schedule.length;
  io.to(room.code).emit('roundOver', { round: room.round, total: room.schedule.length, mode: room.mode, ranking, last, pause: PAUSE });
  room.timer = setTimeout(() => (last ? endCup(room) : nextRound(room)), PAUSE);
}

function evaluate(room) {
  if (room.state !== 'playing') return;
  const list = [...room.players.values()];
  const open = list.filter(p => !p.result);
  if (room.mode !== 'puzzle' && list.some(p => p.result === 'won')) return endRound(room);
  if (room.mode !== 'puzzle' && open.length <= 1 && list.length > 1) {
    if (open[0]) {
      open[0].result = 'won';
      open[0].order = ++room.order;
    }
    return endRound(room);
  }
  if (open.length === 0) endRound(room);
}

io.on('connection', socket => {
  let room = null;

  const leave = () => {
    if (!room) return;
    const current = room;
    room = null;
    current.players.delete(socket.id);
    socket.leave(current.code);
    io.to(current.code).emit('playerLeft', { id: socket.id });
    if (current.players.size === 0) {
      clearTimeout(current.timer);
      rooms.delete(current.code);
      return;
    }
    if (current.hostId === socket.id) current.hostId = current.players.keys().next().value;
    evaluate(current);
    broadcastLobby(current);
  };

  const enter = (target, name) => {
    room = target;
    room.players.set(socket.id, { id: socket.id, name: cleanName(name), points: 0, result: null, score: 0, height: 0, order: 0 });
    socket.join(room.code);
    broadcastLobby(room);
  };

  socket.on('create', (data, reply) => {
    if (typeof reply !== 'function') return;
    leave();
    const code = makeCode();
    const target = { code, hostId: socket.id, state: 'lobby', settings: { set: 'mix', rounds: 5 }, players: new Map(), round: 0, schedule: [], timer: null };
    rooms.set(code, target);
    reply({ ok: true, code });
    enter(target, data?.name);
  });

  socket.on('join', (data, reply) => {
    if (typeof reply !== 'function') return;
    const target = rooms.get(String(data?.code ?? '').trim().toUpperCase());
    if (!target) return reply({ ok: false, error: 'Stanza non trovata: controlla il codice' });
    if (target.state !== 'lobby') return reply({ ok: false, error: 'Coppa già in corso, riprova alla fine' });
    if (target.players.size >= MAX_PLAYERS) return reply({ ok: false, error: `Stanza piena (massimo ${MAX_PLAYERS})` });
    leave();
    reply({ ok: true, code: target.code });
    enter(target, data?.name);
  });

  socket.on('settings', data => {
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    if (SETS.includes(data?.set)) room.settings.set = data.set;
    if (ROUND_OPTIONS.includes(Number(data?.rounds))) room.settings.rounds = Number(data.rounds);
    broadcastLobby(room);
  });

  socket.on('start', () => {
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    if (room.players.size < 2) return socket.emit('errorMsg', 'Servono almeno 2 giocatori');
    startCup(room);
  });

  socket.on('state', snap => {
    if (!room || room.state !== 'playing' || !snap || typeof snap !== 'object') return;
    const player = room.players.get(socket.id);
    if (player && !player.result) {
      player.score = num(snap.sc);
      player.height = num(snap.h);
      player.progress = num(snap.pg);
    }
    socket.to(room.code).volatile.emit('peer', { id: socket.id, snap });
  });

  socket.on('status', data => {
    const player = room?.players.get(socket.id);
    if (!player || room.state !== 'playing' || player.result || !RESULTS.includes(data?.state)) return;
    player.result = data.state;
    player.order = ++room.order;
    player.score = num(data.score);
    player.height = num(data.height);
    evaluate(room);
  });

  socket.on('spell', data => {
    const caster = room?.players.get(socket.id);
    if (!caster || room.state !== 'playing' || !DARK_SPELLS.includes(data?.spell)) return;
    const targets = [...room.players.values()].filter(p => p.id !== socket.id && !p.result);
    if (!targets.length) return;
    const target = targets.sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))[0];
    io.to(target.id).emit('hex', { spell: data.spell, from: caster.name });
    socket.emit('hexSent', { spell: data.spell, to: target.name });
  });

  socket.on('leave', leave);
  socket.on('disconnect', leave);
});

server.listen(PORT, () => console.log(`Torri Storte pronto su http://localhost:${PORT}`));
