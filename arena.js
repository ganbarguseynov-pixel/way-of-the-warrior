/* ============================================================
   arena.js — правила и движок шахматных арен  (VER 20)
   Добавлены карты: Ярость, Щит, Рокировка, Превращение.
   ============================================================ */
(function (global) {
'use strict';

const VER = '20';
const STEP = 1000;
const MAX_ARENA = 10;

const MAIN_TIME = 300;
const OT_TIME   = 60;
const FAST_FROM = 60;
const KING_HP   = 1;
const MATE_DAMAGE = 1;
const STATUS_STEP = 0.35;
const ENERGY_MAX = 10;
const ENERGY_PER_SEC = 0.5;
const ENERGY_FAST_MULT = 1.5;
const ENERGY_OT_MULT = 2;

const ARMY_MAX = { p:8, r:2, n:2, b:2, q:1, k:1 };

const PIECES = {
  pawn:   { cost:1, name:'Пешка',  w:'♙', b:'♟', val:2 },
  knight: { cost:3, name:'Конь',   w:'♘', b:'♞', val:4 },
  bishop: { cost:3, name:'Слон',   w:'♗', b:'♝', val:4 },
  rook:   { cost:4, name:'Ладья',  w:'♖', b:'♜', val:5 },
  king:   { cost:5, name:'Король', w:'♔', b:'♚', val:0 },
  queen:  { cost:6, name:'Ферзь',  w:'♕', b:'♛', val:8 }
};

/* ================= КАРТЫ ================= */

const SPELLS = {
  f: { cost:2, name:'Ярость',      icon:'⚡',  target:'own',
       hint:'Фигура делает следующий ход бесплатно' },
  s: { cost:3, name:'Щит',         icon:'🛡️', target:'own',
       hint:'Фигура переживёт одно взятие' },
  c: { cost:4, name:'Рокировка',   icon:'🔄',  target:'rook',
       hint:'Король меняется местами с ладьёй. Раз за партию' },
  u: { cost:6, name:'Превращение', icon:'👑',  target:'pawn',
       hint:'Пешка сразу становится ферзём' }
};

const SPELL_ORDER = ['f', 's', 'c', 'u'];

const TYPE_BY_LETTER = {
  p:'pawn', n:'knight', b:'bishop', r:'rook', q:'queen', k:'king'
};

const PROMO_CHOICES = ['q', 'r', 'b', 'n'];

const ARENAS = [
  { n:1,  name:'Разминка', rule:'Чистая доска. Обычные правила, ничего лишнего.' },
  { n:2,  name:'Псарня', rule:'Вытоптанный двор, земляные тона, простор.' },
  { n:3,  name:'Мясорубка', rule:'Ржавый цех. Металл, гарь, тяжёлый воздух.' },
  { n:4,  name:'Кошмар на улице Вязов', rule:'Багровый сумрак. Доска как из сна.' },
  { n:5,  name:'Техасская резня', rule:'Выжженное дерево и пыль. Глушь.' },
  { n:6,  name:'Хостел', rule:'Серый кафель. Пусто, холодно, тихо.' },
  { n:7,  name:'Восставший из ада', rule:'Кровавый мрак. Камень и ржавые цепи.' },
  { n:8,  name:'Судная ночь', rule:'Синий сумрак. Город замер до утра.' },
  { n:9,  name:'Зловещие мертвецы', rule:'Болотная зелень. Сырость и старый лес.' },
  { n:10, name:'Бессмертная партия', rule:'Светлый мрамор. Парадный зал.' }
];

const DIR8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

const DIRS = {
  rook:   [[1,0],[-1,0],[0,1],[0,-1]],
  bishop: [[1,1],[1,-1],[-1,1],[-1,-1]],
  queen:  DIR8
};

const KNIGHT = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];

const inside = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8;
const coord  = (x, y) => 'abcdefgh'[x] + (8 - y);
const foeOf  = (side) => side === 'a' ? 'b' : 'a';

function arenaOf(c){ return Math.min(MAX_ARENA, Math.floor(Math.max(0, c) / STEP) + 1); }
function floorOf(c){ return (arenaOf(c) - 1) * STEP; }

function deltaFor(w, l){ return w === l ? 30 : (w < l ? 31 : 29); }
function lossFor(loserCups, delta){
  return Math.min(delta, Math.max(0, loserCups - floorOf(loserCups)));
}

function nameOf(s, side){
  const p = s.players && s.players[side];
  return (p && p.name) || (side === 'a' ? 'Ты' : 'Враг');
}

function log(s, text){
  if (!s.log) s.log = [];
  s.log.unshift(text);
  if (s.log.length > 40) s.log.length = 40;
}

/* ================= ЭЛИКСИР ================= */

function energyRate(s){
  if (!s) return ENERGY_PER_SEC;
  if (s.phase === 'overtime') return ENERGY_PER_SEC * ENERGY_OT_MULT;
  if (typeof s.timeLeft === 'number' && isFinite(s.timeLeft) && s.timeLeft <= FAST_FROM){
    return ENERGY_PER_SEC * ENERGY_FAST_MULT;
  }
  return ENERGY_PER_SEC;
}

function moveCost(s, pc){
  if (!pc) return 1;
  if (typeof pc.rage === 'number' && pc.rage > 0) return 0;
  const def = PIECES[pc.type];
  if (def && typeof def.cost === 'number') return def.cost;
  return 1;
}

/* ================= ПОИСК ФИГУР ================= */

function kingPos(s, side){
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++){
    const pc = s.board[y][x];
    if (pc && pc.type === 'king' && pc.side === side) return { x:x, y:y };
  }
  return null;
}

function kingHp(s, side){
  const kp = kingPos(s, side);
  if (!kp) return 0;
  const pc = s.board[kp.y][kp.x];
  return (typeof pc.hp === 'number') ? pc.hp : KING_HP;
}

function countPieces(s){
  let n = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++){
    if (s.board[y][x]) n++;
  }
  return n;
}

function boardSig(s){
  let sig = '';
  for (let y = 0; y < 8; y++){
    for (let x = 0; x < 8; x++){
      const pc = s.board[y][x];
      if (!pc){ sig += '.'; continue; }
      sig += pc.type + pc.side;
      if (pc.type === 'king') sig += 'h' + (pc.hp || 0);
      if (pc.shield) sig += 'S';
      if (pc.rage) sig += 'R';
      sig += ',';
    }
  }
  return sig;
}

/* ================= РАССТАНОВКА ================= */

function defaultSetup(){
  const e = [null,null,null,null,null,null,null,null];
  return [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    e.slice(), e.slice(), e.slice(), e.slice(),
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
  ];
}

function armyOf(setup){
  const out = [];
  if (!Array.isArray(setup) || setup.length !== 8) return out;

  for (let r = 6; r <= 7; r++){
    const row = setup[r];
    if (!Array.isArray(row) || row.length !== 8) continue;

    for (let c = 0; c < 8; c++){
      const v = row[c];
      if (v === null || v === undefined || v === '') continue;

      const letter = String(v).toLowerCase();
      const type = TYPE_BY_LETTER[letter];
      if (!type) continue;

      out.push({ rank: 7 - r, c: c, type: type });
    }
  }
  return out;
}

function armyHasKing(army){
  let k = 0;
  for (let i = 0; i < army.length; i++) if (army[i].type === 'king') k++;
  return k === 1;
}

function sideHasKing(s, side){
  return !!kingPos(s, side);
}

function clearHalf(s, side){
  const from = (side === 'a') ? 4 : 0;
  const to   = (side === 'a') ? 7 : 3;
  for (let y = from; y <= to; y++) for (let x = 0; x < 8; x++) s.board[y][x] = null;
}

function placeList(s, side, army){
  for (let i = 0; i < army.length; i++){
    const a = army[i];

    const row = (side === 'a') ? (7 - a.rank) : a.rank;
    const col = (side === 'a') ? a.c : (7 - a.c);

    if (!inside(col, row)) continue;
    if (s.board[row][col]) continue;

    const pc = { type: a.type, side: side };
    if (a.type === 'king'){ pc.hp = KING_HP; pc.maxHp = KING_HP; }

    s.board[row][col] = pc;
  }
}

function fillStandard(s, side){
  clearHalf(s, side);
  placeList(s, side, armyOf(defaultSetup()));
}

function deployArmy(s, side, setup){
  let army = armyOf(setup);
  if (!armyHasKing(army)) army = armyOf(defaultSetup());

  placeList(s, side, army);

  if (!sideHasKing(s, side)) fillStandard(s, side);
}

/* ================= ХОДЫ ================= */

function pseudoMoves(s, x, y){
  const row = s.board[y];
  const pc = row && row[x];
  if (!pc) return [];

  const side = pc.side;
  const out = [];

  function push(a, b){
    if (!inside(a, b)) return false;
    const t = s.board[b][a];
    if (t && t.side === side) return false;
    out.push([a, b]);
    return !t;
  }

  if (pc.type === 'pawn'){
    const dir = side === 'a' ? -1 : 1;
    const ahead = s.board[y + dir];
    if (inside(x, y + dir) && ahead && !ahead[x]) out.push([x, y + dir]);

    for (let i = 0; i < 2; i++){
      const dx = i === 0 ? -1 : 1;
      const nx = x + dx, ny = y + dir;
      if (inside(nx, ny) && s.board[ny][nx] && s.board[ny][nx].side !== side)
        out.push([nx, ny]);
    }

  } else if (pc.type === 'knight'){
    for (let i = 0; i < KNIGHT.length; i++)
      push(x + KNIGHT[i][0], y + KNIGHT[i][1]);

  } else if (pc.type === 'king'){
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

  return out;
}

function isSquareAttacked(s, x, y, bySide){
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){
    const pc = s.board[r][c];
    if (!pc || pc.side !== bySide) continue;

    const mv = pseudoMoves(s, c, r);
    for (let i = 0; i < mv.length; i++){
      if (mv[i][0] === x && mv[i][1] === y) return true;
    }
  }
  return false;
}

function selfCheckAfter(s, fx, fy, tx, ty){
  const pc = s.board[fy][fx];
  if (!pc) return false;

  const victim = s.board[ty][tx];
  const foe = foeOf(pc.side);

  s.board[ty][tx] = pc;
  s.board[fy][fx] = null;

  let bad;
  if (pc.type === 'king'){
    bad = isSquareAttacked(s, tx, ty, foe);
  } else {
    const kp = kingPos(s, pc.side);
    bad = kp ? isSquareAttacked(s, kp.x, kp.y, foe) : false;
  }

  s.board[fy][fx] = pc;
  s.board[ty][tx] = victim;

  return bad;
}

function legalMoves(s, x, y){
  const pc = s.board[y] && s.board[y][x];
  if (!pc) return [];

  const raw = pseudoMoves(s, x, y);
  const out = [];

  for (let i = 0; i < raw.length; i++){
    const tx = raw[i][0], ty = raw[i][1];
    const tgt = s.board[ty][tx];

    if (tgt && tgt.type === 'king') continue;
    if (selfCheckAfter(s, x, y, tx, ty)) continue;

    out.push(raw[i]);
  }

  return out;
}

function sideHasAnyLegal(s, side){
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++){
    const pc = s.board[y][x];
    if (!pc || pc.side !== side) continue;
    if (legalMoves(s, x, y).length) return true;
  }
  return false;
}

function kingAttacked(s, side){
  const kp = kingPos(s, side);
  if (!kp) return false;
  return isSquareAttacked(s, kp.x, kp.y, foeOf(side));
}

function isPromotion(s, fx, fy, tx, ty){
  const pc = s.board[fy] && s.board[fy][fx];
  if (!pc || pc.type !== 'pawn') return false;
  const promoRank = (pc.side === 'a') ? 0 : 7;
  return ty === promoRank;
}

/* ================= ШАХ, МАТ, УРОН ================= */

function updateStatus(s, force){
  if (s.over) return;

  const sig = boardSig(s);
  if (!force && sig === s.statusSig) return;
  s.statusSig = sig;

  if (!s.check) s.check = { a:false, b:false };
  if (!s.mate)  s.mate  = { a:false, b:false };
  if (!s.mateHit) s.mateHit = { a:false, b:false };

  const sides = ['a', 'b'];

  for (let i = 0; i < 2; i++){
    const side = sides[i];
    const foe  = foeOf(side);

    const kp = kingPos(s, side);
    if (!kp){
      finish(s, foe);
      return;
    }

    const attacked = isSquareAttacked(s, kp.x, kp.y, foe);
    s.check[side] = attacked;

    const mateNow = attacked ? !sideHasAnyLegal(s, side) : false;
    s.mate[side] = mateNow;

    if (mateNow && !s.mateHit[side]){
      s.mateHit[side] = true;

      const king = s.board[kp.y][kp.x];
      if (typeof king.hp !== 'number') king.hp = KING_HP;

      king.hp = Math.max(0, king.hp - MATE_DAMAGE);

      log(s, 'МАТ! Король ' + nameOf(s, side) + ' получает урон. HP ' +
             king.hp + '/' + (king.maxHp || KING_HP));

      if (king.hp <= 0){
        s.board[kp.y][kp.x] = null;
        finish(s, foe);
        return;
      }
    }

    if (!mateNow) s.mateHit[side] = false;
  }
}

/* ================= КОЛОДА КАРТ ================= */

function normHand(list){
  const out = [];
  if (!Array.isArray(list)) return SPELL_ORDER.slice();

  for (let i = 0; i < list.length; i++){
    const t = String(list[i] || '').toLowerCase();
    if (SPELLS[t] && out.indexOf(t) < 0) out.push(t);
  }
  if (!out.length) return SPELL_ORDER.slice();
  return out;
}

/* ================= СОЗДАНИЕ БОЯ ================= */

function create(opts){
  opts = opts || {};
  const players = opts.players || {};
  const setups  = opts.setups || {};
  const decks   = opts.decks || {};

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
    energyAcc: { a:5, b:5 },

    hand: { a: normHand(decks.a), b: normHand(decks.b) },
    spellUsed: { a:{}, b:{} },

    traps: [], returns: [],

    elapsed: 0,
    phase: 'main',
    timeLeft: MAIN_TIME,

    check:   { a:false, b:false },
    mate:    { a:false, b:false },
    mateHit: { a:false, b:false },
    drawOffer: { a:false, b:false },
    statusAt: 0,
    statusSig: '',

    over: false,
    winner: null,
    log: []
  };

  deployArmy(s, 'a', setups.a);
  deployArmy(s, 'b', setups.b);

  if (countPieces(s) === 0){
    fillStandard(s, 'a');
    fillStandard(s, 'b');
  }

  log(s, 'Арена «' + ARENAS[s.arena - 1].name + '». Короля не съесть — ставь мат.');

  updateStatus(s, true);
  return s;
}

/* ================= ДЕЙСТВИЯ ================= */

function place(s, side, type, x, y){
  return { ok:false, error:'Доска уже собрана до боя' };
}

function spendRage(pc){
  if (pc && typeof pc.rage === 'number' && pc.rage > 0) pc.rage -= 1;
  if (pc && pc.rage === 0) delete pc.rage;
}

function move(s, side, fx, fy, tx, ty, promo){
  if (s.over) return { ok:false, error:'Бой окончен' };
  if (!inside(fx, fy) || !inside(tx, ty)) return { ok:false, error:'Мимо доски' };

  const pc = s.board[fy][fx];
  if (!pc) return { ok:false, error:'Пустая клетка' };
  if (pc.side !== side) return { ok:false, error:'Не твоя фигура' };

  const tgt = s.board[ty][tx];
  if (tgt && tgt.type === 'king') return { ok:false, error:'Короля нельзя съесть — ставь мат' };

  const allowed = legalMoves(s, fx, fy);
  let ok = false;
  for (let i = 0; i < allowed.length; i++){
    if (allowed[i][0] === tx && allowed[i][1] === ty){ ok = true; break; }
  }
  if (!ok){
    if (kingAttacked(s, side)) return { ok:false, error:'Шах! Уходи из-под удара' };
    return { ok:false, error:'Так ходить нельзя' };
  }

  const cost = moveCost(s, pc);

  let have = s.energy[side];
  if (typeof have !== 'number' || !isFinite(have)) have = 0;
  if (have < cost) return { ok:false, error:'Мало эликсира' };

  s.energy[side] = Math.max(0, have - cost);
  s.energyAcc[side] = s.energy[side];

  /* Щит поглощает удар: атакующий остаётся на месте, жертва жива */
  if (tgt && typeof tgt.shield === 'number' && tgt.shield > 0){
    delete tgt.shield;
    spendRage(pc);

    log(s, '🛡️ Щит поглотил удар. ' + PIECES[tgt.type].name +
           ' ' + nameOf(s, tgt.side) + ' выжила');
    updateStatus(s);
    return { ok:true, cost: cost, blocked: true };
  }

  if (tgt){
    capture(s, pc, tx, ty);
    if (s.over) return { ok:true, cost: cost };
    relocate(s, fx, fy, tx, ty, promo);
  } else {
    relocate(s, fx, fy, tx, ty, promo);
  }

  spendRage(pc);

  if (!s.over) updateStatus(s);
  return { ok:true, cost: cost };
}

function relocate(s, fx, fy, tx, ty, promo){
  const pc = s.board[fy][fx];
  s.board[ty][tx] = pc;
  s.board[fy][fx] = null;

  const promoRank = (pc.side === 'a') ? 0 : 7;

  if (pc.type === 'pawn' && ty === promoRank){
    const key  = String(promo || 'q').toLowerCase();
    const type = TYPE_BY_LETTER[key] || 'queen';

    if (type !== 'pawn' && type !== 'king'){
      pc.type = type;
      log(s, 'Пешка ' + nameOf(s, pc.side) + ' стала ' +
             PIECES[type].name.toLowerCase());
    }
  }
}

function capture(s, attacker, tx, ty){
  const victim = s.board[ty][tx];
  if (!victim) return 'none';
  if (victim.type === 'king') return 'king';

  s.board[ty][tx] = null;

  log(s, nameOf(s, attacker.side) + ' бьёт ' + PIECES[victim.type].name.toLowerCase());
  return 'killed';
}

/* ================= ПРИМЕНЕНИЕ КАРТ ================= */

function cast(s, side, card, x, y){
  if (s.over) return { ok:false, error:'Бой окончен' };

  const sp = SPELLS[card];
  if (!sp) return { ok:false, error:'Нет такой карты' };

  const hand = (s.hand && s.hand[side]) || [];
  if (hand.indexOf(card) < 0) return { ok:false, error:'Этой карты нет в колоде' };

  if (!s.spellUsed) s.spellUsed = { a:{}, b:{} };
  if (!s.spellUsed[side]) s.spellUsed[side] = {};

  if (card === 'c' && s.spellUsed[side].c)
    return { ok:false, error:'Рокировка — раз за партию' };

  let e = s.energy[side];
  if (typeof e !== 'number' || !isFinite(e)) e = 0;
  if (e < sp.cost) return { ok:false, error:'Мало эликсира: нужно ' + sp.cost };

  const cx = Math.round(x);
  const cy = Math.round(y);
  if (!inside(cx, cy)) return { ok:false, error:'Мимо доски' };

  const pc = s.board[cy][cx];

  if (card === 'f'){
    if (!pc || pc.side !== side) return { ok:false, error:'Ткни в свою фигуру' };
    if (typeof pc.rage === 'number' && pc.rage > 0) return { ok:false, error:'Уже в ярости' };

    pc.rage = 1;
    log(s, '⚡ Ярость: ' + PIECES[pc.type].name + ' ' + nameOf(s, side) +
           ' сходит бесплатно');
  }

  else if (card === 's'){
    if (!pc || pc.side !== side) return { ok:false, error:'Ткни в свою фигуру' };
    if (typeof pc.shield === 'number' && pc.shield > 0) return { ok:false, error:'Щит уже стоит' };

    pc.shield = 1;
    log(s, '🛡️ Щит: ' + PIECES[pc.type].name + ' ' + nameOf(s, side) +
           ' переживёт одно взятие');
  }

  else if (card === 'u'){
    if (!pc || pc.side !== side) return { ok:false, error:'Ткни в свою фигуру' };
    if (pc.type !== 'pawn') return { ok:false, error:'Только пешку' };

    pc.type = 'queen';
    log(s, '👑 Превращение: пешка ' + nameOf(s, side) + ' стала ферзём');
  }

  else if (card === 'c'){
    if (s.check && s.check[side]) return { ok:false, error:'Из-под шаха не рокируются' };

    const kp = kingPos(s, side);
    if (!kp) return { ok:false, error:'Нет короля' };
    if (!pc || pc.side !== side || pc.type !== 'rook')
      return { ok:false, error:'Ткни в свою ладью' };

    const king = s.board[kp.y][kp.x];

    s.board[kp.y][kp.x] = pc;
    s.board[cy][cx] = king;

    if (isSquareAttacked(s, cx, cy, foeOf(side))){
      s.board[kp.y][kp.x] = king;
      s.board[cy][cx] = pc;
      return { ok:false, error:'Король попадёт под удар' };
    }

    s.spellUsed[side].c = true;
    log(s, '🔄 Рокировка: король ' + nameOf(s, side) + ' ушёл к ладье');
  }

  s.energy[side] = Math.max(0, e - sp.cost);
  s.energyAcc[side] = s.energy[side];

  if (!s.over) updateStatus(s, true);
  return { ok:true, cost: sp.cost };
}

function castNight(s, side){
  return { ok:false, error:'Этого действия нет' };
}

function unlock(s, side, x, y){
  return { ok:false, error:'Этого действия нет' };
}

function resign(s, side){
  if (s.over) return { ok:false };
  finish(s, foeOf(side));
  return { ok:true };
}

/* ================= ТИК ================= */

function growEnergy(s, side, dt){
  let e = s.energy[side];
  if (typeof e !== 'number' || !isFinite(e)) e = 0;

  if (e >= ENERGY_MAX){
    s.energy[side] = ENERGY_MAX;
    s.energyAcc[side] = ENERGY_MAX;
    return;
  }

  e += dt * energyRate(s);
  if (e > ENERGY_MAX) e = ENERGY_MAX;

  s.energy[side] = e;
  s.energyAcc[side] = e;
}

function tick(s, dt){
  if (s.over) return;

  if (typeof s.timeLeft !== 'number' || !isFinite(s.timeLeft)) s.timeLeft = MAIN_TIME;
  if (!s.phase) s.phase = 'main';
  if (typeof s.elapsed !== 'number' || !isFinite(s.elapsed)) s.elapsed = 0;
  if (!s.energyAcc) s.energyAcc = { a:0, b:0 };

  s.elapsed += dt;

  growEnergy(s, 'a', dt);
  growEnergy(s, 'b', dt);

  s.timeLeft -= dt;

  if (s.timeLeft <= 0){
    if (s.phase === 'main'){
      s.phase = 'overtime';
      s.timeLeft = OT_TIME;
      log(s, 'Основное время вышло. Дополнительная минута.');
    } else {
      timeUp(s);
      return;
    }
  }

  s.statusAt = (s.statusAt || 0) + dt;
  if (s.statusAt >= STATUS_STEP){
    s.statusAt = 0;
    updateStatus(s);
  }
}

function timeUp(s){
  const a = kingHp(s, 'a');
  const b = kingHp(s, 'b');

  log(s, 'Время вышло. HP короля: ' + nameOf(s,'a') + ' ' + a +
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
  VER: VER,
  STEP: STEP,
  MAX_ARENA: MAX_ARENA,
  MAIN_TIME: MAIN_TIME,
  OT_TIME: OT_TIME,
  FAST_FROM: FAST_FROM,
  KING_HP: KING_HP,
  ENERGY_MAX: ENERGY_MAX,
  ENERGY_PER_SEC: ENERGY_PER_SEC,
  ENERGY_FAST_MULT: ENERGY_FAST_MULT,
  ENERGY_OT_MULT: ENERGY_OT_MULT,
  ARMY_MAX: ARMY_MAX,
  PIECES: PIECES,
  SPELLS: SPELLS,
  SPELL_ORDER: SPELL_ORDER,
  ARENAS: ARENAS,
  PROMO_CHOICES: PROMO_CHOICES,
  arenaOf: arenaOf,
  floorOf: floorOf,
  deltaFor: deltaFor,
  lossFor: lossFor,
  coord: coord,
  create: create,
  tick: tick,
  legalMoves: legalMoves,
  pseudoMoves: pseudoMoves,
  isPromotion: isPromotion,
  place: place,
  move: move,
  cast: cast,
  moveCost: moveCost,
  castNight: castNight,
  unlock: unlock,
  resign: resign,
  finish: finish,
  energyRate: energyRate,
  kingHp: kingHp,
  kingPos: kingPos,
  kingAttacked: kingAttacked,
  isSquareAttacked: isSquareAttacked,
  sideHasAnyLegal: sideHasAnyLegal,
  updateStatus: updateStatus,
  countPieces: countPieces,
  boardSig: boardSig,
  defaultSetup: defaultSetup
};

})(window);