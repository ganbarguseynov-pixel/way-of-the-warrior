/* ============================================================
   net.js — сеть: очередь, матч, запись кубков
   Хост считает бой, гость присылает нажатия.
   ============================================================ */
(function (global) {
'use strict';

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
  queueSince: 0,
  pending: null,
  oppPresent: false
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
    Net._onInvite(msg.payload);
  });

  ch.on('broadcast', { event: 'accept' }, function (msg){
    Net._onAccept(msg.payload);
  });

  await ch.subscribe(async function (status){
    if (status === 'SUBSCRIBED'){
      await ch.track({
        key:   Net.key,
        name:  Net.name,
        cups:  Net.me ? Net.me.cups : 0,
        since: Date.now()
      });
      Net.emit('status', { text: 'В очереди. Ждём соперника.' });
      Net._tryPair();
    }
  });
};

Net.cancelQueue = async function (){
  if (!Net.queueCh) return;

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
      if (p && p.key) list.push({ key: p.key, name: p.name || 'Игрок', cups: +p.cups || 0 });
    }
  });

  return list;
};

Net._tryPair = function (){
  if (!Net.queueCh || Net.matchId || Net.pending) return;

  const all = Net._presenceList(Net.queueCh);
  const others = all.filter(function (p){ return p.key !== Net.key; });
  if (!others.length) return;

  const myCups = Net.me ? Net.me.cups : 0;
  const waited = Math.floor((Date.now() - Net.queueSince) / 1000);
  const window = 80 + waited * 30;

  others.sort(function (x, y){
    return Math.abs(x.cups - myCups) - Math.abs(y.cups - myCups);
  });

  let opp = null;
  for (let i = 0; i < others.length; i++){
    if (Math.abs(others[i].cups - myCups) <= window){ opp = others[i]; break; }
  }
  if (!opp) return;

  // инициатор — тот, у кого ключ лексикографически меньше
  if (Net.key > opp.key) return;

  const matchId = uuid();
  const arena = Math.min(Arena.arenaOf(myCups), Arena.arenaOf(opp.cups));

  Net.pending = { to: opp.key, matchId: matchId, arena: arena, opp: opp };

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

  // не дождались ответа — снимаем блокировку
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

/* ---------------- бой ---------------- */

Net._beginMatch = async function (m){
  await Net.cancelQueue();

  Net.matchId    = m.matchId;
  Net.mySide     = m.side;
  Net.host       = (m.side === 'a');
  Net.arena      = m.arena || 1;
  Net.oppPresent = false;

  const myCups = Net.me ? Net.me.cups : 0;
  const meP    = { key: Net.key,  name: Net.name,  cups: myCups };
  const oppP   = { key: m.oppKey, name: m.oppName, cups: m.oppCups || 0 };

  Net.players = Net.host
    ? { a: meP, b: oppP }
    : { a: oppP, b: meP };

  const ch = Net.sb.channel('arena_match_' + Net.matchId, {
    config: {
      broadcast: { self: false },
      presence:  { key: Net.key }
    }
  });
  Net.matchCh = ch;

  // гость присылает нажатия, хост их применяет
  ch.on('broadcast', { event: 'intent' }, function (msg){
    if (Net.host) Net._applyIntent(payloadOf(msg), 'b');
  });

  // хост рассылает состояние, гость его рисует
  ch.on('broadcast', { event: 'state' }, function (msg){
    if (!Net.host){
      Net.state = payloadOf(msg);
      Net.emit('state', Net.state);
    }
  });

  ch.on('broadcast', { event: 'error' }, function (msg){
    const p = payloadOf(msg);
    if (p && p.message) Net.emit('error', { message: p.message });
  });

  ch.on('broadcast', { event: 'result' }, function (msg){
    Net._finish(payloadOf(msg));
  });

  // следим, на месте ли соперник
  ch.on('presence', { event: 'sync' }, function (){
    const list = Net._presenceList(ch);
    let seen = false;
    for (let i = 0; i < list.length; i++) if (list[i].key === m.oppKey) seen = true;

    if (seen){
      Net.oppPresent = true;
    } else if (Net.oppPresent && !(Net.state && Net.state.over)){
      if (Net.timer){ clearInterval(Net.timer); Net.timer = null; }
      Net.emit('disconnect', {});
    }
  });

  await ch.subscribe(function (status){
    if (status === 'SUBSCRIBED') ch.track({ key: Net.key });
  });

  if (Net.host){
    Net._hostStart();
  } else {
    Net.emit('start', {
      side: 'b',
      arena: Net.arena,
      opponent: { name: m.oppName, cups: m.oppCups || 0 },
      state: null
    });
  }
};

function payloadOf(msg){
  if (!msg) return null;
  return msg.payload !== undefined ? msg.payload : msg;
}

Net._hostStart = function (){
  Net.state = Arena.create({
    id: Net.matchId,
    arena: Net.arena,
    players: Net.players
  });

  Net.emit('start', {
    side: 'a',
    arena: Net.arena,
    opponent: { name: Net.players.b.name, cups: Net.players.b.cups },
    state: Net.state
  });

  Net._broadcastState();

  let last = performance.now();
  let acc  = 0;

  Net.timer = setInterval(function (){
    const now = performance.now();
    const dt  = Math.min(0.2, (now - last) / 1000);
    last = now;

    Arena.tick(Net.state, dt);

    acc += dt * 1000;
    if (acc >= 100){
      acc = 0;
      Net._broadcastState();
    }

    if (Net.state.over) Net._hostFinish();
  }, 100);
};

Net._broadcastState = function (){
  if (!Net.matchCh || !Net.state) return;
  Net.matchCh.send({ type: 'broadcast', event: 'state', payload: Net.state });
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
        type: 'broadcast', event: 'error',
        payload: { message: res.error }
      });
    }
    return;
  }

  if (side === 'a') Net.emit('state', s);
  Net._broadcastState();
};

Net._hostFinish = async function (){
  if (Net.timer){ clearInterval(Net.timer); Net.timer = null; }

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
    Net._applyIntent(msg, 'a');
  } else if (Net.matchCh){
    Net.matchCh.send({ type: 'broadcast', event: 'intent', payload: msg });
  }
};

Net.resign = function (){
  if (Net.host) Net._applyIntent({ t: 'resign' }, 'a');
  else if (Net.matchCh){
    Net.matchCh.send({ type: 'broadcast', event: 'intent', payload: { t: 'resign' } });
  }
};

/* ---------------- конец боя ---------------- */

Net._finish = async function (payload){
  if (Net.timer){ clearInterval(Net.timer); Net.timer = null; }
  if (!payload) return;

  let before = Net.me ? Net.me.cups : 0;
  let after  = before;

  if (payload.cups){
    const k = Net.host ? 'a' : 'b';
    before = payload.cups[k + '_before'];
    after  = payload.cups[k + '_after'];
  }

  await Net.refresh();

  const opp = Net.players ? (Net.host ? Net.players.b : Net.players.a) : { name: 'Враг' };

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
  if (Net.timer){ clearInterval(Net.timer); Net.timer = null; }

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
  Net.oppPresent = false;
};

global.Net = Net;

})(window);