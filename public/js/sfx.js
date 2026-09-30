let ctx = null;
let muted = false;

function unlock() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
}

addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

export function toggleMute() {
  muted = !muted;
  return muted;
}

function tone(freq, dur, type = 'sine', vol = 0.1, slide = 0, delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  move: () => tone(520, 0.035, 'square', 0.02),
  rotate: () => tone(780, 0.05, 'triangle', 0.05, 200),
  land: () => tone(170, 0.14, 'sine', 0.2, -90),
  lose: () => tone(320, 0.45, 'sawtooth', 0.07, -240),
  tick: () => tone(660, 0.08, 'triangle', 0.08),
  go: () => { tone(660, 0.1, 'triangle', 0.1); tone(990, 0.25, 'triangle', 0.1, 0, 0.1); },
  done: () => [392, 523, 659].forEach((f, i) => tone(f, 0.2, 'sine', 0.1, 0, i * 0.1)),
  cast: () => [880, 1175, 1568].forEach((f, i) => tone(f, 0.18, 'sine', 0.07, 0, i * 0.06)),
  hex: () => tone(220, 0.5, 'sawtooth', 0.06, -120),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, 0, i * 0.12)),
};
