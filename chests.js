/* ============================================================
   chests.js — сундуки за победы (VER 1)
   4 ячейки. Открыть можно один сундук, он открывается по таймеру.
   Серебряный — обычный и самый частый. Ценнее — реже.
   Каждая арена открывает один новый тип сундука.
   ============================================================ */
(function (global) {
'use strict';

const KEY = 'chessChests';
const UNITS_KEY = 'chessUnits';
const SLOTS = 4;

/* Настройки */
const WIN_CHANCE = 0.45;      // шанс сундука за победу над живым игроком
const BOT_WINS_CHEST = false; // давать ли сундуки за победу над ботом
const TIME_MULT = 1;          // 1 = реальное время. Для теста поставь 0.001

const CHESTS = [
  { id:'silver',  name:'Серебряный', icon:'🥈', color:'#cbd5e1', rarity:'Обычный',     hours:3,  weight:100, coins:[150,300],  gems:[0,0],   units:[0,0] },
  { id:'gold',    name:'Золотой',    icon:'🥇', color:'#fbbf24', rarity:'Редкий',      hours:6,  weight:30,  coins:[400,700],  gems:[0,2],   units:[0,1] },
  { id:'crystal', name:'Кристальный',icon:'💠', color:'#7dd3fc', rarity:'Редкий',      hours:9,  weight:16,  coins:[700,1100], gems:[2,5],   units:[1,1] },
  { id:'magic',   name:'Магический', icon:'🔮', color:'#a78bfa', rarity:'Эпический',   hours:12, weight:10,  coins:[1000,1600],gems:[4,8],   units:[1,2] },
  { id:'royal',   name:'Королевский',icon:'👑', color:'#f472b6', rarity:'Эпический',   hours:16, weight:6,   coins:[1500,2400],gems:[6,12],  units:[1,2] },
  { id:'dragon',  name:'Драконий',   icon:'🐉', color:'#f97316', rarity:'Эпический',   hours:20, weight:4,   coins:[2200,3400],gems:[10,18], units:[2,3] },
  { id:'shadow',  name:'Теневой',    icon:'🌑', color:'#64748b', rarity:'Легендарный', hours:24, weight:3,   coins:[3000,4500],gems:[14,24], units:[2,4] },
  { id:'sky',     name:'Небесный',   icon:'🌤️', color:'#38bdf8', rarity:'Легендарный', hours:30, weight:2,   coins:[4000,6000],gems:[20,30], units:[3,5] },
  { id:'hell',    name:'Адский',     icon:'🔥', color:'#ef4444', rarity:'Легендарный', hours:36, weight:1.5, coins:[5500,8000],gems:[28,40], units:[4,6] },
  { id:'legend',  name:'Легендарный',icon:'⭐', color:'#facc15', rarity:'Легендарный', hours:48, weight:1,   coins:[7500,11000],gems:[40,60],units:[6,9] }
];

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

function save(){
  try { localStorage.setItem(KEY, JSON.stringify(slots)); } catch (e){}
}
function num(key){
  const n = parseInt(localStorage.getItem(key) || '0', 10);
  return isFinite(n) ? n : 0;
}
function addNum(key, n){
  try { localStorage.setItem(key, String(num(key) + n)); } catch (e){}
}
function rnd(range){
  return range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
}

/* ---------- логика ---------- */

function toast(msg, color){
  if (typeof global.showToastChest === 'function'){ global.showToastChest(msg, color); return; }
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

/* Выбор сундука за победу: только открытые арены, серебряный чаще всего */
function pickChestIndex(cups){
  const max = Math.min(CHESTS.length, arenaOf(cups));
  let total = 0;
  for (let i = 0; i < max; i++) total += CHESTS[i].weight;
  let r = Math.random() * total;
  for (let i = 0; i < max; i++){
    r -= CHESTS[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}

function onWin(beforeCups){
  if (Math.random() >= WIN_CHANCE) return;

  const free = slots.indexOf(null);
  if (free < 0){
    toast('Все ячейки сундуков заняты', '#ffb300');
    return;
  }

  const idx = pickChestIndex(beforeCups);
  slots[free] = { t: idx, st: 'idle' };
  save();
  render();
  toast('🎁 Получен ' + CHESTS[idx].name + ' сундук', CHESTS[idx].color);
}

function startOpen(i){
  const s = slots[i];
  if (!s || s.st !== 'idle') return;
  if (isOpening()){
    toast('Одновременно открывается только один сундук', '#ffb300');
    return;
  }
  s.st = 'open';
  s.end = Date.now() + CHESTS[s.t].hours * 3600000 * TIME_MULT;
  save();
  render();
}

function claim(i){
  const s = slots[i];
  if (!s || s.st !== 'open') return;
  if (Date.now() < s.end) return;

  const c = CHESTS[s.t];
  const reward = {
    coins: rnd(c.coins),
    gems: rnd(c.gems),
    units: rnd(c.units)
  };

  addNum('cr_coins', reward.coins);
  addNum('cr_gems', reward.gems);
  addNum(UNITS_KEY, reward.units);

  slots[i] = null;
  save();
  render();
  showReward(c, reward);
}

/* ---------- награда ---------- */

function showReward(c, r){
  const ov = document.getElementById('chReward');
  const parts = [];
  if (r.coins) parts.push('<div class="chr-row">🪙 <b>+' + r.coins + '</b> монет</div>');
  if (r.gems)  parts.push('<div class="chr-row">💎 <b>+' + r.gems + '</b> кристаллов</div>');
  if (r.units) parts.push('<div class="chr-row">🔹 <b>+' + r.units + '</b> единиц прокачки</div>');
  ov.querySelector('.chr-icon').textContent = c.icon;
  ov.querySelector('.chr-name').textContent = c.name + ' сундук';
  ov.querySelector('.chr-name').style.color = c.color;
  ov.querySelector('.chr-list').innerHTML = parts.join('') || '<div class="chr-row">Пусто</div>';
  ov.classList.add('open');
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
    return '<div class="ch-slot empty"><div class="ch-empty-ic">＋</div><div class="ch-empty-tx">Пусто</div></div>';
  }
  const c = CHESTS[s.t];
  const ready = s.st === 'open' && Date.now() >= s.end;
  let state, btn;

  if (s.st === 'idle'){
    state = 'Готов к открытию';
    btn = '<button class="ch-btn" data-act="start" data-i="' + i + '">Открыть · ' + c.hours + 'ч</button>';
  } else if (!ready){
    state = '<span class="ch-time" data-end="' + s.end + '">' + fmt(s.end - Date.now()) + '</span>';
    btn = '<div class="ch-wait">Открывается…</div>';
  } else {
    state = 'Готов!';
    btn = '<button class="ch-btn ready" data-act="claim" data-i="' + i + '">Забрать</button>';
  }

  return '<div class="ch-slot ' + (s.st === 'open' ? 'opening' : '') + (ready ? ' ready' : '') + '" style="--c:' + c.color + '">' +
    '<div class="ch-glow"></div>' +
    '<div class="ch-ic">' + c.icon + '</div>' +
    '<div class="ch-nm">' + c.name + '</div>' +
    '<div class="ch-rar">' + c.rarity + '</div>' +
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
    if (!s || s.st !== 'open') return;
    if (Date.now() >= s.end){ needRender = true; }
  });
  if (needRender){ render(); return; }

  const els = document.querySelectorAll('.ch-time');
  for (let i = 0; i < els.length; i++){
    const end = parseInt(els[i].getAttribute('data-end'), 10);
    els[i].textContent = fmt(end - Date.now());
  }
}

/* ---------- встраивание в лобби ---------- */

function injectStyle(){
  if (document.getElementById('chStyle')) return;
  const st = document.createElement('style');
  st.id = 'chStyle';
  st.textContent = [
    '#chWrap{width:min(95vw,420px);margin:12px auto 0;padding:12px;border-radius:16px;background:linear-gradient(180deg,#1f4a94,#122c63);border:2px solid #4b78c8;box-shadow:0 6px 0 #061433}',
    '#chWrap h3{margin:0 0 8px;font-size:13px;font-weight:900;color:#fff;display:flex;justify-content:space-between;align-items:center;letter-spacing:.4px}',
    '#chWrap h3 small{font-size:10px;color:#9fc4ff;font-weight:700}',
    '#chSlots{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}',
    '.ch-slot{position:relative;border-radius:14px;padding:8px 4px 8px;min-height:138px;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;overflow:hidden;background:linear-gradient(180deg,#0f2550,#081836);border:2px solid var(--c,#4b78c8);box-shadow:0 4px 0 #040d22,inset 0 1px 0 rgba(255,255,255,.12)}',
    '.ch-slot.empty{border:2px dashed #3d5f9f;box-shadow:none;justify-content:center;color:#6d8cc4}',
    '.ch-empty-ic{font-size:24px;font-weight:900;opacity:.6}',
    '.ch-empty-tx{font-size:11px;font-weight:800}',
    '.ch-glow{position:absolute;inset:-30%;background:radial-gradient(circle,var(--c,#fff) 0%,transparent 60%);opacity:.12;pointer-events:none}',
    '.ch-slot.opening .ch-glow{opacity:.22;animation:chPulse 1.8s ease-in-out infinite alternate}',
    '.ch-slot.ready .ch-glow{opacity:.45;animation:chPulse .7s ease-in-out infinite alternate}',
    '@keyframes chPulse{from{transform:scale(.9)}to{transform:scale(1.1)}}',
    '.ch-ic{font-size:34px;line-height:1;margin-top:4px;position:relative;z-index:1;filter:drop-shadow(0 4px 4px rgba(0,0,0,.6));animation:chBob 2.4s ease-in-out infinite}',
    '.ch-slot.ready .ch-ic{animation:chShake .5s ease-in-out infinite}',
    '@keyframes chBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}',
    '@keyframes chShake{0%,100%{transform:rotate(0)}25%{transform:rotate(-6deg)}75%{transform:rotate(6deg)}}',
    '.ch-nm{font-size:10.5px;font-weight:900;color:#fff;position:relative;z-index:1;line-height:1.1}',
    '.ch-rar{font-size:9px;font-weight:800;color:var(--c,#9fc4ff);position:relative;z-index:1}',
    '.ch-st{font-size:10px;font-weight:900;color:#ffe27a;min-height:14px;position:relative;z-index:1;font-variant-numeric:tabular-nums}',
    '.ch-btn{margin-top:auto;width:100%;border:0;border-radius:9px;padding:6px 2px;font-size:10px;font-weight:900;color:#3b1f00;cursor:pointer;background:linear-gradient(180deg,#ffe27a,#ffb300);box-shadow:0 3px 0 #b45309;position:relative;z-index:1}',
    '.ch-btn:active{transform:translateY(2px);box-shadow:0 1px 0 #b45309}',
    '.ch-btn.ready{color:#fff;background:linear-gradient(180deg,#5ef08a,#1f9e42);box-shadow:0 3px 0 #0e6b2c}',
    '.ch-wait{margin-top:auto;font-size:9.5px;font-weight:800;color:#9fc4ff;position:relative;z-index:1}',
    '.ch-hint{margin-top:8px;font-size:10.5px;color:#cfe3ff;text-align:center;line-height:1.35}',
    '#chReward{position:fixed;inset:0;z-index:9800;display:none;align-items:center;justify-content:center;background:rgba(3,10,30,.78);padding:20px}',
    '#chReward.open{display:flex}',
    '.chr-box{width:100%;max-width:330px;text-align:center;padding:22px 18px;border-radius:18px;background:linear-gradient(180deg,#1f4a94,#0f2656);border:2px solid #4b78c8;box-shadow:0 10px 40px rgba(0,0,0,.7);animation:chPop .35s ease-out}',
    '@keyframes chPop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}',
    '.chr-icon{font-size:64px;line-height:1;filter:drop-shadow(0 6px 8px rgba(0,0,0,.6))}',
    '.chr-name{font-size:19px;font-weight:900;margin:8px 0 12px;text-shadow:0 3px 0 #061433}',
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

  const anchor = document.getElementById('playBtn');
  const lobby = document.getElementById('lobby');
  if (!lobby) return;

  const wrap = document.createElement('div');
  wrap.id = 'chWrap';
  wrap.innerHTML =
    '<h3>🎁 Сундуки за победы <small>открывается один · 4 ячейки</small></h3>' +
    '<div id="chSlots"></div>' +
    '<div class="ch-hint">Шанс сундука за победу над живым игроком. Новый сундук открывается на каждой арене.</div>';

  if (anchor && anchor.parentNode === lobby) lobby.insertBefore(wrap, anchor);
  else lobby.appendChild(wrap);

  const ov = document.createElement('div');
  ov.id = 'chReward';
  ov.innerHTML =
    '<div class="chr-box">' +
      '<div class="chr-icon"></div>' +
      '<div class="chr-name"></div>' +
      '<div class="chr-list"></div>' +
      '<button class="chr-ok">Ура!</button>' +
    '</div>';
  document.body.appendChild(ov);
  ov.querySelector('.chr-ok').onclick = function(){ ov.classList.remove('open'); };

  wrap.addEventListener('click', function(e){
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const i = parseInt(b.getAttribute('data-i'), 10);
    if (b.getAttribute('data-act') === 'start') startOpen(i);
    else if (b.getAttribute('data-act') === 'claim') claim(i);
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

    const opp = Net.players ? (r.mySide === 'a' ? Net.players.b : Net.players.a) : null;
    const isBot = !!(opp && String(opp.key).indexOf('pl_') === 0);
    if (isBot && !BOT_WINS_CHEST) return;

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
  WIN_CHANCE: WIN_CHANCE,
  render: render,
  onWin: onWin
};

})(window);