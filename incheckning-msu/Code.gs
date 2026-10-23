/**
 * Incheckning – Moderat Skolungdom (MSU) Höstkonferens 2026
 *
 * Serverdel för Google Apps Script. Skriptet ska vara kopplat till det
 * kalkylark som innehåller deltagarlistan (Tillägg > Apps Script).
 * Se INSTRUKTION.md för publicering.
 */

// ===== Inställningar =====

// Gemensam PIN-kod för admin. Byt innan publicering, gärna 6 siffror.
const PIN = '2026';

// Namnet på fliken med deltagare. Tomt = första fliken i kalkylarket.
const FLIK = '';

// Används när filen anger ålder via födelsedatum, födelseår eller personnummer.
const EVENEMANGSDATUM = new Date(2026, 9, 24);

const TIDSZON = 'Europe/Stockholm';
const TITEL = 'MSU Höstkonferens 2026';

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

// ===== Webbapp =====

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(TITEL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

// Körs en gång från editorn för att godkänna behörigheter och förbereda fliken.
function forbered() {
  const ctx = oppna();
  sakerstallKolumner(ctx);
  const antal = ctx.varden.length - ctx.hr - 1;
  Logger.log('Klart. Hittade kolumner: ' + JSON.stringify(ctx.kol) + '. Rader: ' + antal);
}

// Manuella ändringar i kalkylarket ska också synas i appen direkt.
function onEdit() {
  hojVersion();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = FLIK ? ss.getSheetByName(FLIK) : ss.getSheets()[0];
  if (!sh) throw new Error('Hittar inte fliken "' + FLIK + '".');
  const varden = sh.getDataRange().getValues();
  const hr = hittaRubrikrad(varden);
  return { sh, varden, hr, kol: kartlagg(varden[hr] || []) };
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
      myndigText: visaVarde(ra),
      in: arJa(rad[k.incheckad]),
      tid: arJa(rad[k.incheckad]) ? tidText(rad[k.tid]) : '',
      plats: arJa(rad[k.plats])
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

function visaVarde(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TIDSZON, 'yyyy-MM-dd');
  return text(v);
}

function text(v) {
  if (v == null) return '';
  if (typeof v === 'number' && Math.floor(v) === v) return String(v);
  return String(v).trim();
}

// ===== Säkerhet, lås och version =====

function kontrolleraPin(pin) {
  if (text(pin) !== text(PIN)) throw new Error('FEL_PIN');
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
  return PropertiesService.getScriptProperties().getProperty('VERSION') || '0';
}

function hojVersion() {
  PropertiesService.getScriptProperties().setProperty('VERSION', String(Date.now()) + Math.floor(Math.random() * 1000));
}
