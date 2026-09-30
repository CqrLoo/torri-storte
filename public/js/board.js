import {
  U, WORLD_W, PLATFORM_W, PX, LIVES, FALL_SPEED, FAST_SPEED, DAS, ARR, SPAWN_DELAY, SPAWN_GAP, KILL_Y,
  TEST_SCALE, INTRO_TIME, GRAVITY, SUBSTEPS, FRICTION, ANGULAR_DAMPING, SETTLE_DAMPING, SETTLE_TIME, MAX_IMPACT,
} from './config.js';
import { Bag, pieceGeometry, CURSED } from './pieces.js';
import { MODES, STRUCTURES, SPELLS, LIGHT_SPELLS, DARK_SPELLS, SPELL_EVERY, goalLines } from './modes.js';

const { World, Vec2, Box } = planck;

const HALF = U / 2;
const CELL = U / 2;
const PROBE = CELL * TEST_SCALE;
const MARGIN = CELL - PROBE;
const KICKS = [[0, 0], [-HALF, 0], [HALF, 0], [-U, 0], [U, 0], [0, -HALF]];
const MATERIAL = { friction: FRICTION, restitution: 0 };
const NOOP = { move() {}, rotate() {}, land() {}, lose() {}, tick() {}, go() {}, done() {}, win() {}, cast() {}, hex() {} };
const ICE_FRICTION = 0.05;

const snap = x => Math.round(x / HALF) * HALF;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const r1 = n => Math.round(n * 10) / 10;
const pick = list => list[Math.floor(Math.random() * list.length)];

function overlap(ax, ay, bx, by, c, s) {
  const dx = bx - ax;
  const dy = by - ay;
  const spread = Math.abs(c) + Math.abs(s);
  const reachB = CELL * spread;
  if (Math.abs(dx) >= PROBE + reachB || Math.abs(dy) >= PROBE + reachB) return false;
  const reachA = PROBE * spread;
  return Math.abs(dx * c + dy * s) < CELL + reachA && Math.abs(dy * c - dx * s) < CELL + reachA;
}

export class Board {
  constructor({ id, name, seed, controls, sfx, mode = 'race', structure = 'torre', theme = 'canyon', intro = INTRO_TIME, darkSpells = false }) {
    this.id = id;
    this.name = name;
    this.controls = controls;
    this.sfx = sfx ?? NOOP;
    this.mode = mode;
    this.cfg = MODES[mode];
    this.lines = goalLines(mode);
    this.structureName = structure;
    this.theme = theme;
    this.structure = (STRUCTURES[structure] ?? []).map(([cx, cy]) => ({ x: PX + cx * U, y: -(cy + 1) * U }));
    this.baseTop = Math.min(0, ...this.structure.map(c => c.y));
    this.world = new World({ gravity: new Vec2(0, GRAVITY) });
    const ground = this.world.createBody({ type: 'static', position: new Vec2(WORLD_W / 2 / U, 0.4) });
    ground.createFixture(new Box(PLATFORM_W / 2 / U, 0.4), MATERIAL);
    if (this.structure.length) {
      const core = this.world.createBody({ type: 'static', position: new Vec2(0, 0) });
      for (const c of this.structure) core.createFixture(new Box(0.5, 0.5, new Vec2((c.x + CELL) / U, (c.y + CELL) / U), 0), MATERIAL);
    }
    this.bodies = [];
    this.bag = new Bag(seed);
    this.lives = LIVES;
    this.state = 'intro';
    this.introTimer = intro;
    this.lastTick = Math.ceil(intro);
    this.active = null;
    this.spawnTimer = 0;
    this.holdTimer = 0;
    this.idleTimer = 0;
    this.towerTop = this.baseTop;
    this.maxHeight = this.height;
    this.elapsed = 0;
    this.pieceId = 1;
    this.spawned = 0;
    this.score = 0;
    this.crossed = false;
    this.allResting = true;
    this.moveDir = 0;
    this.repeatTimer = 0;
    this.events = [];
    this.forced = [];
    this.spellPool = darkSpells ? [...LIGHT_SPELLS, ...DARK_SPELLS] : LIGHT_SPELLS;
    this.spell = null;
    this.landedCount = 0;
    this.icy = 0;
    this.fog = 0;
    this.outbox = [];
  }

  get height() {
    return -this.towerTop / U;
  }

  get progress() {
    if (this.mode === 'race') return clamp(this.height / this.cfg.finish, 0, 1);
    if (this.mode === 'survival') return clamp(this.score / this.cfg.target, 0, 1);
    return clamp(this.score / this.cfg.pieces, 0, 1);
  }

  collides(ox, oy, cells) {
    for (const [cx, cy] of cells) {
      const ax = ox + (cx + 0.5) * U;
      const ay = oy + (cy + 0.5) * U;
      if (ax + PROBE > PX && ax - PROBE < PX + PLATFORM_W && ay + PROBE > 0 && ay - PROBE < U * 0.8) return true;
      for (const c of this.structure) {
        if (Math.abs(ax - c.x - CELL) < PROBE + CELL && Math.abs(ay - c.y - CELL) < PROBE + CELL) return true;
      }
      for (const e of this.bodies) {
        if (Math.abs(e.px - ax) > e.reach || Math.abs(e.py - ay) > e.reach) continue;
        for (const [rx, ry] of e.g.rel) {
          if (overlap(ax, ay, e.px + rx * e.c - ry * e.s, e.py + rx * e.s + ry * e.c, e.c, e.s)) return true;
        }
      }
    }
    return false;
  }

  canSpawn() {
    if (this.mode === 'puzzle') return this.spawned < this.cfg.pieces;
    if (this.mode === 'survival') return this.score < this.cfg.target;
    return true;
  }

  fallSpeed() {
    return this.mode === 'survival' ? FALL_SPEED * (1 + this.spawned * 0.04) : FALL_SPEED;
  }

  spawn() {
    const type = this.forced.length ? this.forced.shift() : this.bag.next();
    const g = pieceGeometry(type, 0);
    const oy = this.towerTop - SPAWN_GAP * U - g.h * U;
    const icy = this.icy > 0;
    if (icy) this.icy -= 1;
    this.spawned += 1;
    this.active = { n: this.spawned, type, r: 0, g, icy, ox: snap(WORLD_W / 2 - (g.w * U) / 2), oy, poy: oy, speed: FALL_SPEED };
    this.moveDir = 0;
    this.controls.clearPressed();
  }

  shift(dir) {
    const a = this.active;
    const nx = a.ox + dir * HALF;
    if (nx < 0 || nx + a.g.w * U > WORLD_W || this.collides(nx, a.oy, a.g.cells)) return;
    a.ox = nx;
    this.sfx.move();
  }

  rotate() {
    const a = this.active;
    const r = (a.r + 1) % 4;
    const g = pieceGeometry(a.type, r);
    const baseX = clamp(snap(a.ox + ((a.g.w - g.w) * U) / 2), 0, WORLD_W - g.w * U);
    const baseY = a.oy + ((a.g.h - g.h) * U) / 2;
    for (const [kx, ky] of KICKS) {
      const nx = baseX + kx;
      if (nx < 0 || nx + g.w * U > WORLD_W || this.collides(nx, baseY + ky, g.cells)) continue;
      Object.assign(a, { r, g, ox: nx, oy: baseY + ky, poy: baseY + ky });
      this.sfx.rotate();
      return;
    }
  }

  handleInput(dt) {
    const c = this.controls;
    if (c.consume('rotate')) this.rotate();
    if (c.consume('left')) { this.shift(-1); this.moveDir = -1; this.repeatTimer = DAS; }
    if (c.consume('right')) { this.shift(1); this.moveDir = 1; this.repeatTimer = DAS; }
    const held = (c.held('right') ? 1 : 0) - (c.held('left') ? 1 : 0);
    if (held === 0 || held !== this.moveDir) {
      this.moveDir = 0;
      return;
    }
    this.repeatTimer -= dt;
    while (this.repeatTimer <= 0) {
      this.shift(this.moveDir);
      this.repeatTimer += ARR;
    }
  }

  contactY(y, ny) {
    const a = this.active;
    let lo = y;
    let hi = ny;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (this.collides(a.ox, mid, a.g.cells)) hi = mid;
      else lo = mid;
    }
    return lo - MARGIN;
  }

  fall(dt) {
    const a = this.active;
    a.poy = a.oy;
    a.speed = this.controls.held('down') ? FAST_SPEED : this.fallSpeed();
    const ny = a.oy + a.speed * dt;
    if (this.collides(a.ox, ny, a.g.cells)) {
      a.oy = this.contactY(a.oy, ny);
      this.land();
      return;
    }
    a.oy = ny;
    if (a.oy > U * 1.5) {
      this.active = null;
      this.spawnTimer = SPAWN_DELAY;
      this.loseLife(a.ox + a.g.off.x);
    }
  }

  ghost() {
    const a = this.active;
    if (!a) return null;
    for (let y = a.oy; y < U * 1.5; y += U / 4) {
      if (this.collides(a.ox, y + U / 4, a.g.cells)) return this.contactY(y, y + U / 4);
    }
    return null;
  }

  sync(e) {
    const p = e.body.getPosition();
    e.px = p.x * U;
    e.py = p.y * U;
    e.a = e.body.getAngle();
    e.c = Math.cos(e.a);
    e.s = Math.sin(e.a);
  }

  land() {
    const a = this.active;
    const body = this.world.createBody({
      type: 'dynamic',
      position: new Vec2((a.ox + a.g.off.x) / U, (a.oy + a.g.off.y) / U),
      angularDamping: ANGULAR_DAMPING,
      linearDamping: 0.05,
    });
    const friction = a.icy ? ICE_FRICTION : FRICTION;
    for (const [rx, ry] of a.g.rel) body.createFixture(new Box(0.5, 0.5, new Vec2(rx / U, ry / U), 0), { density: 1, friction, restitution: 0 });
    body.setLinearVelocity(new Vec2(0, Math.min(a.speed / U, MAX_IMPACT)));
    const entry = {
      body,
      g: a.g,
      piece: { id: this.pieceId++, type: a.type, r: a.r },
      reach: a.g.radius + CELL * 1.5 + PROBE,
      falling: false,
      settle: 0,
      settled: false,
      icy: a.icy,
      rooted: false,
    };
    this.sync(entry);
    Object.assign(entry, { ppx: entry.px, ppy: entry.py, pa: entry.a });
    this.bodies.push(entry);
    this.events.push({ type: 'land', x: entry.px, y: a.oy + a.g.h * U, w: a.g.w * U, piece: a.type });
    this.sfx.land();
    this.active = null;
    this.spawnTimer = SPAWN_DELAY;
    this.landedCount += 1;
    if (!this.spell && this.landedCount % SPELL_EVERY === 0) {
      this.spell = pick(this.spellPool);
      this.events.push({ type: 'gain', spell: this.spell });
    }
  }

  useSpell() {
    const spell = this.spell;
    if (!spell || this.state !== 'playing') return;
    this.spell = null;
    this.events.push({ type: 'cast', spell });
    this.sfx.cast();
    if (SPELLS[spell].side === 'dark') {
      this.outbox.push(spell);
      return;
    }
    if (spell === 'mattoncino') this.forced.push('D', 'D');
    if (spell === 'radici') {
      for (const e of this.bodies) {
        if (e.rooted || e.falling || !e.settled) continue;
        e.rooted = true;
        if (e.body.setStatic) e.body.setStatic();
        else e.body.setType('static');
      }
    }
  }

  applyHex(spell, from) {
    if (!SPELLS[spell] || SPELLS[spell].side !== 'dark' || (this.state !== 'playing' && this.state !== 'intro')) return;
    if (spell === 'maledetto') this.forced.unshift(pick(CURSED));
    if (spell === 'ghiaccio') this.icy = 3;
    if (spell === 'nebbia') this.fog = 10;
    this.events.push({ type: 'hex', spell, from });
    this.sfx.hex();
  }

  loseLife(x) {
    if (this.state !== 'playing') return;
    this.lives -= 1;
    this.events.push({ type: 'lost', x });
    this.sfx.lose();
    if (this.lives <= 0) this.finish('dead');
  }

  finish(result) {
    this.state = result;
    this.active = null;
    this.events.push({ type: result });
    if (result === 'won') this.sfx.win();
    if (result === 'done') this.sfx.done();
  }

  settle(e, speed, spin, dt) {
    if (speed < 0.35 && spin < 0.35) {
      e.settle += dt;
      if (e.settle > SETTLE_TIME && !e.settled) {
        e.settled = true;
        e.body.setAngularDamping(SETTLE_DAMPING);
        e.body.setLinearDamping(0.6);
      }
      return;
    }
    e.settle = 0;
    if (e.settled && (speed > 1.5 || spin > 1.2)) {
      e.settled = false;
      e.body.setAngularDamping(ANGULAR_DAMPING);
      e.body.setLinearDamping(0.05);
    }
  }

  physics(dt) {
    for (const e of this.bodies) {
      e.ppx = e.px;
      e.ppy = e.py;
      e.pa = e.a;
    }
    const h = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) this.world.step(h, 12, 10);
    const laser = this.lines.laser;
    let top = this.baseTop;
    let below = 0;
    let crossed = false;
    let standing = 0;
    let resting = true;
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const e = this.bodies[i];
      this.sync(e);
      if (e.py > KILL_Y || Math.abs(e.px - WORLD_W / 2) > WORLD_W) {
        this.world.destroyBody(e.body);
        this.bodies.splice(i, 1);
        this.loseLife(e.px);
        continue;
      }
      const v = e.body.getLinearVelocity();
      const speed = Math.hypot(v.x, v.y);
      const spin = Math.abs(e.body.getAngularVelocity());
      e.falling = e.py > U * 0.8 && v.y > 2;
      if (!e.falling) standing += 1;
      if (!e.rooted) this.settle(e, speed, spin, dt);
      if (e.body.isAwake() && (speed >= 0.15 || spin >= 0.1)) {
        resting = false;
        continue;
      }
      const ext = CELL * (Math.abs(e.c) + Math.abs(e.s));
      let pieceTop = Infinity;
      for (const [rx, ry] of e.g.rel) {
        const cy = e.py + rx * e.s + ry * e.c;
        if (cy + ext < U) pieceTop = Math.min(pieceTop, cy - ext);
      }
      if (pieceTop === Infinity) continue;
      top = Math.min(top, pieceTop);
      if (laser !== null) {
        if (pieceTop >= laser - 2) below += 1;
        else crossed = true;
      }
    }
    this.towerTop = top;
    this.allResting = resting;
    this.maxHeight = Math.max(this.maxHeight, this.height);
    if (this.mode === 'puzzle') {
      this.score = below;
      this.crossed = crossed;
    }
    if (this.mode === 'survival') this.score = standing;
    if (this.mode === 'race') this.score = r1(this.height);
  }

  hold(ok, dt) {
    if (!ok) {
      this.holdTimer = 0;
      return;
    }
    this.holdTimer += dt;
    if (this.holdTimer >= this.cfg.hold) this.finish('won');
  }

  checkGoal(dt) {
    if (this.mode === 'race') return this.hold(this.height >= this.cfg.finish, dt);
    if (this.mode === 'survival') return this.hold(this.score >= this.cfg.target && !this.active && this.allResting, dt);
    if (this.crossed) return this.finish('done');
    if (!this.canSpawn() && !this.active && this.allResting) {
      this.idleTimer += dt;
      if (this.idleTimer > 1) this.finish('done');
    } else {
      this.idleTimer = 0;
    }
  }

  step(dt) {
    if (this.state === 'intro') {
      this.introTimer -= dt;
      const tick = Math.ceil(this.introTimer);
      if (tick < this.lastTick && tick > 0) this.sfx.tick();
      this.lastTick = tick;
      if (this.introTimer <= 0) {
        this.state = 'playing';
        this.events.push({ type: 'go' });
        this.sfx.go();
      }
      this.physics(dt);
      return;
    }
    this.fog = Math.max(0, this.fog - dt);
    if (this.state === 'playing') {
      this.elapsed += dt;
      if (this.controls.consume('spell')) this.useSpell();
      if (this.active) {
        this.handleInput(dt);
        this.fall(dt);
      } else if (this.canSpawn() && (this.spawnTimer -= dt) <= 0) {
        this.spawn();
      }
    }
    this.physics(dt);
    if (this.state === 'playing') this.checkGoal(dt);
  }

  freeze() {
    if (this.state === 'playing' || this.state === 'intro') this.state = 'frozen';
    this.active = null;
  }

  view(alpha = 1) {
    const a = this.active;
    const lerp = (p, c) => p + (c - p) * alpha;
    return {
      id: this.id,
      name: this.name,
      theme: this.theme,
      mode: this.mode,
      structure: this.structureName,
      ...this.lines,
      lives: this.lives,
      height: this.height,
      towerTop: this.towerTop,
      score: this.score,
      target: this.mode === 'survival' ? this.cfg.target : this.mode === 'puzzle' ? this.cfg.pieces : this.cfg.finish,
      left: this.mode === 'puzzle' ? this.cfg.pieces - this.spawned : null,
      progress: this.progress,
      holdTimer: this.holdTimer,
      holdMax: this.cfg.hold ?? 0,
      intro: this.state === 'intro' ? this.introTimer : 0,
      state: this.state,
      next: this.state === 'playing' && this.canSpawn() ? this.forced[0] ?? this.bag.peek() : null,
      nextIcy: this.icy > 0,
      spell: this.spell,
      spellIn: SPELL_EVERY - (this.landedCount % SPELL_EVERY),
      spellHud: true,
      fog: this.fog,
      pieces: this.bodies.map(e => ({
        ...e.piece, x: lerp(e.ppx, e.px), y: lerp(e.ppy, e.py), a: lerp(e.pa, e.a), f: e.falling, icy: e.icy, rooted: e.rooted,
      })),
      active: a ? { n: a.n, type: a.type, r: a.r, icy: a.icy, ox: a.ox, oy: lerp(a.poy, a.oy), gy: this.ghost(), fast: a.speed === FAST_SPEED } : null,
      events: this.events.splice(0),
      hud: true,
    };
  }

  snapshot() {
    const a = this.active;
    return {
      l: this.lives,
      h: r1(this.height),
      sc: this.score,
      pg: Math.round(this.progress * 100) / 100,
      w: r1(this.holdTimer),
      s: this.state,
      fg: r1(this.fog),
      p: this.bodies.map(e => [
        e.piece.id, e.piece.type, e.piece.r, r1(e.px), r1(e.py), Math.round(e.a * 1000) / 1000,
        (e.falling ? 1 : 0) | (e.icy ? 2 : 0) | (e.rooted ? 4 : 0),
      ]),
      a: a ? [a.type, a.r, a.ox, r1(a.oy), a.n, a.icy ? 1 : 0] : 0,
    };
  }
}
