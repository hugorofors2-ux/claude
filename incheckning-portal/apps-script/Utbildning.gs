/**
 * Utbildning: incheckning för utbildningar, konferenser och liknande.
 *
 * Varje evenemang har ett eget kalkylark med fliken Deltagare. Portalen skapar
 * arket och fyller det med listan som admin klistrar in. Allt här körs inne i
 * ett namnrum så att namnen inte krockar med stämmomodulen.
 */

const Utbildning = (function () {
  const FLIK = 'Deltagare';
  const TIDSZON = 'Europe/Stockholm';

  // Kolumner som skriptet lägger till själv om de saknas.
  const NYA_KOLUMNER = {
    id: 'ID',
    incheckad: 'Incheckad',
    tid: 'Incheckad tid',
    plats: 'Tillagd på plats'
  };

  // Rubriker som känns igen i Excel-filen (skiftläge spelar ingen roll).
  const ALIAS = {
    namn: ['namn', 'name', 'deltagare', 'deltagarnamn', 'fullständigt namn', 'för- och efternamn', 'för och efternamn'],
    fornamn: ['förnamn', 'fornamn', 'first name', 'firstname'],
    efternamn: ['efternamn', 'last name', 'lastname', 'surname'],
    distrikt: ['distrikt', 'district', 'msu-distrikt', 'muf-distrikt', 'region'],
    myndig: ['myndig', 'myndig?', 'myndighet', 'över 18', 'över 18?', '18+', 'ålder', 'age',
      'födelseår', 'födelsedatum', 'personnummer', 'född'],
    grupp: ['grupp', 'group', 'gruppnummer', 'grupptillhörighet', 'basgrupp']
  };

  // Sätts per anrop utifrån evenemangets inställningar.
  let EV = null;
  let ARK = null;
  let EVENEMANGSDATUM = new Date();
  let VISA_DISTRIKT = true;
  let VISA_GRUPP = false;
  let VISA_MYNDIG = false;
  let EGNA = [];

  function init(ev) {
    EV = ev;
    ARK = null;
    const i = ev.inst || {};
    VISA_DISTRIKT = i.distrikt !== false;
    VISA_GRUPP = !!i.grupp;
    VISA_MYNDIG = !!i.myndig;
    EGNA = i.egna || [];
    // Ålder räknas vid evenemangets datum, annars dagens datum.
    const m = String(ev.datum || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    EVENEMANGSDATUM = m ? new Date(+m[1], m[2] - 1, +m[3]) : new Date();
  }

  function ark() {
    return ARK || (ARK = SpreadsheetApp.openById(EV.arkId));
  }

  // ===== Anrop från gränssnittet =====

  function hamtaData(pin, kandVersion) {
    kontrolleraPin(pin);
    const v = version();
    if (kandVersion && kandVersion === v) return { andrad: false, version: v };
    const ctx = oppna();
    if (saknarKolumner(ctx)) return medLas(() => paket(forberett()));
    return paket(ctx);
  }

  function checkaIn(pin, id) {
    kontrolleraPin(pin);
    return medLas(() => {
      const ctx = forberett();
      const r = hittaRad(ctx, id);
      if (!arJa(ctx.varden[r][ctx.kol.incheckad])) {
        satt(ctx, r, 'incheckad', 'Ja');
        satt(ctx, r, 'tid', Utilities.formatDate(new Date(), TIDSZON, 'yyyy-MM-dd HH:mm'));
        hojVersion();
      }
      return paket(ctx);
    });
  }

  function angra(pin, id) {
    kontrolleraPin(pin);
    return medLas(() => {
      const ctx = forberett();
      const r = hittaRad(ctx, id);
      satt(ctx, r, 'incheckad', '');
      satt(ctx, r, 'tid', '');
      hojVersion();
      return paket(ctx);
    });
  }

  function laggTill(pin, d) {
    kontrolleraPin(pin);
    const namn = text(d && d.namn);
    if (!namn) throw new Error('Namn saknas.');
    return medLas(() => {
      const ctx = forberett();
      const k = ctx.kol;
      const bredd = Math.max(ctx.varden[ctx.hr].length, ctx.sh.getLastColumn());
      const rad = new Array(bredd).fill('');
      if (k.namn != null) {
        rad[k.namn] = namn;
      } else {
        const delar = namn.split(/\s+/);
        if (k.fornamn != null) rad[k.fornamn] = delar.shift();
        if (k.efternamn != null) rad[k.efternamn] = delar.join(' ');
      }
      if (k.distrikt != null) rad[k.distrikt] = text(d.distrikt);
      if (k.grupp != null) rad[k.grupp] = text(d.grupp);
      if (k.myndig != null && d.myndig != null) rad[k.myndig] = d.myndig ? 'Ja' : 'Nej';
      EGNA.forEach((namn, n) => { if (k['egen' + n] != null) rad[k['egen' + n]] = text(d.egna && d.egna[namn]); });
      rad[k.id] = 'P' + Utilities.getUuid().slice(0, 8);
      rad[k.plats] = 'Ja';
      if (d.checkaIn) {
        rad[k.incheckad] = 'Ja';
        rad[k.tid] = Utilities.formatDate(new Date(), TIDSZON, 'yyyy-MM-dd HH:mm');
      }
      ctx.sh.appendRow(rad);
      ctx.varden.push(rad);
      hojVersion();
      const svar = paket(ctx);
      svar.nyttId = rad[k.id];
      return svar;
    });
  }

  // ===== Kalkylarket =====

  function oppna() {
    const ss = ark();
    const sh = ss.getSheetByName(FLIK) || ss.getSheets()[0];
    const varden = sh.getDataRange().getValues();
    const hr = hittaRubrikrad(varden);
    const kol = kartlagg(varden[hr] || []);
    if (!VISA_GRUPP) delete kol.grupp;
    if (!VISA_DISTRIKT) delete kol.distrikt;
    if (!VISA_MYNDIG) delete kol.myndig;
    return { sh, varden, hr, kol };
  }

  function forberett() {
    const ctx = oppna();
    if (saknarKolumner(ctx)) sakerstallKolumner(ctx);
    return ctx;
  }

  // Rubrikraden är den första av de fem översta raderna som har en namnkolumn.
  function hittaRubrikrad(varden) {
    for (let r = 0; r < Math.min(5, varden.length); r++) {
      const k = kartlagg(varden[r]);
      if (k.namn != null || k.fornamn != null) return r;
    }
    return 0;
  }

  function kartlagg(rubriker) {
    const norm = rubriker.map(h => text(h).toLowerCase());
    const kol = {};
    const anvand = new Set();
    const ta = (nyckel, i) => { kol[nyckel] = i; anvand.add(i); };

    Object.keys(NYA_KOLUMNER).forEach(nyckel => {
      const i = norm.indexOf(NYA_KOLUMNER[nyckel].toLowerCase());
      if (i >= 0) ta(nyckel, i);
    });
    EGNA.forEach((namn, n) => {
      const i = norm.findIndex((h, j) => !anvand.has(j) && h === namn.toLowerCase());
      if (i >= 0) ta('egen' + n, i);
    });
    Object.keys(ALIAS).forEach(nyckel => {
      const i = norm.findIndex((h, j) => !anvand.has(j) && ALIAS[nyckel].indexOf(h) >= 0);
      if (i >= 0) ta(nyckel, i);
    });
    // Andra varvet: rubriker som innehåller ett alias, t.ex. "Distrikt (MSU)".
    ['fornamn', 'efternamn', 'distrikt', 'grupp', 'myndig', 'namn'].forEach(nyckel => {
      if (kol[nyckel] != null) return;
      const i = norm.findIndex((h, j) => !anvand.has(j) && h && ALIAS[nyckel].some(a => h.indexOf(a) >= 0));
      if (i >= 0) ta(nyckel, i);
    });
    return kol;
  }

  function saknarKolumner(ctx) {
    if (Object.keys(NYA_KOLUMNER).some(n => ctx.kol[n] == null)) return true;
    for (let r = ctx.hr + 1; r < ctx.varden.length; r++) {
      if (radNamn(ctx.varden[r], ctx.kol) && !text(ctx.varden[r][ctx.kol.id])) return true;
    }
    return false;
  }

  function sakerstallKolumner(ctx) {
    const { sh, varden, hr, kol } = ctx;
    let bredd = Math.max(varden[hr] ? varden[hr].length : 0, sh.getLastColumn());
    Object.keys(NYA_KOLUMNER).forEach(nyckel => {
      if (kol[nyckel] != null) return;
      sh.getRange(hr + 1, bredd + 1).setValue(NYA_KOLUMNER[nyckel]).setFontWeight('bold');
      varden.forEach((rad, r) => { while (rad.length <= bredd) rad.push(''); if (r === hr) rad[bredd] = NYA_KOLUMNER[nyckel]; });
      kol[nyckel] = bredd;
      bredd++;
    });
    const antal = varden.length - hr - 1;
    if (antal <= 0) return;
    let andrat = false;
    const ids = [];
    for (let r = hr + 1; r < varden.length; r++) {
      if (radNamn(varden[r], kol) && !text(varden[r][kol.id])) {
        varden[r][kol.id] = 'D' + (r + 1) + '-' + Utilities.getUuid().slice(0, 4);
        andrat = true;
      }
      ids.push([varden[r][kol.id]]);
    }
    if (andrat) {
      sh.getRange(hr + 2, kol.id + 1, antal, 1).setValues(ids);
      hojVersion();
    }
  }

  function hittaRad(ctx, id) {
    for (let r = ctx.hr + 1; r < ctx.varden.length; r++) {
      if (text(ctx.varden[r][ctx.kol.id]) === id) return r;
    }
    throw new Error('Deltagaren finns inte längre i listan. Ladda om sidan.');
  }

  function satt(ctx, r, nyckel, varde) {
    ctx.sh.getRange(r + 1, ctx.kol[nyckel] + 1).setValue(varde);
    ctx.varden[r][ctx.kol[nyckel]] = varde;
  }

  function paket(ctx) {
    const k = ctx.kol;
    const deltagare = [];
    for (let r = ctx.hr + 1; r < ctx.varden.length; r++) {
      const rad = ctx.varden[r];
      const namn = radNamn(rad, k);
      if (!namn || !text(rad[k.id])) continue;
      const ra = k.myndig != null ? rad[k.myndig] : '';
      deltagare.push({
        id: text(rad[k.id]),
        namn: namn,
        distrikt: k.distrikt != null ? text(rad[k.distrikt]) : '',
        grupp: k.grupp != null ? text(rad[k.grupp]) : '',
        myndig: tolkaMyndig(ra),
        myndigText: alderText(ra),
        in: arJa(rad[k.incheckad]),
        tid: arJa(rad[k.incheckad]) ? tidText(rad[k.tid]) : '',
        plats: arJa(rad[k.plats]),
        egna: EGNA.map((namn, n) => k['egen' + n] != null ? text(rad[k['egen' + n]]) : '')
      });
    }
    return {
      andrad: true,
      version: version(),
      deltagare: deltagare,
      kolumner: { distrikt: k.distrikt != null, grupp: k.grupp != null, myndig: k.myndig != null }
    };
  }

  function radNamn(rad, k) {
    if (k.namn != null && text(rad[k.namn])) return text(rad[k.namn]);
    return [k.fornamn, k.efternamn]
      .filter(i => i != null)
      .map(i => text(rad[i]))
      .filter(Boolean)
      .join(' ');
  }

  // ===== Tolkning av värden =====

  // true = myndig, false = omyndig, null = okänt.
  function tolkaMyndig(v) {
    if (v === '' || v == null) return null;
    if (typeof v === 'boolean') return v;
    if (v instanceof Date) return alderVid(v) >= 18;
    if (typeof v === 'number') return tolkaTal(v);

    const s = String(v).trim().toLowerCase();
    if (!s) return null;
    if (/^(nej|no|n|falskt|false|omyndig|under 18|<\s*18|-)$/.test(s) || s.indexOf('omyndig') >= 0) return false;
    if (/^(ja|yes|j|y|x|sant|true|myndig|över 18|18\+|>=\s*18|✓|✔)$/.test(s)) return true;

    const pnr = s.replace(/[\s+-]/g, '');
    if (/^\d{10}$|^\d{12}$/.test(pnr)) return personnummerMyndig(pnr);
    const datum = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (datum) return alderVid(new Date(+datum[1], datum[2] - 1, +datum[3])) >= 18;
    if (/^\d+([.,]\d+)?$/.test(s)) return tolkaTal(parseFloat(s.replace(',', '.')));
    return null;
  }

  function tolkaTal(n) {
    if (n === 1) return true;
    if (n === 0) return false;
    if (n >= 1900 && n <= 2030) return EVENEMANGSDATUM.getFullYear() - n >= 18;
    if (n > 1 && n < 120) return n >= 18;
    return null;
  }

  function personnummerMyndig(p) {
    let ar, man, dag;
    if (p.length === 12) {
      ar = +p.slice(0, 4); man = +p.slice(4, 6); dag = +p.slice(6, 8);
    } else {
      const kort = +p.slice(0, 2);
      const sekel = kort > EVENEMANGSDATUM.getFullYear() % 100 ? 1900 : 2000;
      ar = sekel + kort; man = +p.slice(2, 4); dag = +p.slice(4, 6);
    }
    if (dag > 60) dag -= 60; // samordningsnummer
    return alderVid(new Date(ar, man - 1, dag)) >= 18;
  }

  function alderVid(fodd) {
    const e = EVENEMANGSDATUM;
    let alder = e.getFullYear() - fodd.getFullYear();
    if (e.getMonth() < fodd.getMonth() || (e.getMonth() === fodd.getMonth() && e.getDate() < fodd.getDate())) alder--;
    return alder;
  }

  function arJa(v) {
    if (v === true) return true;
    if (v === 1) return true;
    const s = text(v).toLowerCase();
    return ['ja', 'x', 'yes', 'true', 'sant', '1', '✓', '✔'].indexOf(s) >= 0;
  }

  function tidText(v) {
    if (v instanceof Date) return Utilities.formatDate(v, TIDSZON, 'HH:mm');
    const m = text(v).match(/(\d{1,2}:\d{2})/);
    return m ? m[1] : text(v);
  }

  // Skickar bara ut en ren ålder till gränssnittet, aldrig personnummer eller födelsedatum.
  function alderText(v) {
    const s = text(v);
    return /^\d{1,2}$/.test(s) ? s + ' år' : '';
  }

  function text(v) {
    if (v == null) return '';
    if (typeof v === 'number' && Math.floor(v) === v) return String(v);
    return String(v).trim();
  }

  // ===== Säkerhet, lås och version =====

  function kontrolleraPin(pin) {
    behorig(pin, EV);
  }

  function medLas(fn) {
    const las = LockService.getScriptLock();
    if (!las.tryLock(15000)) throw new Error('Systemet är upptaget, försök igen.');
    try {
      return fn();
    } finally {
      SpreadsheetApp.flush();
      las.releaseLock();
    }
  }

  function version() {
    return PropertiesService.getScriptProperties().getProperty('V_' + EV.id) || '0';
  }

  function hojVersion() {
    hojVersionFor(EV.id);
  }

  // ===== Nytt evenemang =====

  // Gör om en inklistrad tabell till evenemangets kolumner. Personnummer och
  // andra uppgifter som inte behövs sparas aldrig, bara Ja/Nej för myndig.
  function normalisera(v) {
    const rader = (v || []).filter(r => r && r.some(c => text(c)));
    if (!rader.length) return { rubriker: [], rader: [], saknas: [], hittade: [], dubbletter: 0 };
    const hr = hittaRubrikrad(rader);
    const kol = kartlagg(rader[hr]);
    if (kol.namn == null && kol.fornamn == null) {
      throw new Error('Hittar ingen kolumn med namn. Första raden ska vara rubriker, t.ex. Namn, eller Förnamn och Efternamn.');
    }
    const rubriker = ['Namn'].concat(VISA_DISTRIKT ? ['Distrikt'] : [], VISA_GRUPP ? ['Grupp'] : [], VISA_MYNDIG ? ['Myndig'] : [], EGNA);
    const ut = [], sett = {};
    let dubbletter = 0;
    for (let r = hr + 1; r < rader.length; r++) {
      const x = rader[r];
      const namn = radNamn(x, kol).replace(/\s+/g, ' ');
      if (!namn) continue;
      const rad = [namn];
      if (VISA_DISTRIKT) rad.push(kol.distrikt != null ? text(x[kol.distrikt]) : '');
      if (VISA_GRUPP) rad.push(kol.grupp != null ? text(x[kol.grupp]) : '');
      if (VISA_MYNDIG) {
        const m = kol.myndig != null ? tolkaMyndig(x[kol.myndig]) : null;
        rad.push(m === true ? 'Ja' : m === false ? 'Nej' : '');
      }
      EGNA.forEach((n, i) => rad.push(kol['egen' + i] != null ? text(x[kol['egen' + i]]) : ''));
      // Samma namn i samma distrikt räknas som en dubblett och slås ihop.
      const k = rad.slice(0, VISA_DISTRIKT ? 2 : 1).join('|').toLowerCase();
      if (sett[k]) { dubbletter++; continue; }
      sett[k] = true;
      ut.push(rad);
    }
    const saknas = [];
    if (VISA_DISTRIKT && kol.distrikt == null) saknas.push('Distrikt');
    if (VISA_GRUPP && kol.grupp == null) saknas.push('Grupp');
    if (VISA_MYNDIG && kol.myndig == null) saknas.push('Myndig');
    EGNA.forEach((n, i) => { if (kol['egen' + i] == null) saknas.push(n); });
    return { rubriker: rubriker, rader: ut, saknas: saknas, hittade: rader[hr].map(text).filter(Boolean), dubbletter: dubbletter };
  }

  function forhandsgranska(d) {
    init({ id: 'forhandsgranskning', inst: d.inst || {}, datum: d.datum });
    const n = normalisera(d.tabeller && d.tabeller.deltagare);
    const unika = i => Object.keys(n.rader.reduce((m, r) => { if (r[i]) m[r[i]] = 1; return m; }, {})).length;
    const iD = n.rubriker.indexOf('Distrikt'), iG = n.rubriker.indexOf('Grupp'), iM = n.rubriker.indexOf('Myndig');
    return {
      antal: n.rader.length,
      dubbletter: n.dubbletter,
      distrikt: iD >= 0 ? unika(iD) : null,
      grupper: iG >= 0 ? unika(iG) : null,
      omyndiga: iM >= 0 ? n.rader.filter(r => r[iM] === 'Nej').length : null,
      okandAlder: iM >= 0 ? n.rader.filter(r => !r[iM]).length : null,
      saknas: n.saknas,
      hittade: n.hittade,
      rubriker: n.rubriker,
      exempel: n.rader.slice(0, 5)
    };
  }

  function skapaArk(ss, ev, tabeller) {
    init(ev);
    ARK = ss;
    const n = normalisera(tabeller.deltagare);
    const sh = ss.getSheets()[0];
    sh.setName(FLIK);
    const rubriker = n.rubriker.length ? n.rubriker : ['Namn'].concat(VISA_DISTRIKT ? ['Distrikt'] : [], VISA_GRUPP ? ['Grupp'] : [], VISA_MYNDIG ? ['Myndig'] : [], EGNA);
    const ut = [rubriker].concat(n.rader);
    sh.getRange(1, 1, ut.length, rubriker.length).setNumberFormat('@').setValues(ut);
    sh.getRange(1, 1, 1, rubriker.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    sakerstallKolumner(oppna());
    hojVersion();
  }

  const API = { hamtaData: hamtaData, checkaIn: checkaIn, angra: angra, laggTill: laggTill };

  function kor(pin, id, fn, args) {
    init(evenemangFor(pin, id, 'utbildning'));
    return API[fn].apply(null, [pin].concat(args || []));
  }

  return { kor: kor, forhandsgranska: forhandsgranska, skapaArk: skapaArk };
})();

// Anrop från webbläsaren. Första argumenten är alltid PIN och evenemangets ID.
function utb_hamtaData(pin, ev, kandVersion) { return Utbildning.kor(pin, ev, 'hamtaData', [kandVersion]); }
function utb_checkaIn(pin, ev, id) { return Utbildning.kor(pin, ev, 'checkaIn', [id]); }
function utb_angra(pin, ev, id) { return Utbildning.kor(pin, ev, 'angra', [id]); }
function utb_laggTill(pin, ev, d) { return Utbildning.kor(pin, ev, 'laggTill', [d]); }
