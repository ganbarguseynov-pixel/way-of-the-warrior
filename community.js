/* Сообщество тренировок: публикация в Supabase, поиск, лайки/дизлайки.
   Схема и политики: supabase/community-schema.sql. */
(function () {
  var BUCKET = 'workout-media';
  var TABLE = 'shared_workouts';
  var RATED = 'shared_workouts_rated';
  var VOTES = 'workout_votes';
  var REVIEWS = 'workout_reviews';

  function client() {
    return typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  }

  function ls(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  /* Ключ автора/голосующего: Telegram id, почта, либо случайный id этого устройства. */
  function myKey() {
    var key = ls('tgId') || ls('linkedEmail') || ls('currentEmail');
    if (key) return String(key);
    var anon = ls('srxAnonId');
    if (!anon) {
      anon = 'dev-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('srxAnonId', anon); } catch (e) {}
    }
    return anon;
  }

  function myName() {
    return ls('userName') || 'Атлет';
  }

  function dataUrlToBlob(dataUrl) {
    return fetch(dataUrl).then(function (r) { return r.blob(); });
  }

  function uploadBlob(path, blob) {
    var c = client();
    return c.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: false })
      .then(function (res) {
        if (res.error) throw res.error;
        return c.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      });
  }

  /* Переносит медиа упражнения из IndexedDB или data URL в Storage, возвращает публичные ссылки. */
  function uploadItemMedia(folder, index, item) {
    var out = { photo: item.photo || null, video: null };
    var jobs = [];
    if (item.photo) {
      jobs.push(dataUrlToBlob(item.photo).then(function (b) {
        return uploadBlob(folder + '/' + index + '-photo.jpg', b);
      }).then(function (url) { out.photo = url; }));
    }
    if (item.video && SRXMedia.isRef(item.video)) {
      jobs.push(SRXMedia.blob(item.video).then(function (b) {
        if (!b) throw new Error('Видео не найдено на телефоне');
        var ext = (b.type && b.type.indexOf('webm') >= 0) ? 'webm' : 'mp4';
        return uploadBlob(folder + '/' + index + '-video.' + ext, b);
      }).then(function (url) { out.video = url; }));
    } else if (item.video) {
      out.video = item.video;
    }
    return Promise.all(jobs).then(function () { return out; });
  }

  /* Публикует тренировку. items — формат trainerItems() из exercises.js. */
  function publish(title, items, rewardXpMax, onProgress) {
    var c = client();
    if (!c) return Promise.reject(new Error('Нет подключения к серверу'));
    var folder = myKey().replace(/[^a-zA-Z0-9_-]/g, '_') + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    var done = 0;
    var uploads = items.map(function (it, i) {
      return uploadItemMedia(folder, i, it).then(function (media) {
        done++;
        if (onProgress) onProgress(done, items.length);
        return {
          name: it.name, icon: it.icon, mode: it.mode, sets: it.sets, timeSec: it.timeSec,
          reps: it.reps, restSec: it.restSec, prepSec: it.prepSec,
          photo: media.photo, video: media.video
        };
      });
    });
    return Promise.all(uploads).then(function (clean) {
      return c.from(TABLE).insert({
        author_key: myKey(), author_name: myName(), title: title, items: clean,
        reward_xp_max: Math.max(1, Math.min(50, Number(rewardXpMax) || 50))
      }).select('id').single();
    }).then(function (res) {
      if (res.error) throw res.error;
      return res.data.id;
    });
  }

  /* Поиск по названию и имени автора, сортировка по рейтингу. Возвращает строки и мои голоса. */
  function search(query) {
    var c = client();
    if (!c) return Promise.reject(new Error('Нет подключения к серверу'));
    var q = String(query || '').replace(/[%_,()*]/g, ' ').trim();
    var req = c.from(RATED).select('id,title,author_key,author_name,items,score,likes,dislikes,avg_rating,review_count,reward_xp_max,created_at');
    if (q) req = req.or('title.ilike.%' + q + '%,author_name.ilike.%' + q + '%');
    return req.order('avg_rating', { ascending: false }).order('review_count', { ascending: false })
      .order('score', { ascending: false }).order('created_at', { ascending: false }).limit(50)
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        if (!rows.length) return { rows: [], mine: {} };
        var ids = rows.map(function (r) { return r.id; });
        return Promise.all([
          c.from(VOTES).select('workout_id,value').eq('voter_key', myKey()).in('workout_id', ids),
          c.from(REVIEWS).select('id,workout_id,reviewer_key,reviewer_name,stars,comment,created_at')
            .in('workout_id', ids).order('created_at', { ascending: false }).limit(200),
          c.from(REVIEWS).select('id,workout_id,reviewer_key,reviewer_name,stars,comment,created_at')
            .eq('reviewer_key', myKey()).in('workout_id', ids)
        ]).then(function (results) {
            if (results[0].error) throw results[0].error;
            if (results[1].error) throw results[1].error;
            if (results[2].error) throw results[2].error;
            var mine = {}, myReviews = {}, reviews = {};
            (results[0].data || []).forEach(function (v) { mine[v.workout_id] = v.value; });
            (results[1].data || []).forEach(function (r) {
              if (!reviews[r.workout_id]) reviews[r.workout_id] = [];
              if (reviews[r.workout_id].length < 3) reviews[r.workout_id].push(r);
            });
            (results[2].data || []).forEach(function (r) { myReviews[r.workout_id] = r; });
            return { rows: rows, mine: mine, reviews: reviews, myReviews: myReviews };
          });
      });
  }

  /* Голос: повторное нажатие той же оценки снимает голос. */
  function vote(workoutId, value, currentValue) {
    var c = client();
    if (!c) return Promise.reject(new Error('Нет подключения к серверу'));
    var key = myKey();
    if (currentValue === value) {
      return c.from(VOTES).delete().eq('workout_id', workoutId).eq('voter_key', key).then(function (r) {
        if (r.error) throw r.error;
      });
    }
    return c.from(VOTES).upsert({ workout_id: workoutId, voter_key: key, value: value }, { onConflict: 'workout_id,voter_key' })
      .then(function (r) { if (r.error) throw r.error; });
  }

  function review(workoutId, stars, comment) {
    var c = client();
    if (!c) return Promise.reject(new Error('Нет подключения к серверу'));
    var value = Math.round(Number(stars) || 0);
    if (value < 1 || value > 5) return Promise.reject(new Error('Выберите оценку от 1 до 5 звёзд'));
    var text = String(comment || '').trim().slice(0, 500);
    return c.from(REVIEWS).upsert({
      workout_id: workoutId, reviewer_key: myKey(), reviewer_name: myName(),
      stars: value, comment: text, updated_at: new Date().toISOString()
    }, { onConflict: 'workout_id,reviewer_key' }).then(function (r) {
      if (r.error) throw r.error;
    });
  }

  function fetchOne(id) {
    var c = client();
    if (!c) return Promise.reject(new Error('Нет подключения к серверу'));
    return c.from(TABLE).select('id,title,author_key,author_name,items,reward_xp_max').eq('id', id).single().then(function (res) {
      if (res.error) throw res.error;
      return res.data;
    });
  }

  window.SRXCommunity = {
    publish: publish,
    search: search,
    vote: vote,
    review: review,
    fetchOne: fetchOne
  };
})();
