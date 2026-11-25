/* ============================================================================
   exercises.js — Sport Royale · модуль тренировок и аналитики
   Версия 1.0.0
   ----------------------------------------------------------------------------
   Подключать ПОСЛЕ app.js:
       <script src="exercises.js"></script>
   Файл ничего не переопределяет в app.js / index.html.
   Работает с: window.currentProfileData | window.cachedProfile
   Хранит данные в профиле: customExercises / workoutLists / workoutSessions
   ========================================================================== */
(function () {
  'use strict';

  if (window.__SRX_LOADED__) return;
  window.__SRX_LOADED__ = true;

  var VERSION = '1.0.0';
  var LS = {
    draft: 'srx_draft',
    settings: 'srx_settings',
    last: 'srx_last_profile'
  };

  /* ==========================================================================
     1. УТИЛИТЫ
     ========================================================================== */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var n = parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/\s/g, ''));
    return isFinite(n) ? n : 0;
  }
  function ymd(d) {
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var dd = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + dd;
  }
  function todayISO() { return ymd(new Date()); }
  function parseYmd(s) {
    var p = String(s).split('-');
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }
  function daysAgoYmd(n) { var d = new Date(); d.setDate(d.getDate() - n); return ymd(d); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mmss(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function humanDur(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (h) return h + ' ч ' + m + ' мин';
    return m + ' мин';
  }
  function round1(v) { return Math.round(v * 10) / 10; }

  /* ==========================================================================
     2. ДОСТУП К ПРОФИЛЮ И СОХРАНЕНИЕ
     ========================================================================== */
  var PROFILE_GETTERS = ['currentProfileData', 'cachedProfile', 'profileData', 'currentProfile'];

  function getProfile() {
    try {
      if (typeof currentProfileData !== 'undefined' && currentProfileData && typeof currentProfileData === 'object') {
        return currentProfileData;
      }
    } catch (e) { /* app.js ещё не инициализировал переменную */ }
    for (var i = 0; i < PROFILE_GETTERS.length; i++) {
      var p = window[PROFILE_GETTERS[i]];
      if (p && typeof p === 'object' && !Array.isArray(p)) return p;
    }
    try {
      var c = JSON.parse(localStorage.getItem('cachedProfile') || 'null');
      if (c && typeof c === 'object' && !Array.isArray(c)) return c;
    } catch (e) { /* повреждённый JSON */ }
    return null;
  }

  /* Функции сохранения, которые может экспортировать app.js.
     Вызываем только те, что не требуют аргументов — чтобы не сломать подпись. */
  /* app.js saveProfile() не трогаем: она читает поля формы профиля и показывает алерт. */
  var SAVE_FNS = [
    'saveProfileData', 'persistProfile', 'persistProfileData',
    'syncProfile', 'pushProfile', 'saveCurrentProfile', 'updateProfileData',
    'saveUserProfile', 'syncToSupabase', 'saveProfileToSupabase', 'pushToCloud'
  ];

  function persist(silent) {
    var p = getProfile();
    if (!p) return false;

    try { localStorage.setItem(LS.draft, JSON.stringify({
      ts: Date.now(), profile: p
    })); } catch (e) {
      toast('Не хватает места в памяти телефона: видео упражнения не сохранилось. Выбери файл поменьше.');
      return false;
    }

    try { localStorage.setItem('cachedProfile', JSON.stringify(p)); } catch (e) { /* quota */ }

    var called = [];
    if (typeof window.saveProgressToCloud === 'function') {
      try {
        var xp = Number(localStorage.getItem('cachedXP') || 0);
        var burned = Number(localStorage.getItem('cachedBurned') || 0);
        var sr = window.saveProgressToCloud(null, null, null, p, xp, burned);
        if (sr && typeof sr.catch === 'function') {
          sr.catch(function (err) { console.warn('[SRX] cloud save rejected:', err && err.message); });
        }
        called.push('saveProgressToCloud');
      } catch (e) {
        console.warn('[SRX] cloud save failed:', e && e.message);
      }
    }
    for (var i = 0; i < SAVE_FNS.length; i++) {
      var name = SAVE_FNS[i];
      var fn = window[name];
      if (typeof fn !== 'function') continue;
      if (fn.length > 0) continue;            // требует аргументов — не трогаем
      try {
        var r = fn();
        if (r && typeof r.catch === 'function') {
          r.catch(function (err) { console.warn('[SRX] cloud save rejected:', err && err.message); });
        }
        called.push(name);
      } catch (e) {
        console.warn('[SRX] save fn "' + name + '" failed:', e && e.message);
      }
    }

    try {
      window.dispatchEvent(new CustomEvent('srx:profile-changed', { detail: { fns: called } }));
    } catch (e) {}

    if (!silent && !called.length) {
      toast('Локально сохранено. Облачная синхронизация — при следующем сохранении профиля.');
    }
    return true;
  }

  /* ==========================================================================
     3. СХЕМА ДАННЫХ
     ========================================================================== */
  var K = {
    ex: 'customExercises',
    lists: 'workoutLists',
    sessions: 'workoutSessions'
  };

  function ensureSchema(p) {
    if (!p) return null;
    if (!Array.isArray(p[K.ex])) p[K.ex] = [];
    if (!Array.isArray(p[K.lists])) p[K.lists] = [];
    if (!Array.isArray(p[K.sessions])) p[K.sessions] = [];
    return p;
  }

  function profileData() {
    var p = getProfile();
    if (!p) return null;
    return ensureSchema(p);
  }

  function customExercises() { var p = profileData(); return p ? p[K.ex] : []; }
  function workoutLists() { var p = profileData(); return p ? p[K.lists] : []; }
  function sessions() {
    var p = profileData(); if (!p) return [];
    return p[K.sessions].slice().sort(function (a, b) {
      return String(b.startedAt || '').localeCompare(String(a.startedAt || ''));
    });
  }

  /* ==========================================================================
     4. БАЗА УПРАЖНЕНИЙ (встроенная)
     ========================================================================== */
  var MUSCLES = ['Грудь', 'Спина', 'Ноги', 'Плечи', 'Руки', 'Пресс', 'Кардио', 'Всё тело'];

  var BUILTIN = [
    { id: 'b_bench',      name: 'Жим штанги лёжа',        group: 'Грудь',  met: 5.0,  icon: '🏋️' },
    { id: 'b_pushup',     name: 'Отжимания',              group: 'Грудь',  met: 8.0,  icon: '💪' },
    { id: 'b_dips',       name: 'Брусья',                 group: 'Грудь',  met: 6.0,  icon: '💪' },
    { id: 'b_pullup',     name: 'Подтягивания',           group: 'Спина',  met: 8.0,  icon: '🧗' },
    { id: 'b_row',        name: 'Тяга штанги в наклоне',  group: 'Спина',  met: 5.5,  icon: '🏋️' },
    { id: 'b_latpull',    name: 'Тяга верхнего блока',    group: 'Спина',  met: 5.0,  icon: '🏋️' },
    { id: 'b_deadlift',   name: 'Становая тяга',          group: 'Спина',  met: 6.0,  icon: '🏋️' },
    { id: 'b_squat',      name: 'Приседания со штангой',  group: 'Ноги',   met: 6.0,  icon: '🦵' },
    { id: 'b_lunge',      name: 'Выпады',                 group: 'Ноги',   met: 5.0,  icon: '🦵' },
    { id: 'b_legpress',   name: 'Жим ногами',             group: 'Ноги',   met: 5.0,  icon: '🦵' },
    { id: 'b_calf',       name: 'Подъёмы на носки',       group: 'Ноги',   met: 4.0,  icon: '🦶' },
    { id: 'b_ohp',        name: 'Жим стоя / гантели',     group: 'Плечи',  met: 5.0,  icon: '🏋️' },
    { id: 'b_raises',     name: 'Махи гантелями',         group: 'Плечи',  met: 4.5,  icon: '🏋️' },
    { id: 'b_curl',       name: 'Подъём на бицепс',       group: 'Руки',   met: 4.0,  icon: '💪' },
    { id: 'b_triext',     name: 'Разгибание на трицепс',  group: 'Руки',   met: 4.0,  icon: '💪' },
    { id: 'b_plank',      name: 'Планка',                 group: 'Пресс',  met: 4.0,  icon: '🧘' },
    { id: 'b_crunch',     name: 'Скручивания',            group: 'Пресс',  met: 4.0,  icon: '🧘' },
    { id: 'b_legraise',   name: 'Подъём ног лёжа',        group: 'Пресс',  met: 4.5,  icon: '🧘' },
    { id: 'b_running',    name: 'Бег',                    group: 'Кардио', met: 9.8,  icon: '🏃' },
    { id: 'b_walk',       name: 'Ходьба',                 group: 'Кардио', met: 3.5,  icon: '🚶' },
    { id: 'b_bike',       name: 'Велотренажёр',           group: 'Кардио', met: 7.5,  icon: '🚴' },
    { id: 'b_rope',       name: 'Скакалка',               group: 'Кардио', met: 11.0, icon: '🪢' },
    { id: 'b_burpee',     name: 'Бёрпи',                  group: 'Всё тело', met: 10.0, icon: '🔥' },
    { id: 'b_kettlebell', name: 'Гиря / махи',            group: 'Всё тело', met: 9.0,  icon: '🔔' }
  ];

  function allExercises() {
    var custom = customExercises().map(function (e) {
      return {
        id: e.id, name: e.name, group: e.group || 'Всё тело',
        met: num(e.met) || 5, icon: e.icon || '⭐',
        photo: e.photo || null, video: e.video || null, note: e.note || '',
        mode: e.mode, timeSec: num(e.timeSec) || 0, reps: num(e.reps) || 0, custom: true
      };
    });
    return BUILTIN.map(function (e) {
      return { id: e.id, name: e.name, group: e.group, met: e.met, icon: e.icon, photo: null, custom: false };
    }).concat(custom);
  }

  function findExercise(id) {
    var list = allExercises();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ==========================================================================
     5. ДНЕВНЫЕ ЛОГИ ПРИЛОЖЕНИЯ (гибкое чтение)
     ========================================================================== */
  var DAY_KEYS = ['days', 'log', 'logs', 'daysLog', 'history', 'entries', 'diary', 'daily', 'mealsByDay'];
  var ALIAS = {
    eaten:  ['calories', 'kcal', 'kcalEaten', 'caloriesEaten', 'eaten', 'totalCalories', 'kkal', 'caloriesIn'],
    burned: ['burned', 'caloriesBurned', 'kcalBurned', 'burn', 'activityCalories', 'spent', 'caloriesOut'],
    water:  ['water', 'waterMl', 'water_ml', 'waterAmount', 'ml', 'waterMlTotal'],
    weight: ['weight', 'weightKg', 'mass', 'ves']
  };

  function pickField(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (v != null && v !== '' && !(typeof v === 'object')) {
        var n = num(v);
        if (n || v === 0 || v === '0') return n;
      }
    }
    return null;
  }

  function sumFoodArray(arr) {
    if (!Array.isArray(arr)) return null;
    var total = 0, any = false;
    arr.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var v = pickField(it, ['calories', 'kcal', 'kkal', 'cal', 'energy']);
      if (v == null && it.weight && it.kcalPer100) v = num(it.weight) * num(it.kcalPer100) / 100;
      if (v != null) { total += v; any = true; }
    });
    return any ? total : null;
  }

  function dayLogsMap() {
    var p = getProfile(), out = {};
    if (!p) return out;

    for (var i = 0; i < DAY_KEYS.length; i++) {
      var src = p[DAY_KEYS[i]];
      if (!src) continue;

      if (Array.isArray(src)) {
        src.forEach(function (it) {
          if (!it || typeof it !== 'object') return;
          var d = it.date || it.day || it.d || it.id;
          if (!d) return;
          out[String(d).slice(0, 10)] = it;
        });
      } else if (typeof src === 'object') {
        Object.keys(src).forEach(function (k) {
          if (!/^\d{4}-\d{2}-\d{2}/.test(k)) return;
          var v = src[k];
          if (v && typeof v === 'object') out[k.slice(0, 10)] = v;
        });
      }
      if (Object.keys(out).length) break;
    }
    return out;
  }

  function sessionKcalByDay() {
    var map = {};
    sessions().forEach(function (s) {
      var d = String(s.date || s.startedAt || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      map[d] = (map[d] || 0) + (num(s.kcal) || 0);
    });
    return map;
  }

  /* Единая серия по диапазону дат */
  function buildSeries(fromYmd, toYmd) {
    var logs = dayLogsMap();
    var extraBurn = sessionKcalByDay();
    var out = [];
    var start = parseYmd(fromYmd), end = parseYmd(toYmd);
    if (start > end) { var t = start; start = end; end = t; }
    var guard = 0;

    for (var d = new Date(start); d <= end && guard < 800; d.setDate(d.getDate() + 1), guard++) {
      var key = ymd(d);
      var rec = logs[key] || null;

      var eaten = pickField(rec, ALIAS.eaten);
      if (eaten == null && rec) {
        eaten = sumFoodArray(rec.food || rec.meals || rec.items || rec.products);
      }

      var burned = pickField(rec, ALIAS.burned);
      burned = (burned || 0) + (extraBurn[key] || 0);

      out.push({
        date: key,
        eaten: eaten || 0,
        burned: burned || 0,
        water: pickField(rec, ALIAS.water) || 0,
        weight: pickField(rec, ALIAS.weight) || 0,
        hasEaten: eaten != null,
        hasBurned: !!burned,
        hasWater: pickField(rec, ALIAS.water) != null,
        hasWeight: pickField(rec, ALIAS.weight) != null
      });
    }
    return out;
  }

  function pearson(xs, ys) {
    var n = Math.min(xs.length, ys.length);
    if (n < 3) return null;
    var i, sx = 0, sy = 0;
    for (i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    var mx = sx / n, my = sy / n, a = 0, b = 0, c = 0;
    for (i = 0; i < n; i++) {
      var dx = xs[i] - mx, dy = ys[i] - my;
      a += dx * dy; b += dx * dx; c += dy * dy;
    }
    if (!b || !c) return null;
    return a / Math.sqrt(b * c);
  }

  function corrLabel(r) {
    if (r == null) return 'мало данных';
    var a = Math.abs(r), dir = r >= 0 ? 'прямая' : 'обратная';
    if (a >= 0.7) return 'сильная ' + dir;
    if (a >= 0.4) return 'умеренная ' + dir;
    if (a >= 0.2) return 'слабая ' + dir;
    return 'связи нет';
  }

  /* ==========================================================================
     6. КАЛОРИИ ТРЕНИРОВКИ
     ========================================================================== */
  function userWeight() {
    var p = getProfile();
    if (p) {
      var w = num(p.weight || p.weightKg || p.mass);
      if (w > 25 && w < 350) return w;
    }
    var logs = dayLogsMap();
    var keys = Object.keys(logs).sort().reverse();
    for (var i = 0; i < keys.length; i++) {
      var v = pickField(logs[keys[i]], ALIAS.weight);
      if (v && v > 25 && v < 350) return v;
    }
    return 70;
  }

  /* kcal = MET * 3.5 * kg / 200 * минуты */
  function kcalFor(met, minutes, kg) {
    if (!met || !minutes) return 0;
    return met * 3.5 * (kg || 70) / 200 * minutes;
  }

  /* ==========================================================================
     7. ИЗОБРАЖЕНИЯ
     ========================================================================== */
  function compressImage(file, maxSide, quality, cb) {
    maxSide = maxSide || 480;
    quality = quality || 0.72;
    if (!file || !/^image\//.test(file.type)) { cb(null, 'Не изображение'); return; }

    var reader = new FileReader();
    reader.onerror = function () { cb(null, 'Ошибка чтения файла'); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { cb(null, 'Ошибка декодирования'); };
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          var s = Math.min(1, maxSide / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          var data = cv.toDataURL('image/jpeg', quality);
          if (data.length > 340000) {
            data = cv.toDataURL('image/jpeg', 0.5);
          }
          cb(data, null);
        } catch (e) { cb(null, 'Не удалось обработать'); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ==========================================================================
     8. ЗВУК
     ========================================================================== */
  var actx = null;
  function beep(freq, ms, vol) {
    try {
      if (!actx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        actx = new AC();
      }
      if (actx.state === 'suspended') actx.resume();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine';
      o.frequency.value = freq || 880;
      g.gain.value = vol == null ? 0.14 : vol;
      o.connect(g); g.connect(actx.destination);
      var t = actx.currentTime;
      o.start(t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (ms || 160) / 1000);
      o.stop(t + (ms || 160) / 1000 + 0.02);
    } catch (e) {}
  }

  /* ==========================================================================
     9. СТИЛИ
     ========================================================================== */
  var CSS = [
    '.srx-root{position:fixed;inset:0;z-index:9998;display:none;flex-direction:column;',
    'background:#0b0f14;color:#e8eef5;font-family:inherit;-webkit-tap-highlight-color:transparent}',
    '.srx-root.open{display:flex}',
    '.srx-head{display:flex;align-items:center;gap:10px;padding:14px 14px 12px;',
    'background:linear-gradient(180deg,#141b23,#0b0f14);border-bottom:1px solid #1e2833}',
    '.srx-head h2{margin:0;font-size:17px;font-weight:700;flex:1;letter-spacing:.2px}',
    '.srx-x{width:36px;height:36px;border-radius:10px;border:1px solid #24303d;background:#151d26;',
    'color:#cbd6e2;font-size:18px;line-height:1;cursor:pointer}',
    '.srx-x:active{transform:scale(.96)}',
    '.srx-body{flex:1;overflow-y:auto;padding:14px 14px 110px;-webkit-overflow-scrolling:touch}',
    '.srx-card{background:#121a22;border:1px solid #1e2833;border-radius:14px;padding:14px;margin-bottom:12px}',
    '.srx-card h3{margin:0 0 10px;font-size:14px;font-weight:700;color:#9fb0c2;text-transform:uppercase;letter-spacing:.6px}',
    '.srx-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;',
    'padding:11px 14px;border-radius:11px;border:1px solid #26323f;background:#182230;color:#e8eef5;',
    'font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}',
    '.srx-btn:active{transform:scale(.98)}',
    '.srx-btn.primary{background:linear-gradient(135deg,#f97316,#ea580c);border-color:#f97316;color:#fff}',
    '.srx-btn.green{background:linear-gradient(135deg,#22c55e,#16a34a);border-color:#22c55e;color:#06210f}',
    '.srx-btn.ghost{background:transparent}',
    '.srx-btn.danger{background:#2a1417;border-color:#5b1f26;color:#ff8a95}',
    '.srx-btn.sm{padding:7px 10px;font-size:12.5px;border-radius:9px}',
    '.srx-row{display:flex;gap:8px;align-items:center}',
    '.srx-row.wrap{flex-wrap:wrap}',
    '.srx-grow{flex:1;min-width:0}',
    '.srx-muted{color:#7d8ea3;font-size:12.5px}',
    '.srx-input,.srx-select,.srx-textarea{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;',
    'border:1px solid #24303d;background:#0e151c;color:#e8eef5;font-size:14px;font-family:inherit;outline:none}',
    '.srx-input:focus,.srx-select:focus,.srx-textarea:focus{border-color:#f97316}',
    '.srx-label{display:block;font-size:12px;color:#8b9cb0;margin:10px 0 6px;font-weight:600}',
    '.srx-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.srx-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}',
    '.srx-empty{text-align:center;padding:34px 14px;color:#6c7d90;font-size:13.5px;line-height:1.6}',
    '.srx-list-item{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #1a232d}',
    '.srx-list-item:last-child{border-bottom:0}',
    '.srx-thumb{width:44px;height:44px;border-radius:11px;object-fit:cover;background:#1a232d;flex:0 0 auto;',
    'display:flex;align-items:center;justify-content:center;font-size:20px;overflow:hidden}',
    '.srx-name{font-size:14.5px;font-weight:600;line-height:1.25}',
    '.srx-sub{font-size:12px;color:#7d8ea3;margin-top:2px}',
    '.srx-ex-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.srx-ex-card{background:#121a22;border:1px solid #1e2833;border-radius:13px;overflow:hidden;cursor:pointer}',
    '.srx-ex-card:active{transform:scale(.985)}',
    '.srx-ex-photo{width:100%;height:96px;object-fit:cover;display:block;background:#182230}',
    '.srx-ex-photo.ph{display:flex;align-items:center;justify-content:center;font-size:30px;color:#2f3d4c}',
    '.srx-ex-info{padding:8px 10px 10px}',
    '.srx-chips{display:flex;gap:6px;overflow-x:auto;padding:2px 0 8px;scrollbar-width:none}',
    '.srx-chips::-webkit-scrollbar{display:none}',
    '.srx-chip{flex:0 0 auto;padding:7px 12px;border-radius:999px;border:1px solid #26323f;background:#141d26;',
    'color:#9fb0c2;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit}',
    '.srx-chip.on{background:#f97316;border-color:#f97316;color:#fff}',
    '.srx-timer{text-align:center;padding:8px 0 4px}',
    '.srx-phase{font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#f97316}',
    '.srx-phase.rest{color:#38bdf8}.srx-phase.prep{color:#a78bfa}.srx-phase.done{color:#22c55e}',
    '.srx-clock{font-size:64px;font-weight:800;line-height:1.05;letter-spacing:-2px;',
    'font-variant-numeric:tabular-nums;margin:6px 0}',
    '.srx-progress{height:7px;border-radius:99px;background:#1b2530;overflow:hidden;margin:12px 0 6px}',
    '.srx-progress > i{display:block;height:100%;width:0;border-radius:99px;',
    'background:linear-gradient(90deg,#f97316,#fbbf24);transition:width .25s linear}',
    '.srx-chart-box{position:relative;height:230px;margin-top:6px}',
    '.srx-kpi{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.srx-kpi > div{background:#0e151c;border:1px solid #1c2632;border-radius:12px;padding:11px 12px}',
    '.srx-kpi b{display:block;font-size:19px;font-weight:800;margin-top:3px}',
    '.srx-kpi span{font-size:11.5px;color:#7d8ea3;text-transform:uppercase;letter-spacing:.5px}',
    '.srx-modal{position:fixed;inset:0;z-index:10000;display:none;align-items:flex-end;',
    'background:rgba(3,7,12,.72);backdrop-filter:blur(3px)}',
    '.srx-modal.open{display:flex}',
    '.srx-sheet{width:100%;max-height:88vh;overflow-y:auto;background:#101821;border-radius:18px 18px 0 0;',
    'border-top:1px solid #24303d;padding:16px 16px 26px;animation:srx-up .18s ease-out}',
    '@keyframes srx-up{from{transform:translateY(24px);opacity:.4}to{transform:none;opacity:1}}',
    '.srx-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);',
    'background:#182230;border:1px solid #2a3746;color:#e8eef5;padding:11px 16px;border-radius:11px;',
    'font-size:13px;z-index:10001;opacity:0;transition:.22s;max-width:88vw;text-align:center}',
    '.srx-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}',
    '.srx-dash-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:10px;',
    'background:#182230;border:1px solid #26323f;color:#e8eef5;font-size:13px;font-weight:600;',
    'cursor:pointer;font-family:inherit}',
    '.srx-dash-btn:active{transform:scale(.97)}',
    '.srx-emoji-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:6px}',
    '.srx-emoji-btn{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:22px;',
    'background:#141d26;border:1px solid #26323f;border-radius:11px;cursor:pointer}',
    '.srx-emoji-btn.on{border-color:#f97316;background:#2a1a0e}'
  ].join('');

  function injectCSS() {
    if ($('#srx-style')) return;
    var st = document.createElement('style');
    st.id = 'srx-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ==========================================================================
     10. TOAST
     ========================================================================== */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'srx-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 2600);
  }

  /* ==========================================================================
     11. ОБОЛОЧКА UI
     ========================================================================== */
  var root = null, headTitle = null, bodyEl = null;
  var state = { view: 'lists', params: {} };
  var chartRegistry = [];

  function buildShell() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'srx-root';
    root.id = 'srx-root';
    root.innerHTML =
      '<div class="srx-head">' +
        '<button class="srx-x" data-act="close">✕</button>' +
        '<h2 data-ref="title">Тренировки</h2>' +
        '<button class="srx-x" data-act="library" title="Упражнения">📚</button>' +
      '</div>' +
      '<div class="srx-chips srx-tabs" data-ref="tabs" style="padding:8px 14px 0">' +
        '<button class="srx-chip" data-act="tab" data-tab="lists">🏋️ Тренировки</button>' +
        '<button class="srx-chip" data-act="tab" data-tab="analysis">📊 Анализ</button>' +
        '<button class="srx-chip" data-act="tab" data-tab="library">📚 Упражнения</button>' +
        '<button class="srx-chip" data-act="timerPage">⏱ Таймер</button>' +
      '</div>' +
      '<div class="srx-body" data-ref="body"></div>';
    document.body.appendChild(root);
    headTitle = $('[data-ref="title"]', root);
    bodyEl = $('[data-ref="body"]', root);

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
  }

  function openRoot(view, params) {
    buildShell();
    root.classList.add('open');
    document.body.style.overflow = 'hidden';
    go(view || 'lists', params || {});
  }

  function closeRoot() {
    if (!root) return;
    root.classList.remove('open');
    document.body.style.overflow = '';
    destroyCharts();
    stopTimer(true);
  }

  function go(view, params) {
    state.view = view;
    state.params = params || {};
    updateTabs();
    destroyCharts();
    render();
    if (bodyEl) bodyEl.scrollTop = 0;
  }

  function updateTabs() {
    var tabs = $('[data-ref="tabs"]', root);
    if (!tabs) return;
    var main = state.view === 'lists' || state.view === 'analysis' || state.view === 'library';
    tabs.style.display = main ? '' : 'none';
    var cur = state.view;
    Array.prototype.forEach.call(tabs.children, function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === cur);
    });
  }

  function destroyCharts() {
    chartRegistry.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    chartRegistry = [];
  }

  function setTitle(t) { if (headTitle) headTitle.textContent = t; }

  function render() {
    if (!bodyEl) return;
    var v = state.view;
    if (v === 'lists') return renderLists();
    if (v === 'library') return renderLibrary();
    if (v === 'listEdit') return renderListEdit(state.params.id);
    if (v === 'community') return renderCommunity();
    if (v === 'run') return renderRun();
    if (v === 'analysis') return renderAnalysis();
    if (v === 'session') return renderSession(state.params.id);
    renderLists();
  }

  /* ==========================================================================
     12. ЭКРАН: СПИСКИ ТРЕНИРОВОК
     ========================================================================== */
  function renderLists() {
    setTitle('Тренировки');
    var lists = workoutLists();
    var html = '';

    html += '<div class="srx-kpi" style="margin-bottom:14px">' +
      '<div><span>Тренировок</span><b>' + sessions().length + '</b></div>' +
      '<div><span>Списков</span><b>' + lists.length + '</b></div>' +
      '</div>';

    html += '<div class="srx-row" style="margin-bottom:8px">' +
      '<button class="srx-btn primary srx-grow" data-act="newList">＋ Создать свою тренировку</button>' +
      '</div>' +
      '<div class="srx-row" style="margin-bottom:12px">' +
      '<button class="srx-btn ghost srx-grow" data-act="openCommunity">🌍 Тренировки сообщества</button>' +
      '</div>';
    if (lists.length) {
      html += '<input class="srx-input" data-ref="listsQ" placeholder="Поиск по моим тренировкам" value="' +
        esc(listsQuery) + '" style="margin-bottom:12px">';
    }

    if (!lists.length) {
      html += '<div class="srx-empty">Списков пока нет.<br>Создай первый — и добавь в него упражнения из библиотеки.</div>';
    } else {
      html += '<div class="srx-card"><h3>Мои списки</h3>';
      var lq = listsQuery.trim().toLowerCase();
      var shown = lists.filter(function (l) {
        return !lq || String(l.name || '').toLowerCase().indexOf(lq) !== -1;
      });
      if (!shown.length) html += '<div class="srx-muted" style="padding:8px 0">Ничего не найдено.</div>';
      shown.forEach(function (l) {
        var count = (l.items || []).length;
        var totalMin = (l.items || []).reduce(function (a, it) {
          var sets = num(it.sets) || 1;
          var work = (num(it.timeSec) || 40) * sets;
          var rest = (num(it.restSec) || 20) * Math.max(0, sets - 1);
          return a + work + rest;
        }, 0) / 60;

        html += '<div class="srx-list-item">' +
          '<div class="srx-thumb">🏋️</div>' +
          '<div class="srx-grow">' +
            '<div class="srx-name">' + esc(l.name || 'Без названия') + '</div>' +
            '<div class="srx-sub">' + count + ' упр. · ~' + Math.round(totalMin) + ' мин</div>' +
          '</div>' +
          '<button class="srx-btn sm green" data-act="startList" data-id="' + esc(l.id) + '">▶</button>' +
          '<button class="srx-btn sm" data-act="editList" data-id="' + esc(l.id) + '">✎</button>' +
          '</div>';
      });
      html += '</div>';
    }

    var hist = sessions().slice(0, 8);
    if (hist.length) {
      html += '<div class="srx-card"><h3>Последние тренировки</h3>';
      hist.forEach(function (s) {
        html += '<div class="srx-list-item">' +
          '<div class="srx-thumb">✅</div>' +
          '<div class="srx-grow">' +
            '<div class="srx-name">' + esc(s.listName || 'Тренировка') + '</div>' +
            '<div class="srx-sub">' + esc(String(s.date || '').slice(0, 10)) + ' · ' +
              humanDur(s.durationSec || 0) + ' · ' + Math.round(num(s.kcal)) + ' ккал</div>' +
          '</div>' +
          '<button class="srx-btn sm ghost" data-act="openSession" data-id="' + esc(s.id) + '">›</button>' +
          '</div>';
      });
      html += '</div>';
    }

    bodyEl.innerHTML = html;
  }

  /* ==========================================================================
     13. ЭКРАН: РЕДАКТОР СПИСКА
     ========================================================================== */
  function renderCommunity() {
    setTitle('Сообщество');
    var q = state.params.q || '';
    bodyEl.innerHTML = '<div class="srx-card">' +
      '<button class="srx-btn ghost sm" data-act="lists" style="margin-bottom:12px">← Назад</button>' +
      '<label class="srx-label">Поиск по названию или автору</label>' +
      '<div class="srx-row">' +
        '<input class="srx-input srx-grow" data-ref="commQ" value="' + esc(q) + '" placeholder="Например: Ноги">' +
        '<button class="srx-btn primary" data-act="commSearch">Найти</button>' +
      '</div></div>' +
      '<div id="commResults" class="srx-muted" style="padding:12px 0">Загрузка…</div>';

    var box = $('#commResults', bodyEl);
    SRXCommunity.search(q).then(function (res) {
      if (state.view !== 'community' || !box) return;
      if (!res.rows.length) { box.innerHTML = '<div class="srx-empty">Ничего не найдено. Попробуй другое название.</div>'; return; }
      box.innerHTML = res.rows.map(function (w) {
        var mine = res.mine[w.id] || 0;
        var n = (w.items || []).length;
        var id = esc(w.id);
        return '<div class="srx-card"><h3>' + esc(w.title) + '</h3>' +
          '<div class="srx-sub">Автор: ' + esc(w.author_name) + ' · ' + n + ' упр. · рейтинг ' + w.score + '</div>' +
          '<div class="srx-row" style="margin-top:10px">' +
            '<button class="srx-btn sm ' + (mine === 1 ? 'green' : 'ghost') + '" data-act="commVote" data-id="' + id +
              '" data-v="1" data-cur="' + mine + '">👍 ' + w.likes + '</button>' +
            '<button class="srx-btn sm ' + (mine === -1 ? 'danger' : 'ghost') + '" data-act="commVote" data-id="' + id +
              '" data-v="-1" data-cur="' + mine + '">👎 ' + w.dislikes + '</button>' +
            '<button class="srx-btn sm primary srx-grow" data-act="commImport" data-id="' + id + '">＋ В мои</button>' +
          '</div></div>';
      }).join('');
    }).catch(function (err) {
      if (box) box.innerHTML = '<div class="srx-empty">Не удалось загрузить: ' + esc(err && err.message || 'ошибка') + '</div>';
    });
  }

  function renderListEdit(id) {
    var lists = workoutLists();
    var list = null;
    for (var i = 0; i < lists.length; i++) if (lists[i].id === id) list = lists[i];

    if (!list) {
      if (id) { toast('Список не найден'); go('lists'); return; }
      list = { id: uid(), name: '', items: [], createdAt: new Date().toISOString() };
      lists.push(list);
      persist(true);
    }

    setTitle('Список');

    var html = '<div class="srx-card">' +
      '<label class="srx-label">Название</label>' +
      '<input class="srx-input" data-ref="listName" value="' + esc(list.name) + '" placeholder="Например: День ног">' +
      '</div>';

    html += '<div class="srx-card"><h3>Упражнения (' + (list.items || []).length + ')</h3>';

    if (!(list.items || []).length) {
      html += '<div class="srx-muted" style="padding:8px 0 12px">Пока пусто. Добавь упражнения ниже.</div>';
    } else {
      (list.items || []).forEach(function (it, idx) {
        var ex = findExercise(it.exId);
        var thumb = ex && ex.photo
          ? '<img class="srx-thumb" src="' + ex.photo + '" alt="">'
          : '<div class="srx-thumb">' + (ex ? ex.icon : '⭐') + '</div>';

        var mode = it.mode === 'reps' || it.mode === 'both' ? it.mode : 'time';
        var hasTimer = mode !== 'reps';
        var hasReps = mode !== 'time';
        html += '<div class="srx-list-item" style="align-items:flex-start;flex-wrap:wrap">' +
          thumb +
          '<div class="srx-grow">' +
            '<div class="srx-name">' + esc(it.name || (ex && ex.name) || 'Упражнение') + '</div>' +
            '<select class="srx-select" style="margin-top:8px;padding:7px 8px" data-act="itemField" data-id="' +
              esc(list.id) + '" data-idx="' + idx + '" data-field="mode">' +
              '<option value="time"' + (mode === 'time' ? ' selected' : '') + '>⏱ По таймеру</option>' +
              '<option value="reps"' + (mode === 'reps' ? ' selected' : '') + '>🔢 По количеству</option>' +
              '<option value="both"' + (mode === 'both' ? ' selected' : '') + '>⏱🔢 Таймер и количество</option>' +
            '</select>' +
            '<div class="srx-grid3" style="margin-top:8px">' +
              '<div><div class="srx-muted" style="font-size:10.5px">ПОДХОДЫ</div>' +
                '<input class="srx-input" style="padding:7px 8px" type="number" min="1" max="20" ' +
                'data-act="itemField" data-id="' + esc(list.id) + '" data-idx="' + idx + '" data-field="sets" ' +
                'value="' + (num(it.sets) || 3) + '"></div>' +
              '<div><div class="srx-muted" style="font-size:10.5px">ПОДГОТОВКА, с</div>' +
                '<input class="srx-input" style="padding:7px 8px" type="number" min="0" max="300" step="5" ' +
                'data-act="itemField" data-id="' + esc(list.id) + '" data-idx="' + idx + '" data-field="prepSec" ' +
                'value="' + (it.prepSec === undefined ? 5 : num(it.prepSec)) + '"></div>' +
              (hasTimer
                ? '<div><div class="srx-muted" style="font-size:10.5px">ТАЙМЕР, с</div>' +
                  '<input class="srx-input" style="padding:7px 8px" type="number" min="5" max="1200" step="5" ' +
                  'data-act="itemField" data-id="' + esc(list.id) + '" data-idx="' + idx + '" data-field="timeSec" ' +
                  'value="' + (num(it.timeSec) || 40) + '"></div>'
                : '') +
              (hasReps
                ? '<div><div class="srx-muted" style="font-size:10.5px">ПОВТОРЫ</div>' +
                  '<input class="srx-input" style="padding:7px 8px" type="number" min="1" max="500" ' +
                  'data-act="itemField" data-id="' + esc(list.id) + '" data-idx="' + idx + '" data-field="reps" ' +
                  'value="' + (num(it.reps) || 10) + '"></div>'
                : '') +
              '<div><div class="srx-muted" style="font-size:10.5px">ОТДЫХ, с</div>' +
                '<input class="srx-input" style="padding:7px 8px" type="number" min="0" max="600" step="5" ' +
                'data-act="itemField" data-id="' + esc(list.id) + '" data-idx="' + idx + '" data-field="restSec" ' +
                'value="' + (num(it.restSec) || 20) + '"></div>' +
            '</div>' +
          '</div>' +
          '<button class="srx-btn sm danger" data-act="delItem" data-id="' + esc(list.id) + '" data-idx="' + idx + '">✕</button>' +
          '</div>';
      });
    }

    html += '<button class="srx-btn ghost" style="width:100%;margin-top:12px" data-act="pickerOpen" data-id="' +
      esc(list.id) + '">＋ Добавить упражнение</button></div>';

    html += '<div class="srx-row" style="margin-bottom:12px">' +
      '<button class="srx-btn green srx-grow" data-act="startList" data-id="' + esc(list.id) + '">▶ Начать</button>' +
      '<button class="srx-btn danger" data-act="delList" data-id="' + esc(list.id) + '">Удалить</button>' +
      '</div>' +
      '<button class="srx-btn ghost" style="width:100%;margin-bottom:20px" data-act="publishList" data-id="' +
      esc(list.id) + '">🌍 Опубликовать в сообщество</button>';

    bodyEl.innerHTML = html;
  }

  /* ==========================================================================
     14. ЭКРАН: БИБЛИОТЕКА УПРАЖНЕНИЙ
     ========================================================================== */
  var libFilter = 'Все';
  var libQuery = '';
  var listsQuery = '';

  function getBasket() {
    try {
      var b = JSON.parse(localStorage.getItem('srx_basket') || '[]');
      return Array.isArray(b) ? b : [];
    } catch (e) { return []; }
  }

  function setBasket(b) {
    try { localStorage.setItem('srx_basket', JSON.stringify(b)); } catch (e) {}
  }

  function basketToList() {
    var pr = profileData();
    var ids = getBasket();
    if (!pr || !ids.length) return;
    var items = [];
    ids.forEach(function (id) {
      var ex = findExercise(id);
      if (!ex) return;
      var d = exDefaults(ex);
      items.push({
        exId: ex.id, name: ex.name, mode: d.mode, sets: 3, prepSec: 5,
        timeSec: d.timeSec, reps: d.reps, restSec: ex.group === 'Кардио' ? 0 : 60
      });
    });
    var list = { id: uid(), name: '', items: items, createdAt: new Date().toISOString() };
    pr[K.lists].push(list);
    persist(true);
    setBasket([]);
    toast('Комплекс собран — дай ему название');
    go('listEdit', { id: list.id });
  }

  function renderLibrary() {
    setTitle('Упражнения');
    var all = allExercises();
    var groups = ['Все'].concat(MUSCLES);
    var qq = libQuery.trim().toLowerCase();
    var filtered = (libFilter === 'Все' ? all : all.filter(function (e) { return e.group === libFilter; }))
      .filter(function (e) { return !qq || String(e.name).toLowerCase().indexOf(qq) !== -1; });

    var html = '<div class="srx-chips">';
    groups.forEach(function (g) {
      var has = g === 'Все' || all.some(function (e) { return e.group === g; });
      if (!has) return;
      html += '<button class="srx-chip' + (g === libFilter ? ' on' : '') + '" data-act="libFilter" data-g="' +
        esc(g) + '">' + esc(g) + '</button>';
    });
    html += '</div>';

    var basket = getBasket();
    if (basket.length) {
      html += '<div class="srx-card" style="margin-bottom:12px"><div class="srx-name">🧺 В корзине: ' + basket.length + '</div>' +
        '<div class="srx-sub" style="margin:4px 0 10px">Собери из выбранных упражнений один комплекс</div>' +
        '<div class="srx-row"><button class="srx-btn primary srx-grow" data-act="basketMake">Собрать комплекс</button>' +
        '<button class="srx-btn ghost" data-act="basketClear">Очистить</button></div></div>';
    }

    html += '<input class="srx-input" data-ref="libQ" placeholder="Поиск упражнения" value="' + esc(libQuery) +
      '" style="margin-bottom:10px">';

    html += '<button class="srx-btn primary" style="width:100%;margin:4px 0 14px" data-act="newExercise">' +
      '＋ Своё упражнение с фото</button>';

    html += '<div class="srx-ex-grid">';
    filtered.forEach(function (e) {
      var img = e.photo
        ? '<img class="srx-ex-photo" src="' + e.photo + '" alt="">'
        : '<div class="srx-ex-photo ph">' + esc(e.icon || '⭐') + '</div>';
      html += '<div class="srx-ex-card" data-act="exInfo" data-id="' + esc(e.id) + '">' +
        img +
        '<div class="srx-ex-info">' +
          '<div class="srx-name" style="font-size:13.5px">' + esc(e.name) + '</div>' +
          '<div class="srx-sub">' + esc(e.group) + ' · MET ' + e.met +
            (e.custom ? ' · своё' : '') + '</div>' +
        '<button class="srx-btn sm" style="margin-top:6px" data-act="basketAdd" data-id="' + esc(e.id) + '">＋ в корзину</button>' +
        '</div></div>';
    });
    html += '</div>';

    bodyEl.innerHTML = html;
  }

  /* ==========================================================================
     15. ЭКРАН: ТАЙМЕР ТРЕНИРОВКИ
     ========================================================================== */
  var T = {
    active: false, phase: 'idle', left: 0, total: 0,
    items: [], idx: 0, set: 0, listId: null, listName: '',
    startedAt: null, tick: null, restAfterLast: false
  };

  function trainerItems(list) {
    return (list.items || []).map(function (it) {
      var ex = findExercise(it.exId);
      return {
        name: it.name || (ex && ex.name) || 'Упражнение',
        icon: ex ? ex.icon : '⭐',
        photo: ex ? ex.photo : null,
        video: ex ? ex.video : null,
        mode: it.mode === 'reps' || it.mode === 'both' ? it.mode : 'time',
        sets: Math.max(1, num(it.sets) || 1),
        prepSec: it.prepSec === undefined ? 5 : Math.max(0, num(it.prepSec)),
        timeSec: Math.max(5, num(it.timeSec) || 40),
        reps: Math.max(1, num(it.reps) || 10),
        restSec: Math.max(0, num(it.restSec))
      };
    });
  }

  function startWorkout(listId) {
    var lists = workoutLists();
    var list = null;
    for (var i = 0; i < lists.length; i++) if (lists[i].id === listId) list = lists[i];
    if (!list) { toast('Список не найден'); return; }
    if (!(list.items || []).length) { toast('В списке нет упражнений'); return; }

    var items = trainerItems(list);
    try {
      localStorage.setItem('wkTrainerRun', JSON.stringify({ name: list.name || 'Тренировка', items: items }));
    } catch (e) {
      toast('Не хватает места: удали большие фото или видео');
      return;
    }
    window.location.href = 'workout.html?trainer=1';
  }

  function startTick() {
    stopTickOnly();
    T.tick = setInterval(tickFn, 1000);
  }
  function stopTickOnly() { if (T.tick) { clearInterval(T.tick); T.tick = null; } }

  function tickFn() {
    if (!T.active) return;
    if (T.phase === 'work' && isRepsItem(T.items[T.idx])) { paintTimer(); return; }
    T.left--;
    if (T.left <= 0) advancePhase();
    paintTimer();
  }

  function isRepsItem(it) { return !!it && it.mode === 'reps'; }
  function hasTimerItem(it) { return !!it && it.mode !== 'reps'; }
  function hasRepsItem(it) { return !!it && it.mode !== 'time'; }
  function workSecOf(it) { return isRepsItem(it) ? it.reps * 3 : it.timeSec; }

  function advancePhase() {
    if (T.phase === 'prep') { enterWork(); return; }

    if (T.phase === 'work') {
      var cur = T.items[T.idx];
      var isLastSet = T.set >= cur.sets;
      var isLastItem = T.idx >= T.items.length - 1;

      if (isLastSet && isLastItem && !T.restAfterLast) { finishWorkout(); return; }
      if (cur.restSec > 0 && !(isLastSet && isLastItem)) {
        T.phase = 'rest'; T.total = cur.restSec; T.left = cur.restSec;
        beep(520, 150);
        return;
      }
      nextWork();
      return;
    }

    if (T.phase === 'rest') { nextWork(); return; }
  }

  function nextWork() {
    var cur = T.items[T.idx];
    if (T.set < cur.sets) {
      T.set++;
    } else {
      if (T.idx >= T.items.length - 1) { finishWorkout(); return; }
      T.idx++; T.set = 1;
    }
    enterWork();
  }

  function enterWork() {
    var cur = T.items[T.idx];
    T.phase = 'work';
    T.count = 0;
    T.total = isRepsItem(cur) ? 0 : cur.timeSec;
    T.left = cur.timeSec;
    beep(980, 200);
  }

  function finishWorkout() {
    stopTickOnly();
    T.active = false;

    var kg = userWeight();
    var workSeconds = 0, kcal = 0;
    var detail = T.items.map(function (it) {
      var sec = it.sets * workSecOf(it);
      workSeconds += sec;
      var k = kcalFor(it.met, sec / 60, kg);
      kcal += k;
      return { exId: it.exId, name: it.name, mode: it.mode, sets: it.sets,
        timeSec: hasTimerItem(it) ? it.timeSec : 0, reps: hasRepsItem(it) ? it.reps : 0, kcal: round1(k) };
    });

    var durSec = T.startedAt ? Math.round((Date.now() - new Date(T.startedAt).getTime()) / 1000) : workSeconds;

    var session = {
      id: uid(),
      listId: T.listId,
      listName: T.listName,
      date: todayISO(),
      startedAt: T.startedAt,
      finishedAt: new Date().toISOString(),
      durationSec: durSec,
      workSec: workSeconds,
      kcal: round1(kcal),
      bodyWeight: kg,
      exercises: detail
    };

    var p = profileData();
    if (p) {
      p[K.sessions].push(session);
      persist();
    }

    T.phase = 'done';
    paintTimer();
    beep(1200, 320);
    setTimeout(function () {
      toast('Готово: ' + Math.round(session.kcal) + ' ккал за ' + humanDur(durSec));
      go('lists');
    }, 900);
  }

  function stopTimer(silent) {
    stopTickOnly();
    if (!T.active) return;
    if (!silent) {
      if (!confirm('Прервать тренировку? Результат не сохранится.')) {
        startTick();
        return;
      }
    }
    T.active = false;
  }

  function renderRun() {
    setTitle('Тренировка');

    if (!T.active && T.phase !== 'done') {
      bodyEl.innerHTML = '<div class="srx-empty">Тренировка не запущена.</div>' +
        '<button class="srx-btn primary" style="width:100%" data-act="backToList">← К спискам</button>';
      return;
    }

    var cur = T.items[T.idx] || {};
    var next = T.items[T.idx + 1] || null;

    var html = '<div class="srx-card">' +
      '<div class="srx-timer">' +
        '<div class="srx-phase" data-ref="phase">' + phaseText() + '</div>' +
        '<div class="srx-clock" data-ref="clock">' + mmss(T.left) + '</div>' +
        '<div class="srx-muted" data-ref="exname">' + esc(cur.name || '') + '</div>' +
        '<div class="srx-progress"><i data-ref="bar"></i></div>' +
        '<div class="srx-muted" data-ref="meta">' + metaText() + '</div>' +
      '</div>' +
      '</div>';

    html += '<div class="srx-row" style="margin-bottom:12px">' +
      (hasRepsItem(cur) && T.phase === 'work'
        ? '<button class="srx-btn primary srx-grow" data-ref="act" data-act="repsDone">Готово ✓</button>'
        : '<button class="srx-btn srx-grow" data-ref="act" data-act="skipPhase">Пропустить →</button>') +
      '<button class="srx-btn danger" data-act="abortRun">Стоп</button>' +
      '</div>';

    html += '<div class="srx-card"><h3>План</h3>';
    T.items.forEach(function (it, i) {
      var active = i === T.idx;
      var done = i < T.idx;
      html += '<div class="srx-list-item" style="opacity:' + (done ? .45 : 1) + '">' +
        '<div class="srx-thumb">' + (it.photo ? '<img class="srx-thumb" src="' + it.photo + '" alt="">' : esc(it.icon || '⭐')) + '</div>' +
        '<div class="srx-grow">' +
          '<div class="srx-name"' + (active ? ' style="color:#f97316"' : '') + '>' +
            esc(it.name) + '</div>' +
          '<div class="srx-sub">' + it.sets + ' × ' + (it.mode === 'both' ? it.timeSec + ' с или ' + it.reps + ' повт.' : isRepsItem(it) ? it.reps + ' повт.' : it.timeSec + ' с') +
            ' · отдых ' + it.restSec + ' с</div>' +
        '</div>' +
        (done ? '<div class="srx-sub">✓</div>' : '') +
        '</div>';
    });
    html += '</div>';

    bodyEl.innerHTML = html;
    paintTimer();
  }

  function phaseText() {
    if (T.phase === 'prep') return 'Приготовься';
    if (T.phase === 'work') return 'Работа';
    if (T.phase === 'rest') return 'Отдых';
    if (T.phase === 'done') return 'Финиш';
    return '—';
  }

  function metaText() {
    var cur = T.items[T.idx];
    if (!cur) return '';
    if (T.phase === 'rest') {
      var nxt = (T.set < cur.sets) ? cur : (T.items[T.idx + 1] || null);
      return nxt ? 'Далее: ' + esc(nxt.name) : '';
    }
    var countTxt = cur.mode === 'both' && T.phase === 'work' ? ' · повторы ' + (T.count || 0) + '/' + cur.reps : '';
    return 'Подход ' + T.set + ' из ' + cur.sets + ' · ' + (T.idx + 1) + '/' + T.items.length + countTxt;
  }

  function paintTimer() {
    if (!bodyEl || state.view !== 'run') return;
    var ph = $('[data-ref="phase"]', bodyEl);
    var cl = $('[data-ref="clock"]', bodyEl);
    var bar = $('[data-ref="bar"]', bodyEl);
    var ex = $('[data-ref="exname"]', bodyEl);
    var mt = $('[data-ref="meta"]', bodyEl);

    if (ph) {
      ph.textContent = phaseText();
      ph.className = 'srx-phase' + (T.phase === 'rest' ? ' rest' : T.phase === 'prep' ? ' prep' : T.phase === 'done' ? ' done' : '');
    }
    var curItem = T.items[T.idx];
    var act = $('[data-ref="act"]', bodyEl);
    if (act) {
      var repsNow = T.phase === 'work' && hasRepsItem(curItem);
      act.setAttribute('data-act', repsNow ? 'repsDone' : 'skipPhase');
      act.className = 'srx-btn srx-grow' + (repsNow ? ' primary' : '');
      act.textContent = !repsNow ? 'Пропустить →'
        : hasTimerItem(curItem) ? '+1 повтор (' + (T.count || 0) + '/' + curItem.reps + ')'
        : 'Готово ✓';
    }
    if (cl) {
      if (T.phase === 'done') cl.textContent = 'ГОТОВО';
      else if (T.phase === 'work' && isRepsItem(curItem)) cl.textContent = '× ' + curItem.reps;
      else cl.textContent = mmss(T.left);
    }
    if (bar) {
      var pct = T.total > 0 ? clamp((1 - T.left / T.total) * 100, 0, 100) : 0;
      bar.style.width = pct + '%';
    }
    var cur = T.items[T.idx];
    if (ex && cur) ex.textContent = cur.name;
    if (mt) mt.textContent = metaText();
  }

  /* ==========================================================================
     16. ЭКРАН: ДЕТАЛИ ТРЕНИРОВКИ
     ========================================================================== */
  function renderSession(id) {
    setTitle('Тренировка');
    var s = null;
    sessions().forEach(function (x) { if (x.id === id) s = x; });
    if (!s) { bodyEl.innerHTML = '<div class="srx-empty">Не найдено</div>'; return; }

    var html = '<div class="srx-card">' +
      '<div class="srx-name" style="font-size:16px">' + esc(s.listName || 'Тренировка') + '</div>' +
      '<div class="srx-sub">' + esc(String(s.date || s.startedAt || '').slice(0, 10)) + '</div>' +
      '<div class="srx-kpi" style="margin-top:12px">' +
        '<div><span>Длительность</span><b>' + humanDur(s.durationSec || 0) + '</b></div>' +
        '<div><span>Сожжено</span><b>' + Math.round(num(s.kcal)) + ' ккал</b></div>' +
      '</div></div>';

    html += '<div class="srx-card"><h3>Упражнения</h3>';
    (s.exercises || []).forEach(function (e) {
      html += '<div class="srx-list-item">' +
        '<div class="srx-grow"><div class="srx-name">' + esc(e.name) + '</div>' +
        '<div class="srx-sub">' + e.sets + ' подходов · ' + e.timeSec + ' с</div></div>' +
        '<div class="srx-sub">' + Math.round(num(e.kcal)) + ' ккал</div>' +
        '</div>';
    });
    html += '</div>';

    html += '<button class="srx-btn danger" style="width:100%" data-act="delSession" data-id="' +
      esc(s.id) + '">Удалить тренировку</button>';

    bodyEl.innerHTML = html;
  }

  /* ==========================================================================
     17. ЭКРАН: АНАЛИТИКА
     ========================================================================== */
  var rangeDays = 30;

  function renderAnalysis() {
    setTitle('Анализ');

    var to = todayISO();
    var from = daysAgoYmd(rangeDays - 1);
    var data = buildSeries(from, to);

    var sumEaten = 0, sumBurned = 0, sumWater = 0;
    var wFirst = null, wLast = null;
    var pairs = [];

    data.forEach(function (d) {
      sumEaten += d.eaten;
      sumBurned += d.burned;
      sumWater += d.water;
      if (d.weight > 0) {
        if (wFirst == null) wFirst = d.weight;
        wLast = d.weight;
      }
      if (d.hasEaten) pairs.push(d);
    });

    var balance = sumEaten - sumBurned;
    var daysWithEaten = data.filter(function (d) { return d.hasEaten; }).length || 1;

    var html = '<div class="srx-chips">';
    [7, 30, 90, 365].forEach(function (n) {
      html += '<button class="srx-chip' + (rangeDays === n ? ' on' : '') + '" data-act="range" data-n="' + n + '">' +
        (n === 365 ? 'Год' : n + ' дней') + '</button>';
    });
    html += '</div>';

    html += '<div class="srx-kpi" style="margin-bottom:12px">' +
      '<div><span>Съедено / день</span><b>' + Math.round(sumEaten / daysWithEaten) + '</b></div>' +
      '<div><span>Сожжено / день</span><b>' + Math.round(sumBurned / rangeDays) + '</b></div>' +
      '<div><span>Баланс</span><b style="color:' + (balance > 0 ? '#ff8a95' : '#22c55e') + '">' +
        (balance > 0 ? '+' : '') + Math.round(balance) + '</b></div>' +
      '<div><span>Вода / день</span><b>' + Math.round(sumWater / rangeDays) + ' мл</b></div>' +
      '</div>';

    if (wFirst != null && wLast != null) {
      var dw = round1(wLast - wFirst);
      html += '<div class="srx-card"><h3>Вес за период</h3>' +
        '<div class="srx-row"><div class="srx-grow"><div class="srx-name">' +
        wFirst + ' → ' + wLast + ' кг</div>' +
        '<div class="srx-sub">' + (dw === 0 ? 'без изменений' : (dw > 0 ? '+' : '') + dw + ' кг') + '</div>' +
        '</div></div></div>';
    }

    html += '<div class="srx-card"><h3>Калории: съедено vs сожжено</h3>' +
      '<div class="srx-chart-box"><canvas id="srx-c1"></canvas></div></div>';

    html += '<div class="srx-card"><h3>Баланс калорий</h3>' +
      '<div class="srx-chart-box"><canvas id="srx-c2"></canvas></div></div>';

    html += '<div class="srx-card"><h3>Вода и вес</h3>' +
      '<div class="srx-chart-box"><canvas id="srx-c3"></canvas></div></div>';

    html += '<div class="srx-card"><h3>Корреляции</h3>' +
      '<div class="srx-chart-box"><canvas id="srx-c4"></canvas></div>' +
      '<div data-ref="corrText" class="srx-muted" style="margin-top:10px"></div></div>';

    html += '<div class="srx-card"><h3>Тренировки</h3>' +
      '<div data-ref="trainText"></div></div>';

    bodyEl.innerHTML = html;

    /* Статистика тренировок */
    var ss = sessions().filter(function (s) {
      var d = String(s.date || s.startedAt || '').slice(0, 10);
      return d >= from && d <= to;
    });
    var sKcal = ss.reduce(function (a, s) { return a + num(s.kcal); }, 0);
    var sDur = ss.reduce(function (a, s) { return a + num(s.durationSec); }, 0);
    var tt = $('[data-ref="trainText"]', bodyEl);
    if (tt) {
      tt.innerHTML = ss.length
        ? '<div class="srx-kpi">' +
            '<div><span>Тренировок</span><b>' + ss.length + '</b></div>' +
            '<div><span>Всего времени</span><b>' + humanDur(sDur) + '</b></div>' +
            '<div><span>Сожжено</span><b>' + Math.round(sKcal) + '</b></div>' +
            '<div><span>В среднем</span><b>' + Math.round(sKcal / ss.length) + ' ккал</b></div>' +
          '</div>'
        : '<div class="srx-muted">За этот период тренировок нет.</div>';
    }

    drawCharts(data, from, to);
  }

  function ensureChart(cb) {
    if (window.Chart) { cb(null); return; }
    var existing = $('#srx-chartjs');
    if (existing) {
      existing.addEventListener('load', function () { cb(null); });
      return;
    }
    var s = document.createElement('script');
    s.id = 'srx-chartjs';
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = function () { cb(null); };
    s.onerror = function () { cb(new Error('CDN недоступен')); };
    document.head.appendChild(s);
  }

  function drawCharts(data, from, to) {
    ensureChart(function (err) {
      if (err || !window.Chart) {
        $$('.srx-chart-box', bodyEl).forEach(function (b) {
          b.innerHTML = '<div class="srx-empty" style="padding:20px">Графики недоступны: нет Chart.js и нет сети.<br>' +
            'Подключи chart.js локально, если нужен офлайн.</div>';
        });
        return;
      }

      destroyCharts();

      var labels = data.map(function (d) { return d.date.slice(5); });
      var grid = { color: 'rgba(255,255,255,.06)' };
      var ticks = { color: '#7d8ea3', font: { size: 10 } };
      var baseOpts = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9fb0c2', boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: { grid: grid, ticks: ticks, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
          y: { grid: grid, ticks: ticks, beginAtZero: true }
        }
      };

      function deep(o) { return JSON.parse(JSON.stringify(o)); }

      /* --- 1. Съедено vs сожжено --- */
      var c1 = $('#srx-c1');
      if (c1) {
        chartRegistry.push(new Chart(c1, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Съедено',
                data: data.map(function (d) { return d.hasEaten ? Math.round(d.eaten) : null; }),
                borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,.14)',
                fill: true, tension: .3, pointRadius: 2, spanGaps: true
              },
              {
                label: 'Сожжено',
                data: data.map(function (d) { return d.hasBurned ? Math.round(d.burned) : null; }),
                borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.12)',
                fill: true, tension: .3, pointRadius: 2, spanGaps: true
              }
            ]
          },
          options: deep(baseOpts)
        }));
      }

      /* --- 2. Баланс --- */
      var c2 = $('#srx-c2');
      if (c2) {
        var bal = data.map(function (d) {
          if (!d.hasEaten) return null;
          return Math.round(d.eaten - d.burned);
        });
        chartRegistry.push(new Chart(c2, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Баланс, ккал',
              data: bal,
              backgroundColor: bal.map(function (v) {
                if (v == null) return 'rgba(125,142,163,.25)';
                return v > 0 ? 'rgba(239,68,68,.65)' : 'rgba(34,197,94,.65)';
              }),
              borderRadius: 4
            }]
          },
          options: (function () {
            var o = deep(baseOpts);
            o.scales.y.beginAtZero = false;
            return o;
          })()
        }));
      }

      /* --- 3. Вода и вес --- */
      var c3 = $('#srx-c3');
      if (c3) {
        chartRegistry.push(new Chart(c3, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Вода, мл',
                data: data.map(function (d) { return d.hasWater ? Math.round(d.water) : null; }),
                borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,.12)',
                fill: true, tension: .3, pointRadius: 2, yAxisID: 'y', spanGaps: true
              },
              {
                label: 'Вес, кг',
                data: data.map(function (d) { return d.hasWeight ? round1(d.weight) : null; }),
                borderColor: '#a78bfa', backgroundColor: 'transparent',
                tension: .3, pointRadius: 2, borderWidth: 2, yAxisID: 'y1', spanGaps: true
              }
            ]
          },
          options: (function () {
            var o = deep(baseOpts);
            o.scales.y1 = {
              position: 'right', grid: { drawOnChartArea: false },
              ticks: { color: '#a78bfa', font: { size: 10 } }
            };
            return o;
          })()
        }));
      }

      /* --- 4. Скаттер съедено / вес + Pearson --- */
      var c4 = $('#srx-c4');
      var ctext = $('[data-ref="corrText"]', bodyEl);
      var pts = [], xs = [], ys = [];
      data.forEach(function (d) {
        if (d.hasEaten && d.hasWeight && d.weight > 0) {
          pts.push({ x: Math.round(d.eaten), y: round1(d.weight) });
          xs.push(d.eaten); ys.push(d.weight);
        }
      });

      var rx = pearson(xs, ys);

      /* доп. корреляции по другим парам */
      var xb = [], yb = [], xw = [], yw = [];
      data.forEach(function (d) {
        if (d.hasBurned && d.hasWeight && d.weight > 0) { xb.push(d.burned); yb.push(d.weight); }
        if (d.hasWater && d.hasWeight && d.weight > 0) { xw.push(d.water); yw.push(d.weight); }
      });
      var rb = pearson(xb, yb);
      var rw = pearson(xw, yw);

      if (c4) {
        chartRegistry.push(new Chart(c4, {
          type: 'scatter',
          data: {
            datasets: [{
              label: 'Съедено → вес',
              data: pts,
              backgroundColor: 'rgba(249,115,22,.75)',
              pointRadius: 4
            }]
          },
          options: (function () {
            var o = deep(baseOpts);
            o.plugins.legend.display = false;
            o.scales.x.title = { display: true, text: 'Съедено, ккал', color: '#7d8ea3', font: { size: 10 } };
            o.scales.y.title = { display: true, text: 'Вес, кг', color: '#7d8ea3', font: { size: 10 } };
            o.scales.y.beginAtZero = false;
            return o;
          })()
        }));
      }

      if (ctext) {
        function line(label, r, n) {
          var v = r == null ? '—' : (r >= 0 ? '+' : '') + r.toFixed(2);
          return '<div class="srx-list-item" style="padding:7px 0">' +
            '<div class="srx-grow"><div class="srx-name" style="font-size:13px">' + label + '</div>' +
            '<div class="srx-sub">' + corrLabel(r) + ' · n=' + n + '</div></div>' +
            '<div class="srx-sub" style="font-size:14px;color:#e8eef5">' + v + '</div></div>';
        }
        ctext.innerHTML =
          line('Съедено ↔ вес', rx, Math.min(xs.length, ys.length)) +
          line('Сожжено ↔ вес', rb, Math.min(xb.length, yb.length)) +
          line('Вода ↔ вес', rw, Math.min(xw.length, yw.length)) +
          '<div class="srx-muted" style="margin-top:8px;font-size:11.5px;line-height:1.5">' +
          'Корреляция не доказывает причинность. Для устойчивой оценки нужно ≥ 14 дней данных.</div>';
      }
    });
  }

  /* ==========================================================================
     18. МОДАЛКИ
     ========================================================================== */
  var modalEl = null;

  function openSheet(title, innerHTML) {
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.className = 'srx-modal';
      modalEl.innerHTML = '<div class="srx-sheet" data-ref="sheet"></div>';
      document.body.appendChild(modalEl);
      modalEl.addEventListener('click', function (e) {
        if (e.target === modalEl) { closeSheet(); return; }
        onClick(e);
      });
    }
    var sheet = $('[data-ref="sheet"]', modalEl);
    sheet.innerHTML =
      '<div class="srx-row" style="margin-bottom:12px">' +
        '<div class="srx-grow"><div class="srx-name" style="font-size:16px">' + esc(title) + '</div></div>' +
        '<button class="srx-x" data-act="sheetClose">✕</button>' +
      '</div>' + innerHTML;
    modalEl.classList.add('open');
  }

  function closeSheet() {
    if (modalEl) modalEl.classList.remove('open');
  }

  /* --- пикер упражнений --- */
  function openPicker(listId) {
    var all = allExercises();
    var html = '<input class="srx-input" data-ref="pickSearch" placeholder="Поиск упражнения…" style="margin-bottom:10px">';
    html += '<div data-ref="pickList" style="max-height:54vh;overflow-y:auto"></div>';

    openSheet('Добавить упражнение', html);
    var listEl = $('[data-ref="pickList"]', modalEl);
    var searchEl = $('[data-ref="pickSearch"]', modalEl);

    function paint(q) {
      q = (q || '').toLowerCase().trim();
      var filtered = all.filter(function (e) {
        return !q || e.name.toLowerCase().indexOf(q) >= 0 || e.group.toLowerCase().indexOf(q) >= 0;
      });
      if (!filtered.length) {
        listEl.innerHTML = '<div class="srx-empty">Ничего не найдено</div>';
        return;
      }
      listEl.innerHTML = filtered.map(function (e) {
        var thumb = e.photo
          ? '<img class="srx-thumb" src="' + e.photo + '" alt="">'
          : '<div class="srx-thumb">' + esc(e.icon || '⭐') + '</div>';
        return '<div class="srx-list-item" data-act="pickAdd" data-list="' + esc(listId) +
          '" data-ex="' + esc(e.id) + '">' + thumb +
          '<div class="srx-grow"><div class="srx-name">' + esc(e.name) + '</div>' +
          '<div class="srx-sub">' + esc(e.group) + ' · MET ' + e.met + '</div></div>' +
          '<div class="srx-sub">＋</div></div>';
      }).join('');
    }

    paint('');
    searchEl.addEventListener('input', function () { paint(searchEl.value); });
    setTimeout(function () { try { searchEl.focus(); } catch (e) {} }, 120);
  }

  /* --- форма своего упражнения --- */
  var SPORT_ICONS = ['🏋️', '🤸', '🏃', '🚴', '🏊', '🥊', '🧘', '🤾', '🏀', '⚽', '🏐', '🎾',
    '🥋', '🤺', '🧗', '🚣', '🏇', '⛹️', '🤼', '🏌️', '🛹', '🏹', '💪', '🦵', '🔥', '⚡', '🥇', '🎯'];
  var pendingIcon = SPORT_ICONS[0];

  var pendingMedia = null;

  function exDefaults(ex) {
    return {
      mode: ex.mode === 'reps' || ex.mode === 'both' ? ex.mode : 'time',
      timeSec: num(ex.timeSec) || (ex.group === 'Кардио' ? 300 : 40),
      reps: num(ex.reps) || 10
    };
  }

  var MODE_HINTS = {
    time: 'Упражнение идёт, пока не выйдет время таймера.',
    reps: 'Таймер показывает ∞. Ты сам жмёшь «+1 повтор», пока не сделаешь нужное количество.',
    both: 'Таймер идёт и считается количество повторов. Упражнение заканчивается, когда выйдет время или сделано нужное количество — что наступит раньше.'
  };

  function openExerciseForm() {
    pendingIcon = SPORT_ICONS[0];
    pendingMedia = null;
    var html = '';

    html += '<label class="srx-label">Название</label>' +
      '<input class="srx-input" data-ref="exName" placeholder="Например: Тяга к поясу">';

    html += '<label class="srx-label">Группа</label>' +
      '<select class="srx-select" data-ref="exGroup">' +
      MUSCLES.map(function (m) { return '<option>' + m + '</option>'; }).join('') +
      '</select>';

    html += '<label class="srx-label">Как выполняем</label>' +
      '<select class="srx-select" data-ref="exMode">' +
      '<option value="time">⏱ По таймеру</option>' +
      '<option value="reps">🔢 По количеству</option>' +
      '<option value="both">⏱🔢 Таймер и количество</option>' +
      '</select>' +
      '<div class="srx-muted" data-ref="exModeHint" style="margin-top:4px;font-size:11.5px"></div>';

    html += '<div class="srx-grid3" style="margin-top:8px">' +
      '<div data-ref="exTimeBlock"><label class="srx-label">Таймер, сек</label>' +
      '<input class="srx-input" data-ref="exTime" type="number" min="5" max="3600" step="5" value="40"></div>' +
      '<div data-ref="exRepsBlock"><label class="srx-label">Повторы</label>' +
      '<input class="srx-input" data-ref="exReps" type="number" min="1" max="500" value="10"></div>' +
      '<div><label class="srx-label">MET</label>' +
      '<input class="srx-input" data-ref="exMet" type="number" min="1" max="20" step="0.1" value="5"></div>' +
      '</div>';

    html += '<label class="srx-label">Иконка</label>' +
      '<div class="srx-emoji-grid" data-ref="emojiGrid">' +
      SPORT_ICONS.map(function (ic) {
        return '<button class="srx-emoji-btn' + (ic === pendingIcon ? ' on' : '') + '" data-act="pickIcon" data-icon="' +
          ic + '">' + ic + '</button>';
      }).join('') +
      '</div>';

    html += '<label class="srx-label">Фото или видео (необязательно)</label>' +
      '<input class="srx-input" data-ref="exMedia" type="file" accept="image/*,video/*" style="padding:8px">' +
      '<div class="srx-muted" style="margin-top:4px;font-size:11.5px">Фото сжимается автоматически. Видео — до 10 секунд.</div>' +
      '<div data-ref="mediaPreview" style="margin-top:8px"></div>';

    html += '<label class="srx-label">Заметка (необязательно)</label>' +
      '<textarea class="srx-textarea" data-ref="exNote" rows="2" placeholder="Техника, нюансы…"></textarea>';

    html += '<button class="srx-btn primary" style="width:100%;margin-top:16px" data-act="saveExercise">' +
      'Сохранить упражнение</button>';

    openSheet('Своё упражнение', html);

    var modeEl = $('[data-ref="exMode"]', modalEl);
    var syncMode = function () {
      var m = modeEl.value;
      $('[data-ref="exTimeBlock"]', modalEl).style.display = m === 'reps' ? 'none' : '';
      $('[data-ref="exRepsBlock"]', modalEl).style.display = m === 'time' ? 'none' : '';
      $('[data-ref="exModeHint"]', modalEl).textContent = MODE_HINTS[m];
    };
    modeEl.addEventListener('change', syncMode);
    syncMode();

    $('[data-ref="exMedia"]', modalEl).addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      var preview = $('[data-ref="mediaPreview"]', modalEl);
      pendingMedia = null;
      preview.innerHTML = '';
      if (!file) return;
      readMedia(file, function (err, media) {
        if (err) { toast(err); e.target.value = ''; return; }
        pendingMedia = media;
        preview.innerHTML = media.photo
          ? '<img src="' + media.photo + '" style="width:100%;max-height:180px;object-fit:cover;border-radius:12px">'
          : '<video src="' + media.video + '" controls muted style="width:100%;max-height:180px;border-radius:12px"></video>';
      });
    });
  }

  function readMedia(file, cb) {
    if (file.type.indexOf('video/') === 0) {
      if (file.size > 50 * 1024 * 1024) { cb('Видео больше 50 МБ — выбери короче или в меньшем качестве'); return; }
      var probeUrl = URL.createObjectURL(file);
      var probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onerror = function () { URL.revokeObjectURL(probeUrl); cb('Не удалось прочитать видео'); };
      probe.onloadedmetadata = function () {
        URL.revokeObjectURL(probeUrl);
        if (isFinite(probe.duration) && probe.duration > 10.05) { cb('Видео длиннее 10 секунд — выбери короче'); return; }
        cb(null, { videoBlob: file, video: URL.createObjectURL(file) });
      };
      probe.src = probeUrl;
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var k = Math.min(1, 720 / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      cb(null, { photo: c.toDataURL('image/jpeg', 0.8) });
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb('Не удалось открыть фото'); };
    img.src = url;
  }

  function showExerciseDone(ex) {
    openSheet('Упражнение создано', '<div class="srx-muted" style="margin-bottom:14px">' + esc(ex.name) +
      ' сохранено в библиотеку. Что дальше?</div>' +
      '<button class="srx-btn primary" style="width:100%;margin-bottom:8px" data-act="chooseListForEx" data-ex="' + esc(ex.id) + '">📋 Добавить в комплекс</button>' +
      '<button class="srx-btn" style="width:100%;margin-bottom:8px" data-act="newExercise">＋ Создать ещё одно упражнение</button>' +
      '<button class="srx-btn" style="width:100%" data-act="sheetClose">Готово</button>');
  }

  function addExerciseToList(listId, exId) {
    var ex = findExercise(exId);
    var pr = profileData();
    if (!ex || !pr) return;
    var d = exDefaults(ex);
    pr[K.lists].forEach(function (l) {
      if (l.id !== listId) return;
      if (!Array.isArray(l.items)) l.items = [];
      l.items.push({
        exId: ex.id, name: ex.name,
        mode: d.mode,
        sets: 3,
        prepSec: 5,
        timeSec: d.timeSec,
        reps: d.reps,
        restSec: ex.group === 'Кардио' ? 0 : 60
      });
    });
    persist(true);
    toast(ex.name + ' добавлено');
    closeSheet();
    go('listEdit', { id: listId });
  }

  /* ==========================================================================
     19. ДЕЙСТВИЯ
     ========================================================================== */
  /* Поиск: перерисовываем экран и возвращаем фокус и курсор в поле. */
  function onInput(e) {
    var t = e.target;
    var ref = t && t.getAttribute && t.getAttribute('data-ref');
    if (ref !== 'libQ' && ref !== 'listsQ') return;
    var caret = t.selectionStart;
    if (ref === 'libQ') { libQuery = t.value; renderLibrary(); }
    else { listsQuery = t.value; renderLists(); }
    var again = $('[data-ref="' + ref + '"]', bodyEl);
    if (again) {
      again.focus();
      try { again.setSelectionRange(caret, caret); } catch (err) {}
    }
  }

  function onClick(e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');

    switch (act) {
      case 'close': closeRoot(); break;

      case 'library': go('library'); break;
      case 'analysis': go('analysis'); break;
      case 'timerPage': window.location.href = 'workout.html'; break;
      case 'tab': go(el.getAttribute('data-tab')); break;

      case 'libFilter':
        libFilter = el.getAttribute('data-g');
        renderLibrary();
        break;

      case 'range':
        rangeDays = num(el.getAttribute('data-n')) || 30;
        renderAnalysis();
        break;

      case 'newList':
        go('listEdit', { id: null });
        break;

      case 'openCommunity':
        go('community', { q: '' });
        break;

      case 'commSearch': {
        var qInput = $('[data-ref="commQ"]', bodyEl);
        go('community', { q: qInput ? qInput.value.trim() : '' });
        break;
      }

      case 'commVote': {
        var wid = el.getAttribute('data-id');
        var vVal = num(el.getAttribute('data-v'));
        var vCur = num(el.getAttribute('data-cur'));
        var qNow = state.params.q;
        SRXCommunity.vote(wid, vVal, vCur).then(function () {
          if (state.view === 'community') go('community', { q: qNow });
        }).catch(function (err) { toast('Не получилось проголосовать: ' + (err && err.message || 'ошибка')); });
        break;
      }

      case 'commImport': {
        var iid = el.getAttribute('data-id');
        SRXCommunity.fetchOne(iid).then(function (w) {
          var p = profileData();
          if (!p) throw new Error('Профиль не загружен');
          var listItems = (w.items || []).map(function (it) {
            var exId = 'c_' + uid();
            p[K.ex].push({
              id: exId, name: it.name, group: 'Свои', met: 0, icon: it.icon || '⭐',
              photo: it.photo || null, video: it.video || null, note: '',
              mode: it.mode, timeSec: it.timeSec, reps: it.reps,
              createdAt: new Date().toISOString(), custom: true
            });
            return { exId: exId, name: it.name, mode: it.mode, sets: it.sets, timeSec: it.timeSec,
              reps: it.reps, restSec: it.restSec, prepSec: it.prepSec };
          });
          p[K.lists].push({ id: uid(), name: w.title + ' (из сообщества)', items: listItems, createdAt: new Date().toISOString() });
          persist();
          toast('Тренировка добавлена в «Мои списки»');
          go('lists');
        }).catch(function (err) { toast('Не получилось добавить: ' + (err && err.message || 'ошибка')); });
        break;
      }

      case 'publishList': {
        var pid = el.getAttribute('data-id');
        var pl = workoutLists().filter(function (l) { return l.id === pid; })[0];
        if (!pl) break;
        var ptitle = (pl.name || '').trim();
        if (!ptitle) { toast('Сначала дай тренировке название'); break; }
        if (!(pl.items || []).length) { toast('Добавь хотя бы одно упражнение'); break; }
        toast('Публикую тренировку…');
        SRXCommunity.publish(ptitle.slice(0, 80), trainerItems(pl)).then(function () {
          toast('Опубликовано в сообществе');
        }).catch(function (err) { toast('Не удалось опубликовать: ' + (err && err.message || 'ошибка')); });
        break;
      }

      case 'editList':
        go('listEdit', { id: el.getAttribute('data-id') });
        break;

      case 'backToList':
      case 'lists':
        go('lists');
        break;

      case 'startList':
        startWorkout(el.getAttribute('data-id'));
        break;

      case 'delList': {
        var id = el.getAttribute('data-id');
        if (!confirm('Удалить список?')) break;
        var p = profileData();
        if (p) {
          p[K.lists] = p[K.lists].filter(function (l) { return l.id !== id; });
          persist();
        }
        toast('Список удалён');
        go('lists');
        break;
      }

      case 'delItem': {
        var lid = el.getAttribute('data-id');
        var idx = num(el.getAttribute('data-idx'));
        var pp = profileData();
        if (pp) {
          pp[K.lists].forEach(function (l) {
            if (l.id === lid && l.items) l.items.splice(idx, 1);
          });
          persist(true);
        }
        renderListEdit(lid);
        break;
      }

      case 'pickerOpen':
        openPicker(el.getAttribute('data-id'));
        break;

      case 'newExercise':
        openExerciseForm();
        break;

      case 'basketAdd': {
        var bid = el.getAttribute('data-id');
        var bl = getBasket();
        if (bl.indexOf(bid) === -1) bl.push(bid);
        setBasket(bl);
        toast('Добавлено в корзину');
        renderLibrary();
        break;
      }

      case 'basketClear':
        setBasket([]);
        renderLibrary();
        break;

      case 'basketMake':
        basketToList();
        break;

      case 'pickIcon': {
        pendingIcon = el.getAttribute('data-icon');
        var grid = $('[data-ref="emojiGrid"]', modalEl);
        if (grid) Array.prototype.forEach.call(grid.children, function (b) {
          b.classList.toggle('on', b.getAttribute('data-icon') === pendingIcon);
        });
        break;
      }

      case 'sheetClose':
        closeSheet();
        break;

      case 'saveExercise': {
        var nm = ($('[data-ref="exName"]', modalEl) || {}).value || '';
        nm = nm.trim();
        if (!nm) { toast('Введи название'); break; }
        var grp = ($('[data-ref="exGroup"]', modalEl) || {}).value || 'Всё тело';
        var met = clamp(num(($('[data-ref="exMet"]', modalEl) || {}).value) || 5, 1, 20);
        var note = ($('[data-ref="exNote"]', modalEl) || {}).value || '';
        var exMode = ($('[data-ref="exMode"]', modalEl) || {}).value || 'time';
        var exTime = clamp(num(($('[data-ref="exTime"]', modalEl) || {}).value) || 40, 5, 3600);
        var exReps = clamp(num(($('[data-ref="exReps"]', modalEl) || {}).value) || 10, 1, 500);

        var prof = profileData();
        if (!prof) { toast('Профиль не загружен'); break; }

        var newEx = {
          id: 'c_' + uid(),
          name: nm,
          group: grp,
          met: met,
          icon: pendingIcon,
          note: note,
          mode: exMode,
          timeSec: exTime,
          reps: exReps,
          createdAt: new Date().toISOString()
        };
        if (pendingMedia && pendingMedia.photo) newEx.photo = pendingMedia.photo;
        var videoBlob = pendingMedia && pendingMedia.videoBlob;
        pendingMedia = null;
        var finishNew = function () {
          prof[K.ex].push(newEx);
          persist();
          toast('Упражнение сохранено');
          if (state.view === 'library') renderLibrary();
          showExerciseDone(newEx);
        };
        if (videoBlob) {
          SRXMedia.put('ex-' + newEx.id, videoBlob).then(function (ref) {
            newEx.video = ref;
            finishNew();
          }, function () { toast('Не удалось сохранить видео на телефон'); });
        } else {
          finishNew();
        }
        break;
      }

      case 'chooseListForEx': {
        var cex = el.getAttribute('data-ex');
        var cls = workoutLists();
        var ch = '';
        if (!cls.length) ch += '<div class="srx-muted" style="margin-bottom:10px">Комплексов пока нет.</div>';
        cls.forEach(function (l) {
          ch += '<div class="srx-list-item" data-act="pickAdd" data-list="' + esc(l.id) + '" data-ex="' + esc(cex) + '">' +
            '<div class="srx-grow"><div class="srx-name">' + esc(l.name || 'Без названия') + '</div>' +
            '<div class="srx-sub">' + (l.items || []).length + ' упр.</div></div><div class="srx-sub">＋</div></div>';
        });
        ch += '<button class="srx-btn primary" style="width:100%;margin-top:10px" data-act="pickAddNew" data-ex="' +
          esc(cex) + '">＋ Новый комплекс с этим упражнением</button>';
        openSheet('Добавить в комплекс', ch);
        break;
      }

      case 'pickAddNew': {
        var pn = profileData();
        if (!pn) break;
        var newList = { id: uid(), name: 'Мой комплекс', items: [], createdAt: new Date().toISOString() };
        pn[K.lists].push(newList);
        persist(true);
        addExerciseToList(newList.id, el.getAttribute('data-ex'));
        break;
      }

      case 'pickAdd':
        addExerciseToList(el.getAttribute('data-list'), el.getAttribute('data-ex'));
        break;


      case 'exInfo': {
        var eid = el.getAttribute('data-id');
        var exx = findExercise(eid);
        if (!exx) break;
        var body = '';
        if (exx.photo) body += '<img src="' + exx.photo + '" style="width:100%;border-radius:13px;margin-bottom:12px">';
        if (exx.video) body += SRXMedia.isRef(exx.video)
          ? '<video data-idb="' + esc(exx.video) + '" controls style="width:100%;border-radius:13px;margin-bottom:12px"></video>'
          : '<video src="' + exx.video + '" controls style="width:100%;border-radius:13px;margin-bottom:12px"></video>';
        body += '<div class="srx-kpi">' +
          '<div><span>Группа</span><b style="font-size:15px">' + esc(exx.group) + '</b></div>' +
          '<div><span>MET</span><b>' + exx.met + '</b></div></div>';
        if (exx.note) body += '<div class="srx-muted" style="margin-top:12px;line-height:1.55">' + esc(exx.note) + '</div>';
        if (exx.custom) {
          body += '<button class="srx-btn danger" style="width:100%;margin-top:14px" data-act="delExercise" data-id="' +
            esc(eid) + '">Удалить упражнение</button>';
        }
        openSheet(exx.name, body);
        SRXMedia.hydrate(document);
        break;
      }

      case 'delExercise': {
        var did = el.getAttribute('data-id');
        if (!confirm('Удалить упражнение?')) break;
        var pd = profileData();
        if (pd) {
          pd[K.ex] = pd[K.ex].filter(function (x) { return x.id !== did; });
          persist();
        }
        closeSheet();
        renderLibrary();
        break;
      }

      case 'openSession':
        go('session', { id: el.getAttribute('data-id') });
        break;

      case 'delSession': {
        var sid = el.getAttribute('data-id');
        if (!confirm('Удалить тренировку?')) break;
        var pdd = profileData();
        if (pdd) {
          pdd[K.sessions] = pdd[K.sessions].filter(function (s) { return s.id !== sid; });
          persist();
        }
        go('lists');
        break;
      }

      case 'skipPhase':
        if (T.active) { advancePhase(); paintTimer(); }
        break;

      case 'repsDone': {
        var rc = T.items[T.idx];
        if (T.active && T.phase === 'work' && hasRepsItem(rc)) {
          T.count = (T.count || 0) + 1;
          if (!hasTimerItem(rc) || T.count >= rc.reps) advancePhase();
          paintTimer();
        }
        break;
      }

      case 'abortRun':
        if (T.active) {
          if (confirm('Прервать тренировку?')) {
            T.active = false;
            stopTickOnly();
            go('lists');
          }
        } else go('lists');
        break;
    }
  }

  /* поля ввода внутри редактора списка */
  function onItemField(e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;

    var act = t.getAttribute('data-act');

    /* Числа сохраняем только при уходе из поля (change), иначе каждая цифра пишет в облако. */
    if (act === 'itemField' && e.type === 'input' && t.tagName === 'INPUT') return;

    if (act === 'itemField') {
      var lid = t.getAttribute('data-id');
      var idx = num(t.getAttribute('data-idx'));
      var field = t.getAttribute('data-field');
      var p = profileData();
      if (!p) return;
      var modeField = field === 'mode';
      p[K.lists].forEach(function (l) {
        if (l.id !== lid) return;
        if (!l.items || !l.items[idx]) return;
        if (modeField) {
          l.items[idx].mode = t.value === 'reps' || t.value === 'both' ? t.value : 'time';
        } else {
          l.items[idx][field] = Math.max(0, num(t.value));
        }
      });
      persist(true);
      if (modeField && e.type === 'change') renderListEdit(lid);
      return;
    }

    if (t.getAttribute('data-ref') === 'listName' && e.type === 'input') {
      var id = state.params.id;
      var pp = profileData();
      if (!pp) return;
      pp[K.lists].forEach(function (l) { if (l.id === id) l.name = t.value; });
      persist(true);
    }
  }
  document.addEventListener('input', onItemField);
  document.addEventListener('change', onItemField);

  /* ==========================================================================
     21. СЛИЯНИЕ ЧЕРНОВИКА
     ========================================================================== */
  function mergeDraft() {
    var p = getProfile();
    if (!p) return;
    ensureSchema(p);

    var hasData = p[K.ex].length || p[K.lists].length || p[K.sessions].length;
    if (hasData) return;

    try {
      var raw = localStorage.getItem(LS.draft);
      if (!raw) return;
      var d = JSON.parse(raw);
      var dp = d && d.profile ? d.profile : (d && d[K.ex] ? d : null);
      if (!dp) return;
      if (Array.isArray(dp[K.ex]) && dp[K.ex].length) p[K.ex] = dp[K.ex];
      if (Array.isArray(dp[K.lists]) && dp[K.lists].length) p[K.lists] = dp[K.lists];
      if (Array.isArray(dp[K.sessions]) && dp[K.sessions].length) p[K.sessions] = dp[K.sessions];
      persist(true);
    } catch (e) {}
  }

  /* ==========================================================================
     22. ИНИЦИАЛИЗАЦИЯ
     ========================================================================== */
  function init() {
    injectCSS();
    buildShell();

    var merged = false;
    var tryMerge = setInterval(function () {
      if (getProfile()) {
        if (!merged) { mergeDraft(); merged = true; }
        clearInterval(tryMerge);
      }
    }, 700);
    setTimeout(function () { clearInterval(tryMerge); }, 20000);

    if (localStorage.getItem('srx_open_trainer')) {
      localStorage.removeItem('srx_open_trainer');
      openRoot('lists');
    }

    window.addEventListener('beforeunload', function () {
      if (T.active) {
        try { localStorage.setItem('srx_interrupted', JSON.stringify({ ts: Date.now(), list: T.listName })); } catch (e) {}
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Публичный API — для отладки в консоли */
  window.SRX = {
    version: VERSION,
    open: openRoot,
    close: closeRoot,
    reload: function () { mergeDraft(); render(); },
    data: function () {
      return {
        customExercises: customExercises(),
        workoutLists: workoutLists(),
        workoutSessions: sessions()
      };
    },
    series: function (days) { return buildSeries(daysAgoYmd((days || 30) - 1), todayISO()); },
    kcalFor: kcalFor
  };

  console.log('[SRX] exercises.js v' + VERSION + ' loaded');

})();