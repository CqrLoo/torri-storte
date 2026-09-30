import { U, LIVES } from './config.js';
import { TYPES } from './pieces.js';
import { MODES, STRUCTURES, goalLines } from './modes.js';

const STATES = ['intro', 'playing', 'won', 'dead', 'done', 'frozen'];
const valid = (type, r) => TYPES.includes(type) && Number.isInteger(r) && r >= 0 && r < 4;
const num = v => (Number.isFinite(v) ? v : 0);

export class RemoteBoard {
  constructor({ id, name, mode, structure, theme }) {
    this.id = id;
    this.name = name;
    this.mode = mode;
    this.cfg = MODES[mode];
    this.lines = goalLines(mode);
    this.structure = structure;
    this.theme = theme;
    this.baseTop = Math.min(0, ...(STRUCTURES[structure] ?? []).map(([, cy]) => -(cy + 1) * U));
    this.lives = LIVES;
    this.height = -this.baseTop / U;
    this.score = 0;
    this.progress = 0;
    this.holdTimer = 0;
    this.fog = 0;
    this.state = 'intro';
    this.active = null;
    this.left = false;
    this.pieces = new Map();
  }

  apply(s) {
    if (this.left || !s || !Array.isArray(s.p)) return;
    this.lives = num(s.l);
    this.height = num(s.h);
    this.score = num(s.sc);
    this.progress = num(s.pg);
    this.holdTimer = num(s.w);
    this.fog = num(s.fg);
    if (STATES.includes(s.s)) this.state = s.s;
    const seen = new Set();
    for (const row of s.p.slice(0, 400)) {
      if (!Array.isArray(row) || !valid(row[1], row[2])) continue;
      const [id, type, r, x, y, a, f] = row;
      seen.add(id);
      const bits = num(f);
      const target = { tx: num(x), ty: num(y), ta: num(a), f: (bits & 1) > 0, icy: (bits & 2) > 0, rooted: (bits & 4) > 0 };
      const piece = this.pieces.get(id);
      if (piece) Object.assign(piece, target);
      else this.pieces.set(id, { id, type, r, x: target.tx, y: target.ty, a: target.ta, ...target });
    }
    for (const id of this.pieces.keys()) if (!seen.has(id)) this.pieces.delete(id);
    if (!Array.isArray(s.a) || !valid(s.a[0], s.a[1])) {
      this.active = null;
      return;
    }
    const [type, r, ox, oy, n, icy] = s.a;
    if (this.active?.n === n) Object.assign(this.active, { type, r, ox: num(ox), toy: num(oy), icy: icy === 1 });
    else this.active = { n, type, r, ox: num(ox), oy: num(oy), toy: num(oy), gy: null, icy: icy === 1 };
  }

  markLeft() {
    if (this.left) return;
    this.left = true;
    this.state = 'dead';
    this.name += ' (uscito)';
  }

  freeze() {
    if (this.state === 'playing' || this.state === 'intro') this.state = 'frozen';
    this.active = null;
  }

  tick(dt) {
    const k = 1 - Math.pow(0.0005, dt);
    for (const p of this.pieces.values()) {
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;
      const d = p.ta - p.a;
      p.a += Math.atan2(Math.sin(d), Math.cos(d)) * k;
    }
    if (this.active) this.active.oy += (this.active.toy - this.active.oy) * k;
  }

  view() {
    return {
      id: this.id,
      name: this.name,
      theme: this.theme,
      mode: this.mode,
      structure: this.structure,
      ...this.lines,
      lives: this.lives,
      height: this.height,
      towerTop: -this.height * U,
      score: this.score,
      target: this.mode === 'survival' ? this.cfg.target : this.mode === 'puzzle' ? this.cfg.pieces : this.cfg.finish,
      left: null,
      progress: this.progress,
      holdTimer: this.holdTimer,
      holdMax: this.cfg.hold ?? 0,
      intro: 0,
      state: this.state,
      next: null,
      spellHud: false,
      fog: this.fog,
      pieces: [...this.pieces.values()],
      active: this.active,
      events: [],
      hud: true,
    };
  }
}
