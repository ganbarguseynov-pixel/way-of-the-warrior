/* ============================================================
   arena.js — правила и движок шахматных арен
   Один файл работает и у хоста, и у гостя.
   Время: 5 минут основного + 1 минута дополнительного.
   ============================================================ */
(function (global) {
'use strict';

const STEP = 1000;
const MAX_ARENA = 10;

/* ---------- ВРЕМЯ ---------- */
const MAIN_TIME = 300;   // 5 минут основного времени
const OT_TIME   = 60;    // 1 минута дополнительного
const FAST_FROM = 60;    // последняя минута основного — эликсир ×1.5

const PIECES = {
  pawn:   { cost:1, name:'Пешка',  w:'♙', b:'♟', val:2 },
  knight: { cost:3, name:'Конь',   w:'♘', b:'♞', val:4 },
  bishop: { cost:3, name:'Слон',   w:'♗', b:'♝', val:4 },
  rook:   { cost:4, name:'Ладья',  w:'♖', b:'♜', val:5 },
  king:   { cost:5, name:'Король', w:'♔', b:'♚', val:0 },
  queen:  { cost:6, name:'Ферзь',  w:'♕', b:'♛', val:8 },
  saw:    { cost:0, name:'Пила',   w:'⚙', b:'⚙', val:9 }
};

const ARENAS = [
  { n:1,  name:'Капкан',
    rule:'8 скрытых ловушек на доске. Наступил — фигура погибает. Король невредим.' },
  { n:2,  name:'Псарня',
    rule:'Каждые 15 секунд с краёв выбегают пешки. Назад ходить нельзя.' },
  { n:3,  name:'Мясорубка',
    rule:'Взятие уничтожает все фигуры вокруг клетки — и чужие, и свои.' },
  { n:4,  name:'Кошмар на улице Вязов',
    rule:'Первые 3 фигуры каждого засыпают. Каждое взятие будит одну.' },
  { n:5,  name:'Техасская резня',
    rule:'Пила, взяв фигуру, продолжает рубить дальше по той же линии.' },
  { n:6,  name:'Хостел',
    rule:'Взятая фигура не гибнет, а переходит врагу. Король не переходит.' },
  { n:7,  name:'Восставший из ада',
    rule:'Первые 2 фигуры прикованы. Освобождение стоит 4 эликсира.' },
  { n:8,  name:'Судная ночь',
    rule:'Раз за бой: 10 секунд без правил. Все ходят на 1 клетку, эликсир не тратится.' },
  { n:9,  name:'Зловещие мертвецы',
    rule:'Убитая фигура встаёт обратно через 20 секунд, если клетка свободна.' },
  { n:10, name:'Бессмертная партия',
    rule:'Эликсир только за взятия. Времени нет. Ничьей нет.' }
];

const DECK = ['pawn','pawn','pawn','knight','knight','bishop','rook','queen'];

const DIR8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const DIRS = {
  rook:   [[1,0],[-1,0],[0,1],[0,-1]],
  bishop: [[1,1],[1,-1],[-1,1],[-1,-1]],
  queen:  DIR8,
  king:   DIR8
};
const KNIGHT = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];

const inside = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8;
const coord  = (x, y) => 'abcdefgh'[x] + (8 - y);

function shuffle(a){
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function arenaOf(c){ return Math.min(MAX_ARENA, Math.floor(Math.max(0, c) / STEP) + 1); }
function floorOf(c){ return (arenaOf(c) - 1) * STEP; }

function deltaFor(winnerCups, loserCups){
  if (winnerCups === loserCups) return 30;
  return winnerCups < loserCups ? 31 : 29;
}

function lossFor(loserCups, delta){
  return Math.min(delta, Math.max(0, loserCups - floorOf(loserCups)));
}

function nameOf(s, side){
  const p = s.players && s.players[side];
  return (p && p.name) || (side === 'a' ? 'Ты' : 'Враг');
}

function log(s, text){
  s.log.unshift(text);
  if (s.log.length > 60) s.log.length = 60;
}

/* ================= ВРЕМЯ И ЭЛИКСИР ================= */

/* 1 — обычная, 1.5 — последняя минута основного, 2 — доп. время */
function energyRate(s){
  if (!s || s.arena === 10) return 1;
  if (s.phase === 'overtime') return 2;
  if (s.timeLeft <= FAST_FROM) return 1.5;
  return 1;
}

/* король на доске — 1, нет короля — 0 */
function kingHp(s, side){
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++){
    const pc = s.board[y][x];
    if (pc && pc.type === 'king' && pc.side === side) return 1;
  }
  return 0;
}

/* ================= СОЗДАНИЕ БОЯ ================= */

function create(opts){
  opts = opts || {};
  const players = opts.players || {};

  const s = {
    id: opts.id || 'local',
    arena: opts.arena || 1,

    players: {
      a: { key:  (players.a && players.a.key)  || 'a',
           name: (players.a && players.a.name) || 'Ты',
           cups: (players.a && players.a.cups) || 0 },
      b: { key:  (players.b && players.b.key)  || 'b',
           name: (players.b && players.b.name) || 'Враг',
           cups: (players.b && players.b.cups) || 0 }
    },

    board: Array.from({ length:8 }, () => Array(8).fill(null)),
    energy: { a:5, b:5 },
    hand:   { a:['king'], b:['king'] },
    deck:   { a:shuffle(DECK.slice()), b:shuffle(DECK.slice()) },
    placed: { a:0, b:0 },

    traps: [], returns: [],

    elapsed: 0,
    phase: 'main',
    timeLeft: MAIN_TIME,
    nightMode: 0,
    nightUsed: { a:false, b:false },
    spawnTimer: 15,
    idle: 0,

    over: false,
    winner: null,
    log: []
  };

  if (s.arena === 10){
    s.energy = { a:10, b:10 };
    [1,3,4,6].forEach(x => { s.board[1][x] = { type:'pawn', side:'b' }; });
    [1,3,4,6].forEach(x => { s.board[6][x] = { type:'pawn', side:'a' }; });
  }

  if (s.arena === 5){
    s.board[1][2] = { type:'saw', side:'b' };
    s.board[6][5] = { type:'saw', side:'a' };
  }

  if (s.arena === 1){
    const cells = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++){
      if (!s.board[y][x]) cells.push([x, y]);
    }
    shuffle(cells);

    let low = 0, high = 0;
    for (let i = 0; i < cells.length; i++){
      if (s.traps.length >= 8) break;
      const x = cells[i][0], y = cells[i][1];
      if (y >= 4 && low < 4){ s.traps.push({ x:x, y:y, revealed:false }); low++; }
      else if (y < 4 && high < 4){ s.traps.push({ x:x, y:y, revealed:false }); high++; }
    }
  }

  log(s, 'Арена «' + ARENAS[s.arena - 1].name + '». Поставь короля — это 5 эликсира.');
  return s;
}

/* ================= ХОДЫ ================= */

function legalMoves(s, x, y){
  const row = s.board[y];
  const pc = row && row[x];
  if (!pc || pc.asleep || pc.chained) return [];

  const side = pc.side;
  const out = [];

  function push(a, b){
    if (!inside(a, b)) return false;
    const t = s.board[b][a];
    if (t && t.side === side) return false;
    out.push([a, b]);
    return !t;
  }

  if (s.nightMode > 0){
    for (let i = 0; i < DIR8.length; i++) push(x + DIR8[i][0], y + DIR8[i][1]);
    return out;
  }

  if (pc.type === 'pawn'){
    const dir = side === 'a' ? -1 : 1;
    const aheadRow = s.board[y + dir];
    if (inside(x, y + dir) && aheadRow && !aheadRow[x]) out.push([x, y + dir]);

    for (let i = 0; i < 2; i++){
      const dx = i === 0 ? -1 : 1;
      const nx = x + dx, ny = y + dir;
      if (inside(nx, ny) && s.board[ny][nx] && s.board[ny][nx].side !== side)
        out.push([nx, ny]);
    }

  } else if (pc.type === 'knight'){
    for (let i = 0; i < KNIGHT.length; i++)
      push(x + KNIGHT[i][0], y + KNIGHT[i][1]);

  } else if (pc.type === 'saw'){
    for (let i = 0; i < DIR8.length; i++)
      push(x + DIR8[i][0], y + DIR8[i][1]);

  } else {
    const dirs = DIRS[pc.type] || [];
    for (let i = 0; i < dirs.length; i++){
      let a = x + dirs[i][0];
      let b = y + dirs[i][1];
      while (inside(a, b)){
        const t = s.board[b][a];
        if (t && t.side === side) break;
        out.push([a, b]);
        if (t) break;
        a += dirs[i][0];
        b += dirs[i][1];
      }
    }
  }

  if (s.arena === 2 && s.nightMode === 0){
    const back = side === 'a' ? 1 : -1;
    return out.filter(m => (m[1] - y) * back <= 0);
  }

  return out;
}

function refillHand(s, side){
  while (s.hand[side].length < 4){
    if (!s.deck[side].length) s.deck[side] = shuffle(DECK.slice());
    s.hand[side].push(s.deck[side].shift());
  }
}

function place(s, side, type, x, y){
  if (s.over) return { ok:false, error:'Бой окончен' };

  const p = PIECES[type];
  if (!p) return { ok:false, error:'Нет такой фигуры' };
  if (s.nightMode > 0) return { ok:false, error:'Судная ночь: выставлять нельзя' };
  if (!inside(x, y)) return { ok:false, error:'Мимо доски' };
  if (s.board[y][x]) return { ok:false, error:'Клетка занята' };
  if (s.energy[side] < p.cost) return { ok:false, error:'Мало эликсира' };

  const mustKing = s.hand[side].indexOf('king') >= 0;
  if (mustKing && type !== 'king') return { ok:false, error:'Сначала поставь короля' };
  if (!mustKing && type === 'king') return { ok:false, error:'Король уже стоит' };

  const home = side === 'a' ? y >= 4 : y <= 3;
  if (!home) return { ok:false, error:'Только своя половина' };

  s.energy[side] -= p.cost;

  const pc = { type:type, side:side };
  if (type !== 'king'){
    if (s.arena === 4 && s.placed[side] < 3) pc.asleep = true;
    if (s.arena === 7 && s.placed[side] < 2) pc.chained = true;
  }

  s.board[y][x] = pc;
  s.placed[side]++;

  const i = s.hand[side].indexOf(type);
  if (i >= 0) s.hand[side].splice(i, 1);
  refillHand(s, side);

  log(s, nameOf(s, side) + ' ставит ' + p.name + ' на ' + coord(x, y));
  return { ok:true };
}

function move(s, side, fx, fy, tx, ty){
  if (s.over) return { ok:false, error:'Бой окончен' };
  if (!inside(fx, fy) || !inside(tx, ty)) return { ok:false, error:'Мимо доски' };

  const pc = s.board[fy][fx];
  if (!pc) return { ok:false, error:'Пустая клетка' };
  if (pc.side !== side) return { ok:false, error:'Не твоя фигура' };
  if (pc.chained) return { ok:false, error:'Фигура прикована' };
  if (pc.asleep) return { ok:false, error:'Фигура спит' };

  const allowed = legalMoves(s, fx, fy);
  let ok = false;
  for (let i = 0; i < allowed.length; i++){
    if (allowed[i][0] === tx && allowed[i][1] === ty){ ok = true; break; }
  }
  if (!ok) return { ok:false, error:'Так ходить нельзя' };

  const cost = s.nightMode > 0 ? 0 : 1;
  if (s.energy[side] < cost) return { ok:false, error:'Мало эликсира' };
  s.energy[side] -= cost;

  const dx = tx - fx, dy = ty - fy;
  const target = s.board[ty][tx];

  if (target){
    const res = capture(s, pc, fx, fy, tx, ty);
    if (res === 'end') return { ok:true };
    if (s.board[ty][tx]) return { ok:true };
    relocate(s, fx, fy, tx, ty);
    if (pc.type === 'saw' && s.arena === 5) sawChain(s, tx, ty, dx, dy);
  } else {
    relocate(s, fx, fy, tx, ty);
    triggerTrap(s, tx, ty);
  }

  return { ok:true };
}

function relocate(s, fx, fy, tx, ty){
  const pc = s.board[fy][fx];
  s.board[ty][tx] = pc;
  s.board[fy][fx] = null;

  const promo = (pc.side === 'a' && ty === 0) || (pc.side === 'b' && ty === 7);
  if (pc.type === 'pawn' && promo){
    pc.type = 'queen';
    log(s, 'Пешка ' + nameOf(s, pc.side) + ' стала ферзём');
  }
}

function capture(s, attacker, fx, fy, tx, ty){
  const victim = s.board[ty][tx];
  if (!victim) return 'none';
  const night = s.nightMode > 0;

  if (victim.type === 'king'){
    s.board[ty][tx] = null;
    finish(s, attacker.side);
    return 'end';
  }

  if (!night && s.arena === 6){
    victim.side = attacker.side;
    log(s, 'Хостел: ' + PIECES[victim.type].name + ' переходит к ' + nameOf(s, attacker.side));
    return 'hostel';
  }

  if (!night && s.arena === 9){
    s.returns.push({
      x:tx, y:ty,
      type:victim.type,
      side:victim.side,
      at:s.elapsed + 20
    });
  }

  s.board[ty][tx] = null;

  if (s.arena === 10){
    s.energy[attacker.side] = Math.min(10,
      s.energy[attacker.side] + (PIECES[victim.type].val || 0));
    s.idle = 0;
  }

  if (!night && s.arena === 4) wakeOne(s, attacker.side);

  if (!night && s.arena === 3){
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++){
      if (!a && !b) continue;
      const nx = tx + a, ny = ty + b;
      if (!inside(nx, ny)) continue;
      if (nx === fx && ny === fy) continue;
      const n = s.board[ny][nx];
      if (n && n.type !== 'king'){
        s.board[ny][nx] = null;
        log(s, 'Мясорубка: ' + PIECES[n.type].name + ' перемолота');
      }
    }
  }

  log(s, nameOf(s, attacker.side) + ' бьёт ' + PIECES[victim.type].name.toLowerCase());
  return 'killed';
}

function sawChain(s, sx, sy, dx, dy){
  let cx = sx, cy = sy;

  for (let i = 0; i < 8; i++){
    const nx = cx + dx, ny = cy + dy;
    if (!inside(nx, ny)) return;

    const saw = s.board[cy][cx];
    const t = s.board[ny][nx];
    if (!t || t.side === saw.side) return;

    if (t.type === 'king'){
      s.board[ny][nx] = null;
      s.board[cy][cx] = null;
      finish(s, saw.side);
      return;
    }

    s.board[ny][nx] = saw;
    s.board[cy][cx] = null;
    cx = nx;
    cy = ny;

    log(s, 'Пила рубит дальше: ' + PIECES[t.type].name);
  }
}

function triggerTrap(s, x, y){
  if (s.arena !== 1) return;

  let t = null;
  for (let i = 0; i < s.traps.length; i++){
    const tr = s.traps[i];
    if (tr.x === x && tr.y === y && !tr.revealed){ t = tr; break; }
  }
  if (!t) return;

  t.revealed = true;

  const pc = s.board[y][x];
  if (pc && pc.type !== 'king'){
    s.board[y][x] = null;
    log(s, 'КАПКАН! ' + PIECES[pc.type].name + ' уничтожена');
  }
}

function wakeOne(s, side){
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++){
    const pc = s.board[y][x];
    if (pc && pc.side === side && pc.asleep){
      pc.asleep = false;
      log(s, nameOf(s, side) + ': фигура проснулась');
      return;
    }
  }
}

function castNight(s, side){
  if (s.arena !== 8) return { ok:false, error:'Не на этой арене' };
  if (s.over) return { ok:false, error:'Бой окончен' };
  if (s.nightUsed[side]) return { ok:false, error:'Уже использовано' };
  if (s.hand[side].indexOf('king') >= 0) return { ok:false, error:'Сначала поставь короля' };

  s.nightUsed[side] = true;
  s.nightMode = 10;
  log(s, nameOf(s, side) + ' объявляет СУДНУЮ НОЧЬ');
  return { ok:true };
}

function unlock(s, side, x, y){
  const row = s.board[y];
  const pc = row && row[x];
  if (!pc || pc.side !== side) return { ok:false, error:'Не твоя фигура' };
  if (!pc.chained) return { ok:false, error:'Не прикована' };
  if (s.energy[side] < 4) return { ok:false, error:'Нужно 4 эликсира' };

  s.energy[side] -= 4;
  pc.chained = false;
  log(s, nameOf(s, side) + ' разрывает цепи');
  return { ok:true };
}

function resign(s, side){
  if (s.over) return { ok:false };
  finish(s, side === 'a' ? 'b' : 'a');
  return { ok:true };
}

/* ================= ТИК ВРЕМЕНИ ================= */

function tick(s, dt){
  if (s.over) return;

  if (!s.phase) s.phase = 'main';
  s.elapsed += dt;

  if (s.arena !== 10){
    const rate = energyRate(s);
    s.energy.a = Math.min(10, s.energy.a + dt * 0.5 * rate);
    s.energy.b = Math.min(10, s.energy.b + dt * 0.5 * rate);

    s.timeLeft -= dt;

    if (s.timeLeft <= 0){
      if (s.phase === 'main'){
        s.phase = 'overtime';
        s.timeLeft = OT_TIME;
        log(s, 'Основное время вышло. Дополнительная минута, эликсир ×2.');
      } else {
        timeUp(s);
        return;
      }
    }
  } else {
    s.idle += dt;
    if (s.idle > 45 && s.energy.a < 1 && s.energy.b < 1){ timeUp(s); return; }
  }

  if (s.arena === 2){
    s.spawnTimer -= dt;
    if (s.spawnTimer <= 0){
      s.spawnTimer = 15;
      const x = Math.floor(Math.random() * 8);
      if (!s.board[7][x]) s.board[7][x] = { type:'pawn', side:'a' };
      if (!s.board[0][x]) s.board[0][x] = { type:'pawn', side:'b' };
      log(s, 'Из псарни выбежали пешки');
    }
  }

  if (s.arena === 9 && s.returns.length){
    for (let i = s.returns.length - 1; i >= 0; i--){
      const r = s.returns[i];
      if (s.elapsed >= r.at){
        if (!s.board[r.y][r.x]){
          s.board[r.y][r.x] = { type:r.type, side:r.side };
        }
        s.returns.splice(i, 1);
      }
    }
  }

  if (s.nightMode > 0) s.nightMode = Math.max(0, s.nightMode - dt);
}

/* время вышло: у кого короля нет на доске — тот проиграл */
function timeUp(s){
  const a = kingHp(s, 'a');
  const b = kingHp(s, 'b');

  log(s, 'Время вышло. Король на доске: ' + nameOf(s,'a') + ' ' + a +
         ' / ' + nameOf(s,'b') + ' ' + b);

  if (a > b) finish(s, 'a');
  else if (b > a) finish(s, 'b');
  else finish(s, 'draw');
}

function finish(s, winner){
  if (s.over) return;
  s.over = true;
  s.winner = winner;
  log(s, winner === 'draw' ? 'Ничья' : nameOf(s, winner) + ' побеждает');
}

/* ================= ЭКСПОРТ ================= */

global.Arena = {
  STEP: STEP,
  MAX_ARENA: MAX_ARENA,
  MAIN_TIME: MAIN_TIME,
  OT_TIME: OT_TIME,
  FAST_FROM: FAST_FROM,
  PIECES: PIECES,
  ARENAS: ARENAS,
  DECK: DECK,
  arenaOf: arenaOf,
  floorOf: floorOf,
  deltaFor: deltaFor,
  lossFor: lossFor,
  coord: coord,
  create: create,
  tick: tick,
  legalMoves: legalMoves,
  place: place,
  move: move,
  castNight: castNight,
  unlock: unlock,
  resign: resign,
  finish: finish,
  energyRate: energyRate,
  kingHp: kingHp
};

})(window);