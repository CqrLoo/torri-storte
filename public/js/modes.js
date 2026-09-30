import { U } from './config.js';

export const MODES = {
  race: { name: 'Gara', goal: 'Porta la torre oltre il traguardo e tienila ferma', finish: 20, hold: 3 },
  survival: { name: 'Sopravvivenza', goal: 'Piazza 30 pezzi senza perdere tutte le vite', target: 30, hold: 2 },
  puzzle: { name: 'Rompicapo', goal: 'Incastra più pezzi possibile sotto il laser', laser: 13, pieces: 24 },
};

export const TOWERS = {
  torre: {
    name: 'Torre del mago',
    torches: [[1, 4], [5, 4]],
    map: [
      '.#...#.',
      '.#ooo#.',
      '.#ooo#.',
      '.##o##.',
      '.##o##.',
      '..###..',
      '..###..',
      '.#####.',
      '.#####.',
    ],
  },
  gemella: {
    name: 'Torri gemelle',
    torches: [[1, 5], [5, 5]],
    map: [
      '.#...#.',
      '.##.##.',
      '.##o##.',
      '.##o##.',
      '.##o##.',
      '.#####.',
      '.#o#o#.',
      '.#####.',
    ],
  },
  larga: {
    name: 'Fortino',
    torches: [[0, 2], [6, 2]],
    map: [
      '#..#..#',
      '#oo#oo#',
      '#######',
      '.#####.',
      '.#####.',
    ],
  },
};

function parse(map) {
  const solid = [];
  const alcove = [];
  map.forEach((row, i) => {
    const cy = map.length - 1 - i;
    [...row].forEach((ch, cx) => {
      if (ch === '#') solid.push([cx, cy]);
      if (ch === 'o') alcove.push([cx, cy]);
    });
  });
  return { solid, alcove };
}

const parsed = Object.fromEntries(Object.entries(TOWERS).map(([k, t]) => [k, parse(t.map)]));
export const STRUCTURES = Object.fromEntries(Object.entries(parsed).map(([k, p]) => [k, p.solid]));
export const ALCOVES = Object.fromEntries(Object.entries(parsed).map(([k, p]) => [k, p.alcove]));
export const STRUCTURE_KEYS = Object.keys(TOWERS);
export const THEMES = ['canyon', 'alpi', 'ghiaccio'];

export const SPELLS = {
  radici: { side: 'light', name: 'Radici', desc: 'Blocca per sempre i pezzi già fermi' },
  mattoncino: { side: 'light', name: 'Mattoncini', desc: 'I prossimi due pezzi sono piccoli' },
  maledetto: { side: 'dark', name: 'Pezzo maledetto', desc: 'Il prossimo pezzo avversario è enorme' },
  ghiaccio: { side: 'dark', name: 'Ghiaccio', desc: 'Tre pezzi scivolosi per l\u2019avversario' },
  nebbia: { side: 'dark', name: 'Nebbia', desc: 'Copre la vista dell\u2019avversario' },
};

export const LIGHT_SPELLS = Object.keys(SPELLS).filter(k => SPELLS[k].side === 'light');
export const DARK_SPELLS = Object.keys(SPELLS).filter(k => SPELLS[k].side === 'dark');
export const SPELL_EVERY = 5;

export function goalLines(mode) {
  const cfg = MODES[mode];
  return {
    finish: mode === 'race' ? -cfg.finish * U : null,
    laser: mode === 'puzzle' ? -cfg.laser * U : null,
  };
}
