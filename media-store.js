/* Видео упражнений храним в IndexedDB: в localStorage помещается ~5 МБ, а ролик на 10 с — больше.
   В данных упражнения лежит ссылка вида "idb:<ключ>", сам файл берётся отсюда. */
(function () {
  var DB_NAME = 'srx-media';
  var STORE = 'files';
  var PREFIX = 'idb:';
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
  }

  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var req = fn(t.objectStore(STORE));
        t.oncomplete = function () { resolve(req ? req.result : undefined); };
        t.onerror = t.onabort = function () { reject(t.error || new Error('IndexedDB error')); };
      });
    });
  }

  function isRef(value) {
    return typeof value === 'string' && value.indexOf(PREFIX) === 0;
  }

  function url(ref) {
    return run('readonly', function (st) { return st.get(ref.slice(PREFIX.length)); })
      .then(function (blob) { return blob ? URL.createObjectURL(blob) : null; });
  }

  /* Подставляет файлы в <video data-idb="idb:..."> после вставки в DOM. */
  function hydrate(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('video[data-idb]');
    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        url(node.getAttribute('data-idb')).then(function (src) {
          if (src) node.src = src;
          else node.parentNode && node.parentNode.removeChild(node);
        }, function () {});
      })(nodes[i]);
    }
  }

  /* Файл из IndexedDB (для публикации в облако). */
  function blob(ref) {
    return run('readonly', function (st) { return st.get(ref.slice(PREFIX.length)); });
  }

  window.SRXMedia = {
    prefix: PREFIX,
    isRef: isRef,
    put: function (key, blobValue) {
      return run('readwrite', function (st) { return st.put(blobValue, key); }).then(function () {
        return PREFIX + key;
      });
    },
    url: url,
    blob: blob,
    hydrate: hydrate
  };
})();
