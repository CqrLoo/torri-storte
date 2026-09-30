const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'ShiftLeft', 'ShiftRight']);
const listeners = new Set();

addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (PREVENT.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  listeners.forEach(c => c.press(e.code));
});
addEventListener('keyup', e => listeners.forEach(c => c.release(e.code)));
addEventListener('blur', () => listeners.forEach(c => c.reset()));

export const KEYMAPS = {
  all: {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    rotate: ['KeyW', 'ArrowUp', 'Space'],
    down: ['KeyS', 'ArrowDown'],
    spell: ['KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'],
  },
};

export class Controls {
  constructor(map) {
    this.map = map;
    this.down = new Set();
    this.pressed = new Set();
    listeners.add(this);
  }

  press(code) {
    const actions = Object.keys(this.map).filter(a => this.map[a].includes(code));
    if (!actions.length) return;
    this.down.add(code);
    actions.forEach(a => this.pressed.add(a));
  }

  release(code) {
    this.down.delete(code);
  }

  held(action) {
    return this.map[action].some(code => this.down.has(code));
  }

  consume(action) {
    return this.pressed.delete(action);
  }

  clearPressed() {
    this.pressed.clear();
  }

  reset() {
    this.down.clear();
    this.pressed.clear();
  }

  dispose() {
    listeners.delete(this);
  }
}

export class DemoControls {
  held(action) {
    return action === 'down' && performance.now() % 4000 > 3200;
  }

  consume(action) {
    const odds = { rotate: 0.006, left: 0.012, right: 0.012 };
    return Math.random() < (odds[action] ?? 0);
  }

  clearPressed() {}

  dispose() {}
}
