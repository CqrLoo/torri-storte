import { U, PX } from './config.js';
import { pieceGeometry, HUES } from './pieces.js';
import { STRUCTURES, ALCOVES } from './modes.js';

const R = 2;
const PAD = 3;
const cache = new Map();

function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * R);
  cv.height = Math.ceil(h * R);
  const g = cv.getContext('2d');
  g.scale(R, R);
  return { cv, g };
}

export function roundRect(g, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

export function edges(cells) {
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const has = (x, y) => set.has(`${x},${y}`);
  return cells.map(([x, y]) => ({
    x, y, top: !has(x, y - 1), bottom: !has(x, y + 1), left: !has(x - 1, y), right: !has(x + 1, y),
  }));
}

export function outlinePath(g, cells, ox = 0, oy = 0, size = U) {
  g.beginPath();
  for (const c of cells) {
    const x = ox + c.x * size;
    const y = oy + c.y * size;
    if (c.top) { g.moveTo(x, y); g.lineTo(x + size, y); }
    if (c.bottom) { g.moveTo(x, y + size); g.lineTo(x + size, y + size); }
    if (c.left) { g.moveTo(x, y); g.lineTo(x, y + size); }
    if (c.right) { g.moveTo(x + size, y); g.lineTo(x + size, y + size); }
  }
}

function bevel(g, cells, light, dark) {
  const B = 4;
  for (const c of cells) {
    const x = c.x * U;
    const y = c.y * U;
    if (c.top) { g.fillStyle = `rgba(255,255,255,${light})`; g.fillRect(x, y, U, B); }
    if (c.left) { g.fillStyle = `rgba(255,255,255,${light * 0.5})`; g.fillRect(x, y, B, U); }
    if (c.bottom) { g.fillStyle = `rgba(0,0,0,${dark})`; g.fillRect(x, y + U - B, U, B); }
    if (c.right) { g.fillStyle = `rgba(0,0,0,${dark * 0.7})`; g.fillRect(x + U - B, y, B, U); }
  }
}

function speckle(g, cells, rand, amount) {
  for (let i = 0; i < cells.length * amount; i++) {
    const c = cells[i % cells.length];
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
    g.fillRect(c.x * U + rand() * U, c.y * U + rand() * U, 1 + rand() * 2.5, 1 + rand() * 2.5);
  }
}

export function pieceSprite(type, r) {
  const key = `p${type}${r}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const geo = pieceGeometry(type, r);
  const hue = HUES[type];
  const W = geo.w * U + PAD * 2;
  const H = geo.h * U + PAD * 2;
  const { cv, g } = makeCanvas(W, H);
  g.translate(PAD, PAD);
  const cells = edges(geo.cells);
  const rand = rng(hue * 131 + r * 17 + 7);
  const fillPath = () => {
    g.beginPath();
    for (const c of cells) g.rect(c.x * U, c.y * U, U, U);
  };

  const base = g.createLinearGradient(0, 0, geo.w * U * 0.4, geo.h * U);
  base.addColorStop(0, `hsl(${hue}, 78%, 64%)`);
  base.addColorStop(1, `hsl(${hue}, 72%, 45%)`);
  fillPath();
  g.fillStyle = base;
  g.fill();

  g.save();
  fillPath();
  g.clip();
  speckle(g, cells, rand, 30);
  for (const c of cells) {
    const x = c.x * U;
    const y = c.y * U;
    roundRect(g, x + 6, y + 6, U - 12, U - 12, 3);
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(0,0,0,0.2)';
    g.stroke();
    roundRect(g, x + 7, y + 7, U - 12, U - 12, 3);
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.stroke();
  }
  g.lineWidth = 1;
  for (let i = 0; i < Math.ceil(cells.length / 2); i++) {
    const c = cells[Math.floor(rand() * cells.length)];
    let x = c.x * U + 5 + rand() * (U - 10);
    let y = c.y * U + 5 + rand() * (U - 10);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 3; k++) {
      x += (rand() - 0.5) * 10;
      y += (rand() - 0.3) * 9;
      g.lineTo(x, y);
    }
    g.strokeStyle = 'rgba(0,0,0,0.26)';
    g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.16)';
  g.beginPath();
  for (const c of cells) {
    if (!c.right) { g.moveTo((c.x + 1) * U, c.y * U + 3); g.lineTo((c.x + 1) * U, (c.y + 1) * U - 3); }
    if (!c.bottom) { g.moveTo(c.x * U + 3, (c.y + 1) * U); g.lineTo((c.x + 1) * U - 3, (c.y + 1) * U); }
  }
  g.stroke();
  bevel(g, cells, 0.38, 0.3);
  const shine = g.createRadialGradient(U * 0.5, U * 0.4, 0, U * 0.5, U * 0.4, U * 2.2);
  shine.addColorStop(0, 'rgba(255,255,255,0.18)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = shine;
  g.fillRect(0, 0, geo.w * U, geo.h * U);
  g.restore();

  g.lineWidth = 2.5;
  g.lineCap = 'square';
  g.strokeStyle = `hsl(${hue}, 60%, 17%)`;
  outlinePath(g, cells);
  g.stroke();

  const sprite = { canvas: cv, w: W, h: H, dx: -geo.off.x - PAD, dy: -geo.off.y - PAD };
  cache.set(key, sprite);
  return sprite;
}

export function silhouette(type, r, color) {
  const key = `s${type}${r}${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const geo = pieceGeometry(type, r);
  const W = geo.w * U + PAD * 2;
  const H = geo.h * U + PAD * 2;
  const { cv, g } = makeCanvas(W, H);
  g.translate(PAD, PAD);
  g.fillStyle = color;
  for (const [cx, cy] of geo.cells) g.fillRect(cx * U - 1, cy * U - 1, U + 2, U + 2);
  const sprite = { canvas: cv, w: W, h: H, dx: -geo.off.x - PAD, dy: -geo.off.y - PAD };
  cache.set(key, sprite);
  return sprite;
}

export function structureSprite(name) {
  const key = `t${name}`;
  if (cache.has(key)) return cache.get(key);
  const solidRaw = STRUCTURES[name] ?? [];
  const alcRaw = ALCOVES[name] ?? [];
  if (!solidRaw.length) {
    cache.set(key, null);
    return null;
  }
  const all = [...solidRaw, ...alcRaw];
  const maxX = Math.max(...all.map(c => c[0]));
  const maxY = Math.max(...all.map(c => c[1]));
  const flip = ([cx, cy]) => [cx, maxY - cy];
  const solid = edges(solidRaw.map(flip));
  const alcove = alcRaw.map(flip);
  const solidSet = new Set(solid.map(c => `${c.x},${c.y}`));
  const isSolid = (x, y) => solidSet.has(`${x},${y}`);
  const W = (maxX + 1) * U + PAD * 2;
  const H = (maxY + 1) * U + PAD * 2;
  const { cv, g } = makeCanvas(W, H);
  g.translate(PAD, PAD);
  const rand = rng(name.length * 977 + 3);

  for (const [cx, cy] of alcove) {
    const x = cx * U;
    const y = cy * U;
    g.fillStyle = '#2b2036';
    g.fillRect(x, y, U, U);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let r = 1; r < 4; r++) { g.moveTo(x, y + (r * U) / 4); g.lineTo(x + U, y + (r * U) / 4); }
    for (let r = 0; r < 4; r++) {
      const off = r % 2 ? U / 4 : (U * 3) / 4;
      g.moveTo(x + off, y + (r * U) / 4);
      g.lineTo(x + off, y + ((r + 1) * U) / 4);
    }
    g.stroke();
    if (isSolid(cx, cy - 1)) {
      const sh = g.createLinearGradient(0, y, 0, y + 14);
      sh.addColorStop(0, 'rgba(0,0,0,0.6)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sh;
      g.fillRect(x, y, U, 14);
    }
    if (isSolid(cx - 1, cy)) {
      const sh = g.createLinearGradient(x, 0, x + 10, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.45)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sh;
      g.fillRect(x, y, 10, U);
    }
  }

  for (const c of solid) {
    const x = c.x * U;
    const y = c.y * U;
    g.fillStyle = '#3a2c2a';
    g.fillRect(x, y, U, U);
    for (let r = 0; r < 2; r++) {
      const split = (c.x + c.y + r) % 2 ? U * 0.58 : U * 0.36;
      for (const [sx, sw] of [[0, split], [split, U - split]]) {
        const light = 50 + rand() * 14;
        const stone = g.createLinearGradient(0, y + r * U / 2, 0, y + (r + 1) * U / 2);
        stone.addColorStop(0, `hsl(${28 + rand() * 8}, ${22 + rand() * 10}%, ${light + 6}%)`);
        stone.addColorStop(1, `hsl(${26 + rand() * 8}, ${20 + rand() * 10}%, ${light - 6}%)`);
        g.fillStyle = stone;
        roundRect(g, x + sx + 0.9, y + r * U / 2 + 0.9, sw - 1.8, U / 2 - 1.8, 2.5);
        g.fill();
        g.fillStyle = 'rgba(255,240,220,0.28)';
        g.fillRect(x + sx + 2, y + r * U / 2 + 1.2, sw - 4, 1.4);
      }
    }
    if (c.top && rand() < 0.7) {
      g.fillStyle = 'rgba(96,176,84,0.85)';
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.ellipse(x + rand() * U, y + 1.5, 3 + rand() * 4, 2 + rand() * 1.5, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  speckle(g, solid, rand, 10);
  bevel(g, solid, 0.22, 0.35);
  g.lineWidth = 2.5;
  g.lineCap = 'square';
  g.strokeStyle = '#24160f';
  outlinePath(g, solid);
  g.stroke();
  const merlons = solid.filter(c => c.top && c.y === 0);
  const sprite = { canvas: cv, x: PX - PAD, y: -(maxY + 1) * U - PAD, w: W, h: H, cells: solid, merlons, maxY };
  cache.set(key, sprite);
  return sprite;
}

export function vineSprite(type, r) {
  const key = `v${type}${r}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const geo = pieceGeometry(type, r);
  const W = geo.w * U + PAD * 2;
  const H = geo.h * U + PAD * 2;
  const { cv, g } = makeCanvas(W, H);
  g.translate(PAD, PAD);
  const rand = rng(HUES[type] * 53 + r * 11 + 5);
  g.lineCap = 'round';
  for (const [cx, cy] of geo.cells) {
    const x = cx * U;
    const y = cy * U;
    const y0 = y + U * (0.2 + rand() * 0.6);
    const y1 = y + U * (0.2 + rand() * 0.6);
    g.strokeStyle = '#1f6b34';
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(x - 1, y0);
    g.bezierCurveTo(x + U * 0.35, y0 - 8, x + U * 0.65, y1 + 8, x + U + 1, y1);
    g.stroke();
    g.strokeStyle = '#3fae57';
    g.lineWidth = 1.8;
    g.stroke();
    for (let i = 0; i < 2; i++) {
      const t = 0.25 + i * 0.45;
      g.fillStyle = i ? '#5fd46a' : '#46b85a';
      g.beginPath();
      g.ellipse(x + U * t, y0 + (y1 - y0) * t + (i ? 4 : -4), 4.5, 2.4, i ? 0.7 : -0.7, 0, Math.PI * 2);
      g.fill();
    }
  }
  const sprite = { canvas: cv, w: W, h: H, dx: -geo.off.x - PAD, dy: -geo.off.y - PAD };
  cache.set(key, sprite);
  return sprite;
}
