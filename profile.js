/* ============================================================
   profile.js — публичный профиль игрока (VER 3)
   Profile.open(keyOrTag)  — открыть карточку любого игрока
   CopyShare.show(label, url, phrase) — скопировать и предложить «Поделиться»
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
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
}

/* ============================================================
   COPY + SHARE
   ============================================================ */

var CopyShare = {};
var csTimer = null;

CopyShare.copy = function (text){
  var ok = false;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch (e){}

  if (!ok){
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      ok = true;
    } catch (e){}
  }

  return ok;
};

CopyShare.shareLink = function (url, phrase){
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

  CopyShare.copy(phrase + '\n' + url);
  CopyShare.note('Ссылка скопирована');
};

CopyShare.note = function (text){
  var bar = document.getElementById('csBar');
  if (!bar) return;
  var t = document.getElementById('csTxt');
  if (t) t.textContent = text;
};

CopyShare.hide = function (){
  var bar = document.getElementById('csBar');
  if (bar) bar.classList.remove('show');
  if (csTimer){ clearTimeout(csTimer); csTimer = null; }
};

CopyShare.show = function (label, url, phrase){
  CopyShare.copy(label);

  var bar = document.getElementById('csBar');

  if (!bar){
    bar = document.createElement('div');
    bar.id = 'csBar';
    bar.innerHTML =
      '<span id="csTxt"></span>' +
      '<button id="csShare">📤 Поделиться</button>' +
      '<button id="csClose">✕</button>';
    document.body.appendChild(bar);

    bar.querySelector('#csClose').onclick = CopyShare.hide;
  }

  document.getElementById('csTxt').textContent = 'Скопировано ' + label;

  var sh = document.getElementById('csShare');
  sh.onclick = function (){ CopyShare.shareLink(url, phrase); };

  bar.classList.add('show');

  if (csTimer) clearTimeout(csTimer);
  csTimer = setTimeout(CopyShare.hide, 7000);
};

global.CopyShare = CopyShare;

/* ---------- стили ---------- */

var CSS = `
#pfModal{position:fixed;inset:0;z-index:2100;display:none;background:rgba(2,6,23,.94);
align-items:center;justify-content:center;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
#pfModal.open{display:flex}

#pfCard{position:relative;width:100%;max-width:440px;height:100dvh;display:flex;flex-direction:column;
overflow:hidden;background:#1b43a0;
background-image:
repeating-linear-gradient(45deg,rgba(255,255,255,.045) 0 2px,transparent 2px 30px),
repeating-linear-gradient(-45deg,rgba(255,255,255,.045) 0 2px,transparent 2px 30px)}

#pfTop{position:relative;flex:0 0 56px;display:flex;align-items:center;justify-content:center;
background:linear-gradient(180deg,#4ab3f8,#1b6fd6);border-bottom:3px solid #f7c948}
#pfCrown{position:absolute;top:-15px;left:50%;transform:translateX(-50%);font-size:36px;
filter:drop-shadow(0 4px 8px rgba(0,0,0,.55))}
#pfDia{position:absolute;left:14px;top:50%;transform:translateY(-50%) rotate(45deg);
width:13px;height:13px;border-radius:2px;background:linear-gradient(135deg,#ffe680,#eda200);
border:1px solid #8a5600}
#pfClose{position:absolute;right:10px;top:11px;width:34px;height:34px;border-radius:9px;
border:2px solid rgba(255,255,255,.9);background:linear-gradient(180deg,#f4665e,#c62828);
color:#fff;font-size:15px;font-weight:700;cursor:pointer;line-height:1;
box-shadow:0 3px 8px rgba(0,0,0,.4)}

#pfScroll{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;
padding:16px 0 26px;scrollbar-width:none}
#pfScroll::-webkit-scrollbar{display:none}

.pf-hero{text-align:center;padding:0 16px;margin-bottom:16px}
.pf-ava{width:76px;height:76px;margin:0 auto 10px;border-radius:50%;display:flex;
align-items:center;justify-content:center;font-size:38px;
background:linear-gradient(145deg,#ffe27a,#e39b00);border:3px solid #fff;
box-shadow:0 8px 20px rgba(0,0,0,.5)}
.pf-name{font-size:21px;font-weight:800;letter-spacing:.2px;color:#fff;
text-shadow:0 2px 6px rgba(0,0,0,.55);line-height:1.2}
.pf-tag{display:inline-block;margin-top:8px;font-size:13px;font-weight:800;letter-spacing:1px;
color:#2a1c00;background:linear-gradient(180deg,#ffe680,#f3b300);
padding:3px 14px;border-radius:9px;border:2px solid rgba(255,255,255,.85);cursor:pointer}
.pf-tag:active{transform:scale(.96)}
.pf-hint{margin-top:6px;font-size:10.5px;font-weight:600;color:#9fb9e8}
.pf-arena{margin-top:9px;font-size:12.5px;font-weight:600;color:#c6d8ff}

.pf-sec{margin:0 14px 15px;border-radius:16px;padding-bottom:12px;
box-shadow:0 8px 22px rgba(0,0,0,.28)}
.pf-purple{background:linear-gradient(180deg,#7d43c9,#56239b)}
.pf-blue{background:linear-gradient(180deg,#2f74d8,#1a4c9e)}

.pf-sec-h{display:flex;align-items:center;justify-content:center;gap:12px;
padding:11px 0 9px;font-size:13.5px;font-weight:800;letter-spacing:.4px;color:#fff;
text-shadow:0 1px 3px rgba(0,0,0,.45)}
.pf-sec-h::before,.pf-sec-h::after{content:"";width:44px;height:3px;border-radius:3px;
background:linear-gradient(90deg,#ffe066,#ffc400,#ffe066)}

.pf-record{display:flex;align-items:center;justify-content:center;gap:12px;margin:0 20px;
padding:11px;border-radius:12px;background:rgba(0,0,0,.26);
border:1px solid rgba(255,255,255,.15)}
.pf-record span{font-size:24px}
.pf-record b{font-size:28px;font-weight:800;color:#fff;letter-spacing:.5px;
font-variant-numeric:tabular-nums}
.pf-note{text-align:center;font-size:11.5px;font-weight:600;color:rgba(255,255,255,.78);
padding:9px 16px 4px;line-height:1.4}

.pf-deck{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;padding:2px 14px 0}
.pf-card2{position:relative;aspect-ratio:1/1.16;border-radius:11px;display:flex;
align-items:center;justify-content:center;background:linear-gradient(180deg,#9168ff,#5b2ec4);
border:2px solid #f7c948;box-shadow:inset 0 -12px 16px rgba(0,0,0,.25)}
.pf-glyph{font-size:29px;line-height:1;color:#fff;text-shadow:0 2px 5px rgba(0,0,0,.45)}
.pf-cost{position:absolute;right:3px;bottom:2px;font-style:normal;font-size:10px;
font-weight:800;color:#fff;background:rgba(0,0,0,.45);border-radius:6px;padding:1px 5px;
font-variant-numeric:tabular-nums}

.pf-avg{margin:11px 14px 0;padding:9px 12px;border-radius:11px;background:rgba(0,0,0,.28);
font-size:12px;font-weight:700;color:#fff;display:flex;justify-content:space-between;
align-items:center;letter-spacing:.2px}
.pf-avg b{color:#ffd84d;font-size:14px;font-variant-numeric:tabular-nums}

.pf-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 14px 0}
.pf-cell{background:linear-gradient(180deg,#f6f8ff,#dee4f8);border-radius:11px;padding:9px 11px;
box-shadow:inset 0 -2px 0 rgba(20,30,70,.1)}
.pf-cell span{display:block;font-size:10.5px;font-weight:700;color:#6b5fa8;
letter-spacing:.15px;margin-bottom:3px;line-height:1.2}
.pf-cell b{display:block;font-size:23px;font-weight:800;color:#16224a;line-height:1.1;
font-variant-numeric:tabular-nums;letter-spacing:.2px}
.pf-cell.wide b{font-size:13.5px;font-weight:700;line-height:1.3}

.pf-clan{display:flex;align-items:center;gap:12px;padding:12px 14px 0}
.pf-clan-e{width:48px;height:48px;border-radius:13px;display:flex;align-items:center;
justify-content:center;font-size:25px;background:linear-gradient(145deg,#ffe27a,#e39b00);
border:2px solid rgba(255,255,255,.9);flex-shrink:0}
.pf-clan-n{font-size:14.5px;font-weight:800;color:#fff;line-height:1.25}
.pf-clan-n i{font-style:normal;font-size:12px;font-weight:800;color:#ffd84d;margin-left:4px}
.pf-clan-r{font-size:11.5px;font-weight:600;color:#c6d8ff;margin-top:4px}

.pf-btns{display:flex;gap:10px;padding:2px 14px 0}
.pf-btns button{flex:1;padding:14px 6px;border-radius:13px;border:2px solid rgba(255,255,255,.35);
font-size:13px;font-weight:800;color:#fff;cursor:pointer;letter-spacing:.2px}
#pfPlay{background:linear-gradient(180deg,#5ddc7a,#1f9e42)}
#pfAdd{background:linear-gradient(180deg,#5ea8ff,#1e63c8)}
#pfNick{background:linear-gradient(180deg,#9168ff,#5b2ec4)}
#pfShare{background:linear-gradient(180deg,#9168ff,#5b2ec4)}

.pf-load{padding:70px 24px;text-align:center;color:#c6d8ff;font-size:13.5px;
font-weight:600;line-height:1.6}

#csBar{position:fixed;left:50%;bottom:86px;transform:translate(-50%,14px);
display:none;align-items:center;gap:8px;padding:9px 10px 9px 14px;
background:linear-gradient(145deg,#1e293b,#0f172a);border:2px solid #475569;
border-radius:13px;box-shadow:0 12px 30px rgba(0,0,0,.6);z-index:2400;
max-width:calc(100vw - 24px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
#csBar.show{display:flex;animation:csUp .18s ease-out forwards}
@keyframes csUp{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}
#csTxt{font-size:11.5px;font-weight:800;color:#94a3b8;white-space:nowrap;
overflow:hidden;text-overflow:ellipsis;max-width:44vw}
#csShare{border:0;border-radius:9px;padding:9px 12px;font-size:11.5px;font-weight:900;
color:#fff;background:linear-gradient(180deg,#5ea8ff,#1e63c8);cursor:pointer;white-space:nowrap}
#csClose{border:0;border-radius:9px;width:32px;height:32px;font-size:12px;font-weight:900;
color:#94a3b8;background:#0f172a;cursor:pointer;flex-shrink:0}
`;

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
    ['pawn',   '♙', 1],
    ['knight', '♘', 3],
    ['bishop', '♗', 3],
    ['rook',   '♖', 5],
    ['queen',  '♕', 9],
    ['king',   '♔', 1]
  ];

  for (var k = 0; k < def.length; k++){
    var t = def[k][0];
    var p = P ? P[t] : null;
    out.push({
      g: (p && p.w) || def[k][1],
      c: (p && typeof p.cost === 'number') ? p.cost : def[k][2]
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
  h += '<div class="pf-tag" id="pfTag">#' + esc(p.tag || '—') + '</div>';
  h += '<div class="pf-hint">Нажми на тег, чтобы скопировать</div>';
  h += '<div class="pf-arena">Арена ' + arena + ' · ' + esc(ARENAS[arena - 1]) + '</div>';
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
         '<span class="pf-glyph">' + esc(deck[i].g) + '</span>' +
         '<i class="pf-cost">' + deck[i].c + '</i></div>';
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
  }
  h += '</div>';

  var box = document.getElementById('pfScroll');
  box.innerHTML = h;
  box.scrollTop = 0;

  bind(p, isMe);
}

function bind(p, isMe){
  var tagEl = document.getElementById('pfTag');
  if (tagEl){
    tagEl.onclick = function (){
      var code = p.tag || '';
      if (!code) return;
      var url = location.origin + location.pathname + '?player=' + encodeURIComponent(code);
      var phrase = (p.key === Profile.self())
        ? 'Мой профиль в Chess Royale — #' + code + '. Кубки: ' + num(p.cups) + '. Заходи и вызывай на партию!'
        : 'Профиль ' + (p.name || 'игрока') + ' — #' + code + ' в Chess Royale. Кубки: ' + num(p.cups) + '.';
      CopyShare.show('#' + code, url, phrase);
    };
  }

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
  var phrase = (p.key === Profile.self())
    ? 'Мой профиль в Chess Royale — #' + (p.tag || '') + '. Кубки: ' + num(p.cups) + '. Заходи и вызывай на партию!'
    : 'Профиль ' + (p.name || 'игрока') + ' — #' + (p.tag || '') + ' в Chess Royale. Кубки: ' + num(p.cups) + '.';

  CopyShare.shareLink(url, phrase);
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

/* бейдж с ником на любой странице */
document.addEventListener('DOMContentLoaded', function (){
  var b = document.getElementById('profileBadge');
  if (b && !b.dataset.pfBound){
    b.dataset.pfBound = '1';
    b.onclick = function (){ Profile.open(Profile.self()); };
  }
});

/* ссылка ?player=TAG */
setTimeout(function (){
  if (document.getElementById('searchModal')) return;

  var p = new URLSearchParams(location.search);
  var tag = p.get('player');
  if (!tag) return;

  Profile.open(String(tag).replace(/^#/, ''));
  history.replaceState(null, '', location.pathname);
}, 800);

})(window);