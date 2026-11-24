/**
 * Incheckningsportal
 *
 * En webbapp där admin skapar evenemang (utbildningar och stämmor), checkar in
 * deltagare och för röstlängd. Varje evenemang får ett eget kalkylark i en
 * mapp på Google Drive. Det här kalkylarket håller bara listan över evenemang.
 *
 * Se docs/INSTALLATION.md för hur portalen sätts upp och publiceras.
 */

// ===== Inställningar =====

// PIN-kod för portalen. Den som har den kan skapa, ändra och öppna alla evenemang.
// Varje evenemang får dessutom en egen PIN som bara ger tillgång till just det.
const PORTAL_PIN = 'ÄNDRA';

// Visas överst i appen.
const ORGANISATION = 'Moderata Ungdomsförbundet';

// Mappen på Google Drive där evenemangens kalkylark sparas. Skapas automatiskt.
const MAPPNAMN = 'Incheckning evenemang';

const PORTAL_TIDSZON = 'Europe/Stockholm';

const EV_FLIK = 'Evenemang';
const EV_RUBRIKER = ['ID', 'Namn', 'Typ', 'Datum', 'Status', 'Kalkylark', 'Ark-ID', 'PIN (krypterad)', 'Inställningar', 'Skapad', 'Ändrad'];
const EV_TYPER = { utbildning: 'Utbildning', stamma: 'Stämma' };
const EV_FARGER = ['orange', 'bla', 'gron', 'lila'];

// ===== Webbapp =====

function doGet(e) {
  const id = e && e.parameter && e.parameter.e;
  if (!id) {
    return sida('Portal', { org: ORGANISATION, bas: basUrl() }, 'Incheckning');
  }
  const ev = hamtaEvenemang(id);
  if (!ev || ev.status === 'arkiverad') {
    return HtmlService.createHtmlOutput(
      '<body style="background:#0f0c0a;color:#f5efe9;font:16px system-ui;display:grid;place-items:center;min-height:90vh;text-align:center">' +
      '<div><h2>Evenemanget finns inte</h2><p style="color:#a99a8d">Länken är avslutad eller felaktig.</p></div></body>'
    ).setTitle('Incheckning');
  }
  const fil = ev.typ === 'stamma' ? 'Stamma' : 'Utbildning';
  return sida(fil, publikt(ev), ev.namn);
}

function sida(fil, data, titel) {
  const t = HtmlService.createTemplateFromFile(fil);
  // JSON i en <script>-tagg: "<" byts ut så att ett evenemangsnamn aldrig kan avsluta taggen.
  t.data = JSON.stringify(data).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle(titel)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

// Körs en gång från editorn: godkänner behörigheter och skapar fliken och mappen.
function installera() {
  if (PORTAL_PIN === 'ÄNDRA') throw new Error('Ändra raden const PORTAL_PIN i Portal.gs först.');
  evFlik(true);
  const m = mapp();
  Logger.log('Klart. Evenemang sparas i mappen "' + m.getName() + '": ' + m.getUrl());
}

// ===== Anrop från portalen =====

function portal_lista(pin) {
  kravPortalPin(pin);
  return {
    evenemang: allaEvenemang().map(publikt).reverse(),
    bas: basUrl(),
    mapp: mappUrl()
  };
}

function portal_forhandsgranska(pin, typ, d) {
  kravPortalPin(pin);
  return modul(typ).forhandsgranska(d);
}

// d: { namn, typ, datum, pin, farg, inst, tabeller }
function portal_skapa(pin, d) {
  kravPortalPin(pin);
  const namn = portalText(d && d.namn).slice(0, 80);
  if (!namn) throw new Error('Ge evenemanget ett namn.');
  if (!EV_TYPER[d.typ]) throw new Error('Välj typ av evenemang.');
  const evPin = portalText(d.pin);
  if (evPin.length < 4) throw new Error('PIN-koden för evenemanget måste ha minst 4 tecken.');
  return portalLas(() => {
    const ss = SpreadsheetApp.create(EV_TYPER[d.typ] + ': ' + namn);
    DriveApp.getFileById(ss.getId()).moveTo(mapp());
    const ev = {
      id: nyttId(),
      namn: namn,
      typ: d.typ,
      datum: portalText(d.datum),
      status: 'aktiv',
      url: ss.getUrl(),
      arkId: ss.getId(),
      pinHash: hashPin(evPin),
      inst: rensaInst(d.typ, d.inst, d.farg),
      skapad: nu(),
      andrad: nu()
    };
    try {
      modul(d.typ).skapaArk(ss, ev, d.tabeller || {});
    } catch (e) {
      DriveApp.getFileById(ss.getId()).setTrashed(true);
      throw e;
    }
    sparaEvenemang(ev);
    return { evenemang: publikt(ev), lista: portal_lista(pin) };
  });
}

// andring: { namn, datum, farg, pin, status, inst }
function portal_andra(pin, id, andring) {
  kravPortalPin(pin);
  return portalLas(() => {
    const ev = hamtaEvenemang(id);
    if (!ev) throw new Error('Evenemanget finns inte.');
    const a = andring || {};
    if (a.namn != null) {
      const n = portalText(a.namn).slice(0, 80);
      if (!n) throw new Error('Namnet kan inte vara tomt.');
      ev.namn = n;
    }
    if (a.datum != null) ev.datum = portalText(a.datum);
    if (a.pin) {
      if (portalText(a.pin).length < 4) throw new Error('PIN-koden måste ha minst 4 tecken.');
      ev.pinHash = hashPin(portalText(a.pin));
    }
    if (a.status === 'aktiv' || a.status === 'arkiverad') ev.status = a.status;
    if (a.inst || a.farg) ev.inst = rensaInst(ev.typ, Object.assign({}, ev.inst, a.inst || {}), a.farg || ev.inst.farg);
    ev.andrad = nu();
    sparaEvenemang(ev);
    hojVersionFor(ev.id);
    return portal_lista(pin);
  });
}

// Tar bort evenemanget och lägger kalkylarket i papperskorgen. Kräver att namnet skrivs in.
function portal_radera(pin, id, bekraftelse) {
  kravPortalPin(pin);
  return portalLas(() => {
    const ev = hamtaEvenemang(id);
    if (!ev) throw new Error('Evenemanget finns inte.');
    if (portalText(bekraftelse) !== ev.namn) throw new Error('Skriv evenemangets namn exakt för att bekräfta.');
    try { DriveApp.getFileById(ev.arkId).setTrashed(true); } catch (e) { /* redan borttaget */ }
    evFlik(true).deleteRow(ev.rad);
    const props = PropertiesService.getScriptProperties();
    Object.keys(props.getProperties()).forEach(k => { if (k.indexOf('_' + ev.id) >= 0) props.deleteProperty(k); });
    return portal_lista(pin);
  });
}

// ===== Evenemangsregistret =====

function evFlik(skapa) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(EV_FLIK);
  if (!sh && skapa) {
    sh = ss.insertSheet(EV_FLIK, 0);
    sh.getRange(1, 1, 1, EV_RUBRIKER.length).setValues([EV_RUBRIKER]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function allaEvenemang() {
  const sh = evFlik(false);
  if (!sh) return [];
  const v = sh.getDataRange().getDisplayValues();
  const ut = [];
  for (let r = 1; r < v.length; r++) {
    const x = v[r];
    if (!portalText(x[0])) continue;
    let inst = {};
    try { inst = JSON.parse(x[8] || '{}'); } catch (e) { inst = {}; }
    ut.push({
      rad: r + 1, id: portalText(x[0]), namn: portalText(x[1]), typ: portalText(x[2]), datum: portalText(x[3]),
      status: portalText(x[4]) || 'aktiv', url: portalText(x[5]), arkId: portalText(x[6]), pinHash: portalText(x[7]),
      inst: inst, skapad: portalText(x[9]), andrad: portalText(x[10])
    });
  }
  return ut;
}

function hamtaEvenemang(id) {
  return allaEvenemang().filter(ev => ev.id === portalText(id))[0] || null;
}

function sparaEvenemang(ev) {
  const sh = evFlik(true);
  const rad = [[ev.id, ev.namn, ev.typ, ev.datum, ev.status, ev.url, ev.arkId, ev.pinHash, JSON.stringify(ev.inst || {}), ev.skapad, ev.andrad]];
  const nr = ev.rad || sh.getLastRow() + 1;
  sh.getRange(nr, 1, 1, rad[0].length).setNumberFormat('@').setValues(rad);
  ev.rad = nr;
}

// Det som skickas till webbläsaren. Aldrig PIN-hash eller kalkylarkets ID.
function publikt(ev) {
  return {
    id: ev.id, namn: ev.namn, typ: ev.typ, typNamn: EV_TYPER[ev.typ] || ev.typ, datum: ev.datum,
    status: ev.status, url: ev.url, inst: ev.inst, skapad: ev.skapad, andrad: ev.andrad,
    org: ORGANISATION, bas: basUrl(), lank: basUrl() + '?e=' + encodeURIComponent(ev.id)
  };
}

function rensaInst(typ, inst, farg) {
  const i = inst || {};
  const ut = { farg: EV_FARGER.indexOf(farg) >= 0 ? farg : 'orange' };
  if (typ === 'utbildning') {
    ut.distrikt = i.distrikt !== false;
    ut.grupp = !!i.grupp;
    ut.myndig = !!i.myndig;
    ut.egna = (i.egna || []).map(portalText).filter(Boolean).slice(0, 4).map(s => s.slice(0, 30));
  } else {
    ut.fsRostratt = i.fsRostratt !== false;
    ut.dubbelroll = i.dubbelroll === 'Ombud' ? 'Ombud' : 'FS';
    ut.utdelning = i.utdelning || null;
  }
  return ut;
}

function modul(typ) {
  if (typ === 'stamma') return Stamma;
  if (typ === 'utbildning') return Utbildning;
  throw new Error('Okänd typ av evenemang.');
}

// ===== Behörighet =====

function kravPortalPin(pin) {
  if (PORTAL_PIN === 'ÄNDRA') throw new Error('Portalens PIN är inte satt. Ändra raden const PORTAL_PIN i Portal.gs.');
  if (portalText(pin) !== portalText(PORTAL_PIN)) throw new Error('FEL_PIN');
}

// Godkänner portalens PIN eller evenemangets egen PIN.
function behorig(pin, ev) {
  if (PORTAL_PIN !== 'ÄNDRA' && portalText(pin) === portalText(PORTAL_PIN)) return;
  if (ev && ev.pinHash && portalText(pin) && hashPin(portalText(pin)) === ev.pinHash) return;
  throw new Error('FEL_PIN');
}

function hashPin(pin) {
  const props = PropertiesService.getScriptProperties();
  let salt = props.getProperty('SALT');
  if (!salt) { salt = Utilities.getUuid(); props.setProperty('SALT', salt); }
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(b);
}

// Hämtar ett evenemang åt modulerna och kontrollerar PIN.
function evenemangFor(pin, id, typ) {
  const ev = hamtaEvenemang(id);
  if (!ev || ev.typ !== typ) throw new Error('Evenemanget finns inte.');
  if (ev.status === 'arkiverad') throw new Error('Evenemanget är avslutat.');
  behorig(pin, ev);
  return ev;
}

// ===== Hjälpfunktioner =====

function mapp() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('MAPP');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* mappen är borttagen, skapa ny */ }
  }
  const m = DriveApp.createFolder(MAPPNAMN);
  props.setProperty('MAPP', m.getId());
  return m;
}

function mappUrl() {
  const id = PropertiesService.getScriptProperties().getProperty('MAPP');
  return id ? 'https://drive.google.com/drive/folders/' + id : '';
}

function basUrl() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

function nyttId() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

function nu() {
  return Utilities.formatDate(new Date(), PORTAL_TIDSZON, 'yyyy-MM-dd HH:mm');
}

function hojVersionFor(id) {
  PropertiesService.getScriptProperties().setProperty('V_' + id, String(Date.now()) + Math.floor(Math.random() * 1000));
}

function portalLas(fn) {
  const las = LockService.getScriptLock();
  if (!las.tryLock(20000)) throw new Error('Systemet är upptaget, försök igen.');
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    las.releaseLock();
  }
}

function portalText(v) {
  return v == null ? '' : String(v).trim();
}
