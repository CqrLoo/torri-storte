import { U, WORLD_W, PLATFORM_W, PX, LIVES, VIEW_CELLS } from './config.js';
import { pieceGeometry, HUES } from './pieces.js';
import { MODES, SPELLS, TOWERS } from './modes.js';
import { pieceSprite, silhouette, structureSprite, vineSprite, edges, outlinePath, roundRect } from './sprites.js';

const FONT = 'Fredoka, "Trebuchet MS", system-ui, sans-serif';
const DISPLAY = '"Lilita One", Fredoka, system-ui, sans-serif';
const TAU = Math.PI * 2;
const PLAYER_HUES = [44, 188, 330, 140];

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const SPACE = {
  top: [4, 4, 20], mid: [14, 9, 42], horizon: [40, 20, 76], far: [22, 14, 50], near: [14, 10, 36], mist: [80, 60, 140],
};

const THEMES = {
  canyon: {
    top: [196, 58, 104], mid: [232, 96, 118], horizon: [255, 184, 140], far: [150, 48, 92], near: [104, 28, 66],
    mist: [255, 176, 164], cap: '#f2c77b', rockTop: '#d98a66', rockMid: '#9a4a52', rockBottom: '#3c1430', sun: [255, 226, 186],
  },
  alpi: {
    top: [88, 164, 255], mid: [255, 172, 186], horizon: [255, 216, 150], far: [124, 128, 204], near: [72, 108, 172],
    mist: [255, 232, 222], cap: '#5fe0a8', rockTop: '#8a7ab8', rockMid: '#4a3b78', rockBottom: '#221a40', sun: [255, 244, 214],
  },
  ghiaccio: {
    top: [108, 178, 236], mid: [168, 212, 248], horizon: [228, 244, 255], far: [146, 176, 222], near: [104, 144, 200],
    mist: [240, 250, 255], cap: '#f4fbff', rockTop: '#a8c0e6', rockMid: '#5870a8', rockBottom: '#1e2a52', sun: [255, 255, 240], snow: true,
  },
};

function heart(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.3);
  g.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  g.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.78, x, y + s);
  g.bezierCurveTo(x, y + s * 0.78, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  g.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  g.closePath();
}

function glass(g, x, y, w, h, r) {
  roundRect(g, x, y, w, h, r);
  g.fillStyle = 'rgba(18,12,46,0.62)';
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.lineWidth = 1;
  g.stroke();
}

function seeded(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function ridge(seed, count, rough) {
  const rand = seeded(seed);
  const pts = new Array(count + 1).fill(0);
  pts[0] = pts[count] = rand();
  for (let step = count; step > 1; step /= 2) {
    for (let i = step / 2; i < count; i += step) {
      pts[i] = (pts[i - step / 2] + pts[i + step / 2]) / 2 + (rand() - 0.5) * rough * (step / count);
    }
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  return pts.map(v => (v - min) / (max - min));
}

function mesa(seed, count) {
  const rand = seeded(seed);
  const pts = [];
  let level = 0.6;
  while (pts.length <= count) {
    const len = 5 + Math.floor(rand() * 12);
    const next = rand() < 0.35 ? rand() * 0.25 : 0.4 + rand() * 0.6;
    for (let k = 0; k < len; k++) pts.push(level + (rand() - 0.5) * 0.02);
    pts.push((level + next) / 2);
    level = next;
  }
  pts.length = count + 1;
  pts[count] = pts[0];
  return pts;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cams = new Map();
    this.particles = [];
    this.islands = new Map();
    this.stars = Array.from({ length: 220 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.5 + 0.3, p: Math.random() * TAU,
      c: [[255, 255, 255], [190, 215, 255], [255, 225, 190]][Math.floor(Math.random() * 3)],
    }));
    this.flakes = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.2, v: 0.03 + Math.random() * 0.06, p: Math.random() * TAU }));
    this.clouds = Array.from({ length: 9 }, (_, i) => ({
      x: Math.random() * WORLD_W * 1.6 - WORLD_W * 0.3,
      y: -U * (1 + i * 2.2 + Math.random() * 2),
      s: 0.6 + Math.random() * 0.9,
      v: 5 + Math.random() * 10,
    }));
    this.profiles = {
      canyon: { far: mesa(5, 128), near: mesa(19, 128) },
      alpi: { far: ridge(7, 128, 1.1), near: ridge(23, 128, 0.6) },
      ghiaccio: { far: ridge(11, 128, 1.7), near: ridge(31, 128, 1) },
    };
    this.nebula = this.makeNebula();
    this.shooting = null;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
  }

  makeNebula() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const g = cv.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    const blobs = [[140, 180, 200, [120, 60, 210]], [370, 300, 230, [40, 90, 220]], [260, 110, 160, [220, 70, 170]], [420, 90, 120, [60, 190, 230]]];
    for (const [x, y, r, c] of blobs) {
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, rgb(c, 0.35));
      grd.addColorStop(1, rgb(c, 0));
      g.fillStyle = grd;
      g.fillRect(0, 0, 512, 512);
    }
    return cv;
  }

  island(themeName) {
    const hit = this.islands.get(themeName);
    if (hit) return hit;
    const t = THEMES[themeName];
    const R = 2;
    const W = PLATFORM_W;
    const pad = U;
    const top = U * 0.4;
    const H = U * 8;
    const cv = document.createElement('canvas');
    cv.width = (W + pad * 2) * R;
    cv.height = (H + top) * R;
    const g = cv.getContext('2d');
    g.scale(R, R);
    g.translate(pad, top);
    const rock = g.createLinearGradient(0, 0, 0, H * 0.9);
    rock.addColorStop(0, t.rockTop);
    rock.addColorStop(0.5, t.rockMid);
    rock.addColorStop(1, t.rockBottom);
    g.fillStyle = rock;
    g.beginPath();
    g.moveTo(-4, U * 0.5);
    const outline = [
      [W + 4, U * 0.5], [W - U * 0.3, U * 1.4], [W - U * 0.9, U * 2.1], [W * 0.72, U * 3.2], [W * 0.62, U * 4.8],
      [W * 0.54, U * 6.9], [W * 0.47, U * 5.6], [W * 0.38, U * 4.1], [W * 0.26, U * 3.4], [U * 0.9, U * 2.2], [U * 0.2, U * 1.3],
    ];
    outline.forEach(([x, y]) => g.lineTo(x, y));
    g.closePath();
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(20,10,40,0.3)';
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const yy = U * (1.3 + i * 0.9);
      g.beginPath();
      g.moveTo(-4, yy);
      for (let x = 0; x <= W + 8; x += 12) g.lineTo(x, yy + Math.sin(x * 0.05 + i * 1.7) * 4);
      g.stroke();
    }
    const side = g.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, 'rgba(255,255,255,0.14)');
    side.addColorStop(0.5, 'rgba(255,255,255,0)');
    side.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = side;
    g.fillRect(-4, 0, W + 8, H);
    g.restore();
    const slab = g.createLinearGradient(0, 0, 0, U * 0.8);
    slab.addColorStop(0, '#e8dcff');
    slab.addColorStop(1, t.rockMid);
    roundRect(g, 0, 0, W, U * 0.8, 8);
    g.fillStyle = slab;
    g.fill();
    g.fillStyle = t.cap;
    roundRect(g, 0, -2, W, 8, 4);
    g.fill();
    for (let x = 8; x < W - 6; x += 13) {
      g.beginPath();
      g.ellipse(x, 5, 5, 3 + ((x * 7919) % 9), 0, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(4, -1, W - 8, 2);
    const island = { canvas: cv, x: PX - pad, y: -top, w: W + pad * 2, h: H + top };
    this.islands.set(themeName, island);
    return island;
  }

  draw(views, dt, time) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#07061a';
    g.fillRect(0, 0, this.w, this.h);
    this.clouds.forEach(c => {
      c.x += c.v * dt;
      if (c.x > WORLD_W * 1.4) c.x = -WORLD_W * 0.4;
    });
    this.flakes.forEach(f => {
      f.y += f.v * dt;
      f.x += Math.sin(time + f.p) * 0.01 * dt;
      if (f.y > 1) f.y -= 1;
    });
    this.updateShooting(dt);
    this.updateParticles(dt);
    const race = views.filter(v => v.hud).map((v, i) => ({ id: v.id, progress: v.progress, hue: PLAYER_HUES[i % 4] }));
    const n = views.length;
    const gap = n > 1 ? 12 : 0;
    const vw = (this.w - gap * (n + 1)) / n;
    const vh = this.h - gap * 2;
    views.forEach((v, i) => {
      v.hue = PLAYER_HUES[i % 4];
      this.drawBoard(v, gap + i * (vw + gap), gap, vw, vh, dt, time, n > 1, i === 0, race);
    });
  }

  camera(v, visH, dt) {
    let cam = this.cams.get(v.id);
    if (!cam) {
      cam = { bottom: U * 3, shake: 0, flash: 0, pop: 0, go: 0, lives: v.lives, an: null, ar: 0, ax: 0, rot: 0, msg: null };
      this.cams.set(v.id, cam);
    }
    let target = Math.min(U * 3, v.towerTop + visH * 0.45);
    if (v.active) target = Math.min(target, v.active.oy - U + visH);
    if (v.laser !== null) target = Math.min(target, v.laser + visH - U * 3);
    cam.bottom += (target - cam.bottom) * clamp(dt * 3, 0, 1);
    if (v.lives < cam.lives) {
      cam.shake = 14;
      cam.flash = 1;
      cam.pop = 1;
    }
    cam.lives = v.lives;
    if (v.events.some(e => e.type === 'go')) cam.go = 1;
    for (const e of v.events) {
      const spell = SPELLS[e.spell];
      if (!spell) continue;
      const dark = spell.side === 'dark';
      if (e.type === 'gain') cam.msg = { text: `Nuova magia: ${spell.name}`, sub: 'Premi Q per usarla', color: dark ? '#c9a2ff' : '#ffe08a', t: 2.2 };
      if (e.type === 'cast') cam.msg = { text: `${spell.name}!`, sub: dark ? 'Lanciata sull\u2019avversario in testa' : spell.desc, color: dark ? '#c9a2ff' : '#ffe08a', t: 2 };
      if (e.type === 'hex') {
        cam.msg = { text: `${spell.name}!`, sub: e.from ? `Te l\u2019ha lanciata ${e.from}` : spell.desc, color: '#ff8ad0', t: 2.4 };
        cam.shake = Math.max(cam.shake, 8);
      }
      if (e.type === 'sent') cam.msg = { text: `${spell.name} a ${e.to}`, sub: 'Colpito!', color: '#c9a2ff', t: 2 };
    }
    if (cam.msg && (cam.msg.t -= dt) <= 0) cam.msg = null;
    cam.shake *= Math.pow(0.01, dt);
    cam.flash = Math.max(0, cam.flash - dt * 2);
    cam.pop = Math.max(0, cam.pop - dt * 2.5);
    cam.go = Math.max(0, cam.go - dt * 1.4);
    const a = v.active;
    if (a) {
      if (cam.an !== a.n) Object.assign(cam, { an: a.n, ar: a.r, ax: a.ox, rot: 0 });
      if (a.r !== cam.ar) {
        cam.rot -= Math.PI / 2;
        cam.ar = a.r;
      }
      cam.ax += (a.ox - cam.ax) * (1 - Math.pow(1e-7, dt));
      cam.rot *= Math.pow(1e-6, dt);
    }
    return cam;
  }

  drawBoard(v, x, y, w, h, dt, time, framed, mine, race) {
    const g = this.ctx;
    this.currentId = v.id;
    const theme = THEMES[v.theme] ?? THEMES.canyon;
    const s = Math.min((w * 0.94) / WORLD_W, h / (U * VIEW_CELLS));
    const visH = h / s;
    const cam = this.camera(v, visH, dt);
    const alt = clamp((U * 3 - cam.bottom) / (18 * U), 0, 1);
    const left = WORLD_W / 2 - w / 2 / s;
    const right = WORLD_W / 2 + w / 2 / s;
    const top = cam.bottom - visH;
    const lift = cam.bottom - U * 3;

    g.save();
    roundRect(g, x, y, w, h, framed ? 20 : 0);
    g.clip();
    this.drawSky(g, theme, x, y, w, h, alt, time);

    g.save();
    g.translate(x + w / 2 + (Math.random() - 0.5) * cam.shake, y + h + (Math.random() - 0.5) * cam.shake);
    g.scale(s, s);
    g.translate(-WORLD_W / 2, -cam.bottom);
    this.drawLandscape(g, theme, this.profiles[v.theme] ?? this.profiles.canyon, left, right, lift, alt);
    this.drawClouds(g, lift, alt, theme);
    this.drawMarkers(g, left, v);
    this.drawIsland(g, v.theme, time);
    if (v.finish !== null) this.drawFinish(g, left, right, v, time);
    if (v.mode === 'race') this.drawTowerLine(g, v, left, right);
    const playing = v.active && (v.state === 'playing' || v.state === 'intro');
    if (playing) this.drawBeam(g, v.active, cam, top);
    this.drawStructure(g, v.structure, time);
    if (playing) this.drawGhost(g, v.active, time);
    this.drawPieces(g, v.pieces, time);
    if (playing) this.drawActive(g, v.active, cam, time);
    if (v.laser !== null) this.drawLaser(g, left, right, v.laser, time, top);
    this.spawnEvents(v, top);
    this.drawParticles(g, v.id);
    g.restore();

    if (v.fog > 0) this.drawFog(g, x, y, w, h, v.fog, time);
    if (theme.snow) this.drawSnow(g, x, y, w, h, alt);
    const vignette = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.35, x + w / 2, y + h / 2, Math.max(w, h) * 0.78);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(5,3,20,0.5)');
    g.fillStyle = vignette;
    g.fillRect(x, y, w, h);
    if (v.hud) this.drawHud(g, v, x, y, w, h, cam, time, race);
    g.restore();

    if (framed) {
      roundRect(g, x + 1, y + 1, w - 2, h - 2, 20);
      g.strokeStyle = mine ? 'rgba(255,215,106,0.85)' : 'rgba(255,255,255,0.14)';
      g.lineWidth = mine ? 3 : 1.5;
      g.stroke();
    }
  }

  drawSky(g, t, x, y, w, h, alt, time) {
    const k = Math.pow(alt, 0.9);
    const sky = g.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, rgb(mixc(t.top, SPACE.top, k)));
    sky.addColorStop(0.55, rgb(mixc(t.mid, SPACE.mid, k)));
    sky.addColorStop(1, rgb(mixc(t.horizon, SPACE.horizon, k)));
    g.fillStyle = sky;
    g.fillRect(x, y, w, h);

    const space = clamp((alt - 0.45) / 0.45, 0, 1);
    if (space > 0) {
      g.globalAlpha = space;
      g.drawImage(this.nebula, x, y, w, h);
      g.globalAlpha = 1;
    }
    const starA = clamp((alt - 0.3) / 0.5, 0, 1);
    if (starA > 0) {
      for (const st of this.stars) {
        g.fillStyle = rgb(st.c, starA * (0.5 + 0.5 * Math.sin(time * 2.2 + st.p)));
        g.beginPath();
        g.arc(x + st.x * w, y + st.y * h, st.r, 0, TAU);
        g.fill();
      }
    }
    const sunA = clamp(1 - alt * 2.2, 0, 1);
    if (sunA > 0) {
      const m = Math.min(w, h);
      const sx = x + w * 0.74;
      const sy = y + h * (0.72 + alt * 0.5);
      const glow = g.createRadialGradient(sx, sy, 0, sx, sy, m * 0.5);
      glow.addColorStop(0, rgb(t.sun, 0.55 * sunA));
      glow.addColorStop(1, rgb(t.sun, 0));
      g.fillStyle = glow;
      g.fillRect(x, y, w, h);
      g.fillStyle = rgb(t.sun, sunA);
      g.beginPath();
      g.arc(sx, sy, m * 0.075, 0, TAU);
      g.fill();
    }
    this.drawAurora(g, x, y, w, h, alt, time);
    const planetA = clamp((alt - 0.55) / 0.3, 0, 1);
    if (planetA > 0) {
      const r = Math.min(w, h) * 0.08;
      const px = x + w * 0.22;
      const py = y + h * 0.2;
      g.globalAlpha = planetA;
      const body = g.createRadialGradient(px - r * 0.4, py - r * 0.4, r * 0.1, px, py, r);
      body.addColorStop(0, '#ffc6a8');
      body.addColorStop(1, '#8a3f7a');
      g.fillStyle = body;
      g.beginPath();
      g.arc(px, py, r, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,214,190,0.7)';
      g.lineWidth = r * 0.12;
      g.beginPath();
      g.ellipse(px, py, r * 1.7, r * 0.45, -0.35, 0, TAU);
      g.stroke();
      g.globalAlpha = 1;
    }
    if (this.shooting && alt > 0.55) {
      const st = this.shooting;
      const sx = x + st.x * w;
      const sy = y + st.y * h;
      const tail = g.createLinearGradient(sx, sy, sx + w * 0.08, sy - h * 0.04);
      tail.addColorStop(0, `rgba(255,255,255,${st.life})`);
      tail.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = tail;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + w * 0.08, sy - h * 0.04);
      g.stroke();
    }
  }

  drawAurora(g, x, y, w, h, alt, time) {
    const a = clamp(1 - Math.abs(alt - 0.62) / 0.3, 0, 1);
    if (a <= 0) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const [yy, col, ph] of [[0.24, [80, 255, 180], 0], [0.34, [150, 110, 255], 2], [0.16, [60, 200, 255], 4]]) {
      const baseY = y + h * yy;
      const wave = i => Math.sin(i * 0.35 + time * 0.6 + ph) * h * 0.04 + Math.sin(i * 0.9 + time * 1.3 + ph) * h * 0.015;
      const grd = g.createLinearGradient(0, baseY - h * 0.14, 0, baseY + h * 0.2);
      grd.addColorStop(0, rgb(col, 0));
      grd.addColorStop(0.4, rgb(col, 0.26 * a));
      grd.addColorStop(1, rgb(col, 0));
      g.fillStyle = grd;
      g.beginPath();
      for (let i = 0; i <= 40; i++) g.lineTo(x + (w * i) / 40, baseY + wave(i) - h * 0.12);
      for (let i = 40; i >= 0; i--) g.lineTo(x + (w * i) / 40, baseY + wave(i) + h * 0.18);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  drawSnow(g, x, y, w, h, alt) {
    const a = clamp(1 - alt * 1.5, 0, 1);
    if (a <= 0) return;
    g.fillStyle = `rgba(255,255,255,${0.8 * a})`;
    for (const f of this.flakes) {
      g.beginPath();
      g.arc(x + (((f.x % 1) + 1) % 1) * w, y + f.y * h, f.r, 0, TAU);
      g.fill();
    }
  }

  drawRidge(g, pts, left, right, baseY, amp, bottomColor, topColor) {
    const n = pts.length - 1;
    const stepX = (WORLD_W * 3) / n;
    const start = Math.floor(left / stepX) - 1;
    const end = Math.ceil(right / stepX) + 1;
    g.beginPath();
    g.moveTo(start * stepX, baseY + U * 40);
    for (let i = start; i <= end; i++) g.lineTo(i * stepX, baseY - pts[((i % n) + n) % n] * amp);
    g.lineTo(end * stepX, baseY + U * 40);
    g.closePath();
    const grd = g.createLinearGradient(0, baseY - amp, 0, baseY + U * 2);
    grd.addColorStop(0, topColor);
    grd.addColorStop(1, bottomColor);
    g.fillStyle = grd;
    g.fill();
  }

  drawLandscape(g, t, profile, left, right, lift, alt) {
    const k = Math.pow(alt, 0.9);
    const far = mixc(t.far, SPACE.far, k);
    const near = mixc(t.near, SPACE.near, k);
    const mBase = U * 0.5 + lift * 0.8;
    this.drawRidge(g, profile.far, left, right, mBase, U * 6.5, rgb(far), rgb(mixc(far, [255, 255, 255], 0.25)));
    const mist = mixc(t.mist, SPACE.mist, k);
    const band = g.createLinearGradient(0, mBase - U * 2, 0, mBase + U * 2);
    band.addColorStop(0, rgb(mist, 0));
    band.addColorStop(0.55, rgb(mist, 0.45));
    band.addColorStop(1, rgb(mist, 0));
    g.fillStyle = band;
    g.fillRect(left, mBase - U * 2, right - left, U * 4);
    const hBase = U * 3 + lift * 0.5;
    this.drawRidge(g, profile.near, left, right, hBase, U * 3.5, rgb(near), rgb(mixc(near, [255, 255, 255], 0.12)));
  }

  drawClouds(g, lift, alt, t) {
    const a = (1 - alt * 1.6) * 0.75;
    if (a < 0.02) return;
    const shade = mixc(t.mid, [255, 255, 255], 0.5);
    for (const c of this.clouds) {
      const cy = c.y + lift * 0.4;
      const r = U * c.s;
      g.fillStyle = rgb(shade, a * 0.5);
      g.beginPath();
      g.ellipse(c.x, cy + r * 0.2, r * 1.7, r * 0.5, 0, 0, TAU);
      g.fill();
      g.fillStyle = `rgba(255,255,255,${a * 0.6})`;
      for (const [dx, dy, rr] of [[-0.8, 0, 0.55], [0, -0.25, 0.75], [0.8, 0.02, 0.5]]) {
        g.beginPath();
        g.arc(c.x + dx * r, cy + dy * r, rr * r, 0, TAU);
        g.fill();
      }
    }
  }

  drawMarkers(g, left, v) {
    if (v.mode !== 'race') return;
    g.font = `600 ${U * 0.38}px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const x = Math.max(left, -U * 2) + 8;
    for (let i = 5; i < MODES.race.finish; i += 5) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x, -i * U - 1, U * 0.5, 2);
      g.fillText(`${i} m`, x + U * 0.65, -i * U);
    }
  }

  drawIsland(g, themeName, time) {
    const isl = this.island(THEMES[themeName] ? themeName : 'canyon');
    const fall = g.createLinearGradient(0, U * 0.4, 0, U * 10);
    fall.addColorStop(0, 'rgba(170,240,255,0.8)');
    fall.addColorStop(1, 'rgba(170,240,255,0)');
    g.fillStyle = fall;
    g.fillRect(PX + 2, U * 0.4, 9, U * 9.6);
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 2;
    g.setLineDash([10, 18]);
    g.lineDashOffset = -time * 120;
    g.beginPath();
    g.moveTo(PX + 6.5, U * 0.5);
    g.lineTo(PX + 6.5, U * 8);
    g.stroke();
    g.restore();
    g.drawImage(isl.canvas, isl.x, isl.y, isl.w, isl.h);
    const pulse = 0.6 + 0.4 * Math.sin(time * 2);
    g.save();
    g.shadowColor = '#8ff5ff';
    g.shadowBlur = 10 + pulse * 8;
    g.fillStyle = `rgba(170,250,255,${0.7 + pulse * 0.3})`;
    for (const [cx, cy, sz, rot] of [[0.3, 2.3, 1, -0.3], [0.64, 3.4, 0.8, 0.25], [0.48, 5.1, 0.6, 0.1]]) {
      g.save();
      g.translate(PX + PLATFORM_W * cx, U * cy);
      g.rotate(rot);
      g.beginPath();
      g.moveTo(0, -U * 0.5 * sz);
      g.lineTo(U * 0.2 * sz, 0);
      g.lineTo(0, U * 0.3 * sz);
      g.lineTo(-U * 0.2 * sz, 0);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.restore();
  }

  drawStructure(g, name, time) {
    const sp = structureSprite(name);
    if (!sp) return;
    const ox = sp.x + 3;
    const oy = sp.y + 3;
    sp.merlons.forEach((c, i) => {
      if (i !== 0 && i !== sp.merlons.length - 1) return;
      const px = ox + c.x * U + U / 2;
      const py = oy;
      g.fillStyle = '#4a3a30';
      g.fillRect(px - 1.5, py - U * 1.3, 3, U * 1.3);
      const hue = i === 0 ? 350 : 44;
      g.fillStyle = `hsl(${hue}, 80%, 55%)`;
      g.beginPath();
      g.moveTo(px + 1.5, py - U * 1.3);
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        g.lineTo(px + 1.5 + t * U * 0.9, py - U * 1.3 + t * U * 0.22 + Math.sin(time * 5 - t * 4) * 2.5 * t);
      }
      for (let k = 6; k >= 0; k--) {
        const t = k / 6;
        g.lineTo(px + 1.5 + t * U * 0.9, py - U * 0.85 - t * U * 0.22 + Math.sin(time * 5 - t * 4) * 2.5 * t);
      }
      g.closePath();
      g.fill();
    });
    g.save();
    g.globalAlpha = 0.28;
    g.fillStyle = '#12062a';
    for (const c of sp.cells) g.fillRect(ox + c.x * U + 4, oy + c.y * U + 6, U, U);
    g.restore();
    g.drawImage(sp.canvas, sp.x, sp.y, sp.w, sp.h);
    for (const [cx, cy] of TOWERS[name]?.torches ?? []) this.drawTorch(g, PX + (cx + 0.5) * U, -(cy + 0.5) * U, time, cx);
  }

  drawTorch(g, x, y, time, seed) {
    const flick = 0.85 + 0.15 * Math.sin(time * 17 + seed * 3) * Math.sin(time * 7 + seed);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const glow = g.createRadialGradient(x, y - 6, 0, x, y - 6, U * 2.2 * flick);
    glow.addColorStop(0, 'rgba(255,170,70,0.45)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = glow;
    g.fillRect(x - U * 2.5, y - U * 2.5, U * 5, U * 5);
    g.restore();
    g.fillStyle = '#2a1a12';
    g.fillRect(x - 4, y - 2, 8, 10);
    g.fillStyle = '#5a3a24';
    g.fillRect(x - 6, y - 4, 12, 3);
    const layers = [[9, 16, '#ff6a2a'], [6.5, 12, '#ffb03a'], [3.5, 7, '#fff2b0']];
    for (const [rw, rh, col] of layers) {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(x + Math.sin(time * 9 + seed) * 1.2, y - 4 - (rh * flick) / 2, (rw * flick) / 2, (rh * flick) / 2, 0, 0, TAU);
      g.fill();
    }
  }

  drawFog(g, x, y, w, h, fog, time) {
    const a = clamp(fog, 0, 1);
    const grd = g.createLinearGradient(0, y + h * 0.2, 0, y + h);
    grd.addColorStop(0, 'rgba(46,24,66,0)');
    grd.addColorStop(0.35, `rgba(46,24,66,${0.86 * a})`);
    grd.addColorStop(1, `rgba(30,14,46,${0.97 * a})`);
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
    for (let i = 0; i < 12; i++) {
      const dir = i % 2 ? 1 : -1;
      const cx = x + ((((i * 131 + time * 24 * dir) % w) + w) % w);
      const cy = y + h * (0.38 + (i % 6) * 0.1);
      const r = Math.max(w, h) * 0.14;
      const puff = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      puff.addColorStop(0, `rgba(96,62,120,${0.45 * a})`);
      puff.addColorStop(1, 'rgba(96,62,120,0)');
      g.fillStyle = puff;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }

  drawSpellIcon(g, spell, cx, cy, r) {
    const dark = SPELLS[spell].side === 'dark';
    const bg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    bg.addColorStop(0, dark ? '#b07cff' : '#fff0a8');
    bg.addColorStop(1, dark ? '#4a1f86' : '#d88a1c');
    g.fillStyle = bg;
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.stroke();
    g.save();
    g.translate(cx, cy);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    const k = r / 20;
    if (spell === 'radici') {
      g.fillStyle = '#2f9a4a';
      g.beginPath();
      g.ellipse(-3 * k, -2 * k, 6 * k, 10 * k, -0.6, 0, TAU);
      g.fill();
      g.beginPath();
      g.ellipse(5 * k, 2 * k, 5 * k, 8 * k, 0.7, 0, TAU);
      g.fill();
      g.strokeStyle = '#1b5e2e';
      g.lineWidth = 2 * k;
      g.beginPath();
      g.moveTo(0, 11 * k);
      g.quadraticCurveTo(-2 * k, 0, -6 * k, -9 * k);
      g.stroke();
    }
    if (spell === 'mattoncino') {
      g.fillStyle = '#c8e05a';
      g.fillRect(-10 * k, -4 * k, 9 * k, 9 * k);
      g.fillRect(1 * k, -4 * k, 9 * k, 9 * k);
      g.strokeStyle = '#4a5a10';
      g.lineWidth = 1.5 * k;
      g.strokeRect(-10 * k, -4 * k, 20 * k, 9 * k);
    }
    if (spell === 'maledetto') {
      g.fillStyle = '#ff9ae6';
      for (const [px, py] of [[0, -7], [-7, 0], [0, 0], [7, 0], [0, 7]]) g.fillRect((px - 3.4) * k, (py - 3.4) * k, 6.8 * k, 6.8 * k);
    }
    if (spell === 'ghiaccio') {
      g.lineWidth = 2.2 * k;
      for (let i = 0; i < 3; i++) {
        g.save();
        g.rotate((i * Math.PI) / 3);
        g.beginPath();
        g.moveTo(0, -11 * k);
        g.lineTo(0, 11 * k);
        g.moveTo(-3 * k, -8 * k);
        g.lineTo(0, -5 * k);
        g.lineTo(3 * k, -8 * k);
        g.moveTo(-3 * k, 8 * k);
        g.lineTo(0, 5 * k);
        g.lineTo(3 * k, 8 * k);
        g.stroke();
        g.restore();
      }
    }
    if (spell === 'nebbia') {
      g.fillStyle = '#e6dcf5';
      for (const [px, py, rr] of [[-6, 2, 6], [1, -3, 7.5], [7, 3, 5.5], [0, 4, 6]]) {
        g.beginPath();
        g.arc(px * k, py * k, rr * k, 0, TAU);
        g.fill();
      }
    }
    g.restore();
  }

  drawFlag(g, x, y, dir, time) {
    g.fillStyle = '#efe8ff';
    g.fillRect(x - 1.5, y - U * 2.4, 3, U * 2.4);
    const cols = 4;
    const rows = 3;
    const cw = (U * 1.2) / cols;
    const ch = (U * 0.8) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wave = Math.sin(time * 6 - c * 0.9) * 3 * (c / cols);
        g.fillStyle = (r + c) % 2 ? '#ffffff' : '#2a2150';
        g.fillRect(dir > 0 ? x + c * cw : x - (c + 1) * cw, y - U * 2.4 + r * ch + wave, cw + 0.5, ch + 0.5);
      }
    }
  }

  drawFinish(g, left, right, v, time) {
    const fy = v.finish;
    const holding = v.holdTimer > 0;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const glow = g.createLinearGradient(0, fy - 14, 0, fy + 14);
    glow.addColorStop(0, 'rgba(255,200,90,0)');
    glow.addColorStop(0.5, `rgba(255,210,110,${holding ? 0.8 : 0.5})`);
    glow.addColorStop(1, 'rgba(255,200,90,0)');
    g.fillStyle = glow;
    g.fillRect(left, fy - 14, right - left, 28);
    const pulse = holding ? 0.6 + 0.4 * Math.sin(time * 12) : 0.9;
    g.fillStyle = `rgba(255,245,210,${pulse})`;
    g.fillRect(left, fy - 1.5, right - left, 3);
    const sh = (time * 0.35) % 1;
    const sweep = left + (right - left) * sh;
    const spot = g.createRadialGradient(sweep, fy, 0, sweep, fy, U * 2.5);
    spot.addColorStop(0, 'rgba(255,255,230,0.6)');
    spot.addColorStop(1, 'rgba(255,255,230,0)');
    g.fillStyle = spot;
    g.fillRect(sweep - U * 2.5, fy - U, U * 5, U * 2);
    g.restore();
    this.drawFlag(g, 0, fy, 1, time);
    this.drawFlag(g, WORLD_W, fy, -1, time);
    g.font = `${U * 0.75}px ${DISPLAY}`;
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(40,20,70,0.6)';
    g.strokeText('Traguardo', U * 1.6, fy - U * 0.5);
    g.fillStyle = '#ffe08a';
    g.fillText('Traguardo', U * 1.6, fy - U * 0.5);
  }

  drawLaser(g, left, right, ly, time, top) {
    const zone = g.createLinearGradient(0, ly - U * 4, 0, ly);
    zone.addColorStop(0, 'rgba(255,40,80,0)');
    zone.addColorStop(1, 'rgba(255,40,80,0.12)');
    g.fillStyle = zone;
    g.fillRect(left, Math.max(top, ly - U * 4), right - left, ly - Math.max(top, ly - U * 4));
    const flick = 0.82 + 0.18 * Math.sin(time * 31) * Math.sin(time * 7);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const beam = g.createLinearGradient(0, ly - 12, 0, ly + 12);
    beam.addColorStop(0, 'rgba(255,50,90,0)');
    beam.addColorStop(0.5, `rgba(255,70,110,${0.7 * flick})`);
    beam.addColorStop(1, 'rgba(255,50,90,0)');
    g.fillStyle = beam;
    g.fillRect(left, ly - 12, right - left, 24);
    g.fillStyle = `rgba(255,235,240,${flick})`;
    g.fillRect(left, ly - 1, right - left, 2);
    for (let i = 0; i < 6; i++) {
      const sx = left + (((time * 90 + i * 137) % (right - left)) + (right - left)) % (right - left);
      g.fillStyle = 'rgba(255,190,210,0.8)';
      g.fillRect(sx, ly - 1.5, 10, 3);
    }
    g.restore();
    for (const ex of [0, WORLD_W]) {
      roundRect(g, ex - 7, ly - 10, 14, 20, 4);
      g.fillStyle = '#2a1840';
      g.fill();
      g.fillStyle = '#ff5c86';
      g.beginPath();
      g.arc(ex, ly, 3.5, 0, TAU);
      g.fill();
    }
    g.font = `${U * 0.6}px ${DISPLAY}`;
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    g.fillStyle = '#ff8aa8';
    g.fillText('Laser', U * 0.6, ly - U * 0.4);
  }

  drawTowerLine(g, v, left, right) {
    if (v.height < 0.5 || v.height >= MODES.race.finish - 0.3) return;
    const ty = v.towerTop;
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.setLineDash([8, 8]);
    g.beginPath();
    g.moveTo(left, ty);
    g.lineTo(right, ty);
    g.stroke();
    g.restore();
    const bx = WORLD_W - U * 2.6;
    roundRect(g, bx, ty - U * 0.38, U * 2.2, U * 0.76, U * 0.38);
    g.fillStyle = 'rgba(18,12,46,0.6)';
    g.fill();
    g.fillStyle = '#fff';
    g.font = `600 ${U * 0.42}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${v.height.toFixed(1)} m`, bx + U * 1.1, ty + 1);
  }

  drawBeam(g, a, cam, top) {
    const geo = pieceGeometry(a.type, a.r);
    const bottom = a.gy ?? 0;
    const x = cam.ax;
    const beam = g.createLinearGradient(0, top, 0, bottom + geo.h * U);
    beam.addColorStop(0, 'rgba(255,255,255,0.02)');
    beam.addColorStop(0.5, 'rgba(255,255,255,0.1)');
    beam.addColorStop(1, 'rgba(255,255,255,0.03)');
    g.fillStyle = beam;
    g.fillRect(x, top, geo.w * U, bottom + geo.h * U - top);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x, top, 1.5, bottom + geo.h * U - top);
    g.fillRect(x + geo.w * U - 1.5, top, 1.5, bottom + geo.h * U - top);
  }

  drawGhost(g, a, time) {
    if (a.gy === null || a.gy === undefined) return;
    const geo = pieceGeometry(a.type, a.r);
    const hue = HUES[a.type];
    g.save();
    g.fillStyle = `hsla(${hue}, 100%, 75%, 0.18)`;
    for (const [cx, cy] of geo.cells) g.fillRect(a.ox + cx * U, a.gy + cy * U, U, U);
    g.setLineDash([6, 4]);
    g.lineDashOffset = -time * 20;
    g.lineWidth = 2;
    g.strokeStyle = `hsla(${hue}, 100%, 88%, 0.9)`;
    outlinePath(g, edges(geo.cells), a.ox, a.gy);
    g.stroke();
    g.restore();
  }

  blit(g, sp, x, y, angle) {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.drawImage(sp.canvas, sp.dx, sp.dy, sp.w, sp.h);
    g.restore();
  }

  drawPieces(g, pieces, time) {
    g.save();
    g.globalAlpha = 0.28;
    for (const p of pieces) this.blit(g, silhouette(p.type, p.r, '#12062a'), p.x + 4, p.y + 6, p.a);
    g.restore();
    for (const p of pieces) {
      this.blit(g, pieceSprite(p.type, p.r), p.x, p.y, p.a);
      if (p.icy) {
        g.save();
        g.globalAlpha = 0.42;
        this.blit(g, silhouette(p.type, p.r, '#c8f2ff'), p.x, p.y, p.a);
        g.restore();
      }
      if (p.rooted) this.blit(g, vineSprite(p.type, p.r), p.x, p.y, p.a);
      if (p.f) {
        g.save();
        g.globalAlpha = 0.35 + 0.2 * Math.sin(time * 20);
        this.blit(g, silhouette(p.type, p.r, '#ff3c5a'), p.x, p.y, p.a);
        g.restore();
      }
    }
  }

  drawActive(g, a, cam, time) {
    const geo = pieceGeometry(a.type, a.r);
    const x = cam.ax + geo.off.x;
    const y = a.oy + geo.off.y;
    g.save();
    g.shadowColor = `hsl(${HUES[a.type]}, 100%, 72%)`;
    g.shadowBlur = 16 + Math.sin(time * 5) * 5;
    this.blit(g, pieceSprite(a.type, a.r), x, y, cam.rot);
    g.restore();
    if (a.icy) {
      g.save();
      g.globalAlpha = 0.45;
      this.blit(g, silhouette(a.type, a.r, '#c8f2ff'), x, y, cam.rot);
      g.restore();
    }
    if (a.fast) {
      for (let i = 0; i < 2; i++) {
        this.particles.push({
          id: this.currentId, kind: 'spark', x: cam.ax + Math.random() * geo.w * U, y: a.oy,
          vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 40, grav: 0,
          life: 0.4, max: 0.4, r: 2 + Math.random() * 2, hue: HUES[a.type],
        });
      }
    }
  }

  spawnEvents(v, top) {
    for (const e of v.events) {
      if (e.type === 'land') {
        for (let i = 0; i < 16; i++) {
          this.particles.push({
            id: v.id, kind: i % 4 ? 'dust' : 'spark', x: e.x + (Math.random() - 0.5) * e.w, y: e.y,
            vx: (Math.random() - 0.5) * 110, vy: -Math.random() * 80, grav: 70,
            life: 0.6, max: 0.6, r: 2 + Math.random() * 4, hue: HUES[e.piece],
          });
        }
      }
      if (e.type === 'lost') {
        for (let i = 0; i < 30; i++) {
          this.particles.push({
            id: v.id, kind: 'spark', x: e.x + (Math.random() - 0.5) * U * 2, y: U * 3,
            vx: (Math.random() - 0.5) * 160, vy: -80 - Math.random() * 160, grav: 160,
            life: 1, max: 1, r: 2 + Math.random() * 3, hue: 350,
          });
        }
      }
      if (e.type === 'cast' || e.type === 'hex') {
        const dark = SPELLS[e.spell]?.side === 'dark';
        for (let i = 0; i < 50; i++) {
          const ang = Math.random() * TAU;
          const sp = 60 + Math.random() * 140;
          this.particles.push({
            id: v.id, kind: 'spark', x: WORLD_W / 2, y: v.towerTop - U,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, grav: 20,
            life: 1, max: 1, r: 2 + Math.random() * 3, hue: e.type === 'hex' ? 320 : dark ? 275 : 48,
          });
        }
      }
      if (e.type === 'won' || e.type === 'done') {
        for (let i = 0; i < (e.type === 'won' ? 160 : 60); i++) {
          this.particles.push({
            id: v.id, kind: 'confetti', x: Math.random() * WORLD_W, y: top - Math.random() * U * 4,
            vx: (Math.random() - 0.5) * 120, vy: Math.random() * 80, grav: 110, rot: Math.random() * TAU,
            vr: (Math.random() - 0.5) * 12, life: 3, max: 3, r: 4 + Math.random() * 3, hue: Math.random() * 360,
          });
        }
      }
    }
  }

  updateShooting(dt) {
    if (!this.shooting && Math.random() < dt * 0.2) this.shooting = { x: 0.4 + Math.random() * 0.5, y: Math.random() * 0.35, life: 1 };
    if (!this.shooting) return;
    const st = this.shooting;
    st.x -= dt * 0.55;
    st.y += dt * 0.27;
    st.life -= dt * 1.3;
    if (st.life <= 0) this.shooting = null;
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0).slice(-1200);
  }

  drawParticles(g, id) {
    for (const p of this.particles) {
      if (p.id !== id) continue;
      const a = p.life / p.max;
      if (p.kind === 'dust') {
        g.fillStyle = `rgba(255,255,255,${a * 0.55})`;
        g.beginPath();
        g.arc(p.x, p.y, p.r * (1.5 - a * 0.5), 0, TAU);
        g.fill();
      } else if (p.kind === 'spark') {
        g.fillStyle = `hsla(${p.hue}, 100%, 72%, ${a})`;
        g.beginPath();
        g.arc(p.x, p.y, p.r * a + 0.5, 0, TAU);
        g.fill();
      } else {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = `hsla(${p.hue}, 90%, 62%, ${a})`;
        g.fillRect(-p.r / 2, -p.r, p.r, p.r * 2);
        g.restore();
      }
    }
  }

  scoreText(v) {
    if (v.mode === 'race') return `${Math.max(0, v.height).toFixed(1)} m`;
    if (v.mode === 'survival') return `${v.score} / ${v.target}`;
    return `${v.score} pezzi`;
  }

  drawHud(g, v, x, y, w, h, cam, time, race) {
    const k = clamp(Math.min(w, h) / 640, 0.62, 1.15);
    if (cam.flash > 0) {
      g.fillStyle = `rgba(255,40,80,${cam.flash * 0.25})`;
      g.fillRect(x, y, w, h);
    }

    const px = x + 14 * k;
    const py = y + 14 * k;
    const cw = 232 * k;
    const ch = v.left !== null ? 96 * k : 78 * k;
    glass(g, px, py, cw, ch, 18 * k);
    roundRect(g, px + 10 * k, py + 12 * k, 5 * k, ch - 24 * k, 3 * k);
    g.fillStyle = `hsl(${v.hue}, 90%, 62%)`;
    g.fill();
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = '#fff';
    g.font = `${21 * k}px ${DISPLAY}`;
    g.fillText(v.name, px + 26 * k, py + 11 * k, 190 * k);
    for (let i = 0; i < LIVES; i++) {
      const pop = i === v.lives && cam.pop > 0 ? 1 + cam.pop * 0.7 : 1;
      const size = 20 * k * pop;
      const hx = px + (38 + i * 26) * k;
      const hy = py + 44 * k - (size - 20 * k) / 2;
      heart(g, hx, hy, size);
      g.fillStyle = i < v.lives ? '#ff4d6d' : `rgba(255,255,255,${0.16 + cam.pop * 0.5})`;
      g.fill();
      if (i < v.lives) {
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.beginPath();
        g.ellipse(hx - size * 0.22, hy + size * 0.28, size * 0.09, size * 0.06, -0.6, 0, TAU);
        g.fill();
      }
    }
    g.textAlign = 'right';
    g.font = `700 ${18 * k}px ${FONT}`;
    g.fillStyle = '#ffd76a';
    g.fillText(this.scoreText(v), px + cw - 14 * k, py + 44 * k);
    if (v.left !== null) {
      g.textAlign = 'left';
      g.font = `500 ${14 * k}px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillText(`Pezzi rimasti: ${Math.max(0, v.left)}`, px + 26 * k, py + 70 * k);
    }

    if (v.roundLabel) {
      g.font = `600 ${15 * k}px ${FONT}`;
      const tw = g.measureText(v.roundLabel).width + 32 * k;
      glass(g, x + w / 2 - tw / 2, y + 14 * k, tw, 34 * k, 17 * k);
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(v.roundLabel, x + w / 2, y + 31 * k);
    }

    if (v.next) {
      const nx = x + w - 112 * k;
      const ny = y + 14 * k;
      glass(g, nx, ny, 98 * k, 98 * k, 18 * k);
      g.fillStyle = 'rgba(255,255,255,0.72)';
      g.font = `500 ${13 * k}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText('Prossimo', nx + 49 * k, ny + 9 * k);
      const geo = pieceGeometry(v.next, 0);
      const sc = Math.min(17 * k / U, (70 * k) / (geo.w * U));
      const sp = pieceSprite(v.next, 0);
      g.save();
      g.translate(nx + 49 * k, ny + 58 * k);
      g.scale(sc, sc);
      g.drawImage(sp.canvas, -geo.w * U / 2 - 3, -geo.h * U / 2 - 3, sp.w, sp.h);
      if (v.nextIcy) {
        g.globalAlpha = 0.45;
        const ice = silhouette(v.next, 0, '#c8f2ff');
        g.drawImage(ice.canvas, -geo.w * U / 2 - 3, -geo.h * U / 2 - 3, ice.w, ice.h);
      }
      g.restore();
    }

    if (v.spellHud) {
      const sx = x + w - 112 * k;
      const sy = y + 122 * k;
      glass(g, sx, sy, 98 * k, 98 * k, 18 * k);
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.font = `500 ${13 * k}px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.72)';
      g.fillText('Magia', sx + 49 * k, sy + 8 * k);
      if (v.spell) {
        const bob = Math.sin(time * 4) * 2 * k;
        this.drawSpellIcon(g, v.spell, sx + 49 * k, sy + 50 * k + bob, 20 * k);
        g.fillStyle = '#fff';
        g.font = `700 ${12 * k}px ${FONT}`;
        g.fillText(`${SPELLS[v.spell].name} · Q`, sx + 49 * k, sy + 76 * k, 90 * k);
      } else {
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.font = `600 ${13 * k}px ${FONT}`;
        g.fillText(`tra ${v.spellIn}`, sx + 49 * k, sy + 42 * k);
        g.fillText(v.spellIn === 1 ? 'pezzo' : 'pezzi', sx + 49 * k, sy + 60 * k);
      }
    }

    const bx = x + w - 28 * k;
    const by = y + (v.spellHud ? 250 : 150) * k;
    const bh = Math.max(40, y + h - 40 * k - by);
    roundRect(g, bx, by, 10 * k, bh, 5 * k);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fill();
    const own = clamp(v.progress, 0, 1);
    if (own > 0.02) {
      const bar = g.createLinearGradient(0, by + bh, 0, by);
      bar.addColorStop(0, `hsl(${v.hue}, 90%, 45%)`);
      bar.addColorStop(1, `hsl(${v.hue}, 95%, 70%)`);
      roundRect(g, bx, by + bh * (1 - own), 10 * k, bh * own, 5 * k);
      g.fillStyle = bar;
      g.fill();
    }
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        g.fillStyle = (r + c) % 2 ? '#2a2150' : '#fff';
        g.fillRect(bx - 2 * k + c * 7 * k, by - 20 * k + r * 7 * k, 7 * k, 7 * k);
      }
    }
    for (const r of [...race].sort((a, b) => (a.id === v.id) - (b.id === v.id))) {
      const my = by + bh * (1 - clamp(r.progress, 0, 1));
      g.beginPath();
      g.arc(bx + 5 * k, my, (r.id === v.id ? 9 : 6) * k, 0, TAU);
      g.fillStyle = `hsl(${r.hue}, 90%, 62%)`;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#fff';
      g.stroke();
    }

    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 10;
    if (v.state === 'playing' && v.holdTimer > 0 && v.holdMax > 0) {
      const R = 46 * k;
      const cx = px + R + 16 * k;
      const cy = py + ch + R + 30 * k;
      g.lineWidth = 10 * k;
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.arc(cx, cy, R, 0, TAU);
      g.stroke();
      g.strokeStyle = '#ffd76a';
      g.beginPath();
      g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(v.holdTimer / v.holdMax, 0, 1));
      g.stroke();
      g.fillStyle = '#fff';
      g.font = `${50 * k}px ${DISPLAY}`;
      g.fillText(String(Math.ceil(v.holdMax - v.holdTimer)), cx, cy + 3 * k);
      g.font = `600 ${16 * k}px ${FONT}`;
      g.fillText('Tieni ferma la torre!', cx + 20 * k, cy + R + 26 * k);
    }
    if (v.intro > 0) {
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(8,4,24,0.35)';
      g.fillRect(x, y, w, h);
      g.shadowBlur = 14;
      const cy = y + h * 0.36;
      g.fillStyle = '#ffd76a';
      g.font = `${60 * k}px ${DISPLAY}`;
      g.fillText(MODES[v.mode].name, x + w / 2, cy);
      g.fillStyle = '#fff';
      g.font = `600 ${19 * k}px ${FONT}`;
      g.fillText(MODES[v.mode].goal, x + w / 2, cy + 50 * k, w * 0.9);
      g.font = `500 ${16 * k}px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillText(TOWERS[v.structure]?.name ?? '', x + w / 2, cy + 80 * k, w * 0.9);
      g.fillStyle = '#fff';
      const n = Math.ceil(v.intro);
      const bump = 1 + (v.intro % 1) * 0.35;
      g.font = `${96 * k * bump}px ${DISPLAY}`;
      g.fillText(String(n), x + w / 2, cy + 170 * k);
    }
    if (cam.msg && v.intro <= 0) {
      const m = cam.msg;
      const a = clamp(m.t * 2, 0, 1);
      const rise = (1 - clamp(m.t / 2, 0, 1)) * 16 * k;
      g.globalAlpha = a;
      g.fillStyle = m.color;
      g.font = `${34 * k}px ${DISPLAY}`;
      g.fillText(m.text, x + w / 2, y + h * 0.3 - rise, w * 0.9);
      g.fillStyle = '#fff';
      g.font = `600 ${15 * k}px ${FONT}`;
      g.fillText(m.sub, x + w / 2, y + h * 0.3 + 30 * k - rise, w * 0.9);
      g.globalAlpha = 1;
    }
    if (cam.go > 0) {
      g.globalAlpha = clamp(cam.go * 1.5, 0, 1);
      g.fillStyle = '#7dffb2';
      g.font = `${(90 + (1 - cam.go) * 50) * k}px ${DISPLAY}`;
      g.fillText('Via!', x + w / 2, y + h * 0.4);
      g.globalAlpha = 1;
    }
    if (['dead', 'won', 'done'].includes(v.state)) {
      const labels = { dead: ['Crollata', '#ff8aa3'], won: ['Completata', '#ffd76a'], done: ['Finito', '#8ff5ff'] };
      const [label, color] = labels[v.state];
      g.shadowBlur = 0;
      g.fillStyle = v.state === 'dead' ? 'rgba(8,4,24,0.55)' : 'rgba(255,215,106,0.08)';
      g.fillRect(x, y, w, h);
      const cy = y + h * 0.42 + Math.sin(time * 3) * 4;
      glass(g, x + w / 2 - 150 * k, cy - 50 * k, 300 * k, v.mode === 'race' ? 92 * k : 116 * k, 26 * k);
      g.shadowBlur = 12;
      g.fillStyle = color;
      g.font = `${48 * k}px ${DISPLAY}`;
      g.fillText(label, x + w / 2, cy);
      if (v.mode !== 'race') {
        g.fillStyle = '#fff';
        g.font = `600 ${18 * k}px ${FONT}`;
        g.fillText(this.scoreText(v), x + w / 2, cy + 40 * k);
      }
    }
    g.restore();
  }
}
