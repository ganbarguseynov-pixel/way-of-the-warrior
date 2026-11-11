/* ============================================================
   chests.js — сундуки за победы (VER 2)
   • За каждую настоящую победу (не дружеская) — серебряный сундук.
   • Редко — сундук ценнее, по одному типу на арену (арена 2 → золотой и т.д.).
   • Открытие по таймеру. Таймер можно сократить кристаллами.
   • При открытии изредка «сюрприз»: награда как у сундука на ступень выше.
   ============================================================ */
(function (global) {
'use strict';

const KEY = 'chessChests';
const UNITS_KEY = 'chessUnits';
const COINS_KEY = 'cr_coins';
const GEMS_KEY  = 'cr_gems';
const SLOTS = 4;

/* Настройки */
const PREMIUM_CHANCE  = 0.12; // шанс, что помимо серебряного выпадет более ценный сундук
const SURPRISE_CHANCE = 0.04; // шанс сюрприза при открытии: награда на ступень выше
const GEMS_PER_HOUR   = 2;    // сколько кристаллов стоит 1 час ожидания
const TIME_MULT       = 1;    // 1 = реальное время. Для теста поставь 0.001

/* Порядок = ценность. Индекс 0 — серебряный (всегда). Арена N открывает индекс N-1. */
const CHESTS = [
  { name:'Серебряный',  icon:'🥈', color:'#cbd5e1', rarity:'Обычный',     hours:3,  coins:[120,260],   units:[0,1] },
  { name:'Золотой',     icon:'🥇', color:'#fbbf24', rarity:'Редкий',      hours:6,  coins:[300,520],   units:[0,2] },
  { name:'Кристальный', icon:'💠', color:'#7dd3fc', rarity:'Редкий',      hours:9,  coins:[450,750],   units:[1,2] },
  { name:'Магический',  icon:'🔮', color:'#a78bfa', rarity:'Эпический',   hours:12, coins:[650,1000],  units:[1,3] },
  { name:'Королевский', icon:'👑', color:'#f472b6', rarity:'Эпический',   hours:16, coins:[900,1400],  units:[2,3] },
  { name:'Драконий',    icon:'🐉', color:'#f97316', rarity:'Эпический',   hours:20, coins:[1300,1900], units:[2,4] },
  { name:'Теневой',     icon:'🌑', color:'#64748b', rarity:'Легендарный', hours:24, coins:[1800,2600], units:[3,5] },
  { name:'Небесный',    icon:'🌤️', color:'#38bdf8', rarity:'Легендарный', hours:30, coins:[2400,3400], units:[3,6] },
  { name:'Адский',      icon:'🔥', color:'#ef4444', rarity:'Легендарный', hours:36, coins:[3200,4500], units:[4,7] },
  { name:'Легендарный', icon:'⭐', color:'#facc15', rarity:'Легендарный', hours:48, coins:[4500,6500], units:[5,9] }
];
const TOP = CHESTS.length - 1;

function arenaOf(cups){
  if (global.Arena && typeof Arena.arenaOf === 'function') return Arena.arenaOf(cups);
  return Math.min(10, Math.floor(Math.max(0, cups) / 1000) + 1);
}

/* ---------- хранилище ---------- */

function load(){
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (Array.isArray(a) && a.length === SLOTS) return a;
  } catch (e){}
  return [null, null, null, null];
}
let slots = load();
let lastResultKey = null;

function save(){ try { localStorage.setItem(KEY, JSON.stringify(slots)); } catch (e){} }
function num(key){
  const n = parseInt(localStorage.getItem(key) || '0', 10);
  return isFinite(n) ? n : 0;
}
function setNum(key, n){ try { localStorage.setItem(key, String(Math.max(0, n))); } catch (e){} }
function rnd(range){ return range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1)); }

/* ---------- уведомления ---------- */

function note(msg, color){
  if (typeof global.toast === 'function'){ global.toast(msg); return; }
  let t = document.getElementById('chToast');
  if (!t){
    t = document.createElement('div');
    t.id = 'chToast';
    t.className = 'ch-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.borderColor = color || '#34c759';
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(function(){ t.classList.remove('show'); }, 2200);
}

function isOpening(){
  return slots.some(function(s){ return s && s.st === 'open'; });
}

/* ---------- выпадение после победы ---------- */

/* Более ценный сундук: тип из уже открытых арен. Чем ценнее — тем реже. */
function rollPremium(arena){
  const maxT = Math.min(arena - 1, TOP);
  if (maxT < 1) return -1;
  if (Math.random() >= PREMIUM_CHANCE) return -1;
  let total = 0;
  for (let t = 1; t <= maxT; t++) total += (maxT - t + 1);
  let r = Math.random() * total;
  for (let t = 1; t <= maxT; t++){
    r -= (maxT - t + 1);
    if (r < 0) return t;
  }
  return 1;
}

function freeSlot(){ return slots.indexOf(null); }

function putChest(t){
  const i = freeSlot();
  if (i < 0) return false;
  slots[i] = { t: t, st: 'idle' };
  return true;
}

function onWin(beforeCups){
  const arena = arenaOf(beforeCups);
  const premium = rollPremium(arena);

  const gotSilver = putChest(0);
  let gotPremium = false;
  if (premium > 0) gotPremium = putChest(premium);

  save();
  render();

  if (!gotSilver){
    note('Все 4 ячейки заняты — сундук не получен', '#ffb300');
    return;
  }
  if (gotPremium){
    note('🎁 Серебряный + ' + CHESTS[premium].name + ' сундук!', CHESTS[premium].color);
  } else {
    note('🎁 Получен серебряный сундук', CHESTS[0].color);
  }
}

/* ---------- открытие и ожидание ---------- */

function startOpen(i){
  const s = slots[i];
  if (!s || s.st !== 'idle') return;
  if (isOpening()){
    note('Одновременно открывается только один сундук', '#ffb300');
    return;
  }
  s.st = 'open';
  s.end = Date.now() + CHESTS[s.t].hours * 3600000 * TIME_MULT;
  save();
  render();
}

function gemCost(remainingMs){
  const hours = remainingMs / 3600000;
  return Math.max(1, Math.ceil(hours * GEMS_PER_HOUR));
}

function skip(i){
  const s = slots[i];
  if (!s || s.st !== 'open') return;
  const rem = s.end - Date.now();
  if (rem <= 0) return;
  const cost = gemCost(rem);
  const gems = num(GEMS_KEY);
  if (gems < cost){
    note('Нужно ' + cost + ' 💎, у тебя ' + gems, '#f4665e');
    return;
  }
  setNum(GEMS_KEY, gems - cost);
  s.end = Date.now();
  save();
  render();
  if (typeof global.updateTopbar === 'function') global.updateTopbar();
  note('Сундук готов к открытию', '#43e97b');
}

function claim(i){
  const s = slots[i];
  if (!s || s.st !== 'open') return;
  if (Date.now() < s.end) return;

  let tier = s.t;
  let surprise = false;
  if (tier < TOP && Math.random() < SURPRISE_CHANCE){
    tier = tier + 1;
    surprise = true;
  }

  const c = CHESTS[tier];
  const reward = { coins: rnd(c.coins), units: rnd(c.units) };

  setNum(COINS_KEY, num(COINS_KEY) + reward.coins);
  setNum(UNITS_KEY, num(UNITS_KEY) + reward.units);

  slots[i] = null;
  save();
  render();
  showReward(CHESTS[s.t], reward, surprise ? CHESTS[tier] : null);
}

/* ---------- награда ---------- */

function showReward(c, r, surpriseTo){
  const ov = document.getElementById('chReward');
  if (!ov) return;
  const parts = [];
  parts.push('<div class="chr-row">🪙 <b>+' + r.coins + '</b> монет</div>');
  if (r.units) parts.push('<div class="chr-row">🔹 <b>+' + r.units + '</b> единиц прокачки</div>');
  else parts.push('<div class="chr-row">🔹 единиц в этот раз нет</div>');

  ov.querySelector('.chr-icon').textContent = c.icon;
  ov.querySelector('.chr-name').textContent = c.name + ' сундук';
  ov.querySelector('.chr-name').style.color = c.color;
  ov.querySelector('.chr-surprise').innerHTML = surpriseTo
    ? '<div class="chr-sur">⭐ СЮРПРИЗ! Награда как у «' + surpriseTo.name + '»</div>'
    : '';
  ov.querySelector('.chr-list').innerHTML = parts.join('');
  ov.classList.add('open');
  if (typeof global.updateTopbar === 'function') global.updateTopbar();
}

/* ---------- отрисовка ---------- */

function fmt(ms){
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return h + 'ч ' + String(m).padStart(2,'0') + 'м';
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function slotHtml(s, i){
  if (!s){
    return '<div class="ch-slot empty"><div class="ch-plus">+</div><div class="ch-tx">Пусто</div></div>';
  }
  const c = CHESTS[s.t];
  const rem = s.st === 'open' ? s.end - Date.now() : 0;
  const ready = s.st === 'open' && rem <= 0;
  let state, btn;

  if (s.st === 'idle'){
    state = c.rarity;
    btn = '<button class="ch-btn" data-act="start" data-i="' + i + '">Открыть · ' + c.hours + 'ч</button>';
  } else if (!ready){
    state = '<span class="ch-time" data-end="' + s.end + '">' + fmt(rem) + '</span>';
    btn = '<button class="ch-btn gem" data-act="skip" data-i="' + i + '">💎 <span class="ch-gem" data-end="' + s.end + '">' + gemCost(rem) + '</span></button>';
  } else {
    state = 'Готов!';
    btn = '<button class="ch-btn ready" data-act="claim" data-i="' + i + '">Забрать</button>';
  }

  return '<div class="ch-slot' + (s.st === 'open' ? ' opening' : '') + (ready ? ' ready' : '') + '" style="--c:' + c.color + '">' +
    '<div class="ch-glow"></div>' +
    '<div class="ch-ic">' + c.icon + '</div>' +
    '<div class="ch-nm">' + c.name + '</div>' +
    '<div class="ch-st">' + state + '</div>' +
    btn +
    '</div>';
}

function render(){
  const box = document.getElementById('chSlots');
  if (!box) return;
  box.innerHTML = slots.map(slotHtml).join('');
}

function tick(){
  let needRender = false;
  slots.forEach(function(s){
    if (s && s.st === 'open' && Date.now() >= s.end) needRender = true;
  });
  if (needRender){ render(); return; }

  document.querySelectorAll('.ch-time').forEach(function(el){
    const end = parseInt(el.getAttribute('data-end'), 10);
    el.textContent = fmt(end - Date.now());
  });
  document.querySelectorAll('.ch-gem').forEach(function(el){
    const end = parseInt(el.getAttribute('data-end'), 10);
    const rem = end - Date.now();
    if (rem > 0) el.textContent = gemCost(rem);
  });
}

/* ---------- встраивание в лобби ---------- */

function injectStyle(){
  if (document.getElementById('chStyle')) return;
  const st = document.createElement('style');
  st.id = 'chStyle';
  st.textContent = [
    '#chWrap{width:min(95vw,400px);margin:10px auto 0;padding:8px 8px 9px;border-radius:14px;background:linear-gradient(180deg,#1f4a94,#122c63);border:2px solid #4b78c8;box-shadow:0 4px 0 #061433}',
    '#chWrap h3{margin:0 0 6px;font-size:12px;font-weight:900;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:6px}',
    '#chWrap h3 small{font-size:9.5px;color:#9fc4ff;font-weight:700;white-space:nowrap}',
    '#chSlots{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}',
    '.ch-slot{position:relative;border-radius:11px;padding:5px 3px 5px;height:112px;display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center;overflow:hidden;background:linear-gradient(180deg,#0f2550,#081836);border:2px solid var(--c,#4b78c8);box-shadow:0 3px 0 #040d22}',
    '.ch-slot.empty{border:2px dashed #3d5f9f;box-shadow:none;justify-content:center;color:#6d8cc4}',
    '.ch-plus{font-size:20px;font-weight:900;opacity:.6;line-height:1}',
    '.ch-tx{font-size:10px;font-weight:800}',
    '.ch-glow{position:absolute;inset:-30%;background:radial-gradient(circle,var(--c,#fff) 0%,transparent 60%);opacity:.12;pointer-events:none}',
    '.ch-slot.opening .ch-glow{opacity:.22;animation:chPulse 1.8s ease-in-out infinite alternate}',
    '.ch-slot.ready .ch-glow{opacity:.45;animation:chPulse .7s ease-in-out infinite alternate}',
    '@keyframes chPulse{from{transform:scale(.9)}to{transform:scale(1.1)}}',
    '.ch-ic{font-size:24px;line-height:1;margin-top:2px;position:relative;z-index:1;filter:drop-shadow(0 3px 3px rgba(0,0,0,.6));animation:chBob 2.4s ease-in-out infinite}',
    '.ch-slot.ready .ch-ic{animation:chShake .5s ease-in-out infinite}',
    '@keyframes chBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}',
    '@keyframes chShake{0%,100%{transform:rotate(0)}25%{transform:rotate(-6deg)}75%{transform:rotate(6deg)}}',
    '.ch-nm{font-size:9px;font-weight:900;color:#fff;position:relative;z-index:1;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}',
    '.ch-st{font-size:8.5px;font-weight:900;color:#ffe27a;min-height:12px;position:relative;z-index:1;font-variant-numeric:tabular-nums;line-height:1.2}',
    '.ch-btn{margin-top:auto;width:100%;border:0;border-radius:7px;padding:4px 1px;font-size:8.5px;font-weight:900;color:#3b1f00;cursor:pointer;background:linear-gradient(180deg,#ffe27a,#ffb300);box-shadow:0 2px 0 #b45309;position:relative;z-index:1;white-space:nowrap;overflow:hidden}',
    '.ch-btn:active{transform:translateY(1px)}',
    '.ch-btn.gem{color:#fff;background:linear-gradient(180deg,#7dd3fc,#2563eb);box-shadow:0 2px 0 #1e3a8a}',
    '.ch-btn.ready{color:#fff;background:linear-gradient(180deg,#5ef08a,#1f9e42);box-shadow:0 2px 0 #0e6b2c}',
    '#chReward{position:fixed;inset:0;z-index:9800;display:none;align-items:center;justify-content:center;background:rgba(3,10,30,.78);padding:20px}',
    '#chReward.open{display:flex}',
    '.chr-box{width:100%;max-width:330px;text-align:center;padding:20px 18px;border-radius:18px;background:linear-gradient(180deg,#1f4a94,#0f2656);border:2px solid #4b78c8;box-shadow:0 10px 40px rgba(0,0,0,.7);animation:chPop .35s ease-out}',
    '@keyframes chPop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}',
    '.chr-icon{font-size:60px;line-height:1;filter:drop-shadow(0 6px 8px rgba(0,0,0,.6))}',
    '.chr-name{font-size:19px;font-weight:900;margin:8px 0 8px;text-shadow:0 3px 0 #061433}',
    '.chr-sur{font-size:12px;font-weight:900;color:#3b1f00;background:linear-gradient(180deg,#ffe27a,#ffb300);border-radius:10px;padding:7px 8px;margin-bottom:10px;box-shadow:0 3px 0 #b45309}',
    '.chr-list{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}',
    '.chr-row{font-size:14px;font-weight:800;padding:8px;border-radius:10px;background:rgba(2,6,23,.45);border:1px solid #3f67b8}',
    '.chr-row b{color:#ffe27a}',
    '.chr-ok{width:100%;padding:12px;border:0;border-radius:12px;font-size:15px;font-weight:900;color:#3b1f00;background:linear-gradient(180deg,#ffe27a,#ffb300);box-shadow:0 4px 0 #b45309;cursor:pointer}',
    '.ch-toast{position:fixed;top:18px;left:50%;transform:translateX(-50%) translateY(-120px);background:linear-gradient(135deg,#22437f,#122a5e);color:#fff;padding:12px 18px;border-radius:12px;font-weight:800;z-index:9900;border:3px solid #34c759;transition:transform .35s;font-size:13px;text-align:center;max-width:86vw}',
    '.ch-toast.show{transform:translateX(-50%) translateY(0)}'
  ].join('\n');
  document.head.appendChild(st);
}

function build(){
  injectStyle();

  const lobby = document.getElementById('lobby');
  const rule  = document.getElementById('ruleBox');
  if (!lobby) return;

  const wrap = document.createElement('div');
  wrap.id = 'chWrap';
  wrap.innerHTML =
    '<h3>🎁 Сундуки за победы <small>1 открыт · 4 ячейки</small></h3>' +
    '<div id="chSlots"></div>';

  if (rule && rule.parentNode === lobby) lobby.insertBefore(wrap, rule.nextSibling);
  else lobby.appendChild(wrap);

  const ov = document.createElement('div');
  ov.id = 'chReward';
  ov.innerHTML =
    '<div class="chr-box">' +
      '<div class="chr-icon"></div>' +
      '<div class="chr-name"></div>' +
      '<div class="chr-surprise"></div>' +
      '<div class="chr-list"></div>' +
      '<button class="chr-ok">Ура!</button>' +
    '</div>';
  document.body.appendChild(ov);
  ov.querySelector('.chr-ok').onclick = function(){ ov.classList.remove('open'); };

  wrap.addEventListener('click', function(e){
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const i = parseInt(b.getAttribute('data-i'), 10);
    const act = b.getAttribute('data-act');
    if (act === 'start') startOpen(i);
    else if (act === 'skip') skip(i);
    else if (act === 'claim') claim(i);
  });

  render();
  setInterval(tick, 1000);
}

/* ---------- победа в бою ---------- */

function hookResult(){
  if (!global.Net || typeof Net.on !== 'function') return;

  Net.on('result', function (r){
    if (!r || r.friendly) return;
    if (r.winner !== r.mySide) return;

    /* защита от двойной выдачи, если событие пришло дважды */
    const key = [r.before, r.after, r.mySide, r.winner].join('|');
    if (key === lastResultKey) return;
    lastResultKey = key;

    onWin(r.before || 0);
  });
}

function start(){
  build();
  hookResult();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

global.Chests = {
  CHESTS: CHESTS,
  PREMIUM_CHANCE: PREMIUM_CHANCE,
  SURPRISE_CHANCE: SURPRISE_CHANCE,
  render: render,
  onWin: onWin
};

})(window);