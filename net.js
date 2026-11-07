/* ============================================================
   net.js — сеть: очередь, матч, бот, ничья (VER 12)
   Бой переживает выход из приложения и продолжается.
   ============================================================ */
(function (global) {
'use strict';

const RECORD_KEY = 'arenaActiveMatch';
const STATE_KEY  = 'arenaActiveState';
const SETUP_KEY  = 'chessSetup';

const PUSH_MS = 200;
const TICK_MS = 100;

const SEARCH_LIMIT_MS = 3000;
const RESUME_LIMIT_MS = 60 * 60 * 1000;

const BOT_NAMES = [
  'Дмитрий','Алексей','Максим','Артём','Сергей','Кирилл','Иван',
  'Никита','Роман','Егор','Даниил','Михаил','Андрей','Павел',
  'Владислав','Глеб','Тимур','Матвей','Саша','Лёша'
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

  botMode: false,
  botTimer: null,
  fallbackTimer: null
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
    check:     s.check,
    mate:      s.mate,
    mateHit:   s.mateHit,
    over:      s.over,
    winner:    s.winner
  };
}

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

  try { localStorage.setItem(STATE_KEY, JSON.stringify(Net.state)); }
  catch (e){}
};

Net._clearMatch = function (){
  if (Net.timer){ clearInterval(Net.timer); Net.timer = null; }
  if (Net.botTimer){ clearTimeout(Net.botTimer); Net.botTimer = null; }
  if (Net.resumeTimer){ clearTimeout(Net.resumeTimer); Net.resumeTimer = null; }

  try { localStorage.removeItem(RECORD_KEY); } catch (e){}
  try { localStorage.removeItem(STATE_KEY); } catch (e){}
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
  });

  ch.on('broadcast', { event: 'hello' }, function (){
    if (Net.host && Net.state) Net._push();
  });

  ch.on('broadcast', { event: 'error' }, function (msg){
    const p = payloadOf(msg);
    if (p && p.message) Net.emit('error', { message: p.message });
  });

  ch.on('broadcast', { event: 'result' }, function (msg){
    Net._finish(payloadOf(msg));
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

  Net.botMode  = false;
  Net.matchId  = m.matchId;
  Net.mySide   = m.side;
  Net.host     = (m.side === 'a');
  Net.arena    = m.arena || 1;
  Net.finished = false;
  Net.state    = null;

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
  const tail = Math.random() < 0.5
    ? ''
    : ' ' + Math.floor(Math.random() * 89 + 10);
  return base + tail;
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

  Net.matchId  = uuid();
  Net.mySide   = 'a';
  Net.host     = true;
  Net.botMode  = true;
  Net.arena    = Math.min(Arena.arenaOf(myCups), Arena.arenaOf(rivalCups));
  Net.finished = false;
  Net.state    = null;

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

    if (st.drawOffer && st.drawOffer.a){
      if (Math.random() < 0.55) Net._applyIntent({ t:'draw' }, 'b');
      else Net._applyIntent({ t:'undraw' }, 'b');
    } else {
      Net._botMove();
    }

    Net._botTick();
  }, wait);
};

Net._botMove = function (){
  const s = Net.state;
  if (!s || s.over) return;
  if (s.energy.b < 1) return;

  const moves = [];

  for (let y = 0; y < 8; y++){
    for (let x = 0; x < 8; x++){
      const pc = s.board[y][x];
      if (!pc || pc.side !== 'b') continue;
      if (pc.asleep) continue;
      if (pc.chained) continue;

      const cost = Arena.moveCost(s, pc);
      if (s.energy.b < cost) continue;

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

  if (!moves.length) return;

  const caps = [];
  for (let i = 0; i < moves.length; i++) if (moves[i].cap) caps.push(moves[i]);

  const pool = (caps.length && Math.random() < 0.75) ? caps : moves;
  const pick = pool[Math.floor(Math.random() * pool.length)];

  Net._applyIntent({
    t:'move',
    fx:pick.fx, fy:pick.fy,
    tx:pick.tx, ty:pick.ty
  }, 'b');
};

/* ---------------- запуск боя ---------------- */

Net._hostStart = function (){
  Net.state = Arena.create({
    id: Net.matchId,
    arena: Net.arena,
    players: Net.players,
    setups: Net.setups
  });

  Net.emit('start', {
    side: 'a',
    arena: Net.arena,
    opponent: Net.players.b,
    state: Net.state
  });

  Net.saveMark = 0;
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

    Arena.tick(Net.state, dt);

    acc += dt * 1000;
    if (acc >= PUSH_MS){
      acc = 0;
      Net._push();
    }

    if (Net.state.over) Net._hostFinish();
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

Net._drawIntent = function (side, kind){
  const s = Net.state;
  if (!s || s.over) return { ok:false, error:'Бой окончен' };

  if (!s.drawOffer) s.drawOffer = { a:false, b:false };

  const foe = (side === 'a') ? 'b' : 'a';

  if (kind === 'draw'){
    if (s.drawOffer[foe]){
      s.drawOffer.a = false;
      s.drawOffer.b = false;
      Arena.finish(s, 'draw');
      return { ok:true };
    }
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
      case 'move':   res = Arena.move(s, side, msg.fx, msg.fy, msg.tx, msg.ty); break;
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
    }
    return;
  }

  Net._push();
};

/* ---------------- конец боя ---------------- */

Net._localCups = async function (winner){
  const myCups = Net.me ? Net.me.cups : 0;
  const oppCups = Net.players && Net.players.b ? Net.players.b.cups : myCups;

  let delta = 0;

  if (winner === 'a'){
    delta = Arena.deltaFor(myCups, oppCups);
  } else if (winner === 'b'){
    delta = -Arena.lossFor(myCups, Arena.deltaFor(oppCups, myCups));
  }

  const before = myCups;
  const after = Math.max(Arena.floorOf(myCups), myCups + delta);

  try {
    await Net.sb.from('arena_players').update({ cups: after }).eq('player_key', Net.key);
  } catch (e){}

  return {
    a_before: before, a_after: after,
    b_before: oppCups, b_after: oppCups
  };
};

Net._hostFinish = async function (){
  if (Net.timer){ clearInterval(Net.timer); Net.timer = null; }
  if (Net.finished) return;

  const s = Net.state;
  const payload = { winner: s.winner, matchId: Net.matchId, cups: null };

  if (Net.botMode){
    payload.cups = await Net._localCups(s.winner);
  } else {
    const winnerKey =
      s.winner === 'a' ? Net.players.a.key :
      s.winner === 'b' ? Net.players.b.key : null;

    if (winnerKey){
      const res = await Net.sb.rpc('arena_report_match', {
        p_match:  Net.matchId,
        p_a:      Net.players.a.key,
        p_b:      Net.players.b.key,
        p_winner: winnerKey,
        p_arena:  Net.arena
      });

      if (!res.error) payload.cups = res.data;
      else console.error('[net] report failed', res.error);
    }

    if (Net.matchCh){
      Net.matchCh.send({ type: 'broadcast', event: 'result', payload: payload });
    }
  }

  Net._finish(payload);
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

  Net.matchId  = rec.matchId;
  Net.mySide   = rec.side;
  Net.host     = (rec.side === 'a');
  Net.arena    = rec.arena || 1;
  Net.players  = rec.players;
  Net.finished = false;
  Net.botMode  = isBot;
  Net.state    = null;

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e){}
  if (saved && !saved.board) saved = null;

  /* бой с подставным соперником: восстанавливаем у себя */
  if (isBot){
    if (!saved){
      Net._clearMatch();
      Net.botMode = false;
      Net.matchId = null;
      return false;
    }

    Net.state = saved;
    Net.botMode = true;
    Net.host = true;

    Net.emit('start', {
      side: 'a',
      arena: Net.arena,
      opponent: Net.players.b,
      state: saved
    });

    Net.saveMark = 0;
    Net._startLoop();
    Net._startBotBrain();
    return true;
  }

  await Net._attach();

  if (Net.host){
    if (!saved){
      Net._clearMatch();
      return false;
    }

    Net.state = saved;
    Net.emit('start', {
      side: 'a',
      arena: Net.arena,
      opponent: Net.players.b,
      state: saved
    });

    Net._startLoop();
    Net.saveMark = 0;
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

Net._finish = async function (payload){
  if (Net.timer){ clearInterval(Net.timer); Net.timer = null; }
  if (!payload || Net.finished) return;

  Net.finished = true;

  if (Net.botTimer){ clearTimeout(Net.botTimer); Net.botTimer = null; }

  Net._clearMatch();

  let before = Net.me ? Net.me.cups : 0;
  let after  = before;

  if (payload.cups){
    const k = Net.mySide;
    before = payload.cups[k + '_before'];
    after  = payload.cups[k + '_after'];
  }

  await Net.refresh();

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
  Net.botMode  = false;
};

global.Net = Net;

})(window);