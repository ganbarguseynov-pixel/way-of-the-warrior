/* ============================================================
   profile.js — публичный профиль игрока (VER 1)
   Profile.open(keyOrTag) — открыть карточку любого игрока
   ============================================================ */
(function (global) {
'use strict';

var SB_URL = 'https://qnpriwfxzuoymoumdtrl.supabase.co';
var SB_KEY = 'sb_publishable_1jTWcnb3WvNMi79DXYU7Tw_RWKIVcsF';

var ARENAS = ['Разминка','Псарня','Мясорубка','Кошмар на улице Вязов','Техасская резня',
              'Хостел','Восставший из ада','Судная ночь','Зловещие мертвецы','Бессмертная партия'];

var Profile = { sb: null, onEditNick: null, current: null };

function client(){
  if (!Profile.sb) Profile.sb = global.supabase.createClient(SB_URL, SB_KEY);
  return Profile.sb;
}

Profile.self = function (){
  var tgId = localStorage.getItem('tgId');
  if (tgId) return 'tg:' + tgId;

  var email = localStorage.getItem('currentEmail') || localStorage.getItem('linkedEmail');
  if (email) return 'email:' + email.toLowerCase();

  var anon = localStorage.getItem('arenaAnonId');
  if (!anon){
    anon = 'anon:' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('arenaAnonId', anon);
  }
  return anon;
};

function esc(s){
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function num(n){
  var v = (typeof n === 'number' && isFinite(n)) ? Math.round(n) : 0;
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/* ---------- стили ---------- */

var CSS = ''
+ '#pfModal{position:fixed;inset:0;z-index:2100;display:none;background:rgba(2,6,23,.94);align-items:center;justify-content:center}'
+ '#pfModal.open{display:flex}'
+ '#pfCard{position:relative;width:100%;max-width:430px;height:100dvh;display:flex;flex-direction:column;overflow:hidden;'
+ 'background:#16357c;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.06) 0 2px,transparent 2px 26px),'
+ 'repeating-linear-gradient(-45deg,rgba(255,255,255,.06) 0 2px,transparent 2px 26px);'
+ 'box-shadow:inset 0 0 80px rgba(0,0,0,.6);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'
+ '#pfTop{position:relative;flex:0 0 54px;background:linear-gradient(180deg,#43aef8,#1668d8);border-bottom:3px solid #f7c948;display:flex;align-items:center;justify-content:center}'
+ '#pfCrown{position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:38px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.6))}'
+ '#pfDia{position:absolute;left:12px;top:50%;transform:translateY(-50%) rotate(45deg);width:14px;height:14px;background:linear-gradient(135deg,#ffe680,#f0a800);border:1px solid #7a4b00}'
+ '#pfClose{position:absolute;right:10px;top:11px;width:34px;height:34px;border-radius:9px;border:2px solid #fff;'
+ 'background:linear-gradient(180deg,#f4665e,#c62828);color:#fff;font-size:15px;font-weight:900;cursor:pointer;line-height:1}'
+ '#pfScroll{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding:14px 0 24px;scrollbar-width:none}'
+ '#pfScroll::-webkit-scrollbar{display:none}'
+ '.pf-hero{text-align:center;margin-bottom:14px;padding:0 16px}'
+ '.pf-ava{width:74px;height:74px;margin:0 auto 8px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
+ 'font-size:38px;background:linear-gradient(145deg,#ffe27a,#e39b00);border:3px solid #fff;box-shadow:0 6px 18px rgba(0,0,0,.55)}'
+ '.pf-name{font-size:19px;font-weight:900;color:#fff;text-shadow:-2px -2px 0 #10214a,2px -2px 0 #10214a,-2px 2px 0 #10214a,2px 2px 0 #10214a}'
+ '.pf-tag{display:inline-block;margin-top:6px;font-size:12.5px;font-weight:900;letter-spacing:.8px;color:#10214a;'
+ 'background:linear-gradient(180deg,#ffe680,#f3b300);padding:3px 12px;border-radius:8px;border:2px solid #fff}'
+ '.pf-arena{margin-top:8px;font-size:12px;font-weight:800;color:#cfe0ff}'
+ '.pf-sec{margin:0 12px 14px;border-radius:14px;overflow:hidden;border:2px solid rgba(0,0,0,.35)}'
+ '.pf-purple{background:linear-gradient(180deg,#7b3fc4,#5a2496)}'
+ '.pf-blue{background:linear-gradient(180deg,#2e71d4,#1b4a9c)}'
+ '.pf-sec-h{display:flex;align-items:center;justify-content:center;gap:10px;padding:9px 0;'
+ 'font-size:13px;font-weight:900;letter-spacing:.4px;color:#fff;text-shadow:0 2px 4px rgba(0,0,0,.65)}'
+ '.pf-sec-h::before,.pf-sec-h::after{content:"";width:46px;height:3px;border-radius:2px;'
+ 'background:linear-gradient(90deg,#f7d24b,#ffe98a,#f7d24b)}'
+ '.pf-record{display:flex;align-items:center;justify-content:center;gap:12px;margin:0 18px;padding:10px;'
+ 'border-radius:10px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.16)}'
+ '.pf-record span{font-size:24px}'
+ '.pf-record b{font-size:26px;font-weight:900;color:#fff;text-shadow:-2px -2px 0 #2a1a4d,2px -2px 0 #2a1a4d,-2px 2px 0 #2a1a4d,2px 2px 0 #2a1a4d}'
+ '.pf-note{text-align:center;font-size:11px;color:rgba(255,255,255,.8);padding:8px 16px 12px;line-height:1.4}'
+ '.pf-deck{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:4px 12px 10px}'
+ '.pf-card2{position:relative;aspect-ratio:1/1.18;border-radius:10px;display:flex;align-items:center;justify-content:center;'
+ 'font-size:26px;color:#fff;background:linear-gradient(180deg,#8b6bff,#4a2fbe);border:2px solid #f7d24b;'
+ 'box-shadow:inset 0 -14px 18px rgba(0,0,0,.28)}'
+ '.pf-card2 i{position:absolute;bottom:2px;left:0;right:0;text-align:center;font-style:normal;font-size:9px;font-weight:900;'
+ 'color:#fff;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000}'
+ '.pf-avg{margin:0 12px 12px;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.3);'
+ 'font-size:11.5px;font-weight:800;color:#fff;display:flex;justify-content:space-between;align-items:center}'
+ '.pf-avg b{color:#ffd84d}'
+ '.pf-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:10px 12px 14px}'
+ '.pf-cell{background:#e6e8f7;border-radius:9px;padding:7px 9px;box-shadow:inset 0 -2px 0 rgba(0,0,0,.15)}'
+ '.pf-cell span{display:block;font-size:9.5px;font-weight:800;color:#5b4b8a;margin-bottom:3px;line-height:1.2}'
+ '.pf-cell b{display:block;font-size:19px;font-weight:900;color:#fff;line-height:1.15;'
+ 'text-shadow:-2px -2px 0 #202a44,2px -2px 0 #202a44,-2px 2px 0 #202a44,2px 2px 0 #202a44}'
+ '.pf-cell.wide b{font-size:13px}'
+ '.pf-clan{display:flex;align-items:center;gap:11px;padding:12px}'
+ '.pf-clan-e{width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;'
+ 'background:linear-gradient(145deg,#ffe27a,#e39b00);border:2px solid #fff;flex-shrink:0}'
+ '.pf-clan-n{font-size:14px;font-weight:900;color:#fff}'
+ '.pf-clan-n i{font-style:normal;font-size:11px;color:#ffd84d;margin-left:4px}'
+ '.pf-clan-r{font-size:11px;color:#cfe0ff;margin-top:3px;font-weight:700}'
+ '.pf-btns{display:flex;gap:8px;padding:4px 12px 0}'
+ '.pf-btns button{flex:1;padding:13px 4px;border-radius:12px;border:2px solid rgba(255,255,255,.4);'
+ 'font-size:12.5px;font-weight:900;color:#fff;cursor:pointer}'
+ '#pfPlay{background:linear-gradient(180deg,#5ddc7a,#1f9e42)}'
+ '#pfAdd{background:linear-gradient(180deg,#5ea8ff,#1e63c8)}'
+ '#pfNick,#pfShare{background:linear-gradient(180deg,#8b6bff,#5a2fc4)}'
+ '.pf-load{padding:60px 20px;text-align:center;color:#cfe0ff;font-size:13px;font-weight:800}';

function ensure(){
  if (document.getElementById('pfModal')) return;

  var st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  var d = document.createElement('div');
  d.id = 'pfModal';
  d.innerHTML =
    '<div id="pfCard">' +
      '<div id="pfTop">' +
        '<div id="pfDia"></div>' +
        '<div id="pfCrown">👑</div>' +
        '<button id="pfClose">✕</button>' +
      '</div>' +
      '<div id="pfScroll"></div>' +
    '</div>';

  document.body.appendChild(d);

  d.querySelector('#pfClose').onclick = Profile.close;
  d.onclick = function (e){ if (e.target === d) Profile.close(); };
}

/* ---------- колода ---------- */

function pieceDeck(deck){
  var out = [];

  if (deck && deck.length){
    for (var i = 0; i < deck.length; i++){
      var d = deck[i] || {};
      out.push({
        g: d.g || '♟',
        c: (typeof d.c === 'number') ? d.c : 0,
        n: d.n || ''
      });
    }
    return out;
  }

  var P = (global.Arena && global.Arena.PIECES) ? global.Arena.PIECES : null;

  var def = [
    ['pawn',   '♙', 1, 'Пешка'],
    ['knight', '♘', 3, 'Конь'],
    ['bishop', '♗', 3, 'Слон'],
    ['rook',   '♖', 5, 'Ладья'],
    ['queen',  '♕', 9, 'Ферзь'],
    ['king',   '♔', 1, 'Король']
  ];

  for (var k = 0; k < def.length; k++){
    var t = def[k][0];
    var p = P ? P[t] : null;
    out.push({
      g: (p && p.w) || def[k][1],
      c: (p && typeof p.cost === 'number') ? p.cost : def[k][2],
      n: def[k][3]
    });
  }

  return out;
}

function cell(label, value, wide){
  return '<div class="pf-cell' + (wide ? ' wide' : '') + '">' +
         '<span>' + esc(label) + '</span>' +
         '<b>' + esc(value) + '</b></div>';
}

/* ---------- отрисовка ---------- */

function render(p){
  var isMe = (p.key === Profile.self());
  var deck = pieceDeck(p.deck);

  var sum = 0;
  for (var i = 0; i < deck.length; i++) sum += deck[i].c;
  var avg = deck.length ? (sum / deck.length).toFixed(1) : '0.0';

  var arena = Math.min(10, Math.max(1, p.arena || 1));
  var best  = Math.min(10, Math.max(1, p.best_arena || 1));

  var h = '';

  h += '<div class="pf-hero">';
  h += '<div class="pf-ava">👑</div>';
  h += '<div class="pf-name">' + esc(p.name || 'Игрок') + '</div>';
  h += '<div class="pf-tag">#' + esc(p.tag || '—') + '</div>';
  h += '<div class="pf-arena">Арена ' + arena + ': ' + esc(ARENAS[arena - 1]) + '</div>';
  h += '</div>';

  h += '<div class="pf-sec pf-purple">';
  h += '<div class="pf-sec-h">Лучший рекорд</div>';
  h += '<div class="pf-record"><span>🏆</span><b>' + num(p.max_cups) + '</b></div>';
  h += '<div class="pf-note">Максимум кубков за всё время</div>';
  h += '</div>';

  h += '<div class="pf-sec pf-blue">';
  h += '<div class="pf-sec-h">Боевая колода</div>';
  h += '<div class="pf-deck">';
  for (i = 0; i < deck.length; i++){
    h += '<div class="pf-card2" title="' + esc(deck[i].n) + '">' +
         esc(deck[i].g) + '<i>' + deck[i].c + '</i></div>';
  }
  h += '</div>';
  h += '<div class="pf-avg"><span>💧 Средние затраты эликсира</span><b>' + avg + '</b></div>';
  h += '</div>';

  h += '<div class="pf-sec pf-blue">';
  h += '<div class="pf-sec-h">Статистика</div>';
  h += '<div class="pf-grid">';
  h += cell('Победы', num(p.wins));
  h += cell('Поражения', num(p.losses));
  h += cell('Ничьи', num(p.draws));
  h += cell('Всего партий', num(p.games));
  h += cell('Кубки сейчас', num(p.cups));
  h += cell('Максимум кубков', num(p.max_cups));
  h += '</div></div>';

  h += '<div class="pf-sec pf-purple">';
  h += '<div class="pf-sec-h">Арены</div>';
  h += '<div class="pf-grid">';
  h += cell('Лучшая арена', best + ' · ' + ARENAS[best - 1], true);
  h += cell('Сейчас', arena + ' · ' + ARENAS[arena - 1], true);
  h += '</div></div>';

  h += '<div class="pf-sec pf-blue">';
  h += '<div class="pf-sec-h">Клан</div>';
  if (p.clan){
    h += '<div class="pf-clan">';
    h += '<div class="pf-clan-e">' + esc(p.clan.emblem || '🛡️') + '</div>';
    h += '<div style="flex:1;min-width:0">';
    h += '<div class="pf-clan-n">' + esc(p.clan.name) + ' <i>#' + esc(p.clan.tag || '—') + '</i></div>';
    h += '<div class="pf-clan-r">' +
         (p.clan.role === 'owner' ? 'Глава клана' : 'Участник') +
         ' · 🏆 ' + num(p.clan.cups) + '</div>';
    h += '</div></div>';
  } else {
    h += '<div class="pf-note">Не состоит в клане</div>';
  }
  h += '</div>';

  h += '<div class="pf-btns">';
  if (isMe){
    h += '<button id="pfNick">✏️ Ник</button>';
    h += '<button id="pfShare">📤 Поделиться</button>';
  } else {
    h += '<button id="pfPlay">⚔️ Вызвать</button>';
    h += '<button id="pfAdd">+ В друзья</button>';
    h += '<button id="pfShare">📤</button>';
  }
  h += '</div>';

  var box = document.getElementById('pfScroll');
  box.innerHTML = h;
  box.scrollTop = 0;

  bind(p, isMe);
}

function bind(p, isMe){
  var nick = document.getElementById('pfNick');
  if (nick){
    nick.onclick = function (){
      if (typeof Profile.onEditNick === 'function'){
        Profile.close();
        Profile.onEditNick();
      }
    };
  }

  var sh = document.getElementById('pfShare');
  if (sh) sh.onclick = function (){ shareProfile(p); };

  var pl = document.getElementById('pfPlay');
  if (pl){
    pl.onclick = async function (){
      if (!global.Friends) return;
      pl.disabled = true;
      var r = await global.Friends.invite(p.key, p.name, p.cups);
      pl.disabled = false;
      if (!r) return;
      setTimeout(function (){
        global.Friends.play(r.id, 'host', p.key, p.name, p.cups, r.arena);
      }, 400);
    };
  }

  var ad = document.getElementById('pfAdd');
  if (ad){
    ad.onclick = async function (){
      if (!global.Friends) return;
      var ok = await global.Friends.add(p.key, p.name);
      ad.textContent = ok ? '✓ В друзьях' : 'Ошибка';
      ad.disabled = true;
    };
  }
}

function shareProfile(p){
  var url = location.origin + location.pathname + '?player=' + encodeURIComponent(p.tag || p.key);
  var phrase = 'Мой профиль в Chess Royale — #' + (p.tag || '') +
               '. Кубки: ' + num(p.cups) + '. Заходи и вызывай на партию!';

  if (p.key !== Profile.self()){
    phrase = 'Профиль игрока ' + (p.name || '') + ' — #' + (p.tag || '') +
             ' в Chess Royale. Кубки: ' + num(p.cups) + '.';
  }

  var tg = global.Telegram && global.Telegram.WebApp;

  if (tg && tg.openTelegramLink){
    try {
      tg.openTelegramLink(
        'https://t.me/share/url?url=' + encodeURIComponent(url) +
        '&text=' + encodeURIComponent(phrase)
      );
      return;
    } catch (e){}
  }

  if (navigator.share){
    try {
      navigator.share({ title: 'Chess Royale', text: phrase, url: url }).catch(function(){});
      return;
    } catch (e){}
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(phrase + '\n' + url).then(function(){}).catch(function(){});
    }
  } catch (e){}
}

/* ---------- открытие ---------- */

Profile.open = async function (q){
  ensure();

  var box = document.getElementById('pfScroll');
  box.innerHTML = '<div class="pf-load">Загрузка профиля…</div>';
  document.getElementById('pfModal').classList.add('open');

  var res = null;
  try {
    res = await client().rpc('player_profile', { p_q: String(q || Profile.self()) });
  } catch (e){}

  if (!res || res.error || !res.data){
    box.innerHTML = '<div class="pf-load">Профиль не найден.<br>Проверь тег.</div>';
    return;
  }

  Profile.current = res.data;
  render(res.data);
};

Profile.close = function (){
  var m = document.getElementById('pfModal');
  if (m) m.classList.remove('open');
};

Profile.ensureStyles = ensure;

global.Profile = Profile;

/* автопривязка к бейджу с ником, если он есть на странице */
document.addEventListener('DOMContentLoaded', function (){
  var b = document.getElementById('profileBadge');
  if (b && !b.dataset.pfBound){
    b.dataset.pfBound = '1';
    b.onclick = function (){ Profile.open(Profile.self()); };
  }
});

/* ссылка ?player=TAG открывает профиль, если на странице нет своего поиска */
setTimeout(function (){
  if (document.getElementById('searchModal')) return;

  var p = new URLSearchParams(location.search);
  var tag = p.get('player');
  if (!tag) return;

  Profile.open(String(tag).replace(/^#/, ''));
  history.replaceState(null, '', location.pathname);
}, 800);

})(window);