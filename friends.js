/* ============================================================
   friends.js — друзья и вызовы на дружескую партию
   Подключается на всех страницах, где нужны вызовы.
   ============================================================ */
(function (global) {
'use strict';

const SB_URL = 'https://qnpriwfxzuoymoumdtrl.supabase.co';
const SB_KEY = 'sb_publishable_1jTWcnb3WvNMi79DXYU7Tw_RWKIVcsF';

const FRESH_MS = 3 * 60 * 1000;

const Friends = {
  sb: null,
  _seen: {},
  _timer: null
};

Friends.client = function (){
  if (!Friends.sb) Friends.sb = global.supabase.createClient(SB_URL, SB_KEY);
  return Friends.sb;
};

Friends.key = function (){
  const tgId = localStorage.getItem('tgId');
  if (tgId) return 'tg:' + tgId;

  const email = localStorage.getItem('currentEmail') || localStorage.getItem('linkedEmail');
  if (email) return 'email:' + email.toLowerCase();

  let anon = localStorage.getItem('arenaAnonId');
  if (!anon){
    anon = 'anon:' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('arenaAnonId', anon);
  }
  return anon;
};

Friends.name = function (){
  return localStorage.getItem('userName') || 'Игрок';
};

Friends.cups = function (){
  return parseInt(localStorage.getItem('cr_trophies') || '0', 10) || 0;
};

Friends.arenaOf = function (c){
  return Math.min(10, Math.floor(Math.max(0, c) / 1000) + 1);
};

function uuid(){
  if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c){
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/* ---------------- друзья ---------------- */

Friends.list = async function (){
  const sb = Friends.client();
  const res = await sb
    .from('arena_friends')
    .select('*')
    .eq('owner_key', Friends.key())
    .order('created_at', { ascending: false });

  if (res.error) return [];
  return res.data || [];
};

Friends.find = async function (nick){
  const sb = Friends.client();
  const q = String(nick || '').trim();
  if (q.length < 2) return [];

  const res = await sb
    .from('arena_players')
    .select('player_key,display_name,cups')
    .ilike('display_name', '%' + q + '%')
    .order('cups', { ascending: false })
    .limit(10);

  if (res.error) return [];
  return res.data || [];
};

Friends.add = async function (friendKey, friendName){
  const sb = Friends.client();
  const res = await sb.rpc('arena_add_friend', {
    p_owner:  Friends.key(),
    p_friend: friendKey,
    p_name:   friendName || 'Игрок'
  });
  return !res.error;
};

Friends.remove = async function (friendKey){
  const sb = Friends.client();
  const res = await sb.rpc('arena_remove_friend', {
    p_owner:  Friends.key(),
    p_friend: friendKey
  });
  return !res.error;
};

/* ---------------- вызовы ---------------- */

Friends.incoming = async function (){
  const sb = Friends.client();
  const res = await sb
    .from('arena_challenges')
    .select('*')
    .eq('to_key', Friends.key())
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(5);

  if (res.error) return [];

  const now = Date.now();
  return (res.data || []).filter(function (c){
    return (now - new Date(c.created_at).getTime()) < FRESH_MS;
  });
};

Friends.answer = async function (id, status){
  const sb = Friends.client();
  await sb.rpc('challenge_answer', {
    p_id:     id,
    p_to:     Friends.key(),
    p_status: status
  });
};

Friends.invite = async function (toKey, toName, toCups){
  const sb = Friends.client();
  const id = uuid();
  const arena = Math.min(Friends.arenaOf(Friends.cups()), Friends.arenaOf(toCups || 0));

  const res = await sb.rpc('challenge_send', {
    p_id:    id,
    p_from:  Friends.key(),
    p_name:  Friends.name(),
    p_cups:  Friends.cups(),
    p_to:    toKey,
    p_arena: arena
  });

  if (res.error) return null;
  return { id: id, arena: arena };
};

Friends.play = function (id, role, oppKey, oppName, oppCups, arena){
  const q =
    '?ch=' + encodeURIComponent(id) +
    '&role=' + encodeURIComponent(role) +
    '&opp=' + encodeURIComponent(oppKey || '') +
    '&name=' + encodeURIComponent(oppName || 'Соперник') +
    '&cups=' + encodeURIComponent(String(oppCups || 0)) +
    '&arena=' + encodeURIComponent(String(arena || 1));

  global.location.href = 'chess-arena.html' + q;
};

Friends.watch = function (cb){
  if (Friends._timer) clearInterval(Friends._timer);

  async function tick(){
    const list = await Friends.incoming();
    for (let i = 0; i < list.length; i++){
      const c = list[i];
      if (Friends._seen[c.id]) continue;
      Friends._seen[c.id] = true;
      try { cb(c); } catch (e){}
    }
  }

  tick();
  Friends._timer = setInterval(tick, 3000);
  return function stop(){
    if (Friends._timer){ clearInterval(Friends._timer); Friends._timer = null; }
  };
};

global.Friends = Friends;

})(window);