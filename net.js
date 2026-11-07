/* ============================================================
   net.js — сеть: очередь, матч, запись кубков
   Поиск соперника мгновенный: берётся ближайший по кубкам.
   ============================================================ */
(function (global) {
'use strict';

const RECORD_KEY = 'arenaActiveMatch';
const STATE_KEY  = 'arenaActiveState';

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
  host: false,
  state: null,

  timer: null,
  retry: null,
  resumeTimer: null,
  saveMark: 0,
  queueSince: 0,
  pending: null,
  finished: false
};

/* ---------------- события ---------------- */

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
  if (!force && now - Net.saveMark < 900) return;
  Net.saveMark = now;

  try { localStorage.setItem(STATE_KEY, JSON.stringify(Net.state)); }
  catch (e){}
};

Net._clearMatch = function (){
  if (Net.timer){ clearInterval(Net.timer); Net.timer = null; }
  if (Net.resumeTimer){ clearTimeout(Net.resumeTimer); Net.resumeTimer = null; }

  try { localStorage.removeItem(RECORD_KEY); } catch (e){}
  try { localStorage.removeItem(STATE_KEY); } catch (e){}
};

/* ---------------- очередь ---------------- */

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
  Net.retry = setInterval(function (){ Net._tryPair(); }, 800);
};

Net.cancelQueue = async function (){
  if (Net.retry){ clearInterval(Net.retry); Net.retry = null; }

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

/*
  Мгновенный подбор: никакого ожидания и никаких фаз.
  Берём ближайшего по кубкам из тех, кто уже в очереди.
*/
Net._tryPair = function (){
  if (!Net.queueCh || Net.matchId || Net.pending) return;

  const all = Net._presenceList(Net.queueCh);
  const others = all.filter(function (p){ return p.key !== Net.key; });

  if (!others.length){
    Net.emit('status', { text: 'Ищем соперника…' });
    return;
  }

  const myCups = Net.me ? Net.me.cups : 0;

  // ближайший по кубкам; при равенстве — по ключу, чтобы оба выбрали друг друга
  others.sort(function (x, y){
    const dx = Math.abs(x.cups - myCups);
    const dy = Math.abs(y.cups - myCups);
    if (dx !== dy) return dx - dy;
    return x.key < y.key ? -1 : (x.key > y.key ? 1 : 0);
  });

  const opp = others[0];
  if (!opp) return;

  // приглашает тот, у кого ключ меньше
  if (Net.key >= opp.key) return;

  const matchId = uuid();
  const arena = Math.min(Arena.arenaOf(myCups), Arena.arenaOf(opp.cups));

  Net.pending = { to: opp.key, matchId: matchId, arena: arena, opp: opp };

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
      cups: myCups
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
      cups: Net.me ? Net.me.cups : 0
    }
  });

  Net._beginMatch({
    matchId: p.matchId,
    arena: p.arena,
    side: 'b',
    oppKey: p.from,
    oppName: p.name,
    oppCups: p.cups
  });
};

Net._onAccept = function (p){
  if (!p || p.to !== Net.key) return;
  if (!Net.pending || Net.pending.matchId !== p.matchId) return;

  Net._beginMatch({
    matchId: p.matchId,
    arena: Net.pending.arena,
    side: 'a',
    oppKey: p.from,
    oppName: p.name,
    oppCups: p.cups
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

/* ---------------- бой ---------------- */

Net._beginMatch = async function (m){
  await Net.cancelQueue();

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

Net._hostStart = function (){
  Net.state = Arena.create({
    id: Net.matchId,
    arena: Net.arena,
    players: Net.players
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
    if (acc >= 100){
      acc = 0;
      Net._push();
    }

    if (Net.state.over) Net._hostFinish();
  }, 100);
};

Net._broadcastState = function (){
  if (!Net.matchCh || !Net.state) return;
  Net.matchCh.send({ type: 'broadcast', event: 'state', payload: Net.state });
};

Net._push = function (){
  if (!Net.state) return;

  if (Net.host){
    Net.emit('state', Net.state);
    Net._saveState(false);
  }
  Net._broadcastState();
};

Net._applyIntent = function (msg, side){
  if (!Net.state || !msg) return;

  const s = Net.state;
  let res = null;

  switch (msg.t){
    case 'place':  res = Arena.place(s, side, msg.type, msg.x, msg.y); break;
    case 'move':   res = Arena.move(s, side, msg.fx, msg.fy, msg.tx, msg.ty); break;
    case 'night':  res = Arena.castNight(s, side); break;
    case 'unlock': res = Arena.unlock(s, side, msg.x, msg.y); break;
    case 'resign': res = Arena.resign(s, side); break;
    default: return;
  }

  if (res && !res.ok){
    if (Net.matchCh){
      Net.matchCh.send({
        type: 'broadcast',
        event: 'error',
        payload: { message: res.error }
      });
    }
    return;
  }

  Net._saveState(true);
  Net._push();
};

Net._hostFinish = async function (){
  if (Net.timer){ clearInterval(Net.timer); Net.timer = null; }
  if (Net.finished) return;

  const s = Net.state;
  const winnerKey =
    s.winner === 'a' ? Net.players.a.key :
    s.winner === 'b' ? Net.players.b.key : null;

  const payload = { winner: s.winner, matchId: Net.matchId, cups: null };

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
  if (Net.host) Net._applyIntent({ t: 'resign' }, Net.mySide);
  else if (Net.matchCh){
    Net.matchCh.send({ type: 'broadcast', event: 'intent', payload: { t: 'resign' } });
  }
};

/* ---------------- возврат в незавершённый бой ---------------- */

Net.tryResume = async function (){
  const rec = Net._readRecord();
  if (!rec || !rec.matchId || !rec.side) return false;

  if (Date.now() - (rec.at || 0) > 20 * 60 * 1000){
    Net._clearMatch();
    return false;
  }

  Net.matchId  = rec.matchId;
  Net.mySide   = rec.side;
  Net.host     = (rec.side === 'a');
  Net.arena    = rec.arena || 1;
  Net.players  = rec.players;
  Net.finished = false;
  Net.state    = null;

  await Net._attach();

  if (Net.host){
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e){}

    if (!saved || !saved.board){
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
};

global.Net = Net;

})(window);