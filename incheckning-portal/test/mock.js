// Simulerad Google Apps Script-miljö för tester i webbläsaren.
// Kalkylark, Drive-filer och egenskaper sparas i localStorage så att de
// överlever när testet byter mellan portalen och ett evenemang.
(function () {
  var NYCKEL = '__mockdb';
  var db;
  try { db = JSON.parse(localStorage.getItem(NYCKEL) || 'null'); } catch (e) { db = null; }
  if (!db) db = { ark: { PORTAL: { namn: 'Portal', flikar: [{ namn: 'Blad1', rader: [] }] } }, props: {}, raknare: 1, papperskorg: [] };
  function spara() { localStorage.setItem(NYCKEL, JSON.stringify(db)); }
  window.__mockdb = db;
  window.__nollstall = function () { localStorage.removeItem(NYCKEL); };

  function bredd(rader) { return rader.reduce(function (m, r) { return Math.max(m, r.length); }, 0); }
  function sakra(rader, r, c) {
    while (rader.length < r) rader.push([]);
    var w = Math.max(c, bredd(rader));
    rader.forEach(function (rad) { while (rad.length < w) rad.push(''); });
  }

  function blad(arkId, flik) {
    var api = {
      getName: function () { return flik.namn; },
      setName: function (n) { flik.namn = n; return api; },
      getDataRange: function () {
        var lasa = function () {
          var w = Math.max(1, bredd(flik.rader));
          return (flik.rader.length ? flik.rader : [[]]).map(function (r) {
            var a = r.map(function (v) { return v == null ? '' : v; });
            while (a.length < w) a.push('');
            return a;
          });
        };
        return { getValues: lasa, getDisplayValues: function () { return lasa().map(function (r) { return r.map(String); }); } };
      },
      getLastRow: function () { return flik.rader.length; },
      getLastColumn: function () { return bredd(flik.rader); },
      getRange: function (r, c, nr, nc) {
        var omr = {
          setValues: function (vs) {
            vs.forEach(function (rad, i) {
              rad.forEach(function (v, j) { sakra(flik.rader, r + i, c + j); flik.rader[r - 1 + i][c - 1 + j] = v; });
            });
            return omr;
          },
          setValue: function (v) { return omr.setValues([[v]]); },
          setFontWeight: function () { return omr; },
          setNumberFormat: function () { return omr; }
        };
        return omr;
      },
      appendRow: function (rad) { flik.rader.push(rad.slice()); return api; },
      deleteRow: function (n) { flik.rader.splice(n - 1, 1); return api; },
      setFrozenRows: function () {},
      autoResizeColumns: function () {}
    };
    return api;
  }

  function kalkylark(id) {
    var a = db.ark[id];
    if (!a) throw new Error('Kalkylarket finns inte: ' + id);
    return {
      getId: function () { return id; },
      getUrl: function () { return 'https://docs.google.com/spreadsheets/d/' + id + '/edit'; },
      getSheets: function () { return a.flikar.map(function (f) { return blad(id, f); }); },
      getSheetByName: function (n) { var f = a.flikar.filter(function (x) { return x.namn === n; })[0]; return f ? blad(id, f) : null; },
      insertSheet: function (n, index) {
        if (a.flikar.some(function (x) { return x.namn === n; })) throw new Error('Fliken finns redan: ' + n);
        var f = { namn: n, rader: [] };
        if (index != null) a.flikar.splice(index, 0, f); else a.flikar.push(f);
        return blad(id, f);
      }
    };
  }

  window.SpreadsheetApp = {
    getActiveSpreadsheet: function () { return kalkylark('PORTAL'); },
    openById: function (id) { return kalkylark(id); },
    create: function (namn) {
      var id = 'ARK' + (db.raknare++);
      db.ark[id] = { namn: namn, flikar: [{ namn: 'Blad1', rader: [] }] };
      return kalkylark(id);
    },
    flush: function () { spara(); }
  };
  window.DriveApp = {
    getFileById: function (id) {
      return {
        moveTo: function () {},
        setTrashed: function () { db.papperskorg.push(id); delete db.ark[id]; }
      };
    },
    createFolder: function (n) { return { getId: function () { return 'MAPP1'; }, getName: function () { return n; }, getUrl: function () { return 'https://drive.google.com/drive/folders/MAPP1'; } }; },
    getFolderById: function (id) { return { getId: function () { return id; }, getName: function () { return 'Incheckning evenemang'; }, getUrl: function () { return ''; } }; }
  };
  window.ScriptApp = { getService: function () { return { getUrl: function () { return 'https://script.google.com/macros/s/TEST/exec'; } }; } };
  window.PropertiesService = {
    getScriptProperties: function () {
      return {
        getProperty: function (k) { return db.props[k] == null ? null : db.props[k]; },
        setProperty: function (k, v) { if (String(v).length > 9000) throw new Error('För stort värde: ' + k); db.props[k] = String(v); },
        deleteProperty: function (k) { delete db.props[k]; },
        getProperties: function () { return Object.assign({}, db.props); }
      };
    }
  };
  window.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
  window.Utilities = {
    getUuid: function () { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function () { return (Math.random() * 16 | 0).toString(16); }); },
    formatDate: function (d, tz, f) {
      var p = function (x) { return String(x).padStart(2, '0'); };
      return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes()));
    },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    // Ingen riktig kryptering i testet, bara en stabil omvandling.
    computeDigest: function (alg, s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return [h]; },
    base64Encode: function (b) { return 'h' + b.join(','); }
  };
  window.Logger = { log: function (m) { console.log(m); } };
  window.HtmlService = {};

  window.__anrop = [];
  function runner(ok, fel) {
    return new Proxy({}, {
      get: function (_, namn) {
        if (namn === 'withSuccessHandler') return function (h) { return runner(h, fel); };
        if (namn === 'withFailureHandler') return function (h) { return runner(ok, h); };
        return function () {
          var args = Array.prototype.slice.call(arguments);
          window.__anrop.push(namn);
          setTimeout(function () {
            try {
              if (typeof window[namn] !== 'function') throw new Error('Okänd serverfunktion: ' + namn);
              var r = JSON.parse(JSON.stringify(window[namn].apply(null, args)));
              spara();
              if (ok) ok(r);
            } catch (e) {
              spara();
              console.log('SERVERFEL ' + namn + ': ' + e.message);
              if (fel) fel(e);
            }
          }, 60);
        };
      }
    });
  }
  window.google = {
    script: {
      run: runner(null, null),
      url: {
        getLocation: function (cb) {
          var p = {};
          new URLSearchParams(location.search).forEach(function (v, k) { p[k] = v; });
          cb({ parameter: p });
        }
      }
    }
  };
})();
