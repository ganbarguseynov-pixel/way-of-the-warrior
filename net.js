/* ============================================================
   net.js — сеть: очередь, матч, бот, ничья (VER 19)
   Бот принимает ничью только когда реально проигрывает.
   Ничью можно предлагать 2 раза за партию.
   ============================================================ */
(function (global) {
'use strict';

const RECORD_KEY = 'arenaActiveMatch';
const STATE_KEY  = 'arenaActiveState';
const LOG_KEY    = 'arenaMoveLog';
const SETUP_KEY  = 'chessSetup';
const NAME_KEY   = 'userName';

const PUSH_MS = 200;
const TICK_MS = 100;

const SEARCH_LIMIT_MS = 3000;
const RESUME_LIMIT_MS = 6 * 60 * 60 * 1000;

const AWAY_GRACE_MS = 15000;

const CATCHUP_STEP = 1.2;
const CATCHUP_MAX  = 600;

const LOG_MAX = 700;

/* сколько раз за партию можно предложить ничью */
const DRAW_OFFER_MAX = 2;

const BOT_NAMES = [
  'Дмитрий','Алексей','Максим','Артём','Сергей','Кирилл','Иван','Никита',
  'Роман','Егор','Даниил','Михаил','Андрей','Павел','Владислав','Глеб',
  'Тимур','Матвей','Саша','Лёша','Светлана','Ольга','Анна','Мария',
  'Дарья','Полина','Вера','Настя',

  'James','Oliver','Lucas','Ethan','Noah','Liam','Mason','Logan',
  'Ryan','Tyler','Dylan','Owen','Emily','Sophie','Chloe','Mia',
  'Grace','Hannah','Olivia','Ruby','Alice','Ella',

  'Shadow','Blade','Raven','Hunter','Ghost','Falcon','Viper','Storm',
  'Nova','Echo','Frost','Ember','Wolf','Crow','Ace','Rook','Bishop','Pawnstar',

  'Diego','Mateo','Santiago','Javier','Alejandro','Rodrigo','Thiago',
  'João','Pedro','Rafael','Sofía','Valentina','Camila','Isabella','Lucía',

  'Lukas','Felix','Jonas','Maximilian','Sebastian','Antoine','Julien',
  'Mathis','Hugo','Léa','Marco','Lorenzo','Matteo','Giulia','Alessandro','Chiara',

  'Yuki','Haruto','Sora','Ren','Kenji','Aiko','Yuna','Sakura',
  'Chen','Wei','Jun','Mei','Lin','Hiroshi','Minjun','Jihoon','Seoyeon','Hyunwoo',

  'Emre','Kerem','Yusuf','Elif','Zeynep','Omar','Karim','Youssef','Fatima','Zara',
  'Lars','Erik','Nils','Anders','Marko','Nikola','Petra','Ivan'
];

const Net = {
  sb: null,
  key: null,
  name: null,
  me: null,

  handlers: {},

  queueCh: null,
  matchCh: null,
  matchId: null,
  mySide: null,
  arena: 1,
  players: null,
  setups: null,
  host: false,
  state: null,

  timer: null,
  retry: null,
  resumeTimer: null,
  saveMark: 0,
  queueSince: 0,
  pending: null,
  finished: false,
  finishing: false,

  botMode: false,
  botTimer: null,
  fallbackTimer: null,

  lastSeen: 0,

  replayLog: [],
  logMark: 0
};

Net.on = function (evt, fn){
  if (!Net.handlers[evt]) Net.handlers[evt] = [];
  Net.handlers[evt].push(fn);
};

Net.emit = function (evt, data){
  const list = Net.handlers[evt] || [];
  for (let i = 0; i < list.length; i++){
    try { list[i](data); }
    catch (e){ console.error('[net] handler error', evt, e); }
  }
};

function uuid(){
  if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c){
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function payloadOf(msg){
  if (!msg) return null;
  return msg.payload !== undefined ? msg.payload : msg;
}

function slimState(s){
  return {
    id:        s.id,
    arena:     s.arena,
    players:   s.players,
    board:     s.board,
    energy:    s.energy,
    energyAcc: s.energyAcc,
    traps:     s.traps,
    returns:   s.returns,
    elapsed:   s.elapsed,
    phase:     s.phase,
    timeLeft:  s.timeLeft,
    nightMode: s.nightMode,
    nightUsed: s.nightUsed,
    spawnTimer: s.spawnTimer,
    idle:      s.idle,
    drawOffer: s.drawOffer,
    drawUsed:  s.drawUsed,
    check:     s.check,
    mate:      s.mate,
    mateHit:   s.mateHit,
    over:      s.over,
    winner:    s.winner
  };
}

/* ---------------- журнал ходов ---------------- */

function logAt(s){
  const e = (s && typeof s.elapsed === 'number') ? s.elapsed : 0;
  return Math.round(e * 100) / 100;
}

Net._logReset = function (){
  Net.replayLog = [];
  Net.logMark = 0;
  try { localStorage.removeItem(LOG_KEY); } catch (e){}
};

Net._logSave = function (force){
  const now = Date.now();
  if (!force && now - Net.logMark < 800) return;
  Net.logMark = now;
  try { localStorage.setItem(LOG_KEY, JSON.stringify(Net.replayLog || [])); } catch (e){}
};

Net._logMove = function (side, fx, fy, tx, ty, promo, s){
  if (!Net.replayLog) Net.replayLog = [];
  if (Net.replayLog.length >= LOG_MAX) return;

  Net.replayLog.push({
    t: 'm',
    s: side,
    at: logAt(s),
    fx: fx, fy: fy, tx: tx, ty: ty,
    p: promo || 'q'
  });
  Net._logSave(false);
};

Net._logEvent = function (kind, side, s){
  if (!Net.replayLog) Net.replayLog = [];
  if (Net.replayLog.length >= LOG_MAX) return;

  Net.replayLog.push({ t: kind, s: side, at: logAt(s) });
  Net._logSave(false);
};

/* ---------------- расстановка ---------------- */

function sanitizeSetup(raw){
  if (!Array.isArray(raw) || raw.length !== 8) return null;

  for (let r = 0; r < 8; r++){
    if (!Array.isArray(raw[r]) || raw[r].length !== 8) return null;
  }

  let wk = false, bk = false;

  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){
    const v = raw[r][c];
    if (v === null || v === undefined || v === '') continue;
    const s = String(v);
    if (!/^[prnbqkPRNBQK]$/.test(s)) return null;
    if (s === 'K') wk = true;
    if (s === 'k') bk = true;
  }

  if (!wk || !bk) return null;
  return raw;
}

Net.mySetup = function (){
  try {
    const raw = JSON.parse(localStorage.getItem(SETUP_KEY) || 'null');
    const clean = sanitizeSetup(raw);
    if (clean) return clean;
  } catch (e){}
  return global.Arena ? Arena.defaultSetup() : null;
};

/* ---------------- профиль ---------------- */

Net.init = async function (opts){
  Net.sb   = opts.client;
  Net.key  = opts.key;
  Net.name = opts.name || 'Игрок';

  const res = await opts.client.rpc('arena_ensure_player', {
    p_key:  Net.key,
    p_name: Net.name,
    p_seed: opts.seed || 0
  });

  if (res.error) throw res.error;
  Net.me = res.data;
  return res.data;
};

Net.refresh = async function (){
  const res = await Net.sb
    .from('arena_players')
    .select('*')
    .eq('player_key', Net.key)
    .maybeSingle();

  if (res.data) Net.me = res.data;
  return Net.me;
};

Net.rename = async function (raw){
  const name = String(raw || '').trim().slice(0, 16);
  if (name.length < 2) return { ok:false, error:'Слишком короткий ник' };

  const res = await Net.sb.rpc('arena_set_name', {
    p_key:  Net.key,
    p_name: name
  });

  if (res.error) return { ok:false, error: res.error.message };

  Net.name = name;
  if (Net.me) Net.me.display_name = name;

  try { localStorage.setItem(NAME_KEY, name); } catch (e){}

  return { ok:true, name: name };
};

Net.leaderboard = async function (limit){
  const res = await Net.sb.rpc('arena_top', { p_limit: limit || 20 });
  if (res.error) return [];
  return res.data || [];
};

/* ---------------- запись текущего матча ---------------- */

Net._writeRecord = function (){
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify({
      matchId: Net.matchId,
      side:    Net.mySide,
      arena:   Net.arena,
      players: Net.players,
      bot:     !!Net.botMode,
      at:      Date.now()
    }));
  } catch (e){}
};

Net._readRecord = function (){
  try { return JSON.parse(localStorage.getItem(RECORD_KEY) || 'null'); }
  catch (e){ return null; }
};

Net._saveState = function (force){
  if (!Net.host || !Net.state) return;

  const now = Date.now();
  if (!force && now - Net.saveMark < 1000) return;
  Net.saveMark = now;

  try {
    Net.state.savedAt = now;
    localStorage.setItem(STATE_KEY, JSON.stringify(Net.state));
  } catch (e){}
};

Net._clearMatch = function (){
  if (Net.timer){ clearInterval(Net.timer); Net.timer = null; }
  if (Net.botTimer){ clearTimeout(Net.botTimer); Net.botTimer = null; }
  if (Net.resumeTimer){ clearTimeout(Net.resumeTimer); Net.resumeTimer = null; }

  try { localStorage.removeItem(RECORD_KEY); } catch (e){}
  try { localStorage.removeItem(STATE_KEY); } catch (e){}
  try { localStorage.removeItem(LOG_KEY); } catch (e){}
};

/* ---------------- очередь ---------------- */

Net._clearFallback = function (){
  if (Net.fallbackTimer){ clearTimeout(Net.fallbackTimer); Net.fallbackTimer = null; }
};

Net._startFallback = function (){
  Net._clearFallback();
  Net.fallbackTimer = setTimeout(function (){
    Net.fallbackTimer = null;
    if (Net.matchId || Net.finished || Net.botMode) return;
    Net._startBotMatch();
  }, SEARCH_LIMIT_MS);
};

Net.findMatch = async function (){
  if (Net.queueCh) return;

  await Net.refresh();

  Net.queueSince = Date.now();
  Net.emit('status', { text: 'Ищем соперника…' });

  const ch = Net.sb.channel('arena_queue', {
    config: { presence: { key: Net.key } }
  });
  Net.queueCh = ch;

  ch.on('presence', { event: 'sync' }, function (){ Net._tryPair(); });

  ch.on('broadcast', { event: 'invite' }, function (msg){
    Net._onInvite(payloadOf(msg));
  });

  ch.on('broadcast', { event: 'accept' }, function (msg){
    Net._onAccept(payloadOf(msg));
  });

  await ch.subscribe(async function (status){
    if (status === 'SUBSCRIBED'){
      await ch.track({
        key:   Net.key,
        name:  Net.name,
        cups:  Net.me ? Net.me.cups : 0,
        since: Date.now()
      });
      Net._tryPair();
    }
  });

  if (Net.retry) clearInterval(Net.retry);
  Net.retry = setInterval(function (){ Net._tryPair(); }, 500);

  Net._startFallback();
};

Net.cancelQueue = async function (){
  if (Net.retry){ clearInterval(Net.retry); Net.retry = null; }
  Net._clearFallback();

  if (!Net.queueCh){
    Net.pending = null;
    return;
  }

  try { await Net.queueCh.untrack(); } catch (e){}
  try { await Net.sb.removeChannel(Net.queueCh); } catch (e){}

  Net.queueCh = null;
  Net.pending = null;
  Net.emit('status', { text: '' });
};

Net._presenceList = function (ch){
  const raw = ch.presenceState() || {};
  const list = [];

  Object.keys(raw).forEach(function (k){
    const arr = raw[k] || [];
    for (let i = 0; i < arr.length; i++){
      const p = arr[i];
      if (p && p.key){
        list.push({
          key:  p.key,
          name: p.name || 'Игрок',
          cups: +p.cups || 0
        });
      }
    }
  });

  return list;
};

Net._tryPair = function (){
  if (!Net.queueCh || Net.matchId || Net.pending) return;

  const all = Net._presenceList(Net.queueCh);
  const others = all.filter(function (p){ return p.key !== Net.key; });

  if (!others.length){
    Net.emit('status', { text: 'Ищем соперника…' });
    return;
  }

  const myCups = Net.me ? Net.me.cups : 0;

  others.sort(function (x, y){
    const dx = Math.abs(x.cups - myCups);
    const dy = Math.abs(y.cups - myCups);
    if (dx !== dy) return dx - dy;
    return x.key < y.key ? -1 : (x.key > y.key ? 1 : 0);
  });

  const opp = others[0];
  if (!opp) return;

  if (Net.key >= opp.key) return;

  const matchId = uuid();
  const arena = Math.min(Arena.arenaOf(myCups), Arena.arenaOf(opp.cups));

  Net.pending = { to: opp.key, matchId: matchId, arena: arena, opp: opp, oppSetup: null };

  Net.emit('status', { text: 'Соперник найден: ' + opp.name + ' (' + opp.cups + ' 🏆)' });

  Net.queueCh.send({
    type: 'broadcast',
    event: 'invite',
    payload: {
      from: Net.key,
      to: opp.key,
      matchId: matchId,
      arena: arena,
      name: Net.name,
      cups: myCups,
      setup: Net.mySetup()
    }
  });

  setTimeout(function (){
    if (Net.pending && Net.pending.matchId === matchId && !Net.matchId){
      Net.pending = null;
    }
  }, 6000);
};

Net._onInvite = function (p){
  if (!p || p.to !== Net.key) return;
  if (Net.matchId || Net.pending) return;

  Net.queueCh.send({
    type: 'broadcast',
    event: 'accept',
    payload: {
      from: Net.key,
      to: p.from,
      matchId: p.matchId,
      name: Net.name,
      cups: Net.me ? Net.me.cups : 0,
      setup: Net.mySetup()
    }
  });

  Net._beginMatch({
    matchId: p.matchId,
    arena: p.arena,
    side: 'b',
    oppKey: p.from,
    oppName: p.name,
    oppCups: p.cups,
    oppSetup: p.setup
  });
};

Net._onAccept = function (p){
  if (!p || p.to !== Net.key) return;
  if (!Net.pending || Net.pending.matchId !== p.matchId) return;

  Net._beginMatch({
    matchId: Net.pending.matchId,
    arena: Net.pending.arena,
    side: 'a',
    oppKey: p.from,
    oppName: p.name,
    oppCups: p.cups,
    oppSetup: p.setup
  });
};

/* ---------------- канал матча ---------------- */

Net._attach = async function (){
  const ch = Net.sb.channel('arena_match_' + Net.matchId, {
    config: {
      broadcast: { self: false },
      presence:  { key: Net.key }
    }
  });
  Net.matchCh = ch;

  ch.on('broadcast', { event: 'intent' }, function (msg){
    if (Net.host) Net._applyIntent(payloadOf(msg), 'b');
  });

  ch.on('broadcast', { event: 'state' }, function (msg){
    if (Net.host) return;

    Net.state = payloadOf(msg);
    if (Net.resumeTimer){ clearTimeout(Net.resumeTimer); Net.resumeTimer = null; }
    Net.emit('state', Net.state);

    if (Net.state && Net.state.over && !Net.finished){
      Net._finish({
        winner:  Net.state.winner,
        matchId: Net.matchId,
        cups:    null
      });
    }
  });

  ch.on('broadcast', { event: 'hello' }, function (){
    if (Net.host && Net.state) Net._push();
  });

  ch.on('broadcast', { event: 'error' }, function (msg){
    const p = payloadOf(msg);
    if (p && p.message) Net.emit('error', { message: p.message });
  });

  ch.on('broadcast', { event: 'result' }, function (msg){
    const p = payloadOf(msg);
    if (p && p.moves) Net._saveReplay(p);
    Net._finish(p);
  });

  ch.on('presence', { event: 'sync' }, function (){
    if (Net.host && Net.state) Net._push();
  });

  await ch.subscribe(function (status){
    if (status === 'SUBSCRIBED') ch.track({ key: Net.key });
  });

  return ch;
};

/* ---------------- бой с живым игроком ---------------- */

Net._beginMatch = async function (m){
  Net._clearFallback();
  await Net.cancelQueue();

  Net.botMode   = false;
  Net.matchId   = m.matchId;
  Net.mySide    = m.side;
  Net.host      = (m.side === 'a');
  Net.arena     = m.arena || 1;
  Net.finished  = false;
  Net.finishing = false;
  Net.state     = null;
  Net.lastSeen  = Date.now();
  Net._logReset();

  const myCups = Net.me ? Net.me.cups : 0;
  const meP    = { key: Net.key,  name: Net.name,  cups: myCups };
  const oppP   = { key: m.oppKey, name: m.oppName, cups: m.oppCups || 0 };

  Net.players = Net.host
    ? { a: meP, b: oppP }
    : { a: oppP, b: meP };

  const mySetup  = Net.mySetup();
  const oppSetup = sanitizeSetup(m.oppSetup) || (Arena.defaultSetup ? Arena.defaultSetup() : null);

  Net.setups = Net.host
    ? { a: mySetup, b: oppSetup }
    : { a: oppSetup, b: mySetup };

  Net._writeRecord();

  await Net._attach();

  if (Net.host){
    Net._hostStart();
  } else {
    Net.emit('start', {
      side: 'b',
      arena: Net.arena,
      opponent: Net.players.a,
      state: null
    });
  }
};

/* ---------------- бой с подставным соперником ---------------- */

function botNickname(){
  const base = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const r = Math.random();

  if (r < 0.40) return base;
  if (r < 0.75) return base + ' ' + (Math.floor(Math.random() * 90) + 10);
  return base + '_' + (Math.floor(Math.random() * 900) + 100);
}

function botCupsFor(myCups){
  let shift = Math.floor(Math.random() * 101) - 50;
  if (Math.abs(shift) < 8) shift = (shift < 0 ? -12 : 12);

  let cups = Math.max(0, myCups + shift);
  if (Math.abs(cups - myCups) < 8) cups = Math.max(0, myCups + 12);
  return cups;
}

Net._startBotMatch = async function (){
  if (Net.matchId || Net.botMode) return;

  await Net.cancelQueue();
  Net._clearFallback();

  const myCups = Net.me ? Net.me.cups : 0;
  const rivalCups = botCupsFor(myCups);
  const rivalName = botNickname();
  const rivalKey  = 'pl_' + Math.random().toString(36).slice(2, 12);

  Net.matchId   = uuid();
  Net.mySide    = 'a';
  Net.host      = true;
  Net.botMode   = true;
  Net.arena     = Math.min(Arena.arenaOf(myCups), Arena.arenaOf(rivalCups));
  Net.finished  = false;
  Net.finishing = false;
  Net.state     = null;
  Net.lastSeen  = Date.now();
  Net._logReset();

  Net.players = {
    a: { key: Net.key,  name: Net.name, cups: myCups },
    b: { key: rivalKey, name: rivalName, cups: rivalCups }
  };

  Net.setups = { a: Net.mySetup(), b: null };

  Net._writeRecord();

  Net._hostStart();
  Net._startBotBrain();
};

Net._startBotBrain = function (){
  if (Net.botTimer){ clearTimeout(Net.botTimer); Net.botTimer = null; }
  Net._botTick();
};

Net._botTick = function (){
  if (Net.botTimer){ clearTimeout(Net.botTimer); Net.botTimer = null; }
  if (!Net.botMode || Net.finished) return;

  const wait = 850 + Math.random() * 850;

  Net.botTimer = setTimeout(function (){
    Net.botTimer = null;
    if (!Net.botMode || Net.finished) return;

    const st = Net.state;
    if (!st || st.over){ Net._botTick(); return; }

    /* бот отвечает на предложенную ничью: только если реально проигрывает */
    if (st.drawOffer && st.drawOffer.a){
      const accept = Net._botLosing(st, 'b');
      Net._applyIntent({ t: accept ? 'draw' : 'undraw' }, 'b');
    } else {
      Net._botMove();
    }

    Net._botTick();
  }, wait);
};

/* ============================================================
   ОЦЕНКА ПОЗИЦИИ БОТА
   Возвращает true только если бот реально стоит на проигрыш
   и ничья для него — спасение. Во всех остальных случаях false.
   ============================================================ */
Net._botLosing = function (s, side){
  if (!s) return false;

  let mine = 0, theirs = 0;   /* суммарная сила фигур */
  let myCount = 0, hisCount = 0;
  let myQ = 0, hisQ = 0;      /* ферзи */

  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++){
    const pc = s.board[y][x];
    if (!pc) continue;

    const def = Arena.PIECES[pc.type];
    const v = (def && typeof def.val === 'number') ? def.val : 0;

    if (pc.type === 'queen'){
      if (pc.side === side) myQ++;
      else hisQ++;
    }

    if (pc.side === side){ mine += v; myCount++; }
    else { theirs += v; hisCount++; }
  }

  const gap = mine - theirs;

  let inCheck = false;
  try { inCheck = Arena.kingAttacked(s, side); } catch (e){}

  let canMove = true;
  try { canMove = Arena.sideHasAnyLegal(s, side); } catch (e){}

  /* 1. ходов вообще нет — он заперт, дальше только мат */
  if (!canMove) return true;

  /* 2. отстаёт на ферзя и больше */
  if (gap <= -8) return true;

  /* 3. отстаёт на ладью и король под шахом */
  if (gap <= -5 && inCheck) return true;

  /* 4. потерял ферзя, а у соперника он есть, и при этом слабее */
  if (myQ === 0 && hisQ > 0 && gap <= -4) return true;

  /* 5. разгромлен по числу фигур */
  if (myCount <= 4 && hisCount >= 9 && gap <= -6) return true;

  return false;
};

/* ---------------- искусственный игрок ---------------- */

Net._pickMove = function (s, side){
  if (!s || s.over) return null;

  const moves = [];

  for (let y = 0; y < 8; y++){
    for (let x = 0; x < 8; x++){
      const pc = s.board[y][x];
      if (!pc || pc.side !== side) continue;

      const cost = Arena.moveCost(s, pc);
      if (s.energy[side] < cost) continue;

      const list = Arena.legalMoves(s, x, y);
      for (let i = 0; i < list.length; i++){
        moves.push({
          fx:x, fy:y,
          tx:list[i][0], ty:list[i][1],
          cap:(s.board[list[i][1]][list[i][0]] ? 1 : 0)
        });
      }
    }
  }

  if (!moves.length) return null;

  const caps = [];
  for (let i = 0; i < moves.length; i++) if (moves[i].cap) caps.push(moves[i]);

  const pool = (caps.length && Math.random() < 0.75) ? caps : moves;
  return pool[Math.floor(Math.random() * pool.length)];
};

Net._autoMove = function (s, side){
  const pick = Net._pickMove(s, side);
  if (!pick) return false;

  const promo = Arena.PROMO_CHOICES[Math.floor(Math.random() * Arena.PROMO_CHOICES.length)];
  const res = Arena.move(s, side, pick.fx, pick.fy, pick.tx, pick.ty, promo);

  if (res && res.ok){
    Net._logMove(side, pick.fx, pick.fy, pick.tx, pick.ty, promo, s);
    return true;
  }
  return false;
};

Net._botMove = function (){
  const s = Net.state;
  if (!s || s.over) return;

  if (!Net._autoMove(s, 'b')) return;
  Net._push();
};

/* ---------------- догон времени, пока игрока не было ---------------- */

Net._catchUp = function (s, awayMs, absentSide){
  if (!s || s.over) return;

  const foe = (absentSide === 'a') ? 'b' : 'a';

  let left  = Math.min(awayMs / 1000, CATCHUP_MAX);
  let guard = 0;

  while (left > 0 && !s.over && guard < CATCHUP_MAX){
    guard++;

    const dt = Math.min(CATCHUP_STEP, left);
    left -= dt;

    Arena.tick(s, dt);
    if (s.over) break;

    Net._autoMove(s, foe);
  }

  if (!s.over && awayMs > AWAY_GRACE_MS){
    Arena.finish(s, foe);
  }
};

Net.checkAway = function (){
  const now = Date.now();
  const away = now - (Net.lastSeen || now);
  Net.lastSeen = now;

  if (Net.finished) return;
  if (!Net.state || !Net.host) return;
  if (away < 2500) return;

  Net._catchUp(Net.state, away, Net.mySide);

  if (Net.state.over){
    Net._hostFinish();
  } else {
    Net._push();
  }
};

/* ---------------- запуск боя ---------------- */

Net._hostStart = function (){
  Net.state = Arena.create({
    id: Net.matchId,
    arena: Net.arena,
    players: Net.players,
    setups: Net.setups
  });

  /* счётчик предложений ничьей: по 2 на каждого */
  if (!Net.state.drawUsed) Net.state.drawUsed = { a:0, b:0 };

  Net.emit('start', {
    side: 'a',
    arena: Net.arena,
    opponent: Net.players.b,
    state: Net.state
  });

  Net.saveMark = 0;
  Net.lastSeen = Date.now();
  Net._push();
  Net._startLoop();
};

Net._startLoop = function (){
  if (Net.timer){ clearInterval(Net.timer); Net.timer = null; }

  let last = performance.now();
  let acc  = 0;

  Net.timer = setInterval(function (){
    if (!Net.state || Net.finished) return;

    const now = performance.now();
    const dt  = Math.min(0.2, (now - last) / 1000);
    last = now;

    Net.lastSeen = Date.now();

    Arena.tick(Net.state, dt);

    acc += dt * 1000;
    if (acc >= PUSH_MS){
      acc = 0;
      Net._push();
    }

    if (Net.state.over){
      Net._hostFinish();
      return;
    }
  }, TICK_MS);
};

Net._broadcastState = function (){
  if (!Net.matchCh || !Net.state) return;
  Net.matchCh.send({
    type: 'broadcast',
    event: 'state',
    payload: slimState(Net.state)
  });
};

Net._push = function (){
  if (!Net.state) return;

  if (Net.host){
    Net.emit('state', Net.state);
    Net._saveState(false);
  }
  Net._broadcastState();
};

/* ---------------- ничья ---------------- */

/* сколько предложений осталось у стороны */
Net.drawsLeft = function (side){
  const s = Net.state;
  if (!s) return DRAW_OFFER_MAX;
  const used = (s.drawUsed && s.drawUsed[side]) || 0;
  return Math.max(0, DRAW_OFFER_MAX - used);
};

Net._drawIntent = function (side, kind){
  const s = Net.state;
  if (!s || s.over) return { ok:false, error:'Бой окончен' };

  if (!s.drawOffer) s.drawOffer = { a:false, b:false };
  if (!s.drawUsed)  s.drawUsed  = { a:0, b:0 };

  const foe = (side === 'a') ? 'b' : 'a';

  if (kind === 'draw'){
    /* согласие на чужое предложение — свой лимит не тратит */
    if (s.drawOffer[foe]){
      s.drawOffer.a = false;
      s.drawOffer.b = false;
      Arena.finish(s, 'draw');
      return { ok:true };
    }

    /* своё предложение — только если лимит не исчерпан */
    const used = s.drawUsed[side] || 0;
    if (used >= DRAW_OFFER_MAX){
      return { ok:false, error:'Ничью можно предлагать только ' + DRAW_OFFER_MAX + ' раза за партию' };
    }

    s.drawUsed[side] = used + 1;
    s.drawOffer[side] = true;
    return { ok:true };
  }

  if (kind === 'undraw'){
    s.drawOffer.a = false;
    s.drawOffer.b = false;
    return { ok:true };
  }

  return { ok:false, error:'Неизвестное действие' };
};

Net._applyIntent = function (msg, side){
  if (!Net.state || !msg) return;

  const s = Net.state;
  let res = null;

  if (msg.t === 'draw' || msg.t === 'undraw'){
    res = Net._drawIntent(side, msg.t);
  } else {
    switch (msg.t){
      case 'move':
        res = Arena.move(s, side, msg.fx, msg.fy, msg.tx, msg.ty, msg.promo);
        break;
      case 'night':  res = Arena.castNight(s, side); break;
      case 'unlock': res = Arena.unlock(s, side, msg.x, msg.y); break;
      case 'resign': res = Arena.resign(s, side); break;
      default: return;
    }
  }

  if (res && !res.ok){
    if (Net.matchCh && !Net.botMode){
      Net.matchCh.send({
        type: 'broadcast',
        event: 'error',
        payload: { message: res.error }
      });
    } else if (Net.botMode && side === Net.mySide){
      Net.emit('error', { message: res.error });
    }
    return;
  }

  if (res && res.ok){
    if (msg.t === 'move'){
      Net._logMove(side, msg.fx, msg.fy, msg.tx, msg.ty, msg.promo, s);
    } else if (msg.t === 'resign'){
      Net._logEvent('r', side, s);
    } else if (msg.t === 'draw'){
      Net._logEvent('d', side, s);
    } else if (msg.t === 'undraw'){
      Net._logEvent('u', side, s);
    }
  }

  if (s.over){
    Net._hostFinish();
    return;
  }

  Net._push();
};

/* ---------------- конец боя ---------------- */

Net._estimateCups = function (winner){
  const myCups = Net.me ? Net.me.cups : 0;
  const oppCups = Net.players
    ? (Net.mySide === 'a' ? (Net.players.b.cups || 0) : (Net.players.a.cups || 0))
    : myCups;

  let delta = 0;

  if (winner === Net.mySide){
    delta = Arena.deltaFor(myCups, oppCups);
  } else if (winner === 'draw'){
    delta = 0;
  } else {
    delta = -Arena.lossFor(myCups, Arena.deltaFor(oppCups, myCups));
  }

  const after = Math.max(Arena.floorOf(myCups), myCups + delta);

  if (Net.mySide === 'a'){
    return { a_before: myCups, a_after: after, b_before: oppCups, b_after: oppCups };
  }
  return { a_before: oppCups, a_after: oppCups, b_before: myCups, b_after: after };
};

Net._localCups = async function (winner){
  const cups = Net._estimateCups(winner);
  const k = Net.mySide;
  const after = cups[k + '_after'];

  try {
    await Net.sb.from('arena_players').update({ cups: after }).eq('player_key', Net.key);
  } catch (e){}

  return cups;
};

/* запись повтора в базу */
Net._saveReplay = function (p){
  if (!p || !p.moves || !p.moves.length) return;
  if (!Net.sb || !Net.key) return;
  if (p.replaySaved) return;
  p.replaySaved = true;

  const mySide = Net.mySide || p.mySide || 'a';
  const opp = Net.players
    ? (mySide === 'a' ? Net.players.b : Net.players.a)
    : null;

  const matchId = p.matchId || Net.matchId;
  if (!matchId) return;

  Net.sb.rpc('arena_save_replay', {
    p_match:    matchId,
    p_player:   Net.key,
    p_side:     mySide,
    p_arena:    p.arena || Net.arena || 1,
    p_winner:   p.winner || null,
    p_opponent: (opp && opp.name) || 'Соперник',
    p_seconds:  Math.round(p.seconds || 0),
    p_setup_a:  p.setup_a || null,
    p_setup_b:  p.setup_b || null,
    p_moves:    p.moves
  }).then(function (res){
    if (res.error) console.error('[net] replay save failed', res.error);
  });
};

Net._hostFinish = function (){
  if (Net.timer){ clearInterval(Net.timer); Net.timer = null; }
  if (Net.finished || Net.finishing) return;

  const s = Net.state;
  if (!s) return;

  Net.finishing = true;

  const isBot = Net.botMode;
  const winnerKey =
    s.winner === 'a' ? Net.players.a.key :
    s.winner === 'b' ? Net.players.b.key : null;

  Net._logSave(true);

  const payload = {
    winner:  s.winner,
    matchId: Net.matchId,
    arena:   Net.arena,
    cups:    Net._estimateCups(s.winner),
    seconds: Math.round(s.elapsed || 0),
    setup_a: Net.setups ? Net.setups.a : null,
    setup_b: Net.setups ? Net.setups.b : null,
    moves:   Net.replayLog || []
  };

  Net._saveReplay(payload);

  if (Net.matchCh && !isBot){
    Net.matchCh.send({ type: 'broadcast', event: 'result', payload: payload });
  }

  Net._finish(payload);

  if (isBot){
    Net._localCups(s.winner).catch(function(){});
  } else if (winnerKey){
    Net.sb.rpc('arena_report_match', {
      p_match:  payload.matchId,
      p_a:      Net.players.a.key,
      p_b:      Net.players.b.key,
      p_winner: winnerKey,
      p_arena:  Net.arena
    }).then(function (res){
      if (res.error) console.error('[net] report failed', res.error);
    });
  }
};

/* ---------------- действия игрока ---------------- */

Net.intent = function (msg){
  if (Net.host){
    Net._applyIntent(msg, Net.mySide);
  } else if (Net.matchCh){
    Net.matchCh.send({ type: 'broadcast', event: 'intent', payload: msg });
  }
};

Net.resign = function (){
  if (Net.host){
    Net._applyIntent({ t: 'resign' }, Net.mySide);
  } else if (Net.matchCh){
    Net.matchCh.send({ type: 'broadcast', event: 'intent', payload: { t: 'resign' } });
  }
};

/* ---------------- возврат в незавершённый бой ---------------- */

Net.tryResume = async function (){
  const rec = Net._readRecord();
  if (!rec || !rec.matchId || !rec.side) return false;

  if (Date.now() - (rec.at || 0) > RESUME_LIMIT_MS){
    Net._clearMatch();
    return false;
  }

  const isBot = !!rec.bot;

  Net.matchId   = rec.matchId;
  Net.mySide    = rec.side;
  Net.host      = (rec.side === 'a');
  Net.arena     = rec.arena || 1;
  Net.players   = rec.players;
  Net.finished  = false;
  Net.finishing = false;
  Net.botMode   = isBot;
  Net.state     = null;
  Net.lastSeen  = Date.now();

  try {
    const savedLog = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    Net.replayLog = Array.isArray(savedLog) ? savedLog : [];
  } catch (e){ Net.replayLog = []; }

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e){}
  if (saved && !saved.board) saved = null;
  if (saved && !saved.drawUsed) saved.drawUsed = { a:0, b:0 };

  if (isBot){
    if (!saved){
      Net._clearMatch();
      Net.botMode = false;
      Net.matchId = null;
      return false;
    }

    const away = saved.savedAt ? (Date.now() - saved.savedAt) : 0;

    Net.state   = saved;
    Net.botMode = true;
    Net.host    = true;

    Net.emit('start', {
      side: 'a',
      arena: Net.arena,
      opponent: Net.players.b,
      state: saved
    });

    if (away > 2500) Net._catchUp(saved, away, Net.mySide);

    Net.saveMark = 0;
    Net.lastSeen = Date.now();

    if (saved.over){
      Net._hostFinish();
      return true;
    }

    Net._startLoop();
    Net._startBotBrain();
    Net._push();
    return true;
  }

  await Net._attach();

  if (Net.host){
    if (!saved){
      Net._clearMatch();
      return false;
    }

    const away = saved.savedAt ? (Date.now() - saved.savedAt) : 0;

    Net.state = saved;

    Net.emit('start', {
      side: 'a',
      arena: Net.arena,
      opponent: Net.players.b,
      state: saved
    });

    if (away > 2500) Net._catchUp(saved, away, Net.mySide);

    Net.saveMark = 0;
    Net.lastSeen = Date.now();

    if (saved.over){
      Net._hostFinish();
      return true;
    }

    Net._startLoop();
    Net._push();
    return true;
  }

  Net.emit('start', {
    side: 'b',
    arena: Net.arena,
    opponent: Net.players.a,
    state: null
  });

  if (Net.matchCh){
    Net.matchCh.send({ type: 'broadcast', event: 'hello', payload: { from: Net.key } });
  }

  if (Net.resumeTimer) clearTimeout(Net.resumeTimer);
  Net.resumeTimer = setTimeout(function (){
    Net.resumeTimer = null;
    if (!Net.state && !Net.finished) Net.emit('resumeFailed', {});
  }, 8000);

  return true;
};

/* ---------------- конец боя ---------------- */

Net._finish = function (payload){
  if (Net.timer){ clearInterval(Net.timer); Net.timer = null; }
  if (!payload || Net.finished) return;

  Net.finished  = true;
  Net.finishing = false;

  if (Net.botTimer){ clearTimeout(Net.botTimer); Net.botTimer = null; }

  Net._clearMatch();

  if (!payload.cups) payload.cups = Net._estimateCups(payload.winner);

  const k = Net.mySide;

  let before = payload.cups[k + '_before'];
  let after  = payload.cups[k + '_after'];

  if (typeof before !== 'number') before = Net.me ? Net.me.cups : 0;
  if (typeof after  !== 'number') after  = before;

  const opp = Net.players
    ? (Net.mySide === 'a' ? Net.players.b : Net.players.a)
    : { name: 'Враг' };

  Net.botMode = false;

  Net.emit('result', {
    winner:   payload.winner,
    mySide:   Net.mySide,
    before:   before,
    after:    after,
    delta:    after - before,
    floor:    Arena.floorOf(after),
    opponent: opp
  });

  Net.refresh().catch(function(){});
};

Net.leaveMatch = async function (){
  Net._clearMatch();
  Net._clearFallback();

  if (Net.retry){ clearInterval(Net.retry); Net.retry = null; }

  if (Net.matchCh){
    try { await Net.matchCh.untrack(); } catch (e){}
    try { await Net.sb.removeChannel(Net.matchCh); } catch (e){}
  }

  Net.matchCh = null;
  Net.matchId = null;
  Net.state   = null;
  Net.host    = false;
  Net.mySide  = null;
  Net.pending = null;
  Net.finished = false;
  Net.finishing = false;
  Net.botMode  = false;
};

Net.DRAW_OFFER_MAX = DRAW_OFFER_MAX;

global.Net = Net;

})(window);