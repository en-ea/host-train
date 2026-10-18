/* ---------- static data: statuses, shift types, names, sample layout ---------- */
const PHASES = ['seated', 'ordered', 'mains', 'dessert', 'check', 'paid'];
// share of a party's total turn spent in each phase
const PHASE_SHARE = { seated: 0.10, ordered: 0.17, mains: 0.38, dessert: 0.15, check: 0.10, paid: 0.10 };
const STATUS_META = {
  available: { label: 'Available', short: 'Open' },
  reserved: { label: 'Reserved soon', short: 'Held' },
  seated: { label: 'Seated', short: 'Seated' },
  ordered: { label: 'Ordered', short: 'Ordered' },
  mains: { label: 'Mains', short: 'Mains' },
  dessert: { label: 'Dessert', short: 'Dessert' },
  check: { label: 'Check dropped', short: 'Check' },
  paid: { label: 'Paid', short: 'Paid' },
  clearing: { label: 'Needs clearing', short: 'Bus' },
};
const STATUS_ORDER = ['available', 'reserved', 'seated', 'ordered', 'mains', 'dessert', 'check', 'paid', 'clearing'];

const SHAPES = {
  round: { label: 'Round', w: 76, h: 76 },
  square: { label: 'Square', w: 70, h: 70 },
  rect: { label: 'Rectangle', w: 150, h: 76 },
  booth: { label: 'Booth', w: 96, h: 110 },
  bar: { label: 'Bar seat', w: 34, h: 34 },
};
const DECOR_KINDS = {
  wall: { label: 'Wall', w: 200, h: 12 },
  block: { label: 'Counter / room', w: 200, h: 60 },
  zone: { label: 'Area outline', w: 260, h: 180 },
  label: { label: 'Text label', w: 120, h: 30 },
};
const SECTION_COLORS = ['#2E7DBF', '#C2457A', '#3A9A6A', '#B7791F', '#7357C9', '#1F9AA8', '#C4512F', '#6B7A35'];

const TAGS = {
  vip: { label: 'VIP', icon: 'star' },
  regular: { label: 'Regular', icon: 'heart' },
  birthday: { label: 'Birthday', icon: 'cake' },
  anniv: { label: 'Anniversary', icon: 'heart' },
  allergy: { label: 'Allergy', icon: 'leaf' },
  highchair: { label: 'High chair', icon: 'baby' },
};

const SHIFT_TYPES = {
  slow: {
    name: 'Slow weeknight', blurb: 'Tuesday dinner. Light book, a few walk-ins. Good for learning the flow.',
    start: 17 * 60, end: 21 * 60 + 30, resFrac: 0.38, walkFrac: 0.2, turnMul: 0.95, cbRate: 0.6, noShow: 0.07,
    curve: [[0, 0.5], [1, 0.8], [2, 1], [3, 0.7], [4, 0.3], [4.5, 0]],
    sizes: [[1, 4], [2, 50], [3, 12], [4, 22], [5, 5], [6, 5], [8, 2]],
  },
  normal: {
    name: 'Normal dinner', blurb: 'A steady Wednesday or Thursday with a real 7pm push.',
    start: 17 * 60, end: 22 * 60, resFrac: 0.62, walkFrac: 0.32, turnMul: 1, cbRate: 1, noShow: 0.07,
    curve: [[0, 0.45], [1, 0.75], [2, 1], [3, 0.95], [4, 0.45], [5, 0]],
    sizes: [[1, 3], [2, 44], [3, 12], [4, 24], [5, 7], [6, 6], [7, 2], [8, 2]],
  },
  friday: {
    name: 'Friday rush', blurb: 'Packed book, waves of walk-ins, a wait list from 6:30 on.',
    start: 17 * 60, end: 23 * 60, resFrac: 0.92, walkFrac: 0.6, turnMul: 1.05, cbRate: 1.4, noShow: 0.06,
    curve: [[0, 0.55], [1, 0.9], [1.5, 1], [3.5, 1], [4.5, 0.7], [5.5, 0.3], [6, 0]],
    sizes: [[1, 2], [2, 40], [3, 12], [4, 25], [5, 8], [6, 8], [7, 2], [8, 2], [10, 1]],
  },
  brunch: {
    name: 'Weekend brunch', blurb: 'Fast turns, families, lots of walk-ins and high chairs.',
    start: 10 * 60, end: 14 * 60 + 30, resFrac: 0.5, walkFrac: 0.65, turnMul: 0.75, cbRate: 1.1, noShow: 0.08,
    curve: [[0, 0.5], [1, 0.9], [2, 1], [3, 0.8], [4, 0.3], [4.5, 0]],
    sizes: [[1, 3], [2, 36], [3, 15], [4, 28], [5, 9], [6, 7], [8, 2]],
  },
  holiday: {
    name: 'Holiday', blurb: "Mother's Day energy: fully booked, big families, little patience.",
    start: 16 * 60, end: 22 * 60, resFrac: 1.0, walkFrac: 0.25, turnMul: 1.12, cbRate: 1.6, noShow: 0.04,
    curve: [[0, 0.8], [1, 1], [4, 1], [5, 0.6], [6, 0]],
    sizes: [[2, 26], [3, 14], [4, 28], [5, 12], [6, 11], [7, 4], [8, 4], [10, 1]],
  },
  tutorial: {
    name: 'Tutorial', blurb: 'A short guided shift.', start: 18 * 60, end: 19 * 60 + 30, resFrac: 0, walkFrac: 0,
    turnMul: 1, cbRate: 0, noShow: 0, curve: [[0, 1]], sizes: [[2, 1]],
  },
};

const FIRST = ['Maria', 'James', 'Aisha', 'Wei', 'Sofia', 'Daniel', 'Priya', 'Luca', 'Hannah', 'Omar', 'Grace', 'Mateo', 'Chloe', 'Kenji', 'Nadia', 'Ethan', 'Zara', 'Diego', 'Ruth', 'Samir', 'Lena', 'Marcus', 'Ines', 'Tom', 'Yara', 'Ben', 'Elif', 'Noah', 'Ama', 'Felix', 'Rosa', 'Ivan', 'Leah', 'Kofi', 'June', 'Ravi', 'Mia', 'Owen', 'Talia', 'Hugo'];
const LAST = ['Garcia', 'Patel', 'Nguyen', 'Kim', 'Rossi', 'Okafor', 'Brooks', 'Silva', 'Cohen', 'Murphy', 'Haddad', 'Lindqvist', 'Moreau', 'Tanaka', 'Ortiz', 'Walsh', 'Mensah', 'Novak', 'Reyes', 'Fischer', 'Ali', 'Bennett', 'Costa', 'Dubois', 'Evans', 'Ferrari', 'Gupta', 'Hughes', 'Ibrahim', 'Jensen', 'Kowalski', 'Lopez', 'Mendes', 'Nakamura', 'Olsen', 'Park', 'Quinn', 'Ramos', 'Sato', 'Turner', 'Vargas', 'Wright', 'Yilmaz', 'Zhou', 'Abbott', 'Byrne', 'Castillo', 'Duarte', 'Ekwueme', 'Flores'];

const ROOT_SETTINGS = () => ({
  venue: 'Meetbros',
  theme: 'system',
  turn: { s2: 70, s4: 90, s6: 105, s8: 120 }, // minutes by party size bucket
  autoBus: 6,          // minutes until a busser clears a table (0 = host must clear)
  heldWindow: 30,      // table shows "reserved soon" this many minutes before a booking
  lateGrace: 15,       // minutes late before a booking is flagged as a possible no-show
  rushPct: 70,         // occupancy % that counts as a rush
  overload: 8,         // covers above the other servers' average that counts as overloaded
  doubleSeatMin: 12,   // two seatings in one section within this many minutes = double seat
  pauseOnAlert: true,
  curveballs: 'normal', // low | normal | high
  showTimers: true,
});

function sampleLayout() {
  const L = { id: uid('lay'), name: 'Meetbros main room', width: 1200, height: 800, sections: [], tables: [], combos: [], decor: [] };
  const sec = (name, server, color) => { const s = { id: uid('sec'), name, server, color }; L.sections.push(s); return s.id; };
  const A = sec('Bar', 'Theo', '#B7791F');
  const B = sec('Window', 'Jess', '#2E7DBF');
  const C = sec('Main', 'Marco', '#3A9A6A');
  const D = sec('Booths', 'Priya', '#C2457A');
  const E = sec('Patio', 'Sam', '#7357C9');
  const T = (name, shape, x, y, min, max, sectionId, combinable = true, w, h, rot = 0) => {
    const t = { id: uid('t'), name, shape, x, y, w: w || SHAPES[shape].w, h: h || SHAPES[shape].h, rot, min, max, sectionId, combinable };
    L.tables.push(t); return t;
  };
  const bars = [];
  for (let i = 0; i < 8; i++) bars.push(T('B' + (i + 1), 'bar', 90 + i * 50, 132, 1, 1, A, true));
  const w = [];
  [[200, 1], [272, 2], [380, 3], [452, 4], [560, 5], [632, 6]].forEach(([y, n]) => w.push(T(String(n), 'square', 76, y, 1, 2, B, true, 64, 64)));
  const t10 = T('10', 'square', 220, 240, 2, 4, B), t11 = T('11', 'square', 306, 240, 2, 4, B);
  const t12 = T('12', 'square', 220, 360, 2, 4, C), t13 = T('13', 'square', 306, 360, 2, 4, C);
  const t14 = T('14', 'square', 440, 240, 2, 4, C), t15 = T('15', 'square', 526, 240, 2, 4, C);
  T('16', 'round', 483, 372, 4, 6, C, false, 104, 104);
  const t30 = T('30', 'rect', 760, 250, 6, 8, D, true, 190, 80);
  const t31 = T('31', 'rect', 760, 352, 4, 6, C, true, 160, 76);
  [[230, 20], [350, 21], [470, 22], [590, 23]].forEach(([y, n]) => T(String(n), 'booth', 1100, y, 3, 5, D, false));
  const t40 = T('40', 'round', 230, 560, 2, 4, E, true, 84, 84), t41 = T('41', 'round', 340, 560, 2, 4, E, true, 84, 84);
  T('42', 'round', 280, 680, 2, 4, E, false, 84, 84);
  const p1 = T('P1', 'round', 760, 570, 2, 4, E), p2 = T('P2', 'round', 870, 570, 2, 4, E);
  const p3 = T('P3', 'round', 760, 690, 2, 4, E), p4 = T('P4', 'round', 870, 690, 2, 4, E);
  const C2 = (ts, min, max) => L.combos.push({ id: uid('cmb'), tableIds: ts.map(t => t.id), min, max });
  C2([w[0], w[1]], 3, 4); C2([w[2], w[3]], 3, 4); C2([w[4], w[5]], 3, 4);
  C2([t10, t11], 5, 8); C2([t12, t13], 5, 8); C2([t14, t15], 5, 8);
  C2([t10, t11, t12, t13], 9, 14);
  C2([t30, t31], 9, 14); C2([t40, t41], 5, 8); C2([p1, p2], 5, 8); C2([p3, p4], 5, 8);
  for (let i = 0; i < 8; i += 2) C2([bars[i], bars[i + 1]], 2, 2);
  const D_ = (kind, text, x, y, w, h, rot = 0) => L.decor.push({ id: uid('d'), kind, text, x, y, w, h, rot });
  D_('wall', '', 600, 26, 1160, 12); D_('wall', '', 26, 400, 12, 760); D_('wall', '', 1174, 400, 12, 760);
  D_('wall', '', 263, 774, 486, 12); D_('wall', '', 893, 774, 574, 12);
  D_('block', 'Bar', 265, 76, 430, 46);
  D_('block', 'Kitchen', 1020, 96, 280, 128);
  D_('zone', 'Patio', 815, 630, 300, 220);
  D_('label', 'Door', 555, 750, 90, 28);
  D_('label', 'Host stand', 555, 700, 120, 28);
  D_('block', 'Service', 640, 96, 120, 60);
  return L;
}

function blankLayout(name) {
  const L = { id: uid('lay'), name: name || 'New layout', width: 1200, height: 800, sections: [], tables: [], combos: [], decor: [] };
  L.sections.push({ id: uid('sec'), name: 'Section 1', server: 'Server 1', color: SECTION_COLORS[0] });
  L.decor.push({ id: uid('d'), kind: 'zone', text: 'Dining room', x: 600, y: 400, w: 1100, h: 700, rot: 0 });
  return L;
}
