import { Board } from './board.js';
import { RemoteBoard } from './remote.js';
import { Renderer } from './renderer.js';
import { Controls, DemoControls, KEYMAPS } from './input.js';
import { sfx, toggleMute } from './sfx.js';
import { STEP } from './config.js';
import { MODES, STRUCTURE_KEYS, THEMES } from './modes.js';

const $ = id => document.getElementById(id);
const renderer = new Renderer($('game'));
const MEDALS = ['🥇', '🥈', '🥉', '4°'];

let game = null;
let demo = null;
let demoTimer = 0;
let socket = null;
let room = null;
let current = 'menu';
let acc = 0;
let last = performance.now();
let pauseTimer = null;

const pick = list => list[Math.floor(Math.random() * list.length)];
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function show(id) {
  current = id;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  $('ui').classList.toggle('hidden', id === null);
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
}

function makeDemo() {
  renderer.cams.delete('demo');
  demo = new Board({
    id: 'demo', name: '', seed: randomSeed(), controls: new DemoControls(), intro: 0,
    mode: 'race', structure: pick(STRUCTURE_KEYS), theme: pick(THEMES),
  });
  demoTimer = 0;
}

function stopGame() {
  game?.controls.forEach(c => c.dispose());
  game = null;
  clearInterval(pauseTimer);
}

function begin(extra) {
  [extra.board, ...extra.remotes].forEach(b => renderer.cams.delete(b.id));
  game = { over: false, reported: false, netTimer: 0, ...extra };
  show(null);
}

function startSolo(mode) {
  stopGame();
  const controls = [new Controls(KEYMAPS.all)];
  const board = new Board({
    id: 'solo', name: 'Tu', seed: randomSeed(), controls: controls[0], sfx,
    mode, structure: pick(STRUCTURE_KEYS), theme: pick(THEMES),
  });
  begin({ type: 'solo', mode, board, remotes: [], controls, label: `Allenamento · ${MODES[mode].name}` });
}

function startRound({ round, total, mode, structure, theme, players }) {
  stopGame();
  const controls = [new Controls(KEYMAPS.all)];
  const me = players.find(p => p.id === socket.id);
  const board = new Board({
    id: socket.id, name: me?.name ?? 'Tu', seed: randomSeed(), controls: controls[0], sfx, mode, structure, theme, darkSpells: true,
  });
  const remotes = players.filter(p => p.id !== socket.id).map(p => new RemoteBoard({ ...p, mode, structure, theme }));
  begin({ type: 'online', mode, board, remotes, controls, label: `Round ${round} di ${total} · ${MODES[mode].name}` });
}

function soloEnd() {
  if (game.over || game.type !== 'solo') return;
  const b = game.board;
  if (!['won', 'dead', 'done'].includes(b.state)) return;
  game.over = true;
  const titles = { won: 'Obiettivo raggiunto', dead: 'Torre crollata', done: 'Rompicapo finito' };
  const subs = {
    race: b.state === 'won' ? `Tempo: ${fmt(b.elapsed)}` : `Altezza massima: ${b.maxHeight.toFixed(1)} m`,
    survival: `Pezzi in piedi: ${b.score} su ${MODES.survival.target}`,
    puzzle: `Pezzi sotto il laser: ${b.score}`,
  };
  $('endTitle').textContent = titles[b.state];
  $('endSub').textContent = subs[b.mode];
  setTimeout(() => { if (game?.over) show('end'); }, 1300);
}

function netTick(dt) {
  const b = game.board;
  game.netTimer -= dt;
  if (game.netTimer <= 0) {
    game.netTimer = 1 / 15;
    socket.volatile.emit('state', b.snapshot());
  }
  while (b.outbox.length) socket.emit('spell', { spell: b.outbox.shift() });
  if (!game.reported && ['won', 'dead', 'done'].includes(b.state)) {
    game.reported = true;
    socket.emit('status', { state: b.state, score: b.score, height: b.height });
  }
}

function renderLobby() {
  if (!room) return;
  $('roomCode').textContent = room.code;
  $('players').replaceChildren(...room.players.map(p => {
    const li = document.createElement('li');
    li.textContent = `${p.name}${p.id === room.hostId ? ' 👑' : ''}${p.id === socket.id ? ' (tu)' : ''}`;
    return li;
  }));
  const host = room.hostId === socket.id;
  $('setSelect').value = room.settings.set;
  $('roundSelect').value = String(room.settings.rounds);
  $('setSelect').disabled = !host;
  $('roundSelect').disabled = !host;
  $('startBtn').hidden = !host;
  $('startBtn').disabled = room.players.length < 2;
  $('waitMsg').hidden = host;
}

function rankingList(target, rows, { withGain }) {
  target.replaceChildren(...rows.map((r, i) => {
    const li = document.createElement('li');
    if (r.id === socket?.id) li.classList.add('me');
    const medal = document.createElement('span');
    medal.className = 'medal';
    medal.textContent = MEDALS[i] ?? `${i + 1}°`;
    const name = document.createElement('span');
    name.className = 'who';
    name.textContent = r.name;
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = withGain ? `+${r.gained} · ${r.points} pt` : `${r.points} pt`;
    li.append(medal, name, pts);
    return li;
  }));
}

function onRoundOver({ round, total, mode, ranking, last: final, pause }) {
  if (!game || game.type !== 'online') return;
  game.board.freeze();
  game.remotes.forEach(r => r.freeze());
  game.over = true;
  $('resultsTitle').textContent = `Round ${round} di ${total} · ${MODES[mode].name}`;
  rankingList($('ranking'), ranking, { withGain: true });
  const endAt = performance.now() + pause;
  const note = () => {
    const s = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
    $('resultsNote').textContent = final ? `Classifica finale tra ${s} s` : `Prossimo round tra ${s} s`;
  };
  note();
  clearInterval(pauseTimer);
  pauseTimer = setInterval(note, 250);
  setTimeout(() => { if (game?.over) show('results'); }, 900);
}

function onCupOver({ standings }) {
  stopGame();
  const winner = standings[0];
  $('cupTitle').textContent = winner?.id === socket.id ? 'Hai vinto la coppa!' : `Coppa a ${winner?.name ?? 'nessuno'}`;
  rankingList($('standings'), standings, { withGain: false });
  show('cup');
}

function connect() {
  if (socket) return true;
  if (typeof io === 'undefined') {
    toast('Server non raggiungibile: avvia il gioco con npm start');
    return false;
  }
  socket = io();
  socket.on('lobby', data => {
    room = data;
    renderLobby();
    if (current === 'online') show('lobby');
  });
  socket.on('round', startRound);
  socket.on('roundOver', onRoundOver);
  socket.on('cupOver', onCupOver);
  socket.on('peer', ({ id, snap }) => game?.remotes.find(r => r.id === id)?.apply(snap));
  socket.on('playerLeft', ({ id }) => game?.remotes.find(r => r.id === id)?.markLeft());
  socket.on('hex', ({ spell, from }) => game?.board.applyHex(spell, from));
  socket.on('hexSent', ({ spell, to }) => game?.board.events.push({ type: 'sent', spell, to }));
  socket.on('errorMsg', toast);
  socket.on('disconnect', () => {
    toast('Connessione al server persa');
    room = null;
  });
  return true;
}

function playerName() {
  const name = $('name').value.trim();
  try { localStorage.setItem('torri-name', name); } catch {}
  return name;
}

function goMenu() {
  if (socket && room) socket.emit('leave');
  room = null;
  stopGame();
  show('menu');
}

function sendSettings() {
  socket.emit('settings', { set: $('setSelect').value, rounds: Number($('roundSelect').value) });
}

const actions = {
  online: () => { if (connect()) show('online'); },
  training: () => show('training'),
  race: () => startSolo('race'),
  survival: () => startSolo('survival'),
  puzzle: () => startSolo('puzzle'),
  create: () => socket.emit('create', { name: playerName() }, res => (res.ok ? show('lobby') : toast(res.error))),
  join: () => socket.emit('join', { name: playerName(), code: $('code').value }, res => (res.ok ? show('lobby') : toast(res.error))),
  start: () => socket.emit('start'),
  again: () => startSolo(game?.mode ?? 'race'),
  lobby: () => { renderLobby(); show(room ? 'lobby' : 'menu'); },
  menu: goMenu,
};

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (btn && !btn.disabled) actions[btn.dataset.action]?.();
});

$('setSelect').addEventListener('change', sendSettings);
$('roundSelect').addEventListener('change', sendSettings);

addEventListener('keydown', e => {
  if (e.code === 'Escape' && game) goMenu();
  if (e.code === 'Enter' && e.target.id === 'code') actions.join();
  if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) toast(toggleMute() ? 'Audio disattivato' : 'Audio attivo');
});

try { $('name').value = localStorage.getItem('torri-name') ?? ''; } catch {}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc = Math.min(acc + dt, 0.25);
  const board = game ? game.board : demo;
  while (acc >= STEP) {
    board.step(STEP);
    acc -= STEP;
  }
  const alpha = acc / STEP;
  let views;
  if (game) {
    game.remotes.forEach(r => r.tick(dt));
    if (game.type === 'online' && socket) netTick(dt);
    soloEnd();
    const mine = { ...game.board.view(alpha), roundLabel: game.label };
    views = [mine, ...game.remotes.map(r => r.view())];
  } else {
    if (demo.state !== 'playing' && demo.state !== 'intro' && (demoTimer += dt) > 2.5) makeDemo();
    views = [{ ...demo.view(alpha), hud: false }];
  }
  renderer.draw(views, dt, now / 1000);
  requestAnimationFrame(frame);
}

makeDemo();
requestAnimationFrame(frame);
