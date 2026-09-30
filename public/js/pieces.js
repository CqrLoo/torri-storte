import { U } from './config.js';

export const SHAPES = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  L: [[0, 0], [0, 1], [0, 2], [1, 2]],
  J: [[1, 0], [1, 1], [1, 2], [0, 2]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  D: [[0, 0], [1, 0]],
  X: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
  U: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  P: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
};

export const TYPES = Object.keys(SHAPES);
export const BAG_TYPES = ['I', 'O', 'T', 'L', 'J', 'S', 'Z'];
export const CURSED = ['X', 'U', 'P'];

export const HUES = { I: 188, O: 44, T: 282, L: 24, J: 226, S: 138, Z: 350, D: 64, X: 300, U: 268, P: 318 };

const cache = new Map();

function normalize(cells) {
  const minX = Math.min(...cells.map(c => c[0]));
  const minY = Math.min(...cells.map(c => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

export function pieceGeometry(type, r) {
  const key = type + r;
  const hit = cache.get(key);
  if (hit) return hit;
  let cells = SHAPES[type].map(c => [...c]);
  for (let i = 0; i < r; i++) cells = normalize(cells.map(([x, y]) => [-y, x]));
  const w = Math.max(...cells.map(c => c[0])) + 1;
  const h = Math.max(...cells.map(c => c[1])) + 1;
  const off = {
    x: cells.reduce((sum, c) => sum + (c[0] + 0.5) * U, 0) / cells.length,
    y: cells.reduce((sum, c) => sum + (c[1] + 0.5) * U, 0) / cells.length,
  };
  const rel = cells.map(([x, y]) => [(x + 0.5) * U - off.x, (y + 0.5) * U - off.y]);
  const radius = Math.max(...rel.map(([x, y]) => Math.hypot(x, y)));
  const geometry = { cells, w, h, off, rel, radius };
  cache.set(key, geometry);
  return geometry;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Bag {
  constructor(seed) {
    this.rng = mulberry32(seed);
    this.queue = [];
    this.fill();
  }

  fill() {
    while (this.queue.length < 2) {
      const bag = [...BAG_TYPES];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      this.queue.push(...bag);
    }
  }

  next() {
    const type = this.queue.shift();
    this.fill();
    return type;
  }

  peek() {
    return this.queue[0];
  }
}
